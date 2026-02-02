# 音声文字起こし GAS アプリ

ブラウザで音声を録音し、Google Cloud Speech-to-Text API で文字起こしを行い、結果と音声ファイルを Google スプレッドシートに記録する Google Apps Script Web アプリです。

## 機能

- ブラウザ上でのマイク録音（リアルタイム波形表示付き）
- 録音プレビュー & 再生
- Google Cloud Speech-to-Text による日本語文字起こし
- 音声ファイルを Google Drive に自動保存
- 文字起こし結果・音声リンクをスプレッドシートに自動記録

## ファイル構成

```
Code.gs          … サーバーサイドロジック（API呼び出し・シート書き込み）
Index.html       … メインHTML テンプレート
Stylesheet.html  … CSS スタイル
JavaScript.html  … クライアントサイド JavaScript
```

## セットアップ手順

### 1. GAS プロジェクト作成

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成
2. 各ファイルの内容をプロジェクトにコピー
   - `Code.gs` → デフォルトの `Code.gs` に貼り付け
   - `Index.html`, `Stylesheet.html`, `JavaScript.html` → 「ファイルを追加」→「HTML」で各ファイルを作成

### 2. Google Cloud Speech-to-Text API の有効化

以下のいずれかの方法で API を利用できます。

#### 方法 A: API キーを使う（簡単）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを選択
2. 「APIとサービス」→「ライブラリ」から **Cloud Speech-to-Text API** を有効化
3. 「認証情報」→「認証情報を作成」→「API キー」を作成
4. GAS エディタで「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加:
   - プロパティ名: `SPEECH_API_KEY`
   - 値: 作成した API キー

#### 方法 B: OAuth を使う

1. GAS プロジェクトの GCP プロジェクト番号を設定
2. 該当 GCP プロジェクトで Cloud Speech-to-Text API を有効化
3. API キーの設定は不要（GAS の OAuth トークンで自動認証）

### 3. スプレッドシートの設定（任意）

既存のスプレッドシートを使いたい場合:

1. スクリプト プロパティに以下を追加:
   - プロパティ名: `SPREADSHEET_ID`
   - 値: スプレッドシートの ID（URL の `/d/` と `/edit` の間の文字列）

設定しない場合は、初回実行時に自動で新規作成されます。

### 4. デプロイ

1. GAS エディタで「デプロイ」→「新しいデプロイ」
2. 種類: **ウェブアプリ**
3. 次のユーザーとして実行: **自分**
4. アクセスできるユーザー: 用途に応じて選択
5. 「デプロイ」をクリック
6. 初回は権限の承認が求められるので許可する

## スプレッドシートの出力形式

| タイムスタンプ | 文字起こし | 音声ファイルURL | ファイル名 |
|---|---|---|---|
| 2026/02/02 12:00:00 | こんにちは、テストです。 | https://drive.google.com/... | recording_20260202_120000.webm |

## 注意事項

- 音声ファイルは Google Drive に保存されるため、ドライブの容量を消費します
- Speech-to-Text API には無料枠があります（月60分まで無料）。詳細は [料金ページ](https://cloud.google.com/speech-to-text/pricing) を確認してください
- ブラウザのマイクアクセス許可が必要です（HTTPS 環境必須 — GAS Web アプリは自動的に HTTPS）
