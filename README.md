# 音声ふりかえりアプリ (GAS)

ブラウザで音声を録音 → Google Cloud Speech-to-Text で文字起こし → Google スプレッドシートに記録する Google Apps Script Web アプリです。児童が自分の振り返りを日付ごとに読み返すことができます。

## 機能

- **名前入力** — 児童ごとに名前を記録（過去の名前はボタンで選択可能）
- **音声録音** — ブラウザのマイクで録音（リアルタイム波形表示付き）
- **文字起こし** — Google Cloud Speech-to-Text で日本語テキスト化
- **スプレッドシート記録** — タイムスタンプ・児童名・文字起こし・音声 URL を自動記録
- **振り返り閲覧** — 児童が自分の過去の録音を日付ごとに読み返せる
- **管理者セットアップ画面** — API キー・スプレッドシートを Web UI から設定

## ファイル構成

```
Code.gs          … サーバーサイド（API, シート操作, セットアップ）
Index.html       … メイン画面 HTML（名前入力 / 録音 / 振り返り）
Stylesheet.html  … CSS スタイル
JavaScript.html  … クライアント JS（録音, タブ切替, 振り返り表示）
Setup.html       … 管理者用セットアップ画面
appsscript.json  … GAS マニフェスト（権限・タイムゾーン設定）
setup.sh         … 自動セットアップスクリプト
.claspignore     … clasp push 除外設定
```

---

## セットアップ方法

### 方法 A: 自動セットアップ（推奨）

`setup.sh` を実行するだけで、プロジェクト作成 → ファイルアップロード → デプロイまで全自動で行います。

#### 前提条件

- **Node.js** (v16以上) がインストール済み
- Google アカウントを持っている

#### 手順

```bash
# 1. このリポジトリをクローン
git clone <repository-url>
cd demo

# 2. セットアップスクリプトを実行
chmod +x setup.sh
./setup.sh
```

スクリプトが自動で行うこと:

| ステップ | 内容 |
|---|---|
| 1 | clasp (GAS CLI) のインストール |
| 2 | Apps Script API の有効化案内 |
| 3 | Google アカウントへのログイン (ブラウザが開く) |
| 4 | GAS プロジェクトを新規作成 |
| 5 | 全ソースファイルをアップロード (`clasp push`) |
| 6 | Web アプリとしてデプロイ (`clasp deploy`) |

完了すると、以下の URL が表示されます:
- **アプリ URL** — 児童がアクセスする URL
- **セットアップ URL** — 管理者が API キーを設定する URL

#### スクリプト実行後にやること

1. **セットアップ URL** (`アプリURL?page=setup`) にアクセス
2. [Google Cloud Console](https://console.cloud.google.com/apis/library/speech.googleapis.com) で Speech-to-Text API を有効化
3. API キーを作成し、セットアップ画面で入力・保存
4. アプリ URL を児童に共有

#### clasp の個別コマンド（参考）

```bash
# clasp をインストール
npm install -g @google/clasp

# Google アカウントにログイン
clasp login

# GAS プロジェクトを新規作成
clasp create --title "音声ふりかえりアプリ" --type webapp

# ソースをアップロード
clasp push --force

# Web アプリとしてデプロイ
clasp deploy --description "初回デプロイ"

# デプロイ一覧を確認
clasp deployments

# コード変更後の再デプロイ
clasp push --force && clasp deploy --description "更新"

# GAS エディタをブラウザで開く
clasp open
```

---

### 方法 B: 手動セットアップ

#### Step 1: GAS プロジェクト作成

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成
2. 各ファイルの内容をプロジェクトにコピー:
   - `Code.gs` → デフォルトの `Code.gs` に貼り付け
   - `Index.html`, `Stylesheet.html`, `JavaScript.html`, `Setup.html`
     → 「ファイルを追加」→「HTML」で各ファイルを作成

#### Step 2: デプロイ

1. GAS エディタで「デプロイ」→「新しいデプロイ」
2. 種類: **ウェブアプリ**
3. 次のユーザーとして実行: **自分**
4. アクセスできるユーザー: **全員**（児童がアクセスする場合）
5. 「デプロイ」→ 権限を承認
6. 表示された URL をコピー

#### Step 3: 初期設定

デプロイ URL に `?page=setup` を付けてアクセス:

```
https://script.google.com/macros/s/XXXX/exec?page=setup
```

---

## 自動化される範囲

| 項目 | setup.sh 使用時 | 手動時 | 備考 |
|---|---|---|---|
| clasp インストール | **自動** | — | npm でインストール |
| GAS プロジェクト作成 | **自動** | 手動 | `clasp create` |
| ファイルアップロード | **自動** | 手動コピペ | `clasp push` |
| Web アプリデプロイ | **自動** | 手動 | `clasp deploy` |
| スプレッドシート作成 | **自動** | **自動** | 初回アクセス時に生成 |
| ヘッダー行・書式 | **自動** | **自動** | 自動挿入 |
| API キー設定 | **半自動** | **半自動** | Setup UI で入力 |
| GCP API 有効化 | 手動 | 手動 | Cloud Console で操作 |

## 使い方

### 児童向け

1. デプロイ URL にアクセス
2. 自分の名前を入力（2回目以降は自動で記憶）
3. **「録音する」タブ** — 録音 → 停止 → プレビュー → 「文字起こし & 保存」
4. **「ふりかえり」タブ** — 過去の録音を日付ごとに閲覧、音声も再生可能

### 管理者向け

- `?page=setup` で API キー・スプレッドシートを設定
- スプレッドシートで全児童の記録を一覧管理

## スプレッドシートの出力形式

| タイムスタンプ | 児童名 | 文字起こし | 音声ファイルURL | ファイル名 |
|---|---|---|---|---|
| 2026/02/02 12:00:00 | たろう | きょうは算数をがんばりました。 | https://drive.google.com/... | recording_20260202_120000.webm |

## 注意事項

- 音声ファイルは Google Drive に保存され、ドライブの容量を消費します
- Speech-to-Text API は月 60 分まで無料です
- ブラウザのマイクアクセス許可が必要です（GAS Web アプリは HTTPS なので対応済み）
- 児童の名前は各ブラウザの localStorage に保存されるため、同じ端末なら次回以降は名前入力不要です
