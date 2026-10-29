/* =====================================================================
 * app.js — bootstrapping, routing, header, import dialog, drag & drop,
 * theme, local working-copy restore and automatic recovery.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const PAGES = ['dashboard', 'register', 'timeline', 'analytics', 'alerts', 'quality', 'audit', 'settings'];
  const scrollPos = {};

  /* ---------------- Theme ---------------- */
  function applyTheme() {
    const t = TMD.settings.get('theme');
    const dark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const b = TMD.$('#btnTheme');
    b.innerHTML = TMD.icon(dark ? 'sun' : 'moon');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (window.Chart) {
      window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      window.Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();
    }
  }

  /* ---------------- Header ---------------- */
  function updateHeader() {
    const st = TMD.state;
    const wb = st.workbook;
    TMD.$('#hdrTitle').textContent = TMD.settings.get('title') || 'Tender Monitoring Dashboard';
    document.title = TMD.settings.get('title') || 'Tender Monitoring Dashboard';
    TMD.$('#hdrLogo').src = TMD.settings.get('logo') || 'assets/logo-placeholder.svg';
    if (!wb) { TMD.$('#hdrMeta').textContent = 'No data loaded'; return; }
    TMD.$('#hdrMeta').innerHTML = `<span class="meta-item" title="Loaded file: ${esc(wb.fileName)}">${TMD.icon('file')}${esc(wb.fileName)}</span>
      <button class="meta-item linklike" id="hdrSheets" title="Selected worksheet(s): ${esc(st.activeSheets.join(' + '))} — click to change">${TMD.icon('layers')}${esc(st.activeSheets.join(' + '))}</button>
      <span class="meta-item" title="Loaded records">${TMD.icon('rows')}${TMD.fmtInt(st.records.length)} records</span>
      <span class="meta-item" title="Last local import">${TMD.icon('clock')}Imported ${esc(TMD.fmtDateTime(wb.importedAt))}</span>`;
    TMD.$('#demoBanner').hidden = !wb.isDemo;
    const ac = TMD.alertCount();
    TMD.$('#navAlertCount').textContent = ac ? String(ac) : '';
    const dq = TMD.dqCount();
    TMD.$('#navDqCount').textContent = dq ? String(dq) : '';
    TMD.$('#navSheets').innerHTML = `${TMD.icon('database')} ${esc(wb.loadOrder.length)} worksheet(s) loaded`;
  }

  /* ---------------- Routing ---------------- */
  TMD.go = function (page) {
    if (('#' + page) === location.hash) route(); else location.hash = page;
  };
  function route() {
    const p = (location.hash || '#dashboard').slice(1);
    const page = PAGES.indexOf(p) >= 0 ? p : 'dashboard';
    const main = TMD.$('#main');
    scrollPos[TMD.state.page] = main.scrollTop;
    if (TMD.state.page === 'register' && page !== 'register') document.body.classList.remove('table-full');
    TMD.state.page = page;
    TMD.$$('.page').forEach((s) => { s.hidden = s.id !== 'page-' + page; });
    TMD.$$('.side-nav a').forEach((a) => { const on = a.dataset.page === page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.dataset.page = page;
    TMD.$('#filterBar').hidden = page === 'settings' || page === 'audit';
    renderPage(page, true);
    main.scrollTop = scrollPos[page] || 0;
  }
  function renderPage(page, full) {
    if (!TMD.state.workbook) return;
    switch (page) {
      case 'dashboard': if (full) TMD.dashboard.render(); else TMD.dashboard.update(); break;
      case 'register': if (full) TMD.table.render(TMD.$('#page-register')); else TMD.table.refresh(false); break;
      case 'timeline': TMD.timeline.render(); break;
      case 'analytics': TMD.analytics.render(); break;
      case 'alerts': TMD.alertsPage.render(); break;
      case 'quality': TMD.dataQuality.render(); break;
      case 'audit': TMD.auditPage.render(); break;
      case 'settings': TMD.settingsPage.render(); break;
      default: break;
    }
  }
  let pending = 0;
  function scheduleRender() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const main = TMD.$('#main');
      const y = main.scrollTop;
      if (['settings', 'audit'].indexOf(TMD.state.page) < 0) renderPage(TMD.state.page, false);
      main.scrollTop = y; // no page jumping when filters change
      updateHeader();
    });
  }

  /* ---------------- Import dialog ---------------- */
  function openImport() {
    const body = TMD.el('div');
    body.innerHTML = `
      <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Choose a file to import">
        ${TMD.icon('upload', 'dz-ico')}
        <div class="dz-title">Drag &amp; drop an Excel or CSV file here</div>
        <div class="muted">.xlsx · .xls · .csv — read locally in your browser, never uploaded</div>
        <button class="btn primary" id="dzBrowse">Browse Files…</button>
      </div>
      <div class="import-notes">
        <div>${TMD.icon('lock')} The file is processed only on this computer. The original file is never modified.</div>
        <div>${TMD.icon('layers')} For workbooks you will choose the worksheet(s); for CSV you will see a preview and can pick the header row and delimiter.</div>
      </div>
      <div class="import-alt"><button class="btn subtle" id="dzDemo">${TMD.icon('database')}<span>Load demonstration data</span></button>
      <button class="btn subtle" id="dzReport" ${TMD.state.workbook ? '' : 'disabled'}>${TMD.icon('file')}<span>View last import report</span></button></div>`;
    let closeFn = null;
    TMD.modal({
      title: 'Import data', body, wide: true, buttons: [{ label: 'Close', value: null }],
      onOpen: (dlg, close) => {
        closeFn = close;
        const dz = dlg.querySelector('#dropzone');
        const pick = () => TMD.$('#fileInput').click();
        dlg.querySelector('#dzBrowse').addEventListener('click', (e) => { e.stopPropagation(); pick(); });
        dz.addEventListener('click', pick);
        dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); TMD.$('#dropOverlay').hidden = true; const f = e.dataTransfer.files[0]; close(null); if (f) TMD.importFile(f); });
        dlg.querySelector('#dzDemo').addEventListener('click', async () => {
          close(null);
          if (TMD.state.mode === 'edit' && TMD.state.dirty) { const ok = await TMD.confirm('Unsaved changes', 'Loading demonstration data will replace your unsaved edits. Continue?', 'Load demo', 'danger'); if (!ok) return; TMD.editMode.forceExit(); }
          TMD.loadDemo();
          TMD.toast('Demonstration data loaded.', 'info');
        });
        dlg.querySelector('#dzReport').addEventListener('click', () => { close(null); TMD.showImportReport(); });
        TMD._closeImport = close;
      },
    });
    return closeFn;
  }

  /* ---------------- Startup data ---------------- */
  async function installPayload(p) {
    TMD.audit.load(p.audit || []);
    const wb = p.workbook;
    Object.keys(wb.sheets).forEach((n) => { wb.sheets[n].rows.forEach((r) => { r.followUps = r.followUps || []; r.editedKeys = r.editedKeys || []; }); });
    wb.raw = wb.raw || {}; wb.original = wb.original || {};
    TMD.installWorkbook(wb, p.activeSheets);
  }
  async function startupData() {
    let restored = false;
    if (TMD.settings.get('persistence')) {
      try {
        const meta = await TMD.idb.get('recoveryMeta');
        const rec = meta && meta.dirty ? await TMD.idb.get('recovery') : null;
        if (rec && rec.workbook) {
          const ok = await TMD.modal({
            title: 'Recover unsaved changes?',
            body: `<p>An Edit Mode session with unsaved changes was found (last autosave ${esc(TMD.fmtDateTime(meta.at))}, file <strong>${esc(rec.workbook.fileName)}</strong>).</p><p>Recover these changes? They will become the local working copy. Choose “Discard” to open the last saved working copy instead.</p>`,
            buttons: [{ label: 'Discard recovery data', value: false, kind: 'danger' }, { label: 'Recover changes', value: true, kind: 'primary' }], dismissValue: false,
          });
          await TMD.idb.del('recovery'); await TMD.idb.del('recoveryMeta');
          if (ok) {
            await installPayload(rec);
            TMD.audit.log({ action: 'RECOVERY', field: 'Unsaved Edit Mode changes recovered', newValue: TMD.fmtDateTime(meta.at) });
            await TMD.saveWorkingCopy('working');
            TMD.toast('Unsaved changes recovered and saved as the local working copy.', 'success', 5000);
            restored = true;
          }
        }
        if (!restored) {
          const w = await TMD.idb.get('working');
          if (w && w.workbook) {
            await installPayload(w);
            TMD.toast(`Restored local working copy (${w.workbook.fileName}) saved ${TMD.fmtDateTime(w.savedAt)}.`, 'info', 4500);
            restored = true;
          }
        }
      } catch (e) { console.warn('Could not restore local data', e); }
    }
    if (!restored) TMD.loadDemo();
  }

  /* ---------------- Init ---------------- */
  async function init() {
    const d = new Date();
    TMD.state.sessionId = `S-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${TMD.randomHex(3)}`;
    TMD.applyIcons();
    applyTheme();
    TMD.editMode.setBadge();
    TMD.initFilters(); TMD.initDetails(); TMD.initDashboard(); TMD.initTimeline(); TMD.initAnalytics();
    TMD.initAlerts(); TMD.initDataQuality(); TMD.initSettings(); TMD.initAuditPage();

    // Header buttons
    TMD.$('#btnImport').addEventListener('click', openImport);
    TMD.$('#btnRefresh').addEventListener('click', () => { TMD.recalcAll(); TMD.filters.apply(); TMD.toast(`Recalculated ${TMD.state.records.length} records using system date ${TMD.fmtDate(TMD.today())}.`, 'success'); });
    TMD.$('#btnEdit').addEventListener('click', () => TMD.editMode.enter());
    TMD.$('#btnSave').addEventListener('click', () => TMD.editMode.saveMenu());
    TMD.$('#btnCancelEdit').addEventListener('click', () => TMD.editMode.cancel());
    TMD.$('#btnExport').addEventListener('click', (e) => TMD.exporter.exportMenu(e.currentTarget));
    TMD.$('#btnExport').setAttribute('data-pop-anchor', '');
    TMD.$('#btnSettings').addEventListener('click', () => TMD.go('settings'));
    TMD.$('#btnTheme').addEventListener('click', () => { TMD.settings.set('theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
    TMD.$('#navToggle').innerHTML = TMD.icon('menu');
    TMD.$('#navToggle').addEventListener('click', () => { document.body.classList.toggle('nav-collapsed'); TMD.ls.set('navCollapsed', document.body.classList.contains('nav-collapsed')); setTimeout(() => { TMD.table.resize(); TMD.charts.refresh(); }, 220); });
    if (TMD.ls.get('navCollapsed', false)) document.body.classList.add('nav-collapsed');
    TMD.$('#hdrMeta').addEventListener('click', (e) => { if (e.target.closest('#hdrSheets')) TMD.manageSheets(); });

    // File input + global drag & drop
    TMD.$('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (TMD._closeImport) TMD._closeImport(null); if (f) TMD.importFile(f); });
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; TMD.$('#dropOverlay').hidden = false; });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) TMD.$('#dropOverlay').hidden = true; });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth = 0; TMD.$('#dropOverlay').hidden = true;
      const f = e.dataTransfer.files[0];
      if (TMD._closeImport) TMD._closeImport(null);
      if (f) TMD.importFile(f);
    });

    // Events
    TMD.on('data', () => { TMD.table.onData(); updateHeader(); });
    TMD.on('filtered', scheduleRender);
    TMD.on('changed', () => { updateHeader(); if (TMD.state.page === 'audit') TMD.auditPage.render(); });
    TMD.on('audit', () => { if (TMD.state.page === 'audit') TMD.auditPage.render(); });
    TMD.on('columns', () => { TMD.table.onData(); if (TMD.state.page === 'register') TMD.table.refresh(true); });
    TMD.on('mode', () => {
      document.body.classList.toggle('mode-edit', TMD.state.mode === 'edit');
      if (TMD.state.page === 'register') TMD.table.refresh(true);
    });
    const RECALC_KEYS = /^(thr|unit|fyStartMonth|dateFormat)/;
    TMD.on('settings', (e) => {
      const keys = e.many ? Object.keys(e.many) : e.reset ? ['all'] : [e.key];
      if (keys.some((k) => k === 'theme' || k === 'all')) { applyTheme(); TMD.charts.restyle(); }
      if (keys.some((k) => /title|logo|orgName/.test(k))) updateHeader();
      if (keys.some((k) => RECALC_KEYS.test(k) || k === 'all')) { TMD.recalcAll(); TMD.filters.apply(); }
      if (keys.some((k) => /density|frozenCols/.test(k)) && TMD.state.page === 'register') TMD.table.refresh(true);
      if (keys.some((k) => k === 'amountUnit' || k === 'currency')) { TMD.charts.restyle(); scheduleRender(); }
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (TMD.settings.get('theme') === 'system') { applyTheme(); TMD.charts.restyle(); } });
    window.addEventListener('hashchange', route);

    // Midnight rollover: recalculate when the date changes while the app stays open
    let lastDay = TMD.isoDate(TMD.today());
    setInterval(() => { const now = TMD.isoDate(TMD.today()); if (now !== lastDay) { lastDay = now; TMD.recalcAll(); TMD.filters.apply(); } }, 60000);

    await startupData();
    route();
    updateHeader();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
