'use strict';
/**
 * Minimal in-memory stand-in for the Apps Script services the API uses, so the backend can be
 * exercised with `node --test`. It mimics the Sheets behaviours that matter here: range bounds,
 * setValues dimension checks, and automatic conversion of numeric-looking strings unless the
 * cell is formatted as plain text ('@').
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CODE_FILE = path.join(__dirname, '..', 'Code.gs');

/** Apps Script returns bytes as Java's signed values (-128..127). */
const signedBytes = (buffer) => Array.from(buffer, (b) => (b > 127 ? b - 256 : b));

function columnNumber(letters) {
  return letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (
      row < 1 || col < 1 || numRows < 1 || numCols < 1 ||
      row + numRows - 1 > sheet.maxRows || col + numCols - 1 > sheet.maxCols
    ) {
      throw new Error(
        `Range (${row},${col}) ${numRows}x${numCols} is outside sheet "${sheet.name}" (${sheet.maxRows}x${sheet.maxCols})`,
      );
    }
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }

  cells(fn) {
    for (let i = 0; i < this.numRows; i++) {
      for (let j = 0; j < this.numCols; j++) fn(this.row + i, this.col + j, i, j);
    }
  }

  getValues() {
    const out = Array.from({ length: this.numRows }, () => new Array(this.numCols));
    this.cells((r, c, i, j) => (out[i][j] = this.sheet.get(r, c)));
    return out;
  }

  setValues(values) {
    if (values.length !== this.numRows || values.some((row) => row.length !== this.numCols)) {
      throw new Error(`setValues: data is ${values.length}x${values[0] && values[0].length}, range is ${this.numRows}x${this.numCols}`);
    }
    this.sheet.setValuesCalls++;
    this.cells((r, c, i, j) => this.sheet.input(r, c, values[i][j]));
    return this;
  }

  clearContent() {
    this.cells((r, c) => this.sheet.cells.delete(`${r},${c}`));
    return this;
  }

  setNumberFormat(format) {
    this.cells((r, c) => this.sheet.formats.set(`${r},${c}`, format));
    return this;
  }

  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name, maxRows, maxCols) {
    this.name = name;
    this.maxRows = maxRows;
    this.maxCols = maxCols;
    this.cells = new Map();
    this.formats = new Map();
    this.setValuesCalls = 0;
  }

  get(r, c) {
    return this.cells.has(`${r},${c}`) ? this.cells.get(`${r},${c}`) : '';
  }

  /** Stores a value the way Sheets parses user input. */
  input(r, c, value) {
    const key = `${r},${c}`;
    let v = value;
    if (this.formats.get(key) === '@') {
      v = v === '' || v === null || v === undefined ? '' : String(v);
    } else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      v = Number(v);
    }
    if (v === '' || v === null || v === undefined) this.cells.delete(key);
    else this.cells.set(key, v);
  }

  /** Test helper: puts a raw value in a cell with no conversion (as if typed long ago). */
  setRaw(r, c, v) {
    this.cells.set(`${r},${c}`, v);
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    let last = 0;
    for (const key of this.cells.keys()) last = Math.max(last, Number(key.split(',')[0]));
    return last;
  }

  getLastColumn() {
    let last = 0;
    for (const key of this.cells.keys()) last = Math.max(last, Number(key.split(',')[1]));
    return last;
  }

  getMaxRows() {
    return this.maxRows;
  }

  getMaxColumns() {
    return this.maxCols;
  }

  insertRowsAfter(after, howMany) {
    if (after !== this.maxRows) throw new Error('FakeSheet only supports inserting rows at the end');
    for (let r = after + 1; r <= after + howMany; r++) {
      for (let c = 1; c <= this.maxCols; c++) {
        const inherited = this.formats.get(`${after},${c}`);
        if (inherited) this.formats.set(`${r},${c}`, inherited);
      }
    }
    this.maxRows += howMany;
  }

  insertColumnsAfter(after, howMany) {
    if (after !== this.maxCols) throw new Error('FakeSheet only supports inserting columns at the end');
    this.maxCols += howMany;
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    if (typeof row === 'string') throw new Error('FakeSheet.getRange only supports numeric coordinates');
    return new FakeRange(this, row, col, numRows, numCols);
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  getRangeList(a1List) {
    const ranges = a1List.map((a1) => {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a1);
      if (!m) throw new Error(`Unsupported A1 notation: ${a1}`);
      const c1 = columnNumber(m[1]);
      const c2 = columnNumber(m[3]);
      return new FakeRange(this, Number(m[2]), c1, Number(m[4]) - Number(m[2]) + 1, c2 - c1 + 1);
    });
    return {
      setNumberFormat(format) {
        ranges.forEach((r) => r.setNumberFormat(format));
        return this;
      },
    };
  }

  setFrozenRows() {}

  /** Test helper: data rows as objects keyed by header. */
  records() {
    const values = this.getDataRange().getValues();
    const headers = values[0];
    return values
      .slice(1)
      .filter((row) => row.some((v) => v !== ''))
      .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  }
}

