import { computeStats, queryMistakes } from '../lib/repo'
import { SUBJECT_LABEL } from '../lib/tags'
import { navigate, useAsync, useDataVersion } from '../hooks'
import { Empty, Loading } from '../components/ui'
import { Icon } from '../components/Icon'

function Bars({ data, empty }: { data: { label: string; count: number }[]; empty: string }) {
  if (!data.length) return <div className="tiny muted">{empty}</div>
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div>
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="truncate" title={d.label}>
            {d.label}
          </span>
          <span className="bar-track">
            <i style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="bar-num">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

export function StatsPage() {
  const version = useDataVersion()
  const stats = useAsync(() => computeStats(), [version])
  const stubborn = useAsync(() => queryMistakes({ sort: 'lapses' }).then((r) => r.slice(0, 6)), [version])

  if (stats.loading) return <Loading />
  const s = stats.data

  if (!s || s.total === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>统计</h1>
            <div className="page-sub">错得最多的地方，就是该补的地方</div>
          </div>
        </div>
        <Empty
          icon="chart"
          title="还没有数据"
          desc="标记几道错题、做几轮复习后，这里会显示薄弱知识点分布。"
          action={
            <button className="btn btn-primary" onClick={() => navigate('/quick')}>
              去标记错题
            </button>
          }
        />
      </div>
    )
  }

  const rate = s.total ? Math.round(((s.byMastery[2] ?? 0) / s.total) * 100) : 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>统计</h1>
          <div className="page-sub">共 {s.total} 道错题 · 掌握率 {rate}%</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/export')}>
            <Icon name="download" size={14} /> 导出薄弱项
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-num">{s.total}</div>
          <div className="kpi-label">错题总数</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.dueToday}</div>
          <div className="kpi-label">今天到期</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.graduated}</div>
          <div className="kpi-label">已毕业</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.last30Days}</div>
          <div className="kpi-label">近 30 天复习</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card">
          <div className="card-head">
            <h2>薄弱知识点</h2>
            <span className="tiny muted">Top 12</span>
          </div>
          <div className="card-pad">
            <Bars data={s.byTag.map((t) => ({ label: t.tag, count: t.count }))} empty="给错题打上知识点标签后才有数据" />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>错误原因</h2>
          </div>
          <div className="card-pad">
            <Bars data={s.byReason.map((t) => ({ label: t.tag, count: t.count }))} empty="标记错因后才有数据" />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>年份分布</h2>
          </div>
          <div className="card-pad">
            <Bars
              data={s.byYear.map((y) => ({ label: String(y.year), count: y.count }))}
              empty="还没有数据"
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>掌握程度</h2>
          </div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            {[
              { label: '未掌握', value: s.byMastery[0], color: 'var(--danger)' },
              { label: '复习中', value: s.byMastery[1], color: 'var(--warn)' },
              { label: '已掌握', value: s.byMastery[2], color: 'var(--brand)' },
            ].map((row) => (
              <div key={row.label}>
                <div className="row-between" style={{ marginBottom: 5 }}>
                  <span className="small">{row.label}</span>
                  <span className="mono tiny muted">
                    {row.value} · {Math.round((row.value / Math.max(1, s.total)) * 100)}%
                  </span>
                </div>
                <div className="bar-track" style={{ height: 9 }}>
                  <i style={{ width: `${(row.value / Math.max(1, s.total)) * 100}%`, background: row.color }} />
                </div>
              </div>
            ))}
            <div className="row-between tiny muted" style={{ paddingTop: 6 }}>
              <span>
                数二 {s.bySubject.math2} 道 · 408 {s.bySubject.cs408} 道
              </span>
            </div>
          </div>
        </div>
      </div>

      {stubborn.data?.length ? (
        <>
          <div className="section-title">最顽固的几道</div>
          <div className="card card-pad">
            {stubborn.data.map((row) => (
              <div className="meta-row" key={row.mistake.id}>
                <span className="meta-key" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                  {row.mistake.lapses} 次
                </span>
                <span className="meta-val small">
                  <button className="btn-ghost" style={{ padding: 0 }} onClick={() => navigate(`/mistakes/${row.mistake.id}`)}>
                    {row.mistake.year} {SUBJECT_LABEL[row.mistake.subject]} · 第 {row.mistake.qno} 题 →
                  </button>
                  {row.mistake.knowledgeTags.length ? (
                    <span className="muted"> {row.mistake.knowledgeTags.join(' · ')}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
