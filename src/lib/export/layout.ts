import type { QType } from '../../types'

export interface ExportImage {
  url: string
  w: number
  h: number
}

export interface ExportCard {
  id: string
  title: string
  meta: string
  qtype: QType
  images: ExportImage[]
  answerImages: ExportImage[]
  answerText?: string
  analysisText?: string
  note?: string
  myAnswer?: string
}

export type AnswerSpace = 'none' | 'small' | 'medium' | 'large' | 'auto'

export interface ExportOptions {
  answerSpace: AnswerSpace
  includeAnswer: boolean
  includeNote: boolean
  showMeta: boolean
}

export type Block =
  | { kind: 'head'; h: number; text: string; meta: string; continued: boolean }
  | { kind: 'section'; h: number; text: string }
  | { kind: 'img'; h: number; w: number; url: string; fullH: number; offset: number }
  | { kind: 'space'; h: number; label: string }
  | { kind: 'text'; h: number; lines: string[]; size: number; strong?: boolean; muted?: boolean }
  | { kind: 'gap'; h: number }

export interface PageLayout {
  blocks: Block[]
  height: number
}

export const PAGE = { w: 210, h: 297, ml: 15, mr: 15, mt: 14, mb: 14 }

export const CONTENT_W = PAGE.w - PAGE.ml - PAGE.mr
export const CONTENT_H = PAGE.h - PAGE.mt - PAGE.mb

const HEAD_H = 7.6
const SECTION_H = 16
const GAP = 4.5
const TEXT_PT = 10.5
const TEXT_LINE_MM = 5.6
const CHARS_PER_LINE = 42
const MIN_SLICE = 16
/** 题目图按 200dpi 的实际尺寸排版，不放大 */
const IMG_DPI = 200
const PX_PER_MM = IMG_DPI / 25.4

/** 图片在版面上的宽度：不超过内容宽，也不超过它的原始宽度（避免糊） */
function imageWidthMm(img: { w: number; h: number }): number {
  const natural = img.w / PX_PER_MM
  return Math.max(CONTENT_W * 0.5, Math.min(CONTENT_W, natural))
}

function answerSpaceFor(opts: ExportOptions, qtype: QType): number {
  if (opts.answerSpace === 'none') return 0
  if (opts.answerSpace === 'small') return qtype === 'solution' ? 55 : 18
  if (opts.answerSpace === 'medium') return qtype === 'solution' ? 85 : 32
  if (opts.answerSpace === 'large') return qtype === 'solution' ? 120 : 50
  if (qtype === 'choice') return 0
  if (qtype === 'blank') return 22
  return 82
}

/** 按字符数折行（中文按字断行，英文按 0.55 权重估宽） */
export function wrapText(text: string, charsPerLine = CHARS_PER_LINE): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = ''
    let count = 0
    for (const ch of raw) {
      const weight = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55
      if (count + weight > charsPerLine && line) {
        out.push(line)
        line = ch
        count = weight
      } else {
        line += ch
        count += weight
      }
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

export function layoutCards(cards: ExportCard[], opts: ExportOptions): PageLayout[] {
  const pages: PageLayout[] = []
  let cur: PageLayout = { blocks: [], height: 0 }
  pages.push(cur)

  const flush = () => {
    cur = { blocks: [], height: 0 }
    pages.push(cur)
  }

  const push = (b: Block) => {
    if (cur.height + b.h > CONTENT_H + 0.01) flush()
    cur.blocks.push(b)
    cur.height += b.h
  }

  const pushHead = (card: ExportCard, continued: boolean) => {
    push({
      kind: 'head',
      h: HEAD_H,
      text: card.title,
      meta: continued ? '（续）' : opts.showMeta ? card.meta : '',
      continued,
    })
  }

  // ---------- 题目部分 ----------
  for (const card of cards) {
    if (cur.height + HEAD_H + MIN_SLICE > CONTENT_H + 0.01 && cur.blocks.length) flush()
    pushHead(card, false)

    for (const img of card.images) {
      const wMm = imageWidthMm(img)
      const fullH = (wMm * img.h) / img.w
      let offset = 0
      let guard = 0
      while (offset < fullH - 0.5 && guard++ < 60) {
        let avail = CONTENT_H - cur.height
        if (avail < MIN_SLICE) {
          flush()
          pushHead(card, true)
          avail = CONTENT_H - cur.height
        }
        const h = Math.min(avail, fullH - offset)
        push({ kind: 'img', h, w: wMm, url: img.url, fullH, offset })
        offset += h
      }
    }

    const space = answerSpaceFor(opts, card.qtype)
    let remain = space
    let guard = 0
    while (remain > 0.5 && guard++ < 30) {
      let avail = CONTENT_H - cur.height
      if (avail < 14) {
        flush()
        pushHead(card, true)
        avail = CONTENT_H - cur.height
      }
      const h = Math.min(avail, remain)
      push({ kind: 'space', h, label: remain === space ? '作答区' : '' })
      remain -= h
    }

    push({ kind: 'gap', h: GAP })
  }

  // ---------- 答案部分 ----------
  if (opts.includeAnswer) {
    const withAnswer = cards.filter(
      (c) => c.answerImages.length || c.answerText?.trim() || c.analysisText?.trim() || (opts.includeNote && c.note?.trim()),
    )
    if (withAnswer.length) {
      flush()
      push({ kind: 'section', h: SECTION_H, text: '答案与解析' })
      for (const card of withAnswer) {
        if (cur.height + HEAD_H + MIN_SLICE > CONTENT_H + 0.01 && cur.blocks.length) flush()
        pushHead(card, false)

        for (const img of card.answerImages) {
          const wMm = imageWidthMm(img)
      const fullH = (wMm * img.h) / img.w
          let offset = 0
          let guard = 0
          while (offset < fullH - 0.5 && guard++ < 60) {
            let avail = CONTENT_H - cur.height
            if (avail < MIN_SLICE) {
              flush()
              pushHead(card, true)
              avail = CONTENT_H - cur.height
            }
            const h = Math.min(avail, fullH - offset)
            push({ kind: 'img', h, w: wMm, url: img.url, fullH, offset })
            offset += h
          }
        }

        const addText = (text: string | undefined, strong = false, muted = false) => {
          if (!text?.trim()) return
          const lines = wrapText(text.trim())
          const perPage = Math.floor((CONTENT_H - HEAD_H - 6) / TEXT_LINE_MM)
          let start = 0
          while (start < lines.length) {
            const chunk = lines.slice(start, start + Math.max(4, perPage))
            if (cur.height + chunk.length * TEXT_LINE_MM > CONTENT_H) {
              flush()
              pushHead(card, true)
            }
            push({
              kind: 'text',
              h: chunk.length * TEXT_LINE_MM + 1.5,
              lines: chunk,
              size: TEXT_PT,
              strong,
              muted,
            })
            start += chunk.length
          }
        }

        addText(card.answerText, true)
        addText(card.analysisText)
        if (opts.includeNote) addText(card.note ? `我的笔记：${card.note}` : undefined, false, true)

        push({ kind: 'gap', h: GAP })
      }
    }
  }

  return pages.filter((p) => p.blocks.length > 0)
}
