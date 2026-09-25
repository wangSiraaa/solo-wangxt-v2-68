/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// maxrects-packer 的 package.json 没有 exports 字段：
// Node/Vitest 会把邻近带 .mjs 的 UMD .js 按 ESM 加载导致 CJS 分支失效，
// 这里显式指向其 ESM 产物（浏览器构建本来也会解析到同一文件）。
const maxRectsEsm = new URL(
  './node_modules/maxrects-packer/dist/maxrects-packer.mjs',
  import.meta.url,
).pathname;

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      'maxrects-packer': maxRectsEsm,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
