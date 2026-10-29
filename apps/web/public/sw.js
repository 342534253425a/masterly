/* Masterly service worker: офлайн-режим и кэширование (PWA). Без сторонних библиотек. */
const VERSION = 'v1';
const STATIC_CACHE = `mly-static-${VERSION}`;
const PAGES_CACHE = `mly-pages-${VERSION}`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Web Push: полезная нагрузка уже расшифрована браузером (RFC 8291) — { title, body, href, tag }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Masterly', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      data: { href: data.href || '/' },
    }),
  );
});

// Клик по уведомлению: фокус на открытой вкладке сайта или новая вкладка по ссылке уведомления
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || '/', self.location.origin);
  if (href.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === href.origin);
      return open ? open.focus().then(() => open.navigate(href.href)) : self.clients.openWindow(href.href);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API — только сеть: данные должны быть свежими, приватные ответы не кэшируем
  if (url.pathname.startsWith('/api/')) return;

  // Хэшированные статические ассеты Next.js — cache-first (иммутабельны)
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Навигация — network-first с офлайн-фолбэком на последнюю версию страницы
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))),
    );
  }
});
