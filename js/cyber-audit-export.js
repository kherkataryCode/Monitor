/* =====================================================================
 * cyber-audit-export.js — independent Cyber Audit exports:
 * register (full / filtered / open / overdue / closure report / selected),
 * management summary (printable HTML), action tracker, change log.
 * Original source columns are preserved; calculated columns only on request.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;
  const S = M.state;

  const CALC_DEFS = () => [
    { label: '[Calc] Calculated Status', get: (r) => r.calc.statusLabel },
    { label: '[Calc] Original Status', get: (r) => r.calc.originalStatus },
    { label: '[Calc] Severity (normalised)', get: (r) => r.calc.severity },
    { label: '[Calc] Suggested Severity', get: (r) => (r.calc.suggestedSeverity ? r.calc.suggestedSeverity + ' (Suggested)' : '') },
    { label: '[Calc] Calculated Cyber Domain', get: (r) => r.calc.calcDomain + (r.calc.domainSource === 'keywords' ? ' (suggested)' : '') },
    { label: '[Calc] Effective Target Date', get: (r) => (r.calc.effTarget ? TMD.fmtDate(r.calc.effTarget) : '') },
    { label: '[Calc] Overdue', get: (r) => (r.calc.overdue ? 'Yes' : 'No') },
    { label: '[Calc] Days Overdue', get: (r) => (r.calc.overdue ? r.calc.daysOverdue : '') },
    { label: '[Calc] Days Remaining', get: (r) => (r.calc.daysRemaining === null ? '' : r.calc.daysRemaining) },
    { label: '[Calc] Observation Age (days)', get: (r) => (r.calc.age === null ? '' : r.calc.age) },
    { label: '[Calc] Aging Bucket', get: (r) => r.calc.ageBucket },
    { label: '[Calc] Closure Duration (days)', get: (r) => (r.calc.closureDuration === null ? '' : r.calc.closureDuration) },
    { label: '[Calc] Management Attention', get: (r) => r.calc.attention.join('; ') },
  ];
  const SCOPES = {
    register: { label: 'Audit register — all observations', test: () => true },
    filtered: { label: 'Filtered observations (current view)', filtered: true },
    open: { label: 'Open observations (not closed)', test: (r) => r.calc.open },
    overdue: { label: 'Overdue observations', test: (r) => r.calc.overdue },
    closure: { label: 'Closure report (closed observations)', test: (r) => r.calc.closed },
    selected: { label: 'Selected rows', selected: true },
  };
  function scopeRows(scope) {
    const sc = SCOPES[scope] || SCOPES.register;
    if (sc.filtered) return S.filtered.slice();
    if (sc.selected) return S.records.filter((r) => S.selection.has(r.id));
    return S.records.filter(sc.test);
  }
  function trackerAoa(recs) {
    const head = ['Observation ID', 'Audit', 'Location', 'Observation', 'Severity', 'Action Required', 'Action Owner', 'Pending With', 'Target Date', 'Revised Target', 'Current Status (calculated)', 'Original Status', 'Evidence Status', 'Days Remaining', 'Days Overdue', 'Next Follow-up', 'Attention'];
    const g = (r, f) => { const v = TMD.getStd(r, f); return v === undefined || v === null ? '' : TMD.cellText(v); };
    return [head].concat(recs.filter((r) => r.calc.open).map((r) => [r.calc.obsId, r.calc.auditName, r.calc.location, r.calc.text, r.calc.severity, g(r, 'actionRequired') || g(r, 'correctiveAction') || g(r, 'remediationPlan'), r.calc.owner, r.calc.pendingWith,
      r.calc.d.target ? TMD.fmtDate(r.calc.d.target) : '', r.calc.d.revised ? TMD.fmtDate(r.calc.d.revised) : '', r.calc.statusLabel, r.calc.originalStatus, r.calc.evidenceStatus,
      r.calc.daysRemaining === null ? '' : r.calc.daysRemaining, r.calc.overdue ? r.calc.daysOverdue : '', r.calc.d.nextFU ? TMD.fmtDate(r.calc.d.nextFU) : '', r.calc.attention.join('; ')]));
  }
  function summaryAoa(recs) {
    const st = TMD.cyberStats(recs);
    const aoa = [['Cyber Security Audit — Dashboard Summary'], [`Generated locally ${new Date().toLocaleString('en-IN')} · source ${S.workbook.fileName}`], [], ['Indicator', 'Value']];
    aoa.push(['Total Observations', st.total], ['Open', st.open], ['In Progress', st.inprog], ['Closed', st.closed], ['Overdue', st.overdue], ['Critical', st.critical], ['High', st.high], ['Closure %', st.closurePct], ['Open %', st.openPct], ['Overdue %', st.overduePct]);
    aoa.push([], ['Indicator (dashboard)', 'Count']);
    TMD.CYBER_KPI.forEach((k) => aoa.push([k.label, recs.filter((r) => k.test(r.calc, r)).length]));
    aoa.push([], ['Calculated status', 'Count']);
    TMD.CSTATUS.slice(1).forEach((s) => { const n = recs.filter((r) => r.calc.cstatus === s.n).length; if (n) aoa.push([s.label, n]); });
    return aoa;
  }

  async function exportExcel(o) {
    const X = window.XLSX, W = TMD.xlsxWriters;
    TMD.progress('Building Cyber Audit workbook…');
    await TMD.nextFrame();
    try {
      const out = X.utils.book_new();
      const used = new Set();
      const rows = scopeRows(o.scope);
      const ids = new Set(rows.map((r) => r.id));
      const wb = S.workbook;
      const optsW = { realDates: o.realDates, calcDefs: o.calcCols ? CALC_DEFS() : null };
      wb.sheetNames.forEach((name) => {
        const sh = wb.sheets[name];
        if (sh) {
          const sr = sh.rows.filter((r) => ids.has(r.id));
          if (!sr.length && S.activeSheets.indexOf(name) < 0) return;
          const label = o.scope === 'register' ? 'Cyber Audit Register' : SCOPES[o.scope] ? SCOPES[o.scope].label.replace(/\s*[—(].*$/, '') : name;
          X.utils.book_append_sheet(out, W.writeLoadedSheet(sh, sr, optsW), W.uniqueName(S.activeSheets.length > 1 ? name : label, used));
        } else if (o.otherSheets && o.scope === 'register' && wb.raw[name]) X.utils.book_append_sheet(out, W.writeRawSheet(wb.raw[name]), W.uniqueName(name, used));
      });
      const all = S.records;
      if (o.summary) X.utils.book_append_sheet(out, W.aoaSheet(summaryAoa(o.scope === 'filtered' ? S.filtered : all), [40, 14]), W.uniqueName('Dashboard Summary', used));
      if (o.openSheet) { const sh0 = wb.sheets[S.activeSheets[0]]; X.utils.book_append_sheet(out, W.writeLoadedSheet(sh0, sh0.rows.filter((r) => r.calc.open), optsW), W.uniqueName('Open Observations', used)); }
      if (o.overdueSheet) { const sh0 = wb.sheets[S.activeSheets[0]]; X.utils.book_append_sheet(out, W.writeLoadedSheet(sh0, sh0.rows.filter((r) => r.calc.overdue), optsW), W.uniqueName('Overdue', used)); }
      if (o.tracker) X.utils.book_append_sheet(out, W.aoaSheet(trackerAoa(all), [14, 26, 14, 50, 10, 40, 24, 16, 12, 12, 26, 20, 16, 10, 10, 12, 40]), W.uniqueName('Action Tracker', used));
      if (o.dq) {
        const list = TMD.dataQuality.collect('cyber');
        X.utils.book_append_sheet(out, W.aoaSheet([['Severity', 'Worksheet', 'Row', 'Record', 'Field', 'Problem', 'Suggested review']].concat(list.map((x) => [x.sev, x.sheet, x.rowNum, x.ident, x.field, x.msg, x.suggestion])), [10, 16, 6, 20, 24, 60, 50]), W.uniqueName('Data Quality', used));
      }
      if (o.changeLog) X.utils.book_append_sheet(out, W.aoaSheet(M.audit.toAoa(), [20, 18, 16, 16, 6, 24, 28, 40, 40]), W.uniqueName('Change Log', used));
      X.utils.book_append_sheet(out, W.aoaSheet([['Export information'], ['Generated (local time)', new Date().toLocaleString('en-IN')], ['Source file', wb.fileName], ['Scope', SCOPES[o.scope].label + (o.scope === 'filtered' ? ' — ' + M.filters.text() : '')], ['Observations exported', rows.length],
        ['Calculated columns included', o.calcCols ? 'Yes ([Calc] prefix — not part of the source data)' : 'No'], ['Note', 'Generated offline by the Cyber Security Audit module. The original imported workbook was not modified.'], ...(wb.isDemo ? [['WARNING', 'DEMONSTRATION DATA — fictitious records']] : [])], [32, 90]), W.uniqueName('Export Info', used));
      const data = X.write(out, { bookType: 'xlsx', type: 'array', compression: true });
      const fname = o.filename || `Cyber_Audit_Tracker_${o.scope}_${TMD.stamp()}.xlsx`;
      TMD.downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
      M.audit.log({ action: 'EXPORT', field: 'Excel export', newValue: `${fname} — ${rows.length} observation(s)` });
      TMD.progress(false);
      TMD.toast(`Downloaded ${fname}. The original file was not modified.`, 'success', 4500);
      return true;
    } catch (e) {
      console.error(e); TMD.progress(false); TMD.toast('Export failed: ' + e.message, 'error', 6000); return false;
    }
  }

  async function openDialog(scope) {
    if (!S.workbook) return false;
    const sc = scope && SCOPES[scope] ? scope : 'register';
    const def = `Cyber_Audit_Tracker_Updated_${TMD.stamp()}.xlsx`;
    const body = `<fieldset class="fgroup"><legend>Observations</legend>${Object.keys(SCOPES).map((k) => { const n = scopeRows(k).length; return `<label class="chk"><input type="radio" name="cxs" value="${k}" ${k === sc ? 'checked' : ''} ${k === 'selected' && !n ? 'disabled' : ''}> ${esc(SCOPES[k].label)} <span class="muted">(${n})</span></label>`; }).join('')}</fieldset>
      <fieldset class="fgroup"><legend>Include sheets</legend>
        <label class="chk"><input type="checkbox" id="cxSummary" checked> Dashboard Summary</label>
        <label class="chk"><input type="checkbox" id="cxOpen"> Open Observations</label>
        <label class="chk"><input type="checkbox" id="cxOverdue"> Overdue</label>
        <label class="chk"><input type="checkbox" id="cxTracker" checked> Action Tracker</label>
        <label class="chk"><input type="checkbox" id="cxDq" checked> Data Quality</label>
        <label class="chk"><input type="checkbox" id="cxLog" checked> Change Log</label>
        <label class="chk"><input type="checkbox" id="cxOther" checked> Preserve other original worksheets (full register export)</label></fieldset>
      <fieldset class="fgroup"><legend>Options</legend>
        <label class="chk"><input type="checkbox" id="cxCalc"> Add calculated columns ([Calc] status, overdue, aging, domain…)</label>
        <label class="chk"><input type="checkbox" id="cxDates" checked> Write recognised dates as Excel dates</label></fieldset>
      <label class="field"><span>File name</span><input class="inp" id="cxName" value="${esc(def)}"></label>`;
    let o = null;
    const res = await TMD.modal({ title: 'Export Cyber Audit data (.xlsx)', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Download Excel', value: 'ok', kind: 'primary' }],
      beforeClose: (v, d) => {
        if (v === 'ok') {
          const q = (s) => d.querySelector(s);
          let name = q('#cxName').value.trim() || def; name = name.replace(/[\\/:*?"<>|]/g, '_'); if (!/\.xlsx$/i.test(name)) name += '.xlsx';
          o = { scope: d.querySelector('input[name=cxs]:checked').value, summary: q('#cxSummary').checked, openSheet: q('#cxOpen').checked, overdueSheet: q('#cxOverdue').checked, tracker: q('#cxTracker').checked, dq: q('#cxDq').checked, changeLog: q('#cxLog').checked, otherSheets: q('#cxOther').checked, calcCols: q('#cxCalc').checked, realDates: q('#cxDates').checked, filename: name };
        }
        return true;
      } });
    if (res !== 'ok' || !o) return false;
    return exportExcel(o);
  }

  function exportPreset(kind) {
    if (kind === 'tracker') return exportExcel({ scope: 'open', tracker: true, summary: false, dq: false, changeLog: false, realDates: true, filename: `Cyber_Audit_Action_Tracker_${TMD.stamp()}.xlsx` });
    if (kind === 'changelog') { TMD.downloadText(M.audit.toCsv(), `Cyber_Audit_Change_Log_${TMD.stamp()}.csv`); TMD.toast('Change log downloaded.', 'success'); return true; }
    return exportExcel({ scope: kind, summary: true, tracker: false, dq: false, changeLog: false, realDates: true, calcCols: true, filename: `Cyber_Audit_${kind}_${TMD.stamp()}.xlsx` });
  }
  function csvExport() {
    const sheet = S.workbook.sheets[S.activeSheets[0]];
    const ids = new Set(S.filtered.map((r) => r.id));
    const rows = sheet.rows.filter((r) => ids.has(r.id));
    const protect = TMD.settings.get('csvProtect');
    const calc = CALC_DEFS();
    const lines = [sheet.headers.map((h) => TMD.csvCell(h.label, protect)).concat(calc.map((c) => TMD.csvCell(c.label))).join(',')];
    rows.forEach((r) => lines.push(sheet.headers.map((h) => TMD.csvCell(TMD.cellText(r.values[h.key]), protect)).concat(calc.map((c) => TMD.csvCell(c.get(r), protect))).join(',')));
    TMD.downloadText(lines.join('\r\n'), `Cyber_Audit_Observations_${TMD.stamp()}.csv`);
    TMD.toast(`Downloaded ${rows.length} filtered observation(s) as CSV.`, 'success');
    return true;
  }

  function summaryHtml() {
    const recs = S.filtered;
    const st = TMD.cyberStats(recs);
    const T = TMD.today();
    const att = recs.filter((r) => r.calc.attention.length).sort((a, b) => TMD.SEV_ORDER.indexOf(a.calc.severity) - TMD.SEV_ORDER.indexOf(b.calc.severity));
    const by = (fn) => { const m = new Map(); recs.forEach((r) => { const k = fn(r) || '(Blank)'; const o = m.get(k) || m.set(k, { n: 0, open: 0, od: 0, ch: 0 }).get(k); o.n++; if (r.calc.open) o.open++; if (r.calc.overdue) o.od++; if (r.calc.open && (r.calc.severity === 'Critical' || r.calc.severity === 'High')) o.ch++; }); return Array.from(m.entries()).sort((a, b) => b[1].open - a[1].open); };
    const tbl = (title, rows) => `<h2>${title}</h2><table><thead><tr><th></th><th class="n">Total</th><th class="n">Open</th><th class="n">Overdue</th><th class="n">Critical/High open</th></tr></thead><tbody>${rows.map(([k, o]) => `<tr><td>${esc(k)}</td><td class="n">${o.n}</td><td class="n">${o.open}</td><td class="n ${o.od ? 'red' : ''}">${o.od}</td><td class="n ${o.ch ? 'red' : ''}">${o.ch}</td></tr>`).join('')}</tbody></table>`;
    const card = (l, v) => `<div class="sk"><div class="skl">${esc(l)}</div><div class="skv">${esc(v)}</div></div>`;
    return `<!DOCTYPE html><html lang="en-IN"><head><meta charset="utf-8"><title>Cyber Security Audit — Management Summary</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;margin:24px;font-size:12.5px;line-height:1.45}h1{font-size:20px;margin:0 0 2px;color:#0b1f3a}h2{font-size:14px;color:#0b1f3a;border-bottom:2px solid #0f766e;padding-bottom:3px;margin:22px 0 8px}.meta{color:#6e6e73}.demo{background:#fff4d6;border:1px solid #e3b341;padding:6px 10px;border-radius:6px;margin:8px 0;font-weight:600}.skgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sk{border:1px solid #d2d2d7;border-radius:10px;padding:8px 10px}.skl{color:#6e6e73;font-size:11px}.skv{font-size:18px;font-weight:650}table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border:1px solid #d2d2d7;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f5f5f7}.n{text-align:right}.red{color:#b42318;font-weight:600}.note{color:#6e6e73;font-size:11px;margin-top:18px}@media print{body{margin:10mm}tr{break-inside:avoid}}</style></head><body>
<h1>Cyber Security Audit Monitoring — Management Summary</h1>
<div class="meta">${esc(TMD.settings.get('orgName'))} · As on ${esc(TMD.fmtDate(T))} · Source: ${esc(S.workbook.fileName)} · ${recs.length} of ${S.records.length} observations${M.filters.activeCount() ? ' · Filters: ' + esc(M.filters.text()) : ''}</div>
${S.workbook.isDemo ? '<div class="demo">DEMONSTRATION DATA — fictitious records</div>' : ''}
<h2>Cyber Security Audit Status</h2><div class="skgrid">${card('Total observations', st.total)}${card('Open', st.open)}${card('In progress', st.inprog)}${card('Closed', st.closed)}${card('Overdue', st.overdue)}${card('Critical', st.critical)}${card('High', st.high)}${card('Closure %', TMD.fmtNum(st.closurePct, 1) + '%')}</div>
${tbl('By location', by((r) => r.calc.location))}
${tbl('By audit', by((r) => r.calc.auditName))}
<h2>Management attention (${att.length})</h2><table><thead><tr><th>ID</th><th>Observation</th><th>Severity</th><th>Location</th><th>Owner</th><th>Status</th><th>Why</th></tr></thead><tbody>${att.slice(0, 40).map((r) => `<tr><td>${esc(r.calc.obsId)}</td><td>${esc(r.calc.title)}</td><td>${esc(r.calc.severity)}</td><td>${esc(r.calc.location)}</td><td>${esc(r.calc.owner)}</td><td>${esc(r.calc.statusLabel)}</td><td>${esc(r.calc.attention.join('; '))}</td></tr>`).join('') || '<tr><td colspan="7">None</td></tr>'}</tbody></table>
<p class="note">Generated offline on ${esc(new Date().toLocaleString('en-IN'))}. Calculated status, overdue and aging are derived from the imported tracker; original values were not modified. Overdue = effective target (revised target if present, else target) earlier than today and not closed.</p></body></html>`;
  }
  function managementSummary() { TMD.showPrintable(summaryHtml(), 'Cyber audit management summary', 'Cyber_Audit_Management_Summary'); }

  function menu(anchor) {
    TMD.menu(anchor, [
      { header: 'Cyber Audit — Excel' },
      { label: 'Export audit register…', icon: 'download', action: () => openDialog('register') },
      { label: 'Export filtered observations…', icon: 'filter', action: () => openDialog('filtered') },
      { label: 'Export open observations', icon: 'circle', action: () => exportPreset('open') },
      { label: 'Export overdue observations', icon: 'clock', action: () => exportPreset('overdue') },
      { label: 'Export closure report', icon: 'check', action: () => exportPreset('closure') },
      { label: 'Export audit action tracker', icon: 'zap', action: () => exportPreset('tracker') },
      { header: 'Other' },
      { label: 'Export management summary (HTML / PDF)', icon: 'file', action: managementSummary },
      { label: 'Export filtered observations to CSV', icon: 'file', action: csvExport },
      { label: 'Export audit change log (CSV)', icon: 'history', action: () => exportPreset('changelog') },
      { label: 'Print dashboard / Save as PDF', icon: 'printer', action: () => { TMD.go('cyber'); setTimeout(() => { TMD.charts.renderAll(); setTimeout(() => window.print(), 400); }, 200); } },
    ], { alignRight: true });
  }

  TMD.cyber.exporter = { openDialog, exportExcel, exportPreset, csvExport, managementSummary, menu };
})();
