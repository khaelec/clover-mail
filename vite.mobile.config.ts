import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string

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
  plugins: [react(), tailwindcss()]
})
