/* =====================================================================
 * app.js — bootstrapping, module-aware routing, compact header, sidebar
 * rail, floating edit control, import dialog, drag & drop, theme, local
 * working-copy restore and automatic recovery for every module.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  // page → owning module (null = shared/system page)
  const PAGE_MOD = {
    home: null, dashboard: 'tender', register: 'tender', timeline: 'tender', analytics: 'tender', reports: 'tender', alerts: 'tender',
    cyber: 'cyber', 'cyber-register': 'cyber', 'cyber-actions': 'cyber', 'cyber-analytics': 'cyber', 'cyber-alerts': 'cyber',
    quality: null, audit: null, settings: null,
  };
  const PAGES = Object.keys(PAGE_MOD);
  const NO_FILTERS = ['home', 'quality', 'audit', 'settings', 'reports'];
  const scrollPos = {};
  let lastMod = 'tender';

  TMD.activeModule = function () { return TMD.modules[PAGE_MOD[TMD.state.page] || lastMod] || TMD.modules.tender; };
  TMD.pageModule = (page) => PAGE_MOD[page] || null;

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

  const narrow = () => window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  function setNav(open, persist) {
    document.body.classList.toggle('nav-expanded', open);
    TMD.$('#navToggle').setAttribute('aria-expanded', String(open));
    TMD.$('#navScrim').hidden = !(open && narrow());
    if (persist && !narrow()) TMD.settings.set('navExpanded', open);
    setTimeout(() => { const m = TMD.activeModule(); if (m.grid && m.grid.resize) m.grid.resize(); TMD.charts.refresh(); }, 220);
  }

  function bindSidebarHover() {
    const sideNav = TMD.$('#sideNav');
    if (!sideNav) return;
    sideNav.addEventListener('pointerenter', () => {
      if (!narrow()) setNav(true, false);
    });
    sideNav.addEventListener('pointerleave', () => {
      if (!narrow()) setNav(false, false);
    });
  }

  function updateHeader() {
    const page = TMD.state.page;
    const pm = PAGE_MOD[page];
    const M = TMD.activeModule();
    const st = M.state;
    const wb = st.workbook;
    const appTitle = TMD.settings.get('title') || 'Tender Monitoring Dashboard';
    const title = pm === 'cyber' ? 'Cyber Security Audit Monitoring' : pm === 'tender' ? appTitle : page === 'home' ? (TMD.settings.get('orgName') || appTitle) : (TMD.$('#page-' + page).dataset.title || appTitle);
    TMD.$('#hdrTitle').textContent = title;
    document.title = `${TMD.$('#page-' + page).dataset.title || 'Home'} · ${appTitle}`;
    TMD.$('#hdrLogo').src = TMD.settings.get('logo') || 'assets/logo-placeholder.svg';
    document.body.classList.toggle('mod-cyber', pm === 'cyber');
    TMD.$('#privacyPill .pp-text').textContent = pm === 'cyber' ? 'Offline Mode • Audit data remains on this device' : 'Offline Mode • Data remains on this device';

    const meta = TMD.$('#hdrMeta');
    if (!pm) meta.innerHTML = page === 'home' ? '<span class="meta-item">Overview</span>' : `<span class="meta-item">${esc(TMD.$('#page-' + page).dataset.title || '')}</span>`;
    else if (!wb) meta.innerHTML = '<span class="meta-item">No data loaded</span>';
    else {
      meta.innerHTML = `<button class="meta-item linklike" id="hdrSheets" title="File: ${esc(wb.fileName)} · worksheet(s): ${esc(st.activeSheets.join(' + '))} · imported ${esc(TMD.fmtDateTime(wb.importedAt || new Date()))}">${TMD.icon('database')}<span class="mi-file">${esc(wb.fileName)}</span></button>${wb.isDemo ? '<span class="tag tag-amber">Demo data</span>' : ''}`;
    }
    const banner = TMD.$('#demoBanner');
    banner.hidden = !(pm && wb && wb.isDemo);
    if (!banner.hidden) banner.innerHTML = `<span><strong>Demonstration data</strong> — ${pm === 'cyber' ? 'no Cyber Security Audit file has been loaded yet.' : 'the original tender workbook has not been imported yet.'}</span><button class="btn subtle tiny" id="bannerImport">Import data</button>`;

    const setCount = (id, n) => { const e = TMD.$(id); if (e) e.textContent = n ? String(n) : ''; };
    setCount('#navAlertCount', TMD.alertCount());
    setCount('#navDqCount', TMD.dqCount('tender') + TMD.dqCount('cyber'));
    setCount('#navCyberAlertCount', TMD.cyberAlertCount());
    setCount('#navCyberActCount', TMD.cyber.state.records.filter((r) => r.calc && r.calc.open && r.calc.overdue).length);
    const t = TMD.state.workbook, c = TMD.cyber.state.workbook;
    TMD.$('#navSheets').innerHTML = `${TMD.icon('database')} Tender: ${t ? esc(t.loadOrder.length) + ' sheet(s)' : '—'} · Audit: ${c ? esc(c.loadOrder.length) + ' sheet(s)' : '—'}`;
    updateFab();
  }

  function updateFab() {
    const fab = TMD.$('#editFab');
    const pm = PAGE_MOD[TMD.state.page];
    if (!pm || !TMD.modules[pm].state.workbook) { fab.hidden = true; return; }
    fab.hidden = false;
    const M = TMD.modules[pm];
    const st = M.state, ed = M.edit;
    const editing = st.mode === 'edit';
    document.body.classList.toggle('mode-edit', editing);
    fab.classList.toggle('editing', editing);
    fab.classList.toggle('dirty', editing && st.dirty);
    if (!editing) {
      fab.innerHTML = `<button class="fab-main" data-f="unlock" title="Unlock editing for ${esc(M.label)}">${TMD.icon('lock')}<span><strong>View only</strong><small>Click to unlock editing</small></span></button>`;
      return;
    }
    fab.innerHTML = `<div class="fab-status">${TMD.icon('unlock')}<span><strong>Editing ${esc(M.noun === 'tender' ? 'tenders' : 'audit data')}</strong><small>${st.dirty ? 'Unsaved changes' : 'All changes saved'}</small></span></div>
      <div class="fab-tools">
        <button class="fab-btn" data-f="undo" ${ed.canUndo() ? '' : 'disabled'} title="Undo (Ctrl+Z)" aria-label="Undo">${TMD.icon('undo')}</button>
        <button class="fab-btn" data-f="redo" ${ed.canRedo() ? '' : 'disabled'} title="Redo (Ctrl+Y)" aria-label="Redo">${TMD.icon('redo')}</button>
        <button class="fab-btn primary" data-f="save" title="Save (Ctrl+S)">${TMD.icon('save')}<span>Save</span></button>
        <button class="fab-btn" data-f="lock" title="Lock editing (return to View Mode)">${TMD.icon('lock')}<span>Lock</span></button>
      </div>`;
  }

  TMD.go = function (page) {
    if (('#' + page) === location.hash) route(); else location.hash = page;
  };
  function route() {
    const p = (location.hash || '#home').slice(1);
    const page = PAGES.indexOf(p) >= 0 ? p : 'home';
    const main = TMD.$('#main');
    scrollPos[TMD.state.page] = main.scrollTop;
    if (TMD.state.page !== page) document.body.classList.remove('table-full');
    TMD.state.page = page;
    if (PAGE_MOD[page]) lastMod = PAGE_MOD[page];
    TMD.$$('.page').forEach((s) => { s.hidden = s.id !== 'page-' + page; });
    TMD.$$('.side-nav a').forEach((a) => { const on = a.dataset.page === page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.dataset.page = page;
    const pm = PAGE_MOD[page];
    TMD.$('#filterBar').hidden = !pm || NO_FILTERS.indexOf(page) >= 0;
    TMD.$('#fbTender').hidden = pm !== 'tender';
    TMD.$('#fbCyber').hidden = pm !== 'cyber';
    if (narrow()) setNav(false);
    renderPage(page, true);
    updateHeader();
    main.scrollTop = scrollPos[page] || 0;
  }
  function renderPage(page, full) {
    const pm = PAGE_MOD[page];
    if (pm && !TMD.modules[pm].state.workbook) { emptyState(page, pm); return; }
    switch (page) {
      case 'home': TMD.home.render(); break;
      case 'dashboard': if (full) TMD.dashboard.render(); else TMD.dashboard.update(); break;
      case 'register': if (full) TMD.table.render(TMD.$('#page-register')); else TMD.table.refresh(false); break;
      case 'timeline': TMD.timeline.render(); break;
      case 'analytics': TMD.analytics.render(); break;
      case 'reports': if (full) TMD.reports.render(); break;
      case 'alerts': TMD.alertsPage.render(); break;
      case 'cyber': if (full) TMD.cyber.dashboard.render(); else TMD.cyber.dashboard.update(); break;
      case 'cyber-register': if (full) TMD.cyber.grid.render(TMD.$('#page-cyber-register')); else TMD.cyber.grid.refresh(false); break;
      case 'cyber-actions': TMD.cyber.tracker.render(); break;
      case 'cyber-analytics': TMD.cyber.analytics.render(); break;
      case 'cyber-alerts': TMD.cyber.alertsPage.render(); break;
      case 'quality': TMD.dataQuality.render(); break;
      case 'audit': TMD.auditPage.render(); break;
      case 'settings': TMD.settingsPage.render(); break;
      default: break;
    }
  }
  function emptyState(page, pm) {
    const M = TMD.modules[pm];
    TMD.$('#page-' + page).innerHTML = `<div class="empty-state big">${TMD.icon(pm === 'cyber' ? 'shield' : 'file')}<h2>No ${esc(M.label)} data loaded</h2>
      <p class="muted">Import an Excel (.xlsx / .xls) or CSV file. It is read locally and never uploaded.</p>
      <div class="row-btns"><button class="btn primary" data-empty-imp="${pm}">${TMD.icon('upload')}<span>Import data</span></button><button class="btn subtle" data-empty-demo="${pm}">${TMD.icon('database')}<span>Load demo</span></button></div></div>`;
  }
  const pendingPages = new Set();
  let pending = 0;
  function scheduleRender(modId) {
    pendingPages.add(modId || '*');
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const mods = new Set(pendingPages); pendingPages.clear();
      const page = TMD.state.page;
      const pm = PAGE_MOD[page];
      const main = TMD.$('#main');
      const y = main.scrollTop;
      if (page === 'home' || (pm && (mods.has('*') || mods.has(pm)))) renderPage(page, false);
      main.scrollTop = y;
      updateHeader();
    });
  }

  async function chooseModule() {
    return TMD.modal({
      title: 'Import into which module?',
      body: `<p>Each module keeps its own data source. Importing into one never replaces the other.</p>
        <div class="choice-list"><div class="choice"><strong>${TMD.icon('file')} Tender Monitoring</strong><p>Tender tracker workbooks (CAPEX / REVEX sheets, PR, CRFQ, PO / OLA…)</p></div>
        <div class="choice"><strong>${TMD.icon('shield')} Cyber Security Audits</strong><p>Audit observation trackers (observations, severity, owner, target dates, closure…)</p></div></div>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Cyber Security Audits', value: 'cyber' }, { label: 'Tender Monitoring', value: 'tender', kind: 'primary' }],
    });
  }
  let importMod = 'tender';
  TMD.openImport = async function (modId) {
    let mid = modId || PAGE_MOD[TMD.state.page];
    if (!mid) mid = await chooseModule();
    if (!mid) return;
    importMod = mid;
    const M = TMD.modules[mid];
    const body = TMD.el('div');
    body.innerHTML = `
      <div class="import-for ${mid}">${TMD.icon(mid === 'cyber' ? 'shield' : 'file')} Importing into <strong>${esc(M.label)}</strong></div>
      <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Choose a file to import">
        ${TMD.icon('upload', 'dz-ico')}
        <div class="dz-title">Drag &amp; drop an Excel or CSV file here</div>
        <div class="muted">.xlsx · .xls · .csv — read locally in your browser, never uploaded</div>
        <button class="btn primary" id="dzBrowse">Browse Files…</button>
      </div>
      <div class="import-notes">
        <div>${TMD.icon('lock')} The file is processed only on this computer. The original file is never modified.</div>
        <div>${TMD.icon('layers')} For workbooks you choose the worksheet(s); for CSV you see a preview and can pick the header row and delimiter.</div>
      </div>
      <div class="import-alt"><button class="btn subtle" id="dzDemo">${TMD.icon('database')}<span>Load demonstration data</span></button>
      <button class="btn subtle" id="dzReport" ${M.state.workbook ? '' : 'disabled'}>${TMD.icon('file')}<span>View last import report</span></button></div>`;
    TMD.modal({
      title: `Import ${mid === 'cyber' ? 'audit' : 'tender'} data`, body, wide: true, buttons: [{ label: 'Close', value: null }],
      onOpen: (dlg, close) => {
        const dz = dlg.querySelector('#dropzone');
        const pick = () => TMD.$('#fileInput').click();
        dlg.querySelector('#dzBrowse').addEventListener('click', (e) => { e.stopPropagation(); pick(); });
        dz.addEventListener('click', pick);
        dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); TMD.$('#dropOverlay').hidden = true; const f = e.dataTransfer.files[0]; close(null); if (f) TMD.importFile(f, TMD.modules[mid]); });
        dlg.querySelector('#dzDemo').addEventListener('click', () => { close(null); loadDemoFor(mid); });
        dlg.querySelector('#dzReport').addEventListener('click', () => { close(null); TMD.showImportReport(M.state.workbook); });
        TMD._closeImport = close;
      },
    });
  };
  async function loadDemoFor(mid) {
    const M = TMD.modules[mid];
    if (M.state.mode === 'edit' && M.state.dirty) {
      const ok = await TMD.confirm('Unsaved changes', `Loading demonstration data will replace your unsaved ${M.label} edits. Continue?`, 'Load demo', 'danger');
      if (!ok) return;
    }
    if (M.state.mode === 'edit') M.edit.forceExit();
    M.loadDemo();
    TMD.toast(`${M.label}: demonstration data loaded.`, 'info');
    if (TMD.state.page !== 'home' && PAGE_MOD[TMD.state.page] !== mid) TMD.go(M.pages[0]);
  }

  function installPayload(M, p) {
    M.audit.load(p.audit || []);
    const wb = p.workbook;
    Object.keys(wb.sheets).forEach((n) => { wb.sheets[n].mod = wb.sheets[n].mod || M.id; wb.sheets[n].rows.forEach((r) => { r.mod = r.mod || M.id; r.followUps = r.followUps || []; r.editedKeys = r.editedKeys || []; }); });
    wb.raw = wb.raw || {}; wb.original = wb.original || {};
    M.install(wb, p.activeSheets);
  }
  async function restoreModule(M) {
    if (!TMD.settings.get('persistence')) return false;
    try {
      const meta = await TMD.idb.get(M.slots.meta);
      const rec = meta && meta.dirty ? await TMD.idb.get(M.slots.recovery) : null;
      if (rec && rec.workbook) {
        const ok = await TMD.modal({
          title: `Recover unsaved ${M.label} changes?`,
          body: `<p>An Edit Mode session with unsaved changes was found (last autosave ${esc(TMD.fmtDateTime(meta.at))}, file <strong>${esc(rec.workbook.fileName)}</strong>).</p><p>Recover these changes or discard them and keep the last saved copy.</p>`,
          buttons: [{ label: 'Discard recovery data', value: false, kind: 'danger' }, { label: 'Recover changes', value: true, kind: 'primary' }], dismissValue: false,
        });
        await TMD.idb.del(M.slots.recovery); await TMD.idb.del(M.slots.meta);
        if (ok) {
          installPayload(M, rec);
          M.audit.log({ action: 'RECOVERY', field: 'Unsaved Edit Mode changes recovered', newValue: TMD.fmtDateTime(meta.at) });
          await TMD.saveWorkingCopy(M.slots.working, M);
          TMD.toast(`${M.label}: unsaved changes recovered and saved as the local working copy.`, 'success', 5000);
          return true;
        }
      }
      const w = await TMD.idb.get(M.slots.working);
      if (w && w.workbook) { installPayload(M, w); return w; }
    } catch (e) { console.warn('Could not restore local data for ' + M.id, e); }
    return false;
  }
  async function startupData() {
    const restored = [];
    for (const id of ['tender', 'cyber']) {
      const M = TMD.modules[id];
      const r = await restoreModule(M);
      if (r && r.workbook) restored.push(`${M.label}: ${r.workbook.fileName}`);
      if (!r) M.loadDemo();
    }
    if (restored.length) TMD.toast(`Restored local working copy — ${restored.join(' · ')}`, 'info', 4500);
  }

  async function init() {
    const d = new Date();
    TMD.state.sessionId = `S-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${TMD.randomHex(3)}`;
    TMD.applyIcons();
    applyTheme();
    TMD.initFilters(); TMD.cyber.filters.mount(TMD.$('#fbCyber'));
    TMD.initDetails(); TMD.initCyberDetails();
    TMD.initHome(); TMD.initDashboard(); TMD.initTimeline(); TMD.initAnalytics(); TMD.initReports(); TMD.initAlerts();
    TMD.initCyberDashboard(); TMD.initCyberAlerts();
    TMD.initDataQuality(); TMD.initSettings(); TMD.initAuditPage();

    TMD.$('#btnImport').addEventListener('click', () => TMD.openImport());
    TMD.$('#btnRefresh').addEventListener('click', () => {
      TMD.recalcAll(); TMD.filters.apply(); TMD.cyberRecalcAll(); TMD.cyber.filters.apply();
      TMD.toast(`Recalculated using system date ${TMD.fmtDate(TMD.today())}.`, 'success');
    });
    TMD.$('#btnExport').addEventListener('click', (e) => {
      const pm = PAGE_MOD[TMD.state.page] || lastMod;
      if (pm === 'cyber') TMD.cyber.exporter.menu(e.currentTarget); else TMD.exporter.exportMenu(e.currentTarget);
    });
    TMD.$('#btnExport').setAttribute('data-pop-anchor', '');
    TMD.$('#btnSettings').addEventListener('click', () => TMD.go('settings'));
    TMD.$('#btnTheme').addEventListener('click', () => { TMD.settings.set('theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
    TMD.$('#navToggle').innerHTML = TMD.icon('sidebar');
    TMD.$('#navToggle').addEventListener('click', () => setNav(!document.body.classList.contains('nav-expanded'), true));
    bindSidebarHover();
    TMD.$('#navScrim').addEventListener('click', () => setNav(false));
    if (TMD.settings.get('navExpanded') && !narrow()) setNav(true);
    TMD.$('#hdrMeta').addEventListener('click', (e) => { if (e.target.closest('#hdrSheets')) TMD.manageSheets(TMD.activeModule()); });
    TMD.$('#demoBanner').addEventListener('click', (e) => { if (e.target.closest('#bannerImport')) TMD.openImport(); });
    TMD.$('#main').addEventListener('click', (e) => {
      const a = e.target.closest('[data-empty-imp]'); if (a) TMD.openImport(a.dataset.emptyImp);
      const b = e.target.closest('[data-empty-demo]'); if (b) loadDemoFor(b.dataset.emptyDemo);
    });

    TMD.$('#editFab').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      const M = TMD.activeModule();
      const f = b.dataset.f;
      if (f === 'unlock') M.edit.enter();
      if (f === 'undo') M.edit.undo();
      if (f === 'redo') M.edit.redo();
      if (f === 'save') M.edit.saveMenu();
      if (f === 'lock') M.edit.cancel();
    });

    TMD.$('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (TMD._closeImport) TMD._closeImport(null); if (f) TMD.importFile(f, TMD.modules[importMod]); });
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return; e.preventDefault(); dragDepth++;
      const pm = PAGE_MOD[TMD.state.page];
      TMD.$('#dropText').textContent = pm ? `Drop .xlsx, .xls or .csv file to import into ${TMD.modules[pm].label} (locally)` : 'Drop .xlsx, .xls or .csv file to import locally';
      TMD.$('#dropOverlay').hidden = false;
    });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) TMD.$('#dropOverlay').hidden = true; });
    window.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth = 0; TMD.$('#dropOverlay').hidden = true;
      const f = e.dataTransfer.files[0];
      if (TMD._closeImport) TMD._closeImport(null);
      if (!f) return;
      const mid = PAGE_MOD[TMD.state.page] || await chooseModule();
      if (mid) TMD.importFile(f, TMD.modules[mid]);
    });

    const modOf = (e) => (e && e.module) || 'tender';
    TMD.on('data', (e) => {
      const M = TMD.modules[modOf(e)];
      if (M.grid && M.grid.onData) M.grid.onData();
      const pm = PAGE_MOD[TMD.state.page];
      if (pm === M.id && TMD.$('#page-' + TMD.state.page).querySelector('.empty-state.big')) renderPage(TMD.state.page, true);
      if (TMD.state.page === 'home') TMD.home.render();
      updateHeader();
    });
    TMD.on('filtered', (e) => scheduleRender(modOf(e)));
    TMD.on('changed', () => { updateHeader(); if (TMD.state.page === 'audit') TMD.auditPage.render(); });
    TMD.on('audit', () => { if (TMD.state.page === 'audit') TMD.auditPage.render(); });
    TMD.on('layout', () => { const m = TMD.activeModule(); if (m.grid && m.grid.resize) m.grid.resize(); });
    TMD.on('columns', (e) => {
      const M = TMD.modules[modOf(e)];
      M.grid.onData();
      if (PAGE_MOD[TMD.state.page] === M.id && /register$/.test(TMD.state.page)) M.grid.refresh(true);
    });
    TMD.on('mode', (e) => {
      const M = TMD.modules[modOf(e)];
      const pg = TMD.state.page;
      if ((pg === 'register' && M.id === 'tender') || (pg === 'cyber-register' && M.id === 'cyber')) M.grid.refresh(true);
      updateFab();
    });
    const RECALC_KEYS = /^(thr|unit|fyStartMonth|dateFormat|mgmt)/;
    const CYBER_KEYS = /^(cyberThr|cyberSuggest|cyberDomains|dateFormat|fyStartMonth)/;
    TMD.on('settings', (e) => {
      const keys = e.many ? Object.keys(e.many) : e.reset ? ['all'] : [e.key];
      if (keys.some((k) => k === 'theme' || k === 'all')) { applyTheme(); TMD.charts.restyle(); }
      if (keys.some((k) => /title|logo|orgName/.test(k))) updateHeader();
      if (keys.some((k) => RECALC_KEYS.test(k) || k === 'all')) { TMD.recalcAll(); TMD.filters.apply(); }
      if (keys.some((k) => CYBER_KEYS.test(k) || k === 'all')) { TMD.cyberRecalcAll(); TMD.cyber.filters.apply(); }
      if (keys.some((k) => /density|frozenCols/i.test(k))) { if (TMD.state.page === 'register') TMD.table.refresh(true); if (TMD.state.page === 'cyber-register') TMD.cyber.grid.refresh(true); }
      if (keys.some((k) => k === 'amountUnit' || k === 'currency')) { TMD.charts.restyle(); scheduleRender(); }
    });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (TMD.settings.get('theme') === 'system') { applyTheme(); TMD.charts.restyle(); }});
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', TMD.debounce ? TMD.debounce(() => { if (!narrow()) TMD.$('#navScrim').hidden = true; }, 150) : () => {});

    let lastDay = TMD.isoDate(TMD.today());
    setInterval(() => {
      const now = TMD.isoDate(TMD.today());
      if (now !== lastDay) { lastDay = now; TMD.recalcAll(); TMD.filters.apply(); TMD.cyberRecalcAll(); TMD.cyber.filters.apply(); }
    }, 60000);

    TMD.state.page = 'home';
    await startupData();
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
