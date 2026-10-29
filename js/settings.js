/* =====================================================================
 * settings.js — locally stored settings, management status configuration,
 * Cyber Audit settings, module-aware column mapping & friendly labels,
 * local data management; also renders the Audit Log page.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const S = TMD.settings;
  let mapMod = 'tender';
  let mapSheet = null;

  const THRESHOLDS = [
    ['thrOpeningSoon', 'Bid opening "due soon" window (days)'],
    ['thrTechEval', 'Technical evaluation pending beyond (days after opening)'],
    ['thrPriceBid', 'Price bid pending beyond (days after technical evaluation)'],
    ['thrAward', 'Award pending beyond (days after technical completion / TEC)'],
    ['thrPrToPo', 'PR-to-PO cycle threshold (days)'],
    ['thrNotFloated', 'Tender not floated after being sent (days)'],
    ['thrValidity', 'PO/OLA validity expiry warning period (days)'],
    ['thrCapexFinish', 'CAPEX finish date approaching (days)'],
    ['thrFat', 'FAT overdue after award (days)'],
    ['thrDelivery', 'Material delivery overdue after FAT (days)'],
    ['thrInstall', 'Installation overdue after SAT (days)'],
    ['thrUpcoming', 'Upcoming milestone horizon (days)'],
    ['thrNextAction', 'Next action date "due soon" window (days)'],
    ['thrStale', 'Status not updated — alert after (days)'],
  ];
  const TONES = ['grey', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'purple'];
  const sel = (k, opts) => `<select class="inp" data-s="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(S.get(k)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const UNIT_OPTS = [['rupees', 'Rupees (₹)'], ['lakh', 'Lakh'], ['crore', 'Crore']];

  function mgmtEditor() {
    const list = TMD.mgmtStatuses();
    const stageOwner = {};
    list.forEach((m) => m.stages.forEach((n) => { stageOwner[n] = m.id; }));
    return `<section class="card wide"><header class="card-h"><div><h3>Management status</h3><p class="card-sub">Group the 27 calculated stages into the statuses management wants to see. Names, colours and the stage mapping are configurable.</p></div>
      <div class="tb-group"><button class="btn subtle sm" data-act="mgmtAdd">${TMD.icon('plus')}<span>Add status</span></button><button class="btn subtle sm" data-act="mgmtReset">Restore defaults</button></div></header>
      <div class="pad"><div class="mgmt-list">${list.map((m, i) => `<div class="mgmt-item"><span class="ms-dot tone-${esc(m.tone)}"></span><input class="inp inp-sm" data-mgname="${i}" value="${esc(m.name)}" aria-label="Status name"><select class="inp inp-sm" data-mgtone="${i}" aria-label="Colour">${TONES.map((t) => `<option ${t === m.tone ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="icon-btn sm" data-mgdel="${i}" aria-label="Remove status" ${list.length < 2 ? 'disabled' : ''}>${TMD.icon('trash')}</button></div>`).join('')}</div>
      <div class="stage-map">${TMD.STAGES.slice(1).map((s) => `<label class="field"><span>${esc(TMD.stageLabel(s.n))}</span><select class="inp inp-sm" data-mgstage="${s.n}">${list.map((m) => `<option value="${esc(m.id)}" ${stageOwner[s.n] === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`).join('')}</div>
      <label class="field inline"><span>Show delayed (open) tenders under</span><select class="inp inp-sm" data-s="mgmtDelayedTo"><option value="">— their stage’s status —</option>${list.map((m) => `<option value="${esc(m.id)}" ${S.get('mgmtDelayedTo') === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div></section>`;
  }
  function saveMgmt(list) { S.set('mgmtStatuses', list); }

  function render() {
    const host = TMD.$('#page-settings');
    const mod = TMD.modules[mapMod];
    const wb = mod.state.workbook;
    const sheets = wb ? wb.loadOrder : [];
    if (!mapSheet || sheets.indexOf(mapSheet) < 0) mapSheet = mod.state.activeSheets[0] || sheets[0];
    const sh = wb && wb.sheets[mapSheet];
    const months = TMD.MONTHS.map((m, i) => [i + 1, m]);
    const twb = TMD.state.workbook;
    host.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">System</div><h2>Settings</h2><p class="muted">Stored only in this browser on this device. Changes apply immediately.</p></div></div>
      <div class="settings-grid">
      <section class="card"><header class="card-h"><h3>General</h3></header><div class="form-grid">
        <label class="field"><span>Portal title</span><input class="inp" data-s="title" value="${esc(S.get('title'))}"></label>
        <label class="field"><span>Organisation</span><input class="inp" data-s="orgName" value="${esc(S.get('orgName'))}"></label>
        <div class="field"><span>Logo (local image, max 300 KB)</span><div class="logo-row"><img src="${esc(S.get('logo') || 'assets/logo-placeholder.svg')}" alt="Current logo" class="logo-prev"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif" id="logoFile" class="inp"><button class="btn subtle sm" data-act="logoClear">Reset</button></div></div>
        <label class="field"><span>Appearance</span>${sel('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']])}</label>
        <label class="field"><span>Date display format</span>${sel('dateFormat', [['dd/mm/yyyy', 'dd/mm/yyyy'], ['dd-mm-yyyy', 'dd-mm-yyyy'], ['dd-mmm-yyyy', 'dd-Mmm-yyyy'], ['dd mmm yyyy', 'dd Mmm yyyy'], ['yyyy-mm-dd', 'yyyy-mm-dd']])}</label>
        <label class="field"><span>Financial year starts in</span>${sel('fyStartMonth', months)}</label>
        <label class="field"><span>Currency symbol</span><input class="inp" data-s="currency" value="${esc(S.get('currency'))}" maxlength="4"></label>
        <label class="field"><span>Amount display</span>${sel('amountUnit', UNIT_OPTS)}</label>
        <label class="field"><span>Row density (both registers)</span>${sel('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])}</label>
        <label class="chk"><input type="checkbox" data-s="navExpanded" data-bool="1" ${S.get('navExpanded') ? 'checked' : ''}> Keep the sidebar expanded</label>
      </div></section>

      <section class="card"><header class="card-h"><div><h3>Tender Monitoring</h3><p class="card-sub">Defaults for the Tender register and amount units</p></div></header><div class="form-grid">
        <label class="field"><span>Default worksheet on import</span><input class="inp" data-s="defaultSheet" value="${esc(S.get('defaultSheet'))}" placeholder="e.g. Capex Modified" list="sheetList"><datalist id="sheetList">${(twb ? twb.sheetNames : []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label class="field"><span>Frozen data columns</span>${sel('frozenCols', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]))}</label>
        <label class="field"><span>Unit — Project Cost</span>${sel('unitProjectCost', UNIT_OPTS)}</label>
        <label class="field"><span>Unit — BE</span>${sel('unitBE', UNIT_OPTS)}</label>
        <label class="field"><span>Unit — PO/OLA cash outflow</span>${sel('unitCashOutflow', UNIT_OPTS)}</label>
        <label class="field"><span>Unit — Estimated cost</span>${sel('unitEstCost', UNIT_OPTS)}</label>
      </div><p class="muted small pad">Units apply only when a column header does not state its unit (e.g. “Estimated Cost (In Lacs)” is always read as lakh).</p></section>

      <section class="card wide"><header class="card-h"><div><h3>Tender alert thresholds</h3><p class="card-sub">Alerts are calculated offline from the system date.</p></div><button class="btn subtle sm" data-act="thrReset">Restore defaults</button></header><div class="form-grid">
        ${THRESHOLDS.map(([k, l]) => `<label class="field"><span>${esc(l)}</span><input class="inp" type="number" min="0" max="3650" data-s="${k}" data-num="1" value="${esc(S.get(k))}"></label>`).join('')}
      </div></section>

      ${mgmtEditor()}

      <section class="card wide cyber-accent"><header class="card-h"><div><h3>${TMD.icon('shield')} Cyber Security Audits</h3><p class="card-sub">Independent settings for the audit module</p></div></header><div class="form-grid">
        <label class="field"><span>Default audit worksheet on import</span><input class="inp" data-s="cyberDefaultSheet" value="${esc(S.get('cyberDefaultSheet') || '')}" placeholder="e.g. Observations"></label>
        <label class="field"><span>Frozen data columns</span>${sel('cyberFrozenCols', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]))}</label>
        <label class="field"><span>Target date approaching (days)</span>${sel('cyberThrTarget', [7, 15, 30, 60].map((n) => [n, String(n)]))}</label>
        <label class="field"><span>Long-open observation after (days)</span>${sel('cyberThrLongOpen', [30, 60, 90, 180, 365].map((n) => [n, String(n)]))}</label>
        <label class="chk"><input type="checkbox" data-s="cyberSuggest" data-bool="1" ${S.get('cyberSuggest') ? 'checked' : ''}> Suggested Classification — suggest a severity from the observation text when the source severity is blank (always marked “Suggested”, never saved to the source)</label>
      </div>
      <div class="form-grid two">
        <label class="field"><span>Cyber security domains (one per line)</span><textarea class="inp" rows="8" data-list="cyberDomains">${esc(TMD.cyberDomains().join('\n'))}</textarea></label>
        <label class="field"><span>Audit types / frameworks (one per line)</span><textarea class="inp" rows="8" data-list="cyberAuditTypes">${esc(TMD.cyberAuditTypes().join('\n'))}</textarea></label>
      </div><p class="muted small pad">Domains are used to recognise the source “Cyber Security Domain” and for the separate “Calculated Cyber Domain”. The application never claims a framework/clause violation unless it is recorded in the imported data or entered by you.</p></section>

      <section class="card wide"><header class="card-h"><div><h3>Column mapping</h3><p class="card-sub">Links source columns to standard fields. Source headers are never renamed; unmapped columns stay visible.</p></div>
        <div class="tb-group"><div class="tabs mod-tabs">${['tender', 'cyber'].map((m) => `<button class="tab ${mapMod === m ? 'active' : ''}" data-mapmod="${m}">${esc(TMD.modules[m].label)}</button>`).join('')}</div>
        ${sheets.length ? `<label class="tb-sel">Worksheet<select class="inp inp-sm" id="mapSheet">${sheets.map((n) => `<option ${n === mapSheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}</div></header>
        ${sh ? mappingEditor(sh, mod) : '<p class="muted pad">No worksheet loaded.</p>'}
      </section>

      <section class="card wide"><header class="card-h"><div><h3>Friendly column labels — ${esc(mod.label)}</h3><p class="card-sub">Optional display names (e.g. distinguish two “PR No” columns). Exports always keep the original headers.</p></div></header>
        ${sh ? `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>#</th><th>Original header</th><th>Internal key</th><th>Friendly label</th></tr></thead><tbody>${sh.headers.map((h, i) => `<tr><td>${i + 1}</td><td>${esc(h.display)}${h.dup ? ' <span class="tag tag-amber">duplicate</span>' : ''}${h.added ? ' <span class="tag">added</span>' : ''}</td><td><code>${esc(h.key)}</code></td><td><input class="inp inp-sm" data-friendly="${esc(h.key)}" value="${esc((sh.friendly || {})[h.key] || '')}" placeholder="${esc(h.display)}"></td></tr>`).join('')}</tbody></table></div>
        <div class="pad"><button class="btn" data-act="saveFriendly">Save labels</button></div>` : ''}
      </section>

      <section class="card"><header class="card-h"><h3>Local data &amp; privacy</h3></header>
        <div class="privacy-box">${TMD.icon('lock')}<div><strong>Offline Mode: data remains on this device.</strong><p class="muted small">Files are read with the browser’s File API and processed in memory. No uploads, APIs, CDNs, analytics or telemetry. A Content Security Policy blocks all network connections. Tender data and Cyber Audit data are stored separately.</p></div></div>
        <label class="chk"><input type="checkbox" data-s="persistence" data-bool="1" ${S.get('persistence') ? 'checked' : ''}> Keep local working copies and automatic recovery (IndexedDB)</label>
        <label class="chk"><input type="checkbox" data-s="csvProtect" data-bool="1" ${S.get('csvProtect') ? 'checked' : ''}> Protect CSV exports against formula injection by default</label>
        <div class="btn-col">
          <button class="btn" data-act="clearWork" data-mod="tender">${TMD.icon('database')}<span>Clear Tender working data</span></button>
          <button class="btn" data-act="clearWork" data-mod="cyber">${TMD.icon('shield')}<span>Clear Cyber Audit working data</span></button>
          <button class="btn" data-act="clearAudit">${TMD.icon('history')}<span>Clear audit / change history</span></button>
          <button class="btn danger" data-act="reset">${TMD.icon('trash')}<span>Reset application</span></button>
        </div>
      </section>

      <section class="card"><header class="card-h"><h3>About</h3></header><div class="pad small">
        <p><strong>${esc(S.get('title'))}</strong> — offline management portal with two independent modules: Tender Monitoring and Cyber Security Audit Monitoring.</p>
        <p>Bundled libraries (stored in <code>lib/</code>): SheetJS Community Edition ${esc(window.XLSX ? window.XLSX.version : '')} (Apache-2.0), Papa Parse 5.4.1 (MIT), Chart.js ${esc(window.Chart ? window.Chart.version : '')} (MIT).</p>
        <p class="muted">Session ID: <code>${esc(TMD.state.sessionId)}</code> · ${'indexedDB' in window ? 'IndexedDB available' : 'IndexedDB unavailable'}</p>
      </div></section>
      </div>`;
  }

  function mappingEditor(sh, mod) {
    const STD = mod.mapper.STD;
    const opts = (cur) => '<option value="">— not mapped —</option>' + sh.headers.map((h, i) => `<option value="${esc(h.key)}" ${cur === h.key ? 'selected' : ''}>${i + 1}: ${esc(h.display)}${h.dup ? ' [' + esc(h.key) + ']' : ''}</option>`).join('');
    return `<p class="muted small pad">Recognised as: <strong>${esc(sh.sheetType)}</strong>${sh.mappingSaved ? ' · using a saved custom mapping' : ' · automatic mapping'}</p>
      <div class="map-grid">${Object.keys(STD).map((f) => `<label class="field ${sh.mapping[f] ? 'active' : ''}"><span>${esc(STD[f].label)} <code class="muted">${f}</code></span><select class="inp inp-sm" data-map="${f}">${opts(sh.mapping[f])}</select></label>`).join('')}</div>
      <div class="pad"><button class="btn primary" data-act="saveMap">Apply mapping</button> <button class="btn subtle" data-act="autoMap">Reset to automatic</button></div>`;
  }
  const keyPrefix = (kind) => (mapMod === 'tender' ? kind + '.' : kind + '.' + mapMod + '.');

  async function clearWork(modId) {
    const mod = TMD.modules[modId];
    const ok = await TMD.confirm(`Clear ${mod.label} working data`, `Delete the ${mod.label} working copy and recovery data stored in this browser?\nThe demonstration data will be loaded for this module only. Your files on disk are not affected.`, 'Clear', 'danger');
    if (!ok) return;
    await TMD.idb.del(mod.slots.working); await TMD.idb.del(mod.slots.recovery); await TMD.idb.del(mod.slots.meta);
    if (mod.state.mode === 'edit') mod.edit.forceExit();
    mod.loadDemo();
    TMD.toast(`${mod.label}: local working data cleared. Demonstration data loaded.`, 'success');
  }
  async function clearAudit() {
    const ok = await TMD.confirm('Clear audit / change history', 'Delete all local audit-log and change-history entries for BOTH modules? Consider exporting them to CSV first.', 'Clear history', 'danger');
    if (!ok) return;
    Object.values(TMD.modules).forEach((m) => { m.audit.clear(); m.audit.log({ action: 'AUDIT_CLEARED', field: 'History cleared by user' }); if (S.get('persistence') && m.state.workbook) TMD.saveWorkingCopy(m.slots.working, m); });
    TMD.toast('Audit / change history cleared.', 'success');
    render();
  }
  async function resetApp() {
    const ok = await TMD.confirm('Reset application', 'This removes ALL locally stored data for this application on this device (both modules): settings, layouts, presets, mappings, working copies, recovery data and history.\nYour Excel/CSV files on disk are not affected.', 'Reset everything', 'danger');
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
        if (['frozenCols', 'fyStartMonth', 'cyberFrozenCols', 'cyberThrTarget', 'cyberThrLongOpen'].indexOf(t.dataset.s) >= 0) v = +v;
        S.set(t.dataset.s, v);
        if (t.dataset.s === 'persistence' && !v) TMD.toast('Local persistence disabled. Existing working copies are kept until you clear them.', 'info');
        if (t.dataset.s === 'mgmtDelayedTo') render();
        return;
      }
      if (t.dataset.list) { const v = t.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); S.set(t.dataset.list, v.length ? v : null); TMD.toast('List saved.', 'success', 1500); return; }
      const list = TMD.deepClone(TMD.mgmtStatuses());
      if (t.dataset.mgname !== undefined) { list[+t.dataset.mgname].name = t.value.trim() || list[+t.dataset.mgname].name; saveMgmt(list); return; }
      if (t.dataset.mgtone !== undefined) { list[+t.dataset.mgtone].tone = t.value; saveMgmt(list); render(); return; }
      if (t.dataset.mgstage !== undefined) {
        const n = +t.dataset.mgstage;
        list.forEach((m) => { m.stages = m.stages.filter((x) => x !== n); });
        const target = list.find((m) => m.id === t.value); if (target) target.stages.push(n);
        saveMgmt(list); return;
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
    host.addEventListener('input', TMD.debounce((e) => { const t = e.target; if (t.dataset.s && t.tagName === 'INPUT' && t.type === 'text') S.set(t.dataset.s, t.value); }, 400));
    host.addEventListener('click', (e) => {
      const mm = e.target.closest('[data-mapmod]');
      if (mm) { mapMod = mm.dataset.mapmod; mapSheet = null; render(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      const mod = TMD.modules[mapMod];
      const sh = mod.state.workbook && mod.state.workbook.sheets[mapSheet];
      if (a === 'logoClear') { S.set('logo', ''); render(); }
      if (a === 'thrReset') { const d = {}; THRESHOLDS.forEach(([k]) => { d[k] = S.DEFAULTS[k]; }); S.setMany(d); render(); TMD.toast('Thresholds restored.', 'info'); }
      if (a === 'mgmtAdd') { const list = TMD.deepClone(TMD.mgmtStatuses()); list.push({ id: 'm' + Date.now().toString(36), name: 'New status', tone: 'blue', stages: [] }); saveMgmt(list); render(); }
      if (a === 'mgmtReset') { S.set('mgmtStatuses', null); S.set('mgmtDelayedTo', 'attention'); render(); TMD.toast('Management statuses restored.', 'info'); }
      const del = e.target.closest('[data-mgdel]');
      if (del) { const list = TMD.deepClone(TMD.mgmtStatuses()); const [rm] = list.splice(+del.dataset.mgdel, 1); if (list.length) list[list.length - 1].stages = list[list.length - 1].stages.concat(rm.stages); saveMgmt(list); render(); }
      if (a === 'saveMap' && sh) {
        const m = {};
        TMD.$$('[data-map]', host).forEach((s) => { if (s.value) m[s.dataset.map] = s.value; });
        TMD.applyMapping(sh, m);
        sh.mappingSaved = true;
        TMD.ls.set(keyPrefix('mapping') + TMD.sheetSignature(sh.name, sh.headers.filter((h) => !h.added)), m);
        mod.setActiveSheets(mod.state.activeSheets.slice());
        TMD.toast('Column mapping applied and saved for this worksheet layout.', 'success');
        render();
      }
      if (a === 'autoMap' && sh) {
        TMD.ls.remove(keyPrefix('mapping') + TMD.sheetSignature(sh.name, sh.headers.filter((h) => !h.added)));
        const auto = mod.mapper.autoMapping(sh.headers);
        sh.headers.filter((h) => h.added && !h.userAdded).forEach((h) => { const f = (mod.mapper.added || []).find((x) => x.label === h.label); if (f) auto[f.std] = h.key; });
        TMD.applyMapping(sh, auto);
        sh.mappingSaved = false;
        mod.setActiveSheets(mod.state.activeSheets.slice());
        TMD.toast('Automatic mapping restored.', 'info');
        render();
      }
      if (a === 'saveFriendly' && sh) {
        const f = {};
        TMD.$$('[data-friendly]', host).forEach((i) => { if (i.value.trim()) f[i.dataset.friendly] = i.value.trim(); });
        sh.friendly = f;
        TMD.ls.set(keyPrefix('friendly') + TMD.sheetSignature(sh.name, sh.headers.filter((h) => !h.added)), f);
        mod.setActiveSheets(mod.state.activeSheets.slice());
        TMD.toast('Friendly labels saved.', 'success');
      }
      if (a === 'clearWork') clearWork(b.dataset.mod);
      if (a === 'clearAudit') clearAudit();
      if (a === 'reset') resetApp();
    });
  };

  /* ---------------- Audit Log page (per module) ---------------- */
  const AV = { action: '', sheet: '', q: '', mod: 'tender' };
  function renderAudit() {
    const host = TMD.$('#page-audit');
    const mod = TMD.modules[AV.mod];
    const all = mod.audit.all();
    const q = AV.q.trim().toLowerCase();
    const list = all.filter((e) => (!AV.action || e.action === AV.action) && (!AV.sheet || e.sheet === AV.sheet) && (!q || `${e.recordLabel} ${e.field} ${e.oldValue} ${e.newValue} ${e.sheet}`.toLowerCase().indexOf(q) >= 0)).slice().reverse();
    const actions = Array.from(new Set(all.map((e) => e.action))).sort();
    const sheets = Array.from(new Set(all.map((e) => e.sheet).filter(Boolean))).sort();
    host.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">System</div><h2>Audit Log</h2><p class="muted">Local log of imports, edits, overrides, saves and exports. Stored in this browser; it is <strong>not</strong> tamper-proof or equivalent to an enterprise audit system.</p>
        <div class="tabs mod-tabs">${['tender', 'cyber'].map((m) => `<button class="tab ${AV.mod === m ? 'active' : ''}" data-amod="${m}">${TMD.icon(m === 'cyber' ? 'shield' : 'file')} ${esc(TMD.modules[m].label)} <span class="tag">${TMD.modules[m].audit.all().length}</span></button>`).join('')}</div></div>
        <div class="page-actions"><button class="btn subtle" data-a="csv">${TMD.icon('download')}<span>Export CSV</span></button><a class="btn subtle" href="#settings">${TMD.icon('settings')}<span>Clear in Settings</span></a></div></div>
      <div class="toolbar-row"><div class="tb-group">
        <label class="tb-sel">Action<select class="inp inp-sm" data-av="action"><option value="">All</option>${actions.map((a) => `<option ${AV.action === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
        <label class="tb-sel">Worksheet<select class="inp inp-sm" data-av="sheet"><option value="">All</option>${sheets.map((a) => `<option ${AV.sheet === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
        <input class="inp inp-sm" type="search" data-av="q" value="${esc(AV.q)}" placeholder="Search log…" aria-label="Search audit log"></div><div class="muted">${list.length} of ${all.length} entries</div></div>
      <section class="card"><div class="table-wrap"><table class="data-table hover"><thead><tr><th>Local timestamp</th><th>Action</th><th>Worksheet</th><th class="num">Row</th><th>Record</th><th>Field</th><th>Previous value</th><th>New value</th><th>Session</th></tr></thead><tbody>
      ${list.slice(0, 2000).map((e) => `<tr ${e.recordId ? `data-rec="${esc(e.recordId)}"` : ''}><td class="nowrap">${esc(new Date(e.ts).toLocaleString('en-IN'))}</td><td><span class="tag">${esc(e.action)}</span></td><td>${esc(e.sheet)}</td><td class="num">${esc(e.rowNum)}</td><td>${esc(e.recordLabel || '')}</td><td>${esc(e.field)}</td><td class="wrap">${esc(e.oldValue)}</td><td class="wrap">${esc(e.newValue)}</td><td class="small muted">${esc(e.sessionId)}</td></tr>`).join('') || '<tr><td colspan="9" class="pad muted">No entries.</td></tr>'}
      </tbody></table></div></section>`;
    host._list = list;
  }
  TMD.auditPage = { render: renderAudit, setModule: (m) => { AV.mod = m; } };
  TMD.initAuditPage = function () {
    const host = TMD.$('#page-audit');
    host.addEventListener('change', (e) => { const k = e.target.dataset.av; if (k && k !== 'q') { AV[k] = e.target.value; renderAudit(); } });
    host.addEventListener('input', TMD.debounce((e) => { if (e.target.dataset.av === 'q') { AV.q = e.target.value; const pos = e.target.selectionStart; renderAudit(); const i = host.querySelector('[data-av="q"]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 250));
    host.addEventListener('click', (e) => {
      const t = e.target.closest('[data-amod]'); if (t) { AV.mod = t.dataset.amod; AV.action = ''; AV.sheet = ''; renderAudit(); return; }
      if (e.target.closest('[data-a="csv"]')) {
        const mod = TMD.modules[AV.mod];
        TMD.downloadText(mod.audit.toCsv(host._list ? host._list.slice().reverse() : null), `${AV.mod === 'cyber' ? 'Cyber_Audit_Change_Log' : 'Audit_Log'}_${TMD.stamp()}.csv`);
        return;
      }
      const r = e.target.closest('[data-rec]');
      if (r) { const mod = TMD.modules[AV.mod]; const rec = mod.state.records.find((x) => x.id === r.dataset.rec); if (rec) mod.openDetails(rec, { section: 'history' }); }
    });
  };
})();