class FakeSpreadsheet {
  constructor(newSheetRows) {
    this.sheets = new Map();
    this.newSheetRows = newSheetRows;
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this.newSheetRows, 26);
    this.sheets.set(name, sheet);
    return sheet;
  }

  /** Test helper: creates a tab with exactly these headers and rows. */
  addTable(name, headers, rows = []) {
    const sheet = this.insertSheet(name);
    [headers, ...rows].forEach((row, i) => row.forEach((v, j) => sheet.setRaw(i + 1, j + 1, v)));
    return sheet;
  }
}

/**
 * Loads Code.gs into a fresh V8 context with the mocked Apps Script services as globals.
 * Script properties (the password pepper and token secret) and the script cache (login
 * failure counters) live for as long as the returned object, like one deployed project.
 */
function createGas({ newSheetRows = 5 } = {}) {
  const ss = new FakeSpreadsheet(newSheetRows);
  const stats = { locks: 0, releases: 0, flushes: 0 };
  const props = {};
  const cacheEntries = new Map();
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => stats.flushes++,
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return {
          content,
          mimeType: null,
          setMimeType(m) {
            this.mimeType = m;
            return this;
          },
          getContent() {
            return this.content;
          },
        };
      },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      Charset: { UTF_8: 'UTF_8' },
      computeHmacSha256Signature: (text, key) =>
        signedBytes(crypto.createHmac('sha256', String(key)).update(String(text), 'utf8').digest()),
      base64EncodeWebSafe: (text) => Buffer.from(String(text), 'utf8').toString('base64url'),
      base64DecodeWebSafe(text) {
        if (!/^[A-Za-z0-9_-]*=*$/.test(text)) throw new Error('Could not decode string.');
        return signedBytes(Buffer.from(text, 'base64url'));
      },
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('utf8') }),
      formatDate(date, tz, format) {
        if (format !== 'yyyy-MM-dd') throw new Error(`Unsupported format ${format}`);
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      },
    },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => {
          props[k] = String(v);
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get(k) {
          const entry = cacheEntries.get(k);
          return entry && entry.expiresAt > Date.now() ? entry.value : null;
        },
        put: (k, v, ttlSeconds = 600) => cacheEntries.set(k, { value: String(v), expiresAt: Date.now() + ttlSeconds * 1000 }),
        remove: (k) => cacheEntries.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => (stats.locks++, true),
        releaseLock: () => stats.releases++,
      }),
    },
    console: { log() {}, error() {}, warn() {} },
  });

  vm.runInContext(fs.readFileSync(CODE_FILE, 'utf8'), context, { filename: 'Code.gs' });

  const response = (output) => {
    if (output.mimeType !== 'application/json') throw new Error('Response is not JSON');
    return JSON.parse(output.getContent());
  };

  const post = (body) =>
    response(
      context.doPost({
        parameter: {},
        postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' },
      }),
    );

  return {
    ss,
    stats,
    context,
    props,
    /** Test helper: lets every cached login-failure counter expire. */
    expireCache: () => cacheEntries.clear(),
    sheet: (name) => ss.getSheetByName(name),
    /** The app's only request shape: POST { acao, args, token }. */
    call: (acao, args = [], token = '') => post({ acao, args, token }),
    post,
    get: (params) => response(context.doGet({ parameter: params })),
    options: () => response(context.doOptions({})),
  };
}

module.exports = { createGas };
