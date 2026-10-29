/* =====================================================================
 * analytics.js — summary tables (department, channel, initiator),
 * cycle-time statistics, estimate-vs-award variance, ageing charts.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;

  function stats(vals) {
    const a = vals.filter((v) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (!a.length) return { n: 0 };
    return { n: a.length, min: Math.min.apply(null, a), max: Math.max.apply(null, a), avg: a.reduce((s, x) => s + x, 0) / a.length, med: TMD.median(a) };
  }
  function summaryBy(recs, keyFn) {
    const m = new Map();
    recs.forEach((r) => {
      const k = keyFn(r) || '(Blank)';
      const o = m.get(k) || m.set(k, { k, n: 0, open: 0, delayed: 0, awarded: 0, completed: 0, est: 0, awval: 0, prpo: [], tech: [] }).get(k);
      o.n++;
      if (!r.calc.closed) o.open++;
      if (r.calc.delayed) o.delayed++;
      if (r.calc.awarded) { o.awarded++; o.awval += r.calc.awardedRupees || 0; }
      if (r.calc.stage === 22) o.completed++;
      o.est += (r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees) || 0;
      if (typeof r.calc.prToPo === 'number') o.prpo.push(r.calc.prToPo);
      if (typeof r.calc.techEvalDuration === 'number') o.tech.push(r.calc.techEvalDuration);
    });
    return Array.from(m.values()).sort((a, b) => b.n - a.n);
  }
  function summaryTable(title, rows, filterId) {
    const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
    const med = (arr) => { const m = TMD.median(arr); return m === null ? '—' : TMD.fmtInt(m); };
    return `<section class="card"><header class="card-h"><div><h3>${esc(title)}</h3><p class="card-sub">Click a row to filter</p></div></header>
      <div class="table-wrap"><table class="data-table hover"><thead><tr><th>${esc(title.replace(/ summary| performance| workload/i, ''))}</th><th class="num">Tenders</th><th class="num">Open</th><th class="num">Delayed</th><th class="num">Awarded</th><th class="num">Completed</th><th class="num">Est. cost</th><th class="num">Awarded value</th><th class="num">Median PR→PO (d)</th><th class="num">Median tech. eval (d)</th></tr></thead>
      <tbody>${rows.map((r) => `<tr ${filterId && r.k !== '(Blank)' ? `data-f="${filterId}" data-v="${esc(r.k)}" tabindex="0"` : ''}><td>${esc(r.k)}</td><td class="num">${r.n}</td><td class="num">${r.open}</td><td class="num ${r.delayed ? 'txt-red' : ''}">${r.delayed}</td><td class="num">${r.awarded}</td><td class="num">${r.completed}</td><td class="num" data-tip="${esc(TMD.fmtMoneyExact(r.est))}">${esc(TMD.fmtMoney(r.est))}</td><td class="num" data-tip="${esc(TMD.fmtMoneyExact(r.awval))}">${esc(TMD.fmtMoney(r.awval))}</td><td class="num">${med(r.prpo)}</td><td class="num">${med(r.tech)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="num">${sum('n')}</th><th class="num">${sum('open')}</th><th class="num">${sum('delayed')}</th><th class="num">${sum('awarded')}</th><th class="num">${sum('completed')}</th><th class="num">${esc(TMD.fmtMoney(sum('est')))}</th><th class="num">${esc(TMD.fmtMoney(sum('awval')))}</th><th></th><th></th></tr></tfoot></table></div></section>`;
  }

  function render() {
    const host = TMD.$('#page-analytics');
    const recs = TMD.state.filtered;
    const durations = [
      ['Tender floating duration (float → opening)', recs.map((r) => r.calc.floatDuration)],
      ['Technical evaluation duration (opening → BQC/technical)', recs.map((r) => r.calc.techEvalDuration)],
      ['PR-to-PO cycle (PR sent → award)', recs.map((r) => r.calc.prToPo)],
      ['Days since PR sent (open, not awarded)', recs.filter((r) => !r.calc.awarded && !r.calc.closed).map((r) => r.calc.daysSincePr)],
      ['Days since tender float (open, not awarded)', recs.filter((r) => !r.calc.awarded && !r.calc.closed).map((r) => r.calc.daysSinceFloat)],
      ['Days to PO/OLA expiry (awarded, not expired)', recs.filter((r) => r.calc.awarded).map((r) => r.calc.daysToExpiry)],
    ].map(([l, v]) => [l, stats(v)]);
    const variance = recs.filter((r) => r.calc.estVsAwardPct !== null && r.calc.awarded).sort((a, b) => Math.abs(b.calc.estVsAwardPct) - Math.abs(a.calc.estVsAwardPct)).slice(0, 15);
    const hasInit = recs.some((r) => TMD.hasStd(r, 'initiator'));
    host.innerHTML = `
      <div class="page-head"><div><h2>Analytics</h2><p class="muted">${TMD.fmtInt(recs.length)} record(s) in the current view. Durations are calculated from dates (source duration columns are used only when dates are missing).</p></div></div>
      <div class="chart-grid" id="anCharts"></div>
      ${summaryTable('Department summary', summaryBy(recs, (r) => r.calc.department), 'department')}
      ${summaryTable('Procurement channel performance', summaryBy(recs, (r) => r.calc.channel), 'channel')}
      ${hasInit ? summaryTable('Tender initiator workload', summaryBy(recs.filter((r) => TMD.hasStd(r, 'initiator')), (r) => r.calc.initiator), 'initiator') : ''}
      ${summaryTable('CAPEX / REVEX summary', summaryBy(recs, (r) => r.calc.capexRevex), 'capexRevex')}
      <div class="two-col">
        <section class="card"><header class="card-h"><div><h3>Cycle-time statistics (days)</h3></div></header>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Measure</th><th class="num">n</th><th class="num">Min</th><th class="num">Median</th><th class="num">Average</th><th class="num">Max</th></tr></thead>
          <tbody>${durations.map(([l, s]) => `<tr><td>${esc(l)}</td><td class="num">${s.n}</td>${s.n ? `<td class="num">${TMD.fmtInt(s.min)}</td><td class="num">${TMD.fmtInt(s.med)}</td><td class="num">${TMD.fmtNum(s.avg, 1)}</td><td class="num">${TMD.fmtInt(s.max)}</td>` : '<td colspan="4" class="muted">No data</td>'}</tr>`).join('')}</tbody></table></div>
          <p class="muted small pad">Thresholds: technical evaluation ${TMD.settings.get('thrTechEval')} d · PR-to-PO ${TMD.settings.get('thrPrToPo')} d (change in Settings).</p></section>
        <section class="card"><header class="card-h"><div><h3>Estimate versus awarded value</h3><p class="card-sub">Largest variances (awarded tenders)</p></div></header>
          <div class="table-wrap"><table class="data-table hover"><thead><tr><th>Tender</th><th class="num">Estimate</th><th class="num">Awarded</th><th class="num">Variance</th></tr></thead>
          <tbody>${variance.map((r) => { const est = r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees; return `<tr data-rec="${esc(r.id)}" tabindex="0"><td><div class="cell-title">${esc(r.calc.title)}</div><div class="muted small">${esc(r.calc.ident)}</div></td><td class="num">${esc(TMD.fmtMoney(est))}</td><td class="num">${esc(TMD.fmtMoney(r.calc.awardedRupees))}</td><td class="num ${r.calc.estVsAwardPct > 0 ? 'txt-red' : 'txt-green'}">${r.calc.estVsAwardPct > 0 ? '+' : ''}${TMD.fmtNum(r.calc.estVsAwardPct, 1)}%</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted pad">No awarded tenders with both estimate and awarded value.</td></tr>'}</tbody></table></div></section>
      </div>`;
    TMD.charts.mount(TMD.$('#anCharts'), ['stageGroup', 'ageing', 'prToPo', 'techEval']);
  }
  TMD.analytics = { render };
  TMD.initAnalytics = function () {
    const host = TMD.$('#page-analytics');
    const act = (e) => {
      const f = e.target.closest('[data-f]');
      if (f) { TMD.filters.set(f.dataset.f, [f.dataset.v]); TMD.toast(`Filter applied: ${f.dataset.v}`, 'info', 2000); return; }
      const r = e.target.closest('[data-rec]');
      if (r) { const rec = TMD.state.records.find((x) => x.id === r.dataset.rec); if (rec) TMD.details.open(rec); }
    };
    host.addEventListener('click', act);
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter') act(e); });
  };
})();
