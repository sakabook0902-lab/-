// Google Apps Script（SpreadsheetApp 等）の最小限のモック。dist/Code.gs を Node 上で動かして検証するためのもの。
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function strip(v) { return typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v; }

class Range {
  constructor(sheet, row, col, nr = 1, nc = 1) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined ? '' : v); }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, strip(v))));
    return this;
  }
  setValue(v) { this.sheet.set(this.row, this.col, strip(v)); return this; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getSheet() { return this.sheet; }
  getA1Notation() { return String.fromCharCode(64 + this.col) + this.row; }
  sort(specs) {
    const rows = this.getValues();
    rows.sort((a, b) => {
      for (const s of specs) {
        const x = a[s.column - this.col], y = b[s.column - this.col];
        if (x < y) return s.ascending ? -1 : 1;
        if (x > y) return s.ascending ? 1 : -1;
      }
      return 0;
    });
    this.setValues(rows);
    return this;
  }
}
Range.prototype.clearContent = function () {
  for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) this.sheet.set(this.row + r, this.col + c, '');
  return this;
};
['setFontWeight', 'setBackground', 'setNumberFormat', 'setDataValidation', 'setFontSize'].forEach((m) => { Range.prototype[m] = function () { return this; }; });

class Sheet {
  constructor(ss, name) { this.ss = ss; this.name = name; this.data = []; this.hidden = false; }
  getName() { return this.name; }
  getParent() { return this.ss; }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    this.data[r - 1][c - 1] = v;
  }
  getLastRow() {
    for (let i = this.data.length; i > 0; i--) if ((this.data[i - 1] || []).some((v) => v !== '' && v !== undefined)) return i;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.reduce((mm, v, i) => (v !== '' && v !== undefined ? i + 1 : mm), 0)), 0); }
  getMaxRows() { return 1000; }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(row, col, nr, nc) { return new Range(this, row, col, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, i) => this.set(r, i + 1, strip(v))); return this; }
  clear() { this.data = []; return this; }
  protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; }
  getProtections() { return []; }
  hideSheet() { this.hidden = true; return this; }
  // 表示上の操作は何もしない
  setFrozenRows() { return this; }
  setTabColor() { return this; }
  hideColumns() { return this; }
  setColumnWidth() { return this; }
}

class Spreadsheet {
  constructor() { this.sheets = [new Sheet(this, 'シート1')]; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  setActiveSheet(s) { this.active = s; return s; }
  moveActiveSheet() {}
  getSpreadsheetTimeZone() { return 'Asia/Tokyo'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/MOCK'; }
}

function formatDate(d, tz, fmt) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return fmt.replace('yyyy', j.getUTCFullYear()).replace('MM', p(j.getUTCMonth() + 1)).replace('dd', p(j.getUTCDate()))
    .replace('HH', p(j.getUTCHours())).replace('mm', p(j.getUTCMinutes()));
}

function load({ now, email = '' } = {}) {
  const ss = new Spreadsheet();
  const rec = { alerts: [], prompts: [], mails: [], fetches: [], files: [] };
  const cache = new Map();
  const props = new Map();
  let fileSeq = 0;
  const mkFolder = (name) => {
    const f = {
      id: 'folder' + ++fileSeq, name, children: [], files: [],
      getId: () => f.id, getName: () => f.name,
      createFolder: (n) => { const c = mkFolder(n); f.children.push(c); return c; },
      getFoldersByName: (n) => iter(f.children.filter((c) => c.name === n)),
      getFilesByName: (n) => iter(f.files.filter((x) => x.name === n)),
      createFile: (blob) => {
        const id = 'F'.repeat(10) + String(++fileSeq).padStart(20, '0');
        const file = { id, name: blob.name, blob, getUrl: () => `https://drive.google.com/file/d/${id}/view`, setTrashed: () => {}, getAs: () => blob };
        f.files.push(file); rec.files.push(file); return file;
      },
    };
    return f;
  };
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const ui = {
    alert: (m) => { rec.alerts.push(m); return 'YES'; },
    prompt: () => { const a = rec.prompts.shift(); return { getSelectedButton: () => 'OK', getResponseText: () => a || '' }; },
    createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; },
    Button: { OK: 'OK', YES: 'YES' },
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    showModalDialog: (h, title) => rec.alerts.push('[dialog] ' + title),
  };
  const dv = { requireValueInList: () => dv, build: () => ({}) };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, ProtectionType: { SHEET: 'SHEET' }, newDataValidation: () => dv },
    Utilities: { formatDate, newBlob: (content, type, name) => { const b = { content, type, name, getAs: () => b, setName: (n) => { b.name = n; return b; }, getName: () => b.name }; return b; } },
    Session: { getActiveUser: () => ({ getEmail: () => ctx.__email }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    DriveApp: {
      createFolder: (n) => { const f = mkFolder(n); rec.root = f; return f; },
      getFolderById: (id) => { if (rec.root && rec.root.id === id) return rec.root; throw new Error('not found'); },
      getFileById: (id) => rec.files.find((f) => f.id === id),
    },
    MailApp: { sendEmail: (...a) => rec.mails.push(a) },
    UrlFetchApp: { fetch: (...a) => rec.fetches.push(a) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, inTimezone: () => t, create: () => { rec.trigger = true; return t; } }; return t; },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/MOCK/exec' }),
    },
    HtmlService: {
      createHtmlOutput: (h) => { const o = { html: h, setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o, setWidth: () => o, setHeight: () => o }; return o; },
      XFrameOptionsMode: { DEFAULT: 'DEFAULT' },
    },
    Logger: { log: () => {} },
    __email: email,
  };
  vm.createContext(ctx);
  if (now) vm.runInContext(`Date.now = function () { return ${new Date(now).getTime()}; };`, ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8'), ctx);
  return { ctx, ss, rec };
}

module.exports = { load };
