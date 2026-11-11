const C = "sm-v7-2", A = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
});
// Daily reminder: the server sends an empty push; the text is fetched here so it matches the student's language.
self.addEventListener("push", e => e.waitUntil((async () => {
  let m = null;
  try {
    const s = await self.registration.pushManager.getSubscription();
    if (s) { const r = await fetch(new URL("api/message", self.registration.scope), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint }) }); if (r.ok) m = await r.json(); }
  } catch (_) {}
  if (!m) m = new Date().getHours() < 12 ? { title: "सुप्रभात! पढ़ाई का समय ☀️", body: "आज की पढ़ाई शुरू करें।", tag: "morning" } : { title: "शाम की पढ़ाई का समय 🌙", body: "आज के पाठ दोहराएँ।", tag: "evening" };
  await self.registration.showNotification(m.title, { body: m.body, tag: m.tag || "sm", renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { url: new URL("./#/Dashboard", self.registration.scope).href } });
})()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => { const w = l.find(c => c.url.startsWith(self.registration.scope)); return w ? w.focus() : self.clients.openWindow(url); }));
});
