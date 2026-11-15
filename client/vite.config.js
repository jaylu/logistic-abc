import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT || 3000}`,
        // 字符串简写会启用 changeOrigin，使 Host 与浏览器 Origin 不一致。
        // 保留原始 Host，让后端正常执行同源校验。
        changeOrigin: false,
      },
    },
  },
  build: { outDir: '../server/public', emptyOutDir: true },
})
