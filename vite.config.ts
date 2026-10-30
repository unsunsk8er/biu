import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import { builtinModules } from 'module'
import path from 'path'

// 生产构建注入严格 CSP；开发态不注入，避免 Vite HMR 的内联脚本被拦截。
const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
].join('; ')

const cspPlugin = {
  name: 'busic-production-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`,
    )
  },
}

// 主进程需外部化的运行时依赖：含动态 require / 读取自身资源，不能被 esbuild 打进 main.js。
// 当前主进程只依赖 electron 与 Node 内置模块；日后接入 autoUpdater 时再登记 electron-updater。
const electronExternals = [
  'electron',
  'electron-updater',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin,
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 把变化频率低的运行时依赖拆成独立 chunk：首屏可并行下载，
        // 升级业务代码时这些 vendor chunk 的缓存也不会失效。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // 注意顺序：react-router / lucide-react 的路径也包含 "react"，必须先匹配
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) return 'vendor-router'
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-')) return 'vendor-motion'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'vendor-react'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
