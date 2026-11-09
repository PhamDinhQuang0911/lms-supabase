/*
 * Service Worker cho QMath (qmath.io.vn)
 * Chiáº¿n lÆ°á»£c:
 *  - Trang HTML (Ä‘iá»u hÆ°á»›ng): NETWORK-FIRST -> luÃ´n láº¥y báº£n má»›i nháº¥t khi cÃ³ máº¡ng,
 *    máº¥t máº¡ng thÃ¬ dÃ¹ng báº£n Ä‘Ã£ cache (váº«n má»Ÿ Ä‘Æ°á»£c app).
 *  - File tÄ©nh cÃ¹ng domain (css/js/áº£nh/font): STALE-WHILE-REVALIDATE -> hiá»‡n ngay
 *    tá»« cache, Ä‘á»“ng thá»i táº£i ngáº§m báº£n má»›i cho láº§n sau.
 *  - CDN tin cáº­y (cdnjs, gstatic, google fonts): tÆ°Æ¡ng tá»±.
 *  - TUYá»†T Äá»I KHÃ”NG cache: Firestore/Firebase API, Cloudflare Worker (ngÃ¢n hÃ ng
 *    cÃ¢u há»i), API biÃªn dá»‹ch TikZ, Gemini API, má»i request khÃ´ng pháº£i GET.
 *
 * LÆ¯U Ã KHI Cáº¬P NHáº¬T WEB: tÄƒng sá»‘ VERSION bÃªn dÆ°á»›i (v1 -> v2 -> ...) rá»“i deploy,
 * service worker má»›i sáº½ tá»± xÃ³a cache cÅ©. KhÃ´ng tÄƒng cÅ©ng khÃ´ng sao vá»›i HTML
 * (network-first) nhÆ°ng nÃªn tÄƒng khi Ä‘á»•i styles.css/utils.js Ä‘á»ƒ cháº¯c cháº¯n.
 */

const VERSION = 'qmath-v146-tikzjax-quicklatex';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const CDN_CACHE = `${VERSION}-cdn`;

// CÃ¡c host KHÃ”NG BAO GIá»œ Ä‘Æ°á»£c cache (dá»¯ liá»‡u Ä‘á»™ng / API)
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
  'quicklatex.com',
  'corsmirror.com',
  'codetabs.com',
];

// CDN tÄ©nh cho phÃ©p cache
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
];

// ÄuÃ´i file tÄ©nh cÃ¹ng domain Ä‘Æ°á»£c cache
const STATIC_EXT = /\.(css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i;

self.addEventListener('install', (event) => {
  // Precache khung tá»‘i thiá»ƒu Ä‘á»ƒ offline váº«n má»Ÿ Ä‘Æ°á»£c
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
  if (req.method !== 'GET') return; // khÃ´ng Ä‘á»¥ng POST/PUT...

  const url = new URL(req.url);

  // Khi phÃ¡t triá»ƒn trÃªn localhost luÃ´n láº¥y trá»±c tiáº¿p tá»« mÃ¡y chá»§.
  // KhÃ´ng tráº£ giao diá»‡n cÅ© tá»« cache náº¿u server Ä‘Ã£ dá»«ng.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // 1. API / dá»¯ liá»‡u Ä‘á»™ng: Ä‘á»ƒ trÃ¬nh duyá»‡t tá»± xá»­ lÃ½, SW khÃ´ng can thiá»‡p
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h) || url.hostname.includes(h))) {
    return;
  }

  // 2. Trang HTML (Ä‘iá»u hÆ°á»›ng): network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('/index.html'))
            .then((r) => r || new Response('<h1>Máº¥t káº¿t ná»‘i</h1><p>Kiá»ƒm tra máº¡ng rá»“i táº£i láº¡i trang nhÃ©.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
        )
    );
    return;
  }

  // 3. File code adapter DB Supabase & core utils: luÃ´n NETWORK-FIRST Ä‘á»ƒ khÃ´ng bao giá» bá»‹ lá»‡ch phiÃªn báº£n module
  if (url.origin === self.location.origin && (url.pathname.includes('omr-grader') || url.pathname.includes('/omr/') || url.pathname.includes('supabase-db-compat') || url.pathname.includes('supabase-client') || url.pathname.includes('supabase.esm') || url.pathname.includes('live-tracker') || url.pathname.includes('utils.js') || url.pathname.includes('security-shield'))) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. File tÄ©nh cÃ¹ng domain: stale-while-revalidate
  if (url.origin === self.location.origin && STATIC_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // 5. CDN tin cáº­y: stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // 6. CÃ²n láº¡i: máº·c Ä‘á»‹nh qua máº¡ng, khÃ´ng cache
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit); // máº¥t máº¡ng -> Ä‘Ã nh dÃ¹ng báº£n cache (náº¿u cÃ³)
      return hit || refresh.then((r) => r || Response.error());
    })
  );
}
