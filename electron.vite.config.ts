import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// The dev server needs inline/eval'd scripts (react-refresh) and a websocket for
// HMR, which the production CSP forbids. Only enabled while serving, so the
// shipped index.html keeps the strict policy.
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: clover-media: http: https:; media-src 'self' data: blob: clover-media: http: https:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; worker-src 'self' blob:; frame-src 'self' clover-media: blob: data: https: http:"

function devCspPlugin(): Plugin {
  return {
    name: 'clover-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/i,
        `$1${DEV_CSP}$2`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { minify: 'esbuild', sourcemap: false },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          // The main-window preload, and a small preload injected into every
          // embedded-app webview to capture its notifications.
          index: resolve('src/preload/index.ts'),
          app: resolve('src/preload/app.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: { minify: 'esbuild', sourcemap: false },
    // Bench instrumentation is compiled in only when CLOVER_BENCH=1, so a normal
    // build dead-code-eliminates it (see src/renderer/src/bench.tsx).
    define: { __CLOVER_BENCH__: JSON.stringify(process.env.CLOVER_BENCH === '1') },
    plugins: [react(), tailwindcss(), devCspPlugin()]
  }
})
