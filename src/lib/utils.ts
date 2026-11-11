export function uid(prefix = ''): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}${t}${r}`
}

/** Asia/Shanghai 的今天，格式 YYYY-MM-DD */
export function todayStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = Date.UTC(y, m - 1, d)
  const next = new Date(base + days * 86400000)
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(next.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2])
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2])
  return Math.round((ta - tb) / 86400000)
}

export function formatDateCn(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export function relativeDayLabel(dateStr: string | null): string {
  if (!dateStr) return '已完成'
  const diff = daysBetween(dateStr, todayStr())
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff < 0) return `逾期 ${-diff} 天`
  if (diff <= 30) return `${diff} 天后`
  return dateStr.slice(5)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function bytesToText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function debounce<F extends (...args: never[]) => void>(fn: F, wait: number) {
  let timer: number | undefined
  const wrapped = (...args: Parameters<F>) => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
  wrapped.cancel = () => {
    if (timer) window.clearTimeout(timer)
  }
  return wrapped as F & { cancel: () => void }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function isWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent)
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** 一句话概括错误原因标签的颜色 */
export function subjectLabel(s: string): string {
  return s === 'math2' ? '数二' : s === 'cs408' ? '408' : s
}

export function qtypeLabel(t: string): string {
  switch (t) {
    case 'choice':
      return '选择'
    case 'blank':
      return '填空'
    case 'solution':
      return '解答'
    default:
      return '未分类'
  }
}
