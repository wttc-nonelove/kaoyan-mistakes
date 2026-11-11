import { jsPDF } from 'jspdf'
import { addMistake, createPaper, listAllQuestions, listMistakes, updateMistake } from './repo'
import { putBlob } from './blobStore'
import { todayStr, uid } from './utils'
import { allKnowledgeTagsFor, guessQType, REASON_TAGS } from './tags'
import type { QType } from '../types'

/** 生成一页模拟试卷内容（英文数字，避免中文字体问题） */
function drawQuestion(doc: jsPDF, y: number, n: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`${n}. The function f(x) is continuous on [0, 1]. Which is correct?`, 60, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let cy = y + 16
  doc.text(`(A) f has a maximum on [0, 1]        (B) f'(x) exists for all x`, 66, cy)
  cy += 13
  doc.text(`(C) the integral of f equals 0        (D) f is differentiable at 0`, 66, cy)
  cy += 13
  doc.text(`Compute the value and write the reasoning steps below.`, 60, cy)
  return cy + 10
}

export async function seedDemoPaper(subject: 'math2' | 'cs408' = 'math2'): Promise<string> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let n = 1
  const totalPages = 3
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`Mock Exam Paper - Page ${p}`, 60, 46)
    doc.setDrawColor(200)
    doc.line(60, 54, 535, 54)

    let y = 84
    const perPage = 8
    for (let i = 0; i < perPage; i++) {
      y = drawQuestion(doc, y, n) + 34
      n++
      if (y > 760) break
    }
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(`- ${p} -`, 297, 812, { align: 'center' })
    doc.setTextColor(0)
  }

  const buf = doc.output('arraybuffer')
  const key = `src/${uid()}.pdf`
  await putBlob(key, new Blob([buf], { type: 'application/pdf' }))
  const paper = await createPaper({
    subject,
    year: 2025,
    variant: '示例卷',
    pageCount: totalPages,
    sourcePath: key,
    sourceBytes: buf.byteLength,
  })
  return paper.id
}

export async function seedDemoMistakes(count = 6): Promise<number> {
  const questions = (await listAllQuestions()).slice(0, count)
  if (!questions.length) return 0
  let made = 0
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const tags = allKnowledgeTagsFor(q.subject)
    await addMistake(q, {
      knowledge: [tags[i % tags.length]],
      reason: [REASON_TAGS[i % REASON_TAGS.length]],
    })
    made++
  }
  return made
}

export function guessType(subject: 'math2' | 'cs408', n: number): QType {
  return guessQType(subject, n)
}

/** 把三道错题的到期日改成今天，方便验证复习流程 */
export async function makeSomeDue(count = 3): Promise<number> {
  const all = await listMistakes()
  const today = todayStr()
  let n = 0
  for (const m of all) {
    if (n >= count) break
    if (m.nextReviewAt === null) continue
    await updateMistake(m.id, { nextReviewAt: today })
    n++
  }
  return n
}
