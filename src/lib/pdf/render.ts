import type { PdfDoc } from './loader'

export interface RenderedPage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

const canvasPool = new Map<string, RenderedPage>()

export async function renderPageCanvas(
  doc: PdfDoc,
  pageNo: number,
  scale: number,
): Promise<RenderedPage> {
  const key = `${doc.fingerprints?.[0] ?? 'doc'}:${pageNo}:${scale}`
  const hit = canvasPool.get(key)
  if (hit) return hit

  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()

  const out: RenderedPage = { canvas, width: canvas.width, height: canvas.height }
  canvasPool.set(key, out)
  if (canvasPool.size > 6) {
    const first = canvasPool.keys().next().value
    if (first) {
      const rec = canvasPool.get(first)
      if (rec) {
        rec.canvas.width = 0
        rec.canvas.height = 0
      }
      canvasPool.delete(first)
    }
  }
  return out
}

export function clearPageCache() {
  for (const rec of canvasPool.values()) {
    rec.canvas.width = 0
    rec.canvas.height = 0
  }
  canvasPool.clear()
}

export interface GrayImage {
  gray: Uint8Array
  w: number
  h: number
}

export function toGray(canvas: HTMLCanvasElement): GrayImage {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法读取画布')
  const { width: w, height: h } = canvas
  const data = ctx.getImageData(0, 0, w, h).data
  const gray = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }
  return { gray, w, h }
}

/** 把画布缩到指定宽度，用于缩略图 */
export function makeThumbCanvas(canvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxWidth / canvas.width)
  if (ratio >= 1) return canvas
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * ratio)
  out.height = Math.round(canvas.height * ratio)
  const ctx = out.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}
