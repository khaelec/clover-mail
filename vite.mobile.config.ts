import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// The phone talks to the desktop's transport server over the LAN, so the desktop
// CSP (connect-src 'self') would block it. Swap in a mobile policy: allow
// http/https/ws/wss connections and remote images/media.
const MOBILE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: clover-media: http: https:; media-src 'self' data: blob: clover-media: http: https:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; object-src 'none'; base-uri 'self'; worker-src 'self' blob:; frame-src 'self' clover-media: blob: data: https: http:"

function mobileCspPlugin(): Plugin {
  return {
    name: 'clover-mobile-csp',
    transformIndexHtml(html) {
      // The meta tag spans several lines, so allow whitespace/newlines between
      // its attributes.
      return html.replace(
        /(<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=")[^"]*(")/i,
        `$1${MOBILE_CSP}$2`
      )
    }
  }
}

/**
 * Standalone web build of the renderer for the mobile shell (Capacitor) and for
 * a plain phone browser. Unlike the Electron renderer this is served from a
 * static directory, so assets are relative (`base: './'`).
 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  build: {
    outDir: resolve('dist-mobile'),
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  define: { __CLOVER_BENCH__: JSON.stringify(false) },
  plugins: [react(), tailwindcss(), mobileCspPlugin()]
})
