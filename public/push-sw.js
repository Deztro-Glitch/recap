// Påminnelser (Web Push): läses in i appens service worker (vite.config.ts, workbox.importScripts).
// send-reminders skickar { title, body, url }. Trycker man på notisen öppnas appen, eller visas den om den redan är öppen.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Recap'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'recap-paminnelse',
    data: { url: data.url || self.registration.scope },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find((c) => c.url.startsWith(self.registration.scope))
    if (open) {
      await open.focus()
      return
    }
    await self.clients.openWindow(url)
  })())
})
