import type {
  CutState,
  Mistake,
  MistakeWithQuestion,
  Paper,
  QType,
  Question,
  ReviewLog,
  Stats,
  Subject,
} from '../types'
import { cloud } from './cloud'
import { deleteBlobs, partsKeys } from './blobStore'
import { computeSchedule, type ReviewResult } from './review'
import { addDays, todayStr, uid } from './utils'

/* ---------------- 变更通知 ---------------- */

let version = 0
const listeners = new Set<() => void>()

export function subscribeData(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function dataVersion(): number {
  return version
}

export function emit() {
  version++
  listeners.forEach((l) => l())
}

/* ---------------- 行映射 ---------------- */

type Row = Record<string, unknown>

/** PostgREST 单次最多 1000 行，统一分页取全量 */
const PAGE = 900

const str = (v: unknown): string => (v == null ? '' : String(v))
const optStr = (v: unknown): string | undefined => (v == null ? undefined : String(v))
const num = (v: unknown): number => (v == null ? 0 : Number(v))

interface Part {
  p: string
  t?: string
  w: number
  h: number
}

function readParts(v: unknown): Part[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ p: str(x.p), t: optStr(x.t), w: num(x.w), h: num(x.h) }))
    .filter((x) => x.p)
}

function mapPaper(r: Row): Paper {
  return {
    id: str(r.id),
    subject: str(r.subject) as Subject,
    year: num(r.year),
    variant: str(r.variant) || '真题',
    title: str(r.title),
    pageCount: num(r.page_count),
    status: (str(r.status) as Paper['status']) || 'cutting',
    sourcePath: optStr(r.source_path),
    sourceBytes: r.source_bytes == null ? undefined : num(r.source_bytes),
    cutState: (r.cut_state as Paper['cutState']) ?? undefined,
    createdAt: r.created_at ? new Date(str(r.created_at)).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(str(r.updated_at)).getTime() : Date.now(),
  }
}

function mapQuestion(r: Row): Question {
  return {
    id: str(r.id),
    paperId: str(r.paper_id),
    subject: str(r.subject) as Subject,
    year: num(r.year),
    qno: num(r.qno),
    qtype: (str(r.qtype) as QType) || 'unknown',
    stemParts: readParts(r.stem_parts),
    answerParts: readParts(r.answer_parts),
    answerText: optStr(r.answer_text) ?? '',
    analysisText: optStr(r.analysis_text) ?? '',
    createdAt: r.created_at ? new Date(str(r.created_at)).getTime() : Date.now(),
  }
}

function mapMistake(r: Row): Mistake {
  return {
    id: str(r.id),
    questionId: str(r.question_id),
    subject: str(r.subject) as Subject,
    year: num(r.year),
    qno: num(r.qno),
    knowledgeTags: Array.isArray(r.knowledge_tags) ? (r.knowledge_tags as string[]) : [],
    reasonTags: Array.isArray(r.reason_tags) ? (r.reason_tags as string[]) : [],
    note: optStr(r.note) ?? '',
    myAnswer: optStr(r.my_answer) ?? '',
    mastery: (num(r.mastery) as 0 | 1 | 2) ?? 0,
    starred: !!r.starred,
    wrongAt: str(r.wrong_at),
    stage: num(r.stage),
    masterStreak: num(r.master_streak),
    lapses: num(r.lapses),
    reviewCount: num(r.review_count),
    lastReviewedAt: r.last_reviewed_at ? new Date(str(r.last_reviewed_at)).getTime() : undefined,
    nextReviewAt: r.next_review_at ? str(r.next_review_at).slice(0, 10) : null,
    graduatedAt: r.graduated_at ? new Date(str(r.graduated_at)).getTime() : null,
    createdAt: r.created_at ? new Date(str(r.created_at)).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(str(r.updated_at)).getTime() : Date.now(),
  }
}

function mapReview(r: Row): ReviewLog {
  return {
    id: str(r.id),
    mistakeId: str(r.mistake_id),
    result: num(r.result) as 0 | 1 | 2,
    prevStage: num(r.prev_stage),
    nextStage: num(r.next_stage),
    intervalDays: num(r.interval_days),
    nextReviewAt: r.next_review_at ? str(r.next_review_at).slice(0, 10) : null,
    durationMs: r.duration_ms == null ? undefined : num(r.duration_ms),
    reviewedAt: r.reviewed_at ? new Date(str(r.reviewed_at)).getTime() : Date.now(),
  }
}

/* ---------------- 试卷 ---------------- */

