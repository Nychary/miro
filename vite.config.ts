import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Приложение состоит из двух точек входа:
//   index.html — грузится самим Miro как sdkUri, вешает обработчик на иконку приложения
//   app.html   — панель в сайдбаре, где живёт весь интерфейс
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
      },
    },
  },
})
