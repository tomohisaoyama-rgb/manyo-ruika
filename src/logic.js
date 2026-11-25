// 計算の部分。画面に触らない純粋な関数だけを置く（node --test で確かめる）

export const lab = p => `巻${p.vol}・${p.no}`;
export const isLong = p => p.kind === "長歌";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* 共通部分の印：a の各文字が b と min 字以上連続して一致するか */
export function marks(a, b, min) {
  const m = new Array(a.length).fill(false);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "　") continue;
    for (let L = Math.min(a.length - i, 30); L >= min; L--) {
      const s = a.substr(i, L);
      if (s.includes("　")) continue;
      if (b.includes(s)) { for (let k = 0; k < L; k++) m[i + k] = true; break; }
    }
  }
  return m;
}

/* 印の付いた所を <mark> で包む。全角空白は改行か空白にする */
export function paint(a, m, from = 0, to = a.length, br = true) {
  let o = "", on = false;
  for (let i = from; i < to; i++) {
    if (m[i] && !on) { o += "<mark>"; on = true; }
    if (!m[i] && on) { o += "</mark>"; on = false; }
    o += a[i] === "　" ? (br ? "<br>" : " ") : esc(a[i]);
  }
  return o + (on ? "</mark>" : "");
}

/* 仮名の正規化（小書き・ゐゑを） */
export const NORM = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "っ": "つ", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ", "ゐ": "い", "ゑ": "え", "を": "お" };
const isH = c => /[ぁ-ゖ]/.test(c), nm = c => NORM[c] || c;
export const toKana = v => v.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96)).replace(/[ぁぃぅぇぉっゃゅょゎゐゑを]/g, c => NORM[c]);

/* 本文の各文字が、仮名読みのどこに当たるかを大まかに対応づける */
export function align(tx, kn) {
  const sp = new Array(tx.length); let k = 0, i = 0;
  while (i < tx.length) {
    const c = tx[i];
    if (isH(c)) { const f = kn.indexOf(nm(c), k); if (f >= 0 && f - k < 12) { sp[i] = [f, f + 1]; k = f + 1; } else sp[i] = [k, k]; i++; continue; }
    let j = i; while (j < tx.length && !isH(tx[j])) j++;
    const solid = []; for (let t = i; t < j; t++) if (/[㐀-鿿々〆ヵヶ]/.test(tx[t])) solid.push(t);
    let end = kn.length;
    if (j < tx.length) {
      let an = nm(tx[j]); for (let t = j + 1; t < tx.length && t < j + 3 && isH(tx[t]); t++) an += nm(tx[t]);
      let f = -1;
      for (let L = an.length; L >= 1 && f < 0; L--) { const g = kn.indexOf(an.slice(0, L), k + Math.max(1, solid.length)); if (g >= 0 && g - k <= solid.length * 4 + 2) f = g; }
      end = f >= 0 ? f : Math.min(kn.length, k + solid.length * 2);
    }
    for (let t = i; t < j; t++) sp[t] = [k, k];
    solid.forEach((t, x) => { const a = k + Math.round((end - k) * x / solid.length), b = k + Math.round((end - k) * (x + 1) / solid.length); sp[t] = [a, b]; });
    k = end; i = j;
  }
  return sp;
}

/* 表現の近さは仮名で測っているので、仮名で一致した所も本文へ写す */
export function marksK(q, p) {
  const m = marks(q.tx, p.tx, 3);
  if (!q.kn || !p.kn) return m;
  const km = marks(q.kn, p.kn, 5), sp = align(q.tx, q.kn);
  for (let t = 0; t < sp.length; t++) {
    const [a, b] = sp[t];
    if (b > a) { let c = 0; for (let x = a; x < b; x++) if (km[x]) c++; if (c * 2 >= b - a) m[t] = true; }
  }
  return m;
}

