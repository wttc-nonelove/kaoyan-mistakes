import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { PUBLIC_CONFIG } from './cloudConfig'
import { demoCloud } from './demo/demoCloud'

type Row = Record<string, unknown>
type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] }

/** 只为拿到类型：四张表的读写都是自由列，具体字段由 repo 的映射层负责 */
export interface DB {
  public: {
    Tables: {
      papers: Table
      questions: Table
      mistakes: Table
      reviews: Table
    }
    Views: Record<string, never>
    Functions: {
      quick_mark: {
        Args: {
          p_subject: string
          p_year: number
          p_qno: number
          p_knowledge: string[]
          p_reason: string[]
        }
        Returns: Row
      }
      apply_review: {
        Args: { p_mistake_id: number; p_result: number; p_duration_ms: number | null }
        Returns: Row
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

/**
 * 演示模式：不连云端，数据全在浏览器里（内存 + localStorage）。
 * 触发条件：构建时传了 VITE_DEMO=1，或者没配 publishableKey —— 部署到
 * GitHub Pages 时反正过不了 Origin 校验，不如给个能点的演示。
 */
export const isDemoMode =
  import.meta.env.VITE_DEMO === '1' ||
  import.meta.env.MODE === 'demo' ||
  !PUBLIC_CONFIG.publishableKey

function makeReal() {
  // endpoint 不传：数据面与应用同域，同源永远正确，
  // 也避免把实例域名写死在产物里（换域名后旧地址会失效）
  return createWorkBuddyCloud<DB>({
    oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
    publishableKey: PUBLIC_CONFIG.publishableKey,
  })
}

/** 全局唯一客户端：auth / database / storage 共用同一份配置与会话 */
export const cloud = (isDemoMode ? demoCloud : makeReal()) as unknown as ReturnType<typeof makeReal>

/** 当前登录用户 id（存储路径要用），由 useAuth 维护 */
let currentUserId: string | null = null

export function setCurrentUserId(id: string | null) {
  currentUserId = id
}

export function getCurrentUserId(): string | null {
  return currentUserId
}

export function requireUserId(): string {
  if (!currentUserId) throw new Error('未登录，无法访问数据')
  return currentUserId
}

export interface ApiError {
  message: string
  code?: string
}
