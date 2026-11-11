import { computeStats, listPapers, queryMistakes } from '../lib/repo'
import { navigate, useAsync, useDataVersion } from '../hooks'
import { SUBJECT_LABEL, SUBJECTS } from '../lib/tags'
import { MistakeRow } from '../components/MistakeRow'
import { Empty, Loading } from '../components/ui'
import { Icon } from '../components/Icon'

export function TodayPage() {
  const version = useDataVersion()
  const stats = useAsync(() => computeStats(), [version])
  const recent = useAsync(() => queryMistakes({ sort: 'newest' }).then((r) => r.slice(0, 4)), [version])
  const papers = useAsync(() => listPapers(), [version])

  const s = stats.data
  const due = s?.dueToday ?? 0

  return (
    <div className="page">
      <div className="mobile-head">
        <div>
          <div className="brand-name" style={{ fontSize: 17 }}>
            错题集
          </div>
          <div className="tiny muted">数二 · 408</div>
        </div>
        <button className="btn btn-sm" onClick={() => navigate('/quick')}>
          <Icon name="spark" size={14} /> 秒标记
        </button>
      </div>

      <div className="hero">
        <div className="hero-main">
          <div>
            <div className="hero-eyebrow">Today · 待复习</div>
            <div className="hero-count">
              {due}
              <small>题</small>
            </div>
          </div>
          <div className="hero-row">
            <button className="btn btn-primary" onClick={() => navigate('/review')} disabled={due === 0}>
              <Icon name="clock" size={15} />
              {due === 0 ? '今天没有到期的题' : '开始复习'}
            </button>
            <button className="btn" onClick={() => navigate('/quick')}>
              <Icon name="plus" size={15} /> 记一道新错题
            </button>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-num">{s?.total ?? '—'}</div>
            <div className="kpi-label">错题总数</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{s?.graduated ?? '—'}</div>
            <div className="kpi-label">已掌握</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{s?.last30Days ?? '—'}</div>
            <div className="kpi-label">近 30 天复习次数</div>
          </div>
          <div className="kpi">
            <div className="kpi-num">{papers.data?.filter((p) => p.status === 'ready').length ?? '—'}</div>
            <div className="kpi-label">已入库试卷</div>
          </div>
        </div>
      </div>

      <div className="section-title">按科目</div>
      <div className="paper-grid">
        {SUBJECTS.map((sub) => {
          const count = s?.bySubject[sub.id] ?? 0
          return (
            <button
              key={sub.id}
              className="paper-card"
              style={{ textAlign: 'left' }}
              onClick={() => navigate(`/mistakes?subject=${sub.id}`)}
            >
              <div className="row-between">
                <span className="paper-year" style={{ fontSize: 20 }}>
                  {sub.label}
                </span>
                <span className="badge badge-brand">{count} 题</span>
              </div>
              <div className="paper-meta">{sub.desc}</div>
              <div className="progress">
                <i style={{ width: s?.total ? `${(count / Math.max(1, s.total)) * 100}%` : '0%' }} />
              </div>
            </button>
          )
        })}
        <button className="paper-card" style={{ textAlign: 'left' }} onClick={() => navigate('/papers')}>
          <div className="row-between">
            <span className="paper-year" style={{ fontSize: 20 }}>
              上传真题
            </span>
            <Icon name="upload" size={17} />
          </div>
          <div className="paper-meta">扫描版 PDF → 自动切题 → 建库</div>
          <div className="progress">
            <i style={{ width: '0%' }} />
          </div>
        </button>
      </div>

      <div className="section-title">最近记录</div>
      {recent.loading ? (
        <Loading />
      ) : recent.data?.length ? (
        <div className="mistake-list">
          {recent.data.map((row) => (
            <MistakeRow key={row.mistake.id} row={row} onClick={() => navigate(`/mistakes/${row.mistake.id}`)} />
          ))}
        </div>
      ) : (
        <Empty
          title="还没有错题"
          desc="先上传一套真题并切题建库，之后标记错题只需选「年份 + 题号」。"
          icon="spark"
          action={
            <button className="btn btn-primary" onClick={() => navigate('/papers')}>
              去上传真题
            </button>
          }
        />
      )}

      {s && s.total > 0 ? (
        <>
          <div className="section-title">薄弱知识点</div>
          <div className="card card-pad stack">
            {s.byTag.slice(0, 5).map((t) => (
              <div className="bar-row" key={t.tag}>
                <span className="truncate" title={t.tag}>
                  {t.tag}
                </span>
                <span className="bar-track">
                  <i style={{ width: `${(t.count / s.byTag[0].count) * 100}%` }} />
                </span>
                <span className="bar-num">{t.count}</span>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/stats')}>
              查看完整统计 →
            </button>
          </div>
        </>
      ) : null}

      {s && s.total === 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Icon name="spark" size={18} />
            <div className="small muted" style={{ lineHeight: 1.7 }}>
              使用顺序：<b>试卷库</b> 上传扫描版 PDF → 自动切题（3-5 分钟/卷）→ 之后在<b>秒标记</b>
              里选年份题号一键入库 → <b>复习</b>按艾宾浩斯排程巩固 → <b>错题本</b>筛选后导出打印版 PDF。
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
