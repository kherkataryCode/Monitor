/* =====================================================================
 * dashboard.js — executive dashboard: clickable KPI cards, attention
 * lists and the 15 dashboard charts. Everything reacts to filters/edits.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const L = (n) => TMD.stageInfo(n).label;

  /* KPI definitions: count/value function + filter applied on click */
  const KPIS = [
    { sec: 'Portfolio', id: 'total', label: 'Total Tenders', icon: 'layers', tone: 'blue', count: () => true, filter: {} },
    { sec: 'Portfolio', id: 'capex', label: 'CAPEX Tenders', icon: 'database', tone: 'blue', count: (r) => r.calc.capexRevex === 'CAPEX', filter: { capexRevex: ['CAPEX'] } },
    { sec: 'Portfolio', id: 'revex', label: 'REVEX Tenders', icon: 'database', tone: 'teal', count: (r) => r.calc.capexRevex === 'REVEX', filter: { capexRevex: ['REVEX'] } },
    { sec: 'Portfolio', id: 'instr', label: 'Instrumentation', icon: 'zap', tone: 'blue', count: (r) => r.calc.deptCat === 'Instrumentation', filter: { deptCat: ['Instrumentation'] } },
    { sec: 'Portfolio', id: 'elec', label: 'Electrical', icon: 'zap', tone: 'amber', count: (r) => r.calc.deptCat === 'Electrical', filter: { deptCat: ['Electrical'] } },

    { sec: 'Tender pipeline', id: 'prep', label: 'Tender Preparation', icon: 'note', tone: 'grey', stages: [1, 2] },
    { sec: 'Tender pipeline', id: 'notFloated', label: 'Tender Not Floated', icon: 'pause', tone: 'grey', stages: [3, 4] },
    { sec: 'Tender pipeline', id: 'floated', label: 'Tender Floated', icon: 'send', tone: 'teal', stages: [5, 6] },
    { sec: 'Tender pipeline', id: 'openDue', label: 'Bid Opening Due', icon: 'clock', tone: 'teal', stages: [7] },
    { sec: 'Tender pipeline', id: 'bqc', label: 'Under BQC Evaluation', icon: 'search', tone: 'blue', stages: [8, 9] },
    { sec: 'Tender pipeline', id: 'tech', label: 'Under Technical Evaluation', icon: 'search', tone: 'blue', stages: [10] },
    { sec: 'Tender pipeline', id: 'fin', label: 'Under Finance Review', icon: 'rupee', tone: 'purple', stages: [11] },
    { sec: 'Tender pipeline', id: 'price', label: 'Price Bid Pending', icon: 'rupee', tone: 'purple', stages: [12] },
    { sec: 'Tender pipeline', id: 'award', label: 'Award in Progress', icon: 'award', tone: 'blue', stages: [13, 14, 15] },
    { sec: 'Tender pipeline', id: 'awarded', label: 'PO/OLA Awarded', icon: 'award', tone: 'green', count: (r) => r.calc.awarded, filter: { awarded: 'yes' }, sub: 'incl. post-award & completed' },
    { sec: 'Tender pipeline', id: 'post', label: 'Post-Award Execution', icon: 'truck', tone: 'blue', count: (r) => r.calc.stage >= 17 && r.calc.stage <= 21, filter: { postAward: 'yes' } },
    { sec: 'Tender pipeline', id: 'done', label: 'Completed', icon: 'check', tone: 'green', stages: [22] },
    { sec: 'Tender pipeline', id: 'delayed', label: 'Delayed', icon: 'clock', tone: 'red', count: (r) => r.calc.delayed, filter: { delay: 'delayed' } },
    { sec: 'Tender pipeline', id: 'cancel', label: 'Cancelled/Scrapped', icon: 'ban', tone: 'red', stages: [24, 25] },
    { sec: 'Tender pipeline', id: 'refloat', label: 'Refloating Required', icon: 'repeat', tone: 'orange', stages: [26] },
    { sec: 'Tender pipeline', id: 'hold', label: 'On Hold', icon: 'pause', tone: 'amber', stages: [23] },
    { sec: 'Tender pipeline', id: 'review', label: 'Needs Review', icon: 'help', tone: 'grey', stages: [27] },

    { sec: 'Value', id: 'est', label: 'Total Estimated Cost', icon: 'rupee', tone: 'blue', money: (r) => r.calc.estRupees, filter: { estCost: { min: 0 } }, sub: 'Estimated cost columns' },
    { sec: 'Value', id: 'proj', label: 'Total Project Cost', icon: 'rupee', tone: 'blue', money: (r) => r.calc.projectRupees, filter: { projectCost: { min: 0 } }, sub: 'CAPEX project cost' },
    { sec: 'Value', id: 'awval', label: 'Total Awarded Value', icon: 'award', tone: 'green', money: (r) => (r.calc.awarded ? r.calc.awardedRupees : null), filter: { awarded: 'yes' }, sub: 'PO/OLA value (excl. tax where available)' },
    { sec: 'Value', id: 'cash', label: 'Total Cash Outflow', icon: 'rupee', tone: 'teal', money: (r) => r.calc.cashOutflowRupees, filter: { cashOutflow: { min: 0 } }, sub: 'incl. tax where available' },

    { sec: 'Watch list', id: 'up7', label: 'Upcoming Milestones in 7 Days', icon: 'calendar', tone: 'amber', count: (r) => upcoming(r, 7), filter: { upcoming: '7' } },
    { sec: 'Watch list', id: 'up30', label: 'Upcoming Milestones in 30 Days', icon: 'calendar', tone: 'blue', count: (r) => upcoming(r, 30), filter: { upcoming: '30' } },
    { sec: 'Watch list', id: 'overdue', label: 'Overdue Actions', icon: 'alert', tone: 'red', count: (r) => r.calc.overdue, filter: { overdue: 'yes' } },
    { sec: 'Watch list', id: 'dq', label: 'Records with Data Quality Issues', icon: 'shield', tone: 'orange', count: (r) => r.calc.dq.length > 0, filter: { dq: 'any' } },
  ];
  KPIS.forEach((k) => {
    if (k.stages) { k.count = (r) => k.stages.indexOf(r.calc.stage) >= 0; k.filter = { stage: k.stages.map(L) }; k.sub = k.sub || k.stages.map(L).join(' · '); }
  });
  function upcoming(r, n) {
    if (r.calc.closed) return false;
    const T = TMD.today();
    return TMD.milestonesOf(r).some((m) => { const d = TMD.daysBetween(T, m.date); return d >= 0 && d <= n; });
  }
  TMD.KPIS = KPIS;

  const CHARTS = ['mgmt', 'capexRevexStatus', 'capexRevexValue', 'stage', 'dept', 'officerLoad', 'channel', 'estByDept', 'awardByDept', 'floatTrend', 'awardTrend', 'upcoming', 'prToPo', 'techEval', 'delayedByStage', 'vendorAward', 'completedPending', 'initiator'];

  function kpiValues(recs) {
    return KPIS.map((k) => {
      if (k.money) { const vals = recs.map(k.money).filter((v) => typeof v === 'number' && isFinite(v)); return { k, value: vals.reduce((a, b) => a + b, 0), n: vals.length }; }
      return { k, value: recs.filter(k.count).length };
    });
  }
  TMD.kpiValues = kpiValues;

  function kpiCard(x, total) {
    const k = x.k;
    const val = k.money ? TMD.fmtMoney(x.value) : TMD.fmtInt(x.value);
    const pct = !k.money && k.id !== 'total' && total ? Math.round(x.value / total * 100) : null;
    const sub = k.money ? `${x.n} record(s) with values${k.sub ? ' · ' + k.sub : ''}` : (k.sub || '');
    return `<button class="kpi tone-${k.tone}" data-kpi="${k.id}" ${k.money ? `data-tip="${esc(TMD.fmtMoneyExact(x.value))}"` : ''} aria-label="${esc(k.label)}: ${esc(val)}. Show in Tender Register.">
      <span class="kpi-ico">${TMD.icon(k.icon)}</span>
      <span class="kpi-main"><span class="kpi-label">${esc(k.label)}</span><span class="kpi-val">${esc(val)}${pct !== null ? `<span class="kpi-pct">${pct}%</span>` : ''}</span><span class="kpi-sub">${esc(sub)}</span></span>
    </button>`;
  }

  function attentionLists(recs) {
    const T = TMD.today();
    const high = [];
    recs.forEach((r) => r.calc.alerts.forEach((a) => { if (a.sev === 'high' && !a.silent) high.push({ r, a }); }));
    high.sort((x, y) => (x.a.date || 0) - (y.a.date || 0));
    const ups = [];
    recs.forEach((r) => { if (r.calc.closed) return; TMD.milestonesOf(r).forEach((m) => { const d = TMD.daysBetween(T, m.date); if (d >= 0 && d <= 14) ups.push({ r, m, d }); }); });
    ups.sort((a, b) => a.d - b.d);
    return { high, ups };
  }

  const inProgress = (r) => r.calc.stage >= 5 && r.calc.stage <= 15;
  const followUp = (r) => r.calc.alerts.some((a) => a.statusDue);
  const sum = (recs, fn) => recs.reduce((a, r) => { const v = fn(r); return a + (typeof v === 'number' && isFinite(v) ? v : 0); }, 0);
  const estOf = (r) => (r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees);

  /** Large, calm headline tiles (Apple-style): the five numbers management asks for first. */
  function heroHtml(recs) {
    const tiles = [
      { id: 'total', label: 'Total tenders', v: TMD.fmtInt(recs.length), sub: `${TMD.fmtInt(recs.filter((r) => !r.calc.closed).length)} open`, tone: 'blue' },
      { id: 'inprog', label: 'In progress', v: TMD.fmtInt(recs.filter(inProgress).length), sub: 'floated → award', tone: 'teal' },
      { id: 'awarded', label: 'PO / OLA awarded', v: TMD.fmtInt(recs.filter((r) => r.calc.awarded).length), sub: TMD.fmtMoney(sum(recs.filter((r) => r.calc.awarded), (r) => r.calc.awardedRupees)), tone: 'green' },
      { id: 'delayed', label: 'Delayed', v: TMD.fmtInt(recs.filter((r) => r.calc.delayed).length), sub: 'against thresholds', tone: 'red' },
      { id: 'followup', label: 'Status follow-up due', v: TMD.fmtInt(recs.filter(followUp).length), sub: 'next action / stale status', tone: 'orange' },
    ];
    return `<div class="hero-grid">${tiles.map((t) => `<button class="hero tone-${t.tone}" data-hero="${t.id}"><span class="hero-l">${esc(t.label)}</span><span class="hero-v">${esc(t.v)}</span><span class="hero-s">${esc(t.sub)}</span></button>`).join('')}</div>`;
  }

  function capexRevexHtml(recs) {
    const col = (h) => {
      const l = recs.filter((r) => r.calc.capexRevex === h);
      const aw = l.filter((r) => r.calc.awarded);
      return { h, n: l.length, open: l.filter((r) => !r.calc.closed).length, awarded: aw.length, delayed: l.filter((r) => r.calc.delayed).length, est: sum(l, estOf), awv: sum(aw, (r) => r.calc.awardedRupees) };
    };
    const c = col('CAPEX'), rv = col('REVEX');
    const tot = c.n + rv.n;
    const none = recs.length - tot;
    const side = (x, tone) => `<button class="cr-side tone-${tone}" data-cr="${x.h}">
        <div class="cr-h"><span class="cr-name">${x.h}</span><span class="cr-n">${TMD.fmtInt(x.n)}</span></div>
        <dl class="cr-dl"><div><dt>Open</dt><dd>${TMD.fmtInt(x.open)}</dd></div><div><dt>Awarded</dt><dd>${TMD.fmtInt(x.awarded)}</dd></div><div><dt>Delayed</dt><dd class="${x.delayed ? 'txt-red' : ''}">${TMD.fmtInt(x.delayed)}</dd></div>
        <div><dt>Estimated</dt><dd>${esc(TMD.fmtMoney(x.est))}</dd></div><div><dt>Awarded value</dt><dd>${esc(TMD.fmtMoney(x.awv))}</dd></div></dl></button>`;
    return `<section class="card cr-card"><header class="card-h"><div><h3>${TMD.icon('rupee')} CAPEX / REVEX</h3><p class="card-sub">Click a side to filter${none ? ` · ${none} tender(s) without a budget head` : ''}</p></div></header>
      <div class="cr-split" aria-hidden="true"><span class="tone-blue" style="width:${tot ? c.n / tot * 100 : 50}%"></span><span class="tone-teal" style="width:${tot ? rv.n / tot * 100 : 50}%"></span></div>
      <div class="cr-grid">${side(c, 'blue')}${side(rv, 'teal')}</div></section>`;
  }

  function mgmtHtml(recs) {
    const list = TMD.mgmtStatuses();
    const m = TMD.groupCount(recs, (r) => (r.calc.mgmt ? r.calc.mgmt.id : 'other'));
    const max = Math.max(1, ...list.map((x) => m.get(x.id) || 0));
    return `<section class="card mg-card"><header class="card-h"><div><h3>${TMD.icon('flag')} Management status</h3><p class="card-sub">Grouped from the calculated stage · click to filter</p></div><a class="linklike small" href="#settings" data-mgcfg>Configure</a></header>
      <div class="mg-list">${list.map((x) => { const n = m.get(x.id) || 0; return `<button class="mg-row ${n ? '' : 'zero'}" data-mg="${esc(x.name)}"><span class="ms-dot tone-${esc(x.tone)}"></span><span class="mg-l">${esc(x.name)}</span><span class="mg-bar"><span class="tone-${esc(x.tone)}" style="width:${n / max * 100}%"></span></span><span class="mg-n">${TMD.fmtInt(n)}</span></button>`; }).join('')}</div></section>`;
  }

  function topHtml() {
    const st = TMD.state;
    const recs = st.filtered;
    const vals = kpiValues(recs);
    const total = recs.length;
    const secs = {};
    vals.forEach((x) => { (secs[x.k.sec] = secs[x.k.sec] || []).push(x); });
    const att = attentionLists(recs);
    const fu = [];
    recs.forEach((r) => r.calc.alerts.forEach((a) => { if (a.statusDue) fu.push({ r, a }); }));
    fu.sort((x, y) => (x.a.sev === 'high' ? 0 : 1) - (y.a.sev === 'high' ? 0 : 1) || (x.a.date || 0) - (y.a.date || 0));
    const wb = st.workbook;
    const open = TMD.ls.get('dash.allKpis', false);
    return `
      <div class="page-head">
        <div><div class="eyebrow">Tender Monitoring</div><h2>Dashboard</h2><p class="muted">As on ${esc(TMD.fmtDate(TMD.today()))} · ${esc(st.activeSheets.join(' + '))} · ${TMD.fmtInt(total)} of ${TMD.fmtInt(st.records.length)} tenders${TMD.filters.activeCount() ? ' · <strong>filters applied</strong>' : ''}${wb && wb.isDemo ? ' · <span class="tag tag-amber">Demo data</span>' : ''}</p></div>
        <div class="page-actions">
          <button class="btn subtle" data-d="reports">${TMD.icon('report')}<span>Monthly / quarterly report</span></button>
          <button class="btn subtle" data-d="summary">${TMD.icon('file')}<span>Management summary</span></button>
          <button class="btn subtle" data-d="print">${TMD.icon('printer')}<span>Print</span></button>
        </div>
      </div>
      ${heroHtml(recs)}
      <div class="dash-split">${capexRevexHtml(recs)}${mgmtHtml(recs)}</div>
      <div class="att-grid three">
        <section class="card"><header class="card-h"><div><h3>${TMD.icon('alert')} Needs attention now</h3><p class="card-sub">High-severity alerts</p></div><a href="#alerts" class="linklike small">All alerts →</a></header>
          <div class="att-list">${att.high.slice(0, 6).map(({ r, a }) => `<button class="att-item sev-high" data-rec="${esc(r.id)}"><span class="att-type">${esc(a.type)}</span><span class="att-title">${esc(r.calc.title)}</span><span class="att-msg muted">${esc(r.calc.ident)} · ${esc(a.msg)}</span></button>`).join('') || '<p class="muted pad">No high-severity alerts.</p>'}
          ${att.high.length > 6 ? `<p class="muted small pad">+ ${att.high.length - 6} more</p>` : ''}</div></section>
        <section class="card"><header class="card-h"><div><h3>${TMD.icon('bell')} Status follow-up</h3><p class="card-sub">Next action date due or status not updated</p></div><button class="linklike small" data-hero="followup">Show all →</button></header>
          <div class="att-list">${fu.slice(0, 6).map(({ r, a }) => `<button class="att-item ${a.sev === 'high' ? 'sev-high' : ''}" data-rec="${esc(r.id)}"><span class="att-type">${esc(a.type)}</span><span class="att-title">${esc(r.calc.title)}</span><span class="att-msg muted">${r.calc.officer ? esc(r.calc.officer) + ' · ' : ''}${esc(a.msg)}</span></button>`).join('') || '<p class="muted pad">No follow-ups due. Add an <em>Officer</em>, <em>Current Status Remark</em> and <em>Next Action Date</em> to tenders to track them here.</p>'}
          ${fu.length > 6 ? `<p class="muted small pad">+ ${fu.length - 6} more</p>` : ''}</div></section>
        <section class="card"><header class="card-h"><div><h3>${TMD.icon('calendar')} Next 14 days</h3><p class="card-sub">Planned milestones</p></div><a href="#timeline" class="linklike small">Timeline →</a></header>
          <div class="att-list">${att.ups.slice(0, 6).map(({ r, m, d }) => `<button class="att-item" data-rec="${esc(r.id)}"><span class="att-date"><strong>${esc(TMD.fmtDate(m.date))}</strong><span class="muted">${d === 0 ? 'today' : 'in ' + d + ' d'}</span></span><span class="att-type ms-${esc(m.field)}">${esc(m.type)}</span><span class="att-title">${esc(r.calc.title)}</span></button>`).join('') || '<p class="muted pad">Nothing planned in the next 14 days.</p>'}
          ${att.ups.length > 6 ? `<p class="muted small pad">+ ${att.ups.length - 6} more</p>` : ''}</div></section>
      </div>
      <details class="all-kpis" ${open ? 'open' : ''}><summary>${TMD.icon('grid')} All indicators <span class="muted small">— ${KPIS.length} clickable counts and values</span></summary>
      ${Object.keys(secs).map((s) => `<section class="kpi-sec"><h3 class="sec-h">${esc(s)}</h3><div class="kpi-grid ${s === 'Value' ? 'value' : ''}">${secs[s].map((x) => kpiCard(x, total)).join('')}</div></section>`).join('')}
      </details>`;
  }
  function render() {
    const host = TMD.$('#page-dashboard');
    host.innerHTML = `<div id="dashTop">${topHtml()}</div>
      <h3 class="sec-h">Charts <span class="muted small">— click a bar or segment to filter · ${TMD.icon('table')} shows a table view</span></h3>
      <div class="chart-grid" id="dashCharts"></div>`;
    TMD.charts.mount(TMD.$('#dashCharts'), CHARTS);
  }

  TMD.dashboard = {
    render,
    update() {
      // Fast path: update KPI values in place and refresh charts (no page jump).
      const top = TMD.$('#dashTop');
      if (!top || !TMD.$('#dashCharts .chart-card')) { render(); return; }
      top.innerHTML = topHtml();
      TMD.charts.refresh();
    },
    applyKpi(id) {
      const k = KPIS.find((x) => x.id === id);
      if (!k) return;
      const cur = TMD.deepClone(TMD.filters.state.values);
      Object.keys(k.filter).forEach((f) => { cur[f] = TMD.deepClone(k.filter[f]); });
      TMD.filters.replace(cur, { logic: 'AND' });
      TMD.go('register');
      TMD.toast(`Showing: ${k.label}`, 'info', 2000);
    },
    applyHero(id) {
      const F = { total: {}, inprog: { inProgress: 'yes' }, awarded: { awarded: 'yes' }, delayed: { delay: 'delayed' }, followup: { attention: 'any' } }[id];
      if (!F) return;
      const cur = TMD.deepClone(TMD.filters.state.values);
      Object.keys(F).forEach((f) => { cur[f] = F[f]; });
      TMD.filters.replace(cur, { logic: 'AND' });
      TMD.go('register');
    },
    CHARTS,
  };

  TMD.initDashboard = function () {
    const host = TMD.$('#page-dashboard');
    host.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kpi]');
      if (k) { TMD.dashboard.applyKpi(k.dataset.kpi); return; }
      const h = e.target.closest('[data-hero]');
      if (h) { TMD.dashboard.applyHero(h.dataset.hero); return; }
      const cr = e.target.closest('[data-cr]');
      if (cr) { TMD.filters.set('capexRevex', [cr.dataset.cr]); TMD.toast(`Filter applied: ${cr.dataset.cr}`, 'info', 2000); return; }
      const mg = e.target.closest('[data-mg]');
      if (mg) { TMD.filters.set('mgmt', [mg.dataset.mg]); TMD.toast(`Filter applied: ${mg.dataset.mg}`, 'info', 2000); return; }
      const r = e.target.closest('[data-rec]');
      if (r) { const rec = TMD.state.records.find((x) => x.id === r.dataset.rec); if (rec) TMD.details.open(rec); return; }
      const d = e.target.closest('[data-d]');
      if (d && d.dataset.d === 'print') TMD.exporter.printDashboard();
      if (d && d.dataset.d === 'summary') TMD.exporter.managementSummary();
      if (d && d.dataset.d === 'reports') { TMD.reportsTab = 'periodic'; TMD.go('reports'); }
    });
    host.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('all-kpis')) TMD.ls.set('dash.allKpis', e.target.open); }, true);
  };
})();
