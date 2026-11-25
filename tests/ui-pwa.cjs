// PWAとスマホ向けの動きを確かめる：オフライン、更新の流れ、前回の歌、めくる操作、固定の検索欄
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const { serve, launch } = require("./ui-harness.cjs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const fails = [];
const ok = (c, n, i = "") => { if (c) pass++; else { fail++; fails.push(n + (i ? "：" + i : "")) } };
const SITE = "/tmp/pwa-site";
const V = +fs.readFileSync("/home/claude/manyo-app/VERSION", "utf8").trim();

function setVersion(v) {
  // 公開用のファイルの版だけを書き換える（build.sh が書く場所と同じ）
  for (const f of ["sw.js", "version.js"]) {
    const p = path.join(SITE, f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/VERSION = "\d+"/, `VERSION = "${v}"`));
  }
}

(async () => {
  execSync(`rm -rf ${SITE} && cp -R /home/claude/manyo-app/dist ${SITE}`);
  process.env.SITE = SITE;
  delete require.cache[require.resolve("./ui-harness.cjs")];
  const { serve: serve2 } = require("./ui-harness.cjs");
  const srv = await serve2(9200), br = await launch();
  const B = "http://localhost:9200/";
  const ctx = await br.createBrowserContext();
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  // 1. 初回：Service Worker が入り、データがキャッシュされる
  await page.goto(B + "#n48", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, { timeout: 15000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle0" });
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "Service Worker が動いている");
  const keys = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, has: !!(await c.match("./data.json")) } });
  ok(keys.ks.length === 1 && keys.ks[0] === "manyo-ruika-" + V && keys.has, "キャッシュに今の版とデータが入る", JSON.stringify(keys));
  const redir = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return Promise.all((await c.keys()).map(async r => (await c.match(r)).redirected)) });
  ok(redir.every(x => !x), "キャッシュに転送を経た応答がない", JSON.stringify(redir));
  await page.goto(B + "#n8", { waitUntil: "networkidle0" });
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller) && (await page.$eval(".big", e => e.textContent)) === "8", "Service Worker 経由でページを開ける（転送のある公開先と同じ条件）");
  ok((await page.$eval("#ver", e => e.textContent)).startsWith(`バージョン ${V}（`), "画面の下に版と公開日");

  // 2. オフライン：電波がなくても開けて、検索も比較もできる
  await page.setOfflineMode(true);
  await page.goto(B + "#n4000", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".big")?.textContent === "4000", { timeout: 10000 });
  ok(true, "オフラインで歌を開ける");
  await page.type("#q", "かぎろひ"); await sleep(300);
  ok(await page.$$eval("#hits .hit", b => b.length) >= 5, "オフラインで検索できる");
  await page.click("#clr");
  await page.goto(B + "about.html", { waitUntil: "domcontentloaded" });
  ok((await page.$eval("h1", e => e.textContent)) === "使い方" && (await page.$eval(".ver", e => e.textContent)).includes(`バージョン ${V}`), "オフラインで使い方のページを開ける");
  await page.goto(B + "about", { waitUntil: "domcontentloaded" });
  ok((await page.$eval("h1", e => e.textContent)) === "使い方", "/about でも使い方が開く");
  await page.setOfflineMode(false);

  // 3. 前回の歌とタブを覚える
  await page.goto(B + "#n100", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".big")?.textContent === "100");
  await page.click("#tC"); await sleep(50);
  await page.goto(B, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".big"));
  ok(await page.evaluate(() => location.hash) === "#n100", "#なしで開くと前回の歌", await page.evaluate(() => location.hash));
  ok(await page.$eval("#tC", e => e.getAttribute("aria-selected")) === "true", "タブの選び方を覚える");
  await page.click("#tE");

  // 4. スマホ：下へ送っても検索欄が上に残る
  await page.goto(B + "#n48", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".big")?.textContent === "48");
  await page.evaluate(() => window.scrollTo(0, 1600)); await sleep(100);
  const top = await page.$eval(".sbox", e => e.getBoundingClientRect().top);
  ok(Math.abs(top) < 2, "下へ送っても検索欄が上に残る", top);
  ok(await page.$eval(".lead", e => getComputedStyle(e).display) === "none", "スマホでは説明の一行を隠す");
  const fsz = await page.$eval("#q", e => parseFloat(getComputedStyle(e).fontSize));
  ok(fsz >= 16, "入力欄は16px以上（iPhoneで拡大されない）", fsz);

  // 5. 比べる画面を左右にめくる
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.tap(".row"); await sleep(200);
  const p1 = await page.$eval("#pos", e => e.textContent);
  const box = await page.$eval("#pair", e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  const swipe = async dx => { await page.touchscreen.touchStart(box.x, box.y); await page.touchscreen.touchMove(box.x + dx / 2, box.y + 4); await page.touchscreen.touchMove(box.x + dx, box.y + 6); await page.touchscreen.touchEnd(); await sleep(250) };
  await swipe(-140);
  const p2 = await page.$eval("#pos", e => e.textContent);
  ok(p1.startsWith("1 /") && p2.startsWith("2 /"), "左へめくると次の候補", p1 + "→" + p2);
  await swipe(140);
  ok((await page.$eval("#pos", e => e.textContent)).startsWith("1 /"), "右へめくると前の候補");
  await swipe(20);
  ok((await page.$eval("#pos", e => e.textContent)).startsWith("1 /"), "少し動かしただけでは移らない");
  ok(await page.$eval(".swipe", e => getComputedStyle(e).display) !== "none", "スマホではめくれることを書く");

  // 6. 更新の流れ：版を上げて公開すると、画面に戻ったときに新しくなる
  await page.goto(B + "#n4311", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector(".big")?.textContent === "4311");
  setVersion(V + 1);
  // 入力中は読み込み直さない
  await page.type("#q", "月"); await sleep(200);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await sleep(2500);
  ok(await page.$eval("#q", e => e.value) === "月", "入力中は更新で読み込み直さない");
  const waiting = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  ok(waiting, "新しい版は待機している");
  // 入力を終えると当たる
  const nav = page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => null);
  await page.click("#clr"); await page.mouse.click(5, 700);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await nav; await sleep(500);
  await page.waitForFunction(() => document.querySelector(".big"), { timeout: 10000 });
  ok((await page.$eval("#ver", e => e.textContent)).startsWith(`バージョン ${V + 1}`), "入力を終えると新しい版になる", await page.$eval("#ver", e => e.textContent));
  ok(await page.evaluate(() => location.hash) === "#n4311", "読み込み直しても同じ歌のまま");
  const ks2 = await page.evaluate(async () => caches.keys());
  ok(ks2.length === 1 && ks2[0] === "manyo-ruika-" + (V + 1), "古い版のキャッシュは消える", ks2.join());

  // 7. 作業中でなければ、画面に戻っただけで当たる
  setVersion(V + 2);
  const nav2 = page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => null);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await nav2; await sleep(500);
  await page.waitForFunction(() => document.querySelector("#ver")?.textContent.startsWith("バージョン"), { timeout: 10000 });
  ok((await page.$eval("#ver", e => e.textContent)).startsWith(`バージョン ${V + 2}`), "画面に戻ると版3になる", await page.$eval("#ver", e => e.textContent));

  // 8. 版を上げなければ、何も変わらない（ファイルだけ変えても届かない）
  fs.writeFileSync(path.join(SITE, "about.html"), fs.readFileSync(path.join(SITE, "about.html"), "utf8").replace("使い方</h1>", "使い方X</h1>"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await sleep(2000);
  await page.goto(B + "about.html", { waitUntil: "networkidle0" });
  ok((await page.$eval("h1", e => e.textContent)) === "使い方", "版を上げない変更は届かない（キャッシュ優先）");

  // 9. マニフェストとアイコン
  const man = JSON.parse(fs.readFileSync(path.join(SITE, "manifest.webmanifest"), "utf8"));
  ok(man.display === "standalone" && man.icons.every(i => fs.existsSync(path.join(SITE, i.src))), "マニフェストとアイコン");
  for (const f of ["robots.txt", "sitemap.xml", "og.png", "_headers", "icons/apple-touch-icon.png"]) ok(fs.existsSync(path.join(SITE, f)), f + " がある");
  ok(!/__(VERSION|DATE|SITE)__/.test(fs.readFileSync(path.join(SITE, "index.html"), "utf8")), "置き換え残りがない");
  ok(errors.length === 0, "エラーなし", errors.join(" / "));

  await br.close(); srv.close();
  console.log(`合格 ${pass} / 不合格 ${fail}`); fails.forEach(f => console.log("× " + f));
})().catch(e => { console.error(e); process.exit(1) });
