/* =====================================================================
 * data-loader.js — local file import (.xlsx / .xls / .csv), worksheet
 * selection, CSV preview, import report, built-in demonstration data.
 * Files are read with the browser File API only; nothing is uploaded.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const MAX_BYTES = 150 * 1024 * 1024;

  /* ---------------- Demonstration data → reader-shaped raw workbook ---------------- */
  TMD.sampleToRaw = function (sample) {
    const out = { sheetNames: [], sheets: {} };
    const pad = (n) => String(n).padStart(2, '0');
    sample.sheets.forEach((sh) => {
      const aoa = [], hints = {}, merges = [];
      const width = sh.headers.length;
      if (sh.title) {
        sh.title.forEach((t) => { const r = new Array(width).fill(null); r[0] = t; merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: Math.min(width - 1, 12) } }); aoa.push(r); });
        aoa.push(null);
      }
      aoa.push(sh.headers.slice());
      sh.rows.forEach((row) => {
        const r = aoa.length;
        aoa.push(row.map((v, c) => {
          if (v && typeof v === 'object' && v.d) {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.d);
            hints[r + ':' + c] = `${m[3]}-${m[2]}-${m[1]}`;
            return `${m[1]}/${m[2]}/${m[3]}`;
          }
          if (v && typeof v === 'object' && v.serial) {
            const [y, mo, d] = v.serial.split('-').map(Number);
            return Date.UTC(y, mo - 1, d) / 86400000 + 25569;
          }
          return v;
        }));
      });
      out.sheetNames.push(sh.name);
      out.sheets[sh.name] = { aoa, hints, merges, rowOffset: 0, nRows: aoa.length, nCols: width };
      void pad;
    });
    return out;
  };

  /* ---------------- Build workbook state ---------------- */
  /**
   * raw     : reader output {sheetNames, sheets}
   * meta    : {fileName, fileSize, isDemo, sourceType}
   * choice  : {sheets:[names to load], headerRows:{name: idx}, minFilled, skipInsufficient, active:[names]}
   */
  TMD.buildWorkbook = function (raw, meta, choice, M) {
    const mod = M || TMD.modules.tender;
    const wb = { mod: mod.id,
      fileName: meta.fileName, fileSize: meta.fileSize || 0, isDemo: !!meta.isDemo, sourceType: meta.sourceType || 'xlsx',
      importedAt: Date.now(), sheetNames: raw.sheetNames.slice(), sheets: {}, raw: {}, original: {}, loadOrder: [],
    };
    raw.sheetNames.forEach((name) => {
      if (choice.sheets.indexOf(name) >= 0) {
        const sh = TMD.buildSheet(name, raw.sheets[name], {
          headerRow: choice.headerRows && choice.headerRows[name] !== undefined ? choice.headerRows[name] : null,
          minFilled: choice.minFilled || 2, skipInsufficient: choice.skipInsufficient !== false, mapper: mod.mapper,
        });
        wb.sheets[name] = sh;
        wb.loadOrder.push(name);
        wb.original[name] = {};
        sh.rows.forEach((r) => { wb.original[name][r.id] = { values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints) }; });
      } else {
        wb.raw[name] = raw.sheets[name]; // preserved untouched for export
      }
    });
    return wb;
  };

  /** Install a workbook into application state and activate sheets. */
  TMD.installWorkbook = function (wb, active) {
    TMD.state.workbook = wb;
    TMD.state.selection.clear();
    const valid = (active || []).filter((n) => wb.sheets[n]);
    TMD.setActiveSheets(valid.length ? valid : wb.loadOrder.slice(0, 1));
  };

  TMD.setActiveSheets = function (names) {
    const st = TMD.state;
    st.activeSheets = names.filter((n) => st.workbook.sheets[n]);
    st.records = [];
    st.activeSheets.forEach((n) => { st.records = st.records.concat(st.workbook.sheets[n].rows); });
    TMD.buildColumns();
    TMD.recalcAll();
    TMD.emit('data', { module: 'tender' });
  };

  /* ---------------- Grid column definitions for the active view ---------------- */
  const CALC_COLS = [
    { id: '__next', label: 'Next Milestone', type: 'text', w: 200, get: (c) => c.next.label + (c.next.date ? ' – ' + TMD.fmtDate(c.next.date) : '') },
    { id: '__reason', label: 'Stage Reason', type: 'longtext', w: 280, get: (c) => c.stageReason },
    { id: '__fy', label: 'Financial Year', type: 'text', w: 100, get: (c) => c.fy },
    { id: '__daysPr', label: 'Days Since PR Sent', type: 'int', w: 110, get: (c) => c.daysSincePr },
    { id: '__daysSent', label: 'Days Since Sent to Procurement', type: 'int', w: 120, get: (c) => c.daysSinceSent },
    { id: '__daysFloat', label: 'Days Since Tender Float', type: 'int', w: 110, get: (c) => c.daysSinceFloat },
    { id: '__daysOpen', label: 'Days to Bid Opening', type: 'int', w: 110, get: (c) => c.daysToOpening },
    { id: '__floatDur', label: 'Tender Floating Duration', type: 'int', w: 120, get: (c) => c.floatDuration },
    { id: '__techDur', label: 'Technical Evaluation Duration', type: 'int', w: 130, get: (c) => c.techEvalDuration },
    { id: '__prToPo', label: 'PR-to-PO Cycle (days)', type: 'int', w: 120, get: (c) => c.prToPo },
    { id: '__daysAward', label: 'Days Since PO/OLA Award', type: 'int', w: 120, get: (c) => c.daysSinceAward },
    { id: '__daysExpiry', label: 'Days to PO/OLA Expiry', type: 'int', w: 120, get: (c) => c.daysToExpiry },
    { id: '__daysCapex', label: 'Days to CAPEX Finish', type: 'int', w: 120, get: (c) => c.daysToCapexFinish },
    { id: '__estVsAward', label: 'Awarded − Estimated (₹)', type: 'money', w: 140, get: (c) => c.estVsAward },
    { id: '__estVsAwardPct', label: 'Awarded vs Estimated (%)', type: 'pct', w: 120, get: (c) => c.estVsAwardPct },
    { id: '__tax', label: 'Tax Component (₹)', type: 'money', w: 130, get: (c) => c.taxRupees },
    { id: '__completeness', label: 'Record Completeness (%)', type: 'pct', w: 120, get: (c) => c.completeness },
    { id: '__dq', label: 'Data Quality Score', type: 'int', w: 110, get: (c) => c.dqScore },
  ];
  TMD.CALC_COLS = CALC_COLS;

  /** Union of source columns across the active worksheets of a state (shared by all modules). */
  TMD.sourceColumns = function (st) {
    const cols = [];
    const byId = {};
    st.activeSheets.forEach((name) => {
      const sh = st.workbook.sheets[name];
      const occ = {};
      sh.headers.forEach((h, pos) => {
        const base = h.blank ? '#blank-' + TMD.colLetter(pos) : h.norm;
        occ[base] = (occ[base] || 0) + 1;
        const id = 'src:' + base + '#' + occ[base];
        const meta = sh.colMeta[h.key];
        if (!byId[id]) {
          const label = (sh.friendly && sh.friendly[h.key]) || h.display;
          byId[id] = { id, label, sourceLabel: h.display, kind: 'source', keysBySheet: {}, type: meta.type, std: meta.std, isDate: meta.isDate, unit: meta.unit, width: defaultWidth(meta, h), added: !!h.added, userAdded: !!h.userAdded };
          cols.push(byId[id]);
        }
        byId[id].keysBySheet[name] = h.key;
      });
    });
    // Show app-added columns (Officer, Current Status Remark, …) right after the STATUS column.
    const added = cols.filter((c) => c.added && !c.userAdded);
    const anchorStd = ['status', 'remarks', 'jobDescription'].find((f) => cols.some((c) => c.std === f && !c.added));
    if (added.length && anchorStd) {
      const rest = cols.filter((c) => added.indexOf(c) < 0);
      const at = rest.findIndex((c) => c.std === anchorStd) + 1;
      rest.splice(at, 0, ...added);
      return rest;
    }
    return cols;
  };

  TMD.buildColumns = function () {
    const st = TMD.state;
    const cols = [
      { id: '__stage', label: 'Current Stage (calculated)', kind: 'calc', type: 'stage', width: 210 },
      { id: '__delay', label: 'Delay / Track', kind: 'calc', type: 'delay', width: 118 },
      { id: '__mgmt', label: 'Management Status', kind: 'calc', type: 'mgmt', width: 170, get: (c) => c.mgmt ? c.mgmt.name : '' },
    ];
    if (st.activeSheets.length > 1) cols.push({ id: '__sheet', label: 'Worksheet', kind: 'calc', type: 'text', width: 120, get: (c, r) => r.sheet });
    TMD.sourceColumns(st).forEach((c) => cols.push(c));
    CALC_COLS.forEach((c) => cols.push({ id: c.id, label: c.label, kind: 'calc', type: c.type, width: c.w, get: c.get, hiddenByDefault: true }));
    st.columns = cols;
  };
  function defaultWidth(meta, h) {
    if (h.added) return meta.type === 'longtext' ? 280 : meta.type === 'date' ? 140 : 150;
    if (meta.type === 'longtext') return 260;
    if (meta.type === 'date' || meta.type === 'milestone') return 116;
    if (meta.type === 'amount' || meta.type === 'number') return 120;
    if (meta.type === 'id') return 150;
    const l = h.display.length;
    return Math.max(90, Math.min(200, l * 7 + 24));
  }
  /** Source value of a column for a record (consolidated views resolve per sheet). */
  TMD.colValue = function (col, rec) {
    if (col.kind === 'source') { const k = col.keysBySheet[rec.sheet]; return k === undefined ? undefined : rec.values[k]; }
    if (col.get) return col.get(rec.calc, rec);
    if (col.id === '__stage') return TMD.stageInfo(rec.calc.stage).label;
    if (col.id === '__delay') return rec.calc.delayLabel;
    return undefined;
  };

  /* ---------------- File import ---------------- */
  function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  function validateSignature(ext, bytes) {
    const b = bytes;
    const isZip = b[0] === 0x50 && b[1] === 0x4b;
    const isOle = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    if (ext === 'xlsx') return isZip ? null : 'The file does not look like a valid .xlsx workbook (missing ZIP signature).';
    if (ext === 'xls') {
      if (isOle || isZip) return null;
      const head = String.fromCharCode.apply(null, Array.from(b.slice(0, 64))).toLowerCase();
      if (/<(\?xml|html|table)/.test(head)) return null; // XML/HTML spreadsheets saved as .xls
      return 'The file does not look like a valid .xls workbook.';
    }
    if (ext === 'csv') {
      const sample = b.slice(0, Math.min(b.length, 4096));
      let nul = 0; sample.forEach((x) => { if (x === 0) nul++; });
      if (nul > 2) return 'The .csv file appears to be binary, not text.';
      return null;
    }
    return 'Unsupported file type.';
  }

  function parseInWorker(buffer) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker('js/parse-worker.js'); } catch (e) { reject(e); return; }
      const t = setTimeout(() => { w.terminate(); reject(new Error('Worker timeout')); }, 180000);
      w.onmessage = (e) => { clearTimeout(t); w.terminate(); if (e.data.ok) resolve(e.data.result); else reject(new Error(e.data.error)); };
      w.onerror = (e) => { clearTimeout(t); w.terminate(); reject(new Error(e.message || 'Worker error')); };
      w.postMessage({ buffer }, [buffer]);
    });
  }

  async function parseWorkbookBytes(buffer) {
    // Web Workers are unavailable for file:// pages in most browsers → main-thread fallback.
    if (location.protocol !== 'file:' && window.Worker) {
      try { return await parseInWorker(buffer.slice(0)); } catch (e) { console.warn('Worker parse failed, using main thread', e); }
    }
    await TMD.nextFrame();
    return window.TMDReadWorkbook(window.XLSX, new Uint8Array(buffer));
  }

  TMD.importFile = async function (file, M) {
    const mod = M || TMD.modules.tender;
    if (!file) return;
    const ext = extOf(file.name);
    if (['xlsx', 'xls', 'csv'].indexOf(ext) < 0) { TMD.toast('Unsupported file type. Please choose a .xlsx, .xls or .csv file.', 'error'); return; }
    if (file.size > MAX_BYTES) { TMD.toast('File is larger than 150 MB and cannot be processed in the browser.', 'error'); return; }
    if (file.size === 0) { TMD.toast('The selected file is empty.', 'error'); return; }
    if (mod.state.mode === 'edit' && mod.state.dirty) {
      const ok = await TMD.confirm('Unsaved changes', `You have unsaved ${mod.label} edits. Importing a new file will replace that module's working data. Continue?`, 'Import anyway', 'danger');
      if (!ok) return;
    }
    try {
      TMD.progress(`Reading ${file.name} locally…`);
      const buffer = await file.arrayBuffer();
      const sigErr = validateSignature(ext, new Uint8Array(buffer.slice(0, 4096)));
      if (sigErr) { TMD.progress(false); TMD.toast(sigErr, 'error', 6000); return; }
      if (ext === 'csv') { TMD.progress(false); await csvFlow(file, buffer, mod); return; }
      TMD.progress(`Parsing workbook ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`);
      const raw = await parseWorkbookBytes(buffer);
      TMD.progress(false);
      if (!raw.sheetNames.length) { TMD.toast('No worksheets were found in the workbook.', 'error'); return; }
      await sheetSelectionFlow(raw, { fileName: file.name, fileSize: file.size, sourceType: ext }, null, mod);
    } catch (e) {
      console.error(e);
      TMD.progress(false);
      TMD.toast('Could not read the file: ' + (e && e.message ? e.message : e), 'error', 7000);
    }
  };

  /* ---------------- Worksheet selection dialog ---------------- */
  async function sheetSelectionFlow(raw, meta, preselect, mod) {
    const st = { headerRows: {}, minFilled: 2, skipInsufficient: true, summaries: {}, focus: null };
    const summarise = (name) => {
      const sh = TMD.buildSheet(name, raw.sheets[name], { headerRow: st.headerRows[name], minFilled: st.minFilled, skipInsufficient: st.skipInsufficient, mapper: mod.mapper });
      st.headerRows[name] = sh.headerRow;
      st.summaries[name] = sh;
      return sh;
    };
    raw.sheetNames.forEach(summarise);
    const isTender = (n) => mod.isRelevantSheet(st.summaries[n]);
    let pre = preselect || [];
    if (!pre.length) {
      pre = mod.preselect(raw, st.summaries);
      if (!pre.length) pre = raw.sheetNames.filter(isTender).slice(0, 1);
      if (!pre.length) pre = [raw.sheetNames[0]];
    }
    const checked = new Set(pre);
    st.focus = pre[0];

    const body = TMD.el('div', { class: 'sheet-dlg' });
    const render = () => {
      const rows = raw.sheetNames.map((n) => {
        const s = st.summaries[n];
        const hidden = raw.sheets[n].hidden ? ' <span class="tag">hidden</span>' : '';
        return `<tr class="${st.focus === n ? 'focus' : ''}" data-sheet="${esc(n)}">
          <td><input type="checkbox" class="sh-chk" ${checked.has(n) ? 'checked' : ''} aria-label="Load ${esc(n)}"></td>
          <td class="sh-name"><button class="linklike sh-focus">${esc(n)}</button>${hidden}</td>
          <td><span class="tag ${isTender(n) ? 'tag-blue' : ''}">${esc(s.sheetType)}</span></td>
          <td><input type="number" class="inp inp-xs sh-hdr" min="1" max="${(raw.sheets[n].aoa || []).length || 1}" value="${s.headerRow + (s.rowOffset || 0) + 1}" aria-label="Header row for ${esc(n)}"></td>
          <td class="num">${TMD.fmtInt(s.rows.length)}</td>
          <td class="num">${s.headers.length}</td>
          <td>${s.report.duplicateHeaders.length ? '<span class="tag tag-amber">dup headers</span>' : ''}${s.report.blankHeaders.length ? ' <span class="tag">blank headers</span>' : ''}</td>
        </tr>`;
      }).join('');
      const fs = st.summaries[st.focus];
      let preview = '<p class="muted">Select a worksheet name to preview.</p>';
      if (fs) {
        const hdr = fs.headers.slice(0, 40);
        preview = `<div class="preview-title">Preview: <strong>${esc(fs.name)}</strong> — header row ${fs.headerRow + (fs.rowOffset || 0) + 1}, ${fs.rows.length} records, ${fs.headers.length} columns</div>
          <div class="preview-scroll"><table class="mini-table"><thead><tr>${hdr.map((h) => `<th title="${esc(h.key)}">${esc(h.display)}${h.dup ? ' <span class="tag tag-amber">' + esc(h.key) + '</span>' : ''}</th>`).join('')}</tr></thead>
          <tbody>${fs.rows.slice(0, 6).map((r) => `<tr>${hdr.map((h) => `<td>${esc(TMD.cellText(r.values[h.key]).slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      body.innerHTML = `
        <p class="muted">${esc(meta.fileName)} · ${(meta.fileSize / 1024).toFixed(1)} KB · ${raw.sheetNames.length} worksheet(s) detected. Choose the worksheet(s) to load. Each worksheet keeps its own columns; selecting several compatible sheets shows a consolidated view.</p>
        <div class="table-wrap"><table class="data-table sheet-table">
          <thead><tr><th></th><th>Worksheet</th><th>Recognised as</th><th>Header row</th><th class="num">Records</th><th class="num">Columns</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div class="sheet-opts">
          <label class="chk"><input type="checkbox" id="optSkip" ${st.skipInsufficient ? 'checked' : ''}> Skip rows with fewer than</label>
          <input type="number" class="inp inp-xs" id="optMin" min="1" max="10" value="${st.minFilled}"> <span>filled cells (e.g. rows containing only a serial number). Skipped rows are listed in the import report.</span>
        </div>
        <div class="compat" id="compatNote"></div>
        ${preview}`;
      updateCompat();
    };
    const updateCompat = () => {
      const note = body.querySelector('#compatNote');
      const names = Array.from(checked);
      if (names.length < 2) { note.innerHTML = ''; return; }
      const core = mod.compatFields;
      const sets = names.map((n) => new Set(core.filter((f) => st.summaries[n].mapping[f])));
      const common = core.filter((f) => sets.every((s) => s.has(f)));
      const ok = common.length >= Math.min(7, Math.ceil(core.length / 2));
      note.innerHTML = ok
        ? `<div class="notice ok">${TMD.icon('check')} The selected sheets share ${common.length} standard monitoring fields and can be consolidated. Source columns remain separate; unmatched columns appear blank for other sheets.</div>`
        : `<div class="notice warn">${TMD.icon('alert')} The selected sheets share only ${common.length} standard fields. They will be loaded, but the dashboard will analyse them one at a time — choose which in the worksheet switcher.</div>`;
      st.compatible = ok;
    };
    body.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-sheet]');
      if (e.target.classList.contains('sh-chk')) { const n = tr.dataset.sheet; if (e.target.checked) checked.add(n); else checked.delete(n); updateCompat(); }
      if (e.target.classList.contains('sh-hdr')) {
        const n = tr.dataset.sheet;
        const v = Math.max(1, parseInt(e.target.value, 10) || 1) - 1 - (raw.sheets[n].rowOffset || 0);
        st.headerRows[n] = Math.max(0, v);
        summarise(n); st.focus = n; render();
      }
      if (e.target.id === 'optSkip' || e.target.id === 'optMin') {
        st.skipInsufficient = body.querySelector('#optSkip').checked;
        st.minFilled = Math.max(1, parseInt(body.querySelector('#optMin').value, 10) || 1);
        raw.sheetNames.forEach(summarise); render();
      }
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('.sh-focus');
      if (b) { st.focus = b.closest('tr').dataset.sheet; render(); }
    });
    render();
    const res = await TMD.modal({
      title: `${mod.label}: select worksheet(s) to load`, body, xwide: true,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Load selected worksheets', value: 'load', kind: 'primary' }],
      beforeClose: (v) => { if (v === 'load' && !checked.size) { TMD.toast('Select at least one worksheet.', 'warn'); return false; } return true; },
    });
    if (res !== 'load') return;
    const names = raw.sheetNames.filter((n) => checked.has(n));
    TMD.progress('Building monitoring model…');
    await TMD.nextFrame();
    const wb = TMD.buildWorkbook(raw, meta, { sheets: names, headerRows: st.headerRows, minFilled: st.minFilled, skipInsufficient: st.skipInsufficient }, mod);
    const active = st.compatible === false ? [names[0]] : names;
    finishImport(wb, active, mod);
  }

  function finishImport(wb, active, mod) {
    if (mod.state.mode === 'edit' && mod.edit) mod.edit.forceExit();
    mod.install(wb, active);
    mod.audit.log({ action: 'IMPORT', sheet: wb.loadOrder.join(', '), field: '', oldValue: '', newValue: `${wb.fileName} (${mod.state.records.length} records)` });
    TMD.progress(false);
    TMD.toast(`${mod.label}: loaded ${TMD.plural(mod.state.records.length, 'record')} from ${wb.fileName}. View Mode is active.`, 'success');
    if (TMD.settings.get('persistence')) TMD.saveWorkingCopy(mod.slots.working, mod);
    TMD.showImportReport(wb);
  }

  /* ---------------- CSV flow ---------------- */
  function decodeText(buffer) {
    const bytes = new Uint8Array(buffer);
    let enc = 'UTF-8';
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { text = new TextDecoder('windows-1252').decode(bytes); enc = 'Windows-1252 (UTF-8 decoding failed)'; }
    if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); enc += ' with BOM'; }
    return { text, enc };
  }

  async function csvFlow(file, buffer, mod) {
    const { text, enc } = decodeText(buffer);
    const st = { delimiter: '', headerRow: null };
    let parsed = null;
    const parse = () => {
      parsed = window.Papa.parse(text, { delimiter: st.delimiter, skipEmptyLines: false, dynamicTyping: false });
      const rows = parsed.data.map((r) => (r.every((v) => v === '' || v === undefined) ? null : r.map((v) => (v === '' ? null : v))));
      while (rows.length && rows[rows.length - 1] === null) rows.pop();
      st.rows = rows;
      if (st.headerRow === null) st.headerRow = TMD.detectHeaderRow(rows);
    };
    parse();
    const delimName = (d) => ({ ',': 'Comma (,)', ';': 'Semicolon (;)', '\t': 'Tab', '|': 'Pipe (|)' }[d] || JSON.stringify(d));
    const body = TMD.el('div', { class: 'csv-dlg' });
    const render = () => {
      const width = Math.max(...st.rows.slice(0, 50).map((r) => (r ? r.length : 0)), 1);
      const prev = st.rows.slice(0, 14);
      body.innerHTML = `
        <div class="form-row">
          <div class="kv"><span>File</span><strong>${esc(file.name)}</strong></div>
          <div class="kv"><span>Size</span><strong>${(file.size / 1024).toFixed(1)} KB</strong></div>
          <div class="kv"><span>Encoding</span><strong>${esc(enc)}</strong></div>
          <div class="kv"><span>Detected delimiter</span><strong>${esc(delimName(parsed.meta.delimiter))}</strong></div>
          <div class="kv"><span>Rows</span><strong>${TMD.fmtInt(st.rows.filter(Boolean).length)}</strong></div>
        </div>
        <div class="form-row">
          <label class="field"><span>Delimiter</span><select class="inp" id="csvDelim">
            <option value="">Auto-detect</option><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select></label>
          <label class="field"><span>Header row</span><input type="number" class="inp inp-xs" id="csvHdr" min="1" max="${st.rows.length}" value="${st.headerRow + 1}"></label>
        </div>
        ${parsed.errors.length ? `<div class="notice warn">${TMD.icon('alert')} ${parsed.errors.length} parsing issue(s), e.g. ${esc(parsed.errors[0].message)} (row ${parsed.errors[0].row + 1}).</div>` : ''}
        <div class="preview-scroll"><table class="mini-table"><tbody>${prev.map((r, i) => `<tr class="${i === st.headerRow ? 'hdr-row' : ''}"><th class="rn">${i + 1}</th>${Array.from({ length: Math.min(width, 40) }, (_, c) => `<td>${esc(r && r[c] !== null && r[c] !== undefined ? String(r[c]).slice(0, 50) : '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="muted">The highlighted row is used as the header. All values are kept as text exactly as written in the file; identifiers are never converted to numbers.</p>`;
      body.querySelector('#csvDelim').value = st.delimiter;
    };
    body.addEventListener('change', (e) => {
      if (e.target.id === 'csvDelim') { st.delimiter = e.target.value; st.headerRow = null; parse(); render(); }
      if (e.target.id === 'csvHdr') { st.headerRow = Math.max(0, Math.min(st.rows.length - 1, (parseInt(e.target.value, 10) || 1) - 1)); render(); }
    });
    render();
    const res = await TMD.modal({ title: `${mod.label}: CSV import preview`, body, xwide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Load data', value: 'load', kind: 'primary' }] });
    if (res !== 'load') return;
    const name = file.name.replace(/\.csv$/i, '').slice(0, 31) || 'CSV';
    const raw = { sheetNames: [name], sheets: { [name]: { aoa: st.rows, hints: {}, merges: [], rowOffset: 0 } } };
    TMD.progress('Building monitoring model…');
    await TMD.nextFrame();
    const wb = TMD.buildWorkbook(raw, { fileName: file.name, fileSize: file.size, sourceType: 'csv' }, { sheets: [name], headerRows: { [name]: st.headerRow }, minFilled: 2, skipInsufficient: true }, mod);
    wb.csvMeta = { encoding: enc, delimiter: delimName(parsed.meta.delimiter) };
    finishImport(wb, [name], mod);
  }

  /** Re-open the worksheet chooser for the current workbook (load additional sheets). */
  TMD.manageSheets = async function (M) {
    const mod = M || TMD.modules.tender;
    const wb = mod.state.workbook;
    if (!wb) return;
    const loaded = wb.loadOrder;
    const body = TMD.el('div');
    body.innerHTML = `<p class="muted">Choose which loaded worksheet(s) feed the dashboard. Worksheets not loaded at import are preserved untouched for export${Object.keys(wb.raw).length ? ' and can be loaded below' : ''}.</p>
      <table class="data-table"><thead><tr><th>Active</th><th>Worksheet</th><th>Recognised as</th><th class="num">Records</th></tr></thead><tbody>
      ${loaded.map((n) => `<tr><td><input type="checkbox" class="act-chk" value="${esc(n)}" ${mod.state.activeSheets.indexOf(n) >= 0 ? 'checked' : ''}></td><td>${esc(n)}</td><td>${esc(wb.sheets[n].sheetType)}</td><td class="num">${wb.sheets[n].rows.length}</td></tr>`).join('')}
      ${Object.keys(wb.raw).map((n) => `<tr class="muted"><td><input type="checkbox" class="load-chk" value="${esc(n)}"></td><td>${esc(n)} <span class="tag">not loaded</span></td><td>—</td><td class="num">—</td></tr>`).join('')}
      </tbody></table>`;
    const res = await TMD.modal({ title: 'Worksheets', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'ok', kind: 'primary' }] });
    if (res !== 'ok') return;
    const act = TMD.$$('.act-chk', body).filter((c) => c.checked).map((c) => c.value);
    const toLoad = TMD.$$('.load-chk', body).filter((c) => c.checked).map((c) => c.value);
    toLoad.forEach((n) => {
      const sh = TMD.buildSheet(n, wb.raw[n], { mapper: mod.mapper });
      wb.sheets[n] = sh; wb.loadOrder.push(n); delete wb.raw[n];
      wb.original[n] = {};
      sh.rows.forEach((r) => { wb.original[n][r.id] = { values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints) }; });
      act.push(n);
    });
    if (!act.length) { TMD.toast('At least one worksheet must be active.', 'warn'); return; }
    mod.setActiveSheets(act);
    TMD.toast(`Active worksheet(s): ${act.join(', ')}`, 'info');
  };

  /** Display text for a cell value. */
  TMD.cellText = function (v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return TMD.numToPlainString(Math.round(v * 1e6) / 1e6);
    return String(v);
  };

  /* ---------------- Demonstration data ---------------- */
  TMD.loadDemo = function () {
    const raw = TMD.sampleToRaw(TMD.SAMPLE);
    const wb = TMD.buildWorkbook(raw, { fileName: TMD.SAMPLE.fileName, fileSize: 0, isDemo: true, sourceType: 'demo' }, { sheets: ['Capex', 'REVEX 2026', 'Capex Modified', 'Sheet3'], minFilled: 2, skipInsufficient: true });
    wb.importedAt = Date.now();
    TMD.installWorkbook(wb, TMD.SAMPLE.defaultActive);
  };

  /* ---------------- Import report ---------------- */
  TMD.showImportReport = function (wb) {
    wb = wb || (TMD.activeModule ? TMD.activeModule().state.workbook : TMD.state.workbook);
    if (!wb) return;
    const list = (arr, fmt, max) => (arr.length ? `<ul class="compact-list">${arr.slice(0, max || 12).map(fmt).join('')}${arr.length > (max || 12) ? `<li class="muted">… and ${arr.length - (max || 12)} more</li>` : ''}</ul>` : '<span class="muted">None</span>');
    const sheets = wb.loadOrder.map((n) => {
      const r = wb.sheets[n].report;
      return `<section class="report-sheet">
        <h3>${esc(n)} <span class="tag tag-blue">${esc(wb.sheets[n].sheetType)}</span></h3>
        <div class="kv-grid">
          <div class="kv"><span>Header row</span><strong>${r.headerRow}</strong></div>
          <div class="kv"><span>Records loaded</span><strong>${TMD.fmtInt(r.rows)}</strong></div>
          <div class="kv"><span>Columns</span><strong>${r.columns}</strong></div>
          <div class="kv"><span>Blank rows ignored</span><strong>${r.blankRows}</strong></div>
          <div class="kv"><span>Rows with insufficient values</span><strong>${r.insufficientRows.length}${r.skippedRows ? ` (${r.skippedRows} not loaded)` : ''}</strong></div>
        </div>
        <div class="report-grid">
          <div><h4>Detected date columns (${r.dateColumns.length})</h4>${list(r.dateColumns, (x) => `<li>${esc(x)}</li>`, 40)}</div>
          <div><h4>Detected numeric columns (${r.numericColumns.length})</h4>${list(r.numericColumns, (x) => `<li>${esc(x)}</li>`, 40)}</div>
          <div><h4>Blank header columns</h4>${list(r.blankHeaders, (x) => `<li>Column ${esc(x)}</li>`)}</div>
          <div><h4>Duplicate headers</h4>${list(r.duplicateHeaders, (d) => `<li>"${esc(d.label)}" → internal keys ${esc(d.keys.join(', '))}</li>`)}</div>
          <div><h4>Invalid dates (${r.invalidDates.length})</h4>${list(r.invalidDates, (d) => `<li>Row ${d.row}, ${esc(d.col)}: "${esc(d.value)}"</li>`)}</div>
          <div><h4>Potential Excel serial dates (${r.serialDates.length})</h4>${list(r.serialDates, (d) => `<li>Row ${d.row}, ${esc(d.col)}: ${esc(d.value)} → ${esc(d.asDate)}</li>`)}</div>
          <div><h4>Rows with insufficient values</h4>${list(r.insufficientRows, (x) => `<li>Row ${x}</li>`)}</div>
          <div><h4>Import warnings</h4>${list(r.warnings, (w) => `<li>${esc(w)}</li>`, 20)}</div>
        </div></section>`;
    }).join('');
    const notLoaded = Object.keys(wb.raw);
    TMD.modal({
      title: `Data import report — ${(TMD.modules[wb.mod || 'tender'] || {}).label || ''}`, xwide: true,
      body: `<div class="kv-grid">
          <div class="kv"><span>File name</span><strong>${esc(wb.fileName)}</strong></div>
          <div class="kv"><span>File size</span><strong>${wb.fileSize ? (wb.fileSize / 1024).toFixed(1) + ' KB' : '—'}</strong></div>
          <div class="kv"><span>Imported</span><strong>${TMD.fmtDateTime(wb.importedAt)}</strong></div>
          <div class="kv"><span>Worksheets in file</span><strong>${wb.sheetNames.length}</strong></div>
          <div class="kv"><span>Loaded</span><strong>${esc(wb.loadOrder.join(', '))}</strong></div>
          ${wb.csvMeta ? `<div class="kv"><span>CSV encoding / delimiter</span><strong>${esc(wb.csvMeta.encoding)} / ${esc(wb.csvMeta.delimiter)}</strong></div>` : ''}
        </div>
        ${notLoaded.length ? `<p class="muted">Preserved but not loaded: ${esc(notLoaded.join(', '))}. They are written back unchanged when exporting the full workbook.</p>` : ''}
        <div class="notice ok">${TMD.icon('lock')} Source values were not modified. Calculated fields are stored separately. The original file on disk is never overwritten.</div>
        ${sheets}`,
      buttons: [{ label: 'Close', value: null, kind: 'primary' }],
    });
  };
})();