const PAPER_COLS = 'id, subject, year, variant, title, page_count, status, source_path, source_bytes, cut_state, created_at, updated_at'

export async function listPapers(): Promise<Paper[]> {
  const res = await cloud.database.from('papers').select(PAPER_COLS).order('year', { ascending: false })
  if (res.error) throw new Error(res.error.message)
  return ((res.data ?? []) as Row[]).map(mapPaper)
}

export async function getPaper(id: string): Promise<Paper | undefined> {
  const res = await cloud.database.from('papers').select(PAPER_COLS).eq('id', Number(id)).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapPaper(res.data as Row) : undefined
}

export async function findPaper(subject: Subject, year: number, variant = '真题'): Promise<Paper | undefined> {
  const res = await cloud.database
    .from('papers')
    .select(PAPER_COLS)
    .eq('subject', subject)
    .eq('year', year)
    .eq('variant', variant)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapPaper(res.data as Row) : undefined
}

export async function createPaper(input: {
  subject: Subject
  year: number
  variant?: string
  pageCount: number
  sourcePath?: string
  sourceBytes?: number
}): Promise<Paper> {
  const variant = input.variant ?? '真题'
  const existing = await findPaper(input.subject, input.year, variant)
  if (existing) {
    throw new Error(
      `已经存在 ${input.year} 年${input.subject === 'math2' ? '数二' : '408'}的${variant}，请直接打开它继续切题`,
    )
  }
  const res = await cloud.database
    .from('papers')
    .insert({
      subject: input.subject,
      year: input.year,
      variant,
      title: `${input.year} ${input.subject === 'math2' ? '数学二' : '408'}`,
      page_count: input.pageCount,
      status: 'cutting',
      source_path: input.sourcePath ?? null,
      source_bytes: input.sourceBytes ?? null,
    })
    .select(PAPER_COLS)
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as Row[]
  if (!rows.length) throw new Error('创建试卷失败：没有写入权限')
  emit()
  return mapPaper(rows[0])
}

export interface PaperPatch {
  title?: string
  status?: Paper['status']
  pageCount?: number
  sourcePath?: string
  sourceBytes?: number
  cutState?: Paper['cutState'] | null
}

export async function updatePaper(id: string, patch: PaperPatch): Promise<Paper> {
  const out: Row = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) out.title = patch.title
  if (patch.status !== undefined) out.status = patch.status
  if (patch.pageCount !== undefined) out.page_count = patch.pageCount
  if (patch.sourcePath !== undefined) out.source_path = patch.sourcePath
  if (patch.sourceBytes !== undefined) out.source_bytes = patch.sourceBytes
  if ('cutState' in patch) out.cut_state = patch.cutState ?? null

  const res = await cloud.database.from('papers').update(out).eq('id', Number(id)).select(PAPER_COLS)
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as Row[]
  if (!rows.length) throw new Error('保存失败：这条记录不存在或不属于你')
  emit()
  return mapPaper(rows[0])
}

export async function deletePaper(id: string): Promise<void> {
  const qs = await listQuestions(id)
  const keys = qs.flatMap((q) => partsKeys([...q.stemParts, ...q.answerParts]))
  await deleteBlobs(keys)
  const paper = await getPaper(id)
  if (paper?.sourcePath) await deleteBlobs([paper.sourcePath])
  const res = await cloud.database.from('papers').delete().eq('id', Number(id)).select('id')
  if (res.error) throw new Error(res.error.message)
  emit()
}

/* ---------------- 题目 ---------------- */

const Q_COLS =
  'id, paper_id, subject, year, qno, qtype, stem_parts, answer_parts, answer_text, analysis_text, created_at'

export async function listQuestions(paperId: string): Promise<Question[]> {
  const res = await cloud.database.from('questions').select(Q_COLS).eq('paper_id', Number(paperId)).order('qno')
  if (res.error) throw new Error(res.error.message)
  return ((res.data ?? []) as Row[]).map(mapQuestion)
}

