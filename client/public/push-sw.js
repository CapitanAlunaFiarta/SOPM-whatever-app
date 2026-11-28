/* Notificările Whatever pe web (Web Push, fără Firebase).
 * Serverul trimite un mesaj criptat {title, body, url, tag}; browserul îl decriptează și îl dă acestui service worker,
 * care afișează notificarea. La apăsare se deschide (sau se aduce în față) aplicația, pe ruta din `url`.
 * Nu interceptează cererile paginii (fără handler `fetch`), deci nu ține nimic în cache.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Whatever';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/notification-badge.png',
    tag: data.tag || undefined,
    // Același tag (ex. aceeași conversație): notificarea nouă o înlocuiește pe cea veche, dar tot sună.
    renotify: Boolean(data.tag),
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      // Aplicația deschisă navighează singură (fără reîncărcare); vezi NotificationBridge.web.tsx.
      open.postMessage({ type: 'whatever-open', url: path });
      return;
    }
    await self.clients.openWindow(path);
  })());
});
