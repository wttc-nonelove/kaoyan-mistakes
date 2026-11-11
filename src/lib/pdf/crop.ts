export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片导出失败'))),
      type,
      quality,
    )
  })
}

export function scaleCanvas(src: HTMLCanvasElement, maxLongEdge: number): HTMLCanvasElement {
  const longEdge = Math.max(src.width, src.height)
  if (longEdge <= maxLongEdge) return src
  const r = maxLongEdge / longEdge
  const out = document.createElement('canvas')
  out.width = Math.round(src.width * r)
  out.height = Math.round(src.height * r)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

export interface CroppedImage {
  blob: Blob
  thumb: Blob
  w: number
  h: number
}

/**
 * 从已渲染的整页画布上裁一道题。
 * ratio = 整页画布与切题坐标系的比例；y0/y1 为切题坐标系里的像素。
 */
export async function cropFromPage(
  pageCanvas: HTMLCanvasElement,
  ratio: number,
  y0: number,
  y1: number,
  xRange?: { l: number; r: number },
  opts: { maxLongEdge?: number; thumbLongEdge?: number; quality?: number } = {},
): Promise<CroppedImage> {
  const pad = 6
  const sx = Math.max(0, Math.round((xRange ? xRange.l : 0) * ratio) - pad)
  const ex = Math.min(pageCanvas.width, Math.round((xRange ? xRange.r : pageCanvas.width / ratio) * ratio) + pad)
  const sy = Math.max(0, Math.round(y0 * ratio) - pad)
  const ey = Math.min(pageCanvas.height, Math.round(y1 * ratio) + pad)

  const w = Math.max(1, ex - sx)
  const h = Math.max(1, ey - sy)

  const cut = document.createElement('canvas')
  cut.width = w
  cut.height = h
  const ctx = cut.getContext('2d')
  if (!ctx) throw new Error('无法裁剪图片')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(pageCanvas, sx, sy, w, h, 0, 0, w, h)

  const main = scaleCanvas(cut, opts.maxLongEdge ?? 1600)
  const blob = await canvasToBlob(main, 'image/jpeg', opts.quality ?? 0.82)

  const thumbCanvas = scaleCanvas(cut, opts.thumbLongEdge ?? 420)
  const thumb = await canvasToBlob(thumbCanvas, 'image/jpeg', 0.7)

  return { blob, thumb, w: main.width, h: main.height }
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
