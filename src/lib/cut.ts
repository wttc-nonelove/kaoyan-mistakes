import type { CutSegment } from '../types'

export const SEG_SCALE = 2 // 144 dpi
export const CROP_SCALE = 200 / 72
export const RATIO = CROP_SCALE / SEG_SCALE

export function mm2px(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi
}

export function sortSegs(a: CutSegment, b: CutSegment): number {
  return a.page === b.page ? a.y0 - b.y0 : a.page - b.page
}

export interface GroupedQuestion {
  group: string
  segs: CutSegment[]
  qno: number
}

/** 把段落按 group 合并成题，按出现顺序编号 */
export function groupToQuestions(
  segs: CutSegment[],
  overrides: Record<string, number>,
): GroupedQuestion[] {
  const stems = segs.filter((s) => s.role === 'stem').sort(sortSegs)
  const map = new Map<string, CutSegment[]>()
  const order: string[] = []
  for (const s of stems) {
    if (!map.has(s.group)) {
      map.set(s.group, [])
      order.push(s.group)
    }
    map.get(s.group)!.push(s)
  }
  return order.map((group, i) => ({
    group,
    segs: map.get(group)!,
    qno: overrides[group] ?? i + 1,
  }))
}
