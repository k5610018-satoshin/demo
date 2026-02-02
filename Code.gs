/**
 * 音声録音 → 文字起こし → スプレッドシート記録 Web アプリ
 *
 * 使い方:
 *   1. このスクリプトを Google Apps Script プロジェクトに貼り付ける
 *   2. Web アプリとしてデプロイ → URL に ?page=setup でアクセスし初期設定
 *   3. 児童は通常の URL にアクセスして録音 & 振り返り閲覧
 */

// ---------------------------------------------------------------------------
// Web App エントリポイント
// ---------------------------------------------------------------------------

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'main';

  if (page === 'setup') {
    return HtmlService.createTemplateFromFile('Setup')
      .evaluate()
      .setTitle('初期セットアップ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('音声ふりかえりアプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML テンプレートで <?!= include('...') ?> を使うためのヘルパー */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// 初期セットアップ (管理者用)
// ---------------------------------------------------------------------------

/** 現在の設定状態を返す */
function getSetupStatus() {
  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('SPEECH_API_KEY') || '';
  var ssId   = props.getProperty('SPREADSHEET_ID') || '';
  var ssUrl  = '';

  if (ssId) {
    try {
      ssUrl = SpreadsheetApp.openById(ssId).getUrl();
    } catch (e) { /* ignore */ }
  }

  return {
    hasApiKey: apiKey.length > 0,
    apiKeyMasked: apiKey ? apiKey.substring(0, 6) + '...' : '',
    spreadsheetId: ssId,
    spreadsheetUrl: ssUrl
  };
}

/** API キーを保存 */
function saveApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('SPEECH_API_KEY', apiKey);
  return { success: true };
}

/** スプレッドシートを手動指定 or 自動作成 */
function saveSpreadsheetId(ssId) {
  if (ssId) {
    // 指定 ID の検証
    SpreadsheetApp.openById(ssId);
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ssId);
  } else {
    // 新規作成
    getOrCreateSpreadsheet();
  }
  return getSetupStatus();
}

// ---------------------------------------------------------------------------
// 音声アップロード & 文字起こし & スプレッドシート書き込み
// ---------------------------------------------------------------------------

/**
 * クライアントから音声データを受け取り、文字起こしし、スプレッドシートに記録する。
 *
 * @param {Object} payload  { audioBase64, mimeType, fileName, studentName }
 * @return {Object} { success, transcript, fileUrl, row }
 */
function processAudio(payload) {
  var audioBase64 = payload.audioBase64;
  var mimeType    = payload.mimeType || 'audio/webm';
  var fileName    = payload.fileName || 'recording.webm';
  var studentName = payload.studentName || '名前なし';

  // --- 1. 音声を Google Drive に保存 ---
  var blob      = Utilities.newBlob(Utilities.base64Decode(audioBase64), mimeType, fileName);
  var driveFile = DriveApp.createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileUrl   = driveFile.getUrl();

  // --- 2. Speech-to-Text で文字起こし ---
  var transcript = transcribeAudio(audioBase64, mimeType);

  // --- 3. スプレッドシートに書き込み ---
  var row = writeToSheet(new Date(), studentName, transcript, fileUrl, fileName);

  return {
    success: true,
    transcript: transcript,
    fileUrl: fileUrl,
    row: row
  };
}

// ---------------------------------------------------------------------------
// 振り返り取得 (児童用)
// ---------------------------------------------------------------------------

/**
 * 指定した児童名の録音記録を全件取得し、日付降順で返す。
 *
 * @param {string} studentName
 * @return {Array<Object>} [{ date, dateLabel, transcript, fileUrl, fileName }]
 */
function getRecordsByStudent(studentName) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('音声記録');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var records = [];

  for (var i = 0; i < data.length; i++) {
    var name = String(data[i][1]).trim();
    if (name !== studentName) continue;

    var ts = data[i][0];
    var d  = ts instanceof Date ? ts : new Date(ts);

    records.push({
      date: d.getTime(),
      dateLabel: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd (E)'),
      timeLabel: Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm'),
      transcript: data[i][2],
      fileUrl: data[i][3],
      fileName: data[i][4]
    });
  }

  // 日付降順（新しい順）
  records.sort(function(a, b) { return b.date - a.date; });
  return records;
}

/**
 * 登録済みの児童名一覧を返す（名前選択用）。
 */
function getStudentNames() {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('音声記録');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var data  = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  var names = {};
  for (var i = 0; i < data.length; i++) {
    var n = String(data[i][0]).trim();
    if (n) names[n] = true;
  }
  return Object.keys(names).sort();
}

// ---------------------------------------------------------------------------
// Speech-to-Text (Google Cloud Speech API v1)
// ---------------------------------------------------------------------------

function transcribeAudio(base64Audio, mimeType) {
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

  // --- 方法 B: OAuth トークン ---
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
 * 列: タイムスタンプ | 児童名 | 文字起こし | 音声ファイルURL | ファイル名
 */
function writeToSheet(timestamp, studentName, transcript, fileUrl, fileName) {
  var ss    = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('音声記録') || ss.insertSheet('音声記録');

  // ヘッダー行がなければ作成
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['タイムスタンプ', '児童名', '文字起こし', '音声ファイルURL', 'ファイル名']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var row = sheet.getLastRow() + 1;
  sheet.appendRow([timestamp, studentName, transcript, fileUrl, fileName]);
  sheet.getRange(row, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');

  return row;
}

function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');

  if (ssId) {
    try {
      return SpreadsheetApp.openById(ssId);
    } catch (e) {
      Logger.log('指定された SPREADSHEET_ID が無効です。新規作成します。');
    }
  }

  var ss = SpreadsheetApp.create('音声ふりかえり記録');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  Logger.log('新規スプレッドシートを作成しました: ' + ss.getUrl());
  return ss;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('SPEECH_API_KEY') || '';
}

function getSpreadsheetUrl() {
  return getOrCreateSpreadsheet().getUrl();
}
