import type { PDFDocumentProxy } from 'pdfjs-dist'
import { clearPageCache, renderPageCanvas } from './render'

/**
 * 用 OCR 找题号，再用题号的 y 坐标切线。
 *
 * 为什么只 OCR 左边距窄带、且把字符白名单锁成数字：
 * 我们要的只是"第几题从哪一行开始"，不需要认全文字。窄带面积小、干扰少，
 * 速度是整页 OCR 的三分之一左右，数字识别的准确率也高得多。
 *
 * 对数字版 PDF（比如 408）效果很好；对模糊扫描件会输出乱码，此时整体返回 null，
 * 由调用方回退到图像投影。
 */

const TJS = 'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'
const WORKER = 'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js'
const CORE = 'https://unpkg.com/tesseract.js-core@5.1.0/'
const LANG = 'https://tessdata.projectnaptha.com/4.0.0'

interface TessWorker {
  recognize: (img: HTMLCanvasElement) => Promise<{ data: Record<string, unknown> }>
  terminate: () => Promise<unknown>
}

interface TessApi {
  createWorker: (lang: string, oem?: number, opts?: Record<string, unknown>) => Promise<TessWorker>
}

let tessPromise: Promise<TessApi> | null = null

function loadTess(): Promise<TessApi> {
  if (tessPromise) return tessPromise
  tessPromise = (async () => {
    if (!(window as unknown as { Tesseract?: TessApi }).Tesseract) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script')
        s.src = TJS
        s.onload = () => res()
        s.onerror = () => rej(new Error('OCR 引擎加载失败'))
        document.head.appendChild(s)
      })
    }
    return (window as unknown as { Tesseract: TessApi }).Tesseract
  })()
  return tessPromise
}

export interface OcrSeg {
  page: number
  y0: number
  y1: number
  qno: number
}

export interface OcrSegResult {
  segs: OcrSeg[]
  numbers: number[]
}

/** 题号形如 01. / 1．/ （3） */
const QNO_PATTERNS = [/^(\d{1,2})[．.、]/, /^[(（](\d{1,2})[)）]/]

function matchQno(raw: string): number | null {
  const t = raw.replace(/[\s\u00a0\u3000]+/g, '')
  for (const re of QNO_PATTERNS) {
    const m = re.exec(t)
    if (m) {
      const n = Number(m[1])
      if (n >= 1 && n <= 60) return n
    }
  }
  return null
}

export async function segmentDocByOcr(
  doc: PDFDocumentProxy,
  pageCount: number,
  scale: number,
  expected: number,
): Promise<OcrSegResult | null> {
  let worker: TessWorker | null = null
  try {
    const T = await loadTess()
    worker = await T.createWorker('eng', 1, {
      workerPath: WORKER,
      corePath: CORE,
      langPath: LANG,
      tessedit_char_whitelist: '0123456789.．、()（）',
      tessedit_pageseg_mode: '6',
      logger: () => {},
    })

    const starts: { page: number; y: number; qno: number }[] = []
    const pageHeights: Record<number, number> = {}

    for (let p = 1; p <= pageCount; p++) {
      const { canvas } = await renderPageCanvas(doc, p, scale)
      pageHeights[p] = canvas.height
      const stripW = Math.floor(canvas.width * 0.34)
      const strip = document.createElement('canvas')
      strip.width = Math.floor(stripW * 1.5)
      strip.height = Math.floor(canvas.height * 1.5)
      const ctx = strip.getContext('2d')
      if (!ctx) return null
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(canvas, 0, 0, stripW, canvas.height, 0, 0, strip.width, strip.height)

      const r = await worker.recognize(strip)
      const data = r.data as { lines?: unknown[]; blocks?: unknown[] }
      const lines: { bbox?: { y0?: number }; text?: string }[] = []
      const collect = (n: unknown) => {
        if (!n || typeof n !== 'object') return
        const o = n as Record<string, unknown>
        if (Array.isArray(o.lines)) lines.push(...(o.lines as { bbox?: { y0?: number }; text?: string }[]))
        if (Array.isArray(o.blocks)) (o.blocks as unknown[]).forEach(collect)
        if (Array.isArray(o.paragraphs)) (o.paragraphs as unknown[]).forEach(collect)
      }
      if (Array.isArray(data.lines)) lines.push(...(data.lines as { bbox?: { y0?: number }; text?: string }[]))
      else collect(data)

      for (const l of lines) {
        const qno = matchQno(l.text ?? '')
        if (qno === null) continue
        const y = Math.round((l.bbox?.y0 ?? 0) / 1.5)
        if (y < 8) continue
        starts.push({ page: p, y, qno })
      }
      clearPageCache()
      await new Promise((res) => setTimeout(res, 0))
    }

    if (!starts.length) return null

    starts.sort((a, b) => (a.page === b.page ? a.y - b.y : a.page - b.page))
    const clean: typeof starts = []
    let last = 0
    for (const s of starts) {
      if (s.qno <= last) continue
      if (s.qno - last > 3) continue
      clean.push(s)
      last = s.qno
    }
    if (clean.length < 5 || clean[0].qno !== 1) return null

    // 题量明显不对 → 不可信，交给回退方案
    if (clean.length < expected * 0.75 || clean.length > expected * 1.4) return null

    const segs: OcrSeg[] = []
    for (let i = 0; i < clean.length; i++) {
      const cur = clean[i]
      const next = clean[i + 1]
      const bottom = pageHeights[cur.page]
      const y0 = Math.max(0, cur.y - 14)
      const y1 = next && next.page === cur.page ? Math.max(y0 + 10, next.y - 14) : bottom
      segs.push({ page: cur.page, y0, y1, qno: cur.qno })
      // 跨页续段
      if (next && next.page === cur.page + 1) {
        const gapBottom = Math.max(0, next.y - 14)
        if (gapBottom > pageHeights[next.page] * 0.08) {
          segs.push({ page: next.page, y0: 0, y1: gapBottom, qno: cur.qno })
        }
      }
    }

    return { segs, numbers: clean.map((s) => s.qno) }
  } catch {
    return null
  } finally {
    if (worker) worker.terminate().catch(() => {})
  }
}
