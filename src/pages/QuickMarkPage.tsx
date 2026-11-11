import { useEffect, useMemo, useState } from 'react'
import { addMistake, listAllQuestions, listPapers, mistakeQuestionMap } from '../lib/repo'
import { SUBJECTS, SUBJECT_LABEL } from '../lib/tags'
import type { Question, Subject } from '../types'
import { navigate, useAsync, useBlobUrl, useDataVersion } from '../hooks'
import { Empty, Loading } from '../components/ui'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'

function QTile({ q, marked, onClick }: { q: Question; marked: boolean; onClick: () => void }) {
  const url = useBlobUrl(q.stemParts[0]?.t ?? q.stemParts[0]?.p)
  return (
    <button
      className={`q-cell${marked ? ' is-wrong' : ''}`}
      onClick={onClick}
      title={`第 ${q.qno} 题${marked ? '（已标记）' : ''}`}
    >
      <span className="q-cell-no">{q.qno}</span>
      <span className="q-cell-thumb">{url ? <img src={url} alt="" /> : null}</span>
      {marked ? <span className="q-cell-mark">✓</span> : null}
    </button>
  )
}

export function QuickMarkPage() {
  const version = useDataVersion()
  const toast = useToast()
  const papers = useAsync(() => listPapers(), [version])
  const questions = useAsync(() => listAllQuestions(), [version])
  const marked = useAsync(() => mistakeQuestionMap(), [version])

  const [subject, setSubject] = useState<Subject>('math2')
  const [year, setYear] = useState<number | null>(null)
  const [added, setAdded] = useState(0)

  const readyPapers = useMemo(
    () => (papers.data ?? []).filter((p) => p.status === 'ready' && p.subject === subject).sort((a, b) => b.year - a.year),
    [papers.data, subject],
  )

  useEffect(() => {
    if (year !== null && readyPapers.some((p) => p.year === year)) return
    setYear(readyPapers[0]?.year ?? null)
  }, [readyPapers, year])

  const currentPaper = readyPapers.find((p) => p.year === year)
  const list = useMemo(
    () =>
      (questions.data ?? [])
        .filter((q) => q.subject === subject && q.year === year)
        .sort((a, b) => a.qno - b.qno),
    [questions.data, subject, year],
  )

  async function mark(q: Question) {
    const existed = marked.data?.has(q.id)
    await addMistake(q)
    if (!existed) {
      setAdded((n) => n + 1)
      toast(`已记下 ${q.year} ${SUBJECT_LABEL[q.subject]} 第 ${q.qno} 题`, 'ok')
    } else {
      toast('这道题已经在错题本里了')
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>秒标记</h1>
          <div className="page-sub">选科目 → 选年份 → 点题号，点一下就是一道错题</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/mistakes')}>
            去错题本 {added > 0 ? `（本次 +${added}）` : ''}
          </button>
        </div>
      </div>

      <div className="card card-pad stack" style={{ gap: 16 }}>
        <div className="field">
          <div className="field-label">1 · 科目</div>
          <div className="row" style={{ gap: 8 }}>
            {SUBJECTS.map((s) => (
              <button
                key={s.id}
                className={`chip${subject === s.id ? ' is-on' : ''}`}
                style={{ height: 36, padding: '0 16px', fontSize: 13.5 }}
                onClick={() => {
                  setSubject(s.id)
                  setYear(null)
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-label">2 · 年份</div>
          {readyPapers.length ? (
            <div className="row wrap" style={{ gap: 6 }}>
              {readyPapers.map((p) => (
                <button
                  key={p.id}
                  className={`chip${year === p.year ? ' is-on' : ''}`}
                  onClick={() => setYear(p.year)}
                  style={{ fontFamily: 'var(--font-num)' }}
                >
                  {p.year}
                </button>
              ))}
            </div>
          ) : (
            <div className="small muted">
              还没有{SUBJECT_LABEL[subject]}的题。
              <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/papers')}>
                去上传真题
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <div className="field-label">
            3 · 题号 {currentPaper ? <span className="muted">（{currentPaper.year} {SUBJECT_LABEL[subject]}，共 {list.length} 题）</span> : null}
          </div>
          {questions.loading ? (
            <Loading />
          ) : list.length ? (
            <div className="q-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
              {list.map((q) => (
                <QTile key={q.id} q={q} marked={!!marked.data?.has(q.id)} onClick={() => void mark(q)} />
              ))}
            </div>
          ) : (
            <Empty
              icon="layers"
              title={readyPapers.length ? '这套卷子还没切好题' : '还没有题目'}
              desc={
                readyPapers.length
                  ? '先把这套卷子切完题，才能按题号标记。'
                  : '上传扫描版真题 PDF，自动切题后就能在这里一键标记了。'
              }
              action={
                <button className="btn btn-primary" onClick={() => navigate('/papers')}>
                  {readyPapers.length ? '去切题' : '去上传'}
                </button>
              }
            />
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <Icon name="spark" size={17} />
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            点错的题不会重复入库。标记时来不及想的知识点，可以之后在<b>错题详情</b>里补标签、答案和笔记；
            当天的题会自动排进明天的复习队列。
          </div>
        </div>
      </div>
    </div>
  )
}
