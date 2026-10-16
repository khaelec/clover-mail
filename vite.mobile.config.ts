import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string

// The desktop CSP (`connect-src 'self'`) would block the in-app updater from
// fetching the update manifest / APK from GitHub. Allow https for connections
// and remote images/media.
const MOBILE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: clover-media: http: https:; media-src 'self' data: blob: clover-media: http: https:; font-src 'self' data:; connect-src 'self' https: http:; object-src 'none'; base-uri 'self'; worker-src 'self' blob:; frame-src 'self' clover-media: blob: data: https: http:"

function mobileCspPlugin(): Plugin {
  return {
    name: 'clover-mobile-csp',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=")[^"]*(")/i,
        `$1${MOBILE_CSP}$2`
      )
    }
  }
}

/**
 * WebView UI for the Android app: the existing React renderer, built as a static
 * site into dist-mobile (which is the Capacitor webDir). The phone engine lives
 * beside it at dist-mobile/nodejs and is reached over the message channel, so no
 * network CSP is needed.
 *
 * emptyOutDir is false so this build does not wipe the nodejs/ project that
 * `npm run mobile:engine` wrote first.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  build: {
    outDir: resolve('dist-mobile'),
    emptyOutDir: false,
    minify: 'esbuild',
    sourcemap: false
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  // The app version is baked in so the updater works even when the engine is
  // down (it must not depend on app:info).
  define: { __CLOVER_BENCH__: JSON.stringify(false), __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), mobileCspPlugin()]
})
