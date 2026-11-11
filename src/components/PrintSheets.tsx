import { useMemo } from 'react'
import {
  CONTENT_W,
  PAGE,
  layoutCards,
  type Block,
  type ExportCard,
  type ExportOptions,
} from '../lib/export/layout'

interface Props {
  cards: ExportCard[]
  opts: ExportOptions
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'head':
      return (
        <div className="p-head" style={{ height: `${block.h}mm` }}>
          <span className="p-head-title">{block.text}</span>
          <span className="p-head-meta">{block.meta}</span>
        </div>
      )
    case 'section':
      return (
        <div className="p-section" style={{ height: `${block.h}mm` }}>
          {block.text}
        </div>
      )
    case 'img':
      return (
        <div className="p-slice" style={{ height: `${block.h}mm` }}>
          <img src={block.url} alt="" style={{ marginTop: `${-block.offset}mm`, width: `${block.w}mm` }} />
        </div>
      )
    case 'space':
      return (
        <div className="p-space" style={{ height: `${block.h}mm` }}>
          {block.label ? <span>{block.label}</span> : null}
        </div>
      )
    case 'text':
      return (
        <div
          className={`p-text${block.strong ? ' is-strong' : ''}${block.muted ? ' is-muted' : ''}`}
          style={{ height: `${block.h}mm`, fontSize: `${block.size}pt`, lineHeight: '5.6mm' }}
        >
          {block.lines.map((line, i) => (
            <div key={i}>{line || '\u00a0'}</div>
          ))}
        </div>
      )
    case 'gap':
      return <div style={{ height: `${block.h}mm` }} />
    default:
      return null
  }
}

export function PrintSheets({ cards, opts }: Props) {
  const pages = useMemo(() => layoutCards(cards, opts), [cards, opts])

  return (
    <>
      {pages.map((page, idx) => (
        <div
          className="a4-page"
          key={idx}
          style={{
            width: `${PAGE.w}mm`,
            height: `${PAGE.h}mm`,
            padding: `${PAGE.mt}mm ${PAGE.mr}mm ${PAGE.mb}mm ${PAGE.ml}mm`,
          }}
        >
          {page.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
          <div className="p-footer">
            {idx + 1} / {pages.length}
          </div>
        </div>
      ))}
    </>
  )
}
