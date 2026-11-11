import { useCallback, useEffect, useRef, useState } from 'react'
import type { Subject } from '../types'
import { deletePaper, findPaper } from '../lib/repo'
import { isDemoMode } from '../lib/cloud'
import {
  EXPECTED_COUNT,
  detectSubject,
  detectYear,
  importPaper,
  type ImportProgress,
} from '../lib/importPaper'
import { SUBJECTS, SUBJECT_LABEL } from '../lib/tags'
import { navigate } from '../hooks'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

type Status = 'pending' | 'running' | 'done' | 'error' | 'skipped'

const METHOD_LABEL: Record<string, string> = { ocr: '按OCR题号', text: '按文字层', image: '按图像' }

interface Job {
  key: string
  name: string
  size: number
  file?: File
  remote?: string
  subject: Subject | null
  year: number | null
  status: Status
  message?: string
  count?: number
}

interface SeedItem {
  file: string
  subject: Subject
  year: number
  name: string
}

export function ImportPage() {
  const toast = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [seed, setSeed] = useState<SeedItem[] | null>(null)
  const [running, setRunning] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [overall, setOverall] = useState({ done: 0, total: 0 })
  const [current, setCurrent] = useState<ImportProgress | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    fetch('seed/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length) setSeed(data as SeedItem[])
      })
      .catch(() => {})
  }, [])

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = [...files].filter((f) => f.name.toLowerCase().endsWith('.pdf'))
      if (!incoming.length) {
        toast('只支持 PDF 文件', 'error')
        return
      }
      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.name + j.size))
        const next = [...prev]
        for (const f of incoming) {
          if (seen.has(f.name + f.size)) continue
          next.push({
            key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            size: f.size,
            file: f,
            subject: detectSubject(f.name),
            year: detectYear(f.name),
            status: 'pending',
          })
        }
        return next
      })
    },
    [toast],
  )

  function addSeed() {
    if (!seed) return
    setJobs((prev) => {
      const seen = new Set(prev.map((j) => j.name + j.size))
      const next = [...prev]
      for (const s of seed) {
        if (seen.has(s.name)) continue
        next.push({
          key: `seed-${s.file}`,
          name: s.name,
          size: 0,
          remote: s.file,
          subject: s.subject,
          year: s.year,
          status: 'pending',
        })
      }
      return next
    })
  }

  function patchJob(key: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)))
  }

  async function resolveFile(job: Job): Promise<File> {
    if (job.file) return job.file
    const res = await fetch(`seed/${job.remote}`)
    if (!res.ok) throw new Error('预置文件读取失败')
    const blob = await res.blob()
    return new File([blob], job.name, { type: 'application/pdf' })
  }

  async function start() {
    const ready = jobs.filter((j) => j.status === 'pending' && j.subject && j.year)
    if (!ready.length) {
      toast('先补全科目和年份', 'error')
      return
    }
    setRunning(true)
    cancelRef.current = false
    setOverall({ done: 0, total: ready.length })

    for (let i = 0; i < ready.length; i++) {
      if (cancelRef.current) break
      const job = ready[i]
      setCurrent({ stage: 'reading', done: 0, total: 1 })
      patchJob(job.key, { status: 'running', message: '' })
      try {
        const exists = await findPaper(job.subject!, job.year!)
        if (exists && !overwrite) {
          patchJob(job.key, { status: 'skipped', message: '这套卷子已经在了，跳过' })
        } else {
          if (exists) {
            patchJob(job.key, { message: '覆盖旧版本…' })
            await deletePaper(exists.id)
          }
          const file = await resolveFile(job)
          const res = await importPaper({ file, subject: job.subject!, year: job.year! }, setCurrent)
          const diff = Math.abs(res.count - res.expected)
          patchJob(job.key, {
            status: 'done',
            count: res.count,
            message:
              diff > 4
                ? `切出 ${res.count} 题（通常 ${res.expected} 题，${METHOD_LABEL[res.method]}），建议检查`
                : `切出 ${res.count} 题（${METHOD_LABEL[res.method]}）`,
          })
        }
      } catch (e) {
        patchJob(job.key, { status: 'error', message: e instanceof Error ? e.message : '导入失败' })
      }
      setOverall({ done: i + 1, total: ready.length })
    }

    setCurrent(null)
    setRunning(false)
    if (!cancelRef.current) toast('导入完成', 'ok')
  }

  const pendingCount = jobs.filter((j) => j.status === 'pending').length
  const readyCount = jobs.filter((j) => j.status === 'pending' && j.subject && j.year).length
  const doneJobs = jobs.filter((j) => j.status === 'done')
  const missing = jobs.filter((j) => !j.subject || !j.year).length

  const stageText: Record<string, string> = {
    reading: '解析 PDF',
    segmenting: '自动切题',
    cropping: '裁图上传',
    saving: '写入题库',
    done: '完成',
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>批量导入</h1>
          <div className="page-sub">一次选多份真题 PDF，自动建卷、切题、入库</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/papers')}>
            回试卷库
          </button>
        </div>
      </div>

      {isDemoMode ? (
        <div className="demo-bar" style={{ marginBottom: 12 }}>
          <b>演示模式</b>
          <span>这里导入不会真的保存：题图会变成占位图。要用真实真题，请按 README 自己部署一份。</span>
        </div>
      ) : null}

      {isDemoMode ? (
        <div className="demo-bar" style={{ marginBottom: 12 }}>
          <b>演示模式</b>
          <span>这里导入不会真的保存：题图会变成占位图。要用真实真题，请按 README 自己部署一份。</span>
        </div>
      ) : null}

      {seed ? (
        <div className="card card-pad" style={{ marginBottom: 12, borderColor: 'var(--brand-line)' }}>
          <div className="row-between wrap" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name="layers" size={18} />
              <div>
                <div className="small" style={{ fontWeight: 600 }}>
                  站点里已备好 {seed.length} 套真题
                </div>
                <div className="tiny muted">
                  408：{seed.filter((s) => s.subject === 'cs408').length} 套 ·
                  数二：{seed.filter((s) => s.subject === 'math2').length} 套（年份已识别）
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={addSeed} disabled={running}>
              加入导入队列
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="card"
        style={{
          borderStyle: 'dashed',
          borderWidth: 2,
          padding: '30px 20px',
          textAlign: 'center',
          background: 'var(--surface-2)',
          cursor: running ? 'not-allowed' : 'pointer',
          opacity: running ? 0.6 : 1,
        }}
        onClick={() => !running && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!running) addFiles(e.dataTransfer.files)
        }}
      >
        <Icon name="upload" size={26} />
        <div style={{ fontWeight: 600, marginTop: 8 }}>把 PDF 拖进来，或点这里选择</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          可以一次选很多份；文件名里的年份和科目会自动识别（如「2021年计算机408统考真题.pdf」）
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
      </div>

      {jobs.length ? (
        <>
          <div className="section-title">
            队列 {pendingCount} 份待导入{doneJobs.length ? ` · 已完成 ${doneJobs.length} 份` : ''}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {jobs.map((job) => (
              <div
                key={job.key}
                className="card"
                style={{ padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <div className="grow" style={{ minWidth: 180 }}>
                  <div className="small truncate" style={{ fontWeight: 560 }} title={job.name}>
                    {job.name}
                  </div>
                  <div className="tiny muted">
                    {job.size ? `${(job.size / 1024 / 1024).toFixed(1)} MB` : '预置'}
                    {job.message ? ` · ${job.message}` : ''}
                  </div>
                </div>

                <select
                  className="select"
                  style={{ width: 92, height: 30, padding: '0 8px', fontSize: 12 }}
                  value={job.subject ?? ''}
                  disabled={running || job.status !== 'pending'}
                  onChange={(e) => patchJob(job.key, { subject: e.target.value as Subject })}
                >
                  <option value="">科目?</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  style={{ width: 76, height: 30, padding: '0 8px', fontSize: 12, textAlign: 'center' }}
                  value={job.year ?? ''}
                  placeholder="年份"
                  inputMode="numeric"
                  disabled={running || job.status !== 'pending'}
                  onChange={(e) => patchJob(job.key, { year: Number(e.target.value.replace(/\D/g, '')) || null })}
                />

                <span
                  className={`badge ${
                    job.status === 'done'
                      ? 'badge-ok'
                      : job.status === 'error'
                        ? 'badge-danger'
                        : job.status === 'running'
                          ? 'badge-brand'
                          : job.status === 'skipped'
                            ? 'badge-warn'
                            : ''
                  }`}
                  style={{ minWidth: 62, justifyContent: 'center' }}
                >
                  {job.status === 'pending'
                    ? '待导入'
                    : job.status === 'running'
                      ? '处理中'
                      : job.status === 'done'
                        ? '已入库'
                        : job.status === 'error'
                          ? '失败'
                          : '已跳过'}
                </span>
              </div>
            ))}
          </div>

          {current ? (
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <div className="row small">
                <div className="spinner" />
                {stageText[current.stage] ?? '处理中'}
                {current.total > 1 ? (
                  <span className="mono tiny muted">
                    {current.done}/{current.total}
                  </span>
                ) : null}
              </div>
              <div className="progress" style={{ marginTop: 8 }}>
                <i style={{ width: current.total ? `${(current.done / current.total) * 100}%` : '8%' }} />
              </div>
            </div>
          ) : null}

          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => void start()} disabled={running || !readyCount}>
              {running ? `导入中 ${overall.done}/${overall.total}` : `开始导入 ${readyCount} 份`}
            </button>
            <label className="row small" style={{ gap: 6, alignSelf: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overwrite}
                disabled={running}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              覆盖已有
            </label>
            {running ? (
              <button className="btn" onClick={() => (cancelRef.current = true)}>
                这一份做完就停
              </button>
            ) : (
              <button className="btn" onClick={() => setJobs([])} disabled={!jobs.length}>
                清空列表
              </button>
            )}
            {missing ? (
              <span className="tiny" style={{ color: 'var(--danger)', alignSelf: 'center' }}>
                有 {missing} 份没识别出科目或年份，补一下才能导入
              </span>
            ) : null}
          </div>

          <div className="card card-pad" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
            <div className="tiny muted" style={{ lineHeight: 1.85 }}>
              <b style={{ color: 'var(--ink-2)' }}>说明</b>
              <br />· 每份卷子按页面顺序把题号编成 1、2、3…；切得不准就进「编辑切题」调一下再保存。
              <br />· 正常情况下数二 22 题、408 47 题，数量差太多会在列表里提示。
              <br />· 处理时别关页面，一份大约 20–60 秒。
            </div>
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => navigate('/')}>
          回到今日
        </button>
      </div>
    </div>
  )
}
