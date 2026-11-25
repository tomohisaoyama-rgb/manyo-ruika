// 画面の部分
import { lab, isLong, esc, marks, marksK, paint, rowText, tate, dotCount, candidates, search, prompt, parseHash, applyNotes, groupNotes } from "./logic.js";
import { keepFresh } from "./update.js";
import { VERSION, BUILT } from "./version.js";

const $ = s => document.querySelector(s);
let P = [], G = { kt: [], sc: [] }, cur = 0, sample = null, ctl = null, view = null, cand = [], ci = -1, act = -1;
const byNo = new Map(), aiCache = new Map();
const PULSE = `<span class="pulse" aria-hidden="true"><i></i><i></i><i></i></span>`;
const SECS = [["common", "共通する表現"], ["diff", "違い"], ["relation", "関係の見立て"], ["check", "確かめること"]];

/* 端末に覚えておくこと（前に開いた歌、タブ、前後5首）。使えない端末では覚えない */
const store = {
  get(k, d) { try { const v = localStorage.getItem("manyo:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("manyo:" + k, JSON.stringify(v)); } catch {} },
};
let mode = store.get("mode", "e") === "c" ? "c" : "e";
$("#near").checked = store.get("near", true) !== false;

/* 画面の切り替え：アドレスの # に状態を置く。戻る・進む・読み込み直しで同じ所へ */
function go(h) { if (location.hash === "#" + h) route(); else location.hash = h; }
function route() {
  if (!P.length) return;
  const h = location.hash;
  if (h === view) return;
  const r = parseHash(h);
  if (r && r.view === "poem" && byNo.has(r.a)) { view = h; showPoem(byNo.get(r.a)); }
  else if (r && r.view === "cmp" && byNo.has(r.a) && byNo.has(r.b) && r.a !== r.b) { view = h; showCompare(byNo.get(r.a), byNo.get(r.b)); }
  else { view = "#n48"; try { history.replaceState(null, "", "#n48"); } catch {} showPoem(byNo.get(48)); }
  store.set("last", view);
}
window.addEventListener("hashchange", route);

function setTabs() {
  $("#tE").setAttribute("aria-selected", String(mode === "e"));
  $("#tC").setAttribute("aria-selected", String(mode === "c"));
}

/* 題詞と左注：組の歌すべてに出す。範囲が2首以上なら番号を付け、元の歌へリンクする */
const span = (r, i) => r.from === r.to ? "" : `（<a href="#n${r.from}">${r.from}</a>〜<a href="#n${r.to}">${r.to}</a>）`;
function ktBlock(i) {
  const r = G.kt[i]; if (!r) return "";
  return `<p class="kt">${r.from === r.to ? "" : `<span class="lb">題詞${span(r, i)}</span>`}${esc(P[r.at].kt)}</p>`;
}
function scBlock(i) {
  return (G.sc[i] || []).map(r => `<p class="small sc"><span class="lb">左注${span(r, i)}</span>${esc(P[r.at].sc)}</p>`).join("");
}
function showPoem(i) {
  const same = cur === i && $("#poem .big"); cur = i; const p = P[i];
  document.body.classList.remove("cmp");
  if (ctl) { ctl.abort(); ctl = null; }
  document.title = `${lab(p)}｜万葉集 類歌検索`;
  const meta = [esc(p.kind) + (p.sec ? "・" + esc(p.sec) : ""), p.au ? esc(p.au) : "", p.sp ? "詠み手　" + esc(p.sp) : ""].filter(Boolean).join("<br>");
  const body = esc(p.tx).replace(/　/g, "<br>");
  $("#poem").innerHTML = `<div class="hero"><div class="hl"><div class="vol">巻${p.vol}</div><div class="big">${p.no}</div><p class="meta">${meta}</p></div>${isLong(p) ? "" : tate(p, body)}</div>
  ${isLong(p) ? tate(p, body) + `<p class="shint">左へ送って続きを読む</p>` : ""}
  ${ktBlock(i)}
  <p class="kana${isLong(p) ? " clamp" : ""}" id="kana">${esc(p.kn)}</p>${isLong(p) ? `<button class="btn more" id="more" aria-expanded="false">読みをすべて表示</button>` : ""}
  ${yaBlock(p)}
  ${scBlock(i)}`;
  const mo = $("#more");
  if (mo) mo.addEventListener("click", () => { const k = $("#kana"), o = k.classList.toggle("clamp"); mo.textContent = o ? "読みをすべて表示" : "読みを閉じる"; mo.setAttribute("aria-expanded", String(!o)); });
  if (!same) window.scrollTo(0, 0);
  renderList();
  fresh.nudge();
}

/* 現代語訳：改訂訳があればそれを主に、AIの訳は畳んで残す */
function yaBlock(p) {
  if (!p.rev) return p.ya ? `<p class="ya">${esc(p.ya)}</p><p class="small">現代語訳はAIによるものです。</p>` : "";
  const r = p.rev, when = r.date ? `、${esc(r.date)}` : "";
  return `${r.ya ? `<p class="ya rev">${esc(p.ya)}</p><p class="small"><span class="revdot" aria-hidden="true"></span>改訂訳（${esc(r.src || "出典未記入")}${when}）</p>` : (p.ya ? `<p class="ya">${esc(p.ya)}</p><p class="small">現代語訳はAIによるものです。</p>` : "")}
  ${r.note ? `<p class="rnote"><span class="sec">注</span>${esc(r.note)}${!r.ya ? `<span class="small">（${esc(r.src || "出典未記入")}${when}）</span>` : ""}</p>` : ""}
  ${r.ya && p.aiya ? `<details class="yk ai"><summary>AIの訳を見る</summary><p>${esc(p.aiya)}</p></details>` : ""}`;
}

function renderList() {
  const p = P[cur], near = $("#near").checked, L = candidates(P, cur, mode, near);
  $("#cnt").textContent = L.length ? `${L.length}首` : "";
  $("#hint").textContent = L.length ? (sample ? "行を押すと、二首を並べてAIが比べます" : "行を押すと、二首を並べて比べます") : "";
  if (!L.length) {
    $("#list").innerHTML = `<li class="empty">${near && p[mode].length ? "前後5首を除くと、近い歌が残りません。「前後5首を除く」を外すと表示されます。" : "近い歌が見つかりませんでした。"}</li>`;
    return;
  }
  const max = L[0][1];
  $("#list").innerHTML = L.map(([j, s]) => {
    const q = P[j], n = dotCount(s, max);
    return `<li><button class="row" data-j="${j}"><span class="no">${lab(q)}</span><span class="tx">${rowText(q, p, mode)}</span><span class="dots" role="img" aria-label="近さ ${n}／5">${[0, 1, 2, 3, 4].map(k => `<i class="${k < n ? "on" : ""}"></i>`).join("")}</span></button></li>`;
  }).join("");
}

/* 比べる */
function showCompare(i, j) {
  const A = P[i], B = P[j]; cur = i;
  document.body.classList.add("cmp"); window.scrollTo(0, 0);
  document.title = `${lab(A)}と${lab(B)}｜万葉集 類歌検索`;
  cand = candidates(P, i, mode, $("#near").checked).map(x => x[0]); ci = cand.indexOf(j);
  $("#pos").textContent = ci >= 0 ? `${ci + 1} / ${cand.length}` : "";
  $("#prev").disabled = ci <= 0; $("#next").disabled = ci < 0 || ci >= cand.length - 1;
  $(".nav").style.visibility = ci >= 0 ? "visible" : "hidden";
  const st = isLong(A) || isLong(B);
  const col = (X, Y) => `<div class="col"><a class="pno" href="#n${X.no}">${lab(X)}</a>${tate(X, paint(X.tx, marksK(X, Y)))}</div>`;
  const pr = $("#pair"); pr.className = "pair" + (st ? " stack" : "");
  pr.innerHTML = st ? col(A, B) + `<span class="sep"></span>` + col(B, A) : col(B, A) + `<span class="sep"></span>` + col(A, B);
  $("#yk").open = false;
  $("#ykb").innerHTML = [A, B].map(X => `<span class="no">${lab(X)}${X.rev && X.rev.ya ? "　改訂訳" : ""}</span><p>${esc(X.ya || "訳はありません。")}</p>${X.rev && X.rev.note ? `<p>注　${esc(X.rev.note)}</p>` : ""}`).join("");
  $("#done").className = "done"; $("#done").innerHTML = "";
  if (!sample) { $("#ana").innerHTML = `<p class="msg">AIによる比較は、claude.aiで開いたときに使えます。</p>`; return; }
  runAI(A, B);
}
function fill(v) {
  $("#ana").innerHTML = SECS.map(([, t]) => `<h3>${t}</h3><p></p>`).join("");
  const ps = $("#ana").querySelectorAll("p");
  SECS.forEach(([k], x) => { ps[x].textContent = (v && typeof v[k] === "string" && v[k].trim()) ? v[k].trim() : "取得できませんでした。"; });
  $("#done").innerHTML = `<i aria-hidden="true"></i><span>比べ終わりました</span>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $("#done").classList.add("on")));
}
async function runAI(A, B) {
  const key = A.no + "-" + B.no;
  if (aiCache.has(key)) { fill(aiCache.get(key)); return; }
  if (ctl) ctl.abort();
  ctl = new AbortController(); const my = ctl;
  $("#ana").innerHTML = `<div class="think">${PULSE}<span>AIが二首を比べています</span></div>`;
  try {
    let v;
    if (typeof sample.json === "function") v = await sample.json(prompt(A, B), { modelTier: "default", signal: my.signal });
    else { const r = await sample(prompt(A, B), { modelTier: "default", signal: my.signal }); v = JSON.parse(String(r.text).replace(/^\s*```(json)?|```\s*$/g, "")); }
    if (my !== ctl) return;
    ctl = null; aiCache.set(key, v); fill(v); fresh.nudge();
  } catch (err) {
    if (my !== ctl || (err && err.name === "AbortError")) return;
    ctl = null;
    const code = err && err.code;
    const msg = code === "rate_limited" ? "混み合っています。少し待ってから、もう一度比べてください。" : code === "not_granted" ? "AIの利用が許可されていません。" : "分析を取得できませんでした。";
    $("#ana").innerHTML = `<p class="msg">${esc(msg)}</p>${code === "not_granted" ? "" : `<button class="again" id="again">もう一度比べる</button>`}`;
    if (code === "not_granted") sample = null;
    const ag = $("#again"); if (ag) ag.addEventListener("click", () => runAI(A, B));
    fresh.nudge();
  }
}
function step(d) { const k = ci + d; if (ci < 0 || k < 0 || k >= cand.length) return; go(`c${P[cur].no}-${P[cand[k]].no}`); }

$("#list").addEventListener("click", e => { const b = e.target.closest(".row"); if (b) go(`c${P[cur].no}-${P[+b.dataset.j].no}`); });
$("#back").addEventListener("click", () => go("n" + P[cur].no));
$("#prev").addEventListener("click", () => step(-1));
$("#next").addEventListener("click", () => step(1));
$("#ex").addEventListener("click", e => { const b = e.target.closest("button"); if (b) go(`c${b.dataset.a}-${b.dataset.b}`); });
for (const [id, m] of [["#tE", "e"], ["#tC", "c"]]) $(id).addEventListener("click", () => { if (mode === m) return; mode = m; store.set("mode", m); setTabs(); renderList(); });
$("#near").addEventListener("change", () => { store.set("near", $("#near").checked); renderList(); });
document.addEventListener("keydown", e => {
  if (!document.body.classList.contains("cmp") || e.target.closest("input,textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
  else if (e.key === "Escape") go("n" + P[cur].no);
});

/* 比べる画面は、左右にめくって候補を移る（縦書きを読む向きに合わせ、左へめくると次） */
{
  let x0 = 0, y0 = 0, t0 = 0, on = false;
  const pair = $("#pair");
  pair.addEventListener("touchstart", e => { if (pair.classList.contains("stack") || e.touches.length !== 1) { on = false; return; } on = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
  pair.addEventListener("touchend", e => {
    if (!on) return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 56 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - t0 < 700) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/* 検索 */
const hitBtn = r => `<button type="button" class="hit" role="option" id="h${r.i}" aria-selected="false" data-i="${r.i}"><span class="no">${lab(P[r.i])}</span><span>${r.line}</span>${r.why ? `<span class="why">${r.why}</span>` : ""}</button>`;
function setAct(k) {
  const bs = [...$("#hits").querySelectorAll(".hit")];
  if (!bs.length) { act = -1; return; }
  act = (k + bs.length) % bs.length;
  bs.forEach((b, x) => b.setAttribute("aria-selected", String(x === act)));
  $("#q").setAttribute("aria-activedescendant", bs[act].id);
  bs[act].scrollIntoView({ block: "nearest" });
}
function closeHits() { $("#hits").classList.remove("on"); $("#q").setAttribute("aria-expanded", "false"); $("#q").removeAttribute("aria-activedescendant"); act = -1; }
function doSearch(raw) {
  const h = $("#hits"); $("#clr").classList.toggle("on", raw.length > 0);
  const r = search(P, byNo, raw);
  if (r.kind === "empty" || !P.length) { closeHits(); return; }
  h.innerHTML = r.kind === "range" ? `<p class="hmsg">歌番号は1から4516までです。</p>`
    : r.kind === "none" ? `<p class="hmsg">「${esc(r.q)}」を含む歌は見つかりませんでした。</p>`
    : r.rows.map(hitBtn).join("") + (r.more ? `<p class="hmsg">50首まで表示しました。語を足すと絞り込めます。</p>` : "");
  h.dataset.q = raw.trim(); h.scrollTop = 0; h.classList.add("on"); $("#q").setAttribute("aria-expanded", "true"); act = -1;
  if (h.querySelector(".hit")) setAct(0);
}
function pick(i) { closeHits(); $("#q").value = ""; $("#clr").classList.remove("on"); $("#q").blur(); go("n" + P[i].no); }
let tm;
$("#q").addEventListener("input", e => { clearTimeout(tm); tm = setTimeout(() => doSearch(e.target.value), 120); });
$("#q").addEventListener("focus", e => { if (e.target.value.trim()) doSearch(e.target.value); });
$("#q").addEventListener("blur", () => setTimeout(() => fresh.nudge(), 300));
$("#sf").addEventListener("submit", e => {
  e.preventDefault(); clearTimeout(tm);
  if (!$("#hits").classList.contains("on") || $("#hits").dataset.q !== $("#q").value.trim()) doSearch($("#q").value);
  const bs = $("#hits").querySelectorAll(".hit"); if (bs.length) pick(+bs[Math.max(0, act)].dataset.i);
});
$("#q").addEventListener("keydown", e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "ArrowDown") { e.preventDefault(); if (!$("#hits").classList.contains("on")) doSearch($("#q").value); else setAct(act + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setAct(act - 1); }
  else if (e.key === "Escape") { if ($("#hits").classList.contains("on")) closeHits(); else { $("#q").value = ""; $("#clr").classList.remove("on"); } }
});
$("#hits").addEventListener("mousedown", e => e.preventDefault());
$("#hits").addEventListener("click", e => { const b = e.target.closest(".hit"); if (b) pick(+b.dataset.i); });
$("#clr").addEventListener("click", () => { $("#q").value = ""; closeHits(); $("#clr").classList.remove("on"); $("#q").focus(); });
document.addEventListener("click", e => { if (!e.target.closest(".sbox")) closeHits(); });

/* 更新：入力中とAIの比較中は読み込み直さない */
const fresh = keepFresh({ isBusy: () => !!ctl || (document.activeElement === $("#q") && $("#q").value.trim() !== "") });

/* バージョンの表示 */
if (!VERSION.startsWith("__")) $("#ver").textContent = `バージョン ${VERSION}（${BUILT}）`;

/* 読み込み */
setTabs();
Promise.all([
  fetch("data.json").then(r => { if (!r.ok) throw 0; return r.json(); }),
  fetch("stats.json").then(r => { if (!r.ok) throw 0; return r.json(); }),
  fetch("notes.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
]).then(([d, st, notes]) => {
  P = d; P.forEach((p, i) => byNo.set(p.no, i));
  applyNotes(P, byNo, notes);
  G = groupNotes(P);
  $("#figs").innerHTML = [[st.pairs, "表現が近い組"], [st.strong, "仮名で7字以上一致"], [st.hidden, "表記のままでは見落とす"]].map(([n, t]) => `<div class="fg"><b>${Number(n).toLocaleString()}</b><span>${esc(t)}</span></div>`).join("");
  $("#ex").innerHTML = st.examples.map(([a, b]) => {
    const A = P[byNo.get(a)], B = P[byNo.get(b)], m = marks(A.tx, B.tx, 2), mb = marks(B.tx, A.tx, 2);
    return `<button type="button" data-a="${a}" data-b="${b}"><span class="no">${lab(A)} と ${lab(B)}</span><span>${paint(A.tx, m, 0, Math.min(28, A.tx.length), false)}${A.tx.length > 28 ? "…" : ""}</span><span class="b2">${paint(B.tx, mb, 0, Math.min(28, B.tx.length), false)}${B.tx.length > 28 ? "…" : ""}</span></button>`;
  }).join("");
  // # がなければ、前に開いていた所から始める
  if (!parseHash(location.hash)) { const last = store.get("last", "#n48"); try { history.replaceState(null, "", typeof last === "string" && parseHash(last) ? last : "#n48"); } catch {} }
  route();
  if ($("#q").value.trim()) doSearch($("#q").value);
}).catch(() => { $("#poem").innerHTML = `<p class="empty">データを読み込めませんでした。電波のある所で、もう一度開いてください。</p>`; });

/* claude.aiで開いたときだけ、AIの比較が使える */
{
  let tries = 0;
  const hook = () => {
    if (window.claude && window.claude.use) {
      window.claude.use("sample").then(s => {
        if (!s) return; sample = s;
        if (document.body.classList.contains("cmp")) { const r = parseHash(location.hash); if (r && r.view === "cmp") runAI(P[byNo.get(r.a)], P[byNo.get(r.b)]); }
        else if (P.length) renderList();
      }).catch(() => {});
    } else if (++tries < 10) setTimeout(hook, 500);
  };
  hook();
}
