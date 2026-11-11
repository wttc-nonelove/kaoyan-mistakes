import type { QType, Subject } from '../types'

export const SUBJECTS: { id: Subject; label: string; short: string; desc: string }[] = [
  { id: 'math2', label: '数学二', short: '数二', desc: '高数 + 线代' },
  { id: 'cs408', label: '408', short: '408', desc: '数据结构 / 计组 / OS / 网络' },
]

export const SUBJECT_LABEL: Record<Subject, string> = {
  math2: '数二',
  cs408: '408',
}

export const KNOWLEDGE_GROUPS: Record<Subject, { group: string; tags: string[] }[]> = {
  math2: [
    {
      group: '高等数学',
      tags: [
        '函数极限连续',
        '导数与微分',
        '微分中值定理',
        '导数应用',
        '不定积分',
        '定积分',
        '定积分应用',
        '微分方程',
        '多元函数微分',
        '二重积分',
      ],
    },
    {
      group: '线性代数',
      tags: ['行列式', '矩阵', '向量组', '线性方程组', '特征值与特征向量', '二次型'],
    },
  ],
  cs408: [
    { group: '数据结构', tags: ['线性表', '栈与队列', '树与二叉树', '图', '查找', '排序'] },
    {
      group: '计算机组成原理',
      tags: ['数据表示与运算', '存储系统', '指令系统', 'CPU与流水线', '总线与IO'],
    },
    { group: '操作系统', tags: ['进程管理', '内存管理', '文件系统', 'IO管理'] },
    { group: '计算机网络', tags: ['体系结构', '物理层与链路层', '网络层', '传输层', '应用层'] },
  ],
}

export const REASON_TAGS = ['概念不清', '计算失误', '审题失误', '思路缺失', '时间不够', '粗心大意']

export const QTYPES: { id: QType; label: string }[] = [
  { id: 'choice', label: '选择题' },
  { id: 'blank', label: '填空题' },
  { id: 'solution', label: '解答/综合' },
  { id: 'unknown', label: '未分类' },
]

export const QTYPE_LABEL: Record<QType, string> = {
  choice: '选择',
  blank: '填空',
  solution: '解答',
  unknown: '未分类',
}

/** 按题号推断题型（数二：1-10 选择、11-16 填空、17 起解答；408：1-40 选择、41 起综合） */
export function guessQType(subject: Subject, qno: number): QType {
  if (subject === 'math2') {
    if (qno <= 10) return 'choice'
    if (qno <= 16) return 'blank'
    return 'solution'
  }
  if (qno <= 40) return 'choice'
  return 'solution'
}

const CUSTOM_KEY = 'kaoyan-mistakes:custom-tags'

interface CustomTags {
  math2: string[]
  cs408: string[]
}

function readCustom(): CustomTags {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return { math2: [], cs408: [] }
    const parsed = JSON.parse(raw) as Partial<CustomTags>
    return { math2: parsed.math2 ?? [], cs408: parsed.cs408 ?? [] }
  } catch {
    return { math2: [], cs408: [] }
  }
}

export function customTags(subject: Subject): string[] {
  return readCustom()[subject] ?? []
}

export function addCustomTag(subject: Subject, tag: string): void {
  const t = tag.trim()
  if (!t) return
  const cur = readCustom()
  if (cur[subject].includes(t)) return
  cur[subject] = [...cur[subject], t]
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(cur))
}

export function allKnowledgeTagsFor(subject: Subject): string[] {
  return [...KNOWLEDGE_GROUPS[subject].flatMap((g) => g.tags), ...customTags(subject)]
}
