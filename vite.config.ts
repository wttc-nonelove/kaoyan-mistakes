import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

// 本地固定 5273；线上由平台注入 PORT
const port = Number(process.env.PORT) || 5273

export default defineConfig({
  // 相对路径：既能部署在域名根目录，也能部署在 GitHub Pages 的 /<repo>/ 子路径下
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port,
    strictPort: false,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
})
