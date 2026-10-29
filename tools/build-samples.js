#!/usr/bin/env node
/* Generates sample-data/Tender Tracker v1.0.xlsx and sample-data/tender-sample.csv
 * from js/sample-data.js using the locally bundled SheetJS build.
 * Usage:  node tools/build-samples.js           (no network access required) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const XLSX = require(path.join(ROOT, 'lib', 'xlsx.full.min.js'));
const SAMPLE = require(path.join(ROOT, 'js', 'sample-data.js'));

const serialOf = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 25569;
function cellOf(v, isIdCol) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && v.d) { const [d, m, y] = v.d.split('/').map(Number); return { t: 'n', v: serialOf(y, m, d), z: 'dd-mm-yyyy' }; }
  if (typeof v === 'object' && v.serial) { const [y, m, d] = v.serial.split('-').map(Number); return { t: 'n', v: serialOf(y, m, d) }; }
  if (typeof v === 'number') return { t: 'n', v }; // identifiers deliberately left numeric to exercise text preservation
  return { t: 's', v: String(v) };
}

const wb = XLSX.utils.book_new();
SAMPLE.sheets.forEach((sh) => {
  const ws = {};
  let r = 0;
  const merges = [];
  if (sh.title) {
    sh.title.forEach((t) => { ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: t }; merges.push({ s: { r, c: 0 }, e: { r, c: Math.min(sh.headers.length - 1, 12) } }); r++; });
    r++; // blank spacer row
  }
  const hdr = r;
  sh.headers.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: h }; });
  r++;
  sh.rows.forEach((row) => { row.forEach((v, c) => { const cell = cellOf(v); if (cell) ws[XLSX.utils.encode_cell({ r, c })] = cell; }); r++; });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, hdr), c: sh.headers.length - 1 } });
  if (merges.length) ws['!merges'] = merges;
  ws['!cols'] = sh.headers.map((h) => ({ wch: Math.max(10, Math.min(40, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, sh.name);
});
const out = path.join(ROOT, 'sample-data', 'Tender Tracker v1.0.xlsx');
fs.writeFileSync(out, Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true })));
console.log('Wrote', out);

// CSV sample: the Capex sheet (duplicate "PR No" header, mixed dates) — UTF-8 with BOM
const capex = SAMPLE.sheets.find((s) => s.name === 'Capex');
const fmt = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.d) return v.d;
  if (typeof v === 'object' && v.serial) { const [y, m, d] = v.serial.split('-').map(Number); return String(serialOf(y, m, d)); }
  return String(v);
};
const q = (s) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const lines = [capex.headers.map(q).join(',')].concat(capex.rows.map((row) => row.map((v) => q(fmt(v))).join(',')));
const csvPath = path.join(ROOT, 'sample-data', 'tender-sample.csv');
fs.writeFileSync(csvPath, '﻿' + lines.join('\r\n'), 'utf8');
console.log('Wrote', csvPath);
