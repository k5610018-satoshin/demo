#!/usr/bin/env bash
# =============================================================================
# 音声ふりかえりアプリ — 自動セットアップスクリプト
#
# このスクリプトは以下を自動で行います:
#   1. clasp (Google Apps Script CLI) のインストール
#   2. Google アカウントへのログイン
#   3. GAS プロジェクトの新規作成
#   4. ソースファイルのアップロード (push)
#   5. Web アプリとしてデプロイ
#   6. Apps Script API の有効化案内
#
# 使い方:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -euo pipefail

# --- 色付き出力 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# --- スクリプトのディレクトリに移動 ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  音声ふりかえりアプリ 自動セットアップ"
echo "============================================"
echo ""

# =============================================================================
# Step 0: 前提条件チェック
# =============================================================================
info "前提条件を確認中..."

# Node.js チェック
if ! command -v node &> /dev/null; then
  err "Node.js がインストールされていません。"
  echo "  https://nodejs.org/ からインストールしてください。"
  exit 1
fi
ok "Node.js $(node -v) を検出"

# npm チェック
if ! command -v npm &> /dev/null; then
  err "npm が見つかりません。Node.js を再インストールしてください。"
  exit 1
fi
ok "npm $(npm -v) を検出"

# =============================================================================
# Step 1: clasp インストール
# =============================================================================
echo ""
info "Step 1: clasp のインストール"

if command -v clasp &> /dev/null; then
  ok "clasp は既にインストール済み ($(clasp -v 2>/dev/null || echo 'version unknown'))"
else
  info "clasp をグローバルインストール中..."
  npm install -g @google/clasp
  ok "clasp をインストールしました"
fi

# =============================================================================
# Step 2: Apps Script API の有効化案内
# =============================================================================
echo ""
info "Step 2: Apps Script API の有効化"
echo ""
echo "  clasp を使うには Google Apps Script API を有効にする必要があります。"
echo ""
echo "  以下の URL をブラウザで開いて、API を ON にしてください:"
echo ""
echo "    https://script.google.com/home/usersettings"
echo ""
echo "  「Google Apps Script API」を「オン」に切り替えてください。"
echo ""
read -p "  有効にしたら Enter を押してください... "
ok "Apps Script API 有効化を確認"

# =============================================================================
# Step 3: Google アカウントにログイン
# =============================================================================
echo ""
info "Step 3: Google アカウントにログイン"

if [ -f ~/.clasprc.json ]; then
  warn "既存のログイン情報を検出。再ログインする場合は clasp logout を実行してください。"
  read -p "  既存のログイン情報を使いますか？ (Y/n): " USE_EXISTING
  if [[ "${USE_EXISTING:-Y}" =~ ^[Nn] ]]; then
    clasp logout
    clasp login
  fi
else
  info "ブラウザが開きます。Google アカウントでログインしてください。"
  clasp login
fi
ok "ログイン完了"

# =============================================================================
# Step 4: GAS プロジェクト作成
# =============================================================================
echo ""
info "Step 4: GAS プロジェクトを作成"

if [ -f .clasp.json ]; then
  warn ".clasp.json が既に存在します。"
  read -p "  既存のプロジェクトを使いますか？ (Y/n): " USE_EXISTING_PROJECT
  if [[ "${USE_EXISTING_PROJECT:-Y}" =~ ^[Nn] ]]; then
    rm .clasp.json
    info "新規プロジェクトを作成中..."
    clasp create --title "音声ふりかえりアプリ" --type webapp
  fi
else
  clasp create --title "音声ふりかえりアプリ" --type webapp
fi

# プロジェクト ID を表示
if [ -f .clasp.json ]; then
  SCRIPT_ID=$(python3 -c "import json; print(json.load(open('.clasp.json'))['scriptId'])" 2>/dev/null || \
              node -e "console.log(JSON.parse(require('fs').readFileSync('.clasp.json','utf8')).scriptId)" 2>/dev/null || \
              echo "不明")
  ok "プロジェクトを作成しました"
  echo "  Script ID: ${SCRIPT_ID}"
  echo "  GAS エディタ: https://script.google.com/d/${SCRIPT_ID}/edit"
else
  err ".clasp.json が生成されませんでした。clasp create に失敗した可能性があります。"
  exit 1
fi

# =============================================================================
# Step 5: ファイルをアップロード (push)
# =============================================================================
echo ""
info "Step 5: ソースファイルをアップロード中..."

clasp push --force
ok "全ファイルをアップロードしました"

# push された内容を確認
echo ""
info "アップロードされたファイル:"
clasp status 2>/dev/null || true

# =============================================================================
# Step 6: Web アプリとしてデプロイ
# =============================================================================
echo ""
info "Step 6: Web アプリとしてデプロイ中..."

DEPLOY_OUTPUT=$(clasp deploy --description "自動デプロイ $(date '+%Y-%m-%d %H:%M:%S')" 2>&1)
echo "$DEPLOY_OUTPUT"

# デプロイ ID を抽出
DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | grep -oP '(?<=- )AKfycb[a-zA-Z0-9_-]+' | head -1 || echo "")

if [ -n "$DEPLOY_ID" ]; then
  WEB_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
  SETUP_URL="${WEB_URL}?page=setup"

  ok "デプロイ完了！"
  echo ""
  echo "============================================"
  echo "  セットアップ完了"
  echo "============================================"
  echo ""
  echo "  アプリ URL (児童向け):"
  echo "    ${WEB_URL}"
  echo ""
  echo "  セットアップ URL (管理者向け):"
  echo "    ${SETUP_URL}"
  echo ""
  echo "  GAS エディタ:"
  echo "    https://script.google.com/d/${SCRIPT_ID}/edit"
  echo ""
  echo "============================================"
  echo "  次のステップ"
  echo "============================================"
  echo ""
  echo "  1. セットアップ URL にアクセスして API キーを設定"
  echo "  2. Google Cloud Console で Speech-to-Text API を有効化"
  echo "     https://console.cloud.google.com/apis/library/speech.googleapis.com"
  echo "  3. API キーを作成し、セットアップ画面で入力"
  echo "  4. アプリ URL を児童に共有"
  echo ""
else
  warn "デプロイ ID を自動取得できませんでした。"
  echo ""
  echo "  以下のコマンドでデプロイ一覧を確認してください:"
  echo "    clasp deployments"
  echo ""
  echo "  または GAS エディタからデプロイしてください:"
  echo "    https://script.google.com/d/${SCRIPT_ID}/edit"
fi
