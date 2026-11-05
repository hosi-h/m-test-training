/**
 * M-Test 検査トレーニング：スプレッドシート連携用 Google Apps Script
 * 集約先のスプレッドシートで「拡張機能 → Apps Script」を開き、このコードを貼り付けて使います。
 */

// アプリの「設定 → 合言葉」と同じ文字列にする（空にすると誰でも書き込めるので必ず設定）
const TOKEN = 'ここに合言葉を設定';

const DATA_SHEET = 'M-Testデータ';
const LOG_SHEET = '入力ログ';

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.token !== TOKEN) return json({ ok: false, error: '合言葉が違います' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(DATA_SHEET) || ss.insertSheet(DATA_SHEET);
    ensureHeader(sh, p.headers);

    const values = p.values.map(safe);
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => r[0]) : [];
    const idx = ids.indexOf(p.id);
    let action;
    if (idx >= 0) {
      sh.getRange(idx + 2, 1, 1, values.length).setValues([values]);
      action = '修正';
    } else {
      sh.appendRow(values);
      action = '新規';
    }

    const log = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
    if (log.getLastRow() === 0) { log.appendRow(['受信日時', '操作', 'レコードID', '氏名', '入力者', 'デバイス名', 'デバイスID']); log.setFrozenRows(1); }
    log.appendRow([new Date(), action, p.id, safe(p.name), safe(p.who), safe(p.device), p.deviceId]);

    return json({ ok: true, action });
  } finally {
    lock.releaseLock();
  }
}

// 接続確認だけを行う。スプレッドシートのデータを読み出す機能はない（書き込み専用）
function doGet(e) {
  if ((e.parameter.token || '') !== TOKEN) return json({ ok: false, error: '合言葉が違います' });
  return json({ ok: true });
}

// 見出し行を作成・更新し、検査結果のセルに色を付ける
function ensureHeader(sh, headers) {
  const cur = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (cur.join('\t') === headers.join('\t')) return;
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e3f4ea');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  const range = sh.getRange(2, 1, sh.getMaxRows() - 1, headers.length);
  sh.setConditionalFormatRules([
    rule(range, '未検査', '#e6e6e6', '#888888'),
    rule(range, '✓', '#fde8eb', '#e0344a'),
    rule(range, '検査済', '#e3f4ea', '#0b6b3c'),
  ]);
}

function rule(range, text, bg, fg) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text)
    .setBackground(bg).setFontColor(fg).setRanges([range]).build();
}

// 数式として解釈されないようにする
function safe(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
