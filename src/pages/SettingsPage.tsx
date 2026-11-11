import { useState } from 'react'
import { emit, listAllQuestions, listMistakes, listPapers, wipeAll } from '../lib/repo'
import { cloud } from '../lib/cloud'
import { useAsync, useAuth, useDataVersion, navigate } from '../hooks'
import { maskPhone } from '../components/AppShell'
import { ConfirmSheet } from '../components/ui'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

export function SettingsPage() {
  const version = useDataVersion()
  const auth = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const info = useAsync(async () => {
    const [papers, questions, mistakes] = await Promise.all([listPapers(), listAllQuestions(), listMistakes()])
    return { papers: papers.length, questions: questions.length, mistakes: mistakes.length }
  }, [version])

  const user = auth.user

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>我的</h1>
          <div className="page-sub">数据在云端，同一个手机号登录就能同步</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>账号</h2>
        </div>
        <div className="card-pad stack" style={{ gap: 12 }}>
          <div className="row-between">
            <div className="row" style={{ gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: 'var(--brand-weak)',
                  color: 'var(--brand-ink)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {user?.phone?.slice(-2) ?? '题'}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{maskPhone(user?.phone)}</div>
                <div className="tiny muted">手机号验证码登录</div>
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={async () => {
                const res = await cloud.auth.signOut()
                if (res.error) toast(res.error.message, 'error')
              }}
            >
              退出登录
            </button>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.8 }}>
            换手机或换电脑时，用同一个手机号登录即可看到全部错题；不需要手动同步。
          </div>
        </div>
      </div>

      <div className="section-title">数据概览</div>
      <div className="card">
        <div className="card-pad">
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <div className="kpi">
              <div className="kpi-num">{info.data?.papers ?? '—'}</div>
              <div className="kpi-label">试卷</div>
            </div>
            <div className="kpi">
              <div className="kpi-num">{info.data?.questions ?? '—'}</div>
              <div className="kpi-label">题目</div>
            </div>
            <div className="kpi">
              <div className="kpi-num">{info.data?.mistakes ?? '—'}</div>
              <div className="kpi-label">错题</div>
            </div>
          </div>
          <div className="tiny muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
            题目图片存放在云端私有存储里，只有你自己的账号能读取。
          </div>
        </div>
      </div>

      <div className="section-title">使用说明</div>
      <div className="card card-pad">
        <div className="small" style={{ lineHeight: 2 }}>
          <b>1. 建库</b>：试卷库 → 上传扫描版 PDF → 自动切题 → 拖动分割线微调 → 保存。
          <br />
          <b>2. 标记</b>：秒标记 → 科目 → 年份 → 点题号。或在试卷详情里批量选。
          <br />
          <b>3. 复习</b>：每天「复习」页会自动列出到期题，按忘记/模糊/掌握打分。
          <br />
          <b>4. 导出</b>：错题本筛选后 → 导出 → 打印或下载 PDF。
          <br />
          <b>提示</b>：手机上可以做标记、复习、导出；切题建议在电脑上做，屏幕大、拖线准。
        </div>
      </div>

      <div className="section-title">危险操作</div>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="small muted">
          清空后所有试卷、题目图片和错题都会从云端删除，手机和电脑上同时消失，且无法恢复。
        </div>
        <button
          className="btn btn-danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setConfirmClear(true)}
          disabled={!!busy}
        >
          <Icon name="trash" size={14} /> {busy || '清空全部数据'}
        </button>
      </div>

      {import.meta.env.DEV ? (
        <>
          <div className="section-title">开发者（仅本地可见）</div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="tiny muted">生成一套 3 页的模拟试卷，用来验证切题 / 标记 / 导出链路。</div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const { seedDemoPaper } = await import('../lib/devSeed')
                  const id = await seedDemoPaper()
                  toast('示例试卷已生成', 'ok')
                  navigate(`/papers/${id}/cut`)
                }}
              >
                生成示例试卷
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const { seedDemoMistakes } = await import('../lib/devSeed')
                  const n = await seedDemoMistakes()
                  toast(n ? `已生成 ${n} 道错题` : '先生成试卷并切题', n ? 'ok' : 'error')
                }}
              >
                生成示例错题
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const { makeSomeDue } = await import('../lib/devSeed')
                  const n = await makeSomeDue(3)
                  toast(n ? `已把 ${n} 道题设为今天到期` : '还没有错题', n ? 'ok' : 'error')
                }}
              >
                制造今天到期
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="tiny muted" style={{ textAlign: 'center', marginTop: 26, lineHeight: 1.8 }}>
        错题集 · 云端版 v1.0
        <br />
        数据库与图片存储均由 WorkBuddy 云服务托管
        <br />
        <button className="btn btn-sm btn-ghost" onClick={() => navigate('/')}>
          回到今日
        </button>
      </div>

      <ConfirmSheet
        open={confirmClear}
        title="清空全部数据？"
        danger
        okText="确定清空"
        desc="所有试卷、题目图片、错题和复习记录都会从云端删除，手机和电脑上同时消失，无法恢复。"
        onClose={() => setConfirmClear(false)}
        onOk={async () => {
          setConfirmClear(false)
          try {
            setBusy('正在清空…')
            await wipeAll((done, total) => setBusy(`正在清空 ${done}/${total}`))
            emit()
            toast('已清空', 'ok')
          } catch (e) {
            toast(e instanceof Error ? e.message : '清空失败', 'error')
          } finally {
            setBusy('')
          }
        }}
      />
    </div>
  )
}
