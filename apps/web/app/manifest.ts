import type { MetadataRoute } from 'next';

/** PWA: устанавливается на главный экран, работает офлайн (см. public/sw.js). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Masterly — проверенные мастера рядом',
    short_name: 'Masterly',
    description: 'Ремонт смартфонов: подбор мастеров, честные цены, гарантия. Без комиссий.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06060c',
    theme_color: '#06060c',
    lang: 'ru',
    categories: ['lifestyle', 'utilities', 'shopping'],
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Найти мастера', url: '/search', description: 'Поиск по проблеме и модели' },
      { name: 'Мои заявки', url: '/orders' },
      { name: 'Сообщения', url: '/messages' },
    ],
  };
}
