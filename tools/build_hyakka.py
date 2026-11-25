"""万葉集 類歌検索 v4 のデータ生成。本文・読み・題詞・左注・歌人を万葉百科から作る。
入力:
  hyakka.json … 奈良県立万葉文化館「万葉百科」の歌の詳細を項目ごとにまとめたもの（~/dev/manyo-hyakka/parse.py が作る）
  前の data.json … 現代語訳（ya、雲居の文庫のAI訳）と内容の近さ（c）を引き継ぐ
出力: data.json
  使い方: python tools/build_hyakka.py hyakka.json 前のdata.json 出力のdata.json
  必要: numpy, scikit-learn
現代語訳は万葉百科のものを使わない（第三者の権利が残りうるため）。
"""
import json, re, sys, os
import numpy as np
from difflib import SequenceMatcher
from sklearn.feature_extraction.text import TfidfVectorizer

H = {int(k): v for k, v in json.load(open(sys.argv[1], encoding="utf-8")).items()}
OLD = {p["no"]: p for p in json.load(open(sys.argv[2], encoding="utf-8"))}
OUT = sys.argv[3]
K = 12

# 仮名の正規化。画面の検索（logic.js の NORM）と同じ表。1字を1字に置き換えるので位置がずれない
NORM = str.maketrans("ぁぃぅぇぉっゃゅょゎゐゑを", "あいうえおつやゆよわいえお")
SMALL = set("ぁぃぅぇぉゃゅょゎ")  # 拍に数えない小書き（促音っは数える）
BR = re.compile(r"〔[^〕]*〕")

def unbr(s):
    """本文中の〔…〕（異伝・詠み手の注）を外し、外したものを返す"""
    return BR.sub("", s).strip(), BR.findall(s)

def kana(s):
    return re.sub(r"[^ぁ-ゖ]", "", s)

isH = lambda c: "ぁ" <= c <= "ゖ"
SOLID = re.compile(r"[㐀-鿿々〆ヵヶ-]")

def align(tx, kn):
    """本文の各文字が仮名のどこに当たるか。logic.js の align と同じ手順"""
    sp = [None] * len(tx); k = 0; i = 0
    nm = lambda c: c.translate(NORM)
    while i < len(tx):
        c = tx[i]
        if isH(c):
            f = kn.find(nm(c), k)
            if f >= 0 and f - k < 12: sp[i] = (f, f + 1); k = f + 1
            else: sp[i] = (k, k)
            i += 1; continue
        j = i
        while j < len(tx) and not isH(tx[j]): j += 1
        solid = [t for t in range(i, j) if SOLID.match(tx[t])]
        end = len(kn)
        if j < len(tx):
            an = nm(tx[j]); t = j + 1
            while t < len(tx) and t < j + 3 and isH(tx[t]): an += nm(tx[t]); t += 1
            f = -1; L = len(an)
            while L >= 1 and f < 0:
                g = kn.find(an[:L], k + max(1, len(solid)))
                if g >= 0 and g - k <= len(solid) * 4 + 2: f = g
                L -= 1
            end = f if f >= 0 else min(len(kn), k + len(solid) * 2)
        for t in range(i, j): sp[t] = (k, k)
        n = len(solid)
        for x, t in enumerate(solid):
            sp[t] = (k + round((end - k) * x / n), k + round((end - k) * (x + 1) / n))
        k = end; i = j
    return sp

def pattern(kind, total):
    if kind == "旋頭歌": return [5, 7, 7, 5, 7, 7]
    if kind == "仏足石歌": return [5, 7, 5, 7, 7, 7]
    if kind == "短歌": return [5, 7, 5, 7, 7]
    # 長歌：5・7を繰り返し、最後は5・7・7で結ぶ。対の数は拍の合計から見積もり、前後も試す
    est = max(2, round((total - 7) / 12))
    return [[5, 7] * pairs + [7] for pairs in range(max(2, est - 2), est + 3)]

def bcost(prev, nxt):
    """切れ目の置きやすさ。仮名→漢字の境が一番自然"""
    if isH(prev) and not isH(nxt): return 0.0
    if isH(prev) and isH(nxt): return 0.3 if prev in "てにのはをばどもやかぞ" else 1.5
    if not isH(prev) and not isH(nxt): return 2.5
    return 3.0  # 漢字→仮名（送り仮名の途中になりやすい）

PRIOR = set()  # 前のデータ（雲居の文庫）で句が切れていた位置を、今の本文の位置に写したもの

def bcost_at(tx, t):
    return bcost(tx[t - 1], tx[t]) - (1.0 if t in PRIOR else 0.0)

def prior_cuts(old_tx, old_ct, tx):
    """前の本文の句の切れ目を、文字の一致する所だけ今の本文へ写す"""
    flat, cuts = "", []
    for part in old_tx.split("　"):
        if flat: cuts.append(len(flat))
        flat += part
    if old_ct and old_ct > 0: cuts.append(old_ct)
    out = set()
    for a, b, size in SequenceMatcher(None, flat, tx, autojunk=False).get_matching_blocks():
        for c in cuts:
            if a + 1 < c < a + size - 1:
                out.add(b + (c - a))
    return out

