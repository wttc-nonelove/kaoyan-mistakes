import { jsPDF } from 'jspdf'
import {
  PAGE,
  CONTENT_H,
  CONTENT_W,
  layoutCards,
  type Block,
  type ExportCard,
  type ExportOptions,
} from './layout'

const FONT_STACK = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif'

export const DPI_DESKTOP = 200
export const DPI_HIGH = 300

interface LoadedImages {
  [url: string]: HTMLImageElement
}

async function loadImages(urls: string[]): Promise<LoadedImages> {
  const unique = [...new Set(urls)]
  const out: LoadedImages = {}
  await Promise.all(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            out[url] = img
            resolve()
          }
          img.onerror = () => resolve()
          img.src = url
        }),
    ),
  )
  return out
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: Block,
  y: number,
  pxPerMm: number,
  dpi: number,
  images: LoadedImages,
) {
  const left = PAGE.ml * pxPerMm
  const width = CONTENT_W * pxPerMm
  const h = block.h * pxPerMm

  switch (block.kind) {
    case 'head': {
      ctx.fillStyle = '#1e231f'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `600 ${(9.5 * dpi) / 72}px ${FONT_STACK}`
      ctx.textAlign = 'left'
      ctx.fillText(block.text, left, y + h * 0.62)
      if (block.meta) {
        ctx.font = `400 ${(7.6 * dpi) / 72}px ${FONT_STACK}`
        ctx.fillStyle = '#8d938b'
        ctx.textAlign = 'right'
        ctx.fillText(block.meta, left + width, y + h * 0.62)
      }
      ctx.strokeStyle = '#dcd8ce'
      ctx.lineWidth = Math.max(1, dpi / 260)
      ctx.beginPath()
      ctx.moveTo(left, y + h - 1)
      ctx.lineTo(left + width, y + h - 1)
      ctx.stroke()
      break
    }
    case 'section': {
      ctx.fillStyle = '#24544a'
      ctx.textAlign = 'left'
      ctx.font = `700 ${(15 * dpi) / 72}px ${FONT_STACK}`
      ctx.fillText(block.text, left, y + h * 0.72)
      break
    }
    case 'img': {
      const img = images[block.url]
      if (!img) break
      const destW = block.w * pxPerMm
      const destH = h
      const scale = img.naturalHeight / Math.max(1, block.fullH)
      const sy = block.offset * scale
      const sh = Math.max(1, block.h * scale)
      ctx.drawImage(img, 0, sy, img.naturalWidth, Math.min(sh, img.naturalHeight - sy), left, y, destW, destH)
      break
    }
    case 'space': {
      ctx.setLineDash([Math.max(2, dpi / 90), Math.max(2, dpi / 90)])
      ctx.strokeStyle = '#d9d5ca'
      ctx.lineWidth = Math.max(1, dpi / 300)
      roundRect(ctx, left, y + 1, width, h - 2, 4 * pxPerMm)
      ctx.stroke()
      ctx.setLineDash([])
      if (block.label) {
        ctx.fillStyle = '#c3beb2'
        ctx.font = `400 ${(7 * dpi) / 72}px ${FONT_STACK}`
        ctx.textAlign = 'left'
        ctx.fillText(block.label, left + 2 * pxPerMm, y + 5 * pxPerMm)
      }
      break
    }
    case 'text': {
      const lineH = (5.6 * pxPerMm)
      ctx.textAlign = 'left'
      ctx.font = `${block.strong ? 600 : 400} ${(block.size * dpi) / 72}px ${FONT_STACK}`
      ctx.fillStyle = block.muted ? '#7b817a' : '#2a2f2b'
      block.lines.forEach((line, i) => {
        ctx.fillText(line, left, y + lineH * (i + 0.78))
      })
      break
    }
    case 'gap':
      break
  }
}

export interface ComposeOptions extends ExportOptions {
  dpi?: number
  onProgress?: (done: number, total: number) => void
}

export async function composePdf(cards: ExportCard[], opts: ComposeOptions): Promise<Blob> {
  if (!cards.length) throw new Error('没有可导出的题目')
  const dpi = opts.dpi ?? DPI_DESKTOP
  const pxPerMm = dpi / 25.4
  const pages = layoutCards(cards, opts)
  const urls = pages.flatMap((p) =>
    p.blocks.filter((b): b is Extract<Block, { kind: 'img' }> => b.kind === 'img').map((b) => b.url),
  )
  const images = await loadImages(urls)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(PAGE.w * pxPerMm)
  canvas.height = Math.round(PAGE.h * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  for (let i = 0; i < pages.length; i++) {
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    let y = PAGE.mt * pxPerMm
    for (const block of pages[i].blocks) {
      drawBlock(ctx, block, y, pxPerMm, dpi, images)
      y += block.h * pxPerMm
    }
    // 页脚
    ctx.fillStyle = '#a9aea6'
    ctx.font = `400 ${(8 * dpi) / 72}px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.fillText(`${i + 1} / ${pages.length}`, canvas.width / 2, canvas.height - (PAGE.mb / 2) * pxPerMm)
    ctx.restore()

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    if (i > 0) doc.addPage()
    doc.addImage(dataUrl, 'JPEG', 0, 0, PAGE.w, PAGE.h, undefined, 'FAST')
    opts.onProgress?.(i + 1, pages.length)
    // 让出主线程，避免移动端 ANR
    await new Promise((r) => setTimeout(r, 0))
  }

  return doc.output('blob')
}

export function pageCount(cards: ExportCard[], opts: ExportOptions): number {
  return layoutCards(cards, opts).length
}

export { CONTENT_H, CONTENT_W, PAGE }
