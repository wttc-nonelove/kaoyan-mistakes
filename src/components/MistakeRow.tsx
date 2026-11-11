import type { MistakeWithQuestion } from '../types'
import { SUBJECT_LABEL } from '../lib/tags'
import { relativeDayLabel, todayStr } from '../lib/utils'
import { useBlobUrl } from '../hooks'
import { MasteryDots } from './ui'
import { Icon } from './Icon'

interface Props {
  row: MistakeWithQuestion
  onClick?: () => void
  compact?: boolean
}

function Thumb({ path }: { path?: string }) {
  const url = useBlobUrl(path)
  return (
    <div className="mistake-thumb">
      {url ? <img src={url} alt="" /> : <div className="skeleton" style={{ width: '100%', height: '100%' }} />}
    </div>
  )
}

export function MistakeRow({ row, onClick, compact }: Props) {
  const { mistake, question } = row
  const thumb = question?.stemParts[0]?.t ?? question?.stemParts[0]?.p

  return (
    <button className="mistake-item" onClick={onClick} type="button">
      <Thumb path={thumb} />
      <div className="mistake-body">
        <div className="mistake-title">
          {mistake.year} {SUBJECT_LABEL[mistake.subject]}
          <span className="muted" style={{ fontWeight: 500 }}>
            · 第 {mistake.qno} 题
          </span>
          {mistake.starred ? <Icon name="star" size={13} /> : null}
          {mistake.lapses >= 3 ? <span className="badge badge-danger">反复错</span> : null}
        </div>
        <div className="mistake-tags">
          {mistake.knowledgeTags.slice(0, 3).map((t) => (
            <span key={t} className="tag tag-kt">
              {t}
            </span>
          ))}
          {mistake.knowledgeTags.length > 3 ? <span className="tag">+{mistake.knowledgeTags.length - 3}</span> : null}
          {compact
            ? null
            : mistake.reasonTags.slice(0, 2).map((t) => (
                <span key={t} className="tag tag-rt">
                  {t}
                </span>
              ))}
        </div>
      </div>
      <div className="mistake-side">
        <MasteryDots level={mistake.mastery} />
        <span
          className={`tiny ${
            mistake.nextReviewAt && mistake.nextReviewAt <= todayStr() ? 'badge badge-danger' : 'muted'
          }`}
        >
          {relativeDayLabel(mistake.nextReviewAt)}
        </span>
      </div>
    </button>
  )
}
