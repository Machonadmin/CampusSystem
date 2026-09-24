/* Service worker של הקמפוס: קבלת פוש-התראות והקלקה עליהן.
   בכוונה בלי fetch-handler — לא נוגעים בקאשינג של Next.js. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = { title: 'הקמפוס — מכון חמש', body: '', link: '/dashboard' }
  try {
    if (event.data) data = Object.assign(data, event.data.json())
  } catch (e) { /* payload לא-JSON — נשתמש בברירת מחדל */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { link: data.link || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(link)
          return
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
