/* =====================================================================
 * cyber-audit-analytics.js — cybersecurity charts (18) and the Audit
 * Analytics page. Every chart responds to the active Cyber Audit filters.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;
  const D = (id, def) => TMD.charts.define(id, Object.assign({ module: 'cyber' }, def));
  const H = () => TMD.chartHelpers;
  const blank = (s) => (s && String(s).trim()) || '(Blank)';
  const SEV_TONE = { Critical: '--sev-crit', High: '--tone-red', Medium: '--tone-amber', Low: '--tone-blue', Unclassified: '--tone-grey' };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const setF = (id, v) => { M.filters.merge({ [id]: Array.isArray(v) ? v : [v] }); TMD.toast(`Filter applied: ${v}`, 'info', 1800); };
  const count = (recs, fn) => { const m = new Map(); recs.forEach((r) => { const k = fn(r); if (k === null || k === undefined) return; m.set(k, (m.get(k) || 0) + 1); }); return m; };
  function stacked(recs, catFn, catLimit) {
    const open = new Map(), closed = new Map();
    recs.forEach((r) => { const k = blank(catFn(r)); (r.calc.closed ? closed : open).set(k, ((r.calc.closed ? closed : open).get(k) || 0) + 1); });
    const keys = Array.from(new Set([...open.keys(), ...closed.keys()])).sort((a, b) => ((open.get(b) || 0) + (closed.get(b) || 0)) - ((open.get(a) || 0) + (closed.get(a) || 0))).slice(0, catLimit || 12);
    return { labels: keys, datasets: [{ label: 'Open', data: keys.map((k) => open.get(k) || 0), color: H().tone('blue') }, { label: 'Closed', data: keys.map((k) => closed.get(k) || 0), color: H().tone('green') }] };
  }

  D('c-openclosed', { title: 'Open vs Closed Observations', type: 'doughnut', height: 220, catLabel: 'Status',
    build: (recs) => { const b = count(recs, (r) => r.calc.bucket); const L = ['Open', 'In Progress', 'Closed'].filter((k) => b.get(k)); const col = { Open: H().tone('grey'), 'In Progress': H().tone('blue'), Closed: H().tone('green') }; return { labels: L, datasets: [{ label: 'Observations', data: L.map((k) => b.get(k)), colors: L.map((k) => col[k]) }] }; },
    filter: (l) => setF('bucket', l) });
  D('c-sev', { title: 'Observations by Severity', subtitle: 'Open vs closed', type: 'bar', stacked: true, catLabel: 'Severity',
    build: (recs) => { const r = stacked(recs, (x) => x.calc.severity); const order = TMD.SEV_ORDER.filter((s) => r.labels.indexOf(s) >= 0); const idx = order.map((s) => r.labels.indexOf(s)); return { labels: order, datasets: r.datasets.map((d) => Object.assign(d, { data: idx.map((i) => d.data[i]) })) }; },
    filter: (l) => setF('severity', l) });
  D('c-location', { title: 'Observations by Location', type: 'bar', stacked: true, catLabel: 'Location', build: (recs) => stacked(recs, (r) => r.calc.location), filter: (l) => setF('location', l) });
  D('c-dept', { title: 'Observations by Department', type: 'bar', stacked: true, catLabel: 'Department', build: (recs) => stacked(recs, (r) => r.calc.deptResp), filter: (l) => setF('deptResp', l) });
  D('c-audit', { title: 'Observations by Audit', type: 'bar', stacked: true, horizontal: true, height: 260, catLabel: 'Audit', build: (recs) => stacked(recs, (r) => r.calc.auditName), filter: (l) => setF('auditName', l) });
  D('c-agency', { title: 'Observations by Audit Agency', type: 'bar', horizontal: true, catLabel: 'Agency',
    build: (recs) => { const t = H().topN(count(recs, (r) => blank(r.calc.agency)), 10); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Observations', data: t.map((x) => x[1]) }] }; }, filter: (l) => setF('agency', l) });
  D('c-domain', { title: 'Observations by Cyber Security Domain', subtitle: 'Calculated domain (source value used when present)', type: 'bar', horizontal: true, height: 320, catLabel: 'Domain',
    build: (recs) => { const t = H().topN(count(recs, (r) => r.calc.calcDomain), 14); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Observations', data: t.map((x) => x[1]), color: css('--cyber') }] }; }, filter: (l) => { if (l !== 'Other') setF('domain', l); } });
  D('c-status', { title: 'Observations by Current Status', subtitle: 'Calculated status', type: 'bar', horizontal: true, height: 320, catLabel: 'Status',
    build: (recs) => { const m = count(recs, (r) => r.calc.cstatus); const st = TMD.CSTATUS.slice(1).filter((s) => m.get(s.n)); return { labels: st.map((s) => s.label), datasets: [{ label: 'Observations', data: st.map((s) => m.get(s.n)), colors: st.map((s) => H().tone(s.tone)) }] }; },
    filter: (l) => setF('cstatus', l) });
  D('c-overdue-dept', { title: 'Overdue Observations by Department', type: 'bar', catLabel: 'Department',
    build: (recs) => { const t = H().topN(count(recs.filter((r) => r.calc.overdue), (r) => blank(r.calc.deptResp)), 10); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Overdue', data: t.map((x) => x[1]), color: H().tone('red') }], emptyText: 'No overdue observations' }; },
    filter: (l) => { M.filters.merge({ deptResp: [l], attention: ['Overdue'] }); } });
  D('c-overdue-loc', { title: 'Overdue Observations by Location', type: 'bar', catLabel: 'Location',
    build: (recs) => { const t = H().topN(count(recs.filter((r) => r.calc.overdue), (r) => blank(r.calc.location)), 12); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Overdue', data: t.map((x) => x[1]), color: H().tone('red') }], emptyText: 'No overdue observations' }; },
    filter: (l) => { M.filters.merge({ location: [l], attention: ['Overdue'] }); } });
  D('c-aging', { title: 'Open Observations by Aging', subtitle: 'Days since observation / audit date', type: 'bar', catLabel: 'Age',
    build: (recs) => { const B = ['0–30 days', '31–60 days', '61–90 days', '91–180 days', '181–365 days', '> 365 days']; const m = count(recs.filter((r) => r.calc.open), (r) => r.calc.ageBucket); return { labels: B, datasets: [{ label: 'Open observations', data: B.map((b) => m.get(b) || 0), color: H().tone('amber') }], note: m.get('Unknown') ? `${m.get('Unknown')} open observation(s) have no observation/audit date.` : '' }; } });
  D('c-closure-trend', { title: 'Monthly Closure Trend', type: 'bar', wide: true, catLabel: 'Month',
    build: (recs) => { const mm = H().months(recs.filter((r) => r.calc.closed), (r) => r.calc.d.closure); return { labels: mm.labels, datasets: [{ label: 'Closed', data: mm.counts, color: H().tone('green') }], emptyText: 'No closure dates recorded' }; } });
  D('c-raised-closed', { title: 'Observations Raised vs Closed', subtitle: 'By month', type: 'line', wide: true, catLabel: 'Month',
    build: (recs) => {
      const raised = H().months(recs, (r) => r.calc.raised), closed = H().months(recs.filter((r) => r.calc.closed), (r) => r.calc.d.closure);
      const keys = Array.from(new Set(raised.keys.concat(closed.keys))).sort();
      const val = (m, k) => { const i = m.keys.indexOf(k); return i < 0 ? 0 : m.counts[i]; };
      return { labels: keys.map(TMD.monthLabel), datasets: [{ label: 'Raised', data: keys.map((k) => val(raised, k)), color: H().tone('blue') }, { label: 'Closed', data: keys.map((k) => val(closed, k)), color: H().tone('green') }] };
    } });
  D('c-pending', { title: 'Pending With / Current Owner', subtitle: 'Open observations', type: 'bar', horizontal: true, catLabel: 'Pending with',
    build: (recs) => { const t = H().topN(count(recs.filter((r) => r.calc.open), (r) => blank(r.calc.pendingWith || r.calc.owner)), 10); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Open observations', data: t.map((x) => x[1]) }] }; },
    filter: (l) => setF('pendingWith', l) });
  D('c-repeat', { title: 'Repeat vs New Findings', type: 'doughnut', height: 220, catLabel: 'Type',
    build: (recs) => { const rep = recs.filter((r) => r.calc.repeat).length; return { labels: ['Repeat', 'New'], datasets: [{ label: 'Observations', data: [rep, recs.length - rep], colors: [H().tone('orange'), H().tone('blue')] }] }; } });
  D('c-otit', { title: 'OT vs IT Observations', type: 'doughnut', height: 220, catLabel: 'OT / IT',
    build: (recs) => { const t = Array.from(count(recs, (r) => blank(r.calc.otIt)).entries()); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Observations', data: t.map((x) => x[1]) }] }; }, filter: (l) => setF('otIt', l) });
  D('c-evidence', { title: 'Evidence / Verification Status', subtitle: 'Not-closed observations', type: 'bar', catLabel: 'Status',
    build: (recs) => {
      const open = recs.filter((r) => r.calc.open);
      const L = ['Evidence pending', 'Evidence submitted', 'Verification pending', 'Awaiting closure'];
      const v = [open.filter((r) => r.calc.evidencePending).length, open.filter((r) => r.calc.baseStatus === 8).length, open.filter((r) => r.calc.baseStatus === 9).length, open.filter((r) => r.calc.awaitingClosure).length];
      return { labels: L, datasets: [{ label: 'Observations', data: v, colors: [H().tone('amber'), H().tone('teal'), H().tone('purple'), H().tone('blue')] }] };
    } });
  D('c-compliance', { title: 'Target Date Compliance', subtitle: 'Closed on/before target vs late; open overdue vs on track', type: 'bar', catLabel: 'Category',
    build: (recs) => {
      let onT = 0, late = 0, od = 0, ok = 0, none = 0;
      recs.forEach((r) => { const c = r.calc; if (c.closed) { if (c.d.closure && c.effTarget) { if (c.d.closure <= c.effTarget) onT++; else late++; } } else if (!c.effTarget) none++; else if (c.overdue) od++; else ok++; });
      return { labels: ['Closed on time', 'Closed late', 'Open – on track', 'Open – overdue', 'No target date'], datasets: [{ label: 'Observations', data: [onT, late, ok, od, none], colors: [H().tone('green'), H().tone('amber'), H().tone('blue'), H().tone('red'), H().tone('grey')] }] };
    } });

  TMD.CYBER_CHARTS = ['c-openclosed', 'c-sev', 'c-location', 'c-dept', 'c-audit', 'c-agency', 'c-domain', 'c-status', 'c-overdue-dept', 'c-overdue-loc', 'c-aging', 'c-closure-trend', 'c-raised-closed', 'c-pending', 'c-repeat', 'c-otit', 'c-evidence', 'c-compliance'];

  function render() {
    const host = TMD.$('#page-cyber-analytics');
    const recs = M.state.filtered;
    const closedDur = recs.filter((r) => r.calc.closureDuration !== null).map((r) => r.calc.closureDuration);
    const openAge = recs.filter((r) => r.calc.openAge !== null).map((r) => r.calc.openAge);
    const med = (a) => { const m = TMD.median(a); return m === null ? '—' : TMD.fmtInt(m) + ' d'; };
    const st = TMD.cyberStats(recs);
    host.innerHTML = `
      <div class="page-head cyber-head"><div><div class="eyebrow">${TMD.icon('shield')} Cyber Security Audits</div><h2>Audit Analytics</h2><p class="muted">${TMD.fmtInt(recs.length)} observation(s) in the current view · click any bar or segment to filter</p></div></div>
      <div class="mini-stats wide">
        ${[['Closure %', TMD.fmtNum(st.closurePct, 1) + '%'], ['Overdue', st.overdue], ['Critical open', st.critOpen], ['High open', st.highOpen], ['Median age (open)', med(openAge)], ['Median time to close', med(closedDur)]].map(([l, v]) => `<div class="ms"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}
      </div>
      <div class="chart-grid" id="cyberAnCharts"></div>`;
    TMD.charts.mount(TMD.$('#cyberAnCharts'), TMD.CYBER_CHARTS);
  }
  TMD.cyber.analytics = { render };
})();
