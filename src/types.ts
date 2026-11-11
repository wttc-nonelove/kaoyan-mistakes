export type Subject = 'math2' | 'cs408'
export type QType = 'choice' | 'blank' | 'solution' | 'unknown'
export type PaperStatus = 'cutting' | 'ready'

/** 题目图片块：一张裁剪图，可能一题多块（跨页/分栏） */
export interface Part {
  /** 图片在本地 blob 仓库中的键 */
  p: string
  /** 缩略图键 */
  t?: string
  w: number
  h: number
}

export interface CutSegment {
  id: string
  page: number
  /** 144dpi 渲染坐标系下的像素 */
  y0: number
  y1: number
  /** 同 group 合并成一题 */
  group: string
  role: 'stem' | 'answer' | 'ignore'
  conf: 'high' | 'low' | 'manual'
}

export interface CutState {
  v: 1
  segs: CutSegment[]
  qnoOverride: Record<string, number>
  pageIndex: number
  updatedAt: number
}

export interface Paper {
  id: string
  subject: Subject
  year: number
  variant: string
  title: string
  pageCount: number
  status: PaperStatus
  /** 源 PDF 的 blob 键 */
  sourcePath?: string
  sourceBytes?: number
  cutState?: CutState
  createdAt: number
  updatedAt: number
}

export interface Question {
  id: string
  paperId: string
  subject: Subject
  year: number
  qno: number
  qtype: QType
  stemParts: Part[]
  answerParts: Part[]
  answerText?: string
  analysisText?: string
  createdAt: number
}

export interface Mistake {
  id: string
  questionId: string
  subject: Subject
  year: number
  qno: number
  knowledgeTags: string[]
  reasonTags: string[]
  note?: string
  myAnswer?: string
  mastery: 0 | 1 | 2
  starred: boolean
  /** 记录为错题的日期 YYYY-MM-DD */
  wrongAt: string
  stage: number
  masterStreak: number
  lapses: number
  reviewCount: number
  lastReviewedAt?: number
  nextReviewAt: string | null
  graduatedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface ReviewLog {
  id: string
  mistakeId: string
  result: 0 | 1 | 2
  prevStage: number
  nextStage: number
  intervalDays: number
  nextReviewAt: string | null
  durationMs?: number
  reviewedAt: number
}

/** 错题 + 关联题目（列表用） */
export interface MistakeWithQuestion {
  mistake: Mistake
  question: Question | null
}

export interface Stats {
  total: number
  bySubject: Record<Subject, number>
  byYear: { year: number; count: number }[]
  byTag: { tag: string; count: number }[]
  byReason: { tag: string; count: number }[]
  byMastery: [number, number, number]
  dueToday: number
  graduated: number
  last30Days: number
}
