import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type Tone = 'default' | 'ok' | 'error'
interface ToastItem {
  id: number
  text: string
  tone: Tone
}

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const push = useCallback((text: string, tone: Tone = 'default') => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, text, tone }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, tone === 'error' ? 4200 : 2400)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-wrap no-print">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'error' ? ' is-error' : t.tone === 'ok' ? ' is-ok' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
