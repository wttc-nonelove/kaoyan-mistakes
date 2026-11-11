import { useMemo, useRef, useState } from 'react'
import type { Paper, Subject } from '../types'
import { createPaper, deletePaper, listAllQuestions, listPapers } from '../lib/repo'
import { openPdf } from '../lib/pdf/loader'
import { putBlob } from '../lib/blobStore'
import { navigate, useAsync, useDataVersion } from '../hooks'
import { SUBJECTS, SUBJECT_LABEL } from '../lib/tags'
import { bytesToText, uid } from '../lib/utils'
import { ConfirmSheet, Empty, Loading, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

const MAX_BYTES = 120 * 1024 * 1024

export function PapersPage() {
  const version = useDataVersion()
  const toast = useToast()
  const papers = useAsync(() => listPapers(), [version])
  const questions = useAsync(() => listAllQuestions(), [version])

  const [uploadOpen, setUploadOpen] = useState(false)
  const [subject, setSubject] = useState<Subject>('math2')
  const [year, setYear] = useState<number>(2024)
  const [busy, setBusy] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Paper | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const q of questions.data ?? []) map.set(q.paperId, (map.get(q.paperId) ?? 0) + 1)
    return map
  }, [questions.data])

  const grouped = useMemo(() => {
    const list = papers.data ?? []
    return SUBJECTS.map((s) => ({
      ...s,
      items: list.filter((p) => p.subject === s.id).sort((a, b) => b.year - a.year),
    }))
  }, [papers.data])

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast('只支持 PDF 文件', 'error')
      return
    }
    if (file.size > MAX_BYTES) {
      toast(`文件 ${bytesToText(file.size)} 太大，建议先压缩到 120MB 以内`, 'error')
      return
    }
    try {
      setBusy('正在解析 PDF…')
      const buf = await file.arrayBuffer()
      const doc = await openPdf(buf)
      const pageCount = doc.numPages
      setBusy(`共 ${pageCount} 页，正在保存原卷…`)
      const key = `src/${uid()}.pdf`
      await putBlob(key, file)
      setBusy('正在建立试卷…')
      const paper = await createPaper({
        subject,
        year,
        pageCount,
        sourcePath: key,
        sourceBytes: file.size,
      })
      doc.destroy()
      setUploadOpen(false)
      toast('试卷已建立，开始切题', 'ok')
      navigate(`/papers/${paper.id}/cut`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '上传失败', 'error')
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const years = Array.from({ length: 22 }, (_, i) => 2025 - i)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>试卷库</h1>
          <div className="page-sub">每套卷只需切一次题，之后标记错题就是点「年份 + 题号」</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/import')}>
            <Icon name="layers" size={15} /> 批量导入
          </button>
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            <Icon name="upload" size={15} /> 上传单份
          </button>
        </div>
      </div>

      {papers.loading ? (
        <Loading />
      ) : (papers.data ?? []).length === 0 ? (
        <Empty
          icon="layers"
          title="试卷库还是空的"
          desc="上传扫描版真题 PDF，系统会自动把每一页切成一道道题，你只需微调分割线并确认题号。"
          action={
            <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
              上传第一套真题
            </button>
          }
        />
      ) : (
        grouped.map((g) =>
          g.items.length ? (
            <div key={g.id}>
              <div className="section-title">
                {g.label} <span className="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>· {g.items.length} 套</span>
              </div>
              <div className="paper-grid">
                {g.items.map((p) => {
                  const n = counts.get(p.id) ?? 0
                  return (
                    <div key={p.id} className="paper-card">
                      <button style={{ textAlign: 'left' }} onClick={() => navigate(`/papers/${p.id}`)}>
                        <div className="row-between">
                          <span className="paper-year">{p.year}</span>
                          {p.status === 'ready' ? (
                            <span className="badge badge-brand">{n} 题</span>
                          ) : (
                            <span className="badge badge-warn">待切题</span>
                          )}
                        </div>
                        <div className="paper-meta" style={{ marginTop: 6 }}>
                          {SUBJECT_LABEL[p.subject]} · {p.variant} · {p.pageCount} 页
                          {p.sourceBytes ? ` · ${bytesToText(p.sourceBytes)}` : ''}
                        </div>
                      </button>
                      <div className="row-between" style={{ marginTop: 4 }}>
                        <div className="row" style={{ gap: 6 }}>
                          {p.status === 'cutting' ? (
                            <button className="btn btn-sm btn-primary" onClick={() => navigate(`/papers/${p.id}/cut`)}>
                              <Icon name="scissors" size={13} /> 继续切题
                            </button>
                          ) : (
                            <button className="btn btn-sm" onClick={() => navigate(`/papers/${p.id}`)}>
                              看题目
                            </button>
                          )}
                        </div>
                        <button
                          className="btn-icon"
                          title="删除试卷"
                          onClick={() => setConfirmDelete(p)}
                          style={{ color: 'var(--ink-3)' }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null,
        )
      )}

      <Sheet
        open={uploadOpen}
        title="上传真题"
        onClose={() => !busy && setUploadOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setUploadOpen(false)} disabled={!!busy}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy ? busy : '选择 PDF 文件'}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <div className="field-label">科目</div>
            <div className="row" style={{ gap: 8 }}>
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  className={`chip${subject === s.id ? ' is-on' : ''}`}
                  style={{ height: 34, padding: '0 14px' }}
                  onClick={() => setSubject(s.id)}
                  disabled={!!busy}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">年份</div>
            <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={!!busy}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
          </div>

          <div className="card card-pad" style={{ background: 'var(--surface-2)', fontSize: 12.5, lineHeight: 1.75 }}>
            <b>几个建议</b>
            <br />· 扫描件请保证页面正向、不太歪（倾斜 &lt; 1°），自动切题会准很多
            <br />· 单文件建议 &lt; 60MB；超过 120MB 请先压缩
            <br />· 双页扫描（一张纸两页内容）暂不支持自动拆分，请先裁成单页
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          {busy ? (
            <div className="row small muted">
              <div className="spinner" /> {busy}
            </div>
          ) : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!confirmDelete}
        title="删除这套试卷？"
        danger
        okText="删除"
        desc={
          <>
            将会删除 <b>{confirmDelete?.year} {confirmDelete ? SUBJECT_LABEL[confirmDelete.subject] : ''}</b> 及其
            {confirmDelete ? counts.get(confirmDelete.id) ?? 0 : 0} 道题、相关错题与复习记录，且无法恢复。
          </>
        }
        onClose={() => setConfirmDelete(null)}
        onOk={async () => {
          if (!confirmDelete) return
          await deletePaper(confirmDelete.id)
          setConfirmDelete(null)
          toast('已删除', 'ok')
        }}
      />
    </div>
  )
}
