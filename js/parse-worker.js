/* parse-worker.js — parses spreadsheets off the main thread (used when served over http://localhost).
 * Browsers block workers on file:// pages; the app then parses on the main thread instead. */
/* global XLSX, TMDReadWorkbook */
importScripts('../lib/xlsx.full.min.js', 'xlsx-reader.js');
self.onmessage = function (e) {
  try {
    const result = TMDReadWorkbook(XLSX, new Uint8Array(e.data.buffer), e.data.opts || {});
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
