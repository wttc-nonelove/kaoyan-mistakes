import { useEffect, useState } from 'react'
import type { Mistake, Question, ReviewLog } from '../types'
import {
  applyReview,
  deleteMistake,
  getMistake,
  getQuestion,
  listReviews,
  restartReview,
  updateMistake,
  updateQuestion,
} from '../lib/repo'
import { computeSchedule, INTERVALS } from '../lib/review'
import { QTYPE_LABEL, SUBJECT_LABEL } from '../lib/tags'
import { relativeDayLabel, todayStr } from '../lib/utils'
import { navigate, useAsync, useDataVersion } from '../hooks'
import { ConfirmSheet, Empty, ImageBox, Loading, MasteryDots, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import { TagPicker } from '../components/TagPicker'
import { useToast } from '../components/Toast'

export function MistakeDetailPage({ mistakeId }: { mistakeId: string }) {
  const version = useDataVersion()
  const toast = useToast()
  const data = useAsync(async () => {
    const m = await getMistake(mistakeId)
    if (!m) return null
    const [q, logs] = await Promise.all([getQuestion(m.questionId), listReviews(m.id)])
    return { mistake: m, question: q ?? null, logs }
  }, [mistakeId, version])

  const [answerDraft, setAnswerDraft] = useState('')
  const [analysisDraft, setAnalysisDraft] = useState('')
  const [myAnswer, setMyAnswer] = useState('')
  const [note, setNote] = useState('')
  const [tagOpen, setTagOpen] = useState(false)
  const [tags, setTags] = useState<{ knowledge: string[]; reason: string[] }>({ knowledge: [], reason: [] })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAnswer, setShowAnswer] = useState(true)

  const m = data.data?.mistake
  const q = data.data?.question

  useEffect(() => {
    if (!q || !m) return
    setAnswerDraft(q.answerText ?? '')
    setAnalysisDraft(q.analysisText ?? '')
    setMyAnswer(m.myAnswer ?? '')
    setNote(m.note ?? '')
    setTags({ knowledge: m.knowledgeTags, reason: m.reasonTags })
  }, [q?.id, m?.id, version])

  if (data.loading) return <Loading />
  if (!m) {
    return (
      <div className="page">
        <Empty title="这道错题不存在" action={<button className="btn" onClick={() => navigate('/mistakes')}>返回错题本</button>} />
      </div>
    )
  }

  const today = todayStr()
  const preview = ([0, 1, 2] as const).map((r) => {
    const s = computeSchedule(m, r, today)
    return { r, label: s.graduated ? '毕业' : `${s.intervalDays} 天后` }
  })

  async function doReview(result: 0 | 1 | 2) {
    await applyReview(m!.id, result)
    const s = computeSchedule(m!, result, today)
    toast(s.graduated ? '已掌握，从复习队列毕业 🎉' : `下次复习：${relativeDayLabel(s.nextReviewAt)}`, 'ok')
  }

  async function saveTexts() {
    if (q) {
      await updateQuestion(q.id, { answerText: answerDraft, analysisText: analysisDraft })
    }
    await updateMistake(m!.id, { myAnswer, note })
    toast('已保存', 'ok')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-icon" onClick={() => navigate('/mistakes')} aria-label="返回">
              <Icon name="left" size={17} />
            </button>
            <h1>
              {m.year} {SUBJECT_LABEL[m.subject]} · 第 {m.qno} 题
            </h1>
            {q ? <span className="badge">{QTYPE_LABEL[q.qtype]}</span> : null}
          </div>
          <div className="page-sub">
            {m.nextReviewAt ? `下次复习：${relativeDayLabel(m.nextReviewAt)}（${m.nextReviewAt}）` : '已毕业'}
            {' · '}复习 {m.reviewCount} 次{m.lapses > 1 ? ` · 错 ${m.lapses} 次` : ''}
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            onClick={async () => {
              await updateMistake(m.id, { starred: !m.starred })
            }}
            title="标为重点"
          >
            <Icon name="star" size={15} /> {m.starred ? '已重点' : '标重点'}
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ gap: 12 }}>
          <div className="card card-pad">
            <div className="q-image-stack">
              {q?.stemParts.length ? (
                q.stemParts.map((part, i) => <ImageBox key={i} path={part.p} />)
              ) : (
                <Empty title="题目图片缺失" desc="可能已清理，可在试卷详情里重新切题" />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>答案与解析</h2>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAnswer((v) => !v)}>
                {showAnswer ? '收起' : '展开'}
              </button>
            </div>
            {showAnswer ? (
              <div className="card-pad stack" style={{ gap: 12 }}>
                {q?.answerParts.length ? (
                  <div className="q-image-stack">
                    {q.answerParts.map((part, i) => (
                      <ImageBox key={i} path={part.p} />
                    ))}
                  </div>
                ) : null}
                <div className="field">
                  <div className="field-label">正确答案</div>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 56 }}
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    placeholder="答案"
                  />
                </div>
                <div className="field">
                  <div className="field-label">解析 / 思路</div>
                  <textarea
                    className="textarea"
                    value={analysisDraft}
                    onChange={(e) => setAnalysisDraft(e.target.value)}
                    placeholder="关键步骤、易错点、下次遇到该怎么想"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>我的记录</h2>
            </div>
            <div className="card-pad stack" style={{ gap: 12 }}>
              <div className="field">
                <div className="field-label">我当时写的答案</div>
                <textarea
                  className="textarea"
                  style={{ minHeight: 48 }}
                  value={myAnswer}
                  onChange={(e) => setMyAnswer(e.target.value)}
                  placeholder="方便对照错在哪一步"
                />
              </div>
              <div className="field">
                <div className="field-label">笔记 / 反思</div>
                <textarea
                  className="textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="为什么错、下次怎么避免"
                />
              </div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={saveTexts}>
                保存
              </button>
            </div>
          </div>

          {data.data?.logs.length ? (
            <div className="card">
              <div className="card-head">
                <h2>复习记录</h2>
                <span className="tiny muted">{data.data.logs.length} 次</span>
              </div>
              <div className="card-pad">
                {data.data.logs.slice(0, 8).map((log: ReviewLog) => (
                  <div className="meta-row" key={log.id}>
                    <span className="meta-key">{new Date(log.reviewedAt).toLocaleDateString('zh-CN')}</span>
                    <span className="meta-val small">
                      {['忘记', '模糊', '掌握'][log.result]} · 第 {log.prevStage}→{log.nextStage} 阶
                      {log.nextReviewAt ? ` · 下次 ${log.nextReviewAt.slice(5)}` : ' · 毕业'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <div className="card card-pad stack" style={{ gap: 14 }}>
            <div className="row-between">
              <span className="small muted">掌握状态</span>
              <div className="row" style={{ gap: 8 }}>
                <MasteryDots level={m.mastery} />
                <span className="small">{['未掌握', '复习中', '已掌握'][m.mastery]}</span>
              </div>
            </div>
            <div className="row-between">
              <span className="small muted">复习阶段</span>
              <span className="small mono">
                第 {m.stage} 阶 · {INTERVALS[Math.min(5, m.stage)]} 天间隔
              </span>
            </div>
            <hr />
            {m.nextReviewAt === null ? (
              <>
                <div className="small muted" style={{ lineHeight: 1.7 }}>
                  这道题已经连续掌握三次，从复习队列毕业了。如果又错了，可以让它重新开始。
                </div>
                <button className="btn" onClick={async () => { await restartReview(m.id); toast('已重新加入复习', 'ok') }}>
                  重新开始复习
                </button>
              </>
            ) : (
              <>
                <div className="small" style={{ fontWeight: 600 }}>
                  今天复习得怎么样？
                </div>
                <div className="review-btns">
                  {preview.map((p) => (
                    <button key={p.r} className={`review-btn r${p.r}`} onClick={() => void doReview(p.r as 0 | 1 | 2)}>
                      <b>{['忘记', '模糊', '掌握'][p.r]}</b>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row-between">
              <span className="small muted">知识点</span>
              <button className="btn btn-sm" onClick={() => setTagOpen(true)}>
                <Icon name="tag" size={13} /> 编辑
              </button>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {m.knowledgeTags.length ? (
                m.knowledgeTags.map((t) => (
                  <span key={t} className="tag tag-kt">
                    {t}
                  </span>
                ))
              ) : (
                <span className="tiny muted">还没标知识点，统计会不准</span>
              )}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {m.reasonTags.map((t) => (
                <span key={t} className="tag tag-rt">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="meta-list">
              <div className="meta-row">
                <span className="meta-key">记录于</span>
                <span className="meta-val small">{m.wrongAt}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">上次复习</span>
                <span className="meta-val small">
                  {m.lastReviewedAt ? new Date(m.lastReviewedAt).toLocaleString('zh-CN') : '还没复习过'}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key">反复错</span>
                <span className="meta-val small">{m.lapses} 次</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TagPicker
        open={tagOpen}
        subject={m.subject}
        knowledge={tags.knowledge}
        reason={tags.reason}
        onChange={setTags}
        onClose={() => setTagOpen(false)}
        onDone={async () => {
          await updateMistake(m.id, { knowledgeTags: tags.knowledge, reasonTags: tags.reason })
          setTagOpen(false)
          toast('已保存标签', 'ok')
        }}
      />

      <ConfirmSheet
        open={confirmDelete}
        title="从错题本移除？"
        danger
        okText="移除"
        desc="这道题会从错题本和复习队列里消失，但试卷里的题目图会保留。"
        onClose={() => setConfirmDelete(false)}
        onOk={async () => {
          await deleteMistake(m.id)
          toast('已移除', 'ok')
          navigate('/mistakes')
        }}
      />
    </div>
  )
}
