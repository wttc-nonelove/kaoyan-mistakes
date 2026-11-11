import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { countDue } from './lib/repo'
import { navigate, useAsync, useAuth, useDataVersion, useRoute } from './hooks'
import { TodayPage } from './pages/TodayPage'
import { QuickMarkPage } from './pages/QuickMarkPage'
import { PapersPage } from './pages/PapersPage'
import { ImportPage } from './pages/ImportPage'
import { PaperDetailPage } from './pages/PaperDetailPage'
import { CutEditorPage } from './pages/CutEditorPage'
import { MistakesPage } from './pages/MistakesPage'
import { MistakeDetailPage } from './pages/MistakeDetailPage'
import { ReviewPage } from './pages/ReviewPage'
import { ExportPage } from './pages/ExportPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { Empty } from './components/ui'

function Router() {
  const route = useRoute()
  const [p0, p1, p2] = route.parts

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route.path])

  if (!p0) return <TodayPage />
  if (p0 === 'quick') return <QuickMarkPage />
  if (p0 === 'import') return <ImportPage />
  if (p0 === 'papers') {
    if (!p1) return <PapersPage />
    if (p2 === 'cut') return <CutEditorPage paperId={p1} />
    return <PaperDetailPage paperId={p1} />
  }
  if (p0 === 'mistakes') return p1 ? <MistakeDetailPage mistakeId={p1} /> : <MistakesPage />
  if (p0 === 'review') return <ReviewPage />
  if (p0 === 'export') return <ExportPage />
  if (p0 === 'stats') return <StatsPage />
  if (p0 === 'settings') return <SettingsPage />

  return (
    <div className="page">
      <Empty
        title="页面不存在"
        desc="链接可能不对，回首页看看吧。"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            回今日
          </button>
        }
      />
    </div>
  )
}

function Shell({ phone }: { phone?: string }) {
  const version = useDataVersion()
  const due = useAsync(() => countDue(), [version])

  return (
    <AppShell dueCount={due.data ?? 0} phone={phone}>
      <Router />
    </AppShell>
  )
}

export default function App() {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div className="auth-boot">
        <div className="spinner" />
        正在连接云端…
      </div>
    )
  }

  if (!auth.user) {
    return (
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <Shell phone={auth.user.phone} />
    </ToastProvider>
  )
}
