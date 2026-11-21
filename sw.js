// Dewgal · service worker (notifications)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  const titre = d.titre || 'Dewgal';
  const opts = {
    body: d.texte || 'Vous avez un nouveau message',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/badge-96.png',
    tag: d.tag || 'dewgal',
    renotify: true,
    data: { url: d.url || '/annonces.html' },
  };
  const tasks = [self.registration.showNotification(titre, opts)];
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push(d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks).catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url === url && 'focus' in w) return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
