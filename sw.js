// 유니스냉장고 서비스워커
// 큰 변경 후에는 아래 CACHE 버전 숫자를 올리세요 (v1 -> v2 ...)
const CACHE = "unis-fridge-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // AI 레시피 함수는 항상 네트워크 (캐시 금지)
  if (url.pathname.includes("/.netlify/functions/")) return;
  // 다른 출처(CDN 폰트 등)는 그대로 네트워크
  if (url.origin !== location.origin) return;

  // HTML 화면: 네트워크 우선, 안 되면 캐시 (최신 코드 우선 반영)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // 그 외 같은 출처 파일(아이콘 등): 캐시 우선
  e.respondWith(
    caches.match(req).then((r) =>
      r ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
    )
  );
});
