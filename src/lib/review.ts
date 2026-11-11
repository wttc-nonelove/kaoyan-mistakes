import { addDays } from './utils'

export const INTERVALS = [1, 2, 4, 7, 15, 30] as const

export type ReviewResult = 0 | 1 | 2

export interface ScheduleInput {
  stage: number
  masterStreak: number
  lapses: number
  reviewCount: number
}

export interface ScheduleOutput {
  stage: number
  masterStreak: number
  lapses: number
  reviewCount: number
  intervalDays: number
  nextReviewAt: string | null
  mastery: 0 | 1 | 2
  graduated: boolean
}

/**
 * 艾宾浩斯式排程：阶段 0-5 对应 1/2/4/7/15/30 天。
 * 忘记 → 回 0 阶、明天再来；模糊 → 降 1 阶；掌握 → 升 1 阶，连续 3 次且已到 4 阶即毕业。
 */
export function computeSchedule(
  m: ScheduleInput,
  result: ReviewResult,
  today: string,
): ScheduleOutput {
  let stage: number
  let streak = m.masterStreak
  let lapses = m.lapses

  if (result === 2) {
    stage = Math.min(m.stage + 1, 5)
    streak = m.masterStreak + 1
  } else if (result === 1) {
    stage = Math.max(m.stage - 1, 0)
    streak = 0
  } else {
    stage = 0
    streak = 0
    lapses = m.lapses + 1
  }

  const intervalDays = INTERVALS[stage]
  const graduated = result === 2 && stage >= 4 && streak >= 3
  const nextReviewAt = graduated ? null : addDays(today, intervalDays)
  const mastery: 0 | 1 | 2 = graduated ? 2 : stage === 0 ? 0 : stage <= 2 ? 1 : 2

  return {
    stage,
    masterStreak: streak,
    lapses,
    reviewCount: m.reviewCount + 1,
    intervalDays,
    nextReviewAt,
    mastery,
    graduated,
  }
}
