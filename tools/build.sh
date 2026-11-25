#!/usr/bin/env bash
# 公開用の dist/ を作る。VERSION と公開日を書き込む
#   使い方: tools/build.sh            （SITE を変えるときは SITE=https://… tools/build.sh）
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(tr -d ' \n' < VERSION)"
DATE="$(TZ=Asia/Tokyo date +%Y年%-m月%-d日)"
# 公開のたびに Service Worker の版を変え、改訂訳などの更新を必ず届ける
STAMP="$(TZ=Asia/Tokyo date +%Y%m%d%H%M%S)"
SWVERSION="${VERSION}.${STAMP}"
SITE="${SITE:-https://manyo-ruika.pages.dev}"
rm -rf dist && mkdir -p dist
cp -R src/. dist/
for f in dist/sw.js dist/version.js dist/index.html dist/about.html dist/robots.txt dist/sitemap.xml; do
  [ -f "$f" ] || continue
  sed -i.bak -e "s|__SWVERSION__|${SWVERSION}|g" -e "s|__VERSION__|${VERSION}|g" -e "s|__DATE__|${DATE}|g" -e "s|__SITE__|${SITE}|g" "$f" && rm -f "$f.bak"
done
if grep -rq "__VERSION__\|__SWVERSION__\|__DATE__\|__SITE__" dist --include='*.js' --include='*.html' --include='*.txt' --include='*.xml'; then
  echo "置き換え残りがあります" >&2; exit 1
fi
python3 -c "import json,sys;json.load(open('dist/notes.json'))" || { echo "notes.json の書き方が正しくありません" >&2; exit 1; }
echo "dist/ を作りました：バージョン ${VERSION}（${DATE}） SW ${SWVERSION} ${SITE}"
