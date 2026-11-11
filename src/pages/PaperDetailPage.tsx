import { useMemo, useState } from 'react'
import type { Question } from '../types'
import {
  addMistake,
  addMistakesBulk,
  deleteMistake,
  deletePaper,
  getMistakeByQuestion,
  getPaper,
  listQuestions,
  mistakeQuestionMap,
  updateQuestion,
} from '../lib/repo'
import { QTYPE_LABEL, SUBJECT_LABEL } from '../lib/tags'
import { useAsync, useBlobUrl, useDataVersion, navigate } from '../hooks'
import { ConfirmSheet, Empty, ImageBox, Loading, MasteryDots, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { TagPicker } from '../components/TagPicker'

function QCell({ q, wrong, picked, onClick }: { q: Question; wrong: boolean; picked: boolean; onClick: () => void }) {
  const url = useBlobUrl(q.stemParts[0]?.t ?? q.stemParts[0]?.p)
  return (
    <button
      className={`q-cell${wrong ? ' is-wrong' : ''}${picked ? ' is-picked' : ''}`}
      onClick={onClick}
      title={`第 ${q.qno} 题`}
    >
      <span className="q-cell-no">{q.qno}</span>
      <span className="q-cell-thumb">{url ? <img src={url} alt="" /> : null}</span>
      {wrong ? <span className="q-cell-mark">!</span> : null}
    </button>
  )
}

export function PaperDetailPage({ paperId }: { paperId: string }) {
  const version = useDataVersion()
  const toast = useToast()
  const paper = useAsync(() => getPaper(paperId), [paperId, version])
  const questions = useAsync(() => listQuestions(paperId), [paperId, version])
  const mistakeMap = useAsync(() => mistakeQuestionMap(), [version])

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState(false)
  const [active, setActive] = useState<Question | null>(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [analysisDraft, setAnalysisDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [pendingTags, setPendingTags] = useState<{ knowledge: string[]; reason: string[] }>({
    knowledge: [],
    reason: [],
  })

  const p = paper.data
  const qs = questions.data ?? []
  const wrongSet = mistakeMap.data ?? new Map()

  const counts = useMemo(() => {
    let wrong = 0
    for (const q of qs) if (wrongSet.has(q.id)) wrong++
    return { total: qs.length, wrong }
  }, [qs, wrongSet])

  const subject = p?.subject ?? 'math2'

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function openQuestion(q: Question) {
    setActive(q)
    setAnswerDraft(q.answerText ?? '')
    setAnalysisDraft(q.analysisText ?? '')
  }

  async function markOne(q: Question) {
    try {
      await addMistake(q)
      toast('已加入错题本', 'ok')
      setActive(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'error')
    }
  }

  async function unmark(q: Question) {
    const m = await getMistakeByQuestion(q.id)
    if (!m) return
    await deleteMistake(m.id)
    toast('已从错题本移除', 'ok')
    setActive(null)
  }

  async function saveAnswer() {
    if (!active) return
    await updateQuestion(active.id, { answerText: answerDraft, analysisText: analysisDraft })
    toast('已保存答案与解析', 'ok')
  }

  if (paper.loading) return <Loading />
  if (!p) return <Empty title="试卷不存在" desc="可能已被删除" action={<button className="btn" onClick={() => navigate('/papers')}>返回试卷库</button>} />

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn-icon" onClick={() => navigate('/papers')} aria-label="返回">
              <Icon name="left" size={17} />
            </button>
            <h1>
              {p.year} {SUBJECT_LABEL[p.subject]}
            </h1>
            {p.status === 'cutting' ? <span className="badge badge-warn">待切题</span> : null}
          </div>
          <div className="page-sub">
            {p.variant} · {counts.total} 道题 · 已标 {counts.wrong} 道 · {p.pageCount} 页
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate(`/papers/${p.id}/cut`)}>
            <Icon name="scissors" size={14} /> 编辑切题
          </button>
          <button className={`btn${batch ? ' btn-primary' : ''}`} onClick={() => { setBatch(!batch); setPicked(new Set()) }}>
            {batch ? '退出多选' : '批量标记'}
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {counts.total === 0 ? (
        <Empty
          icon="scissors"
          title="这套卷子还没切题"
          desc="切题后每道题都会成为独立卡片，之后标记错题只需选年份 + 题号。"
          action={<button className="btn btn-primary" onClick={() => navigate(`/papers/${p.id}/cut`)}>开始切题</button>}
        />
      ) : (
        <>
          <div className="q-grid">
            {qs.map((q) => (
              <QCell
                key={q.id}
                q={q}
                wrong={wrongSet.has(q.id)}
                picked={picked.has(q.id)}
                onClick={() => (batch ? togglePick(q.id) : void openQuestion(q))}
              />
            ))}
          </div>

          {batch ? (
            <div
              className="card card-pad no-print"
              style={{
                position: 'sticky',
                bottom: 12,
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <span className="small">
                已选 <b className="mono">{picked.size}</b> 道题
              </span>
              <div className="grow" />
              <button
                className="btn btn-primary"
                disabled={picked.size === 0}
                onClick={async () => {
                  const list = qs.filter((q) => picked.has(q.id))
                  const n = await addMistakesBulk(list)
                  toast(`已加入 ${n} 道，${list.length - n} 道已存在`, 'ok')
                  setPicked(new Set())
                  setBatch(false)
                }}
              >
                加入错题本
              </button>
            </div>
          ) : null}
        </>
      )}

      <Sheet
        open={!!active}
        title={active ? `第 ${active.qno} 题 · ${QTYPE_LABEL[active.qtype]}` : ''}
        onClose={() => setActive(null)}
        width={620}
        footer={
          <>
            <button className="btn" onClick={() => setActive(null)}>
              关闭
            </button>
            {active && wrongSet.has(active.id) ? (
              <button className="btn btn-danger" onClick={() => void unmark(active)}>
                从错题本移除
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => setTagOpen(true)}>
                  <Icon name="tag" size={14} /> 标知识点
                </button>
                <button className="btn btn-primary" onClick={() => active && void markOne(active)}>
                  加入错题本
                </button>
              </>
            )}
          </>
        }
      >
        {active ? (
          <div className="stack" style={{ gap: 14 }}>
            <div className="q-image-stack">
              {active.stemParts.map((part, i) => (
                <ImageBox key={i} path={part.p} />
              ))}
            </div>

            {wrongSet.has(active.id) ? (
              <div className="row small" style={{ gap: 8 }}>
                <MasteryDots level={wrongSet.get(active.id)!.mastery} />
                <span className="muted">已在错题本</span>
                <span className="badge badge-brand">{wrongSet.get(active.id)!.knowledgeTags.join(' · ') || '未标知识点'}</span>
              </div>
            ) : null}

            <div className="field">
              <div className="field-label">正确答案</div>
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                placeholder="例如：B，或解答题的最终答案"
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
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={saveAnswer}>
              保存答案与解析
            </button>
          </div>
        ) : null}
      </Sheet>

      <TagPicker
        open={tagOpen}
        subject={subject}
        knowledge={pendingTags.knowledge}
        reason={pendingTags.reason}
        onChange={setPendingTags}
        doneLabel="加入错题本"
        onClose={() => {
          setTagOpen(false)
          setPendingTags({ knowledge: [], reason: [] })
        }}
        onDone={async () => {
          if (!active) return
          await addMistake(active, pendingTags)
          setPendingTags({ knowledge: [], reason: [] })
          setTagOpen(false)
          setActive(null)
          toast('已加入错题本', 'ok')
        }}
      />

      <ConfirmSheet
        open={confirmDelete}
        title="删除这套试卷？"
        danger
        okText="删除"
        desc={`将删除 ${p.year} ${SUBJECT_LABEL[p.subject]} 的全部 ${counts.total} 道题，以及这些题对应的错题和复习记录，无法恢复。`}
        onClose={() => setConfirmDelete(false)}
        onOk={async () => {
          await deletePaper(p.id)
          toast('已删除', 'ok')
          navigate('/papers')
        }}
      />
    </div>
  )
}
