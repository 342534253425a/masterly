# Пустая папка `pages/`

Next.js ищет Pages Router в `pages/` и `src/pages/`. В проекте `src/pages` — это слой **pages** из
Feature-Sliced Design, а не роутер. Пустая `pages/` в корне приложения не даёт Next.js принять FSD-слой
за Pages Router (официальная рекомендация FSD для Next.js App Router).

Маршрутизация — в `app/` (тонкие файлы `page.tsx`, реэкспортирующие страницы из `src/pages`).
