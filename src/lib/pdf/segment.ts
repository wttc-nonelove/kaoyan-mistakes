export interface SegmentOut {
  y0: number
  y1: number
  conf: 'high' | 'low'
  role: 'stem' | 'ignore'
}

export interface SegmentParams {
  /** 空白带绝对下限（px） */
  gapMinPx: number
  /** 单题最小高度（px） */
  minHeightPx: number
  /** 是否做左边界二次切分 */
  leftEdge: boolean
  /** 当前页码（从 1 开始），用于识别只出现在第 1 页的卷头 */
  page?: number
}

export interface SegmentReport {
  segments: SegmentOut[]
  threshold: number
  contentL: number
  contentR: number
  /** 中位行距，供调试/提示 */
  medianLineGap: number
}

export function otsu(gray: Uint8Array): number {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return Math.min(200, Math.max(80, best))
}

interface Bounds {
  contentL: number
  contentR: number
}

function detectBounds(gray: Uint8Array, w: number, h: number, thr: number): Bounds {
  const colInk = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (gray[row + x] < thr) colInk[x]++
    }
  }
  const lowMark = Math.max(3, h * 0.0025)
  let l = 0
  while (l < w && colInk[l] < lowMark) l++
  let r = w - 1
  while (r > l && colInk[r] < lowMark) r--

  // 装订线 / 扫描阴影：左边缘整列几乎全黑，向内收（只在真的检测到黑列时才收）
  const binding = h * 0.5
  let guardL = 0
  for (let x = 0; x < Math.floor(w * 0.12); x++) {
    if (colInk[x] > binding) guardL = x + 1
  }
  if (l < guardL) l = guardL

  // 右边缘阴影同理
  let guardR = w - 1
  for (let x = w - 1; x > Math.floor(w * 0.88); x--) {
    if (colInk[x] > binding) guardR = x - 1
  }
  if (r > guardR) r = guardR

  if (r - l < w * 0.3) return { contentL: 0, contentR: w - 1 }
  return { contentL: l, contentR: r }
}

