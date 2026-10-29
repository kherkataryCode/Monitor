/* =====================================================================
 * data-quality.js — Data Quality page. Lists findings with severity,
 * worksheet, row, identifier, field, problem and suggested correction.
 * Suggestions never change data automatically.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const V = { sev: '', code: '', sheet: '', q: '', page: 0, useFilters: false, mod: 'tender' };
  const PAGE = 200;
  const CODE_LABEL = {
    'missing-pr': 'Missing PR number', 'missing-wbs': 'Missing WBS', 'missing-channel': 'Missing procurement channel', 'missing-dept': 'Missing department', 'missing-initiator': 'Missing tender initiator',
    'missing-float': 'Missing tender floating date', 'missing-opening': 'Missing tender opening date', 'missing-crfq': 'Missing CRFQ/GeM ID', 'missing-po': 'Missing PO/OLA number after award', 'missing-vendor': 'Missing vendor after award',
    'dup-pr': 'Duplicate PR number', 'dup-crfq': 'Duplicate CRFQ/GeM ID', 'dup-po': 'Duplicate PO/OLA number', 'invalid-date': 'Invalid dates', 'mdy-date': 'Dates in inconsistent format (mm/dd)', 'ambiguous-date': 'Ambiguous dates',
    'serial-date': 'Excel serial numbers in date columns', 'text-date': 'Text in date columns', 'seq-open-float': 'Opening earlier than floating', 'seq-award-open': 'Award earlier than opening', 'seq-validity': 'Expiry earlier than award',
    'seq-tech-open': 'Evaluation earlier than opening', 'seq-float-pr': 'Floated before PR sent', 'future-award': 'Award date in future', 'neg-duration': 'Negative duration', 'cost-text': 'Cost fields containing text', 'cost-mixed': 'Cost fields mixing text and numbers',
    'completed-blank': 'Completed but completion details blank', 'award-no-po': 'Status indicates award, PO/OLA blank', 'status-remarks': 'Contradictory status and remarks', 'conflict': 'Status/date conflict',
    'needs-review': 'Stage needs review', spelling: 'Potential spelling inconsistency', 'blank-header': 'Blank source headers', 'dup-header': 'Duplicate source headers',
  };
  const SEV = { high: 0, medium: 1, low: 2 };

  function collect(modId) {
    const mod = TMD.modules[modId || V.mod];
    const st = mod.state;
    if (!st.workbook) return [];
    const recs = V.useFilters ? st.filtered : st.records;
    const out = [];
    st.activeSheets.forEach((n) => TMD.sheetIssues(st.workbook.sheets[n]).forEach((q) => out.push(Object.assign({ rec: null }, q))));
    recs.forEach((r) => r.calc.dq.forEach((q) => out.push({ rec: r, sev: q.sev, sheet: r.sheet, rowNum: r.rowNum, ident: r.calc.ident, field: q.field, msg: q.msg, suggestion: q.suggestion, code: q.code })));
    out.sort((a, b) => SEV[a.sev] - SEV[b.sev] || String(a.sheet).localeCompare(b.sheet) || (a.rowNum || 0) - (b.rowNum || 0));
    return out;
  }
  TMD.dqCount = (m) => (TMD.modules[m || 'tender'].state.records || []).filter((r) => r.calc && r.calc.dq.length).length;

  function render() {
    const host = TMD.$('#page-quality');
    if (TMD.qualityModule) { if (TMD.qualityModule !== V.mod) { V.sev = ''; V.code = ''; V.sheet = ''; V.page = 0; } V.mod = TMD.qualityModule; TMD.qualityModule = null; }
    const mod = TMD.modules[V.mod];
    const LBL = V.mod === 'cyber' ? TMD.CYBER_DQ_LABEL : CODE_LABEL;
    const all = collect();
    const q = V.q.trim().toLowerCase();
    const list = all.filter((x) => (!V.sev || x.sev === V.sev) && (!V.code || x.code === V.code) && (!V.sheet || x.sheet === V.sheet) && (!q || `${x.ident} ${x.field} ${x.msg}`.toLowerCase().indexOf(q) >= 0));
    const codes = new Map();
    all.forEach((x) => codes.set(x.code, (codes.get(x.code) || 0) + 1));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    V.page = Math.min(V.page, pages - 1);
    const slice = list.slice(V.page * PAGE, V.page * PAGE + PAGE);
    const recsWith = new Set(all.filter((x) => x.rec).map((x) => x.rec.id)).size;
    const recs = V.useFilters ? mod.state.filtered : mod.state.records;
    const avgScore = recs.length ? Math.round(recs.reduce((s, r) => s + r.calc.dqScore, 0) / recs.length) : 100;
    host.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">System</div><h2>Data Quality</h2><p class="muted">Findings are suggestions only — nothing is changed automatically. Fix values after unlocking editing, or in the source workbook.</p>
        <div class="tabs mod-tabs" role="tablist">${['tender', 'cyber'].map((m) => `<button class="tab ${V.mod === m ? 'active' : ''}" data-mod="${m}" role="tab" aria-selected="${V.mod === m}">${TMD.icon(m === 'cyber' ? 'shield' : 'file')} ${esc(TMD.modules[m].label)} <span class="tag">${TMD.dqCount(m)}</span></button>`).join('')}</div></div>
        <div class="page-actions"><label class="chk"><input type="checkbox" id="dqUseFilters" ${V.useFilters ? 'checked' : ''}> Apply global filters</label>
          <button class="btn subtle" data-a="report">${TMD.icon('file')}<span>Import report</span></button>
          <button class="btn subtle" data-a="csv">${TMD.icon('download')}<span>Export findings (CSV)</span></button></div></div>
      <div class="sev-cards">
        <div class="sev-card info"><span class="sev-n">${avgScore}</span><span>Average quality score</span></div>
        <div class="sev-card info"><span class="sev-n">${recsWith}</span><span>Records with findings</span></div>
        ${['high', 'medium', 'low'].map((s) => `<button class="sev-card sev-${s} ${V.sev === s ? 'active' : ''}" data-sev="${s}">${TMD.icon(s === 'high' ? 'alert' : s === 'medium' ? 'clock' : 'info')}<span class="sev-n">${all.filter((x) => x.sev === s).length}</span><span>${s[0].toUpperCase() + s.slice(1)} severity</span></button>`).join('')}
      </div>
      <div class="toolbar-row">
        <div class="tb-group">
          <label class="tb-sel">Check<select class="inp inp-sm" data-v="code"><option value="">All checks</option>${Array.from(codes.entries()).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<option value="${esc(c)}" ${V.code === c ? 'selected' : ''}>${esc(LBL[c] || CODE_LABEL[c] || c)} (${n})</option>`).join('')}</select></label>
          <label class="tb-sel">Worksheet<select class="inp inp-sm" data-v="sheet"><option value="">All</option>${mod.state.activeSheets.map((s) => `<option ${V.sheet === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <input class="inp inp-sm" type="search" data-v="q" value="${esc(V.q)}" placeholder="Search findings…" aria-label="Search findings">
        </div>
        <div class="muted">${TMD.fmtInt(list.length)} finding(s)</div>
      </div>
      <section class="card"><div class="table-wrap"><table class="data-table hover dq-table"><thead><tr><th>Severity</th><th>Worksheet</th><th class="num">Row</th><th>${V.mod === 'cyber' ? 'Record' : 'Tender identifier'}</th><th>Affected field</th><th>Problem</th><th>${V.mod === 'cyber' ? 'Suggested review' : 'Suggested correction'}</th><th></th></tr></thead><tbody>
      ${slice.map((x) => `<tr ${x.rec ? `data-rec="${esc(x.rec.id)}"` : ''}><td><span class="sev-pill sev-${x.sev}">${TMD.icon(x.sev === 'high' ? 'alert' : x.sev === 'medium' ? 'clock' : 'info')}${esc(x.sev)}</span></td><td>${esc(x.sheet)}</td><td class="num">${esc(x.rowNum)}</td><td>${esc(x.ident)}</td><td>${esc(x.field)}</td><td>${esc(x.msg)}</td><td class="muted">${esc(x.suggestion)}</td><td>${x.rec ? '<button class="btn subtle sm" data-open="1">Open record</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="pad muted">No findings for the current selection.</td></tr>'}
      </tbody></table></div>
      ${pages > 1 ? `<div class="pager"><button class="btn subtle sm" data-pg="-1" ${V.page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${V.page + 1} of ${pages}</span><button class="btn subtle sm" data-pg="1" ${V.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}</section>`;
    host._list = list;
  }

  function exportCsv() {
    const list = TMD.$('#page-quality')._list || collect();
    const protect = TMD.settings.get('csvProtect');
    const lines = [['Severity', 'Worksheet', 'Row', 'Tender identifier', 'Affected field', 'Problem', 'Suggested correction'].join(',')]
      .concat(list.map((x) => [x.sev, x.sheet, x.rowNum, x.ident, x.field, x.msg, x.suggestion].map((v) => TMD.csvCell(v, protect)).join(',')));
    TMD.downloadText(lines.join('\r\n'), `Data_Quality_Report_${V.mod}_${TMD.stamp()}.csv`);
  }
  TMD.dataQuality = { render, collect, CODE_LABEL, setModule: (m) => { V.mod = m; } };
  TMD.initDataQuality = function () {
    const host = TMD.$('#page-quality');
    host.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sev]'); if (s) { V.sev = V.sev === s.dataset.sev ? '' : s.dataset.sev; V.page = 0; render(); return; }
      const pg = e.target.closest('[data-pg]'); if (pg) { V.page += +pg.dataset.pg; render(); return; }
      const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'csv') exportCsv();
      if (a && a.dataset.a === 'report') TMD.showImportReport(TMD.modules[V.mod].state.workbook);
      const mt = e.target.closest('[data-mod]'); if (mt) { V.mod = mt.dataset.mod; V.sev = ''; V.code = ''; V.sheet = ''; V.page = 0; render(); return; }
      if (e.target.closest('[data-open]')) { const r = e.target.closest('[data-rec]'); const mod = TMD.modules[V.mod]; const rec = mod.state.records.find((x) => x.id === r.dataset.rec); if (rec) mod.openDetails(rec); }
    });
    host.addEventListener('change', (e) => {
      if (e.target.id === 'dqUseFilters') { V.useFilters = e.target.checked; render(); return; }
      const v = e.target.dataset.v; if (v && v !== 'q') { V[v] = e.target.value; V.page = 0; render(); }
    });
    host.addEventListener('input', TMD.debounce((e) => { if (e.target.dataset.v === 'q') { V.q = e.target.value; V.page = 0; const pos = e.target.selectionStart; render(); const i = host.querySelector('[data-v="q"]'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 250));
  };
})();
