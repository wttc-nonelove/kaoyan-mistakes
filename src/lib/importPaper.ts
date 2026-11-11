import type { CutSegment, CutState, QType, Subject } from '../types'
import type { QuestionDraft } from './repo'
import { createPaper, replaceQuestions } from './repo'
import { putBlob } from './blobStore'
import { openPdf } from './pdf/loader'
import { clearPageCache, renderPageCanvas, toGray } from './pdf/render'
import { segmentPage } from './pdf/segment'
import { segmentDocByText } from './pdf/textSeg'
import { segmentDocByOcr } from './pdf/ocrSeg'
import { cropFromPage } from './pdf/crop'
import { CROP_SCALE, RATIO, SEG_SCALE, mm2px } from './cut'
import { guessQType } from './tags'
import { uid } from './utils'

export interface ImportJobInput {
  file: File
  subject: Subject
  year: number
}

export type ImportStage = 'reading' | 'segmenting' | 'cropping' | 'saving' | 'done'

export interface ImportProgress {
  stage: ImportStage
  done: number
  total: number
}

export interface ImportResult {
  paperId: string
  count: number
  expected: number
  pageCount: number
  /** 文字层切题还是图像投影切题 */
  method: 'ocr' | 'text' | 'image'
}

/** 图像投影的候选参数：每套卷子挑一组最接近标准题量的（实测没有通吃所有卷子的参数） */
const PROJECTION_COMBOS = [
  { gapMm: 2, minHeightMm: 6, leftEdge: true },
  { gapMm: 2, minHeightMm: 10, leftEdge: true },
  { gapMm: 2.5, minHeightMm: 8, leftEdge: true },
  { gapMm: 3, minHeightMm: 8, leftEdge: true },
  { gapMm: 3, minHeightMm: 15, leftEdge: true },
  { gapMm: 4, minHeightMm: 8, leftEdge: true },
  { gapMm: 5, minHeightMm: 8, leftEdge: true },
  { gapMm: 5, minHeightMm: 25, leftEdge: true },
]

/** 各科目正常题量，用来提示"可能切漏/切多" */
export const EXPECTED_COUNT: Record<Subject, number> = {
  math2: 23,
  cs408: 47,
}

interface SegRef {
  page: number
  y0: number
  y1: number
}

interface QGroup {
  qno: number
  segs: SegRef[]
}

/**
 * 一份 PDF → 一套卷子（切题 + 裁图 + 上传 + 入库）。
 * 优先用文字层的题号坐标切分（准），没有文字层才退回图像投影。
 */
