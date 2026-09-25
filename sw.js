/*
 * Service Worker cho QMath (qmath.io.vn)
 * Chiến lược:
 *  - Trang HTML (điều hướng): NETWORK-FIRST -> luôn lấy bản mới nhất khi có mạng,
 *    mất mạng thì dùng bản đã cache (vẫn mở được app).
 *  - File tĩnh cùng domain (css/js/ảnh/font): STALE-WHILE-REVALIDATE -> hiện ngay
 *    từ cache, đồng thời tải ngầm bản mới cho lần sau.
 *  - CDN tin cậy (cdnjs, gstatic, google fonts): tương tự.
 *  - TUYỆT ĐỐI KHÔNG cache: Firestore/Firebase API, Cloudflare Worker (ngân hàng
 *    câu hỏi), API biên dịch TikZ, Gemini API, mọi request không phải GET.
 *
 * LƯU Ý KHI CẬP NHẬT WEB: tăng số VERSION bên dưới (v1 -> v2 -> ...) rồi deploy,
 * service worker mới sẽ tự xóa cache cũ. Không tăng cũng không sao với HTML
 * (network-first) nhưng nên tăng khi đổi styles.css/utils.js để chắc chắn.
 */

const VERSION = 'qmath-v20-supabase';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const CDN_CACHE = `${VERSION}-cdn`;

// Các host KHÔNG BAO GIỜ được cache (dữ liệu động / API)
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebasestorage.googleapis.com',
  'generativelanguage.googleapis.com',
  'workers.dev',
  'api.qmath.io.vn',
  'compile.qmath.io.vn',
];

// CDN tĩnh cho phép cache
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
];

// Đuôi file tĩnh cùng domain được cache
const STATIC_EXT = /\.(css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i;

self.addEventListener('install', (event) => {
  // Precache khung tối thiểu để offline vẫn mở được
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(['/styles.css', '/manifest.json']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // không đụng POST/PUT...

  const url = new URL(req.url);

  // Khi phát triển trên localhost luôn lấy trực tiếp từ máy chủ.
  // Không trả giao diện cũ từ cache nếu server đã dừng.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // 1. API / dữ liệu động: để trình duyệt tự xử lý, SW không can thiệp
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h) || url.hostname.includes(h))) {
    return;
  }

  // 2. Trang HTML (điều hướng): network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('/index.html'))
            .then((r) => r || new Response('<h1>Mất kết nối</h1><p>Kiểm tra mạng rồi tải lại trang nhé.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
        )
    );
    return;
  }

  // 3. File code adapter DB Supabase: luôn NETWORK-FIRST để không bao giờ bị lệch phiên bản module
  if (url.origin === self.location.origin && (url.pathname.includes('supabase-db-compat') || url.pathname.includes('supabase-client'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. File tĩnh cùng domain: stale-while-revalidate
  if (url.origin === self.location.origin && STATIC_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // 5. CDN tin cậy: stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // 6. Còn lại: mặc định qua mạng, không cache
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit); // mất mạng -> đành dùng bản cache (nếu có)
      return hit || refresh.then((r) => r || Response.error());
    })
  );
}
