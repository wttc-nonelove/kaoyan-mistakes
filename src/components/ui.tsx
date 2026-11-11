import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useBlobUrl } from '../hooks'

/* ---------------- 弹层 ---------------- */

interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Sheet({ open, title, onClose, children, footer, width }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="overlay no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ---------------- 空态 / 加载 ---------------- */

export function Empty({
  title,
  desc,
  action,
  icon = 'image',
}: {
  title: string
  desc?: string
  action?: ReactNode
  icon?: React.ComponentProps<typeof Icon>['name']
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} />
      <div className="empty-title">{title}</div>
      {desc ? <div className="empty-desc">{desc}</div> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  )
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="empty">
      <div className="spinner" />
      <div className="empty-desc">{text}</div>
    </div>
  )
}

/* ---------------- 图片（自动取 blob URL + 点击放大） ---------------- */

interface ImageBoxProps {
  path?: string | null
  alt?: string
  className?: string
  zoomable?: boolean
  ratio?: number
  contain?: boolean
}

export function ImageBox({ path, alt = '', className, zoomable = true, ratio, contain }: ImageBoxProps) {
  const url = useBlobUrl(path)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className={`imgbox${zoomable && url ? ' imgbox-zoom' : ''} ${className ?? ''}`}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        onClick={() => zoomable && url && setOpen(true)}
      >
        {url ? (
          <img src={url} alt={alt} style={contain ? { objectFit: 'contain', height: '100%' } : undefined} />
        ) : (
          <div className="skeleton" style={{ width: '100%', height: '100%', minHeight: ratio ? undefined : 80 }} />
        )}
      </div>
      {open && url ? (
        <div className="lightbox no-print" onClick={() => setOpen(false)}>
          <button className="lightbox-close" onClick={() => setOpen(false)} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
          <img src={url} alt={alt} />
        </div>
      ) : null}
    </>
  )
}

/* ---------------- 掌握度点 ---------------- */

export function MasteryDots({ level }: { level: number }) {
  return (
    <span className={`mastery-dots lv${level}`} title={['未掌握', '复习中', '已掌握'][level] ?? ''}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i <= level ? 'on' : ''} />
      ))}
    </span>
  )
}

/* ---------------- 确认对话框 ---------------- */

export function ConfirmSheet({
  open,
  title,
  desc,
  okText = '确认',
  danger,
  onOk,
  onClose,
}: {
  open: boolean
  title: string
  desc: ReactNode
  okText?: string
  danger?: boolean
  onOk: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onOk}>
            {okText}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>{desc}</div>
    </Sheet>
  )
}
