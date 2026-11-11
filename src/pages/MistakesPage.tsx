import { useMemo, useState } from 'react'
import { allKnowledgeTags, queryMistakes, type MistakeFilter } from '../lib/repo'
import { SUBJECTS, SUBJECT_LABEL } from '../lib/tags'
import { navigate, useAsync, useDataVersion, useRoute } from '../hooks'
import { MistakeRow } from '../components/MistakeRow'
import { Empty, Loading } from '../components/ui'
import { Icon } from '../components/Icon'

export function MistakesPage() {
  const version = useDataVersion()
  const route = useRoute()

  const initialSubject = (route.query.get('subject') as MistakeFilter['subject']) ?? 'all'
  const [subject, setSubject] = useState<MistakeFilter['subject']>(initialSubject)
  const [year, setYear] = useState<number | 'all'>('all')
  const [mastery, setMastery] = useState<MistakeFilter['mastery']>('all')
  const [due, setDue] = useState<MistakeFilter['due']>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<NonNullable<MistakeFilter['sort']>>('due')

  const filter: MistakeFilter = { subject, year, mastery, due, tag, keyword, sort }
  const rows = useAsync(() => queryMistakes(filter), [version, subject, year, mastery, due, tag, keyword, sort])
  const tags = useAsync(() => allKnowledgeTags(), [version])

  const years = useMemo(() => {
    const set = new Set((rows.data ?? []).map((r) => r.mistake.year))
    return [...set].sort((a, b) => b - a)
  }, [rows.data])

  const activeCount =
    (subject !== 'all' ? 1 : 0) +
    (year !== 'all' ? 1 : 0) +
    (mastery !== 'all' ? 1 : 0) +
    (due !== 'all' ? 1 : 0) +
    (tag ? 1 : 0) +
    (keyword ? 1 : 0)

  function exportNow() {
    const q = new URLSearchParams()
    if (subject && subject !== 'all') q.set('subject', subject)
    if (year !== 'all') q.set('year', String(year))
    if (tag) q.set('tag', tag)
    if (mastery !== 'all') q.set('mastery', String(mastery))
    navigate(`/export?${q.toString()}`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>错题本</h1>
          <div className="page-sub">
            {rows.data?.length ?? 0} 道题
            {activeCount ? `（已筛选 ${activeCount} 项）` : ''}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/quick')}>
            <Icon name="plus" size={14} /> 记一道
          </button>
          <button className="btn btn-primary" onClick={exportNow} disabled={!rows.data?.length}>
            <Icon name="download" size={14} /> 导出
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <span className="search-wrap">
          <Icon name="search" size={14} />
          <input
            className="input"
            placeholder="搜题号 / 知识点 / 笔记"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </span>

        <select className="select" value={String(subject)} onChange={(e) => setSubject(e.target.value as MistakeFilter['subject'])}>
          <option value="all">全部科目</option>
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select className="select" value={String(year)} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">全部年份</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select className="select" value={String(mastery)} onChange={(e) => setMastery(e.target.value as MistakeFilter['mastery'])}>
          <option value="all">掌握度</option>
          <option value="0">未掌握</option>
          <option value="1">复习中</option>
          <option value="2">已掌握</option>
        </select>

        <select className="select" value={String(due)} onChange={(e) => setDue(e.target.value as MistakeFilter['due'])}>
          <option value="all">全部</option>
          <option value="due">今天到期</option>
          <option value="upcoming">未到期</option>
          <option value="graduated">已毕业</option>
        </select>

        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="due">按到期排序</option>
          <option value="newest">按加入时间</option>
          <option value="year">按年份题号</option>
          <option value="lapses">按错误次数</option>
        </select>
      </div>

      {(tags.data ?? []).length ? (
        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
          <span className="tiny muted" style={{ marginRight: 2 }}>
            知识点
          </span>
          {tags.data!.slice(0, 10).map((t) => (
            <button
              key={t.tag}
              className={`chip${tag === t.tag ? ' is-on' : ''}`}
              style={{ height: 26, fontSize: 11.5 }}
              onClick={() => setTag(tag === t.tag ? null : t.tag)}
            >
              {t.tag} <span className="muted">{t.count}</span>
            </button>
          ))}
          {tag ? (
            <button className="btn btn-sm btn-ghost" onClick={() => setTag(null)}>
              清除
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.loading ? (
        <Loading />
      ) : rows.data?.length ? (
        <div className="mistake-list">
          {rows.data.map((row) => (
            <MistakeRow key={row.mistake.id} row={row} onClick={() => navigate(`/mistakes/${row.mistake.id}`)} />
          ))}
        </div>
      ) : (
        <Empty
          icon="book"
          title={activeCount ? '没有符合条件的错题' : '错题本还是空的'}
          desc={
            activeCount
              ? '试试放宽筛选条件，或清空搜索关键词。'
              : '去「秒标记」把真题里的错题点一遍，之后就能按知识点复习和导出了。'
          }
          action={
            activeCount ? (
              <button
                className="btn"
                onClick={() => {
                  setSubject('all')
                  setYear('all')
                  setMastery('all')
                  setDue('all')
                  setTag(null)
                  setKeyword('')
                }}
              >
                清空筛选
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate('/quick')}>
                去标记错题
              </button>
            )
          }
        />
      )}

      {rows.data?.length ? (
        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 20 }}>
          共 {rows.data.length} 道
          {subject !== 'all' ? ` · ${SUBJECT_LABEL[subject as 'math2' | 'cs408']}` : ''}
        </div>
      ) : null}
    </div>
  )
}
