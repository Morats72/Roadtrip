/* Rig Check - Google Sheet backend. Script version shows in the app's Settings. */
const SCRIPT_VERSION = '1.0';
const SHEET = 'Checklist';
const COLS = ['id', 'kind', 'name', 'cat', 'owner', 'flag', 'room', 'skip',
  'done', 'doneBy', 'doneAt', 'back', 'backBy', 'backAt', 'updated', 'deleted'];
const BOOL = ['flag', 'skip', 'done', 'back', 'deleted'];
const NUM = ['doneAt', 'backAt', 'updated'];

/* Run this once from the editor. It creates the "Checklist" tab. */
function setup() {
  sheet_();
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function norm_(o) {
  const r = {};
  COLS.forEach(function (c) {
    let x = o[c];
    if (BOOL.indexOf(c) >= 0) x = x === true || x === 'TRUE' || x === 'true';
    else if (NUM.indexOf(c) >= 0) x = Number(x) || 0;
    else x = x == null ? '' : String(x).slice(0, 300);
    r[c] = x;
  });
  return r;
}

function readAll_(sh) {
  const v = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const o = {};
    COLS.forEach(function (c, j) { o[c] = v[i][j]; });
    const r = norm_(o);
    if (r.id) out.push(r);
  }
  return out;
}

/* Text that starts like a formula is stored as plain text instead. */
function safe_(x) {
  return /^[=+\-@']/.test(x) ? "'" + x : x;
}

function writeAll_(sh, rows) {
  const data = [COLS].concat(rows.map(function (o) {
    return COLS.map(function (c) {
      if (BOOL.indexOf(c) >= 0) return !!o[c];
      if (NUM.indexOf(c) >= 0) return Number(o[c]) || 0;
      return safe_(String(o[c] == null ? '' : o[c]));
    });
  }));
  sh.clearContents();
  sh.getRange(1, 1, data.length, COLS.length).setValues(data);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return out_({ ok: true, v: SCRIPT_VERSION, rows: readAll_(sheet_()) });
}

/* Each phone sends the rows it changed. The newer edit of a row wins. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const sh = sheet_();
    const rows = readAll_(sh);
    const by = {};
    rows.forEach(function (r) { by[r.id] = r; });
    let changed = false;
    (body.rows || []).forEach(function (raw) {
      if (!raw || !raw.id) return;
      const inc = norm_(raw);
      const cur = by[inc.id];
      if (!cur) {
        rows.push(inc); by[inc.id] = inc; changed = true;
      } else if (inc.updated > cur.updated) {
        COLS.forEach(function (c) { cur[c] = inc[c]; });
        changed = true;
      }
    });
    if (changed) writeAll_(sh, rows);
    return out_({ ok: true, v: SCRIPT_VERSION, rows: rows });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