/* 一覧用：長歌は一致の前後だけを切り出す */
export function rowText(q, p, mode) {
  const m = mode === "e" ? marksK(q, p) : marks(q.tx, p.tx, 2);
  if (!isLong(q)) return paint(q.tx, m, 0, q.tx.length, false);
  const f = m.indexOf(true);
  if (f < 0) return esc(q.tx.slice(0, 44).replace(/　/g, " ")) + "…";
  let l = m.lastIndexOf(true); if (l - f > 40) l = f + 40;
  const s = Math.max(0, f - 14), e = Math.min(q.tx.length, l + 1 + 14);
  return (s > 0 ? "…" : "") + paint(q.tx, m, s, e, false) + (e < q.tx.length ? "…" : "");
}

/* 短歌の上の句と下の句の切れ目を推定する
   読み（仮名）を5・7・5と数えた位置を目安に、助詞などの区切りから一番近い所を選ぶ */
const PART = "てにのはをばぬむしどもらやかけ";
export function cut(x, kind, kn) {
  let target = x.length * (kind === "旋頭歌" ? 0.5 : 0.45);
  if (kn && kn.length > 20) {
    const mora = kind === "旋頭歌" ? 19 : 17, sp = align(x, kn);
    for (let t = 0; t < sp.length; t++) if (sp[t][0] >= mora) { target = t; break; }
  }
  let best = -1, bd = 1e9;
  for (let i = 5; i < x.length - 5; i++) {
    const prev = x[i - 1], next = x[i];
    const te = prev === "て" && !"ばどもはや".includes(next);
    if (te || (PART.includes(prev) && !/[ぁ-ゖ]/.test(next))) {
      const d = Math.abs(i - target) - (te ? 1.5 : 0);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

/* 縦書きの本文：短歌は二列、長歌は横に送る。inner は強調済みのHTML */
export function tate(p, inner) {
  if (isLong(p)) return `<div class="scroller"><p class="tate">${inner}</p></div>`;
  const c = p.ct > 0 ? p.ct : cut(p.tx, p.kind, p.kn);
  if (c < 0) return `<p class="tate">${inner}</p>`;
  let n = 0, o = "", tag = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<") tag = true;
    if (!tag && ch === "&") { const e = inner.indexOf(";", i); o += inner.slice(i, e + 1); i = e; n++; if (n === c) o += "<br>"; continue; }
    o += ch;
    if (ch === ">") { tag = false; continue; }
    if (!tag) { n++; if (n === c) { const open = (o.match(/<mark>/g) || []).length > (o.match(/<\/mark>/g) || []).length; o += open ? "</mark><br><mark>" : "<br>"; } }
  }
  return `<p class="tate">${o}</p>`;
}

/* 近さを5つの点の数にする */
export const dotCount = (s, max) => Math.max(1, Math.min(5, Math.round(s / max * 5)));

/* 候補：前後5首を除くかどうか */
export const candidates = (P, i, mode, near) => P[i][mode].filter(([j]) => !near || Math.abs(P[j].no - P[i].no) > 5);

/* 抜き出し */
export function snip(str, a, b, pad) {
  const s0 = Math.max(0, a - pad), e0 = Math.min(str.length, b + pad), f = x => esc(x).replace(/　/g, " ");
  return (s0 > 0 ? "…" : "") + f(str.slice(s0, a)) + "<mark>" + f(str.slice(a, b)) + "</mark>" + f(str.slice(b, e0)) + (e0 < str.length ? "…" : "");
}

/* 検索。番号・本文・読み・題詞・歌人・原文・左注・注を順に見る。結果は表示用の行 */
export function search(P, byNo, raw, limit = 50) {
  const v = raw.trim();
  if (!v) return { kind: "empty" };
  const n = v.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248));
  if (/^\d+$/.test(n)) {
    const i = byNo.get(+n);
    if (i == null) return { kind: "range" };
    const t = P[i].tx;
    return { kind: "hits", rows: [{ i, line: esc(t.slice(0, 40).replace(/　/g, " ")) + (t.length > 40 ? "…" : ""), why: "" }], more: false };
  }
  const vk = /^[ぁ-ゖァ-ヶー]+$/.test(v) ? toKana(v) : "";
  const rows = []; let more = false;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (!(p.tx.includes(v) || (vk && p.kn.includes(vk)) || p.kt.includes(v) || p.au.includes(v) || (p.gb && p.gb.includes(v)) || (p.sc && p.sc.includes(v)) || (p.rev && p.rev.note.includes(v)))) continue;
    if (rows.length >= limit) { more = true; break; }
    rows.push(hitRow(p, i, v, vk));
  }
  return rows.length ? { kind: "hits", rows, more } : { kind: "none", q: v };
}
function hitRow(p, i, v, vk) {
  let line, why = "", x;
  const head = () => esc(p.tx.slice(0, 30).replace(/　/g, " ")) + "…";
  if ((x = p.tx.indexOf(v)) >= 0) line = snip(p.tx, x, x + v.length, 14);
  else if (vk && (x = p.kn.indexOf(vk)) >= 0) {
    const sp = align(p.tx, p.kn), hit = [];
    for (let t = 0; t < sp.length; t++) { const [a, b] = sp[t]; if (b > a && a < x + vk.length && b > x) hit.push(t); }
    line = hit.length ? snip(p.tx, hit[0], hit[hit.length - 1] + 1, 14) : head();
    why = "読み：" + snip(p.kn, x, x + vk.length, 8);
  } else if ((x = p.kt.indexOf(v)) >= 0) { line = head(); why = "題詞：" + snip(p.kt, x, x + v.length, 10); }
  else if ((x = p.au.indexOf(v)) >= 0) { line = head(); why = "歌人：" + snip(p.au, x, x + v.length, 10); }
  else if (p.gb && (x = p.gb.indexOf(v)) >= 0) { line = head(); why = "原文：" + snip(p.gb, x, x + v.length, 10); }
  else if (p.sc && (x = p.sc.indexOf(v)) >= 0) { line = head(); why = "左注：" + snip(p.sc, x, x + v.length, 10); }
  else { x = p.rev.note.indexOf(v); line = head(); why = "注：" + snip(p.rev.note, x, x + v.length, 10); }
  return { i, line, why };
}