def phrases(tx, raw_kana, kind):
    """句の切れ目（本文の位置）を、拍の数と境目の自然さから動的計画法で決める"""
    kn = raw_kana.translate(NORM)
    if len(tx) < 6 or len(kn) < 10: return []
    sp = align(tx, kn)
    # 仮名の位置ごとの累積拍
    acc = [0]
    for c in raw_kana: acc.append(acc[-1] + (0 if c in SMALL else 1))
    mora_at = lambda t: acc[sp[t][0]] if t < len(tx) else acc[-1]
    total = acc[-1]
    if kind == "長歌": return dp_free(tx, mora_at)
    pats = pattern(kind, total)
    if isinstance(pats[0], int): pats = [pats]
    for slack in (4, 12):  # 字余りの大きい歌は許す幅を広げて解き直す
        res = [r for r in (dp(tx, p, mora_at, slack) for p in pats) if r]
        if res: return min(res)[1]
    return []

def dp(tx, pat, mora_at, slack=4):
    cuts = list(range(1, len(tx)))
    pos = [0] + cuts + [len(tx)]
    M = [mora_at(t) for t in pos]
    INF = 1e9
    n, m = len(pos), len(pat)
    best = [[INF] * n for _ in range(m + 1)]; back = [[-1] * n for _ in range(m + 1)]
    best[0][0] = 0
    for q in range(1, m + 1):
        goal = pat[q - 1]
        for b in range(1, n):
            if q == m and b != n - 1: continue
            if q < m and b == n - 1: continue
            bc = 0 if b == n - 1 else bcost_at(tx, pos[b])
            for a in range(b - 1, -1, -1):
                d = M[b] - M[a]
                if d > goal + slack: break
                if best[q - 1][a] >= INF: continue
                over = d - goal
                c = best[q - 1][a] + (abs(over) * 1.5 if over < 0 else over * 0.9) + bc
                if c < best[q][b]: best[q][b] = c; back[q][b] = a
    if best[m][n - 1] >= INF: return None
    out, b = [], n - 1
    for q in range(m, 0, -1):
        a = back[q][b]
        if a > 0: out.append(pos[a])
        b = a
    return (best[m][n - 1], sorted(out))

def dp_free(tx, mora_at):
    """長歌：句ごとに5か7を選ぶ。5・7の交互から外れると少し罰する。終わりは7"""
    pos = list(range(0, len(tx) + 1))
    M = [mora_at(t) for t in pos]
    INF = 1e9; n = len(pos)
    best = {(0, 7): 0.0}; back = {}
    order = sorted(range(1, n))
    for b in order:
        bc = 0 if b == n - 1 else bcost_at(tx, b)
        for g in (5, 7):
            bb = INF; arg = None
            for a in range(b - 1, -1, -1):
                d = M[b] - M[a]
                if d > g + 4: break
                for gp in (5, 7):
                    pc = best.get((a, gp))
                    if pc is None: continue
                    over = d - g
                    c = pc + (abs(over) * 1.5 if over < 0 else over * 0.9) + bc + (3.0 if gp == g else 0) + 0.3
                    if c < bb: bb = c; arg = (a, gp)
            if arg: best[(b, g)] = bb; back[(b, g)] = arg
    if (n - 1, 7) not in best: return []
    out, st = [], (n - 1, 7)
    while st in back:
        a = back[st]
        if a[0] > 0: out.append(pos[a[0]])
        st = a
    return sorted(out)

def name(s):
    return re.sub(r"\s*\(\d+\)$", "", s.split(" / ")[0]).strip()

poems = []
for no in sorted(H):
    h, old = H[no], OLD[no]
    kind = h["歌体"]
    tx, notes = unbr(h["読み下し文"])
    tx = re.sub(r"[\s　]+", "", tx)
    raw = kana(BR.sub("", h["訓み"]))
    kn = raw.translate(NORM)
    p = {
        "no": no, "vol": h["vol"], "kind": kind,
        "sec": "" if h["部立"] == "なし" else h["部立"],
        "kt": h.get("読み下し文(題詞)", ""),
        "au": name(h["歌人"]),
        "tx": tx, "sc": h.get("読み下し文(左注)", ""),
        "ya": old["ya"], "kn": kn, "ym": BR.sub("", h["訓み"]).strip(),
        "gb": h["漢字本文"],
    }
    for k_src, k in (("読み下し文(標目)", "hm"), ("読み下し文(序文など)", "jo")):
        if h.get(k_src): p[k] = h[k_src]
    if notes: p["bk"] = notes
    PRIOR.clear(); PRIOR.update(prior_cuts(old["tx"], old.get("ct"), tx))
    cs = phrases(tx, raw, kind)
    if kind == "長歌":
        for t in reversed(cs): tx = tx[:t] + "　" + tx[t:]
        p["tx"] = tx
    elif len(cs) >= 3:
        p["ct"] = cs[2]  # 上の句（三句目）の後ろ
    p["c"] = old["c"]
    poems.append(p)

def topk(M, k):
    S = (M.tocsr() @ M.T).toarray()
    np.fill_diagonal(S, 0)
    return S, np.argsort(-S, axis=1)[:, :k * 2]

# 表現の近さ：仮名の文字4-gram
ve = TfidfVectorizer(analyzer="char", ngram_range=(4, 4), sublinear_tf=True, min_df=2)
Se, Ie = topk(ve.fit_transform([p["kn"] for p in poems]), K)

def pick(S, I, i):
    res = []
    for j in I[i]:
        s = float(S[i, j])
        if s <= 0.02: break
        res.append([int(j), round(s, 3)])
        if len(res) == K: break
    return res

for i, p in enumerate(poems):
    p["e"] = pick(Se, Ie, i)

json.dump(poems, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("poems", len(poems), "wrote", OUT, os.path.getsize(OUT))
print("長歌の句", sum(p["tx"].count("　") + 1 for p in poems if p["kind"] == "長歌"),
      "短歌の切れ目", sum(1 for p in poems if p.get("ct")), "/", sum(1 for p in poems if p["kind"] != "長歌"))
