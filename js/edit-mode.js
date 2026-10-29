/* =====================================================================
 * edit-mode.js — protected View Mode by default; explicit Edit Mode with
 * undo/redo, add / duplicate / delete rows, stage overrides, local save,
 * cancel (discard / continue / save & exit) and automatic local recovery.
 * The original source file is never overwritten.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  let undoStack = [], redoStack = [];
  let snapshot = null;

  function takeSnapshot() {
    const wb = TMD.state.workbook;
    const snap = {};
    wb.loadOrder.forEach((n) => {
      snap[n] = wb.sheets[n].rows.map((r) => ({
        id: r.id, sheet: r.sheet, rowNum: r.rowNum, values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints),
        edited: r.edited, editedKeys: r.editedKeys.slice(), isNew: r.isNew, override: r.override ? Object.assign({}, r.override) : null, followUps: (r.followUps || []).slice(),
      }));
    });
    return snap;
  }
  function restoreSnapshot(snap) {
    const wb = TMD.state.workbook;
    Object.keys(snap).forEach((n) => { if (wb.sheets[n]) wb.sheets[n].rows = snap[n].map((r) => Object.assign({}, r, { values: Object.assign({}, r.values), dateHints: Object.assign({}, r.dateHints), editedKeys: r.editedKeys.slice() })); });
    TMD.setActiveSheets(TMD.state.activeSheets.slice());
  }

  /** Recompute edited flags by comparing with the originally imported values. */
  function markEdited(rec) {
    const orig = TMD.state.workbook.original[rec.sheet] && TMD.state.workbook.original[rec.sheet][rec.id];
    if (!orig) { rec.isNew = true; rec.editedKeys = Object.keys(rec.values).filter((k) => !TMD.isBlank(rec.values[k])); rec.edited = true; return; }
    rec.editedKeys = Object.keys(rec.values).filter((k) => {
      const a = rec.values[k], b = orig.values[k];
      if (TMD.isBlank(a) && TMD.isBlank(b)) return false;
      return String(a) !== String(b);
    });
    rec.edited = rec.editedKeys.length > 0 || !!(rec.override && rec.override.stage);
  }

  function setBadge() {
    const b = TMD.$('#modeBadge');
    const edit = TMD.state.mode === 'edit';
    b.className = 'mode-badge ' + (edit ? 'edit' : 'view');
    b.innerHTML = edit
      ? `${TMD.icon('edit')}<span><strong>EDIT MODE</strong> – ${TMD.state.dirty ? 'Unsaved local changes' : 'Changes saved locally'}</span>`
      : `${TMD.icon('lock')}<span><strong>VIEW MODE</strong> – Data is protected from editing</span>`;
    document.body.classList.toggle('mode-edit', edit);
    document.body.classList.toggle('mode-view', !edit);
    TMD.$('#btnEdit').hidden = edit;
  }

  function afterChange(rec, opts) {
    TMD.state.dirty = true;
    if (rec) { markEdited(rec); TMD.recalcRecord(rec); }
    else TMD.recalcAll();
    setBadge();
    TMD.filters.apply();
    TMD.emit('changed', { rec });
    autosave();
    if (opts && opts.validate && rec) validateToast(rec, opts.key);
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
    const high = rec.calc.dq.filter((q) => q.sev === 'high' && /seq-|invalid/.test(q.code));
    if (high.length) TMD.toast('Validation: ' + high[0].msg, 'warn', 5000);
  }

  const autosave = TMD.debounce(() => {
    if (TMD.state.mode !== 'edit' || !TMD.settings.get('persistence')) return;
    TMD.saveWorkingCopy('recovery').then(() => TMD.idb.set('recoveryMeta', { at: Date.now(), dirty: TMD.state.dirty }));
  }, 1200);

  function push(op) { undoStack.push(op); if (undoStack.length > 500) undoStack.shift(); redoStack = []; }

  /* ---------------- Operations ---------------- */
  function applyOp(op, dir) {
    const wb = TMD.state.workbook;
    if (op.type === 'set') {
      const rec = op.rec;
      rec.values[op.key] = dir === 'undo' ? op.old : op.nv;
      if (dir === 'undo' && op.oldHint) rec.dateHints[op.key] = op.oldHint; else if (dir !== 'undo') delete rec.dateHints[op.key];
      return rec;
    }
    if (op.type === 'override') { op.rec.override = dir === 'undo' ? op.old : op.nv; return op.rec; }
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
    return null;
  }
  function rebuildRecords() {
    const st = TMD.state;
    st.records = [];
    st.activeSheets.forEach((n) => { st.records = st.records.concat(st.workbook.sheets[n].rows); });
  }
  function logOp(op, action) {
    if (op.type === 'set') TMD.audit.log({ action, sheet: op.rec.sheet, recordId: op.rec.id, recordLabel: op.rec.calc ? op.rec.calc.ident : '', rowNum: op.rec.rowNum, field: op.label || op.key, oldValue: TMD.cellText(action === 'UNDO' ? op.nv : op.old), newValue: TMD.cellText(action === 'UNDO' ? op.old : op.nv) });
    else TMD.audit.log({ action, field: op.type === 'add' ? 'Row added' : op.type === 'del' ? `${op.items.length} row(s) deleted` : 'Stage override', sheet: op.rec ? op.rec.sheet : (op.items && op.items[0] ? op.items[0].rec.sheet : ''), recordId: op.rec ? op.rec.id : '' });
  }

  TMD.editMode = {
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    autosave,

    async enter() {
      if (TMD.state.mode === 'edit') return true;
      if (!TMD.state.workbook) return false;
      const ok = await TMD.modal({
        title: 'Enter Edit Mode',
        body: `<p><strong>You are entering Edit Mode. Changes will remain local until exported or downloaded.</strong></p>
          <ul class="compact-list"><li>The original file on your computer is never overwritten.</li><li>Use <em>Save → Save Locally</em> to keep a working copy in this browser, or <em>Export Updated Excel</em> to download a new file.</li><li>Every change is written to the local audit log.</li></ul>`,
        buttons: [{ label: 'Stay in View Mode', value: false }, { label: 'Enter Edit Mode', value: true, kind: 'primary' }], dismissValue: false,
      });
      if (!ok) return false;
      snapshot = takeSnapshot();
      undoStack = []; redoStack = [];
      TMD.state.mode = 'edit';
      TMD.state.dirty = false;
      TMD.audit.log({ action: 'ENTER_EDIT_MODE' });
      setBadge();
      TMD.emit('mode');
      TMD.toast('Edit Mode enabled. Editable cells are highlighted; double-click or press Enter to edit.', 'info', 4500);
      return true;
    },

    exitClean() {
      TMD.table.closeEditor(false);
      TMD.state.mode = 'view';
      TMD.state.dirty = false;
      undoStack = []; redoStack = []; snapshot = null;
      TMD.idb.del('recovery'); TMD.idb.del('recoveryMeta');
      TMD.audit.log({ action: 'EXIT_EDIT_MODE' });
      setBadge();
      TMD.emit('mode');
    },
    forceExit() { TMD.state.mode = 'view'; TMD.state.dirty = false; undoStack = []; redoStack = []; snapshot = null; setBadge(); TMD.emit('mode'); },

    async cancel() {
      if (TMD.state.mode !== 'edit') return;
      TMD.table.closeEditor(true);
      if (!TMD.state.dirty) { this.exitClean(); TMD.toast('Returned to View Mode.', 'info'); return; }
      const choice = await TMD.modal({
        title: 'Unsaved changes',
        body: `<p>You have unsaved local changes (${undoStack.length} change${undoStack.length === 1 ? '' : 's'} since the last save). What would you like to do?</p>`,
        buttons: [{ label: 'Discard changes', value: 'discard', kind: 'danger' }, { label: 'Continue editing', value: 'continue' }, { label: 'Save locally and exit', value: 'save', kind: 'primary' }],
        dismissValue: 'continue',
      });
      if (choice === 'discard') {
        restoreSnapshot(snapshot);
        TMD.audit.log({ action: 'DISCARD', field: `${undoStack.length} unsaved change(s) discarded` });
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
      const entry = TMD.audit.log({ action: 'SAVE_LOCAL', field: 'Working copy saved to browser storage (IndexedDB)' });
      const ok = await TMD.saveWorkingCopy('working');
      if (!ok) TMD.audit.all().splice(TMD.audit.all().indexOf(entry), 1);
      if (ok) {
        TMD.idb.del('recovery'); TMD.idb.del('recoveryMeta');
        TMD.state.dirty = false;
        snapshot = takeSnapshot();
        undoStack = []; redoStack = [];
        setBadge();
        TMD.emit('changed', {});
        TMD.toast('Working copy saved locally in this browser (IndexedDB). The source file is unchanged.', 'success');
      }
      return ok;
    },

    async saveMenu() {
      const choice = await TMD.modal({
        title: 'Save changes',
        body: `<div class="choice-list">
          <div class="choice"><strong>${TMD.icon('database')} Save Locally</strong><p>Stores a working copy in this browser's IndexedDB. Restored automatically next time on this device.</p></div>
          <div class="choice"><strong>${TMD.icon('download')} Export Updated Excel</strong><p>Downloads a new file named <code>Tender_Tracker_Updated_${esc(TMD.stamp())}.xlsx</code>. The imported workbook is not overwritten.</p></div>
          <div class="choice"><strong>${TMD.icon('file')} Export CSV</strong><p>Downloads the current worksheet (full or filtered) as CSV.</p></div></div>`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Export CSV', value: 'csv' }, { label: 'Export Updated Excel', value: 'xlsx' }, { label: 'Save Locally', value: 'local', kind: 'primary' }],
      });
      if (choice === 'local') return this.saveLocal();
      if (choice === 'xlsx') { const ok = await TMD.exporter.openDialog('full'); if (ok) { TMD.state.dirty = false; setBadge(); } return ok; }
      if (choice === 'csv') return TMD.exporter.csvDialog();
      return false;
    },

    setValue(rec, key, nv, label) {
      if (TMD.state.mode !== 'edit') { TMD.toast('View Mode: data is protected. Click Edit to make changes.', 'warn'); return; }
      const old = rec.values[key];
      if (old === nv || (TMD.isBlank(old) && TMD.isBlank(nv))) return;
      const sheet = TMD.sheetOf(rec);
      const meta = sheet.colMeta[key] || {};
      // Identifiers always stay text
      if (meta.isId && typeof nv === 'number') nv = TMD.numToPlainString(nv);
      const op = { type: 'set', rec, key, old, nv, oldHint: rec.dateHints[key], label: label || key };
      applyOp(op, 'do');
      push(op);
      logOp(op, 'EDIT');
      afterChange(rec, { validate: true, key });
    },

    setOverride(rec, ov) {
      if (TMD.state.mode !== 'edit') return;
      const op = { type: 'override', rec, old: rec.override, nv: ov };
      applyOp(op, 'do'); push(op);
      TMD.audit.log({ action: 'OVERRIDE_STAGE', sheet: rec.sheet, recordId: rec.id, recordLabel: rec.calc.ident, rowNum: rec.rowNum, field: 'Calculated stage', oldValue: op.old ? TMD.stageInfo(op.old.stage).label : `(calculated) ${TMD.stageInfo(rec.calc.calcStage).label}`, newValue: ov ? `${TMD.stageInfo(ov.stage).label}${ov.note ? ' — ' + ov.note : ''}` : '(override removed)' });
      afterChange(rec);
      TMD.toast(ov ? 'Manual stage override applied.' : 'Override removed; calculated stage restored.', 'success');
    },

    async addRow() {
      if (TMD.state.mode !== 'edit') return;
      const st = TMD.state;
      let sheetName = st.activeSheets[0];
      if (st.activeSheets.length > 1) {
        const body = `<label class="field"><span>Add the new row to worksheet</span><select class="inp" id="addSheet">${st.activeSheets.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>`;
        let chosen = sheetName;
        const r = await TMD.modal({ title: 'Add row', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Add row', value: 'ok', kind: 'primary' }], onOpen: (d) => d.addEventListener('change', (e) => { chosen = e.target.value; }) });
        if (r !== 'ok') return;
        sheetName = chosen;
      }
      const sheet = st.workbook.sheets[sheetName];
      const values = {};
      sheet.headers.forEach((h) => { values[h.key] = null; });
      if (sheet.mapping.srNo) {
        const max = sheet.rows.reduce((m, r) => Math.max(m, parseFloat(r.values[sheet.mapping.srNo]) || 0), 0);
        values[sheet.mapping.srNo] = sheet.colMeta[sheet.mapping.srNo].isId ? String(max + 1) : max + 1;
      }
      const maxRow = sheet.rows.reduce((m, r) => Math.max(m, r.rowNum || 0), sheet.headerRow + 1);
      const rec = { id: TMD.uid('r'), sheet: sheetName, rowNum: maxRow + 1, values, dateHints: {}, edited: true, editedKeys: [], isNew: true, override: null, followUps: [] };
      const op = { type: 'add', rec, index: sheet.rows.length };
      applyOp(op, 'do'); push(op);
      TMD.audit.log({ action: 'ADD_ROW', sheet: sheetName, recordId: rec.id, rowNum: rec.rowNum, field: 'Row added' });
      afterChange(rec);
      if (TMD.state.filtered.indexOf(rec) < 0) TMD.toast('New row added. It is hidden by the current filters; it is open in the details panel.', 'info', 5000);
      else TMD.toast('New row added at the end of ' + sheetName + '.', 'success');
      TMD.details.open(rec, { edit: true });
      setTimeout(() => TMD.table.focusRecord(rec), 60);
    },

    duplicate(recs) {
      if (TMD.state.mode !== 'edit' || !recs || !recs.length) { if (TMD.state.mode !== 'edit') TMD.toast('Duplicate is available in Edit Mode.', 'warn'); return; }
      recs.slice(0, 200).forEach((src) => {
        const sheet = TMD.sheetOf(src);
        const maxRow = sheet.rows.reduce((m, r) => Math.max(m, r.rowNum || 0), 0);
        const rec = { id: TMD.uid('r'), sheet: src.sheet, rowNum: maxRow + 1, values: Object.assign({}, src.values), dateHints: Object.assign({}, src.dateHints), edited: true, editedKeys: [], isNew: true, override: null, followUps: [] };
        const op = { type: 'add', rec, index: sheet.rows.indexOf(src) + 1 };
        applyOp(op, 'do'); push(op);
        TMD.audit.log({ action: 'DUPLICATE_ROW', sheet: src.sheet, recordId: rec.id, rowNum: rec.rowNum, field: 'Row duplicated', oldValue: `${src.sheet} row ${src.rowNum}` });
        markEdited(rec);
      });
      afterChange(null);
      TMD.toast(`${recs.length} row(s) duplicated (marked as new). Remember to change identifiers such as PR / GeM numbers.`, 'success', 5000);
    },

    async remove(recs) {
      if (TMD.state.mode !== 'edit') { TMD.toast('Delete is only available in Edit Mode.', 'warn'); return; }
      if (!recs || !recs.length) return;
      const ok = await TMD.confirm('Delete rows', `Delete ${recs.length} row(s) from the working copy?\nThe source file is not changed; you can undo this action.`, 'Delete', 'danger');
      if (!ok) return;
      const items = recs.map((rec) => ({ rec, index: TMD.sheetOf(rec).rows.indexOf(rec) }));
      const op = { type: 'del', items };
      applyOp(op, 'do'); push(op);
      items.forEach((it) => { TMD.state.selection.delete(it.rec.id); TMD.audit.log({ action: 'DELETE_ROW', sheet: it.rec.sheet, recordId: it.rec.id, recordLabel: it.rec.calc ? it.rec.calc.ident : '', rowNum: it.rec.rowNum, field: 'Row deleted', oldValue: it.rec.calc ? it.rec.calc.title : '' }); });
      if (TMD.details.current() && recs.indexOf(TMD.details.current()) >= 0) TMD.details.close();
      afterChange(null);
      TMD.toast(`${recs.length} row(s) deleted. Use Undo to restore.`, 'info');
    },

    undo() {
      const op = undoStack.pop();
      if (!op) return;
      const rec = applyOp(op, 'undo');
      redoStack.push(op);
      logOp(op, 'UNDO');
      afterChange(rec);
    },
    redo() {
      const op = redoStack.pop();
      if (!op) return;
      const rec = applyOp(op, 'do');
      undoStack.push(op);
      logOp(op, 'REDO');
      afterChange(rec);
    },
    setBadge,
    markEdited,
  };

  // Global shortcuts (only when not typing in a field)
  document.addEventListener('keydown', (e) => {
    if (TMD.state.mode !== 'edit') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); TMD.editMode.undo(); }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); TMD.editMode.redo(); }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); TMD.editMode.saveMenu(); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (TMD.state.mode === 'edit' && TMD.state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
