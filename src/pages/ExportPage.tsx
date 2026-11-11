import { useEffect, useMemo, useRef, useState } from 'react'
import { allKnowledgeTags, queryMistakes, type MistakeFilter } from '../lib/repo'
import { buildExportCards } from '../lib/export/buildCards'
import { composePdf, pageCount } from '../lib/export/renderPdf'
import type { AnswerSpace, ExportCard, ExportOptions } from '../lib/export/layout'
import { SUBJECTS } from '../lib/tags'
import { downloadBlob, isIOS, isWeChat, todayStr } from '../lib/utils'
import { navigate, useAsync, useDataVersion, useRoute } from '../hooks'
import { PrintSheets } from '../components/PrintSheets'
import { Empty, Loading, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

async function waitForImages(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  )
}

export function ExportPage() {
  const version = useDataVersion()
  const route = useRoute()
  const toast = useToast()

  const [subject, setSubject] = useState<MistakeFilter['subject']>(
    (route.query.get('subject') as MistakeFilter['subject']) ?? 'all',
  )
  const [year, setYear] = useState<number | 'all'>(route.query.get('year') ? Number(route.query.get('year')) : 'all')
  const [tag, setTag] = useState<string | null>(route.query.get('tag'))
  const [mastery, setMastery] = useState<MistakeFilter['mastery']>(
    (route.query.get('mastery') as MistakeFilter['mastery']) ?? 'all',
  )

  const [answerSpace, setAnswerSpace] = useState<AnswerSpace>('auto')
  const [includeAnswer, setIncludeAnswer] = useState(true)
  const [includeNote, setIncludeNote] = useState(true)
  const [showMeta, setShowMeta] = useState(true)

  const [cards, setCards] = useState<ExportCard[] | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [wechatTip, setWechatTip] = useState(false)
  const [zoom, setZoom] = useState(0.92)
  const printRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const calc = () => {
      // 210mm ≈ 794px @96dpi
      const usable = Math.min(window.innerWidth, 1500) - 44
      setZoom(Math.max(0.3, Math.min(1, usable / 794)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const rows = useAsync(
    () => queryMistakes({ subject, year, tag, mastery, sort: 'year' }),
    [version, subject, year, tag, mastery],
  )
  const tags = useAsync(() => allKnowledgeTags(), [version])

  const years = useMemo(() => {
    const set = new Set((rows.data ?? []).map((r) => r.mistake.year))
    return [...set].sort((a, b) => b - a)
  }, [rows.data])

  const opts: ExportOptions = { answerSpace, includeAnswer, includeNote, showMeta }
  const count = rows.data?.length ?? 0
  const pages = cards ? pageCount(cards, opts) : 0

  useEffect(() => {
    setCards(null)
  }, [subject, year, tag, mastery, answerSpace, includeAnswer, includeNote, showMeta])

  async function ensureCards(): Promise<ExportCard[]> {
    if (cards?.length) return cards
    if (!rows.data?.length) throw new Error('没有可导出的题目')
    setBusy('准备题目图片…')
    const built = await buildExportCards(rows.data)
    if (!built.length) throw new Error('这些题目的图片缺失，无法导出')
    setCards(built)
    setBusy('')
    return built
  }

  async function openPreview() {
    try {
      await ensureCards()
      setPreviewOpen(true)
    } catch (e) {
      toast(e instanceof Error ? e.message : '预览失败', 'error')
      setBusy('')
    }
  }

  async function doPrint() {
    try {
      await ensureCards()
      setPreviewOpen(true)
      // 等预览 DOM 渲染完成 + 图片解码
      await new Promise((r) => setTimeout(r, 260))
      if (printRootRef.current) await waitForImages(printRootRef.current)
      await document.fonts?.ready
      window.print()
    } catch (e) {
      toast(e instanceof Error ? e.message : '打印失败', 'error')
      setBusy('')
    }
  }

  async function doDownload() {
    try {
      const list = await ensureCards()
      if (isWeChat()) {
        setWechatTip(true)
        return
      }
      setBusy('正在生成 PDF…')
      setProgress({ done: 0, total: 1 })
      const blob = await composePdf(list, {
        ...opts,
        dpi: 200,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const name = `错题集_${subject === 'all' ? '全部' : SUBJECTS.find((s) => s.id === subject)?.short}_${todayStr()}.pdf`
      const file = new File([blob], name, { type: 'application/pdf' })
      if (isIOS() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name })
      } else {
        downloadBlob(blob, name)
      }
      toast('PDF 已生成', 'ok')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      toast(e instanceof Error ? e.message : '导出失败', 'error')
    } finally {
      setBusy('')
      setProgress({ done: 0, total: 0 })
    }
  }

  if (rows.loading) return <Loading />

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-icon" onClick={() => navigate('/mistakes')} aria-label="返回">
              <Icon name="left" size={17} />
            </button>
            <h1>导出错题</h1>
          </div>
          <div className="page-sub">A4 排版，留出作答区，可以直接打印或存成 PDF</div>
        </div>
      </div>

      {count === 0 ? (
        <Empty
          icon="download"
          title="没有符合条件的错题"
          desc="换个筛选条件，或者先去标记几道错题。"
          action={
            <button className="btn" onClick={() => navigate('/mistakes')}>
              返回错题本
            </button>
          }
        />
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <h2>导出范围</h2>
              <span className="badge badge-brand">{count} 道题</span>
            </div>
            <div className="card-pad">
              <div className="filter-bar" style={{ border: 'none', padding: 0, marginBottom: 0 }}>
                <select className="select" value={String(subject)} onChange={(e) => setSubject(e.target.value as MistakeFilter['subject'])}>
                  <option value="all">全部科目</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={String(year)}
                  onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                >
                  <option value="all">全部年份</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select className="select" value={String(mastery)} onChange={(e) => setMastery(e.target.value as MistakeFilter['mastery'])}>
                  <option value="all">全部掌握度</option>
                  <option value="0">未掌握</option>
                  <option value="1">复习中</option>
                  <option value="2">已掌握</option>
                </select>
                <select className="select" value={tag ?? ''} onChange={(e) => setTag(e.target.value || null)}>
                  <option value="">全部知识点</option>
                  {(tags.data ?? []).map((t) => (
                    <option key={t.tag} value={t.tag}>
                      {t.tag}（{t.count}）
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>排版设置</h2>
            </div>
            <div className="card-pad stack" style={{ gap: 16 }}>
              <div className="field">
                <div className="field-label">每题留白（写答案的地方）</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {(
                    [
                      ['auto', '按题型自动'],
                      ['none', '不留白'],
                      ['small', '少一点'],
                      ['medium', '适中'],
                      ['large', '很多'],
                    ] as [AnswerSpace, string][]
                  ).map(([id, label]) => (
                    <button key={id} className={`chip${answerSpace === id ? ' is-on' : ''}`} onClick={() => setAnswerSpace(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="tiny muted">自动：选择 0 · 填空 22mm · 解答 82mm</div>
              </div>

              <div className="field">
                <div className="field-label">附带内容</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <button className={`chip${includeAnswer ? ' is-on' : ''}`} onClick={() => setIncludeAnswer(!includeAnswer)}>
                    <Icon name="check" size={12} /> 答案与解析页
                  </button>
                  <button className={`chip${includeNote ? ' is-on' : ''}`} onClick={() => setIncludeNote(!includeNote)}>
                    <Icon name="check" size={12} /> 我的笔记
                  </button>
                  <button className={`chip${showMeta ? ' is-on' : ''}`} onClick={() => setShowMeta(!showMeta)}>
                    <Icon name="check" size={12} /> 知识点标注
                  </button>
                </div>
              </div>

              {cards ? (
                <div className="small muted">
                  预计 {pages} 页 A4
                </div>
              ) : null}
            </div>
          </div>

          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={() => void openPreview()} disabled={!!busy}>
              <Icon name="image" size={15} /> 预览排版
            </button>
            <button className="btn" onClick={() => void doPrint()} disabled={!!busy}>
              <Icon name="print" size={15} /> 打印 / 另存为 PDF
            </button>
            <button className="btn btn-primary" onClick={() => void doDownload()} disabled={!!busy}>
              <Icon name="download" size={15} /> 下载 PDF
            </button>
          </div>

          {busy ? (
            <div className="card card-pad">
              <div className="row small">
                <div className="spinner" /> {busy}
                {progress.total > 1 ? (
                  <span className="mono tiny muted">
                    {progress.done}/{progress.total}
                  </span>
                ) : null}
              </div>
              {progress.total > 0 ? (
                <div className="progress" style={{ marginTop: 10 }}>
                  <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {previewOpen && cards ? (
        <div className="print-root is-preview" ref={printRootRef}>
          <div
            className="print-hint"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              paddingBottom: 14,
            }}
          >
            <button className="btn btn-sm" onClick={() => setPreviewOpen(false)}>
              <Icon name="close" size={13} /> 关闭预览
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => window.print()}>
              <Icon name="print" size={13} /> 打印
            </button>
          </div>
          <div className="print-zoom" style={{ ['--zoom' as string]: String(zoom) }}>
            <PrintSheets cards={cards} opts={opts} />
          </div>
        </div>
      ) : null}

      <Sheet open={wechatTip} title="微信内无法直接下载" onClose={() => setWechatTip(false)}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="small" style={{ lineHeight: 1.8 }}>
            微信内置浏览器会拦截文件下载。请点右上角「···」→「在浏览器打开」，再回来点下载。
          </div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href)
                toast('链接已复制', 'ok')
              } catch {
                toast('复制失败，请手动复制地址栏', 'error')
              }
            }}
          >
            复制当前链接
          </button>
        </div>
      </Sheet>
    </div>
  )
}