function medianOf(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function segmentPage(
  gray: Uint8Array,
  w: number,
  h: number,
  params: SegmentParams,
): SegmentReport {
  const thr = otsu(gray)
  const { contentL, contentR } = detectBounds(gray, w, h, thr)
  const contentW = Math.max(1, contentR - contentL)

  const rowInk = new Uint32Array(h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let c = 0
    for (let x = contentL; x < contentR; x++) {
      if (gray[row + x] < thr) c++
    }
    rowInk[y] = c
  }

  const inkMin = Math.max(4, Math.round(contentW * 0.006))
  const isText = new Uint8Array(h)
  for (let y = 0; y < h; y++) isText[y] = rowInk[y] >= inkMin ? 1 : 0

  // 收集非文字游程，用中位数估计行距
  const runs: { start: number; len: number }[] = []
  let i = 0
  while (i < h) {
    if (!isText[i]) {
      const start = i
      while (i < h && !isText[i]) i++
      runs.push({ start, len: i - start })
    } else i++
  }
  const innerRuns = runs.filter((r) => r.start > h * 0.05 && r.start + r.len < h * 0.95)
  const medianLineGap = medianOf(innerRuns.map((r) => r.len).filter((n) => n > 0))

  const gapMin = Math.max(params.gapMinPx, Math.round(medianLineGap * 1.7))

  // 候选分割：中间的大空白带
  const cutYs: number[] = []
  for (const r of runs) {
    if (r.len >= gapMin && r.start > h * 0.02 && r.start + r.len < h * 0.98) {
      cutYs.push(Math.round(r.start + r.len / 2))
    }
  }

  let firstText = 0
  while (firstText < h && !isText[firstText]) firstText++
  let lastText = h - 1
  while (lastText > firstText && !isText[lastText]) lastText--

  const boundaries = [firstText - 3, ...cutYs, lastText + 3]
  let segs: SegmentOut[] = []
  for (let k = 0; k < boundaries.length - 1; k++) {
    const y0 = Math.max(0, boundaries[k])
    const y1 = Math.min(h, boundaries[k + 1])
    if (y1 - y0 < 4) continue
    segs.push({ y0, y1, conf: 'high', role: 'stem' })
  }

  // 合并过碎的段
  segs = mergeSmall(segs, params.minHeightPx)

  // 页眉 / 页脚 / 页码
  for (const s of segs) {
    const heightRatio = (s.y1 - s.y0) / h
    if (s.y0 < h * 0.075 && heightRatio < 0.07) s.role = 'ignore'
    else if (s.y1 > h * 0.93 && heightRatio < 0.045) s.role = 'ignore'
  }

  // 左边界二次切分：把粘连的选择题拆开
  if (params.leftEdge) {
    const extra: SegmentOut[] = []
    for (const s of segs) {
      const pieces = splitByIndent(gray, w, s, contentL, contentR, thr, isText, medianLineGap)
      if (pieces.length <= 1) {
        extra.push(s)
        continue
      }
      for (const p of pieces) extra.push({ ...p, role: s.role })
    }
    segs = extra.filter((s) => s.y1 - s.y0 >= 8)
  }

  // 卷头：第 1 页最上面那块通常是大标题（居中排），不是题目。
  // 判据：高度不大 且 首行墨迹明显内缩（居中），真题目块都是从左边距起排的。
  if ((params.page ?? 1) === 1) {
    for (const s of segs) {
      if (s.role !== 'stem') continue
      if (s.y0 >= h * 0.3) break
      const ratio = (s.y1 - s.y0) / h
      // 卷头/栏目头：贴在前 30% 内、且明显比一道题矮
      if (ratio < 0.2) s.role = 'ignore'
    }
  }

  return { segments: segs, threshold: thr, contentL, contentR, medianLineGap }
}

function mergeSmall(segs: SegmentOut[], minHeight: number): SegmentOut[] {
  if (!segs.length) return segs
  const out: SegmentOut[] = []
  for (const s of segs) {
    const prev = out[out.length - 1]
    if (prev && s.y1 - s.y0 < minHeight) {
      prev.y1 = s.y1
      continue
    }
    if (prev && prev.y1 - prev.y0 < minHeight) {
      prev.y1 = s.y1
      continue
    }
    out.push({ ...s })
  }
  return out
}

function splitByIndent(
  gray: Uint8Array,
  w: number,
  seg: SegmentOut,
  contentL: number,
  contentR: number,
  thr: number,
  isText: Uint8Array,
  medianLineGap: number,
): SegmentOut[] {
  const lineStarts: { y: number; x: number }[] = []
  for (let y = seg.y0; y < seg.y1; y++) {
    if (!isText[y]) continue
    if (y > seg.y0 && isText[y - 1]) continue
    let x = contentL
    while (x < contentR && gray[y * w + x] >= thr) x++
    if (x < contentR) lineStarts.push({ y, x })
  }
  if (lineStarts.length < 4) return [seg]

  const xs = lineStarts.map((l) => l.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  if (maxX - minX < 24) return [seg]

  // 2 均值聚类
  let c0 = minX
  let c1 = maxX
  let assign: number[] = []
  for (let iter = 0; iter < 6; iter++) {
    assign = xs.map((x) => (Math.abs(x - c0) <= Math.abs(x - c1) ? 0 : 1))
    const g0 = xs.filter((_, i) => assign[i] === 0)
    const g1 = xs.filter((_, i) => assign[i] === 1)
    if (!g0.length || !g1.length) return [seg]
    c0 = g0.reduce((a, b) => a + b, 0) / g0.length
    c1 = g1.reduce((a, b) => a + b, 0) / g1.length
  }
  if (c1 - c0 < 22) return [seg]
  const countSmall = assign.filter((a) => a === 0).length
  if (countSmall < 2 || lineStarts.length - countSmall < 2) return [seg]

  const thresholdX = c0 + (c1 - c0) * 0.35
  const cuts: number[] = []
  for (let i = 2; i < lineStarts.length; i++) {
    const cur = lineStarts[i]
    const prev = lineStarts[i - 1]
    if (assign[i] !== 0) continue
    if (prev.x < c0 + (c1 - c0) * 0.6) continue
    if (cur.y - prev.y < Math.max(6, medianLineGap * 0.55)) continue
    if (cur.x > thresholdX) continue
    cuts.push(cur.y - 2)
  }
  if (!cuts.length || cuts.length > 24) return [seg]

  const out: SegmentOut[] = []
  let start = seg.y0
  for (const c of cuts.sort((a, b) => a - b)) {
    if (c - start < 18) continue
    out.push({ y0: start, y1: c, conf: 'low', role: 'stem' })
    start = c
  }
  out.push({ y0: start, y1: seg.y1, conf: 'low', role: 'stem' })
  return out.length > 1 ? out : [seg]
}
