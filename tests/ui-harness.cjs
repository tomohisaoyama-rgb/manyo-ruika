// 検索ページの検証用ハーネス：静的サーバとブラウザを立ち上げる
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const ROOT = process.env.SITE || "/home/claude/manyo/site";
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".xml": "application/xml" };

function serve(port) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      // Cloudflare Pages と同じく、.html を付けたアドレスは付けないアドレスへ転送する
      const u0 = decodeURIComponent(q.url.split("?")[0].split("#")[0]);
      if (u0 === "/index.html") { r.writeHead(308, { location: "/" }); r.end(); return }
      if (u0.endsWith(".html")) { r.writeHead(308, { location: u0.slice(0, -5) }); r.end(); return }
      let u1 = u0 === "/" ? "/index.html" : u0;
      if (!path.extname(u1) && fs.existsSync(path.join(ROOT, u1 + ".html"))) u1 += ".html";
      const p = path.join(ROOT, u1);
      fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return } r.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); r.end(d) });
    });
    s.listen(port, () => res(s));
  });
}

async function launch() {
  return puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] });
}

// ページを開き、データの読み込みが終わるまで待つ
async function open(browser, url, w, h = 900, opts = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()) });
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  if (opts.fakeSample) await page.evaluateOnNewDocument(opts.fakeSample);
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".big") || document.body.classList.contains("cmp"), { timeout: 15000 });
  return { page, errors };
}

// 横方向のはみ出しと、見えている要素同士の重なりを調べる
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) out.push(`横にはみ出し: scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && el.offsetParent !== null };
    // はみ出し：要素の右端が画面外
    for (const el of document.querySelectorAll("button,a,input,label,.no,.big,.tate,.tx,.dots,h1,h2,h3,p")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (el.closest(".scroller") || el.closest("#hits")) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`画面外: ${el.tagName}.${el.className} ${Math.round(r.left)}-${Math.round(r.right)}`);
    }
    // 重なり：一覧の行の中で、番号・本文・点が重ならない
    const boxes = sel => [...document.querySelectorAll(sel)].filter(vis).map(e => [e, e.getBoundingClientRect()]);
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const row of document.querySelectorAll(".row, #hits button")) {
      if (!vis(row)) continue;
      const kids = [...row.children].filter(vis).map(e => [e, e.getBoundingClientRect()]);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++)
        if (hit(kids[i][1], kids[j][1])) out.push(`重なり: ${kids[i][0].className} と ${kids[j][0].className}（${row.textContent.slice(0, 16)}）`);
    }
    // 主役の番号と縦書きの歌
    const big = document.querySelector("#home:not([hidden]) .big"), t = document.querySelector("#home .hero .tate");
    if (big && t && vis(big) && vis(t) && hit(big.getBoundingClientRect(), t.getBoundingClientRect())) out.push("重なり: 歌番号と縦書きの歌");
    // 押せる部品は44px以上
    for (const el of document.querySelectorAll("button,a,input[type=search]")) {
      if (!vis(el) || el.closest(".tate") || el.closest(".note")) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5) out.push(`押しにくい: ${el.tagName} "${(el.textContent || el.placeholder || "").trim().slice(0, 12)}" 高さ${Math.round(r.height)}`);
    }
    return [...new Set(out)];
  });
}

module.exports = { serve, launch, open, layoutProblems };
