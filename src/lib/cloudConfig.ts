/**
 * 云服务公开配置。这些值会出现在前端代码里，本身不含权限：
 * 服务端会用 publishableKey 绑定应用，并校验请求来源域名。
 * 不要在这里放任何密钥。
 */
export const PUBLIC_CONFIG = {
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_bbTdY12ybJkLJB8UkYxZX6_Fb7ZLZ9SJSF6yZyf39qKiORwweSRCqXL',
} as const
