import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface TextSeg {
  page: number
  y0: number
  y1: number
  qno: number
  group: string
}

interface Line {
  y: number
  x: number
  text: string
}

const QNO_RE = /^\s*(\d{1,2})\s*[．.、]\s*/

/** 把一页的文字块按 y 聚成行 */
function toLines(items: { str: string; x: number; y: number }[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) <= 4) {
      last.text += it.str
    } else {
      lines.push({ y: it.y, x: it.x, text: it.str })
    }
  }
  return lines
}

export interface TextSegResult {
  segs: TextSeg[]
  /** 检测到的题号序列 */
  numbers: number[]
  pageCount: number
}

/**
 * 用 PDF 文字层里的题号定位切分点。
 * 比图像投影准得多，但要求 PDF 有可用文字层（扫描件通常没有）。
 */
export async function segmentDocByText(
  doc: PDFDocumentProxy,
  pageCount: number,
  scale: number,
): Promise<TextSegResult | null> {
  const starts: { page: number; y: number; qno: number }[] = []
  const pageHeights: Record<number, number> = {}
  const pageWidths: Record<number, number> = {}

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale })
    pageHeights[p] = viewport.height
    pageWidths[p] = viewport.width
    let items: { str: string; x: number; y: number }[] = []
    try {
      const tc = await page.getTextContent()
      items = tc.items
        .filter((i): i is typeof i & { str: string } => 'str' in i && typeof i.str === 'string')
        .map((i) => {
          const tr = (i as unknown as { transform: number[] }).transform
          const [vx, vy] = viewport.convertToViewportPoint(tr[4], tr[5])
          return { str: i.str, x: vx, y: vy }
        })
    } catch {
      return null
    }
    if (!items.length) return null

    const lines = toLines(items)
    for (const line of lines) {
      const m = QNO_RE.exec(line.text)
      if (!m) continue
      // 题号必须贴左边（防止正文里的编号被误判）
      if (line.x > viewport.width * 0.3) continue
      const qno = Number(m[1])
      if (qno < 1 || qno > 60) continue
      starts.push({ page: p, y: line.y, qno })
    }
    page.cleanup()
  }

  if (!starts.length) return null

  // 同一页里按 y 升序，去掉重复/回退的题号
  starts.sort((a, b) => (a.page === b.page ? a.y - b.y : a.page - b.page))
  const cleaned: typeof starts = []
  let lastQno = 0
  for (const s of starts) {
    if (s.qno <= lastQno) continue
    if (s.qno - lastQno > 3) continue // 跳号太多，多半是误判
    cleaned.push(s)
    lastQno = s.qno
  }
  if (cleaned.length < 5) return null

  const numbers = cleaned.map((s) => s.qno)
  if (numbers[0] !== 1) return null

  // 每个题号 → 一段（到下一个题号为止；跨页的续段挂到上一题）
  const segs: TextSeg[] = []
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i]
    const next = cleaned[i + 1]
    const pageBottom = pageHeights[cur.page]
    const y1 = next && next.page === cur.page ? next.y - 3 : pageBottom
    const group = `t_${cur.page}_${cur.qno}`
    segs.push({ page: cur.page, y0: Math.max(0, cur.y - 10), y1: Math.min(pageBottom, y1), qno: cur.qno, group })

    // 跨页：下一页顶部到下一个题号之间，补一段给这道题
    if (next && next.page === cur.page + 1) {
      const gapTop = 0
      const gapBottom = next.y - 10
      if (gapBottom - gapTop > pageHeights[next.page] * 0.08) {
        segs.push({ page: next.page, y0: gapTop, y1: gapBottom, qno: cur.qno, group })
      }
    }
  }

  return { segs, numbers, pageCount }
}
