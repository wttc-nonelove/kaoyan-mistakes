import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getObjectUrl, clearUrlCache } from '../lib/blobStore'
import { dataVersion, emit, subscribeData } from '../lib/repo'
import { cloud, setCurrentUserId } from '../lib/cloud'

/* ---------- 登录态 ---------- */

export interface SessionUser {
  id: string
  phone?: string
  name?: string
  avatarUrl?: string
}

export interface AuthState {
  loading: boolean
  user: SessionUser | null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, user: null })

  useEffect(() => {
    let alive = true
    cloud.auth
      .getSession()
      .then((res) => {
        if (!alive) return
        const user = (res.data?.user ?? null) as SessionUser | null
        setCurrentUserId(user?.id ?? null)
        setState({ loading: false, user })
        if (res.error) console.warn('读取登录态失败', res.error.message)
      })
      .catch(() => {
        if (alive) setState({ loading: false, user: null })
      })

    const unsub = cloud.auth.onAuthStateChange((_event, session) => {
      const user = (session?.user ?? null) as SessionUser | null
      setCurrentUserId(user?.id ?? null)
      clearUrlCache()
      setState({ loading: false, user })
      emit()
    })

    return () => {
      alive = false
      unsub()
    }
  }, [])

  return state
}

/* ---------- 路由 ---------- */

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

function parse(): Route {
  const raw = (window.location.hash || '#/').replace(/^#/, '') || '/'
  const qIdx = raw.indexOf('?')
  const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw
  const search = qIdx >= 0 ? raw.slice(qIdx + 1) : ''
  return {
    path: pathname,
    parts: pathname.split('/').filter(Boolean),
    query: new URLSearchParams(search),
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string) {
  if (window.location.hash === `#${to}`) return
  window.location.hash = to
}

/* ---------- 数据版本 ---------- */

export function useDataVersion(): number {
  return useSyncExternalStore(subscribeData, dataVersion, () => 0)
}

/* ---------- blob → objectURL ---------- */

export function useBlobUrl(key?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!key) {
      setUrl(null)
      return
    }
    getObjectUrl(key).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [key])
  return url
}

/* ---------- 异步数据 ---------- */

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  const loadedRef = useRef(false)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    // 已有数据时静默刷新，避免整页闪成 loading、丢失滚动位置
    if (!loadedRef.current) setLoading(true)
    fnRef
      .current()
      .then((d) => {
        if (alive) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) {
          loadedRef.current = true
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

/* ---------- 本地状态持久化 ---------- */

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 忽略配额错误 */
    }
  }, [key, value])
  return [value, setValue] as const
}
