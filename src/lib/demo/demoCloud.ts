/**
 * 演示模式的本地实现。
 *
 * 目标：让同一份页面代码在不连云端的情况下跑起来（GitHub Pages 上给人点）。
 * 做法不是重写业务逻辑，而是替换 `cloud` 这个对象本身 —— 用一个内存版的
 * PostgREST + 存储 + 登录，接口形状和 SDK 保持一致，上层的 repo.ts 完全不用改。
 *
 * 覆盖范围只到 repo.ts 实际用到的那些调用：select / insert / update / delete /
 * order / range / eq / neq / lte / gte / maybeSingle / rpc，以及带
 * `question:questions(...)` 的一层关联。
 */

type Row = Record<string, unknown>
type Result<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number | null }

/* ---------------- 演示数据 ---------------- */

const SUBJECT_LABEL: Record<string, string> = { math2: '数学二', cs408: '408' }

function blankQtype(subject: string, qno: number): string {
  if (subject === 'cs408') return qno <= 40 ? 'choice' : 'solution'
  return qno <= 10 ? 'choice' : qno <= 16 ? 'blank' : 'solution'
}

function seed() {
  const now = Date.now()
  const papers: Row[] = []
  const questions: Row[] = []
  const mistakes: Row[] = []
  const reviews: Row[] = []

  const defs = [
    { subject: 'cs408', year: 2019, count: 12, pageCount: 7 },
    { subject: 'math2', year: 2024, count: 10, pageCount: 2 },
  ]

  let pid = 1
  let qid = 1
  for (const d of defs) {
    papers.push({
      id: pid,
      owner_id: 'demo-user',
      subject: d.subject,
      year: d.year,
      variant: '真题',
      title: `${d.year} ${SUBJECT_LABEL[d.subject]}`,
      page_count: d.pageCount,
      status: 'ready',
      source_path: null,
      source_bytes: 0,
      cut_state: null,
      created_at: new Date(now - pid * 86400000).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    for (let n = 1; n <= d.count; n++) {
      questions.push({
        id: qid,
        owner_id: 'demo-user',
        paper_id: pid,
        subject: d.subject,
        year: d.year,
        qno: n,
        qtype: blankQtype(d.subject, n),
        stem_parts: [
          {
            p: `papers/${pid}/q/${n}-1.jpg`,
            t: `papers/${pid}/q/${n}-1.thumb.jpg`,
            w: 1400,
            h: d.subject === 'cs408' ? 430 : 520,
          },
        ],
        answer_parts: [],
        answer_text: '',
        analysis_text: '',
        created_at: new Date(now).toISOString(),
      })
      qid++
    }
    pid++
  }

  // 造 6 条错题，覆盖不同掌握度和到期状态，让错题本 / 复习 / 统计都有内容
  const picks = [
    { q: 1, k: ['顺序表'], r: ['概念混淆'], mastery: 0, due: 0 },
    { q: 3, k: ['时间复杂度'], r: ['粗心'], mastery: 1, due: 0 },
    { q: 5, k: ['二叉树'], r: ['思路卡住'], mastery: 2, due: -3 },
    { q: 8, k: ['排序'], r: ['计算失误'], mastery: 0, due: 0 },
    { q: 13, k: ['极限'], r: ['公式记错'], mastery: 1, due: 0 },
    { q: 17, k: ['定积分'], r: ['思路卡住'], mastery: 2, due: 5 },
  ]
  let mid = 1
  for (const p of picks) {
    const q = questions.find((x) => x.qno === p.q && x.paper_id === (p.q > 12 ? 2 : 1))
    if (!q) continue
    mistakes.push({
      id: mid,
      owner_id: 'demo-user',
      question_id: q.id,
      subject: q.subject,
      year: q.year,
      qno: q.qno,
      knowledge_tags: p.k,
      reason_tags: p.r,
      note: '',
      my_answer: '',
      mastery: p.mastery,
      starred: mid === 2,
      wrong_at: new Date(now - mid * 86400000).toISOString().slice(0, 10),
      stage: [0, 1, 3, 0, 1, 4][mid - 1] ?? 0,
      master_streak: p.mastery === 2 ? 2 : 0,
      lapses: mid === 4 ? 2 : 0,
      review_count: mid,
      last_reviewed_at: new Date(now - 86400000).toISOString(),
      next_review_at: new Date(now + p.due * 86400000).toISOString().slice(0, 10),
      graduated_at: null,
      created_at: new Date(now - mid * 86400000).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    reviews.push({
      id: mid,
      owner_id: 'demo-user',
      mistake_id: mid,
      result: 2,
      prev_stage: 0,
      next_stage: 1,
      interval_days: 1,
      next_review_at: new Date(now + 86400000).toISOString().slice(0, 10),
      duration_ms: null,
      reviewed_at: new Date(now - 86400000).toISOString(),
    })
    mid++
  }

  return { papers, questions, mistakes, reviews }
}

/* ---------------- 内存数据库 ---------------- */

type Op =
  | { k: 'eq' | 'neq' | 'lte' | 'gte'; col: string; v: unknown }
  | { k: 'order'; col: string; asc: boolean }
  | { k: 'range'; from: number; to: number }

class Query<T = Row> implements PromiseLike<Result<T>> {
  private ops: Op[] = []
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private cols = '*'
  private countOnly = false
  private singleMode = false
  private maybe = false

  constructor(
    private db: DemoDb,
    private table: string,
  ) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.cols = cols
    if (opts?.count) this.countOnly = true
    return this
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.payload = payload
    return this
  }
  update(payload: Row) {
    this.mode = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(col: string, v: unknown) {
    this.ops.push({ k: 'eq', col, v })
    return this
  }
  neq(col: string, v: unknown) {
    this.ops.push({ k: 'neq', col, v })
    return this
  }
  lte(col: string, v: unknown) {
    this.ops.push({ k: 'lte', col, v })
    return this
  }
  gte(col: string, v: unknown) {
    this.ops.push({ k: 'gte', col, v })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.ops.push({ k: 'order', col, asc: opts?.ascending !== false })
    return this
  }
  range(from: number, to: number) {
    this.ops.push({ k: 'range', from, to })
    return this
  }
  maybeSingle() {
    this.maybe = true
    return this
  }
  single() {
    this.singleMode = true
    return this
  }

  private match(row: Row): boolean {
    return this.ops.every((op) => {
      if (op.k === 'order' || op.k === 'range') return true
      const a = row[op.col]
      if (op.k === 'eq') return String(a) === String(op.v)
      if (op.k === 'neq') return String(a) !== String(op.v)
      if (op.k === 'lte') return String(a) <= String(op.v)
      return String(a) >= String(op.v)
    })
  }

  private run(): Result<T> {
    const t = this.db.table(this.table)
    if (this.mode === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const added = list.map((r) => {
        const id = this.db.nextId(this.table)
        return { owner_id: this.db.userId, created_at: new Date().toISOString(), ...r, id }
      })
      t.push(...added)
      this.db.persist()
      return { data: added as T, error: null }
    }

    if (this.mode === 'update') {
      const hit = t.filter((r) => this.match(r))
      for (const r of hit) Object.assign(r, this.payload)
      this.db.persist()
      return { data: hit as T, error: null }
    }

    if (this.mode === 'delete') {
      const remain = t.filter((r) => !this.match(r))
      const removed = t.filter((r) => this.match(r))
      this.db.replace(this.table, remain)
      this.db.persist()
      return { data: removed as T, error: null }
    }

    let rows = t.filter((r) => this.match(r))
    for (const op of this.ops) {
      if (op.k === 'order') {
        rows = [...rows].sort((a, b) => {
          const x = a[op.col]
          const y = b[op.col]
          const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
          return op.asc ? c : -c
        })
      }
    }

    if (this.countOnly) {
      return { data: null, error: null, count: rows.length }
    }

    const range = this.ops.find((o) => o.k === 'range') as { from: number; to: number } | undefined
    if (range) rows = rows.slice(range.from, range.to + 1)

    if (this.cols.includes('question:questions')) {
      const qs = this.db.table('questions')
      rows = rows.map((r) => ({
        ...r,
        question: qs.find((q) => String(q.id) === String(r.question_id)) ?? null,
      }))
    }

    if (this.maybe || this.singleMode) {
      if (!rows.length) return { data: null, error: null }
      return { data: rows[0] as T, error: null }
    }
    return { data: rows as T, error: null }
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((v: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

class DemoDb {
  userId = 'demo-user'
  private data = seed()
  private store: Record<string, Row[]> = {
    papers: this.data.papers,
    questions: this.data.questions,
    mistakes: this.data.mistakes,
    reviews: this.data.reviews,
  }

  table(name: string): Row[] {
    if (!this.store[name]) this.store[name] = []
    return this.store[name]
  }
  replace(name: string, rows: Row[]) {
    this.store[name] = rows
  }
  nextId(name: string): number {
    const rows = this.table(name)
    return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
  }
  persist() {
    try {
      window.localStorage.setItem('demo-db', JSON.stringify(this.store))
    } catch {
      /* 配额满了就算了，内存里还在 */
    }
  }
  restore() {
    try {
      const raw = window.localStorage.getItem('demo-db')
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, Row[]>
      if (parsed?.papers?.length) this.store = parsed
    } catch {
      /* 忽略损坏的存档 */
    }
  }
  reset() {
    this.store = seed() as unknown as Record<string, Row[]>
    this.persist()
  }
}

export const demoDb = new DemoDb()
demoDb.restore()

/* ---------------- 假图片 ---------------- */

const imgCache = new Map<string, string>()

/** 用 canvas 画一张"示意题目"图，避免把真题打包进仓库 */
function fakeImage(path: string, w = 1000, h = 320): string {
  const hit = imgCache.get(path)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#e8e6df'
  g.lineWidth = 1
  for (let y = 48; y < h; y += 34) {
    g.beginPath()
    g.moveTo(40, y)
    g.lineTo(w - 40, y)
    g.stroke()
  }
  const m = /q\/(\d+)-/.exec(path)
  const n = m ? m[1] : '?'
  g.fillStyle = '#1c1b18'
  g.font = '600 26px ui-sans-serif, system-ui, sans-serif'
  g.fillText(`第 ${n} 题`, 46, 34)
  g.fillStyle = '#8a8778'
  g.font = '400 18px ui-sans-serif, system-ui, sans-serif'
  g.fillText('演示模式：这里显示的是示意占位图', 150, 34)
  g.fillStyle = '#d8d5c9'
  for (let i = 0; i < 3; i++) {
    const yy = 80 + i * 34
    g.fillRect(46, yy - 14, 420 + ((i * 137) % 380), 12)
    g.fillRect(46, yy + 6, 300 + ((i * 91) % 420), 12)
  }
  g.fillStyle = '#b9b5a4'
  g.font = '400 16px ui-sans-serif, system-ui, sans-serif'
  g.fillText('上传并切分自己的真题后，这里会显示真实题目。', 46, h - 26)
  const url = c.toDataURL('image/jpeg', 0.8)
  imgCache.set(path, url)
  return url
}

/* ---------------- 对外：冒名顶替 cloud ---------------- */

const ok = <T>(data: T): Result<T> => ({ data, error: null })

export const demoCloud = {
  database: {
    from: (table: string) => new Query(demoDb, table),
    rpc: async (name: string, args: Record<string, unknown>): Promise<Result<Row>> => {
      if (name === 'quick_mark') {
        const q = demoDb
          .table('questions')
          .find(
            (r) => r.subject === args.p_subject && Number(r.year) === Number(args.p_year) && Number(r.qno) === Number(args.p_qno),
          )
        if (!q) return { data: null, error: { message: '题目不存在' } }
        const exist = demoDb.table('mistakes').find((m) => String(m.question_id) === String(q.id))
        if (exist) return ok(exist)
        const today = new Date().toISOString().slice(0, 10)
        const row: Row = {
          id: demoDb.nextId('mistakes'),
          owner_id: demoDb.userId,
          question_id: q.id,
          subject: q.subject,
          year: q.year,
          qno: q.qno,
          knowledge_tags: args.p_knowledge ?? [],
          reason_tags: args.p_reason ?? [],
          note: '',
          my_answer: '',
          mastery: 0,
          starred: false,
          wrong_at: today,
          stage: 0,
          master_streak: 0,
          lapses: 0,
          review_count: 0,
          last_reviewed_at: null,
          next_review_at: null,
          graduated_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        demoDb.table('mistakes').push(row)
        demoDb.persist()
        return ok(row)
      }
      if (name === 'apply_review') {
        const id = Number(args.p_mistake_id)
        const m = demoDb.table('mistakes').find((x) => Number(x.id) === id)
        if (!m) return { data: null, error: { message: '错题不存在' } }
        const r = Number(args.p_result)
        const prev = Number(m.stage)
        const ns = r === 2 ? Math.min(prev + 1, 5) : r === 1 ? Math.max(prev - 1, 0) : 0
        const ivs = [1, 2, 4, 7, 15, 30]
        const iv = ivs[ns]
        const streak = r === 2 ? Number(m.master_streak) + 1 : 0
        const now = new Date()
        const nr = r === 2 && ns >= 4 && streak >= 3 ? null : new Date(now.getTime() + iv * 86400000).toISOString().slice(0, 10)
        Object.assign(m, {
          stage: ns,
          master_streak: streak,
          lapses: Number(m.lapses) + (r === 0 ? 1 : 0),
          review_count: Number(m.review_count) + 1,
          last_reviewed_at: now.toISOString(),
          next_review_at: nr,
          graduated_at: nr ? null : now.toISOString(),
          mastery: nr ? 2 : r === 0 ? 0 : r === 1 ? 1 : m.mastery,
          updated_at: now.toISOString(),
        })
        demoDb.table('reviews').push({
          id: demoDb.nextId('reviews'),
          owner_id: demoDb.userId,
          mistake_id: id,
          result: r,
          prev_stage: prev,
          next_stage: ns,
          interval_days: iv,
          next_review_at: nr,
          duration_ms: args.p_duration_ms ?? null,
          reviewed_at: now.toISOString(),
        })
        demoDb.persist()
        return ok(m)
      }
      return { data: null, error: { message: '演示模式不支持该操作' } }
    },
  },
  storage: {
    userPath: (_uid: string, p: string) => p,
    upload: async () => ok({ id: 'demo', path: '', fullPath: '' }),
    remove: async () => ok([]),
    download: async () => ok(new Blob()),
    createSignedUrl: async (path: string) => ok({ signedUrl: fakeImage(path) }),
    createSignedUrls: async (paths: string[]) => ok(paths.map((p) => ({ path: p, signedUrl: fakeImage(p), signedURL: fakeImage(p), error: null }))),
  },
  auth: {
    getSession: async () =>
      ok({
        accessToken: 'demo',
        refreshToken: 'demo',
        expiresAt: Date.now() + 86400000,
        user: { id: 'demo-user', phone: '13800000000', isAnonymous: false },
      }),
    onAuthStateChange: () => () => {},
    signOut: async () => ok(null),
    sendOtp: async () => ({ data: null, error: { message: '演示模式不发送验证码' } }),
    verifyOtp: async () => ({ data: null, error: { message: '演示模式不验证' } }),
    signInWithPassword: async () => ({ data: null, error: { message: '演示模式请直接使用' } }),
  },
}
