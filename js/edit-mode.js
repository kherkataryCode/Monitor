/* =====================================================================
 * edit-mode.js — protected View Mode by default; explicit Edit Mode with
 * undo/redo, batch edits (fill / paste / clear), insert / duplicate /
 * delete rows, add columns, overrides, local save, cancel (discard /
 * continue / save & exit) and automatic local recovery.
 * One independent controller per module (Tender, Cyber Audit).
 * The original source file is never overwritten.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;

  /**
   * M   : module (state, audit, slots, recalcAll, recalcRecord, setActiveSheets, filters, grid, label)
   * cfg : { enterText, details:{open,current,close}, exportDialog, csvDialog, augment(list) → extra items,
   *         overrideLabel(stage) }
   */
  TMD.createEditController = function (M, cfg) {
    let undoStack = [], redoStack = [];
    let snapshot = null;
    const S = () => M.state;

    function takeSnapshot() {
      const wb = S().workbook;
      const snap = { rows: {}, headers: {} };
      wb.loadOrder.forEach((n) => {
        snap.headers[n] = wb.sheets[n].headers.slice();
        snap.rows[n] = wb.sheets[n].rows.map((r) => Object.assign({}, r, {
          values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints), editedKeys: r.editedKeys.slice(),
          override: r.override ? Object.assign({}, r.override) : null, followUps: (r.followUps || []).slice(),
        }));
      });
      return snap;
    }
    function restoreSnapshot(snap) {
      const wb = S().workbook;
      Object.keys(snap.rows).forEach((n) => {
        if (!wb.sheets[n]) return;
        wb.sheets[n].headers = snap.headers[n];
        wb.sheets[n].rows = snap.rows[n].map((r) => Object.assign({}, r, { values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints), editedKeys: r.editedKeys.slice() }));
      });
      M.setActiveSheets(S().activeSheets.slice());
    }

    /** Recompute edited flags by comparing with the originally imported values. */
    function markEdited(rec) {
      const wb = S().workbook;
      const orig = wb.original[rec.sheet] && wb.original[rec.sheet][rec.id];
      if (!orig) { rec.isNew = true; rec.editedKeys = Object.keys(rec.values).filter((k) => !TMD.isBlank(rec.values[k])); rec.edited = true; return; }
      rec.editedKeys = Object.keys(rec.values).filter((k) => {
        const a = rec.values[k], b = orig.values[k];
        if (TMD.isBlank(a) && TMD.isBlank(b)) return false;
        return String(a) !== String(b);
      });
      rec.edited = rec.editedKeys.length > 0 || !!(rec.override && rec.override.stage);
    }

    function afterChange(recs, opts) {
      S().dirty = true;
      const list = recs ? (Array.isArray(recs) ? recs : [recs]) : null;
      if (list && list.length === 1) { markEdited(list[0]); M.recalcRecord(list[0]); }
      else { if (list) list.forEach(markEdited); M.recalcAll(); }
      TMD.emit('mode', { module: M.id });
      M.filters.apply();
      TMD.emit('changed', { module: M.id, rec: list && list[0] });
      autosave();
      if (opts && opts.validate && list && list.length === 1) validateToast(list[0], opts.key);
    }

    function validateToast(rec, key) {
      const sheet = TMD.sheetOf(rec);
      const meta = sheet.colMeta[key];
      if (!meta) return;
      const v = rec.values[key];
      if ((meta.isDate || meta.type === 'date') && !TMD.isBlank(v)) {
        const p = TMD.parseDate(v, rec.dateHints[key], true);
        if (p.kind === 'invalid') TMD.toast(`"${v}" is not a valid date. The value was saved as typed and flagged in Data Quality.`, 'warn', 5000);
        else if (p.kind === 'text' && meta.type === 'date') TMD.toast('Text entered in a date column; it is kept as typed.', 'info');
      }
      if (meta.type === 'amount' && !TMD.isBlank(v) && typeof v !== 'number' && TMD.parseAmount(v, 'rupees').kind === 'text') TMD.toast('Amount contains text; it is kept as typed and flagged in Data Quality.', 'warn');
      const high = (rec.calc.dq || []).filter((q) => q.sev === 'high' && /seq-|invalid/.test(q.code));
      if (high.length) TMD.toast('Validation: ' + high[0].msg, 'warn', 5000);
    }

    const autosave = TMD.debounce(() => {
      if (S().mode !== 'edit' || !TMD.settings.get('persistence')) return;
      TMD.saveWorkingCopy(M.slots.recovery, M).then(() => TMD.idb.set(M.slots.meta, { at: Date.now(), dirty: S().dirty }));
    }, 1200);

    function push(op) { undoStack.push(op); if (undoStack.length > 500) undoStack.shift(); redoStack = []; }

    /* ---------------- Operations ---------------- */
    function applyOp(op, dir) {
      const wb = S().workbook;
      if (op.type === 'set') {
        const rec = op.rec;
        rec.values[op.key] = dir === 'undo' ? op.old : op.nv;
        if (dir === 'undo' && op.oldHint) rec.dateHints[op.key] = op.oldHint; else if (dir !== 'undo') delete rec.dateHints[op.key];
        return [rec];
      }
      if (op.type === 'batch') {
        const ops = dir === 'undo' ? op.ops.slice().reverse() : op.ops;
        const recs = [];
        ops.forEach((o) => { applyOp(o, dir); if (recs.indexOf(o.rec) < 0) recs.push(o.rec); });
        return recs;
      }
      if (op.type === 'override') { op.rec.override = dir === 'undo' ? op.old : op.nv; return [op.rec]; }
      if (op.type === 'add') {
        const rows = wb.sheets[op.rec.sheet].rows;
        if (dir === 'undo') { const i = rows.indexOf(op.rec); if (i >= 0) rows.splice(i, 1); }
        else rows.splice(Math.min(op.index, rows.length), 0, op.rec);
        rebuildRecords();
        return null;
      }
      if (op.type === 'del') {
        if (dir === 'undo') op.items.slice().sort((a, b) => a.index - b.index).forEach((it) => wb.sheets[it.rec.sheet].rows.splice(it.index, 0, it.rec));
        else op.items.forEach((it) => { const rows = wb.sheets[it.rec.sheet].rows; const i = rows.indexOf(it.rec); if (i >= 0) rows.splice(i, 1); });
        rebuildRecords();
        return null;
      }
      if (op.type === 'addcol') {
        const sh = wb.sheets[op.sheet];
        if (dir === 'undo') { sh.headers = sh.headers.filter((h) => h !== op.header); }
        else if (sh.headers.indexOf(op.header) < 0) sh.headers.push(op.header);
        M.setActiveSheets(S().activeSheets.slice());
        return null;
      }
      return null;
    }
    function rebuildRecords() {
      const st = S();
      st.records = [];
      st.activeSheets.forEach((n) => { st.records = st.records.concat(st.workbook.sheets[n].rows); });
    }
    function ident(rec) { return rec.calc ? rec.calc.ident : ''; }
    function logOp(op, action) {
      if (op.type === 'set') M.audit.log({ action, sheet: op.rec.sheet, recordId: op.rec.id, recordLabel: ident(op.rec), rowNum: op.rec.rowNum, field: op.label || op.key, oldValue: TMD.cellText(action === 'UNDO' ? op.nv : op.old), newValue: TMD.cellText(action === 'UNDO' ? op.old : op.nv) });
      else if (op.type === 'batch') {
        if (op.ops.length <= 25) op.ops.forEach((o) => logOp(o, action));
        else M.audit.log({ action, field: `${op.label || 'Batch edit'} (${op.ops.length} cells)`, sheet: op.ops[0].rec.sheet });
      } else M.audit.log({ action, field: op.type === 'add' ? 'Row added' : op.type === 'del' ? `${op.items.length} row(s) deleted` : op.type === 'addcol' ? `Column added: ${op.header.label}` : 'Status override', sheet: op.rec ? op.rec.sheet : op.sheet || (op.items && op.items[0] ? op.items[0].rec.sheet : ''), recordId: op.rec ? op.rec.id : '' });
    }

    /** Build a 'set' op (or null when nothing changes). */
    function makeSet(rec, key, nv, label) {
      const old = rec.values[key];
      if (old === nv || (TMD.isBlank(old) && TMD.isBlank(nv))) return null;
      const sheet = TMD.sheetOf(rec);
      const meta = sheet.colMeta[key] || {};
      if (meta.isId && typeof nv === 'number') nv = TMD.numToPlainString(nv); // identifiers always stay text
      if (typeof nv === 'string' && nv === '') nv = null;
      return { type: 'set', rec, key, old, nv, oldHint: rec.dateHints[key], label: label || key };
    }
    function guard() {
      if (S().mode !== 'edit') { TMD.toast('View Mode: data is protected. Use “Unlock editing” (bottom left) to make changes.', 'warn'); return false; }
      return true;
    }

    const api = {
      module: M,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      isEditing: () => S().mode === 'edit',
      autosave,

      async enter() {
        if (S().mode === 'edit') return true;
        if (!S().workbook) return false;
        const ok = await TMD.modal({
          title: 'Unlock editing',
          body: `<p><strong>${esc(cfg.enterText || 'You are entering Edit Mode. Changes will remain local until exported or downloaded.')}</strong></p>
            <ul class="compact-list"><li>The original file on your computer is never overwritten.</li><li>Edit directly in the cells: type, double-click or press Enter. Drag the fill handle to copy or continue a series, like Excel.</li><li>Use <em>Save</em> to keep a local working copy or export an updated file. Every change is written to the local change log.</li></ul>`,
          buttons: [{ label: 'Stay in View Mode', value: false }, { label: 'Unlock editing', value: true, kind: 'primary' }], dismissValue: false,
        });
        if (!ok) return false;
        snapshot = takeSnapshot();
        undoStack = []; redoStack = [];
        S().mode = 'edit';
        S().dirty = false;
        M.audit.log({ action: 'ENTER_EDIT_MODE' });
        TMD.emit('mode', { module: M.id });
        TMD.toast('Editing unlocked. Click a cell and start typing, or drag the small square at a cell’s corner to fill.', 'info', 4500);
        return true;
      },

      exitClean() {
        if (M.grid) M.grid.closeEditor(false);
        S().mode = 'view';
        S().dirty = false;
        undoStack = []; redoStack = []; snapshot = null;
        TMD.idb.del(M.slots.recovery); TMD.idb.del(M.slots.meta);
        M.audit.log({ action: 'EXIT_EDIT_MODE' });
        TMD.emit('mode', { module: M.id });
      },
      forceExit() { S().mode = 'view'; S().dirty = false; undoStack = []; redoStack = []; snapshot = null; TMD.emit('mode', { module: M.id }); },

      async cancel() {
        if (S().mode !== 'edit') return;
        if (M.grid) M.grid.closeEditor(true);
        if (!S().dirty) { this.exitClean(); TMD.toast('Editing locked. View Mode restored.', 'info'); return; }
        const choice = await TMD.modal({
          title: 'Unsaved changes',
          body: `<p>You have unsaved local changes (${undoStack.length} change${undoStack.length === 1 ? '' : 's'} since the last save). What would you like to do?</p>`,
          buttons: [{ label: 'Discard changes', value: 'discard', kind: 'danger' }, { label: 'Continue editing', value: 'continue' }, { label: 'Save locally and exit', value: 'save', kind: 'primary' }],
          dismissValue: 'continue',
        });
        if (choice === 'discard') {
          const n = undoStack.length;
          restoreSnapshot(snapshot);
          M.audit.log({ action: 'DISCARD', field: `${n} unsaved change(s) discarded` });
          this.exitClean();
          TMD.toast('Changes discarded. View Mode restored.', 'info');
        } else if (choice === 'save') {
          const ok = await this.saveLocal();
          if (ok) { this.exitClean(); TMD.toast('Saved locally. View Mode restored.', 'success'); }
        }
      },

      async saveLocal() {
        if (!TMD.settings.get('persistence')) {
          const go = await TMD.confirm('Local persistence is disabled', 'IndexedDB persistence is turned off in Settings. Enable it now to save a working copy in this browser?', 'Enable and save');
          if (!go) return false;
          TMD.settings.set('persistence', true);
        }
        const entry = M.audit.log({ action: 'SAVE_LOCAL', field: 'Working copy saved to browser storage (IndexedDB)' });
        const ok = await TMD.saveWorkingCopy(M.slots.working, M);
        if (!ok) M.audit.all().splice(M.audit.all().indexOf(entry), 1);
        if (ok) {
          TMD.idb.del(M.slots.recovery); TMD.idb.del(M.slots.meta);
          S().dirty = false;
          S().lastLocalSave = Date.now();
          snapshot = takeSnapshot();
          undoStack = []; redoStack = [];
          TMD.emit('mode', { module: M.id });
          TMD.emit('changed', { module: M.id });
          TMD.toast('Working copy saved locally in this browser (IndexedDB). The source file is unchanged.', 'success');
        }
        return ok;
      },

      async saveMenu() {
        const choice = await TMD.modal({
          title: 'Save changes',
          body: `<div class="choice-list">
            <div class="choice"><strong>${TMD.icon('database')} Save Locally</strong><p>Stores a working copy in this browser's IndexedDB. Restored automatically next time on this device.</p></div>
            <div class="choice"><strong>${TMD.icon('download')} Export Updated Excel</strong><p>Downloads a new .xlsx file. The imported workbook is not overwritten.</p></div>
            <div class="choice"><strong>${TMD.icon('file')} Export CSV</strong><p>Downloads the current worksheet (full or filtered) as CSV.</p></div></div>`,
          buttons: [{ label: 'Cancel', value: null }, { label: 'Export CSV', value: 'csv' }, { label: 'Export Updated Excel', value: 'xlsx' }, { label: 'Save Locally', value: 'local', kind: 'primary' }],
        });
        if (choice === 'local') return this.saveLocal();
        if (choice === 'xlsx') { const ok = await cfg.exportDialog(); if (ok) { S().dirty = false; TMD.emit('mode', { module: M.id }); } return ok; }
        if (choice === 'csv') return cfg.csvDialog();
        return false;
      },

      /** Edit one cell. */
      setValue(rec, key, nv, label) {
        this.setValues([{ rec, key, nv, label }], label);
      },

      /** Edit several cells as ONE undoable step (fill handle, paste, clear range, quick update). */
      setValues(items, label) {
        if (!guard()) return;
        let list = items.slice();
        if (cfg.augment) list = list.concat(cfg.augment(list) || []);
        const ops = list.map((it) => makeSet(it.rec, it.key, it.nv, it.label)).filter(Boolean);
        if (!ops.length) return;
        ops.forEach((o) => applyOp(o, 'do'));
        const op = ops.length === 1 ? ops[0] : { type: 'batch', ops, label: label || 'Batch edit' };
        push(op);
        logOp(op, 'EDIT');
        const recs = [];
        ops.forEach((o) => { if (recs.indexOf(o.rec) < 0) recs.push(o.rec); });
        afterChange(recs, { validate: ops.length === 1, key: ops[0].key });
        return ops.length;
      },

      setOverride(rec, ov) {
        if (!guard()) return;
        const op = { type: 'override', rec, old: rec.override, nv: ov };
        applyOp(op, 'do'); push(op);
        const lbl = cfg.overrideLabel || ((n) => String(n));
        M.audit.log({ action: 'OVERRIDE_STATUS', sheet: rec.sheet, recordId: rec.id, recordLabel: ident(rec), rowNum: rec.rowNum, field: 'Calculated status', oldValue: op.old ? lbl(op.old.stage) : '(calculated)', newValue: ov ? `${lbl(ov.stage)}${ov.note ? ' — ' + ov.note : ''}` : '(override removed)' });
        afterChange(rec);
        TMD.toast(ov ? 'Manual override applied.' : 'Override removed; calculated value restored.', 'success');
      },

      newRecord(sheetName, values) {
        const sheet = S().workbook.sheets[sheetName];
        const vals = {};
        sheet.headers.forEach((h) => { vals[h.key] = null; });
        Object.assign(vals, values || {});
        const maxRow = sheet.rows.reduce((m, r) => Math.max(m, r.rowNum || 0), sheet.headerRow + 1);
        return { id: TMD.uid('r'), mod: M.id, sheet: sheetName, rowNum: maxRow + 1, values: vals, dateHints: {}, edited: true, editedKeys: [], isNew: true, override: null, followUps: [] };
      },

      async chooseSheet(title) {
        const st = S();
        if (st.activeSheets.length <= 1) return st.activeSheets[0];
        const body = `<label class="field"><span>Worksheet</span><select class="inp" id="addSheet">${st.activeSheets.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>`;
        let chosen = st.activeSheets[0];
        const r = await TMD.modal({ title, body, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', kind: 'primary' }], onOpen: (d) => d.addEventListener('change', (e) => { chosen = e.target.value; }) });
        return r === 'ok' ? chosen : null;
      },

      /** Add a row at the end, or insert above / below an existing record. */
      async addRow(near, where) {
        if (!guard()) return;
        const sheetName = near ? near.sheet : await this.chooseSheet('Add row to worksheet');
        if (!sheetName) return;
        const sheet = S().workbook.sheets[sheetName];
        const seed = {};
        if (sheet.mapping.srNo) {
          const max = sheet.rows.reduce((m, r) => Math.max(m, parseFloat(r.values[sheet.mapping.srNo]) || 0), 0);
          seed[sheet.mapping.srNo] = sheet.colMeta[sheet.mapping.srNo].isId ? String(max + 1) : max + 1;
        }
        const rec = this.newRecord(sheetName, seed);
        let index = sheet.rows.length;
        if (near) { const i = sheet.rows.indexOf(near); index = where === 'above' ? i : i + 1; }
        const op = { type: 'add', rec, index };
        applyOp(op, 'do'); push(op);
        M.audit.log({ action: 'ADD_ROW', sheet: sheetName, recordId: rec.id, rowNum: rec.rowNum, field: near ? `Row inserted ${where} row ${near.rowNum}` : 'Row added' });
        afterChange(rec);
        if (S().filtered.indexOf(rec) < 0) TMD.toast('New row added but hidden by the current filters.', 'info', 4000);
        else TMD.toast(`New row added${near ? '' : ' at the end of ' + sheetName}. Start typing in its cells.`, 'success');
        if (M.grid) setTimeout(() => M.grid.focusRecord(rec), 60);
        return rec;
      },

      duplicate(recs) {
        if (!guard() || !recs || !recs.length) return;
        recs.slice(0, 200).forEach((src) => {
          const sheet = TMD.sheetOf(src);
          const maxRow = sheet.rows.reduce((m, r) => Math.max(m, r.rowNum || 0), 0);
          const rec = { id: TMD.uid('r'), mod: M.id, sheet: src.sheet, rowNum: maxRow + 1, values: Object.assign({}, src.values), dateHints: Object.assign({}, src.dateHints), edited: true, editedKeys: [], isNew: true, override: null, followUps: [] };
          const op = { type: 'add', rec, index: sheet.rows.indexOf(src) + 1 };
          applyOp(op, 'do'); push(op);
          M.audit.log({ action: 'DUPLICATE_ROW', sheet: src.sheet, recordId: rec.id, rowNum: rec.rowNum, field: 'Row duplicated', oldValue: `${src.sheet} row ${src.rowNum}` });
          markEdited(rec);
        });
        afterChange(null);
        TMD.toast(`${recs.length} row(s) duplicated (marked as new). Remember to change identifiers.`, 'success', 5000);
      },

      async remove(recs) {
        if (!guard() || !recs || !recs.length) return;
        const ok = await TMD.confirm('Delete rows', `Delete ${recs.length} row(s) from the working copy?\nThe source file is not changed; you can undo this action.`, 'Delete', 'danger');
        if (!ok) return;
        const items = recs.map((rec) => ({ rec, index: TMD.sheetOf(rec).rows.indexOf(rec) }));
        const op = { type: 'del', items };
        applyOp(op, 'do'); push(op);
        items.forEach((it) => { S().selection.delete(it.rec.id); M.audit.log({ action: 'DELETE_ROW', sheet: it.rec.sheet, recordId: it.rec.id, recordLabel: ident(it.rec), rowNum: it.rec.rowNum, field: 'Row deleted', oldValue: it.rec.calc ? it.rec.calc.title : '' }); });
        if (cfg.details && cfg.details.current() && recs.indexOf(cfg.details.current()) >= 0) cfg.details.close();
        afterChange(null);
        TMD.toast(`${recs.length} row(s) deleted. Use Undo to restore.`, 'info');
      },

      /** Add a new column (Excel-style) to a worksheet. */
      async addColumn() {
        if (!guard()) return;
        const sheetName = await this.chooseSheet('Add column to worksheet');
        if (!sheetName) return;
        let label = '', type = 'text';
        const res = await TMD.modal({
          title: 'Add column — ' + sheetName,
          body: `<label class="field"><span>Column header</span><input class="inp" id="acName" placeholder="e.g. Follow-up Officer" autofocus></label>
            <label class="field"><span>Type</span><select class="inp" id="acType"><option value="text">Text</option><option value="longtext">Long text / remarks</option><option value="date">Date</option><option value="number">Number</option></select></label>
            <p class="muted small">The column is added at the end of the worksheet and included in exports. Source columns are not changed.</p>`,
          buttons: [{ label: 'Cancel', value: null }, { label: 'Add column', value: 'ok', kind: 'primary' }],
          beforeClose: (v, d) => { if (v === 'ok') { label = d.querySelector('#acName').value.trim(); type = d.querySelector('#acType').value; if (!label) { TMD.toast('Enter a column header.', 'warn'); return false; } } return true; },
        });
        if (res !== 'ok') return;
        const sh = S().workbook.sheets[sheetName];
        const header = TMD.addColumn(sh, label, type);
        const op = { type: 'addcol', sheet: sheetName, header };
        push(op);
        logOp(op, 'ADD_COLUMN');
        S().dirty = true;
        M.setActiveSheets(S().activeSheets.slice());
        TMD.emit('mode', { module: M.id });
        autosave();
        TMD.toast(`Column “${label}” added to ${sheetName}.`, 'success');
      },

      undo() {
        const op = undoStack.pop();
        if (!op) return;
        const recs = applyOp(op, 'undo');
        redoStack.push(op);
        logOp(op, 'UNDO');
        afterChange(recs);
      },
      redo() {
        const op = redoStack.pop();
        if (!op) return;
        const recs = applyOp(op, 'do');
        undoStack.push(op);
        logOp(op, 'REDO');
        afterChange(recs);
      },
      markEdited,
    };
    return api;
  };

  /* ---------------- Tender Monitoring controller ---------------- */
  const STATUS_FIELDS = ['status', 'statusRemark', 'quickStatus'];
  TMD.editMode = TMD.createEditController(TMD.modules.tender, {
    enterText: 'You are entering Edit Mode. Changes will remain local until exported or downloaded.',
    details: { open: (r, o) => TMD.details.open(r, o), current: () => TMD.details.current(), close: () => TMD.details.close() },
    exportDialog: () => TMD.exporter.openDialog('full'),
    csvDialog: () => TMD.exporter.csvDialog(),
    overrideLabel: (n) => TMD.stageInfo(n).label,
    // Stamp "Status Updated On" with today's date whenever the status / status remark changes.
    augment(list) {
      const extra = [];
      list.forEach((it) => {
        const sh = TMD.sheetOf(it.rec);
        const k = sh.mapping.statusUpdated;
        if (!k) return;
        const isStatus = STATUS_FIELDS.some((f) => sh.mapping[f] === it.key);
        if (isStatus && !list.some((x) => x.rec === it.rec && x.key === k) && !extra.some((x) => x.rec === it.rec)) extra.push({ rec: it.rec, key: k, nv: TMD.fmtDate(TMD.today()), label: 'Status Updated On (automatic)' });
      });
      return extra;
    },
  });

  /* ---------------- Shared keyboard shortcuts & unload guard ---------------- */
  const activeEdit = () => (TMD.activeModule ? TMD.activeModule().edit : TMD.editMode);
  document.addEventListener('keydown', (e) => {
    const ed = activeEdit();
    if (!ed || !ed.isEditing()) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); ed.undo(); }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); ed.redo(); }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); ed.saveMenu(); }
  });
  window.addEventListener('beforeunload', (e) => {
    const dirty = Object.values(TMD.modules).some((m) => m.state.mode === 'edit' && m.state.dirty);
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
