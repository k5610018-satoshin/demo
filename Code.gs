/**
 * 音声録音 → 文字起こし → スプレッドシート記録 Web アプリ
 *
 * 使い方:
 *   1. このスクリプトを Google Apps Script プロジェクトに貼り付ける
 *   2. スクリプトプロパティに SPREADSHEET_ID を設定する
 *      (空の場合は新規スプレッドシートを自動作成)
 *   3. Web アプリとしてデプロイする
 */

// ---------------------------------------------------------------------------
// Web App エントリポイント
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('音声文字起こしアプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML テンプレートで <?!= include('...') ?> を使うためのヘルパー */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// 音声アップロード & 文字起こし & スプレッドシート書き込み
// ---------------------------------------------------------------------------

/**
 * クライアントから Base64 エンコード済み音声データを受け取り、
 * Google Cloud Speech-to-Text API で文字起こしし、
 * スプレッドシートに記録する。
 *
 * @param {Object} payload  { audioBase64: string, mimeType: string, fileName: string }
 * @return {Object} { success: boolean, transcript: string, row: number }
 */
function processAudio(payload) {
  var audioBase64 = payload.audioBase64;
  var mimeType    = payload.mimeType || 'audio/webm';
  var fileName    = payload.fileName || 'recording.webm';

  // --- 1. 音声を Google Drive に保存 ---
  var blob      = Utilities.newBlob(Utilities.base64Decode(audioBase64), mimeType, fileName);
  var driveFile = DriveApp.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileUrl   = driveFile.getUrl();

  // --- 2. Speech-to-Text で文字起こし ---
  var transcript = transcribeAudio(audioBase64, mimeType);

  // --- 3. スプレッドシートに書き込み ---
  var row = writeToSheet(new Date(), transcript, fileUrl, fileName);

  return {
    success: true,
    transcript: transcript,
    fileUrl: fileUrl,
    row: row
  };
}

// ---------------------------------------------------------------------------
// Speech-to-Text (Google Cloud Speech API v1)
// ---------------------------------------------------------------------------

/**
 * Base64 音声データを Google Cloud Speech-to-Text API で文字起こしする。
 * ※ GAS プロジェクトで「Google Cloud Speech-to-Text API」を有効化し、
 *   OAuth スコープを追加しておく必要があります。
 *   代替手段として、GAS 組み込みの UrlFetchApp + API キーでも呼び出せます。
 *
 * @param {string} base64Audio
 * @param {string} mimeType
 * @return {string} 文字起こし結果テキスト
 */
function transcribeAudio(base64Audio, mimeType) {
  // エンコーディングのマッピング
  var encodingMap = {
    'audio/webm': 'WEBM_OPUS',
    'audio/ogg':  'OGG_OPUS',
    'audio/wav':  'LINEAR16',
    'audio/mp3':  'MP3',
    'audio/mpeg': 'MP3'
  };
  var encoding = encodingMap[mimeType] || 'WEBM_OPUS';

  var requestBody = {
    config: {
      encoding: encoding,
      sampleRateHertz: 48000,
      languageCode: 'ja-JP',
      enableAutomaticPunctuation: true,
      model: 'default'
    },
    audio: {
      content: base64Audio
    }
  };

  // --- 方法 A: API キーを使う場合 ---
  var apiKey = getApiKey();
  if (apiKey) {
    var url = 'https://speech.googleapis.com/v1/speech:recognize?key=' + apiKey;
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());

    if (json.error) {
      throw new Error('Speech API エラー: ' + json.error.message);
    }

    return extractTranscript(json);
  }

  // --- 方法 B: OAuth トークン (サービスアカウント or GAS のトークン) ---
  var token = ScriptApp.getOAuthToken();
  var url = 'https://speech.googleapis.com/v1/speech:recognize';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error('Speech API エラー: ' + json.error.message);
  }

  return extractTranscript(json);
}

/** Speech API レスポンスから文字起こしテキストを抽出 */
function extractTranscript(json) {
  if (!json.results || json.results.length === 0) {
    return '(音声を認識できませんでした)';
  }
  return json.results
    .map(function(r) { return r.alternatives[0].transcript; })
    .join('\n');
}

// ---------------------------------------------------------------------------
// スプレッドシート操作
// ---------------------------------------------------------------------------

/**
 * スプレッドシートに 1 行追加する。
 * ヘッダーがなければ自動で作成する。
 */
function writeToSheet(timestamp, transcript, fileUrl, fileName) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('音声記録') || ss.insertSheet('音声記録');

  // ヘッダー行がなければ作成
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['タイムスタンプ', '文字起こし', '音声ファイルURL', 'ファイル名']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  var row = sheet.getLastRow() + 1;
  sheet.appendRow([timestamp, transcript, fileUrl, fileName]);

  // タイムスタンプ列の書式設定
  sheet.getRange(row, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');

  return row;
}

/** スプレッドシートを取得 or 新規作成 */
function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SPREADSHEET_ID');

  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {
      Logger.log('指定された SPREADSHEET_ID が無効です。新規作成します。');
    }
  }

  // 新規作成して ID を保存
  var ss = SpreadsheetApp.create('音声文字起こし記録');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  Logger.log('新規スプレッドシートを作成しました: ' + ss.getUrl());
  return ss;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** スクリプトプロパティから API キーを取得 */
function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('SPEECH_API_KEY') || '';
}

/** 記録済みスプレッドシートの URL を返す (フロントエンドから呼び出し用) */
function getSpreadsheetUrl() {
  var ss = getOrCreateSpreadsheet();
  return ss.getUrl();
}