/* 改訂訳と注（notes.json）を歌に重ねる。AIの訳は aiya に残す
   notes.json の形：{ "48": { "ya": "改訂訳", "src": "拠り所", "note": "注", "date": "2026-11-25" } } */
export function applyNotes(P, byNo, notes) {
  let n = 0;
  for (const [k, v] of Object.entries(notes || {})) {
    const i = byNo.get(+k);
    if (i == null || !v || typeof v !== "object") continue;
    const ya = typeof v.ya === "string" ? v.ya.trim() : "", note = typeof v.note === "string" ? v.note.trim() : "";
    if (!ya && !note) continue;
    const p = P[i];
    if (p.aiya === undefined) p.aiya = p.ya;
    if (ya) p.ya = ya;
    p.rev = { ya: !!ya, src: typeof v.src === "string" ? v.src.trim() : "", note, date: typeof v.date === "string" ? v.date : "" };
    n++;
  }
  return n;
}

/* 題詞と左注が及ぶ範囲を求める。原文は書き換えず、どの歌にどの題詞・左注が掛かるかだけを返す
   題詞：次の題詞、巻や部立の変わり目まで。「歌N首」「また短歌」とあれば、その数と長歌の数で止める。
         組を締める「右」の左注があれば、そこで止める。範囲が分からないときは短めに取る（誤った題詞を出さない）
   左注：「右のN首」なら前のN首。数がなければ、前の左注か題詞の所まで。「右」で始まらなければその歌だけ */
const KNUM = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function kanjiNum(s) {
  if (/^\d+$/.test(s)) return +s;
  let n = 0, t = 0;
  for (const c of s) {
    if (c === "十") { n += (t || 1) * 10; t = 0; }
    else if (c in KNUM) t = KNUM[c];
    else return null;
  }
  return n + t;
}
const RIGHT = /(^|\n)右/; // 「右」の左注。万葉百科では前の行に別の注が来ることがある
const scCount = sc => { const m = /右(?:の|ノ)?([〇一二三四五六七八九十\d]+)首/.exec(sc || ""); return m ? kanjiNum(m[1]) : null; };

/* 「反歌」「短歌二首」「或る本の反歌に曰はく」のような小見出しは、長歌の組の内側にある。組を切らない */
export const isSubHead = s => /^(或る本の)?(反歌|短歌)(に曰はく)?([〇一二三四五六七八九十]+首)?$/.test(s || "");

