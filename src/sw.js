// キャッシュ優先の Service Worker。VERSION を上げたときだけ新しい版が届く
const VERSION = "__SWVERSION__";
const CACHE = "manyo-ruika-" + VERSION;
// ページは転送されないアドレスで持つ（Cloudflare Pages は /index.html → /、/about.html → /about に転送する）
const PAGES = { index: "./", about: "./about" };
const ASSETS = [
  PAGES.index, PAGES.about, "./style.css",
  "./app.js", "./logic.js", "./update.js", "./version.js",
  "./data.json", "./stats.json", "./notes.json", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png",
];

// 転送を経た応答は、ページの表示に使うとブラウザが拒む（ERR_FAILED）。中身だけを写した応答に作り直す
async function plain(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of ASSETS) {
      // HTTPのキャッシュを通さず、必ず新しいファイルを取る
      const res = await fetch(new Request(u, { cache: "reload" }));
      if (!res.ok) throw new Error("取得できません: " + u);
      await cache.put(u, await plain(res));
    }
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ページを開くときは、キャッシュの index か about を返す（# は送られてこない）
    if (req.mode === "navigate") {
      const page = /\/about(\.html)?\/?$/.test(url.pathname) ? PAGES.about : PAGES.index;
      const hit = await cache.match(page);
      if (hit) return plain(hit);
      try { return await plain(await fetch(req)); } catch (err) { throw err; }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, (await plain(res.clone())));
    return res;
  })());
});
