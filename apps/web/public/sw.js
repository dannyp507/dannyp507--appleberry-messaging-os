self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function (event) {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'AppleBerry', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'AppleBerry', {
      body: payload.body || '',
      icon: '/appleberry-logo.png',
      badge: '/appleberry-logo.png',
      tag: payload.tag || 'appleberry-inbox',
      renotify: true,
      data: { url: payload.url || '/inbox' },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