export function groupNotes(P) {
  const kt = P.map(() => null), sc = P.map(() => []);
  P.forEach((p, i) => {
    if (!p.kt || isSubHead(p.kt)) return;
    const m = /歌([〇一二三四五六七八九十\d]+)首/.exec(p.kt), n = m ? kanjiNum(m[1]) : null;
    const withTanka = /(また|并せて|ならびに|并|及)短歌|反歌/.test(p.kt);
    const bounded = !!n || withTanka;
    let j = i, longs = 0, cnt = 0;
    for (; j < P.length; j++) {
      const q = P[j];
      if (j > i && ((q.kt && !isSubHead(q.kt)) || q.vol !== p.vol || q.sec !== p.sec)) break;
      if (bounded && q.kind === "長歌" && ++longs > (withTanka ? (n || 1) : Infinity)) break;
      cnt++;
      if (bounded) {
        const c = RIGHT.test(q.sc || "") ? scCount(q.sc) : -1;
        if (!withTanka) { if (cnt >= n) { j++; break; } continue; } // 「歌N首」は数で決める（一首ごとの「右の一首は」があっても続ける）
        if (c !== -1 && (c == null || c >= cnt)) { j++; break; }
        if (c !== -1) break; // 「右の一首」が長歌の組の途中に来たら、その歌は別の組（防人歌など）
      } else if (RIGHT.test(q.sc || "")) { j++; break; } // 数のない見出し（七夕など）は、データに小見出しの欠けがあるので最初の「右」で止める
    }
    for (let k = i; k < j; k++) kt[k] = { at: i, from: p.no, to: P[j - 1].no };
  });
  P.forEach((p, i) => {
    if (!p.sc) return;
    const c = scCount(p.sc);
    let s = i;
    if (c) s = i - c + 1;
    else if (RIGHT.test(p.sc)) while (s > 0 && (!P[s].kt || isSubHead(P[s].kt)) && !P[s - 1].sc) s--;
    s = Math.max(s, 0);
    while (s < i && P[s].vol !== p.vol) s++;
    for (let k = s; k <= i; k++) sc[k].push({ at: i, from: P[s].no, to: p.no });
  });
  return { kt, sc };
}

/* AIへの指示文 */
export function prompt(A, B) {
  const d = p => `${lab(p)}（${p.kind}）\n題詞：${p.kt || "なし"}\n歌人（万葉百科）：${p.au || "記載なし"}\n本文：${p.tx}\n原文：${p.gb || "なし"}\n左注：${p.sc || "なし"}\n${p.rev && p.rev.ya ? "現代語訳（利用者が授業や注釈書で確かめた改訂訳）" : "現代語訳（AI作成・参考）"}：${p.ya}${p.rev && p.rev.note ? `\n利用者の注：${p.rev.note}` : ""}`;
  return `あなたは万葉集研究の専門家です。次の二首の関係を分析してください。
本文は奈良県立万葉文化館「万葉百科」の読み下し文です。現代語訳は別の訓（鹿持雅澄『萬葉集古義』）からAIが作ったもので、本文とずれる場合があります。確信のない事実（作者、成立年、学説名など）は断定せず「要確認」と書いてください。架空の論文や学説を挙げてはいけません。

【A】${d(A)}

【B】${d(B)}

次のキーを持つJSONオブジェクトだけを返してください。値はそれぞれ日本語の常体（だ・である調）で1〜3文。
"common": 共通する表現（句・語・枕詞・構文）
"diff": 違い（場面・主体・心情・表記）
"relation": 関係の見立て（同一歌の異伝／一方が他方を踏まえた可能性／類型表現の共有／偶然の一致　のどれに近いか、根拠つき）
"check": 注釈書や本文で確かめるべき点`;
}

/* アドレスの # を読む */
export function parseHash(h) {
  let m = /^#n(\d+)$/.exec(h); if (m) return { view: "poem", a: +m[1] };
  m = /^#c(\d+)-(\d+)$/.exec(h); if (m) return { view: "cmp", a: +m[1], b: +m[2] };
  return null;
}