export async function listAllQuestions(): Promise<Question[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const res = await cloud.database
      .from('questions')
      .select(Q_COLS)
      .order('year', { ascending: false })
      .order('qno')
      .range(from, from + PAGE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = (res.data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows.map(mapQuestion)
}

export async function getQuestion(id: string): Promise<Question | undefined> {
  const res = await cloud.database.from('questions').select(Q_COLS).eq('id', Number(id)).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapQuestion(res.data as Row) : undefined
}

export async function findQuestion(subject: Subject, year: number, qno: number): Promise<Question | undefined> {
  const res = await cloud.database
    .from('questions')
    .select(Q_COLS)
    .eq('subject', subject)
    .eq('year', year)
    .eq('qno', qno)
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapQuestion(res.data as Row) : undefined
}

export async function updateQuestion(id: string, patch: Partial<Question>): Promise<Question> {
  const out: Row = {}
  if (patch.answerText !== undefined) out.answer_text = patch.answerText
  if (patch.analysisText !== undefined) out.analysis_text = patch.analysisText
  if (patch.answerParts !== undefined) out.answer_parts = patch.answerParts
  if (patch.qtype !== undefined) out.qtype = patch.qtype
  const res = await cloud.database.from('questions').update(out).eq('id', Number(id)).select(Q_COLS)
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as Row[]
  if (!rows.length) throw new Error('保存失败：题目不存在或不属于你')
  emit()
  return mapQuestion(rows[0])
}

export interface QuestionDraft {
  qno: number
  qtype: QType
  stemParts: { p: string; t?: string; w: number; h: number }[]
}

/** 重新提交切题结果：覆盖该卷所有题目 */
export async function replaceQuestions(
  paperId: string,
  drafts: QuestionDraft[],
  cutState?: CutState | null,
): Promise<Question[]> {
  const paper = await getPaper(paperId)
  if (!paper) throw new Error('试卷不存在')

  const old = await listQuestions(paperId)
  const oldKeys = old.flatMap((q) => partsKeys([...q.stemParts, ...q.answerParts]))
  if (old.length) {
    const del = await cloud.database.from('questions').delete().eq('paper_id', Number(paperId)).select('id')
    if (del.error) throw new Error(del.error.message)
    await deleteBlobs(oldKeys)
  }

  const rows = drafts.map((d) => ({
    paper_id: Number(paperId),
    subject: paper.subject,
    year: paper.year,
    qno: d.qno,
    qtype: d.qtype,
    stem_parts: d.stemParts,
    answer_parts: [],
  }))
  const res = await cloud.database.from('questions').insert(rows).select(Q_COLS)
  if (res.error) throw new Error(res.error.message)
  const inserted = ((res.data ?? []) as Row[]).map(mapQuestion)

  await updatePaper(paperId, { status: 'ready', cutState: cutState ?? null })
  emit()
  return inserted.sort((a, b) => a.qno - b.qno)
}

/* ---------------- 错题 ---------------- */

const M_COLS =
  'id, question_id, subject, year, qno, knowledge_tags, reason_tags, note, my_answer, mastery, starred, wrong_at, stage, master_streak, lapses, review_count, last_reviewed_at, next_review_at, graduated_at, created_at, updated_at'

export async function listMistakes(): Promise<Mistake[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const res = await cloud.database.from('mistakes').select(M_COLS).range(from, from + PAGE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = (res.data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows.map(mapMistake)
}

export async function getMistake(id: string): Promise<Mistake | undefined> {
  const res = await cloud.database.from('mistakes').select(M_COLS).eq('id', Number(id)).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapMistake(res.data as Row) : undefined
}

export async function getMistakeByQuestion(questionId: string): Promise<Mistake | undefined> {
  const res = await cloud.database
    .from('mistakes')
    .select(M_COLS)
    .eq('question_id', Number(questionId))
    .maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? mapMistake(res.data as Row) : undefined
}

export async function addMistake(
  question: Question,
  tags: { knowledge?: string[]; reason?: string[] } = {},
): Promise<Mistake> {
  const res = await cloud.database.rpc('quick_mark', {
    p_subject: question.subject,
    p_year: question.year,
    p_qno: question.qno,
    p_knowledge: tags.knowledge ?? [],
    p_reason: tags.reason ?? [],
  })
  if (res.error) throw new Error(res.error.message)
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row | null
  if (!row) throw new Error('标记失败：题目不存在或没有权限')
  emit()
  return mapMistake(row)
}

export async function addMistakesBulk(
  questions: Question[],
  tags: { knowledge?: string[]; reason?: string[] } = {},
): Promise<number> {
  let n = 0
  for (const q of questions) {
    const existed = await getMistakeByQuestion(q.id)
    await addMistake(q, tags)
    if (!existed) n++
  }
  return n
}

export async function updateMistake(id: string, patch: Partial<Mistake>): Promise<Mistake> {
  const out: Row = { updated_at: new Date().toISOString() }
  if (patch.knowledgeTags !== undefined) out.knowledge_tags = patch.knowledgeTags
  if (patch.reasonTags !== undefined) out.reason_tags = patch.reasonTags
  if (patch.note !== undefined) out.note = patch.note
  if (patch.myAnswer !== undefined) out.my_answer = patch.myAnswer
  if (patch.starred !== undefined) out.starred = patch.starred
  if (patch.mastery !== undefined) out.mastery = patch.mastery
  if (patch.stage !== undefined) out.stage = patch.stage
  if (patch.masterStreak !== undefined) out.master_streak = patch.masterStreak
  if (patch.nextReviewAt !== undefined) out.next_review_at = patch.nextReviewAt
  if (patch.graduatedAt !== undefined) out.graduated_at = patch.graduatedAt

  const res = await cloud.database.from('mistakes').update(out).eq('id', Number(id)).select(M_COLS)
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as Row[]
  if (!rows.length) throw new Error('保存失败：这道错题不存在或不属于你')
  emit()
  return mapMistake(rows[0])
}

export async function deleteMistake(id: string): Promise<void> {
  const res = await cloud.database.from('mistakes').delete().eq('id', Number(id)).select('id')
  if (res.error) throw new Error(res.error.message)
  emit()
}

export async function applyReview(
  mistakeId: string,
  result: ReviewResult,
  durationMs?: number,
): Promise<Mistake> {
  const res = await cloud.database.rpc('apply_review', {
    p_mistake_id: Number(mistakeId),
    p_result: result,
    p_duration_ms: durationMs ?? null,
  })
  if (res.error) throw new Error(res.error.message)
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row | null
  if (!row) throw new Error('复习记录失败')
  emit()
  return mapMistake(row)
}

export async function restartReview(id: string): Promise<Mistake> {
  const today = todayStr()
  const res = await cloud.database
    .from('mistakes')
    .update({
      stage: 3,
      master_streak: 0,
      next_review_at: addDays(today, 1),
      graduated_at: null,
      mastery: 2,
      updated_at: new Date().toISOString(),
    })
    .eq('id', Number(id))
    .select(M_COLS)
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as Row[]
  if (!rows.length) throw new Error('操作失败')
  emit()
  return mapMistake(rows[0])
}

export async function listReviews(mistakeId: string): Promise<ReviewLog[]> {
  const res = await cloud.database
    .from('reviews')
    .select('id, mistake_id, result, prev_stage, next_stage, interval_days, next_review_at, duration_ms, reviewed_at')
    .eq('mistake_id', Number(mistakeId))
    .order('reviewed_at', { ascending: false })
  if (res.error) throw new Error(res.error.message)
  return ((res.data ?? []) as Row[]).map(mapReview)
}

/* ---------------- 查询 / 关联 ---------------- */

export interface MistakeFilter {
  subject?: Subject | 'all'
  year?: number | 'all'
  qno?: number | null
  mastery?: 'all' | 0 | 1 | 2
  due?: 'all' | 'due' | 'graduated' | 'upcoming'
  tag?: string | null
  reason?: string | null
  keyword?: string
  starred?: boolean
  sort?: 'newest' | 'due' | 'year' | 'lapses'
}

const NESTED_SELECT = `${M_COLS}, question:questions(id, paper_id, subject, year, qno, qtype, stem_parts, answer_parts, answer_text, analysis_text, created_at)`

async function fetchRowsWithQuestion(): Promise<MistakeWithQuestion[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const res = await cloud.database.from('mistakes').select(NESTED_SELECT).range(from, from + PAGE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = (res.data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows.map((r) => ({
    mistake: mapMistake(r),
    question: r.question ? mapQuestion(r.question as Row) : null,
  }))
}

export async function queryMistakes(filter: MistakeFilter): Promise<MistakeWithQuestion[]> {
  let rows = await fetchRowsWithQuestion()
  const today = todayStr()

  if (filter.subject && filter.subject !== 'all') rows = rows.filter((r) => r.mistake.subject === filter.subject)
  if (filter.year && filter.year !== 'all') rows = rows.filter((r) => r.mistake.year === filter.year)
  if (filter.qno) rows = rows.filter((r) => r.mistake.qno === filter.qno)
  if (filter.mastery !== undefined && filter.mastery !== 'all') {
    rows = rows.filter((r) => r.mistake.mastery === filter.mastery)
  }
  if (filter.starred) rows = rows.filter((r) => r.mistake.starred)
  if (filter.tag) rows = rows.filter((r) => r.mistake.knowledgeTags.includes(filter.tag!))
  if (filter.reason) rows = rows.filter((r) => r.mistake.reasonTags.includes(filter.reason!))
  if (filter.due === 'due') {
    rows = rows.filter((r) => r.mistake.nextReviewAt !== null && r.mistake.nextReviewAt <= today)
  } else if (filter.due === 'graduated') {
    rows = rows.filter((r) => r.mistake.nextReviewAt === null)
  } else if (filter.due === 'upcoming') {
    rows = rows.filter((r) => r.mistake.nextReviewAt !== null && r.mistake.nextReviewAt > today)
  }
  if (filter.keyword?.trim()) {
    const k = filter.keyword.trim().toLowerCase()
    rows = rows.filter((r) => {
      const m = r.mistake
      return (
        String(m.year).includes(k) ||
        String(m.qno) === k ||
        m.knowledgeTags.some((t) => t.toLowerCase().includes(k)) ||
        m.reasonTags.some((t) => t.toLowerCase().includes(k)) ||
        (m.note ?? '').toLowerCase().includes(k) ||
        (m.myAnswer ?? '').toLowerCase().includes(k) ||
        (r.question?.answerText ?? '').toLowerCase().includes(k)
      )
    })
  }

  const sort = filter.sort ?? 'due'
  rows.sort((a, b) => {
    if (sort === 'newest') return b.mistake.createdAt - a.mistake.createdAt
    if (sort === 'year') return b.mistake.year - a.mistake.year || b.mistake.qno - a.mistake.qno
    if (sort === 'lapses') return b.mistake.lapses - a.mistake.lapses
    const ad = a.mistake.nextReviewAt ?? '9999-99-99'
    const bd = b.mistake.nextReviewAt ?? '9999-99-99'
    return ad.localeCompare(bd) || b.mistake.lapses - a.mistake.lapses
  })
  return rows
}

export async function dueMistakes(limit = 30): Promise<MistakeWithQuestion[]> {
  const rows = await queryMistakes({ due: 'due', sort: 'due' })
  return rows.slice(0, limit)
}

export async function countDue(): Promise<number> {
  const res = await cloud.database
    .from('mistakes')
    .select('id', { count: 'exact', head: true })
    .lte('next_review_at', todayStr())
  if (res.error) return 0
  return res.count ?? 0
}

export async function mistakeQuestionMap(): Promise<Map<string, Mistake>> {
  const all = await listMistakes()
  return new Map(all.map((m) => [m.questionId, m]))
}

export async function allKnowledgeTags(): Promise<{ tag: string; count: number }[]> {
  return countTags(await listMistakes(), 'knowledgeTags')
}

export async function allReasonTags(): Promise<{ tag: string; count: number }[]> {
  return countTags(await listMistakes(), 'reasonTags')
}

function countTags(list: Mistake[], key: 'knowledgeTags' | 'reasonTags') {
  const map = new Map<string, number>()
  for (const m of list) for (const t of m[key]) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
}

/* ---------------- 统计 ---------------- */

export async function computeStats(): Promise<Stats> {
  const [mistakes, reviewRes] = await Promise.all([
    listMistakes(),
    cloud.database
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .gte('reviewed_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])
  const today = todayStr()
  const bySubject: Record<Subject, number> = { math2: 0, cs408: 0 }
  const yearMap = new Map<number, number>()
  const byMastery: [number, number, number] = [0, 0, 0]

  for (const m of mistakes) {
    bySubject[m.subject] = (bySubject[m.subject] ?? 0) + 1
    yearMap.set(m.year, (yearMap.get(m.year) ?? 0) + 1)
    byMastery[m.mastery] += 1
  }

  return {
    total: mistakes.length,
    bySubject,
    byYear: [...yearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
    byTag: countTags(mistakes, 'knowledgeTags').slice(0, 12),
    byReason: countTags(mistakes, 'reasonTags'),
    byMastery,
    dueToday: mistakes.filter((m) => m.nextReviewAt !== null && m.nextReviewAt <= today).length,
    graduated: mistakes.filter((m) => m.nextReviewAt === null).length,
    last30Days: reviewRes.error ? 0 : (reviewRes.count ?? 0),
  }
}

/* ---------------- 维护 ---------------- */

export async function wipeAll(onProgress?: (done: number, total: number) => void): Promise<void> {
  const papers = await listPapers()
  for (let i = 0; i < papers.length; i++) {
    await deletePaper(papers[i].id)
    onProgress?.(i + 1, papers.length)
  }
  // 兜底：清掉可能残留的独立记录
  await cloud.database.from('reviews').delete().neq('id', 0)
  await cloud.database.from('mistakes').delete().neq('id', 0)
  await cloud.database.from('questions').delete().neq('id', 0)
  emit()
}

export function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))]
}

export { uid }
