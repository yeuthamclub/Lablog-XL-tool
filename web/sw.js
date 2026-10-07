// Bộ nhớ đệm để LabLog Analyzer mở được khi không có mạng (sau lần mở đầu tiên)
const CACHE = 'lablog-v1.0.0';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'fonts/fonts.css',
  'fonts/BeVietnamPro-Regular.ttf', 'fonts/BeVietnamPro-Medium.ttf', 'fonts/BeVietnamPro-SemiBold.ttf', 'fonts/BeVietnamPro-Bold.ttf',
  'fonts/IBMPlexMono-Regular.ttf', 'fonts/IBMPlexMono-Medium.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Mạng trước (để luôn có bản mới), mất mạng thì dùng bản đã lưu
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
