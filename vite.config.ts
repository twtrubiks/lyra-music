import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // svelteTesting 只在 Vitest 下生效：讓元件測試解析到 Svelte 的 browser 版本
  plugins: [svelte(), svelteTesting()],
  // Node 17+ 預設 verbatim DNS：localhost 會優先解析成 IPv6 (::1)，
  // 使 Vite 只綁 [::1]，而 Tauri WebView 走 IPv4 (127.0.0.1) 連不到 → 空白頁。
  // 明確綁 127.0.0.1，與 tauri.conf.json 的 devUrl 一致。
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
