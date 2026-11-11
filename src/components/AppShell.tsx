import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { navigate, useRoute } from '../hooks'
import { cloud, isDemoMode } from '../lib/cloud'
import { useToast } from './Toast'

interface NavItem {
  path: string
  label: string
  icon: IconName
  tab?: boolean
}

const NAV: NavItem[] = [
  { path: '/', label: '今日', icon: 'home', tab: true },
  { path: '/quick', label: '秒标记', icon: 'spark' },
  { path: '/papers', label: '试卷库', icon: 'layers', tab: true },
  { path: '/import', label: '批量导入', icon: 'upload' },
  { path: '/mistakes', label: '错题本', icon: 'book', tab: true },
  { path: '/review', label: '复习', icon: 'clock', tab: true },
  { path: '/stats', label: '统计', icon: 'chart' },
  { path: '/settings', label: '我的', icon: 'settings', tab: true },
]

export function maskPhone(phone?: string): string {
  if (!phone) return '已登录'
  const digits = phone.replace(/\D/g, '').slice(-11)
  if (digits.length !== 11) return phone
  return `${digits.slice(0, 3)}****${digits.slice(7)}`
}

export function AppShell({
  children,
  dueCount,
  phone,
}: {
  children: ReactNode
  dueCount: number
  phone?: string
}) {
  const route = useRoute()
  const toast = useToast()
  const current = '/' + (route.parts[0] ?? '')
  const isActive = (p: string) => (p === '/' ? route.parts.length === 0 : current === p)

  async function signOut() {
    const res = await cloud.auth.signOut()
    if (res.error) toast(res.error.message, 'error')
  }

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">题</div>
          <div>
            <div className="brand-name">错题集</div>
            <div className="brand-sub">数二 · 408</div>
          </div>
        </div>

        {NAV.map((item, i) => (
          <div key={item.path}>
            {i === 3 ? <div className="nav-sep" /> : null}
            <a
              className={`nav-item${isActive(item.path) ? ' is-active' : ''}`}
              href={`#${item.path}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(item.path)
              }}
            >
              <Icon name={item.icon} className="ico" />
              {item.label}
              {item.path === '/review' && dueCount > 0 ? (
                <span className="badge">{dueCount > 99 ? '99+' : dueCount}</span>
              ) : null}
            </a>
          </div>
        ))}

        <div className="sidebar-foot">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <Icon name="flag" size={13} />
            <span>{maskPhone(phone)}</span>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ paddingLeft: 0 }} onClick={() => void signOut()}>
            退出登录
          </button>
        </div>
      </aside>

      <main className="main">
        {isDemoMode ? (
          <div className="demo-bar no-print">
            <b>演示模式</b>
            <span>数据只存在这台浏览器里，不联网。想真正用起来，请看 README 的「自己部署」一节。</span>
          </div>
        ) : null}
        {children}
      </main>

      <nav className="tabbar no-print">
        {NAV.filter((n) => n.tab).map((item) => (
          <a
            key={item.path}
            className={isActive(item.path) ? 'is-active' : ''}
            href={`#${item.path}`}
            onClick={(e) => {
              e.preventDefault()
              navigate(item.path)
            }}
          >
            <Icon name={item.icon} className="ico" />
            {item.label}
            {item.path === '/review' && dueCount > 0 ? (
              <span className="badge">{dueCount > 99 ? '99+' : dueCount}</span>
            ) : null}
          </a>
        ))}
      </nav>
    </div>
  )
}
