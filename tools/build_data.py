"""万葉集 類歌検索 v1 のデータ生成。
入力: 雲居の文庫 manyo.json（CC0、鹿持雅澄訓）と yaku/*.txt（現代語訳）
出力: site/data.json
"""
import json, re, sys, glob, os
import numpy as np
import pykakasi
from sudachipy import dictionary, tokenizer as stok
from sklearn.feature_extraction.text import TfidfVectorizer

SRC = sys.argv[1]  # kumoi のディレクトリ
OUT = sys.argv[2]
K = 12

d = json.load(open(os.path.join(SRC, "manyo.json")))
blocks = d["blocks"]

# 現代語訳
yaku = {}
for f in sorted(glob.glob(os.path.join(SRC, "yaku", "*.txt"))):
    for line in open(f, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 2:
            yaku[p[0]] = p[1].replace("⏎", "\n")

kks = pykakasi.kakasi()
SMALL = str.maketrans("ぁぃぅぇぉっゃゅょゎゐゑ", "あいうえおつやゆよわいえ")

KUN = [("大君", "おほきみ"), ("今日", "けふ"), ("今夜", "こよひ"), ("初春", "はつはる"), ("昔", "むかし"),
       ("年", "とし"), ("月", "つき"), ("日", "ひ"), ("人", "ひと"), ("夜", "よ"),
       ("天", "あめ"), ("妹", "いも"), ("君", "きみ"), ("我", "われ"), ("吾", "わ"),
       ("背子", "せこ"), ("恋", "こひ"), ("思", "おも"),
       ("見", "み"), ("来", "き"), ("心", "こころ"), ("命", "いのち"), ("家", "いへ"),
       ("世", "よ"), ("時", "とき"), ("声", "こゑ"), ("色", "いろ"),
       ("人言", "ひとごと"), ("言は", "いは"), ("言ふ", "いふ"), ("言ひ", "いひ"), ("言へ", "いへ"),
       ("言", "こと"), ("戯奴", "わけ"), ("二つ", "ふたつ"), ("二行", "ふたゆ"), ("二人", "ふたり")]

KUN.sort(key=lambda kv: -len(kv[0]))

import fugashi, csv
JODAI = os.environ.get("JODAI_DIC", "/home/claude/jodai/dic")
_tagger = fugashi.GenericTagger(f"-r {JODAI}/dicrc -d {JODAI}")
KATA = str.maketrans({chr(c): chr(c - 96) for c in range(ord("ァ"), ord("ヶ") + 1)})
STATS = {"known": 0, "unk": 0}

def jodai_kana(t):
    """上代語UniDicで形態素解析し、仮名形（歴史的仮名遣い）をつなぐ。辞書にない語だけ機械の読みで補う"""
    out = []
    for w in _tagger(t):
        f = next(csv.reader([w.feature_raw]))
        k = f[20] if len(f) > 20 else "*"
        if k and k != "*" and re.fullmatch(r"[ァ-ヶー]+", k):
            out.append(k.translate(KATA)); STATS["known"] += 1
        else:
            out.append("".join(x["hira"] for x in kks.convert(w.surface))); STATS["unk"] += 1
    return "".join(out)

SMALLK = set("ァィゥェォャュョヮッ")  # 拗音の小書きは拍に数えない（促音ッは数える）

def split_at(t, kind):
    """短歌・旋頭歌の切れ目（上の句の後ろ）を、語の境目と拍の数から決める"""
    goal = 19 if kind == "旋頭歌" else 17
    pos, mora, cands = 0, 0, []
    for w in _tagger(t):
        f = next(csv.reader([w.feature_raw]))
        # 付属語（助詞・助動詞・接尾辞）の前では切らない
        if 0 < pos < len(t) and f[0] not in ("助詞", "助動詞", "接尾辞", "補助記号"):
            cands.append((abs(mora - goal) - (0.5 if mora >= goal else 0), pos))
        k = f[20] if len(f) > 20 and f[20] != "*" else "".join(x["kana"] for x in kks.convert(w.surface))
        mora += sum(1 for c in k if (c not in SMALLK and c != "ー") or c == "ッ")
        pos += len(w.surface)
    return min(cands)[1] if cands else -1

def kana_of(b):
    t = b["text"]
    # ルビを適用（後ろから置換して位置ずれを防ぐ）
    for r in sorted(b.get("ruby", []), key=lambda r: -r["at"]):
        at, base = r["at"], r["base"]
        if t[at:at + len(base)] == base:
            t = t[:at] + r["t"] + t[at + len(base):]
    out = jodai_kana(t)
    out = re.sub(r"[^ぁ-ゖ]", "", out).translate(SMALL)
    out = out.replace("を", "お")
    return out

tok = dictionary.Dictionary().create()
STOP = set("する いる ある なる 私 こと もの よう ない 思う 言う いう 見る 来る 行く くる いく あなた 自分 ため 時 中 その この 人 れる られる".split())

def content_words(s):
    ws = []
    for m in tok.tokenize(s, stok.Tokenizer.SplitMode.C):
        pos = m.part_of_speech()[0]
        if pos in ("名詞", "動詞", "形容詞"):
            w = m.dictionary_form()
            if w not in STOP and len(w) > 1 and not re.fullmatch(r"[0-9０-９]+", w):
                ws.append(w)
    return " ".join(ws)

poems = []
def clean(b):
    """本文末尾の「旋頭歌」表示と、問答歌の詠み手名を本文から外す"""
    t, kind, sp = b["text"], b["kind"], ""
    if t.endswith(" 旋頭歌") or t.endswith("　旋頭歌"):
        t, kind = t[:-4], "旋頭歌"
    if kind != "長歌" and "　" in t:
        parts = t.split("　")
        if len(parts) >= 3:
            kind = "長歌"
        elif b["no"] == 1635:
            t, sp = parts[0].replace(" 尼作ム", "") + parts[1].replace(" 家持続グ", ""), "上の句は尼、下の句は家持"
        else:
            t, sp = parts[0], parts[1]
    return t, kind, sp

# 元データの左注の誤りを直す。根拠は奈良県立万葉文化館「万葉百科」（2026-11-25閲覧）と授業の配布資料
SACHU_FIX = {
    893: "山上憶良頓首謹みて上る。",  # 元データでは 901 に付いていた
    901: "",
}

for b in blocks:
    if b["no"] in SACHU_FIX:
        b = dict(b, sachu=SACHU_FIX[b["no"]])
    y = yaku.get(b["id"], "")
    tx, kind, sp = clean(b)
    b = dict(b, text=tx)
    poems.append({
        "no": b["no"], "vol": b["vol"], "kind": kind,
        "sec": b["section"] or "", "kt": b["kotobagaki"] or "",
        "au": b["author"] or "", "tx": b["text"], "sc": b["sachu"] or "",
        "ya": y, "kn": kana_of(b),
    })
    if sp:
        poems[-1]["sp"] = sp
    if kind != "長歌":
        poems[-1]["ct"] = split_at(tx, kind)
print("poems", len(poems), "yaku", sum(1 for p in poems if p["ya"]))
print("UniDic", STATS)

def topk(M, k):
    M = M.tocsr()
    S = (M @ M.T).toarray()
    np.fill_diagonal(S, 0)
    idx = np.argsort(-S, axis=1)[:, :k * 2]
    return S, idx

# 表現の近さ：仮名の文字4-gram
ve = TfidfVectorizer(analyzer="char", ngram_range=(4, 4), sublinear_tf=True, min_df=2)
Se, Ie = topk(ve.fit_transform([p["kn"] for p in poems]), K)
# 内容の近さ：現代語訳の内容語
vc = TfidfVectorizer(analyzer=str.split, sublinear_tf=True, min_df=2, max_df=0.2)
Sc, Ic = topk(vc.fit_transform([content_words(p["ya"]) for p in poems]), K)

def pick(S, I, i):
    res = []
    for j in I[i]:
        s = float(S[i, j])
        if s <= 0.02:
            break
        res.append([int(j), round(s, 3)])
        if len(res) == K:
            break
    return res

for i, p in enumerate(poems):
    p["e"] = pick(Se, Ie, i)
    p["c"] = pick(Sc, Ic, i)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(poems, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT))
