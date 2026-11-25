// 計算の部分のテスト：node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { marks, marksK, paint, cut, tate, align, toKana, search, rowText, candidates, dotCount, parseHash, prompt, esc, groupNotes, kanjiNum } from "../src/logic.js";

const P = JSON.parse(readFileSync(new URL("../src/data.json", import.meta.url)));
const byNo = new Map(P.map((p, i) => [p.no, i]));
const get = n => P[byNo.get(n)];
const kids = html => (html.match(/<mark>(.*?)<\/mark>/g) || []).map(s => s.replace(/<\/?mark>/g, ""));

test("データは4516首、番号の抜けがない", () => {
  assert.equal(P.length, 4516);
  for (let n = 1; n <= 4516; n++) assert.ok(byNo.has(n), `${n}がない`);
});

test("本文に詠み手名や「旋頭歌」が混じっていない", () => {
  for (const p of P) {
    assert.ok(!/[ 　]旋頭歌$/.test(p.tx), `${p.no}`);
    if (p.kind !== "長歌") assert.ok(!p.tx.includes("　"), `${p.no} ${p.tx}`);
  }
  assert.equal(get(96).au, "久米禅師");          // 歌人は万葉百科の記載
  assert.deepEqual(get(96).bk, ["〔禅師〕"]);   // 本文中の〔〕は本文から外して別に持つ
  assert.equal(get(2311).kind, "旋頭歌");
});

test("共通部分の印", () => {
  const m = marks("秋風に今か今かと月かたぶきぬ", "反り見すれば月かたぶきぬ", 3);
  assert.equal(kids(paint("秋風に今か今かと月かたぶきぬ", m)).join(), "月かたぶきぬ");
});

test("読みの一致を本文に写す（表記が違っても濃くなる）", () => {
  const html = paint(get(1668).tx, marksK(get(1668), get(3679)));   // 「ま楫」と「ま梶」
  assert.ok(kids(html).join("").includes("大船にま楫しじ貫き"), html);
});

test("短歌は上の句と下の句で二列に分ける", () => {
  const cases = { 48: "東の野にかぎろひの立つ見えて", 4311: "秋風に今か今かと紐解きて", 8: "熟田津に船乗りせむと月待てば", 4516: "新しき年の始めの初春の" };
  for (const [n, head] of Object.entries(cases)) {
    const p = get(+n), c = p.ct;
    assert.equal(p.tx.slice(0, c), head, `${n}`);
  }
  const html = tate(get(48), "東の野にかぎろひの立つ見えてかへり見すれば<mark>月傾きぬ</mark>");
  assert.equal((html.match(/<br>/g) || []).length, 1);
});

test("印が切れ目をまたいでも、HTMLが壊れない", () => {
  const p = get(48);
  const html = tate(p, paint(p.tx, p.tx.split("").map(() => true)));
  assert.equal((html.match(/<mark>/g) || []).length, (html.match(/<\/mark>/g) || []).length);
});

test("全短歌に切れ目があり、列の長さが偏りすぎない（語の境目と拍の数で決めた）", () => {
  let none = 0; const odd = [];
  for (const p of P) {
    if (p.kind === "長歌") continue;
    const c = p.ct;
    if (!(c > 0)) { none++; continue; }
    const r = c / p.tx.length;
    if (!(r > 0.25 && r < 0.75)) odd.push(p.no);
  }
  assert.equal(none, 0, `切れ目なし ${none}首`);
  assert.ok(odd.length < 30, `偏り ${odd.length}首 ${odd.slice(0, 10)}`);
});

test("本文と読みの対応づけ", () => {
  const p = get(2574), x = p.kn.indexOf("にぎ"), sp = align(p.tx, p.kn);
  const hit = sp.map(([a, b], t) => (b > a && a < x + 2 && b > x) ? p.tx[t] : "").join("");
  assert.equal(hit, "手握");
});

test("検索：番号・範囲外・本文・読み・片仮名・見つからない", () => {
  assert.equal(search(P, byNo, "48").rows[0].i, byNo.get(48));
  assert.equal(search(P, byNo, "４８").rows[0].i, byNo.get(48));
  assert.equal(search(P, byNo, "4600").kind, "range");
  assert.ok(search(P, byNo, "つきかたぶき").rows.length >= 5);
  const r = search(P, byNo, "にぎ");
  assert.deepEqual(r.rows.map(x => P[x.i].no).sort((a, b) => a - b), [804, 2574, 4028, 4465]);
  assert.ok(r.rows.every(x => x.why.includes("<mark>にぎ</mark>")));
  assert.equal(search(P, byNo, "ニギ").rows.length, 4);
  assert.equal(search(P, byNo, "あいうえおか").kind, "none");
  assert.equal(search(P, byNo, "   ").kind, "empty");
  const many = search(P, byNo, "の");
  assert.equal(many.rows.length, 50); assert.ok(many.more);
  assert.ok(search(P, byNo, "禅師").rows.some(x => P[x.i].no === 96), "歌人でも探せる");
  const g = search(P, byNo, "鳥尒之安良祢婆");
  assert.equal(P[g.rows[0].i].no, 893, "原文でも探せる");
  assert.ok(g.rows[0].why.startsWith("原文："));
});

test("検索結果の文字は必ずエスケープされる", () => {
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  const r = search(P, byNo, "<script>");
  assert.equal(r.kind, "none");
});

