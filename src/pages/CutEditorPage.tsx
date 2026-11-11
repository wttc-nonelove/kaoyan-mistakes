import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CutSegment, CutState, Paper, QType } from '../types'
import type { QuestionDraft } from '../lib/repo'
import { getPaper, listQuestions, replaceQuestions, updatePaper } from '../lib/repo'
import { getBlob, putBlob } from '../lib/blobStore'
import { openPdf, type PdfDoc } from '../lib/pdf/loader'
import { clearPageCache, renderPageCanvas, toGray } from '../lib/pdf/render'
import { segmentPage } from '../lib/pdf/segment'
import { cropFromPage } from '../lib/pdf/crop'
import { CROP_SCALE, RATIO, SEG_SCALE, groupToQuestions, mm2px, sortSegs } from '../lib/cut'
import { guessQType } from '../lib/tags'
import { clamp, uid } from '../lib/utils'
import { navigate } from '../hooks'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { ConfirmSheet, Loading } from '../components/ui'

const mm = (px: number) => Math.round(((px / SEG_SCALE) / 72) * 25.4)

export function CutEditorPage({ paperId }: { paperId: string }) {
  const toast = useToast()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [segs, setSegs] = useState<CutSegment[]>([])
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [bounds, setBounds] = useState<Record<number, { l: number; r: number }>>({})
  const [pageIndex, setPageIndex] = useState(1)
  const [pageInfo, setPageInfo] = useState<{ w: number; h: number; url: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [confirmCommit, setConfirmCommit] = useState(false)
  const [hasQuestions, setHasQuestions] = useState(false)

  const pageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ ids: [string, string]; startY: number; base: number; scale: number } | null>(null)
  const historyRef = useRef<CutSegment[][]>([])
  const saveTimer = useRef<number>()
  const overridesRef = useRef(overrides)
  const pageIndexRef = useRef(pageIndex)
  overridesRef.current = overrides
  pageIndexRef.current = pageIndex

  /* ---------------- 载入 ---------------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setBusy('载入试卷…')
        const p = await getPaper(paperId)
        if (!p) throw new Error('试卷不存在')
        const existing = await listQuestions(paperId)
        if (!alive) return
        setPaper(p)
        setHasQuestions(existing.length > 0)
        if (!p.sourcePath) throw new Error('找不到原始 PDF，请重新上传这套卷子')
        const blob = await getBlob(p.sourcePath)
        if (!blob) throw new Error('原始 PDF 已丢失，请重新上传这套卷子')
        setBusy('打开 PDF…')
        const d = await openPdf(await blob.arrayBuffer())
        if (!alive) return
        setDoc(d)

        const local = readLocalCut(paperId)
        const serverState = p.cutState
        const useLocal = local && (!serverState || local.updatedAt > (serverState.updatedAt ?? 0) + 1200)

        if (serverState?.segs?.length || useLocal) {
          const state = useLocal ? local! : serverState!
          setSegs(state.segs)
          setOverrides(state.qnoOverride ?? {})
          if (state.pageIndex) setPageIndex(state.pageIndex)
          setBusy('')
          if (useLocal) toast('已恢复本地未同步的切题进度')
        } else {
          await autoSegment(d, () => alive)
        }
      } catch (e) {
        if (alive) {
          setBusy('')
          toast(e instanceof Error ? e.message : '载入失败', 'error')
        }
      }
    })()
    return () => {
      alive = false
      clearPageCache()
      window.clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId])

  async function autoSegment(d: PdfDoc, isAlive: () => boolean) {
    const all: CutSegment[] = []
    const b: Record<number, { l: number; r: number }> = {}
    setProgress({ done: 0, total: d.numPages })
    for (let p = 1; p <= d.numPages; p++) {
      if (!isAlive()) return
      setBusy(`正在自动切题 第 ${p}/${d.numPages} 页`)
      const { canvas } = await renderPageCanvas(d, p, SEG_SCALE)
      const { gray, w, h } = toGray(canvas)
      const rep = segmentPage(gray, w, h, {
        gapMinPx: mm2px(3.2, 144),
        minHeightPx: mm2px(15, 144),
        leftEdge: true,
        page: p,
      })
      b[p] = { l: rep.contentL, r: rep.contentR }
      for (const s of rep.segments) {
        all.push({
          id: uid('s_'),
          page: p,
          y0: Math.round(s.y0),
          y1: Math.round(s.y1),
          group: uid('g_'),
          role: s.role,
          conf: s.conf,
        })
      }
      setProgress({ done: p, total: d.numPages })
      await new Promise((r) => setTimeout(r, 0))
    }
    setSegs(all)
    setBounds((prev) => ({ ...prev, ...b }))
    setBusy('')
    const n = all.filter((s) => s.role === 'stem').length
    toast(`自动切出 ${n} 段，请检查分割线`, 'ok')
  }

  /* ---------------- 当前页渲染 ---------------- */
  useEffect(() => {
    if (!doc) return
    let alive = true
    ;(async () => {
      setPageInfo(null)
      const { canvas } = await renderPageCanvas(doc, pageIndex, SEG_SCALE)
      if (!alive) return
      const small = document.createElement('canvas')
      const ratio = Math.min(1, 1000 / canvas.width)
      small.width = Math.round(canvas.width * ratio)
      small.height = Math.round(canvas.height * ratio)
      small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
      setPageInfo({ w: canvas.width, h: canvas.height, url: small.toDataURL('image/jpeg', 0.75) })
    })()
    return () => {
      alive = false
    }
  }, [doc, pageIndex])

  /* ---------------- 持久化 ---------------- */
  const persist = useCallback(
    (nextSegs: CutSegment[], nextOverrides: Record<string, number>, page: number, immediate = false) => {
      const state: CutState = {
        v: 1,
        segs: nextSegs,
        qnoOverride: nextOverrides,
        pageIndex: page,
        updatedAt: Date.now(),
      }
      writeLocalCut(paperId, state)
      window.clearTimeout(saveTimer.current)
      const run = () => updatePaper(paperId, { cutState: state }).catch(() => {})
      if (immediate) run()
      else saveTimer.current = window.setTimeout(run, 1200)
    },
    [paperId],
  )

  const update = useCallback(
    (fn: (prev: CutSegment[]) => CutSegment[]) => {
      setSegs((prev) => {
        const next = fn(prev)
        persist(next, overridesRef.current, pageIndexRef.current)
        return next
      })
    },
    [persist],
  )

  const pushHistory = useCallback((snapshot: CutSegment[]) => {
    historyRef.current.push(snapshot)
    if (historyRef.current.length > 30) historyRef.current.shift()
  }, [])

  const undo = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) {
      toast('没有可撤销的操作')
      return
    }
    setSegs(prev)
    persist(prev, overridesRef.current, pageIndexRef.current, true)
  }, [persist, toast])

  /* ---------------- 派生 ---------------- */
  const pageSegs = useMemo(
    () => segs.filter((s) => s.page === pageIndex && s.role === 'stem').sort((a, b) => a.y0 - b.y0),
    [segs, pageIndex],
  )
  const questions = useMemo(() => groupToQuestions(segs, overrides), [segs, overrides])
  const qnoOfGroup = useMemo(() => new Map(questions.map((q) => [q.group, q.qno])), [questions])

  /* ---------------- 交互 ---------------- */
  const onLineDown = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    const img = pageRef.current
    if (!img || !pageInfo) return
    const a = pageSegs[idx]
    const b = pageSegs[idx + 1]
    if (!a || !b) return
    pushHistory(segs)
    dragRef.current = {
      ids: [a.id, b.id],
      startY: e.clientY,
      base: a.y1,
      scale: pageInfo.h / img.getBoundingClientRect().height,
    }
    setDragIdx(idx)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onLineMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const delta = (e.clientY - d.startY) * d.scale
    update((prev) => {
      const a = prev.find((s) => s.id === d.ids[0])
      const b = prev.find((s) => s.id === d.ids[1])
      if (!a || !b) return prev
      const y = Math.round(clamp(d.base + delta, a.y0 + 30, b.y1 - 30))
      return prev.map((s) =>
        s.id === a.id ? { ...s, y1: y } : s.id === b.id ? { ...s, y0: y } : s,
      )
    })
  }

  const onLineUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragIdx(null)
    persist(segs, overridesRef.current, pageIndexRef.current, true)
  }

  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = pageRef.current
    if (!img || !pageInfo) return
    const rect = img.getBoundingClientRect()
    const y = ((e.clientY - rect.top) / rect.height) * pageInfo.h
    const target = pageSegs.find((s) => y > s.y0 + 14 && y < s.y1 - 14)
    if (!target) {
      toast('双击位置离分割线太近，换一处试试')
      return
    }
    pushHistory(segs)
    update((prev) => {
      const next: CutSegment[] = []
      for (const s of prev) {
        if (s.id !== target.id) {
          next.push(s)
          continue
        }
        next.push({ ...s, y1: Math.round(y) })
        next.push({ ...s, id: uid('s_'), y0: Math.round(y), group: uid('g_'), conf: 'manual' })
      }
      return next
    })
  }

  const deleteLine = (idx: number) => {
    const a = pageSegs[idx]
    const b = pageSegs[idx + 1]
    if (!a || !b) return
    pushHistory(segs)
    update((prev) =>
      prev.filter((s) => s.id !== b.id).map((s) => (s.id === a.id ? { ...s, y1: b.y1 } : s)),
    )
  }

  const mergeWithPrevious = (group: string) => {
    const i = questions.findIndex((q) => q.group === group)
    if (i <= 0) {
      toast('已经是第一题了')
      return
    }
    const prevGroup = questions[i - 1].group
    pushHistory(segs)
    update((prev) => prev.map((s) => (s.group === group ? { ...s, group: prevGroup } : s)))
    setSelectedGroup(prevGroup)
    toast('已并入上一题（跨页拼接）')
  }

  const splitGroup = (group: string) => {
    const list = segs.filter((s) => s.group === group).sort(sortSegs)
    if (list.length < 2) {
      toast('这道题只有一段，用双击拆开')
      return
    }
    pushHistory(segs)
    const last = list[list.length - 1]
    update((prev) => prev.map((s) => (s.id === last.id ? { ...s, group: uid('g_') } : s)))
  }

  const setQno = (group: string, n: number) => {
    const next = { ...overridesRef.current, [group]: n }
    setOverrides(next)
    persist(segs, next, pageIndexRef.current)
  }

  const renumber = () => {
    setOverrides({})
    persist(segs, {}, pageIndexRef.current, true)
    toast('已按顺序重新编号', 'ok')
  }

  const reAuto = async () => {
    if (!doc) return
    if (!window.confirm('重新自动切题会覆盖当前所有分割线，确定吗？')) return
    pushHistory(segs)
    clearPageCache()
    await autoSegment(doc, () => true)
  }

  /* ---------------- 提交 ---------------- */
  async function commit() {
    if (!doc || !paper) return
    const list = questions.filter((q) => q.segs.length > 0)
    if (!list.length) {
      toast('还没有可保存的题目', 'error')
      return
    }
    try {
      setBusy('正在裁图…')
      setProgress({ done: 0, total: list.length })
      const drafts: QuestionDraft[] = []
      const pageCache = new Map<number, HTMLCanvasElement>()

      for (let i = 0; i < list.length; i++) {
        const q = list[i]
        const parts: { p: string; t: string; w: number; h: number }[] = []
        for (let k = 0; k < q.segs.length; k++) {
          const s = q.segs[k]
          let canvas = pageCache.get(s.page)
          if (!canvas) {
            canvas = (await renderPageCanvas(doc, s.page, CROP_SCALE)).canvas
            pageCache.set(s.page, canvas)
          }
          const { blob, thumb, w, h } = await cropFromPage(canvas, RATIO, s.y0, s.y1, bounds[s.page], {
            maxLongEdge: 1600,
            thumbLongEdge: 420,
          })
          const key = `papers/${paper.id}/q/${q.qno}-${k + 1}-${uid()}.jpg`
          const thumbKey = key.replace(/\.jpg$/, '.thumb.jpg')
          await putBlob(key, blob)
          await putBlob(thumbKey, thumb)
          parts.push({ p: key, t: thumbKey, w, h })
          await new Promise((r) => setTimeout(r, 0))
        }
        drafts.push({
          qno: q.qno,
          qtype: guessQType(paper.subject, q.qno) as QType,
          stemParts: parts,
        })
        setBusy(`正在裁图 ${i + 1}/${list.length}`)
        setProgress({ done: i + 1, total: list.length })
      }

      setBusy('正在写入题库…')
      await replaceQuestions(paper.id, drafts)
      pageCache.clear()
      clearPageCache()
      setBusy('')
      toast(`已保存 ${drafts.length} 道题`, 'ok')
      navigate(`/papers/${paper.id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error')
      setBusy('')
    } finally {
      setProgress({ done: 0, total: 0 })
    }
  }

  /* ---------------- 键盘 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === '[') setPageIndex((p) => Math.max(1, p - 1))
      if (e.key === ']') setPageIndex((p) => Math.min(doc?.numPages ?? 1, p + 1))
      if (e.key.toLowerCase() === 'm' && selectedGroup) {
        if (e.shiftKey) splitGroup(selectedGroup)
        else mergeWithPrevious(selectedGroup)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, undo, questionKey(questions)])

  if (!paper) return <Loading text={busy || '载入中…'} />

  const totalPages = doc?.numPages ?? paper.pageCount
  const pageStartQno = questions.find((q) => q.segs.some((s) => s.page === pageIndex))?.qno

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="cut-toolbar no-print">
        <button className="btn btn-sm" onClick={() => navigate(`/papers/${paper.id}`)}>
          <Icon name="left" size={14} /> 返回
        </button>
        <span className="badge">{paper.year} {paper.subject === 'math2' ? '数二' : '408'}</span>
        <span className="tiny muted">
          第 {pageIndex}/{totalPages} 页
          {pageStartQno ? ` · 本页从第 ${pageStartQno} 题开始` : ''}
        </span>
        <div className="grow" />
        <button className="btn btn-sm" onClick={() => setPageIndex((p) => Math.max(1, p - 1))} disabled={pageIndex <= 1}>
          <Icon name="left" size={14} />
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setPageIndex((p) => Math.min(totalPages, p + 1))}
          disabled={pageIndex >= totalPages}
        >
          <Icon name="right" size={14} />
        </button>
        <button className="btn btn-sm" onClick={renumber} title="按页面顺序重新编号">
          <Icon name="refresh" size={13} /> 重编号
        </button>
        <button className="btn btn-sm" onClick={reAuto} title="重新跑一次自动切题">
          <Icon name="spark" size={13} /> 重切
        </button>
        <button className="btn btn-sm" onClick={undo} title="Ctrl+Z">
          撤销
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => (hasQuestions ? setConfirmCommit(true) : void commit())}
          disabled={!!busy}
        >
          <Icon name="check" size={14} /> {busy || `保存 ${questions.length} 道题`}
        </button>
      </div>

      {busy ? (
        <div className="card card-pad no-print" style={{ marginBottom: 10 }}>
          <div className="row small">
            <div className="spinner" /> {busy}
            {progress.total > 0 ? (
              <span className="mono tiny muted">
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
          <div className="progress" style={{ marginTop: 10 }}>
            <i style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '10%' }} />
          </div>
        </div>
      ) : null}

      <div className="cut-layout">
        <div className="cut-thumbs no-print">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const n = segs.filter((s) => s.page === p && s.role === 'stem').length
            return (
              <button
                key={p}
                className={`cut-thumb${p === pageIndex ? ' is-active' : ''}`}
                onClick={() => setPageIndex(p)}
                title={`第 ${p} 页，${n} 段`}
              >
                <span>{p}</span>
                {n ? <b>{n}</b> : null}
              </button>
            )
          })}
        </div>

        <div className="cut-stage">
          <div className="cut-canvas-wrap" onDoubleClick={onCanvasDoubleClick}>
            {pageInfo ? (
              <>
                <img ref={pageRef} src={pageInfo.url} alt={`第 ${pageIndex} 页`} style={{ width: '100%', display: 'block' }} />
                <div className="cut-overlay">
                  {pageSegs.map((s) => {
                    const q = questions.find((item) => item.group === s.group)
                    const isFirst = q?.segs[0]?.id === s.id
                    const multi = q?.segs.length ?? 1
                    const active = selectedGroup === s.group
                    return (
                      <div
                        key={s.id}
                        className={`cut-band${multi > 1 ? ' is-group' : ''}`}
                        style={{
                          top: `${(s.y0 / pageInfo.h) * 100}%`,
                          height: `${((s.y1 - s.y0) / pageInfo.h) * 100}%`,
                          background: active ? 'rgba(47,111,94,0.10)' : 'transparent',
                          borderLeft: active ? '3px solid var(--brand)' : '3px solid transparent',
                          pointerEvents: 'auto',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedGroup(s.group)}
                      >
                        {isFirst ? (
                          <span>
                            第 {qnoOfGroup.get(s.group) ?? '?'} 题{multi > 1 ? ` · ${multi} 段` : ''}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}

                  {pageSegs.slice(0, -1).map((s, i) => (
                    <div
                      key={`line-${s.id}`}
                      className={`cut-line${s.conf === 'low' ? ' is-low' : ''}${dragIdx === i ? ' is-drag' : ''}`}
                      style={{ top: `${(s.y1 / pageInfo.h) * 100}%` }}
                      onPointerDown={(e) => onLineDown(e, i)}
                      onPointerMove={onLineMove}
                      onPointerUp={onLineUp}
                      onPointerCancel={onLineUp}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        deleteLine(i)
                      }}
                    >
                      <span className="cut-line-handle">⋮⋮</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="skeleton" style={{ width: 620, height: 877 }} />
            )}
          </div>
        </div>

        <div className="cut-side no-print">
          <div className="row-between">
            <b style={{ fontSize: 13 }}>本页题目</b>
            <span className="tiny muted">{pageSegs.length} 段</span>
          </div>

          {questions.filter((q) => q.segs.some((s) => s.page === pageIndex)).length === 0 ? (
            <div className="tiny muted" style={{ padding: '12px 4px', lineHeight: 1.7 }}>
              这页没有切出题目。可以在图上双击拆分，或点「重切」换一套分割方案。
            </div>
          ) : null}

          <div className="cut-side" style={{ gap: 7, maxHeight: 'none', overflow: 'visible' }}>
            {questions.map((q, idx) => {
              if (!q.segs.some((s) => s.page === pageIndex)) return null
              const first = q.segs[0]
              return (
                <div
                  key={q.group}
                  className={`cut-item${selectedGroup === q.group ? ' is-sel' : ''}`}
                  onClick={() => setSelectedGroup(q.group)}
                >
                  <input
                    value={q.qno}
                    onChange={(e) => setQno(q.group, clamp(Number(e.target.value) || 1, 1, 99))}
                    onClick={(e) => e.stopPropagation()}
                    inputMode="numeric"
                  />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="tiny truncate">
                      第 {first.page} 页 · 高 {mm(first.y1 - first.y0)}mm
                    </div>
                    <div className="tiny muted">
                      {q.segs.length > 1 ? `${q.segs.length} 段（跨页）` : first.conf === 'low' ? '自动 · 待确认' : '自动'}
                    </div>
                  </div>
                  <button
                    className="btn-icon"
                    title="与上一题合并（跨页拼接）"
                    onClick={(e) => {
                      e.stopPropagation()
                      mergeWithPrevious(q.group)
                    }}
                    disabled={idx === 0}
                    style={{ width: 24, height: 24 }}
                  >
                    <Icon name="layers" size={13} />
                  </button>
                </div>
              )
            })}
          </div>

          {selectedGroup && (questions.find((q) => q.group === selectedGroup)?.segs.length ?? 0) > 1 ? (
            <button className="btn btn-sm" onClick={() => splitGroup(selectedGroup)}>
              把最后一段拆成新题
            </button>
          ) : null}

          <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
            <div className="tiny muted" style={{ lineHeight: 1.85 }}>
              <b style={{ color: 'var(--ink-2)' }}>怎么调</b>
              <br />· 拖绿色分割线改边界（虚线 = 不太确定）
              <br />· 双击题目内部 = 在这里拆成两题
              <br />· 双击分割线 = 删掉它（两段合并）
              <br />· 点中题目后按 <span className="kbd">M</span> 并入上一题（跨页用）
              <br />· <span className="kbd">[</span> <span className="kbd">]</span> 翻页 ·{" "}
              <span className="kbd">Ctrl</span> + <span className="kbd">Z</span> 撤销
            </div>
          </div>
        </div>
      </div>

      <ConfirmSheet
        open={confirmCommit}
        title="重新保存会覆盖已有题目"
        danger
        okText="继续保存"
        desc="这套卷子已经切好过题目，重新保存会删除旧题目以及它们的错题与复习记录。确定继续吗？"
        onClose={() => setConfirmCommit(false)}
        onOk={() => {
          setConfirmCommit(false)
          void commit()
        }}
      />
    </div>
  )
}

/* ---------------- 本地草稿 ---------------- */

const localKey = (paperId: string) => `cut:${paperId}`

function writeLocalCut(paperId: string, state: CutState) {
  try {
    localStorage.setItem(localKey(paperId), JSON.stringify(state))
  } catch {
    /* 配额不足时忽略 */
  }
}

function readLocalCut(paperId: string): CutState | null {
  try {
    const raw = localStorage.getItem(localKey(paperId))
    return raw ? (JSON.parse(raw) as CutState) : null
  } catch {
    return null
  }
}

function questionKey(q: { length: number }): number {
  return q.length
}
