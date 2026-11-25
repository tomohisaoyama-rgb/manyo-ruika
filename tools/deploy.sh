#!/usr/bin/env bash
# テスト → ビルド → Cloudflare Pages へ公開
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${PROJECT:-manyo-ruika}"
node --test tests/*.test.js
tools/build.sh
npx --yes wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
echo "公開しました：バージョン $(tr -d ' \n' < VERSION)"
