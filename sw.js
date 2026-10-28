// 수수께끼 단어 카드: 처음 열 때 게임 파일과 글꼴을 휴대폰에 저장해 두고,
// 그다음부터는 인터넷이 없어도 저장해 둔 파일로 열어요.
// v2: 같은 저장소에 있는 다른 게임(동물 숫자 파티)이 수수께끼 게임으로 바뀌어 열리지 않게 고쳤어요.
const APP_CACHE = 'riddle-app-v2';
const FONT_CACHE = 'riddle-fonts-v1';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap';
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];
// 같은 저장소의 다른 게임도 저장해 둬요. 이 파일이 없어져도 설치는 그대로 돼요.
const EXTRA_FILES = ['./number-party.html'];
// 저장할 때는 브라우저에 남아 있는 옛 파일 말고 항상 새로 받아요
const fresh = url => new Request(url, { cache: 'reload' });

// 글꼴 파일(한글은 여러 조각으로 나뉘어 있어요)을 한꺼번에 저장해요
async function cacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    if (await cache.match(FONT_CSS, { ignoreVary: true })) return;
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    const css = await res.clone().text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
    await Promise.all(urls.map(url =>
      fetch(url).then(r => (r.ok ? cache.put(url, r) : null)).catch(() => null)
    ));
    await cache.put(FONT_CSS, res);
  } catch (e) {
    // 글꼴을 못 받아도 게임은 기본 글꼴로 돌아가요
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES.map(fresh));
    await Promise.all(EXTRA_FILES.map(url => cache.add(fresh(url)).catch(() => null)));
    await cacheFonts();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, FONT_CACHE];
    for (const key of await caches.keys()) {
      if (!keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(staleWhileRevalidate(event, req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    const cache = await caches.open(FONT_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

// 저장해 둔 파일로 바로 열고, 인터넷이 되면 뒤에서 새 파일로 바꿔 둬요 (다음 실행 때 반영)
// 저장해 둔 적 없는 페이지는 인터넷에서 그대로 받아 와요. 다른 페이지를 수수께끼 게임으로 바꿔치기하지 않아요.
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('처음 한 번은 인터넷에 연결된 상태로 열어 주세요.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
