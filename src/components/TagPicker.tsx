import { useState } from 'react'
import type { Subject } from '../types'
import { KNOWLEDGE_GROUPS, REASON_TAGS, addCustomTag, customTags } from '../lib/tags'
import { Sheet } from './ui'
import { Icon } from './Icon'

interface Props {
  open: boolean
  subject: Subject
  knowledge: string[]
  reason: string[]
  onChange: (next: { knowledge: string[]; reason: string[] }) => void
  onClose: () => void
  onDone?: () => void
  doneLabel?: string
}

export function TagPicker({
  open,
  subject,
  knowledge,
  reason,
  onChange,
  onClose,
  onDone,
  doneLabel = '完成',
}: Props) {
  const [custom, setCustom] = useState('')
  const [extra, setExtra] = useState<string[]>(() => customTags(subject))

  const toggle = (list: string[], tag: string) =>
    list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]

  const addCustom = () => {
    const t = custom.trim()
    if (!t) return
    addCustomTag(subject, t)
    setExtra((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setCustom('')
    onChange({ knowledge: [...new Set([...knowledge, t])], reason })
  }

  const groups = KNOWLEDGE_GROUPS[subject]

  return (
    <Sheet
      open={open}
      title="知识点与错因"
      onClose={onClose}
      width={560}
      footer={
        <button className="btn btn-primary" onClick={() => (onDone ?? onClose)()}>
          {doneLabel}
        </button>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        {groups.map((g) => (
          <div key={g.group} className="stack" style={{ gap: 8 }}>
            <div className="tiny muted" style={{ fontWeight: 650, letterSpacing: '0.04em' }}>
              {g.group}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {g.tags.map((t) => (
                <button
                  key={t}
                  className={`chip${knowledge.includes(t) ? ' is-on' : ''}`}
                  onClick={() => onChange({ knowledge: toggle(knowledge, t), reason })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}

        {extra.length ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="tiny muted" style={{ fontWeight: 650 }}>
              我添加的
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {extra.map((t) => (
                <button
                  key={t}
                  className={`chip${knowledge.includes(t) ? ' is-on' : ''}`}
                  onClick={() => onChange({ knowledge: toggle(knowledge, t), reason })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="field">
          <div className="field-label">新增知识点</div>
          <div className="row">
            <input
              className="input"
              placeholder="例如：拉格朗日中值定理、页表"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            />
            <button className="btn" onClick={addCustom}>
              <Icon name="plus" size={15} /> 添加
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="tiny muted" style={{ fontWeight: 650, letterSpacing: '0.04em' }}>
            错误原因
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {REASON_TAGS.map((t) => (
              <button
                key={t}
                className={`chip${reason.includes(t) ? ' is-on' : ''}`}
                onClick={() => onChange({ knowledge, reason: toggle(reason, t) })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
