/* =====================================================================
 * cyber-audit-dashboard.js — CYBER SECURITY AUDIT DASHBOARD
 * management summary · closure progress · clickable KPIs · management
 * attention · location view · audit-wise view · key charts.
 * All figures are calculated from the imported audit data (no hard-coding).
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;
  const S = M.state;
  const V = { audit: '', locGroup: 'location' };
  const inWin = TMD.inWindow;
  TMD.cyberKpiTest = () => true;

  const KPI = [
    { id: 'total', label: 'Total Observations', icon: 'layers', tone: 'blue', test: () => true, filter: {} },
    { id: 'open', label: 'Open', icon: 'circle', tone: 'grey', test: (c) => c.bucket === 'Open' && !c.closed, filter: { bucket: ['Open'] }, sub: 'Not yet in progress' },
    { id: 'inprog', label: 'In Progress', icon: 'play', tone: 'blue', test: (c) => c.bucket === 'In Progress', filter: { bucket: ['In Progress'] } },
    { id: 'closed', label: 'Closed', icon: 'check', tone: 'green', test: (c) => c.closed, filter: { bucket: ['Closed'] }, sub: 'incl. N/A & risk accepted' },
    { id: 'overdue', label: 'Overdue', icon: 'clock', tone: 'red', test: (c) => c.overdue, filter: { attention: ['Overdue'] } },
    { id: 'critical', label: 'Critical', icon: 'alert', tone: 'crit', test: (c) => c.severity === 'Critical', filter: { severity: ['Critical'] }, open: true },
    { id: 'high', label: 'High', icon: 'alert', tone: 'red', test: (c) => c.severity === 'High', filter: { severity: ['High'] }, open: true },
    { id: 'medium', label: 'Medium', icon: 'info', tone: 'amber', test: (c) => c.severity === 'Medium', filter: { severity: ['Medium'] }, open: true },
    { id: 'low', label: 'Low', icon: 'info', tone: 'blue', test: (c) => c.severity === 'Low', filter: { severity: ['Low'] }, open: true },
    { id: 'verif', label: 'Closure Pending Verification', icon: 'shield', tone: 'purple', test: (c) => c.verificationPending || c.awaitingClosure, filter: { attention: ['Verification pending', 'Awaiting closure'] } },
    { id: 'evidence', label: 'Evidence Pending', icon: 'file', tone: 'amber', test: (c) => c.evidencePending, filter: { attention: ['Evidence pending'] } },
    { id: 'repeat', label: 'Repeat Observations', icon: 'repeat', tone: 'orange', test: (c) => c.repeat, filter: { attention: ['Repeat finding'] } },
    { id: 'due7', label: 'Target Date within 7 Days', icon: 'calendar', tone: 'amber', test: (c) => c.open && !c.overdue && inWin(c.effTarget, 7), filter: { attention: ['Due in 7 days'] } },
    { id: 'due30', label: 'Target Date within 30 Days', icon: 'calendar', tone: 'blue', test: (c) => c.open && !c.overdue && inWin(c.effTarget, 30), filter: { attention: ['Due in 30 days'] } },
    { id: 'notarget', label: 'No Target Date', icon: 'help', tone: 'grey', test: (c) => c.open && !c.effTarget, filter: { attention: ['No target date'] } },
    { id: 'noowner', label: 'No Action Owner', icon: 'users', tone: 'orange', test: (c, r) => c.open && TMD.hasStd(r, 'owner') && !c.owner, filter: { attention: ['No owner'] } },
    { id: 'revised', label: 'Revised Target Dates', icon: 'refresh', tone: 'purple', test: (c) => c.hasRevised, filter: { attention: ['Revised target'] } },
    { id: 'escalation', label: 'Escalation Required', icon: 'flag', tone: 'red', test: (c) => c.open && c.escalation, filter: { attention: ['Escalation required'] } },
  ];
  TMD.CYBER_KPI = KPI;

  function stats(recs) {
    const n = (f) => recs.filter((r) => f(r.calc, r)).length;
    const total = recs.length;
    const closed = n((c) => c.closed);
    return {
      total, closed, open: n((c) => c.bucket === 'Open' && !c.closed), inprog: n((c) => c.bucket === 'In Progress'), pending: total - closed,
      overdue: n((c) => c.overdue), critical: n((c) => c.severity === 'Critical'), high: n((c) => c.severity === 'High'),
      critOpen: n((c) => c.open && c.severity === 'Critical'), highOpen: n((c) => c.open && c.severity === 'High'),
      closurePct: total ? Math.round(closed / total * 1000) / 10 : 0,
      openPct: total ? Math.round((total - closed) / total * 1000) / 10 : 0,
      overduePct: total ? Math.round(n((c) => c.overdue) / total * 1000) / 10 : 0,
    };
  }
  TMD.cyberStats = stats;

  function sourceCard() {
    const wb = S.workbook;
    const lastEdit = M.audit.all().filter((e) => /EDIT|ADD_ROW|DELETE_ROW|DUPLICATE_ROW|OVERRIDE/.test(e.action)).slice(-1)[0];
    const dqN = S.records.filter((r) => r.calc.dq.length).length;
    const cols = S.activeSheets.reduce((s, n) => s + wb.sheets[n].headers.length, 0);
    return `<div class="src-strip">
      <div class="src-item"><span>Source file</span><strong title="${esc(wb.fileName)}">${esc(wb.fileName)}</strong></div>
      <div class="src-item"><span>Worksheet</span><strong>${esc(S.activeSheets.join(' + '))}</strong></div>
      <div class="src-item"><span>Records</span><strong>${TMD.fmtInt(S.records.length)}</strong></div>
      <div class="src-item"><span>Columns</span><strong>${cols}</strong></div>
      <div class="src-item"><span>Last imported</span><strong>${esc(TMD.fmtDateTime(wb.importedAt))}</strong></div>
      <div class="src-item"><span>Last local edit</span><strong>${lastEdit ? esc(TMD.fmtDateTime(lastEdit.ts)) : '—'}</strong></div>
      <button class="src-item linklike" data-go="quality"><span>Data quality issues</span><strong class="${dqN ? 'txt-amber' : ''}">${dqN} record(s)</strong></button>
    </div>`;
  }

  function summaryHtml(st) {
    const row = (l, v, k, cls) => `<button class="sum-row" data-kpi="${k}"><span>${esc(l)}</span><strong class="${cls || ''}">${TMD.fmtInt(v)}</strong></button>`;
    const bar = (l, pct, tone) => `<div class="prog"><div class="prog-h"><span>${esc(l)}</span><strong>${TMD.fmtNum(pct, 1)}%</strong></div><div class="prog-track"><div class="prog-fill tone-${tone}" style="width:${Math.min(100, pct)}%"></div></div></div>`;
    return `<div class="sum-grid">
      <section class="card sum-card"><header class="card-h"><h3>${TMD.icon('shield')} Cyber Security Audit Status</h3></header>
        <div class="sum-list">${row('Total Observations', st.total, 'total')}${row('Open', st.open, 'open')}${row('In Progress', st.inprog, 'inprog')}${row('Closed', st.closed, 'closed', 'txt-green')}${row('Overdue', st.overdue, 'overdue', st.overdue ? 'txt-red' : '')}${row('Critical', st.critical, 'critical', st.critical ? 'txt-red' : '')}${row('High', st.high, 'high')}</div></section>
      <section class="card sum-card"><header class="card-h"><h3>${TMD.icon('chart')} Closure Progress</h3></header>
        <div class="big-pct"><span class="big-n">${TMD.fmtNum(st.closurePct, 1)}%</span><span class="muted">closed (${st.closed} of ${st.total})</span></div>
        ${bar('Closure %', st.closurePct, 'green')}${bar('Open %', st.openPct, 'blue')}${bar('Overdue %', st.overduePct, 'red')}
        <p class="muted small pad">Closure % = Closed observations ÷ Total observations × 100 (Closed includes Not Applicable and Risk Accepted).</p></section>
    </div>`;
  }

  function kpiGrid(recs) {
    return `<div class="kpi-grid compact">${KPI.map((k) => {
      const list = recs.filter((r) => k.test(r.calc, r));
      const openN = k.open ? list.filter((r) => r.calc.open).length : null;
      const sub = k.sub || (openN !== null ? `${openN} open` : '');
      return `<button class="kpi tone-${k.tone}" data-kpi="${k.id}"><span class="kpi-ico">${TMD.icon(k.icon)}</span><span class="kpi-main"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-val">${TMD.fmtInt(list.length)}</span><span class="kpi-sub">${esc(sub)}</span></span></button>`;
    }).join('')}</div>`;
  }

  function attentionHtml(recs) {
    const list = recs.filter((r) => r.calc.attention.length).sort((a, b) => (TMD.SEV_ORDER.indexOf(a.calc.severity) - TMD.SEV_ORDER.indexOf(b.calc.severity)) || (b.calc.daysOverdue - a.calc.daysOverdue));
    const has = (f) => S.activeSheets.some((n) => S.workbook.sheets[n].mapping[f]);
    return `<section class="card"><header class="card-h"><div><h3>${TMD.icon('alert')} Management Attention</h3><p class="card-sub">${list.length} observation(s) meet one or more explicit attention rules</p></div><button class="btn subtle" data-attn-all="1">Open in register →</button></header>
      <div class="table-wrap"><table class="data-table hover"><thead><tr><th>Observation</th><th>Severity</th>${has('location') ? '<th>Location</th>' : ''}${has('owner') ? '<th>Owner</th>' : ''}<th>Status</th><th>Why</th></tr></thead><tbody>
      ${list.slice(0, 15).map((r) => `<tr data-crec="${esc(r.id)}" tabindex="0"><td><div class="cell-title">${esc(r.calc.title)}</div><div class="muted small">${esc(r.calc.ident)}${r.calc.auditName ? ' · ' + esc(r.calc.auditName) : ''}</div></td><td>${TMD.sevBadge(r.calc.severity)}</td>${has('location') ? `<td>${esc(r.calc.location)}</td>` : ''}${has('owner') ? `<td>${esc(r.calc.owner) || '<span class="txt-red">—</span>'}</td>` : ''}<td>${TMD.cstatusBadge(r.calc.cstatus)}</td><td class="small">${r.calc.attention.map((a) => `<span class="tag tag-amber">${esc(a)}</span>`).join(' ')}</td></tr>`).join('') || '<tr><td colspan="6" class="pad muted">Nothing needs management attention right now.</td></tr>'}
      </tbody></table></div>${list.length > 15 ? `<p class="muted small pad">+ ${list.length - 15} more — open in the register.</p>` : ''}</section>`;
  }

  function locationHtml(recs) {
    const key = V.locGroup;
    const getter = { location: (c) => c.location, region: (c) => c.region, asset: (c) => c.asset, system: (c) => c.system }[key];
    const groups = new Map();
    recs.forEach((r) => { const k = getter(r.calc); if (!k) return; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
    const avail = ['location', 'region', 'asset', 'system'].filter((f) => S.activeSheets.some((n) => S.workbook.sheets[n].mapping[f]));
    if (!avail.length) return '';
    const lbl = { location: 'Location', region: 'Region', asset: 'Pipeline / installation', system: 'System' };
    const cards = Array.from(groups.entries()).sort((a, b) => b[1].filter((r) => r.calc.open).length - a[1].filter((r) => r.calc.open).length).map(([k, list]) => {
      const open = list.filter((r) => r.calc.open).length, closed = list.length - open, od = list.filter((r) => r.calc.overdue).length, ch = list.filter((r) => r.calc.open && (r.calc.severity === 'Critical' || r.calc.severity === 'High')).length;
      return `<button class="loc-card" data-loc="${esc(k)}"><div class="loc-name">${esc(k)}</div>
        <div class="loc-stats"><span><strong>${open}</strong> open</span><span><strong>${closed}</strong> closed</span><span class="${od ? 'txt-red' : ''}"><strong>${od}</strong> overdue</span><span class="${ch ? 'txt-red' : ''}"><strong>${ch}</strong> crit/high</span></div>
        <div class="loc-bar"><span style="width:${list.length ? closed / list.length * 100 : 0}%"></span></div></button>`;
    }).join('');
    return `<section class="card"><header class="card-h"><div><h3>${TMD.icon('layers')} Location view</h3><p class="card-sub">Only values present in the imported data are shown</p></div>
      <label class="tb-sel">Group by <select class="inp inp-sm" data-locgroup>${avail.map((f) => `<option value="${f}" ${V.locGroup === f ? 'selected' : ''}>${lbl[f]}</option>`).join('')}</select></label></header>
      <div class="loc-grid">${cards || '<p class="muted pad">No values.</p>'}</div></section>`;
  }

  function auditWiseHtml(recs) {
    const audits = Array.from(new Set(S.records.map((r) => r.calc.auditName).filter(Boolean))).sort();
    if (!audits.length) return '';
    if (!V.audit || audits.indexOf(V.audit) < 0) V.audit = audits[0];
    const list = recs.filter((r) => r.calc.auditName === V.audit);
    const first = S.records.find((r) => r.calc.auditName === V.audit);
    const st = stats(list);
    const sev = (s) => list.filter((r) => r.calc.severity === s).length;
    const g = (f) => { const v = first && TMD.getStd(first, f); return v === undefined || v === null ? '' : TMD.cellText(v); };
    return `<section class="card"><header class="card-h"><div><h3>${TMD.icon('file')} Audit-wise view</h3></div>
      <label class="tb-sel">Audit <select class="inp inp-sm" data-audit>${audits.map((a) => `<option ${a === V.audit ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label></header>
      <div class="pad">
        <div class="kv-grid">
          <div class="kv"><span>Audit name</span><strong>${esc(V.audit)}</strong></div>
          ${g('auditAgency') ? `<div class="kv"><span>Audit agency</span><strong>${esc(g('auditAgency'))}</strong></div>` : ''}
          ${first && first.calc.d.audit ? `<div class="kv"><span>Audit date</span><strong>${esc(TMD.fmtDate(first.calc.d.audit))}</strong></div>` : ''}
          ${g('reportNo') || g('auditRef') ? `<div class="kv"><span>Report reference</span><strong>${esc(g('reportNo') || g('auditRef'))}</strong></div>` : ''}
        </div>
        <div class="mini-stats">
          ${[['Total', st.total], ['Critical', sev('Critical')], ['High', sev('High')], ['Medium', sev('Medium')], ['Low', sev('Low')], ['Open', st.pending], ['Closed', st.closed], ['Overdue', st.overdue]].map(([l, v]) => `<div class="ms"><span>${l}</span><strong class="${(l === 'Overdue' || l === 'Critical') && v ? 'txt-red' : ''}">${v}</strong></div>`).join('')}
        </div>
      </div>
      <div class="table-wrap"><table class="data-table hover"><thead><tr><th>ID</th><th>Observation</th><th>Severity</th><th>Status</th><th>Due</th></tr></thead><tbody>
      ${list.map((r) => `<tr data-crec="${esc(r.id)}" tabindex="0"><td class="nowrap">${esc(r.calc.obsId || r.rowNum)}</td><td><div class="cell-title">${esc(r.calc.title)}</div><div class="muted small">${esc(r.calc.location)}</div></td><td>${TMD.sevBadge(r.calc.severity)}</td><td>${TMD.cstatusBadge(r.calc.cstatus)}</td><td class="nowrap ${r.calc.overdue ? 'txt-red' : ''}">${esc(r.calc.dueLabel)}</td></tr>`).join('') || '<tr><td colspan="5" class="pad muted">No observations for this audit in the current filter.</td></tr>'}
      </tbody></table></div></section>`;
  }

  function topHtml() {
    const recs = S.filtered;
    const st = stats(recs);
    return `
      <div class="page-head cyber-head">
        <div><div class="eyebrow">${TMD.icon('shield')} Cyber Security Audits</div><h2>Cyber Security Audit Monitoring</h2><p class="muted">Audit Observations • Remediation • Compliance Tracking</p>
          <p class="offline-line">${TMD.icon('lock')} Offline Mode • Audit data remains on this device${S.workbook && S.workbook.isDemo ? ' · <span class="tag tag-amber">DEMONSTRATION DATA</span>' : ''}${M.filters.activeCount() ? ' · <strong>filters applied</strong>' : ''}</p></div>
        <div class="page-actions">
          <button class="btn primary" data-c="import">${TMD.icon('upload')}<span>Import Audit Data</span></button>
          <button class="btn" data-c="export" data-pop-anchor>${TMD.icon('download')}<span>Export</span></button>
          <button class="btn subtle" data-c="summary">${TMD.icon('file')}<span>Management summary</span></button>
        </div>
      </div>
      ${sourceCard()}
      ${summaryHtml(st)}
      <h3 class="sec-h">Indicators <span class="muted small">— click to open the filtered register</span></h3>
      ${kpiGrid(recs)}
      ${attentionHtml(recs)}
      <div class="two-col">${locationHtml(recs)}${auditWiseHtml(recs)}</div>`;
  }

  function render() {
    const host = TMD.$('#page-cyber');
    if (!S.workbook) { host.innerHTML = '<div class="empty-state">No audit data loaded.</div>'; return; }
    host.innerHTML = `<div id="cyberTop">${topHtml()}</div><h3 class="sec-h">Charts</h3><div class="chart-grid" id="cyberDashCharts"></div>`;
    TMD.charts.mount(TMD.$('#cyberDashCharts'), ['c-openclosed', 'c-sev', 'c-status', 'c-aging', 'c-location', 'c-domain']);
  }
  function update() {
    const top = TMD.$('#cyberTop');
    if (!top || !TMD.$('#cyberDashCharts .chart-card')) { render(); return; }
    top.innerHTML = topHtml();
    TMD.charts.refresh();
  }

  TMD.cyber.dashboard = { render, update, KPI };
  TMD.cyber.applyKpi = function (id) {
    const k = KPI.find((x) => x.id === id);
    if (!k) return;
    M.filters.merge(k.filter);
    TMD.go('cyber-register');
    TMD.toast(`Showing: ${k.label}`, 'info', 1800);
  };
  TMD.initCyberDashboard = function () {
    const host = TMD.$('#page-cyber');
    host.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kpi]'); if (k) { TMD.cyber.applyKpi(k.dataset.kpi); return; }
      const r = e.target.closest('[data-crec]'); if (r) { const rec = S.records.find((x) => x.id === r.dataset.crec); if (rec) TMD.cyber.details.open(rec); return; }
      const loc = e.target.closest('[data-loc]'); if (loc) { M.filters.merge({ [V.locGroup === 'asset' ? 'asset' : V.locGroup]: [loc.dataset.loc] }); TMD.go('cyber-register'); return; }
      if (e.target.closest('[data-attn-all]')) { M.filters.merge({ attention: ['Overdue', 'Critical open', 'No owner', 'No target date', 'Repeat finding', 'Evidence pending', 'Verification pending', 'Escalation required'] }); M.filters.replace(Object.assign({}, M.filters.state.values), { logic: 'AND' }); TMD.go('cyber-register'); return; }
      const go = e.target.closest('[data-go]'); if (go) { TMD.qualityModule = 'cyber'; TMD.go(go.dataset.go); return; }
      const c = e.target.closest('[data-c]');
      if (c && c.dataset.c === 'import') TMD.openImport('cyber');
      if (c && c.dataset.c === 'export') TMD.cyber.exporter.menu(c);
      if (c && c.dataset.c === 'summary') TMD.cyber.exporter.managementSummary();
    });
    host.addEventListener('change', (e) => {
      if (e.target.dataset.audit !== undefined) { V.audit = e.target.value; update(); }
      if (e.target.dataset.locgroup !== undefined) { V.locGroup = e.target.value; update(); }
    });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('[data-crec]'); if (r) r.click(); } });
  };
})();
