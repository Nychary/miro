import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Приложение состоит из трёх точек входа:
//   index.html   — грузится самим Miro как sdkUri, вешает обработчик на иконку приложения
//   app.html     — панель в сайдбаре, где живёт весь интерфейс
//   builder.html — та же панель, открытая просто ссылкой, без Miro вообще
export default defineConfig({
  // На GitHub Pages сайт живёт не в корне домена, а в папке с именем
  // репозитория, и без этого ссылки на скрипты и стили ведут в никуда.
  // Локально переменная не задана, и база остаётся корневой.
  base: process.env.BASE_PATH ?? '/',
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
        builder: resolve(import.meta.dirname, 'builder.html'),
      },
    },
  },
})
