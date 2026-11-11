import type { MistakeWithQuestion } from '../../types'
import { getObjectUrl } from '../blobStore'
import { SUBJECT_LABEL } from '../tags'
import type { ExportCard, ExportImage } from './layout'

async function toImages(parts: { p: string; w: number; h: number }[] | undefined): Promise<ExportImage[]> {
  if (!parts?.length) return []
  const out: ExportImage[] = []
  for (const part of parts) {
    const url = await getObjectUrl(part.p)
    if (url) out.push({ url, w: part.w, h: part.h })
  }
  return out
}

export async function buildExportCards(rows: MistakeWithQuestion[]): Promise<ExportCard[]> {
  const cards: ExportCard[] = []
  for (const { mistake, question } of rows) {
    if (!question) continue
    const images = await toImages(question.stemParts)
    if (!images.length) continue
    const answerImages = await toImages(question.answerParts)
    const metaParts = [
      SUBJECT_LABEL[mistake.subject],
      mistake.knowledgeTags.join('·'),
      mistake.reasonTags.length ? `错因：${mistake.reasonTags.join('/')}` : '',
      mistake.lapses > 1 ? `错 ${mistake.lapses} 次` : '',
    ].filter(Boolean)

    cards.push({
      id: mistake.id,
      title: `${mistake.year} ${SUBJECT_LABEL[mistake.subject]} · 第 ${mistake.qno} 题`,
      meta: metaParts.join('  '),
      qtype: question.qtype,
      images,
      answerImages,
      answerText: question.answerText,
      analysisText: question.analysisText,
      note: mistake.note,
      myAnswer: mistake.myAnswer,
    })
  }
  return cards
}
