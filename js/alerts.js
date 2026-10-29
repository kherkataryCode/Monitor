/* =====================================================================
 * alerts.js — offline alerts computed from the system date.
 * Alerts exist only inside this application. No e-mail, SMS or online
 * notification is sent.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const V = { sev: '', type: '', useFilters: true };
  const SEV_ORDER = { high: 0, medium: 1, low: 2 };

  function collect() {
    const recs = V.useFilters ? TMD.state.filtered : TMD.state.records;
    const out = [];
    recs.forEach((r) => {
      r.calc.alerts.forEach((a) => { if (!a.silent) out.push({ r, a }); });
      // Missing key data (from data-quality findings)
      r.calc.dq.filter((q) => /^missing-(pr|crfq|po|vendor|float|opening)/.test(q.code)).forEach((q) => out.push({ r, a: { sev: 'low', type: 'Missing key data', msg: q.msg } }));
    });
    out.sort((x, y) => SEV_ORDER[x.a.sev] - SEV_ORDER[y.a.sev] || x.a.type.localeCompare(y.a.type));
    return out;
  }
  TMD.alertCount = () => { let n = 0; TMD.state.records.forEach((r) => r.calc && r.calc.alerts.forEach((a) => { if (!a.silent && a.sev !== 'low') n++; })); return n; };

  function render() {
    const host = TMD.$('#page-alerts');
    const all = collect();
    const types = new Map();
    all.forEach(({ a }) => { const t = types.get(a.type) || types.set(a.type, { n: 0, sev: a.sev }).get(a.type); t.n++; if (SEV_ORDER[a.sev] < SEV_ORDER[t.sev]) t.sev = a.sev; });
    const list = all.filter(({ a }) => (!V.sev || a.sev === V.sev) && (!V.type || a.type === V.type));
    const cnt = (s) => all.filter(({ a }) => a.sev === s).length;
    host.innerHTML = `
      <div class="page-head"><div><h2>Alerts</h2><p class="muted">Calculated offline from the system date (${esc(TMD.fmtDate(TMD.today()))}). Alerts are shown only inside this application — no e-mail, SMS or online notifications are sent.</p></div>
        <div class="page-actions"><label class="chk"><input type="checkbox" id="alUseFilters" ${V.useFilters ? 'checked' : ''}> Apply global filters</label><a class="btn subtle" href="#settings">${TMD.icon('settings')}<span>Thresholds</span></a></div></div>
      <div class="sev-cards">
        ${[['high', 'High', 'alert'], ['medium', 'Medium', 'clock'], ['low', 'Low', 'info']].map(([s, l, i]) => `<button class="sev-card sev-${s} ${V.sev === s ? 'active' : ''}" data-sev="${s}">${TMD.icon(i)}<span class="sev-n">${cnt(s)}</span><span>${l} severity</span></button>`).join('')}
      </div>
      <div class="type-chips">${Array.from(types.entries()).sort((a, b) => SEV_ORDER[a[1].sev] - SEV_ORDER[b[1].sev] || b[1].n - a[1].n).map(([t, o]) => `<button class="type-chip sev-${o.sev} ${V.type === t ? 'active' : ''}" data-type="${esc(t)}">${esc(t)} <strong>${o.n}</strong></button>`).join('')}
        ${V.sev || V.type ? '<button class="linklike" data-clear="1">Clear alert filters</button>' : ''}</div>
      <section class="card"><div class="table-wrap"><table class="data-table hover"><thead><tr><th>Severity</th><th>Alert</th><th>Tender</th><th>Details</th><th>Stage</th><th>Dept</th><th></th></tr></thead><tbody>
      ${list.slice(0, 1000).map(({ r, a }) => `<tr data-rec="${esc(r.id)}" tabindex="0"><td><span class="sev-pill sev-${a.sev}">${TMD.icon(a.sev === 'high' ? 'alert' : a.sev === 'medium' ? 'clock' : 'info')}${esc(a.sev)}</span></td><td><strong>${esc(a.type)}</strong></td><td><div class="cell-title">${esc(r.calc.title)}</div><div class="muted small">${esc(r.sheet)} · row ${r.rowNum} · ${esc(r.calc.ident)}</div></td><td class="small">${esc(a.msg)}</td><td>${TMD.stageBadge(r.calc.stage)}</td><td>${esc(r.calc.department)}</td><td><button class="btn subtle sm">Open</button></td></tr>`).join('') || '<tr><td colspan="7" class="pad muted">No alerts for the current selection.</td></tr>'}
      </tbody></table></div>${list.length > 1000 ? `<p class="muted small pad">Showing first 1,000 of ${list.length}.</p>` : ''}</section>`;
  }
  TMD.alertsPage = { render };
  TMD.initAlerts = function () {
    const host = TMD.$('#page-alerts');
    host.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sev]'); if (s) { V.sev = V.sev === s.dataset.sev ? '' : s.dataset.sev; render(); return; }
      const t = e.target.closest('[data-type]'); if (t) { V.type = V.type === t.dataset.type ? '' : t.dataset.type; render(); return; }
      if (e.target.closest('[data-clear]')) { V.sev = ''; V.type = ''; render(); return; }
      const r = e.target.closest('[data-rec]'); if (r) { const rec = TMD.state.records.find((x) => x.id === r.dataset.rec); if (rec) TMD.details.open(rec); }
    });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('tr[data-rec]'); if (r) r.click(); } });
    host.addEventListener('change', (e) => { if (e.target.id === 'alUseFilters') { V.useFilters = e.target.checked; render(); } });
  };
})();