test("近い歌の候補と点の数", () => {
  const i = byNo.get(48);
  const all = candidates(P, i, "e", false), far = candidates(P, i, "e", true);
  assert.ok(far.length <= all.length);
  assert.ok(far.every(([j]) => Math.abs(P[j].no - 48) > 5));
  assert.equal(P[far[0][0]].no, 4311);
  assert.equal(dotCount(1, 1), 5); assert.equal(dotCount(0.01, 1), 1); assert.equal(dotCount(5, 1), 5);
});

test("一覧の長歌は一致の前後だけを切り出す", () => {
  const html = rowText(get(3992), get(4000), "e");
  assert.ok(html.length < 400, html.length);
  assert.ok(kids(html).length > 0);
});

test("アドレスの読み取り", () => {
  assert.deepEqual(parseHash("#n48"), { view: "poem", a: 48 });
  assert.deepEqual(parseHash("#c48-4311"), { view: "cmp", a: 48, b: 4311 });
  assert.equal(parseHash("#x"), null);
  assert.equal(parseHash(""), null);
});

test("AIへの指示に、注意と形式が入る", () => {
  const s = prompt(get(48), get(4311));
  for (const w of ["要確認", "架空の論文", "JSON", "common", "diff", "relation", "check", "巻1・48", "巻20・4311"]) assert.ok(s.includes(w), w);
});

test("読み：上代語UniDicで直った語", () => {
  assert.ok(get(328).kn.startsWith("あおによし"));
  assert.ok(get(3526).kn.includes("ふたゆく"));
  assert.ok(!get(1462).kn.includes("にぎ"));
  assert.equal(toKana("ツキカタブキ"), "つきかたぶき");
});

test("改訂訳と注を重ねる（AIの訳は残す）", async () => {
  const { applyNotes, search: s2, prompt: pr } = await import("../src/logic.js");
  const Q = JSON.parse(JSON.stringify(P)), bn = new Map(Q.map((p, i) => [p.no, i]));
  const ai = Q[bn.get(4106)].ya;
  const n = applyNotes(Q, bn, {
    "4106": { ya: "改訂した訳", src: "国文学ⅩⅧ", note: "しりぶりは後ろ姿", date: "2026-11-25" },
    "48": { note: "注だけの歌" },
    "99999": { ya: "存在しない番号" },
    "8": { ya: "  " },
    "bad": "文字列",
  });
  assert.equal(n, 2);
  const p = Q[bn.get(4106)];
  assert.equal(p.ya, "改訂した訳"); assert.equal(p.aiya, ai); assert.equal(p.rev.src, "国文学ⅩⅧ");
  assert.equal(Q[bn.get(48)].rev.ya, false); assert.equal(Q[bn.get(48)].ya, get(48).ya);
  assert.equal(Q[bn.get(8)].rev, undefined);
  const r = s2(Q, bn, "後ろ姿");
  assert.ok(r.rows.some(x => Q[x.i].no === 4106 && x.why.startsWith("注：")));
  const t = pr(Q[bn.get(4106)], Q[bn.get(48)]);
  assert.ok(t.includes("改訂訳") && t.includes("利用者の注：しりぶりは後ろ姿") && t.includes("注だけの歌"));
  applyNotes(Q, bn, { "4106": { ya: "二度目" } });
  assert.equal(Q[bn.get(4106)].aiya, ai, "二度重ねてもAIの訳は最初のまま");
});

test("notes.json は正しいJSONで、番号が実在する", () => {
  const notes = JSON.parse(readFileSync(new URL("../src/notes.json", import.meta.url)));
  for (const [k, v] of Object.entries(notes)) {
    assert.ok(byNo.has(+k), `${k}は存在しない番号`);
    assert.ok(v.ya || v.note, `${k}に訳も注もない`);
    assert.ok(v.src, `${k}に拠り所がない`);
  }
});

test("題詞と左注の範囲：組の歌すべてに掛かり、別の組には掛からない", () => {
  const G = groupNotes(P);
  const kt = n => { const k = G.kt[byNo.get(n)]; return k ? `${k.from}-${k.to}` : "-"; };
  const sc = n => G.sc[byNo.get(n)].map(x => `${x.from}-${x.to}`).join(",");
  assert.equal(kanjiNum("二十三"), 23);
  assert.equal(kanjiNum("廿"), null);
  assert.equal(kt(893), "892-893");          // 反歌は長歌の題詞を受け継ぐ
  assert.equal(kt(894), "894-896");          // 次の題詞からは別の組
  assert.equal(kt(142), "141-142");          // 「御歌二首」
  assert.equal(kt(4272), "4269-4272");       // 「歌四首」は一首ごとの左注があっても四首
  assert.equal(kt(4412), "4408-4412");       // 長歌と反歌の後の防人歌には掛けない
  assert.equal(kt(4413), "-");
  assert.equal(kt(2033), "1996-2033");       // 数のない見出しは最初の「右」で止める
  assert.equal(kt(2034), "-");
  assert.equal(sc(3335), "3335-3343");       // 「右九首」
  assert.equal(sc(1807), "1807-1811");       // 「右の五首」
  assert.equal(sc(4270), "4270-4270");       // 「右の一首」
  for (const [i, k] of G.kt.entries()) if (k) assert.equal(P[i].vol, P[k.at].vol, `${P[i].no}が巻をまたぐ`);
  for (const [i, a] of G.sc.entries()) for (const x of a) assert.equal(P[i].vol, P[x.at].vol, `${P[i].no}の左注が巻をまたぐ`);
});
