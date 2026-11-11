import { cloud, requireUserId } from './cloud'

/**
 * 私有存储适配层。key 用相对路径（例如 papers/12/q/18-1.jpg），
 * 实际路径由 SDK 的 userPath 拼成 users/<uid>/...，不允许客户端拼绝对路径。
 */

const SIGNED_TTL = 3600 // 签名 URL 有效期（秒）
const REFRESH_AHEAD = 300 // 提前 5 分钟换新
const cache = new Map<string, { url: string; exp: number }>()

function fullPath(key: string): string {
  return cloud.storage.userPath(requireUserId(), key)
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const res = await cloud.storage.upload(fullPath(key), blob, {
    contentType: blob.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  })
  if (res.error) throw new Error(res.error.message || '图片上传失败')
  cache.delete(key)
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const res = await cloud.storage.download(fullPath(key))
  if (res.error || !res.data) return undefined
  return res.data
}

export async function getObjectUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const res = await cloud.storage.createSignedUrl(fullPath(key), SIGNED_TTL)
  if (res.error || !res.data) return null
  const url = res.data.signedUrl
  cache.set(key, { url, exp: Date.now() + (SIGNED_TTL - REFRESH_AHEAD) * 1000 })
  return url
}

export async function deleteBlob(key: string): Promise<void> {
  cache.delete(key)
  await cloud.storage.remove([fullPath(key)])
}

export async function deleteBlobs(keys: string[]): Promise<void> {
  if (!keys.length) return
  for (const k of keys) cache.delete(k)
  // 分批，避免一次请求过长
  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40).map(fullPath)
    await cloud.storage.remove(batch)
  }
}

export function invalidateBlob(key: string) {
  cache.delete(key)
}

export function clearUrlCache() {
  cache.clear()
}

/** 删除某套卷的所有图片（按 key 前缀） */
export function partsKeys(parts: { p: string; t?: string }[]): string[] {
  return parts.flatMap((x) => (x.t ? [x.p, x.t] : [x.p]))
}
