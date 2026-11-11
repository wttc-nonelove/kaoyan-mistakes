import { useEffect, useMemo, useState } from 'react'
import type { MistakeWithQuestion } from '../types'
import { applyReview, countDue, dueMistakes, queryMistakes } from '../lib/repo'
import { computeSchedule } from '../lib/review'
import { SUBJECT_LABEL } from '../lib/tags'
import { relativeDayLabel, todayStr } from '../lib/utils'
import { navigate, useAsync, useBlobUrl } from '../hooks'
import { Empty, Loading, MasteryDots } from '../components/ui'
import { Icon } from '../components/Icon'

const BATCH = 30

function CardImage({ path }: { path?: string }) {
  const url = useBlobUrl(path)
  return url ? (
    <img src={url} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
  ) : (
    <div className="skeleton" style={{ height: 200 }} />
  )
}

export function ReviewPage() {
  const [session, setSession] = useState(0)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState({ forgot: 0, vague: 0, good: 0 })

  const due = useAsync(() => dueMistakes(BATCH), [session])
  const total = useAsync(() => countDue(), [session])
  const upcoming = useAsync(
    () => queryMistakes({ due: 'upcoming', sort: 'due' }).then((r) => r.slice(0, 3)),
    [session],
  )

  const list: MistakeWithQuestion[] = useMemo(() => due.data ?? [], [due.data])
  const current = list[Math.min(index, Math.max(0, list.length - 1))]

  useEffect(() => {
    setRevealed(false)
  }, [index])

  async function answer(result: 0 | 1 | 2) {
    if (!current) return
    await applyReview(current.mistake.id, result)
    setStats((s) => ({
      forgot: s.forgot + (result === 0 ? 1 : 0),
      vague: s.vague + (result === 1 ? 1 : 0),
      good: s.good + (result === 2 ? 1 : 0),
    }))
    setIndex((i) => i + 1)
  }

  if (due.loading) return <Loading text="正在排今天的复习队列…" />

  if (!list.length) {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <div>
            <h1>复习</h1>
            <div className="page-sub">按艾宾浩斯节奏，今天到期的题会出现在这里</div>
          </div>
        </div>
        <Empty
          icon="clock"
          title="今天没有到期的题"
          desc={
            upcoming.data?.length
              ? `最近一道是 ${upcoming.data[0].mistake.year} ${SUBJECT_LABEL[upcoming.data[0].mistake.subject]} 第 ${upcoming.data[0].mistake.qno} 题，${relativeDayLabel(upcoming.data[0].mistake.nextReviewAt)}到期。`
              : '错题本还是空的，先去标记几道题吧。'
          }
          action={
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => navigate('/mistakes')}>
                看错题本
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/quick')}>
                去标记错题
              </button>
            </div>
          }
        />
        {upcoming.data?.length ? (
          <div className="card card-pad">
            <div className="small muted" style={{ marginBottom: 10 }}>
              接下来到期
            </div>
            {upcoming.data.map((row) => (
              <div className="meta-row" key={row.mistake.id}>
                <span className="meta-key">{row.mistake.nextReviewAt?.slice(5)}</span>
                <span className="meta-val small">
                  {row.mistake.year} {SUBJECT_LABEL[row.mistake.subject]} · 第 {row.mistake.qno} 题
                  {row.mistake.knowledgeTags.length ? ` · ${row.mistake.knowledgeTags[0]}` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (index >= list.length) {
    return (
      <div className="page" style={{ maxWidth: 620 }}>
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <h1 style={{ fontSize: 20 }}>这一轮完成了</h1>
          <div className="muted small" style={{ marginTop: 8, lineHeight: 1.8 }}>
            共复习 {list.length} 道：
            <b style={{ color: 'var(--danger)' }}> 忘记 {stats.forgot}</b> ·{' '}
            <b style={{ color: 'var(--warn)' }}>模糊 {stats.vague}</b> ·{' '}
            <b style={{ color: 'var(--brand)' }}>掌握 {stats.good}</b>
            <br />
            忘记的题明天会再来一次。
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button
              className="btn"
              onClick={() => {
                setIndex(0)
                setStats({ forgot: 0, vague: 0, good: 0 })
                setSession((s) => s + 1)
              }}
            >
              再来一轮
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/mistakes')}>
              看错题本
            </button>
          </div>
        </div>
      </div>
    )
  }

  const m = current.mistake
  const q = current.question
  const today = todayStr()
  const preview = ([0, 1, 2] as const).map((r) => {
    const s = computeSchedule(m, r, today)
    return { r, label: s.graduated ? '毕业' : `${s.intervalDays} 天后` }
  })

  return (
    <div className="page">
      <div className="review-stage">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge badge-brand">
              {index + 1} / {list.length}
            </span>
            {(total.data ?? 0) > BATCH ? (
              <span className="tiny muted">今天共 {total.data} 道到期，本次先练 {BATCH} 道</span>
            ) : null}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('/mistakes')}>
            退出
          </button>
        </div>

        <div className="review-card">
          <div className="progress-line">
            <i style={{ width: `${(index / list.length) * 100}%` }} />
          </div>
          <div className="review-card-body">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div>
                <div className="small" style={{ fontWeight: 620 }}>
                  {m.year} {SUBJECT_LABEL[m.subject]} · 第 {m.qno} 题
                </div>
                <div className="row wrap" style={{ gap: 5, marginTop: 5 }}>
                  {m.knowledgeTags.map((t) => (
                    <span key={t} className="tag tag-kt">
                      {t}
                    </span>
                  ))}
                  <MasteryDots level={m.mastery} />
                </div>
              </div>
              {m.lapses > 1 ? <span className="badge badge-danger">错 {m.lapses} 次</span> : null}
            </div>

            {q?.stemParts.length ? (
              <div className="q-image-stack">
                {q.stemParts.map((part, i) => (
                  <CardImage key={i} path={part.p} />
                ))}
              </div>
            ) : (
              <Empty title="题目图缺失" />
            )}

            {revealed ? (
              <div className="answer-reveal">
                <div className="tiny muted" style={{ marginBottom: 6 }}>
                  答案
                </div>
                <div className="small" style={{ fontWeight: 560, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {q?.answerText?.trim() || '还没写答案'}
                </div>
                {q?.analysisText?.trim() ? (
                  <>
                    <div className="tiny muted" style={{ margin: '12px 0 6px' }}>
                      解析
                    </div>
                    <div className="small" style={{ lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                      {q.analysisText}
                    </div>
                  </>
                ) : null}
                {m.note?.trim() ? (
                  <>
                    <div className="tiny muted" style={{ margin: '12px 0 6px' }}>
                      我的笔记
                    </div>
                    <div className="small" style={{ lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                      {m.note}
                    </div>
                  </>
                ) : null}
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginTop: 10 }}
                  onClick={() => navigate(`/mistakes/${m.id}`)}
                >
                  打开详情补答案 →
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 18 }} onClick={() => setRevealed(true)}>
                先自己写，再看答案
              </button>
            )}
          </div>
        </div>

        {revealed ? (
          <div className="review-btns" style={{ marginTop: 14 }}>
            {preview.map((p) => (
              <button key={p.r} className={`review-btn r${p.r}`} onClick={() => void answer(p.r as 0 | 1 | 2)}>
                <b>{['忘记', '模糊', '掌握'][p.r]}</b>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>
          忘记 → 明天再来 · 模糊 → 降一阶 · 掌握 → 升一阶，连续三次到顶就毕业
        </div>
      </div>
    </div>
  )
}
