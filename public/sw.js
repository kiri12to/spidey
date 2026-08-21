// Spidey Service Worker
const CACHE_NAME = 'spidey-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let network handle dynamic API calls and Google Tasks requests
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('localhost')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
