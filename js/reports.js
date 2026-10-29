/* =====================================================================
 * reports.js — Tender reports:
 *  • Periodic report (monthly / quarterly / financial year)
 *  • Tender report generator with selectable, re-orderable columns,
 *    grouping, sorting, saved templates and Excel / CSV / HTML / PDF output
 * Uses the current Tender filters (stated on every report).
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const st = TMD.state;
  const V = { period: 'month', key: null };
  const GEN = { title: 'Tender status report', scope: 'filtered', cols: null, groupBy: 'mgmt', sortBy: '__stage', sortDir: 'asc', summary: true };
  const GROUPS = { '': 'No grouping', mgmt: 'Management status', stage: 'Current stage', department: 'Department', capexRevex: 'CAPEX / REVEX', officer: 'Officer', channel: 'Procurement channel', sheet: 'Worksheet' };
  const groupVal = (g, r) => ({ mgmt: r.calc.mgmt ? r.calc.mgmt.name : '', stage: TMD.stageInfo(r.calc.stage).label, department: r.calc.department, capexRevex: r.calc.capexRevex, officer: r.calc.officer, channel: r.calc.channel, sheet: r.sheet }[g] || '(Blank)');

  /* ---------------- Periods ---------------- */
  function fyStart(y) { return new Date(y, (+TMD.settings.get('fyStartMonth') || 4) - 1, 1); }
  function periodList(kind) {
    const T = TMD.today();
    const out = [];
    const fsm = (+TMD.settings.get('fyStartMonth') || 4) - 1;
    if (kind === 'month') for (let i = 0; i < 24; i++) { const s = new Date(T.getFullYear(), T.getMonth() - i, 1); out.push({ key: TMD.monthKey(s), label: `${TMD.MONTHS[s.getMonth()]} ${s.getFullYear()}`, start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 0) }); }
    if (kind === 'quarter') {
      const fy0 = T.getMonth() >= fsm ? T.getFullYear() : T.getFullYear() - 1;
      for (let fy = fy0; fy > fy0 - 3; fy--) for (let q = 3; q >= 0; q--) {
        const s = new Date(fy, fsm + q * 3, 1);
        if (s > T) continue;
        out.push({ key: `${fy}-Q${q + 1}`, label: `Q${q + 1} ${TMD.fyOf(s)} (${TMD.MONTHS[s.getMonth()]}–${TMD.MONTHS[(s.getMonth() + 2) % 12]} ${new Date(s.getFullYear(), s.getMonth() + 2, 1).getFullYear()})`, start: s, end: new Date(s.getFullYear(), s.getMonth() + 3, 0) });
      }
    }
    if (kind === 'fy') {
      const fy0 = T.getMonth() >= fsm ? T.getFullYear() : T.getFullYear() - 1;
      for (let fy = fy0; fy > fy0 - 4; fy--) { const s = fyStart(fy); out.push({ key: 'FY' + fy, label: TMD.fyOf(s), start: s, end: new Date(s.getFullYear() + 1, s.getMonth(), 0) }); }
    }
    return out;
  }
  const inP = (d, p) => d && d >= p.start && d <= p.end;

  function periodData(p) {
    const recs = st.filtered;
    const sum = (list, f) => TMD.sum(list, f);
    const pick = (fn) => recs.filter((r) => inP(fn(r.calc), p));
    const prs = pick((c) => c.d.prSentDate);
    const floated = pick((c) => c.d.floatDate);
    const opened = pick((c) => c.d.actualOpeningDate || (c.d.openingDate && c.stage >= 8 ? c.d.openingDate : null));
    const tech = pick((c) => c.d.techEvalDate);
    const price = pick((c) => c.d.priceBidDate);
    const awards = pick((c) => (c.stage !== 24 && c.stage !== 25 ? c.d.awardDate : null));
    const completed = pick((c) => (c.stage === 22 ? c.ms.handover.date || c.ms.installation.date : null));
    const delayed = recs.filter((r) => r.calc.delayed);
    return { recs, prs, floated, opened, tech, price, awards, completed, delayed, awardValue: sum(awards, (r) => r.calc.awardedRupees) };
  }

  function periodHtml(p, forDoc) {
    const d = periodData(p);
    const rowsBy = (list, fn) => { const m = new Map(); list.forEach((r) => { const k = fn(r) || '(Blank)'; m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const depts = Array.from(new Set(d.recs.map((r) => r.calc.department || '(Blank)'))).sort();
    const metric = [['PRs sent', d.prs], ['Tenders floated', d.floated], ['Bids opened', d.opened], ['Technical evaluations completed', d.tech], ['Price bids opened', d.price], ['PO/OLA awarded', d.awards], ['Completed / handed over', d.completed]];
    const by = metric.map(([l, list]) => [l, rowsBy(list, (r) => r.calc.department)]);
    const cr = metric.map(([l, list]) => [l, list.filter((r) => r.calc.capexRevex === 'CAPEX').length, list.filter((r) => r.calc.capexRevex === 'REVEX').length, list.length]);
    const mg = TMD.mgmtStatuses().map((m) => [m.name, d.recs.filter((r) => r.calc.mgmt && r.calc.mgmt.id === m.id).length]).filter((x) => x[1]);
    const list = (title, items, cols) => `<h3>${esc(title)} (${items.length})</h3>${items.length ? `<table class="rep-table"><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${items.slice(0, 60).map((r) => `<tr>${cols.map((c) => `<td>${esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</tbody></table>${items.length > 60 ? `<p class="muted small">+ ${items.length - 60} more</p>` : ''}` : '<p class="muted">None.</p>'}`;
    const id = (r) => r.calc.ident, ti = (r) => r.calc.title, dep = (r) => r.calc.department;
    return `<div class="rep-doc">
      <h2>${esc(TMD.settings.get('title'))} — ${esc(p.label)} report</h2>
      <p class="muted">Period ${esc(TMD.fmtDate(p.start))} – ${esc(TMD.fmtDate(p.end))} · generated ${esc(TMD.fmtDateTime(Date.now()))} · ${TMD.fmtInt(d.recs.length)} tender(s) in scope${TMD.filters.activeCount() ? ' · filters: ' + esc(TMD.filters.text()) : ''}${st.workbook.isDemo ? ' · DEMONSTRATION DATA' : ''}</p>
      <div class="rep-kpis">${metric.map(([l, x]) => `<div class="rk"><span>${esc(l)}</span><strong>${x.length}</strong></div>`).join('')}<div class="rk"><span>Awarded value</span><strong>${esc(TMD.fmtMoney(d.awardValue))}</strong></div><div class="rk"><span>Delayed (as on today)</span><strong class="${d.delayed.length ? 'txt-red' : ''}">${d.delayed.length}</strong></div></div>
      <h3>Activity in the period — CAPEX / REVEX</h3>
      <table class="rep-table"><thead><tr><th>Activity</th><th class="n">CAPEX</th><th class="n">REVEX</th><th class="n">Total</th></tr></thead><tbody>${cr.map((x) => `<tr><td>${esc(x[0])}</td><td class="n">${x[1]}</td><td class="n">${x[2]}</td><td class="n"><strong>${x[3]}</strong></td></tr>`).join('')}</tbody></table>
      <h3>Activity by department</h3>
      <table class="rep-table"><thead><tr><th>Activity</th>${depts.map((x) => `<th class="n">${esc(x)}</th>`).join('')}</tr></thead><tbody>${by.map(([l, m]) => `<tr><td>${esc(l)}</td>${depts.map((x) => `<td class="n">${m.get(x) || 0}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <h3>Management status snapshot (as on today)</h3>
      <table class="rep-table"><thead><tr><th>Management status</th><th class="n">Tenders</th></tr></thead><tbody>${mg.map((x) => `<tr><td>${esc(x[0])}</td><td class="n">${x[1]}</td></tr>`).join('')}</tbody></table>
      ${list('Awarded in the period', d.awards, [['Tender', ti], ['Identifier', id], ['Dept', dep], ['Vendor', (r) => r.calc.vendor], ['Award date', (r) => TMD.fmtDate(r.calc.d.awardDate)], ['Value', (r) => TMD.fmtMoney(r.calc.awardedRupees)]])}
      ${list('Floated in the period', d.floated, [['Tender', ti], ['Identifier', id], ['Dept', dep], ['Floated', (r) => TMD.fmtDate(r.calc.d.floatDate)], ['Current stage', (r) => TMD.stageInfo(r.calc.stage).label]])}
      ${list('Delayed tenders (as on today)', d.delayed, [['Tender', ti], ['Identifier', id], ['Officer', (r) => r.calc.officer], ['Stage', (r) => TMD.stageInfo(r.calc.stage).label], ['Reason', (r) => r.calc.alerts.filter((a) => a.delay).map((a) => a.type).join('; ')]])}
      ${forDoc ? '' : ''}</div>`;
  }
  const REPORT_CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;margin:24px;font-size:12.5px;line-height:1.45}h2{font-size:20px;margin:0 0 4px}h3{font-size:14px;margin:20px 0 6px;border-bottom:2px solid #0071e3;padding-bottom:3px}.muted{color:#6e6e73}.small{font-size:11px}.rep-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.rk{border:1px solid #d2d2d7;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column}.rk span{color:#6e6e73;font-size:11px}.rk strong{font-size:18px}.txt-red{color:#b42318}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d2d2d7;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f5f5f7}.n{text-align:right}@media print{body{margin:10mm}tr{break-inside:avoid}}`;
  const wrapDoc = (title, inner) => `<!DOCTYPE html><html lang="en-IN"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>${inner}</body></html>`;

  function periodExcel(p) {
    const d = periodData(p);
    const X = window.XLSX, W = TMD.xlsxWriters;
    const out = X.utils.book_new(); const used = new Set();
    const m = [['Activity', 'Count', 'CAPEX', 'REVEX']];
    [['PRs sent', d.prs], ['Tenders floated', d.floated], ['Bids opened', d.opened], ['Technical evaluations completed', d.tech], ['Price bids opened', d.price], ['PO/OLA awarded', d.awards], ['Completed / handed over', d.completed]].forEach(([l, x]) => m.push([l, x.length, x.filter((r) => r.calc.capexRevex === 'CAPEX').length, x.filter((r) => r.calc.capexRevex === 'REVEX').length]));
    m.push([], ['Awarded value (₹)', Math.round(d.awardValue || 0)], ['Delayed (as on today)', d.delayed.length]);
    X.utils.book_append_sheet(out, W.aoaSheet([[`${p.label} report`], [`Period ${TMD.fmtDate(p.start)} – ${TMD.fmtDate(p.end)}`], []].concat(m), [36, 12, 10, 10]), W.uniqueName('Summary', used));
    const lst = (list, cols) => [cols.map((c) => c[0])].concat(list.map((r) => cols.map((c) => c[1](r))));
    X.utils.book_append_sheet(out, W.aoaSheet(lst(d.awards, [['Tender', (r) => r.calc.title], ['Identifier', (r) => r.calc.ident], ['Department', (r) => r.calc.department], ['Vendor', (r) => r.calc.vendor], ['Award date', (r) => TMD.fmtDate(r.calc.d.awardDate)], ['Awarded value (₹)', (r) => r.calc.awardedRupees]]), [50, 22, 14, 30, 12, 16]), W.uniqueName('Awarded', used));
    X.utils.book_append_sheet(out, W.aoaSheet(lst(d.floated, [['Tender', (r) => r.calc.title], ['Identifier', (r) => r.calc.ident], ['Department', (r) => r.calc.department], ['Floated', (r) => TMD.fmtDate(r.calc.d.floatDate)], ['Current stage', (r) => TMD.stageInfo(r.calc.stage).label]]), [50, 22, 14, 12, 26]), W.uniqueName('Floated', used));
    X.utils.book_append_sheet(out, W.aoaSheet(lst(d.delayed, [['Tender', (r) => r.calc.title], ['Identifier', (r) => r.calc.ident], ['Officer', (r) => r.calc.officer], ['Stage', (r) => TMD.stageInfo(r.calc.stage).label], ['Delay reasons', (r) => r.calc.alerts.filter((a) => a.delay).map((a) => a.msg).join(' ')]]), [50, 22, 18, 24, 60]), W.uniqueName('Delayed', used));
    const fname = `Tender_${p.key}_Report_${TMD.stamp()}.xlsx`;
    TMD.downloadBlob(new Blob([X.write(out, { bookType: 'xlsx', type: 'array', compression: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    TMD.audit.log({ action: 'EXPORT', field: 'Periodic report', newValue: fname });
    TMD.toast(`Downloaded ${fname}.`, 'success');
  }

  /* ---------------- Report generator ---------------- */
  function allCols() { return st.columns.filter((c) => c.id !== '__sheet' || st.activeSheets.length > 1); }
  const PRESET_STD = ['srNo', 'proposalName', 'jobDescription', 'department', 'capexRevex', 'officer', 'statusRemark', 'nextActionDate'];
  function defaultCols() {
    const cols = allCols();
    const ids = [];
    PRESET_STD.forEach((f) => { const c = cols.find((x) => x.std === f); if (c) ids.push(c.id); });
    ['__stage', '__mgmt', '__delay', '__next'].forEach((x) => { if (cols.some((c) => c.id === x)) ids.splice(Math.min(ids.length, 3), 0, x); });
    return ids;
  }
  function genRows() {
    let recs = GEN.scope === 'all' ? st.records.slice() : GEN.scope === 'selected' ? st.records.filter((r) => st.selection.has(r.id)) : st.filtered.slice();
    const col = st.columns.find((c) => c.id === GEN.sortBy);
    if (col) {
      const key = (r) => { if (col.id === '__stage') return r.calc.stage; const v = TMD.colValue(col, r); if (TMD.isBlank(v)) return null; if (col.isDate) { const p = TMD.parseDate(v, r.dateHints[col.keysBySheet[r.sheet]], true); return p.date ? p.date.getTime() : String(v); } return typeof v === 'number' ? v : String(v).toLowerCase(); };
      recs.sort((a, b) => { const x = key(a), y = key(b); if (x === null) return 1; if (y === null) return -1; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }); return GEN.sortDir === 'desc' ? -c : c; });
    }
    return recs;
  }
  const textOf = (c, r) => { if (c.id === '__stage') return TMD.stageInfo(r.calc.stage).label; if (c.id === '__delay') return r.calc.delayLabel; const v = TMD.colValue(c, r); if (v === null || v === undefined) return ''; if (c.kind === 'calc' && c.type === 'money') return TMD.fmtMoney(v); return TMD.cellText(v); };
  function genGroups(recs) {
    if (!GEN.groupBy) return [{ key: '', recs }];
    const m = new Map();
    recs.forEach((r) => { const k = groupVal(GEN.groupBy, r); (m.get(k) || m.set(k, []).get(k)).push(r); });
    const order = GEN.groupBy === 'mgmt' ? TMD.mgmtStatuses().map((x) => x.name) : GEN.groupBy === 'stage' ? TMD.STAGES.slice(1).map((s) => s.label) : null;
    return Array.from(m.keys()).sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b))).map((k) => ({ key: k, recs: m.get(k) }));
  }
  function genHtml(limit) {
    const cols = GEN.cols.map((id) => st.columns.find((c) => c.id === id)).filter(Boolean);
    const recs = genRows();
    const groups = genGroups(recs);
    const head = `<tr><th>#</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
    let n = 0;
    const body = groups.map((g) => `${GEN.groupBy ? `<tr class="grp"><td colspan="${cols.length + 1}"><strong>${esc(GROUPS[GEN.groupBy])}: ${esc(g.key)}</strong> — ${g.recs.length}</td></tr>` : ''}${g.recs.slice(0, limit || 1e9).map((r) => `<tr><td>${++n}</td>${cols.map((c) => `<td>${TMD.escMultiline(textOf(c, r))}</td>`).join('')}</tr>`).join('')}`).join('');
    const summary = GEN.summary && GEN.groupBy ? `<h3>Summary by ${esc(GROUPS[GEN.groupBy].toLowerCase())}</h3><table class="rep-table"><thead><tr><th>${esc(GROUPS[GEN.groupBy])}</th><th class="n">Tenders</th><th class="n">Delayed</th></tr></thead><tbody>${groups.map((g) => `<tr><td>${esc(g.key)}</td><td class="n">${g.recs.length}</td><td class="n">${g.recs.filter((r) => r.calc.delayed).length}</td></tr>`).join('')}<tr><td><strong>Total</strong></td><td class="n"><strong>${recs.length}</strong></td><td class="n"><strong>${recs.filter((r) => r.calc.delayed).length}</strong></td></tr></tbody></table>` : '';
    return { html: `<div class="rep-doc"><h2>${esc(GEN.title)}</h2><p class="muted">${esc(TMD.settings.get('orgName'))} · as on ${esc(TMD.fmtDate(TMD.today()))} · ${recs.length} tender(s) · ${esc({ filtered: 'filtered view', all: 'all records', selected: 'selected rows' }[GEN.scope])}${GEN.scope === 'filtered' && TMD.filters.activeCount() ? ' — ' + esc(TMD.filters.text()) : ''}${st.workbook.isDemo ? ' · DEMONSTRATION DATA' : ''}</p>${summary}<h3>Details</h3><table class="rep-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`, cols, recs, groups };
  }
  function genExcel() {
    const { cols, groups, recs } = genHtml();
    const aoa = [[GEN.title], [`As on ${TMD.fmtDate(TMD.today())} · ${recs.length} tender(s)`], [], ['#'].concat(cols.map((c) => c.label))];
    let n = 0;
    groups.forEach((g) => { if (GEN.groupBy) aoa.push([`${GROUPS[GEN.groupBy]}: ${g.key} (${g.recs.length})`]); g.recs.forEach((r) => aoa.push([++n].concat(cols.map((c) => textOf(c, r))))); });
    const X = window.XLSX, W = TMD.xlsxWriters;
    const out = X.utils.book_new();
    X.utils.book_append_sheet(out, W.aoaSheet(aoa, [5].concat(cols.map((c) => Math.min(50, Math.max(10, Math.round((c.width || 120) / 7)))))), 'Report');
    const fname = `${GEN.title.replace(/[^A-Za-z0-9]+/g, '_')}_${TMD.stamp()}.xlsx`;
    TMD.downloadBlob(new Blob([X.write(out, { bookType: 'xlsx', type: 'array', compression: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    TMD.audit.log({ action: 'EXPORT', field: 'Report generator', newValue: fname });
    TMD.toast(`Downloaded ${fname}.`, 'success');
  }
  function genCsv() {
    const { cols, recs } = genHtml();
    const p = TMD.settings.get('csvProtect');
    const lines = [cols.map((c) => TMD.csvCell(c.label)).join(',')].concat(recs.map((r) => cols.map((c) => TMD.csvCell(textOf(c, r), p)).join(',')));
    TMD.downloadText(lines.join('\r\n'), `${GEN.title.replace(/[^A-Za-z0-9]+/g, '_')}_${TMD.stamp()}.csv`);
  }
  const templates = () => TMD.ls.get('reportTemplates', []);

  /* ---------------- Page ---------------- */
  function render() {
    const host = TMD.$('#page-reports');
    if (!st.workbook) { host.innerHTML = ''; return; }
    if (TMD.reportsTab) { V.tab = TMD.reportsTab; TMD.reportsTab = null; }
    V.tab = V.tab || 'periodic';
    host.innerHTML = `<div class="page-head"><div><div class="eyebrow">Tender Monitoring</div><h2>Reports</h2><p class="muted">Monthly and quarterly reports, and a report generator with selectable columns. Reports respect the current filters.</p></div></div>
      <div class="tabs" role="tablist"><button class="tab ${V.tab === 'periodic' ? 'active' : ''}" data-rtab="periodic">${TMD.icon('calendar')} Monthly / quarterly report</button><button class="tab ${V.tab === 'generator' ? 'active' : ''}" data-rtab="generator">${TMD.icon('columns')} Report generator</button></div>
      <div id="repBody"></div>`;
    if (V.tab === 'periodic') renderPeriodic(); else renderGenerator();
  }
  function renderPeriodic() {
    const body = TMD.$('#repBody');
    const list = periodList(V.period);
    if (!V.key || !list.some((p) => p.key === V.key)) V.key = (V.period === 'month' && list[1] && TMD.today().getDate() < 8 ? list[1] : list[0]).key;
    const p = list.find((x) => x.key === V.key);
    body.innerHTML = `<div class="toolbar-row"><div class="tb-group">
        <div class="seg">${[['month', 'Monthly'], ['quarter', 'Quarterly'], ['fy', 'Financial year']].map(([k, l]) => `<button class="seg-btn ${V.period === k ? 'active' : ''}" data-ptype="${k}">${l}</button>`).join('')}</div>
        <select class="inp inp-sm" data-pkey aria-label="Period">${list.map((x) => `<option value="${esc(x.key)}" ${x.key === V.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="tb-group"><button class="btn subtle" data-pr="print">${TMD.icon('printer')}<span>Print / PDF</span></button><button class="btn subtle" data-pr="html">${TMD.icon('file')}<span>HTML</span></button><button class="btn" data-pr="xlsx">${TMD.icon('download')}<span>Excel</span></button></div></div>
      <section class="card rep-card">${periodHtml(p)}</section>`;
    body._period = p;
  }
  function renderGenerator() {
    const body = TMD.$('#repBody');
    if (!GEN.cols || !GEN.cols.every((id) => st.columns.some((c) => c.id === id))) GEN.cols = defaultCols();
    const cols = allCols();
    const chosen = GEN.cols.map((id) => cols.find((c) => c.id === id)).filter(Boolean);
    const rest = cols.filter((c) => GEN.cols.indexOf(c.id) < 0);
    const prev = genHtml(8);
    body.innerHTML = `<div class="gen-grid">
      <section class="card gen-opts"><header class="card-h"><h3>Report settings</h3></header><div class="pad">
        <label class="field"><span>Title</span><input class="inp" data-g="title" value="${esc(GEN.title)}"></label>
        <label class="field"><span>Records</span><select class="inp" data-g="scope"><option value="filtered" ${GEN.scope === 'filtered' ? 'selected' : ''}>Filtered view (${st.filtered.length})</option><option value="all" ${GEN.scope === 'all' ? 'selected' : ''}>All records (${st.records.length})</option><option value="selected" ${GEN.scope === 'selected' ? 'selected' : ''} ${st.selection.size ? '' : 'disabled'}>Selected rows (${st.selection.size})</option></select></label>
        <label class="field"><span>Group by</span><select class="inp" data-g="groupBy">${Object.keys(GROUPS).map((k) => `<option value="${k}" ${GEN.groupBy === k ? 'selected' : ''}>${esc(GROUPS[k])}</option>`).join('')}</select></label>
        <div class="field"><span>Sort by</span><div class="range2"><select class="inp" data-g="sortBy">${cols.map((c) => `<option value="${esc(c.id)}" ${GEN.sortBy === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select><select class="inp inp-sm" data-g="sortDir"><option value="asc" ${GEN.sortDir === 'asc' ? 'selected' : ''}>A→Z</option><option value="desc" ${GEN.sortDir === 'desc' ? 'selected' : ''}>Z→A</option></select></div></div>
        <label class="chk"><input type="checkbox" data-g="summary" ${GEN.summary ? 'checked' : ''}> Include summary table by group</label>
        <div class="field"><span>Templates (this device)</span><div class="range2"><select class="inp" data-tpl><option value="">Load template…</option>${templates().map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select><button class="btn subtle sm" data-gen="saveTpl">Save</button></div></div>
        <div class="btn-col"><button class="btn primary" data-gen="xlsx">${TMD.icon('download')}<span>Excel</span></button><button class="btn" data-gen="csv">${TMD.icon('file')}<span>CSV</span></button><button class="btn" data-gen="print">${TMD.icon('printer')}<span>Print / PDF</span></button><button class="btn subtle" data-gen="html">HTML</button></div>
      </div></section>
      <section class="card gen-cols"><header class="card-h"><div><h3>Columns</h3><p class="card-sub">${chosen.length} selected · use ↑ ↓ to order</p></div><div class="tb-group"><button class="btn subtle sm" data-gen="std">Management set</button><button class="btn subtle sm" data-gen="none">Clear</button></div></header>
        <div class="col-pick">
          <ol class="col-chosen">${chosen.map((c, i) => `<li><span class="cp-l">${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}${esc(c.label)}</span><button class="icon-btn xs" data-mv="${i}" data-dir="-1" aria-label="Move up" ${i ? '' : 'disabled'}>${TMD.icon('sortAsc')}</button><button class="icon-btn xs" data-mv="${i}" data-dir="1" aria-label="Move down" ${i < chosen.length - 1 ? '' : 'disabled'}>${TMD.icon('sortDesc')}</button><button class="icon-btn xs" data-rm="${esc(c.id)}" aria-label="Remove">${TMD.icon('x')}</button></li>`).join('') || '<li class="muted">No columns selected</li>'}</ol>
          <div class="col-avail"><input class="inp inp-sm" type="search" data-cfind placeholder="Find a column to add…"><div class="ms-list">${rest.map((c) => `<button class="ms-opt add-col" data-add="${esc(c.id)}">${TMD.icon('plus')}<span class="ms-l">${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}${esc(c.label)}</span></button>`).join('')}</div></div>
        </div></section>
      <section class="card gen-prev wide"><header class="card-h"><div><h3>Preview</h3><p class="card-sub">First rows of each group</p></div></header><div class="rep-scroll">${prev.html}</div></section></div>`;
  }

  TMD.reports = { render };
  TMD.initReports = function () {
    const host = TMD.$('#page-reports');
    host.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-rtab]'); if (t) { V.tab = t.dataset.rtab; render(); return; }
      const pt = e.target.closest('[data-ptype]'); if (pt) { V.period = pt.dataset.ptype; V.key = null; renderPeriodic(); return; }
      const pr = e.target.closest('[data-pr]');
      if (pr) {
        const p = TMD.$('#repBody')._period;
        if (pr.dataset.pr === 'xlsx') periodExcel(p);
        else { const doc = wrapDoc(`${p.label} report`, periodHtml(p, true)); if (pr.dataset.pr === 'html') TMD.downloadBlob(new Blob([doc], { type: 'text/html;charset=utf-8' }), `Tender_${p.key}_Report_${TMD.stamp()}.html`); else TMD.showPrintable(doc, `${p.label} report`, `Tender_${p.key}_Report`); }
        return;
      }
      const g = e.target.closest('[data-gen]');
      if (g) {
        const a = g.dataset.gen;
        if (a === 'std') { GEN.cols = defaultCols(); renderGenerator(); }
        if (a === 'none') { GEN.cols = []; renderGenerator(); }
        if (a === 'xlsx') genExcel();
        if (a === 'csv') genCsv();
        if (a === 'print' || a === 'html') { const doc = wrapDoc(GEN.title, genHtml().html); if (a === 'html') TMD.downloadBlob(new Blob([doc], { type: 'text/html;charset=utf-8' }), `${GEN.title.replace(/[^A-Za-z0-9]+/g, '_')}_${TMD.stamp()}.html`); else TMD.showPrintable(doc, GEN.title, GEN.title.replace(/[^A-Za-z0-9]+/g, '_')); }
        if (a === 'saveTpl') { const name = await TMD.prompt('Save report template', 'Template name', GEN.title); if (name && name.trim()) { const list = templates().filter((x) => x.name !== name.trim()); list.push({ name: name.trim(), gen: TMD.deepClone(GEN) }); TMD.ls.set('reportTemplates', list); TMD.toast('Template saved.', 'success'); renderGenerator(); } }
        return;
      }
      const mv = e.target.closest('[data-mv]'); if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.dir; const x = GEN.cols.splice(i, 1)[0]; GEN.cols.splice(j, 0, x); renderGenerator(); return; }
      const rm = e.target.closest('[data-rm]'); if (rm) { GEN.cols = GEN.cols.filter((id) => id !== rm.dataset.rm); renderGenerator(); return; }
      const ad = e.target.closest('[data-add]'); if (ad) { GEN.cols.push(ad.dataset.add); renderGenerator(); }
    });
    host.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.pkey !== undefined) { V.key = t.value; renderPeriodic(); return; }
      if (t.dataset.tpl !== undefined && t.value !== '') { const tp = templates()[+t.value]; if (tp) { Object.assign(GEN, TMD.deepClone(tp.gen)); renderGenerator(); } return; }
      if (t.dataset.g) { GEN[t.dataset.g] = t.type === 'checkbox' ? t.checked : t.value; renderGenerator(); }
    });
    host.addEventListener('input', (e) => { if (e.target.dataset.cfind !== undefined) { const q = e.target.value.toLowerCase(); TMD.$$('.add-col', host).forEach((b) => { b.hidden = b.textContent.toLowerCase().indexOf(q) < 0; }); } });
  };
})();
