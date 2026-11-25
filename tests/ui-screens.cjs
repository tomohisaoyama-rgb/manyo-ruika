// 操作と表示の自動テスト
const { serve, launch, open, layoutProblems } = require("./ui-harness.cjs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const fails = [];
function ok(cond, name, info = "") { if (cond) pass++; else { fail++; fails.push(name + (info ? "：" + info : "")) } }

const fakeSample = mode => `
  window.__calls=0;
  const s=async(prompt,o)=>{window.__calls++;return {text:JSON.stringify({common:"共通A",diff:"違いB",relation:"見立てC",check:"確認D"})}};
  s.json=async(prompt,o)=>{window.__calls++;window.__prompt=prompt;
    if("${mode}"==="rate")throw {code:"rate_limited",message:"x"};
    if("${mode}"==="deny")throw {code:"not_granted",message:"x"};
    if("${mode}"==="slow")await new Promise(r=>setTimeout(r,800));
    return {common:"共通A",diff:"違いB",relation:"見立てC",check:"確認D"}};
  window.claude={use:async n=>n==="sample"?s:null};`;

(async () => {
  const srv = await serve(9101), br = await launch();
  const B = "http://localhost:9101/";

  // 1. 初期表示と、すべての歌の表示（スマホ幅）
  {
    const { page, errors } = await open(br, B, 360, 760);
    ok(await page.evaluate(() => location.hash) === "#n48", "初期表示は48番");
    const nos = await page.evaluate(() => { const r = []; for (let i = 1; i <= 4516; i++) r.push(i); return r });
    const bad = [];
    for (const n of nos) {
      await page.evaluate(n => { location.hash = "n" + n }, n);
      await page.waitForFunction(n => document.querySelector(".big") && document.querySelector(".big").textContent === String(n), {}, n);
      const r = await page.evaluate(() => {
        const out = [];
        const W = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > W + 1) out.push("横はみ出し");
        const big = document.querySelector(".big").getBoundingClientRect();
        const t = document.querySelector(".hero .tate");
        if (t) {
          const tr = t.getBoundingClientRect();
          if (big.right > tr.left - 4 && tr.top < big.bottom) out.push("番号と歌が重なる");
          if (tr.left < -1) out.push("歌が左にはみ出す");
          const lh = parseFloat(getComputedStyle(t).lineHeight);
          const cols = Math.round(tr.width / lh);
          if (cols > 2) out.push("短歌が" + cols + "列");
        }
        const rows = [...document.querySelectorAll(".row")];
        for (const row of rows) { const k = [...row.children].map(e => e.getBoundingClientRect());
          for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i], b = k[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push("一覧の行で重なり") } }
        if (rows.some(r => r.getBoundingClientRect().height > 260)) out.push("一覧の行が長すぎる");
        return out;
      });
      if (r.length) bad.push(n + ":" + [...new Set(r)].join(","));
    }
    ok(bad.length === 0, "全4516首をスマホ幅で表示", bad.slice(0, 12).join(" / ") + (bad.length > 12 ? ` ほか${bad.length - 12}件` : ""));
    ok(errors.filter(e => !/404/.test(e)).length === 0, "全首表示でエラーなし", errors.join(" / "));
    await page.close();
  }

  // 2. PC幅で長歌と短歌を抜き取り
  {
    const { page, errors } = await open(br, B, 1280, 900);
    const sampleNos = []; for (let n = 1; n <= 4516; n += 37) sampleNos.push(n);
    const bad = [];
    for (const n of sampleNos) {
      await page.evaluate(n => { location.hash = "n" + n }, n);
      await page.waitForFunction(n => document.querySelector(".big")?.textContent === String(n), {}, n);
      const p = await layoutProblems(page);
      if (p.length) bad.push(n + ":" + p.join(","));
    }
    ok(bad.length === 0, "PC幅で123首を抜き取り表示", bad.slice(0, 8).join(" / "));
    ok(errors.filter(e => !/404/.test(e)).length === 0, "PC幅でエラーなし", errors.join(" / "));
    await page.close();
  }

  // 3. 検索
  {
    const { page } = await open(br, B + "#n1", 390, 800);
    const q = "#q";
    await page.type(q, "48"); await sleep(250);
    ok(await page.$eval("#hits", e => e.classList.contains("on")), "番号で候補が開く");
    await page.keyboard.press("Enter"); await sleep(200);
    ok(await page.evaluate(() => location.hash) === "#n48", "番号＋Enterで開く");
    ok(await page.$eval(q, e => e.value) === "", "開いた後は入力が空");

    await page.type(q, "月かたぶき"); await sleep(250);
    const n1 = await page.$$eval("#hits .hit", b => b.length);
    ok(n1 >= 5, "語で候補が出る", n1);
    ok(await page.$eval("#hits .hit", b => b.getAttribute("aria-selected")) === "true", "先頭の候補が選ばれている");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    const third = await page.$$eval("#hits .hit", b => b[2].querySelector(".no").textContent.split("・")[1]);
    ok(await page.$$eval("#hits .hit", b => b[2].getAttribute("aria-selected")) === "true", "↓で3番目に移る");
    await page.keyboard.press("Enter"); await sleep(200);
    ok(await page.evaluate(() => document.querySelector(".big").textContent) === third, "↓とEnterで3番目の歌が開く", third);
    await page.type(q, "ツキカタブキ"); await sleep(250);
    ok(await page.$$eval("#hits .hit", b => b.length) >= 5, "片仮名の読みでも探せる");
    await page.keyboard.press("Escape"); await sleep(50);
    ok(!(await page.$eval("#hits", e => e.classList.contains("on"))), "Escで候補が閉じる");
    ok(await page.$eval(q, e => e.value) === "ツキカタブキ", "1回目のEscは入力を残す");
    await page.keyboard.press("Escape");
    ok(await page.$eval(q, e => e.value) === "", "2回目のEscで入力が消える");

    await page.type(q, "にぎ"); await sleep(250);
    const why = await page.$$eval("#hits .why", w => w.map(x => x.textContent));
    ok(why.length > 0 && why.every(t => t.includes("にぎ")), "読みで当たった理由を表示");
    const marked = await page.$$eval("#hits .hit", b => b.map(x => x.querySelector("span:nth-child(2) mark")?.textContent || ""));
    ok(marked.filter(Boolean).length >= marked.length - 1, "本文の該当箇所を濃くする", marked.join(","));
    await page.click("#clr"); await sleep(50);
    ok(await page.$eval(q, e => e.value) === "" && !(await page.$eval("#hits", e => e.classList.contains("on"))), "×で入力と候補が消える");
    ok(await page.evaluate(() => document.activeElement.id) === "q", "×の後も入力欄にフォーカス");

    await page.type(q, "4600"); await sleep(250);
    ok((await page.$eval("#hits", e => e.textContent)).includes("1から4516"), "範囲外の番号に案内");
    await page.mouse.click(5, 600); await sleep(50);
    ok(!(await page.$eval("#hits", e => e.classList.contains("on"))), "外を押すと候補が閉じる");
    await page.click("#clr");
    await page.type(q, "ぬばたま"); await sleep(250);
    const cnt = await page.$$eval("#hits .hit", b => b.length);
    ok(cnt === 50 && (await page.$eval("#hits", e => e.textContent)).includes("50首まで"), "多い時は50首で打ち切りを案内", cnt);
    await page.close();
  }

  // 4. 一覧・タブ・前後5首
  {
    const { page } = await open(br, B + "#n48", 1280, 900);
    const cE = await page.$eval("#cnt", e => e.textContent);
    await page.click("#tC"); await sleep(50);
    ok(await page.$eval("#tC", e => e.getAttribute("aria-selected")) === "true", "内容タブに切り替わる");
    await page.click("#tE");
    await page.click(".tg"); await sleep(50);
    const cOff = await page.$eval("#cnt", e => e.textContent);
    ok(parseInt(cOff) >= parseInt(cE), "前後5首を含めると件数が増えるか同じ", cE + "→" + cOff);
    await page.click(".tg");
    await page.close();
  }

  // 5. 比べる画面とAI
  for (const w of [390, 1280]) {
    const { page, errors } = await open(br, B + "#n48", w, 900, { fakeSample: fakeSample("ok") });
    await page.waitForFunction(() => document.querySelector("#hint").textContent.includes("AI"));
    await page.click(".row"); await sleep(150);
    ok(await page.evaluate(() => /^#c48-\d+$/.test(location.hash)), `行を押すと比べる画面（${w}）`);
    await page.waitForFunction(() => document.querySelectorAll("#ana h3").length === 4, { timeout: 5000 });
    const txt = await page.$$eval("#ana p", p => p.map(x => x.textContent));
    ok(txt.join() === "共通A,違いB,見立てC,確認D", `AIの4項目を表示（${w}）`, txt.join());
    await sleep(100);
    ok(await page.$eval("#done", e => e.classList.contains("on") && e.textContent.includes("比べ終わりました")), `終わると赤い点（${w}）`);
    ok((await layoutProblems(page)).length === 0, `比べる画面の崩れなし（${w}）`, (await layoutProblems(page)).join(","));
    const pos1 = await page.$eval("#pos", e => e.textContent);
    ok(pos1.startsWith("1 /"), `位置は1番目（${w}）`, pos1);
    ok(await page.$eval("#prev", e => e.disabled), `1番目では「前」が押せない（${w}）`);
    await page.click("#next"); await sleep(150);
    ok((await page.$eval("#pos", e => e.textContent)).startsWith("2 /"), `「次」で2番目（${w}）`);
    await page.keyboard.press("ArrowRight"); await sleep(150);
    ok((await page.$eval("#pos", e => e.textContent)).startsWith("3 /"), `→キーで3番目（${w}）`);
    await page.keyboard.press("ArrowLeft"); await sleep(150);
    ok((await page.$eval("#pos", e => e.textContent)).startsWith("2 /"), `←キーで2番目（${w}）`);
    const calls = await page.evaluate(() => window.__calls);
    await page.keyboard.press("ArrowLeft"); await sleep(150);
    ok(await page.evaluate(() => window.__calls) === calls, `一度比べた組は再度AIを呼ばない（${w}）`);
    await page.goBack(); await sleep(150);
    ok((await page.$eval("#pos", e => e.textContent)).startsWith("2 /"), `ブラウザの戻るで前の組（${w}）`);
    await page.keyboard.press("Escape"); await sleep(150);
    ok(await page.evaluate(() => location.hash === "#n48" && !document.body.classList.contains("cmp")), `Escで一覧に戻る（${w}）`);
    await page.click(".row"); await sleep(150);
    await page.click("#yk summary"); await sleep(50);
    ok(await page.$eval("#yk", e => e.open && e.textContent.includes("巻")), `現代語訳を開ける（${w}）`);
    const other = await page.$$eval(".pno", a => a.map(x => x.getAttribute("href")));
    await page.click(`.pno[href="${other.find(h => h !== "#n48")}"]`); await sleep(150);
    ok(await page.evaluate(() => /^#n\d+$/.test(location.hash) && location.hash !== "#n48"), `比べる画面の歌番号で、その歌を開く（${w}）`);
    ok(await page.evaluate(() => window.__prompt.includes("要確認") && window.__prompt.includes("JSON")), "AIへの指示に注意書きと形式");
    ok(errors.filter(e => !/404/.test(e)).length === 0, `比べる画面でエラーなし（${w}）`, errors.join(" / "));
    await page.close();
  }

  // 6. AIの失敗と、考え中の表示
  {
    let { page } = await open(br, B + "#c48-4311", 390, 900, { fakeSample: fakeSample("rate") });
    await page.waitForFunction(() => document.querySelector("#ana .msg"), { timeout: 5000 });
    ok((await page.$eval("#ana", e => e.textContent)).includes("混み合っています") && !!(await page.$("#again")), "混雑時は案内と再試行ボタン");
    ok(!(await page.$eval("#done", e => e.classList.contains("on"))), "失敗時は赤い点を灯さない");
    await page.close();
    ({ page } = await open(br, B + "#c48-4311", 390, 900, { fakeSample: fakeSample("deny") }));
    await page.waitForFunction(() => document.querySelector("#ana .msg"), { timeout: 5000 });
    ok((await page.$eval("#ana", e => e.textContent)).includes("許可") && !(await page.$("#again")), "不許可時は再試行ボタンなし");
    await page.close();
    ({ page } = await open(br, B + "#c48-4311", 390, 900, { fakeSample: fakeSample("slow") }));
    await page.waitForFunction(() => document.querySelector("#ana .think"), { timeout: 5000 });
    ok(true, "考え中は点が脈打つ表示");
    await page.click("#next"); await sleep(1200);
    const t = await page.$$eval("#ana p", p => p.map(x => x.textContent).join());
    ok(t === "共通A,違いB,見立てC,確認D", "途中で次へ移っても表示が混ざらない", t);
    await page.close();
    ({ page } = await open(br, B + "#c48-4311", 390, 900));
    ok((await page.$eval("#ana", e => e.textContent)).includes("claude.ai"), "AIが使えない環境では案内だけ");
    await page.close();
  }

  // 7. 長歌の読みの開閉、見出し、検証の例、不正なアドレス
  {
    const { page } = await open(br, B + "#n4000", 390, 900);
    ok(await page.$eval("#kana", e => e.classList.contains("clamp")), "長歌の読みは2行に畳む");
    await page.click("#more");
    ok(!(await page.$eval("#kana", e => e.classList.contains("clamp"))) && (await page.$eval("#more", e => e.textContent)) === "読みを閉じる", "読みを開ける");
    await page.click("h1 a"); await sleep(150);
    ok(await page.evaluate(() => location.hash) === "#n48", "見出しで48番へ戻る");
    await page.click("#ex button"); await sleep(150);
    ok(await page.evaluate(() => /^#c\d+-\d+$/.test(location.hash)), "検証の例から比べる画面へ");
    await page.evaluate(() => { location.hash = "n99999" }); await sleep(150);
    ok(await page.evaluate(() => location.hash) === "#n48", "存在しない番号は48番へ");
    await page.close();
  }

  // 8. キーボードだけで操作できるか
  {
    const { page } = await open(br, B + "#n48", 1280, 900);
    const seen = [];
    for (let k = 0; k < 12; k++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => { const a = document.activeElement; return (a.id || a.className || a.tagName) + "" })) }
    ok(seen.includes("q") && seen.includes("tE") && seen.includes("near") && seen.some(s => s.includes("row")), "Tabで入力・タブ・切替・一覧に届く", seen.join(","));
    await page.close();
  }

  await br.close(); srv.close();
  console.log(`合格 ${pass} / 不合格 ${fail}`);
  fails.forEach(f => console.log("× " + f));
})().catch(e => { console.error(e); process.exit(1) });
