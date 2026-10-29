/* =====================================================================
 * xlsx-reader.js — converts a SheetJS workbook into plain arrays.
 * Shared by the main thread and the optional Web Worker (parse-worker.js).
 *
 * Output per sheet:
 *   aoa   : array of rows; each cell is null | string | number
 *           (date-formatted cells become their displayed text)
 *   hints : { "r:c": "YYYY-MM-DD" } for cells Excel itself stores as dates
 *   merges: merge ranges (used to preserve title rows on export)
 * ===================================================================== */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');

  function readWorkbook(XLSX, data, opts) {
    const wb = XLSX.read(data, {
      type: 'array', cellDates: false, cellNF: true, cellText: true, cellStyles: false,
      dense: false, WTF: false, codepage: (opts && opts.codepage) || undefined,
    });
    const date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    const out = { sheetNames: wb.SheetNames.slice(), sheets: {} };
    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];
      const res = { aoa: [], hints: {}, merges: [], nRows: 0, nCols: 0, hidden: false };
      if (!ws || !ws['!ref']) { out.sheets[name] = res; return; }
      const range = XLSX.utils.decode_range(ws['!ref']);
      const r0 = range.s.r, c0 = range.s.c;
      const nR = range.e.r - r0 + 1, nC = range.e.c - c0 + 1;
      for (let r = 0; r < nR; r++) {
        const row = new Array(nC).fill(null);
        let any = false;
        for (let c = 0; c < nC; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: r + r0, c: c + c0 })];
          if (!cell || cell.t === 'z') continue;
          let v = null;
          if (cell.t === 's' || cell.t === 'str') v = cell.v === undefined ? null : String(cell.v);
          else if (cell.t === 'b') v = cell.v ? 'TRUE' : 'FALSE';
          else if (cell.t === 'e') v = cell.w || '#ERROR';
          else if (cell.t === 'd') {
            const d = cell.v instanceof Date ? cell.v : new Date(cell.v);
            if (!isNaN(d)) { res.hints[r + ':' + c] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; v = cell.w || res.hints[r + ':' + c]; }
          } else if (cell.t === 'n') {
            const fmt = cell.z || '';
            let isDate = false;
            try { isDate = fmt && typeof fmt === 'string' && XLSX.SSF.is_date(fmt); } catch (e) { isDate = false; }
            if (isDate && cell.v > 0 && cell.v < 2958466) {
              const dc = XLSX.SSF.parse_date_code(cell.v, { date1904 });
              if (dc && dc.y > 1900) {
                const iso = `${dc.y}-${pad(dc.m)}-${pad(dc.d)}`;
                res.hints[r + ':' + c] = iso;
                // Built-in format 14 is locale dependent in Excel; show unambiguous dd/mm/yyyy.
                if (fmt === 'm/d/yy' || fmt === 14 || !cell.w) v = `${pad(dc.d)}/${pad(dc.m)}/${dc.y}`;
                else v = cell.w;
              } else v = cell.v;
            } else v = cell.v;
          }
          if (v !== null && v !== '') any = true;
          row[c] = v === '' ? null : v;
        }
        res.aoa.push(any ? row : null); // null marks a fully blank row (kept for row numbering)
      }
      res.merges = (ws['!merges'] || []).map((m) => ({ s: { r: m.s.r - r0, c: m.s.c - c0 }, e: { r: m.e.r - r0, c: m.e.c - c0 } }));
      res.nRows = nR; res.nCols = nC; res.rowOffset = r0; res.colOffset = c0;
      const sh = (wb.Workbook && wb.Workbook.Sheets || []).find((s) => s.name === name);
      res.hidden = !!(sh && sh.Hidden);
      out.sheets[name] = res;
    });
    return out;
  }
  root.TMDReadWorkbook = readWorkbook;
})(typeof self !== 'undefined' ? self : window);
