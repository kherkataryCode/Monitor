/* =====================================================================
 * settings.js — locally stored settings, column mapping editor, friendly
 * labels, local data management; also renders the Audit Log page.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const S = TMD.settings;
  let mapSheet = null;

  const THRESHOLDS = [
    ['thrOpeningSoon', 'Bid opening "due soon" window (days)'],
    ['thrTechEval', 'Technical evaluation pending beyond (days after opening)'],
    ['thrPriceBid', 'Price bid pending beyond (days after technical evaluation)'],
    ['thrAward', 'Award pending beyond (days after technical completion / TEC)'],
    ['thrPrToPo', 'PR-to-PO cycle threshold (days)'],
    ['thrNotFloated', 'Tender not floated after being sent (days)'],
    ['thrValidity', 'PO/OLA validity expiry warning period (days; 30/60/90 bands shown)'],
    ['thrCapexFinish', 'CAPEX finish date approaching (days)'],
    ['thrFat', 'FAT overdue after award (days)'],
    ['thrDelivery', 'Material delivery overdue after FAT (days)'],
    ['thrInstall', 'Installation overdue after SAT (days)'],
    ['thrUpcoming', 'Upcoming milestone horizon (days)'],
  ];
  const sel = (k, opts) => `<select class="inp" data-s="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(S.get(k)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const UNIT_OPTS = [['rupees', 'Rupees (₹)'], ['lakh', 'Lakh'], ['crore', 'Crore']];

  function render() {
    const host = TMD.$('#page-settings');
    const st = TMD.state;
    const wb = st.workbook;
    const sheets = wb ? wb.loadOrder : [];
    if (!mapSheet || sheets.indexOf(mapSheet) < 0) mapSheet = st.activeSheets[0] || sheets[0];
    const sh = wb && wb.sheets[mapSheet];
    const months = TMD.MONTHS.map((m, i) => [i + 1, m]);
    host.innerHTML = `
      <div class="page-head"><div><h2>Settings</h2><p class="muted">Stored only in this browser on this device. Changes apply immediately.</p></div></div>
      <div class="settings-grid">
      <section class="card"><header class="card-h"><h3>General</h3></header><div class="form-grid">
        <label class="field"><span>Dashboard title</span><input class="inp" data-s="title" value="${esc(S.get('title'))}"></label>
        <label class="field"><span>Organisation</span><input class="inp" data-s="orgName" value="${esc(S.get('orgName'))}"></label>
        <div class="field"><span>Logo (local image, max 300 KB)</span><div class="logo-row"><img src="${esc(S.get('logo') || 'assets/logo-placeholder.svg')}" alt="Current logo" class="logo-prev"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif" id="logoFile" class="inp"><button class="btn subtle sm" data-act="logoClear">Reset</button></div></div>
        <label class="field"><span>Theme</span>${sel('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'Follow system']])}</label>
        <label class="field"><span>Default worksheet on import</span><input class="inp" data-s="defaultSheet" value="${esc(S.get('defaultSheet'))}" placeholder="e.g. Capex Modified" list="sheetList"><datalist id="sheetList">${(wb ? wb.sheetNames : []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label class="field"><span>Date display format</span>${sel('dateFormat', [['dd/mm/yyyy', 'dd/mm/yyyy'], ['dd-mm-yyyy', 'dd-mm-yyyy'], ['dd-mmm-yyyy', 'dd-Mmm-yyyy'], ['dd mmm yyyy', 'dd Mmm yyyy'], ['yyyy-mm-dd', 'yyyy-mm-dd']])}</label>
        <label class="field"><span>Financial year starts in</span>${sel('fyStartMonth', months)}</label>
        <label class="field"><span>Currency symbol</span><input class="inp" data-s="currency" value="${esc(S.get('currency'))}" maxlength="4"></label>
        <label class="field"><span>Amount display</span>${sel('amountUnit', UNIT_OPTS)}</label>
        <label class="field"><span>Default row density</span>${sel('density', [['compact', 'Compact'], ['comfortable', 'Comfortable']])}</label>
        <label class="field"><span>Frozen data columns in register</span>${sel('frozenCols', [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']])}</label>
      </div></section>

      <section class="card"><header class="card-h"><div><h3>Units for amount columns</h3><p class="card-sub">Used only when a column header does not state its unit (e.g. “Estimated Cost (In Lacs)” is always read as lakh).</p></div></header><div class="form-grid">
        <label class="field"><span>Project Cost</span>${sel('unitProjectCost', UNIT_OPTS)}</label>
        <label class="field"><span>BE (budget estimate)</span>${sel('unitBE', UNIT_OPTS)}</label>
        <label class="field"><span>PO/OLA cash outflow</span>${sel('unitCashOutflow', UNIT_OPTS)}</label>
        <label class="field"><span>Estimated cost</span>${sel('unitEstCost', UNIT_OPTS)}</label>
      </div></section>

      <section class="card"><header class="card-h"><div><h3>Alert thresholds</h3><p class="card-sub">Alerts are calculated offline from the system date.</p></div><button class="btn subtle sm" data-act="thrReset">Restore defaults</button></header><div class="form-grid">
        ${THRESHOLDS.map(([k, l]) => `<label class="field"><span>${esc(l)}</span><input class="inp" type="number" min="0" max="3650" data-s="${k}" data-num="1" value="${esc(S.get(k))}"></label>`).join('')}
      </div></section>

      <section class="card wide"><header class="card-h"><div><h3>Column mapping</h3><p class="card-sub">Links source columns to the standard monitoring fields. Source headers are never renamed; unmapped columns stay visible in the register.</p></div>
        ${sheets.length ? `<label class="tb-sel">Worksheet<select class="inp inp-sm" id="mapSheet">${sheets.map((n) => `<option ${n === mapSheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}</header>
        ${sh ? mappingEditor(sh) : '<p class="muted pad">No worksheet loaded.</p>'}
      </section>

      <section class="card wide"><header class="card-h"><div><h3>Friendly column labels</h3><p class="card-sub">Optional display names (e.g. distinguish the two “PR No” columns). Exports always keep the original headers.</p></div></header>
        ${sh ? `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>Col</th><th>Original header</th><th>Internal key</th><th>Friendly label</th></tr></thead><tbody>${sh.headers.map((h) => `<tr><td>${TMD.colLetter(h.index)}</td><td>${esc(h.display)}${h.dup ? ' <span class="tag tag-amber">duplicate</span>' : ''}</td><td><code>${esc(h.key)}</code></td><td><input class="inp inp-sm" data-friendly="${esc(h.key)}" value="${esc((sh.friendly || {})[h.key] || '')}" placeholder="${esc(h.display)}"></td></tr>`).join('')}</tbody></table></div>
        <div class="pad"><button class="btn" data-act="saveFriendly">Save labels</button></div>` : ''}
      </section>

      <section class="card"><header class="card-h"><h3>Local data &amp; privacy</h3></header>
        <div class="privacy-box">${TMD.icon('lock')}<div><strong>Offline Mode: data remains on this device.</strong><p class="muted small">Files are read with the browser’s File API and processed in memory. No uploads, APIs, CDNs, analytics or telemetry are used. A Content Security Policy blocks all network connections.</p></div></div>
        <label class="chk"><input type="checkbox" data-s="persistence" data-bool="1" ${S.get('persistence') ? 'checked' : ''}> Keep a local working copy and automatic recovery (IndexedDB)</label>
        <label class="chk"><input type="checkbox" data-s="csvProtect" data-bool="1" ${S.get('csvProtect') ? 'checked' : ''}> Protect CSV exports against formula injection by default</label>
        <div class="btn-col">
          <button class="btn" data-act="clearWork">${TMD.icon('database')}<span>Clear local working data</span></button>
          <button class="btn" data-act="clearAudit">${TMD.icon('history')}<span>Clear audit history</span></button>
          <button class="btn danger" data-act="reset">${TMD.icon('trash')}<span>Reset application</span></button>
        </div>
      </section>

      <section class="card"><header class="card-h"><h3>About</h3></header><div class="pad small">
        <p><strong>Tender Monitoring Dashboard</strong> — offline, client-side application.</p>
        <p>Bundled libraries (stored in <code>lib/</code>): SheetJS Community Edition ${esc(window.XLSX ? window.XLSX.version : '')} (Apache-2.0), Papa Parse 5.4.1 (MIT), Chart.js ${esc(window.Chart ? window.Chart.version : '')} (MIT).</p>
        <p class="muted">Session ID: <code>${esc(st.sessionId)}</code> · Local storage: ${'indexedDB' in window ? 'IndexedDB available' : 'IndexedDB unavailable'}</p>
      </div></section>
      </div>`;
  }

  function mappingEditor(sh) {
    const opts = (cur) => `<option value="">— not mapped —</option>` + sh.headers.map((h) => `<option value="${esc(h.key)}" ${cur === h.key ? 'selected' : ''}>${esc(TMD.colLetter(h.index))}: ${esc(h.display)}${h.dup ? ' [' + esc(h.key) + ']' : ''}</option>`).join('');
    return `<p class="muted small pad">Recognised as: <strong>${esc(sh.sheetType)}</strong>${sh.mappingSaved ? ' · using a saved custom mapping' : ' · automatic mapping'}</p>
      <div class="map-grid">${Object.keys(TMD.STD).map((f) => `<label class="field ${sh.mapping[f] ? 'active' : ''}"><span>${esc(TMD.STD[f].label)} <code class="muted">${f}</code></span><select class="inp inp-sm" data-map="${f}">${opts(sh.mapping[f])}</select></label>`).join('')}</div>
      <div class="pad"><button class="btn primary" data-act="saveMap">Apply mapping</button> <button class="btn subtle" data-act="autoMap">Reset to automatic</button></div>`;
  }

  async function clearWork() {
    const ok = await TMD.confirm('Clear local working data', 'Delete the working copy and recovery data stored in this browser?\nThe demonstration data will be loaded. Your files on disk are not affected.', 'Clear', 'danger');
    if (!ok) return;
    await TMD.idb.del('working'); await TMD.idb.del('recovery'); await TMD.idb.del('recoveryMeta');
    if (TMD.state.mode === 'edit') TMD.editMode.forceExit();
    TMD.loadDemo();
    TMD.toast('Local working data cleared. Demonstration data loaded.', 'success');
  }
  async function clearAudit() {
    const ok = await TMD.confirm('Clear audit history', 'Delete all local audit-log entries? Consider exporting the audit log to CSV first.', 'Clear history', 'danger');
    if (!ok) return;
    TMD.audit.clear();
    TMD.audit.log({ action: 'AUDIT_CLEARED', field: 'Audit history cleared by user' });
    if (S.get('persistence')) TMD.saveWorkingCopy('working');
    TMD.toast('Audit history cleared.', 'success');
    render();
  }
  async function resetApp() {
    const ok = await TMD.confirm('Reset application', 'This removes ALL locally stored data for this application on this device: settings, layouts, presets, mappings, working copy, recovery data and audit history.\nYour Excel/CSV files on disk are not affected.', 'Reset everything', 'danger');
    if (!ok) return;
    try { await TMD.idb.clear(); } catch (e) { /* ignore */ }
    TMD.ls.clearAll();
    window.location.hash = '';
    window.location.reload();
  }

  TMD.settingsPage = { render };
  TMD.initSettings = function () {
    const host = TMD.$('#page-settings');
    host.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.s) {
        let v = t.dataset.bool ? t.checked : t.value;
        if (t.dataset.num) { v = Math.max(0, Math.min(3650, parseInt(v, 10) || 0)); t.value = v; }
        if (['frozenCols', 'fyStartMonth'].indexOf(t.dataset.s) >= 0) v = +v;
        S.set(t.dataset.s, v);
        if (t.dataset.s === 'persistence' && !v) TMD.toast('Local persistence disabled. Existing working copy is kept until you clear it.', 'info');
        return;
      }
      if (t.id === 'mapSheet') { mapSheet = t.value; render(); return; }
      if (t.id === 'logoFile' && t.files[0]) {
        const f = t.files[0];
        if (f.size > 300 * 1024) { TMD.toast('Logo must be smaller than 300 KB.', 'error'); return; }
        if (!/^image\/(png|jpeg|gif|svg\+xml)$/.test(f.type)) { TMD.toast('Please choose a PNG, JPEG, GIF or SVG image.', 'error'); return; }
        const rd = new FileReader();
        rd.onload = () => { S.set('logo', String(rd.result)); render(); TMD.toast('Logo updated (stored locally).', 'success'); };
        rd.readAsDataURL(f);
      }
    });
    host.addEventListener('input', TMD.debounce((e) => { const t = e.target; if (t.dataset.s && (t.tagName === 'INPUT' && t.type === 'text' || !t.type)) S.set(t.dataset.s, t.value); }, 400));
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      const sh = TMD.state.workbook && TMD.state.workbook.sheets[mapSheet];
      if (a === 'logoClear') { S.set('logo', ''); render(); }
      if (a === 'thrReset') { const d = {}; THRESHOLDS.forEach(([k]) => { d[k] = S.DEFAULTS[k]; }); S.setMany(d); render(); TMD.toast('Thresholds restored.', 'info'); }
      if (a === 'saveMap' && sh) {
        const m = {};
        TMD.$$('[data-map]', host).forEach((s) => { if (s.value) m[s.dataset.map] = s.value; });
        TMD.applyMapping(sh, m);
        sh.mappingSaved = true;
        TMD.ls.set('mapping.' + TMD.sheetSignature(sh.name, sh.headers), m);
        TMD.setActiveSheets(TMD.state.activeSheets.slice());
        TMD.toast('Column mapping applied and saved for this worksheet layout.', 'success');
        render();
      }
      if (a === 'autoMap' && sh) {
        TMD.ls.remove('mapping.' + TMD.sheetSignature(sh.name, sh.headers));
        TMD.applyMapping(sh, TMD.autoMapping(sh.headers));
        sh.mappingSaved = false;
        TMD.setActiveSheets(TMD.state.activeSheets.slice());
        TMD.toast('Automatic mapping restored.', 'info');
        render();
      }
      if (a === 'saveFriendly' && sh) {
        const f = {};
        TMD.$$('[data-friendly]', host).forEach((i) => { if (i.value.trim()) f[i.dataset.friendly] = i.value.trim(); });
        sh.friendly = f;
        TMD.ls.set('friendly.' + TMD.sheetSignature(sh.name, sh.headers), f);
        TMD.buildColumns();
        TMD.emit('columns');
        TMD.toast('Friendly labels saved.', 'success');
      }
      if (a === 'clearWork') clearWork();
      if (a === 'clearAudit') clearAudit();
      if (a === 'reset') resetApp();
    });
  };

  /* ---------------- Audit Log page ---------------- */
  const AV = { action: '', sheet: '', q: '' };
  function renderAudit() {
    const host = TMD.$('#page-audit');
    const all = TMD.audit.all();
    const q = AV.q.trim().toLowerCase();
    const list = all.filter((e) => (!AV.action || e.action === AV.action) && (!AV.sheet || e.sheet === AV.sheet) && (!q || `${e.recordLabel} ${e.field} ${e.oldValue} ${e.newValue} ${e.sheet}`.toLowerCase().indexOf(q) >= 0)).slice().reverse();
    const actions = Array.from(new Set(all.map((e) => e.action))).sort();
    const sheets = Array.from(new Set(all.map((e) => e.sheet).filter(Boolean))).sort();
    host.innerHTML = `
      <div class="page-head"><div><h2>Audit Log</h2><p class="muted">Local log of imports, edits, overrides, saves and exports made in this application. It is stored in this browser and is <strong>not</strong> tamper-proof or equivalent to an enterprise audit system.</p></div>
        <div class="page-actions"><button class="btn subtle" data-a="csv">${TMD.icon('download')}<span>Export CSV</span></button><a class="btn subtle" href="#settings">${TMD.icon('settings')}<span>Clear in Settings</span></a></div></div>
      <div class="toolbar-row"><div class="tb-group">
        <label class="tb-sel">Action<select class="inp inp-sm" data-av="action"><option value="">All</option>${actions.map((a) => `<option ${AV.action === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
        <label class="tb-sel">Worksheet<select class="inp inp-sm" data-av="sheet"><option value="">All</option>${sheets.map((a) => `<option ${AV.sheet === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
        <input class="inp inp-sm" type="search" data-av="q" value="${esc(AV.q)}" placeholder="Search log…" aria-label="Search audit log"></div><div class="muted">${list.length} of ${all.length} entries</div></div>
      <section class="card"><div class="table-wrap"><table class="data-table hover"><thead><tr><th>Local timestamp</th><th>Action</th><th>Worksheet</th><th class="num">Row</th><th>Record</th><th>Field</th><th>Previous value</th><th>New value</th><th>Session</th></tr></thead><tbody>
      ${list.slice(0, 2000).map((e) => `<tr ${e.recordId ? `data-rec="${esc(e.recordId)}"` : ''}><td class="nowrap">${esc(new Date(e.ts).toLocaleString('en-IN'))}</td><td><span class="tag">${esc(e.action)}</span></td><td>${esc(e.sheet)}</td><td class="num">${esc(e.rowNum)}</td><td>${esc(e.recordLabel || '')}</td><td>${esc(e.field)}</td><td class="wrap">${esc(e.oldValue)}</td><td class="wrap">${esc(e.newValue)}</td><td class="small muted">${esc(e.sessionId)}</td></tr>`).join('') || '<tr><td colspan="9" class="pad muted">No audit entries.</td></tr>'}
      </tbody></table></div></section>`;
    host._list = list;
  }
  TMD.auditPage = { render: renderAudit };
  TMD.initAuditPage = function () {
    const host = TMD.$('#page-audit');
    host.addEventListener('change', (e) => { const k = e.target.dataset.av; if (k && k !== 'q') { AV[k] = e.target.value; renderAudit(); } });
    host.addEventListener('input', TMD.debounce((e) => { if (e.target.dataset.av === 'q') { AV.q = e.target.value; const pos = e.target.selectionStart; renderAudit(); const i = host.querySelector('[data-av="q"]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 250));
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-a="csv"]')) { TMD.exporter.exportAuditCsv(host._list ? host._list.slice().reverse() : null); return; }
      const r = e.target.closest('[data-rec]');
      if (r) { const rec = TMD.state.records.find((x) => x.id === r.dataset.rec); if (rec) TMD.details.open(rec, { section: 'history' }); }
    });
  };
})();