export async function importPaper(
  input: ImportJobInput,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const { file, subject, year } = input
  onProgress?.({ stage: 'reading', done: 0, total: 1 })

  const buf = await file.arrayBuffer()
  const doc = await openPdf(buf)
  const pageCount = doc.numPages

  try {
    const sourcePath = `src/${uid()}.pdf`
    await putBlob(sourcePath, file)
    const paper = await createPaper({
      subject,
      year,
      pageCount,
      sourcePath,
      sourceBytes: file.size,
    })

    /* ---------- 1. 切题：文字层优先 ---------- */
    onProgress?.({ stage: 'segmenting', done: 0, total: pageCount })
    let groups: QGroup[] = []
    let method: 'ocr' | 'text' | 'image' = 'image'
    const expected = EXPECTED_COUNT[subject]

    // 方案 A：OCR 找题号（对清晰的数字版 PDF 最准）
    const ocr = await segmentDocByOcr(doc, pageCount, SEG_SCALE, expected)
    if (ocr) {
      const map = new Map<number, SegRef[]>()
      for (const s of ocr.segs) {
        if (!map.has(s.qno)) map.set(s.qno, [])
        map.get(s.qno)!.push({ page: s.page, y0: s.y0, y1: s.y1 })
      }
      groups = [...map.entries()]
        .map(([qno, segs]) => ({ qno, segs }))
        .sort((a, b) => a.qno - b.qno)
      method = 'ocr'
    }

    // 方案 B：PDF 自带文字层的题号
    const textRes = groups.length ? null : await segmentDocByText(doc, pageCount, SEG_SCALE)
    if (groups.length === 0 && textRes && textRes.numbers.length >= expected * 0.75) {
      const map = new Map<number, SegRef[]>()
      for (const s of textRes.segs) {
        if (!map.has(s.qno)) map.set(s.qno, [])
        map.get(s.qno)!.push({ page: s.page, y0: s.y0, y1: s.y1 })
      }
      groups = [...map.entries()]
        .map(([qno, segs]) => ({ qno, segs: segs.sort((a, b) => (a.page === b.page ? a.y0 - b.y0 : a.page - b.page)) }))
        .sort((a, b) => a.qno - b.qno)
      method = 'text'
    }

    if (!groups.length) {
      // 图像投影切题。不同卷子排版差异很大，用多组候选参数各跑一遍，
      // 最后挑"题量最接近该科目常规题量"的那一组（同一套卷子用同一组参数）。
      const candidates = PROJECTION_COMBOS
      const perCombo: { page: number; y0: number; y1: number; role: 'stem' | 'ignore' }[][] =
        candidates.map(() => [])

      for (let p = 1; p <= pageCount; p++) {
        onProgress?.({ stage: 'segmenting', done: p, total: pageCount })
        const { canvas } = await renderPageCanvas(doc, p, SEG_SCALE)
        const { gray, w, h } = toGray(canvas)
        for (let ci = 0; ci < candidates.length; ci++) {
          const c = candidates[ci]
          const rep = segmentPage(gray, w, h, {
            gapMinPx: mm2px(c.gapMm, 144),
            minHeightPx: mm2px(c.minHeightMm, 144),
            leftEdge: c.leftEdge,
            page: p,
          })
          for (const s of rep.segments) {
            perCombo[ci].push({ page: p, y0: Math.round(s.y0), y1: Math.round(s.y1), role: s.role })
          }
        }
        clearPageCache()
        await new Promise((r) => setTimeout(r, 0))
      }

      let bestIdx = 0
      let bestDiff = Number.POSITIVE_INFINITY
      for (let ci = 0; ci < candidates.length; ci++) {
        const n = perCombo[ci].filter((s) => s.role === 'stem').length
        const diff = Math.abs(n - expected)
        if (diff < bestDiff) {
          bestDiff = diff
          bestIdx = ci
        }
      }
      const chosen = perCombo[bestIdx]
      const stems = chosen
        .filter((s) => s.role === 'stem')
        .sort((a, b) => (a.page === b.page ? a.y0 - b.y0 : a.page - b.page))
      groups = stems.map((s, i) => ({ qno: i + 1, segs: [{ page: s.page, y0: s.y0, y1: s.y1 }] }))
      method = 'image'
    }

    if (!groups.length) throw new Error('这一份没能切出题目，需要手动处理')

    /* ---------- 2. 逐页裁图（一页一次渲染） ---------- */
    const byPage = new Map<number, { g: QGroup; s: SegRef }[]>()
    for (const g of groups) {
      for (const s of g.segs) {
        if (!byPage.has(s.page)) byPage.set(s.page, [])
        byPage.get(s.page)!.push({ g, s })
      }
    }

    const parts = new Map<number, { p: string; t: string; w: number; h: number }[]>()
    let cropped = 0
    const totalSegs = [...byPage.values()].reduce((n, v) => n + v.length, 0)

    for (const [page, items] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
      const { canvas } = await renderPageCanvas(doc, page, CROP_SCALE)
      for (const { g, s } of items.sort((a, b) => a.s.y0 - b.s.y0)) {
        const { blob, thumb, w, h } = await cropFromPage(canvas, RATIO, s.y0, s.y1, undefined, {
          maxLongEdge: 1600,
          thumbLongEdge: 420,
        })
        const idx = (parts.get(g.qno)?.length ?? 0) + 1
        const key = `papers/${paper.id}/q/${g.qno}-${idx}-${uid()}.jpg`
        const thumbKey = key.replace(/\.jpg$/, '.thumb.jpg')
        await putBlob(key, blob)
        await putBlob(thumbKey, thumb)
        if (!parts.has(g.qno)) parts.set(g.qno, [])
        parts.get(g.qno)!.push({ p: key, t: thumbKey, w, h })
        cropped++
        onProgress?.({ stage: 'cropping', done: cropped, total: totalSegs })
      }
      clearPageCache()
      await new Promise((r) => setTimeout(r, 0))
    }

    /* ---------- 3. 入库 ---------- */
    onProgress?.({ stage: 'saving', done: 0, total: 1 })

    // 把这次的切割结果一并存下来，编辑器再打开时直接恢复，不会用另一套参数重切一遍
    const cutSegs: CutSegment[] = []
    const qnoOverride: Record<string, number> = {}
    for (const g of groups) {
      const gid = `g_${g.qno}`
      qnoOverride[gid] = g.qno
      for (const s of g.segs) {
        cutSegs.push({
          id: uid('s_'),
          page: s.page,
          y0: s.y0,
          y1: s.y1,
          group: gid,
          role: 'stem',
          conf: 'high',
        })
      }
    }
    const cutState: CutState = { v: 1, segs: cutSegs, qnoOverride, pageIndex: 1, updatedAt: Date.now() }

    const drafts: QuestionDraft[] = groups
      .filter((g) => (parts.get(g.qno)?.length ?? 0) > 0)
      .map((g) => ({
        qno: g.qno,
        qtype: guessQType(subject, g.qno) as QType,
        stemParts: parts.get(g.qno)!,
      }))

    await replaceQuestions(paper.id, drafts, cutState)

    return {
      paperId: paper.id,
      count: drafts.length,
      expected,
      pageCount,
      method,
    }
  } finally {
    clearPageCache()
    doc.destroy().catch(() => {})
    onProgress?.({ stage: 'done', done: 1, total: 1 })
  }
}

/* ---------------- 文件名识别 ---------------- */

export function detectSubject(name: string): Subject | null {
  if (/408|计算机|统考/.test(name)) return 'cs408'
  if (/数学二|数二|数学（二）|数学\(二\)/.test(name)) return 'math2'
  return null
}

export function detectYear(name: string): number | null {
  const m = name.match(/(19|20)\d{2}/)
  if (!m) return null
  const y = Number(m[0])
  return y >= 1987 && y <= 2100 ? y : null
}
