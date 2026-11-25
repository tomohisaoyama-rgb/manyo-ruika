# 万葉集 類歌検索

万葉集全20巻4516首から、表現と内容の近い歌をたどるWebアプリです。紙と点の道具として、デザインシステム「静かな紙」に従っています。スマホのホーム画面に置けば、アプリと同じように開けます。一度開けば、電波がなくても使えます。

## 作り

素のHTML・CSS・ES modulesで書いています。ビルドの道具も外部ライブラリも使いません。

| ファイル | 役目 |
| --- | --- |
| `src/index.html` `src/style.css` | 画面 |
| `src/app.js` | 画面の動き（検索、一覧、比べる画面、めくる操作、前回の歌を覚える） |
| `src/logic.js` | 計算の部分（一致の印、縦書きの切れ目、検索）。`node --test` で確かめる |
| `src/update.js` | 更新を届ける `keepFresh` |
| `src/sw.js` | キャッシュ優先の Service Worker |
| `src/version.js` | 版と公開日（`tools/build.sh` が書き込む） |
| `src/about.html` | 使い方のページ（/about） |
| `src/data.json` `src/stats.json` | 歌のデータと検証の数字 |
| `tools/build.sh` | 公開用の `dist/` を作る |
| `tools/deploy.sh` | テスト、ビルド、Cloudflare Pages への公開をまとめて行う |
| `tools/build_data.py` `tools/stats.py` | データを作り直す |
| `VERSION` | 今の版の番号 |

## 初めて公開する

Cloudflare Pages（無料）に置きます。

```sh
npx wrangler login                  # 初回だけ。ブラウザでCloudflareにログイン
tools/deploy.sh                     # テスト → ビルド → 公開
```

公開先は `https://manyo-ruika.pages.dev` になります。別の名前にするときは、`tools/deploy.sh` の `PROJECT` と、`tools/build.sh` の `SITE` を変えます。

## 更新する（バージョンアップ）

1. `src/` を直します。
2. `VERSION` の数字を一つ上げます。
3. `tools/deploy.sh` を実行します。

これだけで、使っている人の画面は次のように新しくなります。

- ホーム画面のアプリは、次に開いたときに新しくなります。
- 開いたままの人は、画面に戻ったときに更新を確かめ、入力中やAIの比較中でなければ、その場で読み込み直します。開いていた歌はそのままです。
- `VERSION` を上げないと、ファイルを変えても届きません（キャッシュ優先のため）。

版と公開日は、画面の一番下と使い方のページに出ます。

## データを作り直す

本文は雲居の文庫『万葉集』（CC0、`kumoi-no-fumigura/manyoshu`）から、読みは国立国語研究所「上代語UniDic」で作ります。

```sh
pip install fugashi pykakasi sudachipy sudachidict_core scikit-learn
JODAI_DIC=/path/to/unidic-jodai python3 tools/build_data.py /path/to/kumoi src/data.json
python3 tools/stats.py src/data.json src/stats.json
```

`build_data.py` がしていること：

- 本文の末尾に付いた詠み手名と「旋頭歌」の表示を外す
- 底本のルビを当ててから上代語UniDicで解析し、歴史的仮名遣いの読みを作る
- 短歌の上の句と下の句の切れ目を、語の境目と拍の数（5・7・5）から決める（`ct`）
- 仮名の文字4-gramで「表現が近い」、現代語訳の内容語で「内容が近い」歌を、各12首まで選ぶ

## テスト

```sh
npm test        # 計算の部分（15項目）
```

画面の自動テスト（全4516首の表示、検索、比べる画面、AIの成功と失敗、オフライン、更新の流れ、めくる操作）は、Chrome を動かして別に行っています。

## 出典とライセンス

- 本文：雲居の文庫『万葉集』（CC0）。現代語訳は同文庫がAIで作成したもの。
- 読み：国立国語研究所「通時コーパス」プロジェクト「上代語UniDic」ver.2025.12（CC BY-NC-SA 4.0）。読みのデータも同じ条件（表示・非営利・継承）で扱います。営利で使う場合は、国立国語研究所への事前の問い合わせが必要です。

## 記録

- バージョン 2（2026年11月25日）：Service Workerが転送された応答をページに使い、公開先で開けなかった不具合を直した。
- バージョン 1（2026年11月25日）：スマホ向けWebアプリとして公開。PWA、オフライン、更新の仕組み、めくる操作、前回の歌を覚える。
