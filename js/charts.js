/* =====================================================================
 * charts.js — Chart.js (bundled locally) wrappers. Charts are rendered
 * lazily when visible, react to filters/edits, support click-to-filter
 * and offer an accessible table view.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const registry = {};   // id -> definition
  const live = {};       // id -> {chart, card, dirty}
  let observer = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const SERIES = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css('--series-' + i));
  const tone = (t) => css('--tone-' + t) || css('--series-1');

  function amountScale() {
    const u = TMD.settings.get('amountUnit');
    return u === 'crore' ? { div: 1e7, label: '₹ crore' } : u === 'rupees' ? { div: 1, label: '₹' } : { div: 1e5, label: '₹ lakh' };
  }
  TMD.amountScale = amountScale;

  function baseOptions(def, data) {
    const text = css('--text-2');
    const grid = css('--grid');
    const horizontal = def.horizontal;
    const isPie = def.type === 'doughnut';
    const o = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      indexAxis: horizontal ? 'y' : 'x',
      layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
      plugins: {
        legend: { display: isPie || (data.datasets.length > 1), position: isPie ? 'right' : 'top', labels: { color: text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } } },
        tooltip: {
          backgroundColor: css('--surface-tip'), titleColor: css('--text-1'), bodyColor: css('--text-1'), borderColor: css('--border'), borderWidth: 1, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => { const v = ctx.parsed && typeof ctx.parsed === 'object' ? (horizontal ? ctx.parsed.x : ctx.parsed.y) : ctx.parsed; return `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${def.money ? TMD.fmtNum(v, 2) + ' ' + amountScale().label : TMD.fmtInt(v)}`; } },
        },
      },
      onHover: (e, els) => { e.native.target.style.cursor = els.length && def.filter ? 'pointer' : 'default'; },
    };
    if (!isPie) {
      const valAxis = { beginAtZero: true, grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: text, font: { size: 11 }, precision: def.money ? undefined : 0, padding: 6 }, title: { display: !!def.money, text: amountScale().label, color: text, font: { size: 11 } } };
      const catAxis = { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: text, font: { size: 11 }, autoSkip: !horizontal, maxRotation: 40, callback: function (v) { const l = this.getLabelForValue(v); return l && l.length > 26 ? l.slice(0, 25) + '…' : l; } } };
      o.scales = horizontal ? { x: valAxis, y: catAxis } : { x: catAxis, y: valAxis };
      if (def.stacked) { o.scales.x.stacked = true; o.scales.y.stacked = true; }
    } else o.cutout = '62%';
    return o;
  }

  function styleDatasets(def, data) {
    const pal = SERIES();
    data.datasets.forEach((ds, i) => {
      if (def.type === 'doughnut') {
        ds.backgroundColor = ds.colors || data.labels.map((_, j) => pal[j % pal.length]);
        ds.borderColor = css('--surface');
        ds.borderWidth = 2;
      } else if (def.type === 'line') {
        ds.borderColor = ds.color || pal[i]; ds.backgroundColor = ds.color || pal[i];
        ds.borderWidth = 2; ds.pointRadius = 3; ds.pointHoverRadius = 5; ds.tension = 0.25;
      } else {
        ds.backgroundColor = ds.colors || ds.color || pal[i];
        ds.borderRadius = 4; ds.borderSkipped = 'start'; ds.maxBarThickness = 26; ds.categoryPercentage = 0.8; ds.barPercentage = 0.9;
        ds.borderColor = css('--surface'); ds.borderWidth = def.stacked ? { top: 0, right: 0, bottom: 0, left: 0 } : 0;
      }
    });
  }

  function renderOne(id) {
    const L = live[id];
    const def = registry[id];
    if (!L || !def) return;
    L.dirty = false;
    const recs = TMD.state.filtered;
    let data;
    try { data = def.build(recs); } catch (e) { console.error('chart', id, e); data = { labels: [], datasets: [] }; }
    L.data = data;
    const body = L.card.querySelector('.chart-body');
    const empty = !data.labels.length || data.datasets.every((d) => !d.data.some((v) => v));
    const note = L.card.querySelector('.chart-note');
    if (note) note.textContent = data.note || '';
    if (L.tableView) { renderTable(L, def); return; }
    if (empty) {
      if (L.chart) { L.chart.destroy(); L.chart = null; }
      body.innerHTML = `<div class="chart-empty">${TMD.icon('chart')}<span>${esc(data.emptyText || 'No data for the current filters')}</span></div>`;
      return;
    }
    if (!body.querySelector('canvas')) body.innerHTML = '<canvas role="img"></canvas>';
    const canvas = body.querySelector('canvas');
    canvas.setAttribute('aria-label', def.title + ': ' + data.labels.slice(0, 12).map((l, i) => `${l} ${data.datasets[0].data[i]}`).join(', '));
    styleDatasets(def, data);
    const opts = baseOptions(def, data);
    opts.onClick = (evt, els) => {
      if (!def.filter || !els.length) return;
      const label = data.keys ? data.keys[els[0].index] : data.labels[els[0].index];
      def.filter(label, els[0]);
    };
    if (L.chart && L.chart.config.type === def.type) {
      L.chart.data.labels = data.labels; L.chart.data.datasets = data.datasets; L.chart.options = opts;
      L.chart.update();
    } else {
      if (L.chart) L.chart.destroy();
      L.chart = new window.Chart(canvas.getContext('2d'), { type: def.type, data: { labels: data.labels, datasets: data.datasets }, options: opts });
    }
  }

  function renderTable(L, def) {
    const body = L.card.querySelector('.chart-body');
    if (L.chart) { L.chart.destroy(); L.chart = null; }
    const d = L.data;
    body.innerHTML = `<div class="chart-table"><table class="data-table compact"><thead><tr><th>${esc(def.catLabel || 'Category')}</th>${d.datasets.map((ds) => `<th class="num">${esc(ds.label || (def.money ? amountScale().label : 'Count'))}</th>`).join('')}</tr></thead><tbody>${d.labels.map((l, i) => `<tr><td>${esc(l)}</td>${d.datasets.map((ds) => `<td class="num">${def.money ? TMD.fmtNum(ds.data[i], 2) : TMD.fmtInt(ds.data[i])}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9" class="muted">No data</td></tr>'}</tbody></table></div>`;
  }

  function ensureObserver() {
    if (observer || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const id = en.target.dataset.chart;
        const L = live[id];
        if (!L) return;
        L.visible = en.isIntersecting;
        if (en.isIntersecting && L.dirty) renderOne(id);
      });
    }, { rootMargin: '200px' });
  }

  TMD.charts = {
    define(id, def) { registry[id] = def; },
    has: (id) => !!registry[id],
    /** Build chart cards inside host for the given ids. */
    mount(host, ids, cls) {
      ensureObserver();
      ids.forEach((id) => {
        const def = registry[id];
        if (!def) return;
        if (live[id] && live[id].chart) { live[id].chart.destroy(); }
        if (live[id] && observer) observer.unobserve(live[id].card);
        const card = TMD.el('section', { class: 'card chart-card ' + (def.wide ? 'wide ' : '') + (cls || ''), 'data-chart': id, 'aria-label': def.title });
        card.innerHTML = `<header class="card-h"><div><h3>${esc(def.title)}</h3>${def.subtitle ? `<p class="card-sub">${esc(def.subtitle)}</p>` : ''}</div>
          <div class="card-tools"><button class="icon-btn sm" data-ct="table" aria-label="Show as table" data-tip="Toggle table view">${TMD.icon('table')}</button></div></header>
          <div class="chart-body" style="height:${def.height || 240}px"></div><div class="chart-note muted small"></div>`;
        host.appendChild(card);
        live[id] = { card, chart: null, dirty: true, visible: !observer, tableView: false };
        card.querySelector('[data-ct="table"]').addEventListener('click', () => { const L = live[id]; L.tableView = !L.tableView; L.card.classList.toggle('as-table', L.tableView); renderOne(id); });
        if (observer) observer.observe(card); else renderOne(id);
      });
    },
    /** Mark all charts dirty and re-render the visible ones. */
    refresh() {
      Object.keys(live).forEach((id) => {
        const L = live[id];
        if (!document.body.contains(L.card)) { if (L.chart) L.chart.destroy(); if (observer) observer.unobserve(L.card); delete live[id]; return; }
        L.dirty = true;
        if (L.visible || !observer) renderOne(id);
      });
    },
    renderAll() { Object.keys(live).forEach((id) => { const L = live[id]; if (document.body.contains(L.card)) { L.visible = true; renderOne(id); } }); },
    restyle() { Object.keys(live).forEach((id) => { const L = live[id]; if (L.chart) { L.chart.destroy(); L.chart = null; } L.dirty = true; if (L.visible || !observer) renderOne(id); }); },
    destroyAll() { Object.keys(live).forEach((id) => { if (live[id].chart) live[id].chart.destroy(); if (observer) observer.unobserve(live[id].card); delete live[id]; }); },
  };

  /* ---------------- Helpers for builders ---------------- */
  function topN(map, n, otherLabel) {
    const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    if (arr.length <= n) return arr;
    const head = arr.slice(0, n - 1);
    const rest = arr.slice(n - 1).reduce((s, x) => s + x[1], 0);
    head.push([otherLabel || 'Other', rest]);
    return head;
  }
  const blank = (s) => (s && String(s).trim()) || '(Blank)';
  const addFilter = (id, val) => { TMD.filters.set(id, [val]); TMD.toast(`Filter applied: ${TMD.filters.DEF[id].label} = ${val}`, 'info', 2200); };
  function bucket(values, edges) {
    const labels = edges.map((e, i) => (i === edges.length - 1 ? `> ${edges[i - 1] || 0}` : `${i === 0 ? 0 : edges[i - 1] + 1}–${e}`));
    const counts = edges.map(() => 0);
    values.forEach((v) => {
      if (typeof v !== 'number' || v < 0) return;
      let i = edges.findIndex((e) => v <= e);
      if (i < 0) i = edges.length - 1;
      counts[i]++;
    });
    return { labels: labels.slice(0, edges.length), counts };
  }
  function months(recs, getDate) {
    const m = new Map();
    recs.forEach((r) => { const d = getDate(r); if (d) { const k = TMD.monthKey(d); m.set(k, (m.get(k) || 0) + 1); } });
    const keys = Array.from(m.keys()).sort();
    if (!keys.length) return { keys: [], labels: [], counts: [] };
    // continuous range, max 24 months ending at the latest month
    const last = keys[keys.length - 1];
    const [ly, lm] = last.split('-').map(Number);
    const first = keys[0];
    const out = [];
    let y = ly, mo = lm;
    for (let i = 0; i < 24; i++) {
      const k = `${y}-${String(mo).padStart(2, '0')}`;
      out.unshift(k);
      if (k <= first) break;
      mo--; if (mo === 0) { mo = 12; y--; }
    }
    return { keys: out, labels: out.map(TMD.monthLabel), counts: out.map((k) => m.get(k) || 0) };
  }

  /* ---------------- Chart definitions (15) ---------------- */
  const D = TMD.charts.define;
  D('stage', { title: 'Tender count by current stage', subtitle: 'Calculated lifecycle stage', type: 'bar', horizontal: true, height: 420, wide: false, catLabel: 'Stage',
    build: (recs) => {
      const m = TMD.groupCount(recs, (r) => r.calc.stage);
      const stages = TMD.STAGES.slice(1).filter((s) => m.get(s.n));
      return { labels: stages.map((s) => s.label), keys: stages.map((s) => s.label), datasets: [{ label: 'Tenders', data: stages.map((s) => m.get(s.n)), colors: stages.map((s) => tone(s.tone)) }] };
    }, filter: (l) => addFilter('stage', l) });
  D('dept', { title: 'Tender count by department', type: 'bar', catLabel: 'Department',
    build: (recs) => { const t = topN(TMD.groupCount(recs, (r) => blank(r.calc.department)), 10); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Tenders', data: t.map((x) => x[1]) }] }; },
    filter: (l) => { if (l !== 'Other') addFilter('department', l); } });
  D('capexRevex', { title: 'CAPEX versus REVEX', type: 'doughnut', height: 220, catLabel: 'Budget head',
    build: (recs) => { const t = Array.from(TMD.groupCount(recs, (r) => r.calc.capexRevex || '(Blank)').entries()).sort((a, b) => b[1] - a[1]); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Tenders', data: t.map((x) => x[1]) }], note: recs.some((r) => r.calc.capexRevexInferred) ? 'Where the CAPEX/REVEX column is absent, the worksheet type is used.' : '' }; },
    filter: (l) => addFilter('capexRevex', l) });
  D('channel', { title: 'Procurement channel distribution', type: 'doughnut', height: 220, catLabel: 'Channel',
    build: (recs) => { const t = Array.from(TMD.groupCount(recs, (r) => blank(r.calc.channel)).entries()).sort((a, b) => b[1] - a[1]); return { labels: t.map((x) => x[0]), datasets: [{ label: 'Tenders', data: t.map((x) => x[1]) }] }; },
    filter: (l) => addFilter('channel', l) });
  D('initiator', { title: 'Tender count by initiator', type: 'bar', catLabel: 'Initiator',
    build: (recs) => {
      const with_ = recs.filter((r) => TMD.hasStd(r, 'initiator'));
      if (!with_.length) return { labels: [], datasets: [{ data: [] }], emptyText: 'The active worksheet(s) have no Tender Initiator column' };
      const t = topN(TMD.groupCount(with_, (r) => blank(r.calc.initiator)), 10);
      return { labels: t.map((x) => x[0]), datasets: [{ label: 'Tenders', data: t.map((x) => x[1]) }] };
    }, filter: (l) => { if (l !== 'Other') addFilter('initiator', l); } });
  D('estByDept', { title: 'Estimated cost by department', subtitle: 'Estimated cost, or project cost where no estimate exists', type: 'bar', money: true, catLabel: 'Department',
    build: (recs) => {
      const s = amountScale(); const m = new Map();
      recs.forEach((r) => { const v = r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees; if (v) { const k = blank(r.calc.department); m.set(k, (m.get(k) || 0) + v); } });
      const t = topN(m, 10);
      return { labels: t.map((x) => x[0]), datasets: [{ label: s.label, data: t.map((x) => Math.round(x[1] / s.div * 100) / 100) }] };
    }, filter: (l) => { if (l !== 'Other') addFilter('department', l); } });
  D('awardByDept', { title: 'Awarded value by department', subtitle: 'PO/OLA value (excl. tax where available)', type: 'bar', money: true, catLabel: 'Department',
    build: (recs) => {
      const s = amountScale(); const m = new Map();
      recs.forEach((r) => { if (r.calc.awarded && r.calc.awardedRupees) { const k = blank(r.calc.department); m.set(k, (m.get(k) || 0) + r.calc.awardedRupees); } });
      const t = topN(m, 10);
      return { labels: t.map((x) => x[0]), datasets: [{ label: s.label, data: t.map((x) => Math.round(x[1] / s.div * 100) / 100), color: SERIES()[2] }] };
    }, filter: (l) => { if (l !== 'Other') addFilter('department', l); } });
  D('floatTrend', { title: 'Monthly tender floating trend', type: 'bar', wide: true, catLabel: 'Month',
    build: (recs) => { const m = months(recs, (r) => r.calc.d.floatDate); return { labels: m.labels, datasets: [{ label: 'Tenders floated', data: m.counts, color: tone('teal') }] }; } });
  D('awardTrend', { title: 'Monthly tender award trend', type: 'bar', wide: true, catLabel: 'Month',
    build: (recs) => { const m = months(recs.filter((r) => r.calc.stage !== 24 && r.calc.stage !== 25), (r) => r.calc.d.awardDate); return { labels: m.labels, datasets: [{ label: 'PO/OLA awarded', data: m.counts, color: tone('green') }] }; } });
  D('prToPo', { title: 'PR-to-PO cycle duration', subtitle: 'Awarded tenders, days', type: 'bar', catLabel: 'Days',
    build: (recs) => {
      const vals = recs.filter((r) => typeof r.calc.prToPo === 'number').map((r) => r.calc.prToPo);
      const b = bucket(vals, [60, 90, 120, 180, 270, 100000]);
      b.labels[b.labels.length - 1] = '> 270';
      const med = TMD.median(vals);
      return { labels: b.labels, datasets: [{ label: 'Tenders', data: b.counts }], note: vals.length ? `${vals.length} awarded tender(s) · median ${TMD.fmtInt(med)} days · threshold ${TMD.settings.get('thrPrToPo')} days` : '' };
    } });
  D('techEval', { title: 'Technical evaluation duration', subtitle: 'Bid opening → BQC/technical evaluation, days', type: 'bar', catLabel: 'Days',
    build: (recs) => {
      const vals = recs.filter((r) => typeof r.calc.techEvalDuration === 'number').map((r) => r.calc.techEvalDuration);
      const b = bucket(vals, [15, 30, 45, 60, 90, 100000]);
      b.labels[b.labels.length - 1] = '> 90';
      return { labels: b.labels, datasets: [{ label: 'Tenders', data: b.counts, color: SERIES()[6] }], note: vals.length ? `${vals.length} tender(s) · median ${TMD.fmtInt(TMD.median(vals))} days` : '' };
    } });
  D('upcoming', { title: 'Upcoming milestones (next 8 weeks)', type: 'bar', stacked: true, wide: true, catLabel: 'Week starting',
    build: (recs) => {
      const T = TMD.today();
      const weeks = Array.from({ length: 8 }, (_, i) => new Date(T.getTime() + i * 7 * TMD.DAY));
      const types = ['Bid opening', 'Pre-bid meeting', 'Price bid', 'TEC approval', 'Tender floated', 'Validity expiry', 'CAPEX finish'];
      const data = types.map(() => weeks.map(() => 0));
      recs.forEach((r) => {
        if (r.calc.closed) return;
        TMD.milestonesOf(r).forEach((m) => {
          const d = TMD.daysBetween(T, m.date);
          if (d < 0 || d >= 56) return;
          const ti = types.indexOf(m.type);
          if (ti >= 0) data[ti][Math.floor(d / 7)]++;
        });
      });
      const ds = types.map((t, i) => ({ label: t, data: data[i] })).filter((d) => d.data.some(Boolean));
      return { labels: weeks.map((w) => TMD.fmtDate(w, 'dd mmm yyyy').slice(0, 6)), datasets: ds.length ? ds : [{ label: 'Milestones', data: weeks.map(() => 0) }], emptyText: 'No planned milestones in the next 8 weeks' };
    } });
  D('delayedByStage', { title: 'Delayed tenders by stage', type: 'bar', horizontal: true, catLabel: 'Stage',
    build: (recs) => {
      const m = TMD.groupCount(recs.filter((r) => r.calc.delayed), (r) => r.calc.stage);
      const stages = TMD.STAGES.slice(1).filter((s) => m.get(s.n));
      return { labels: stages.map((s) => s.label), datasets: [{ label: 'Delayed', data: stages.map((s) => m.get(s.n)), color: tone('red') }], emptyText: 'No delayed tenders' };
    }, filter: (l) => { TMD.filters.set('stage', [l], true); TMD.filters.set('delay', 'delayed'); } });
  D('vendorAward', { title: 'Vendor-wise awarded value (top 10)', type: 'bar', horizontal: true, money: true, catLabel: 'Vendor',
    build: (recs) => {
      const s = amountScale(); const m = new Map();
      recs.forEach((r) => { if (r.calc.awarded && r.calc.awardedRupees && r.calc.vendor) m.set(r.calc.vendor, (m.get(r.calc.vendor) || 0) + r.calc.awardedRupees); });
      const t = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      return { labels: t.map((x) => x[0]), datasets: [{ label: s.label, data: t.map((x) => Math.round(x[1] / s.div * 100) / 100), color: SERIES()[0] }] };
    }, filter: (l) => addFilter('vendor', l) });
  D('completedPending', { title: 'Completed versus pending work', type: 'doughnut', height: 220, catLabel: 'Status',
    build: (recs) => {
      const g = { Completed: 0, 'In progress': 0, 'On hold': 0, 'Cancelled / scrapped': 0, 'Needs review': 0 };
      recs.forEach((r) => { const s = r.calc.stage; if (s === 22) g.Completed++; else if (s === 23) g['On hold']++; else if (s === 24 || s === 25) g['Cancelled / scrapped']++; else if (s === 27) g['Needs review']++; else g['In progress']++; });
      const labels = Object.keys(g).filter((k) => g[k]);
      const colors = { Completed: tone('green'), 'In progress': tone('blue'), 'On hold': tone('amber'), 'Cancelled / scrapped': tone('red'), 'Needs review': tone('grey') };
      return { labels, datasets: [{ label: 'Tenders', data: labels.map((k) => g[k]), colors: labels.map((k) => colors[k]) }] };
    }, filter: (l) => { const map = { Completed: 'completed', 'In progress': 'pending', 'On hold': 'closedExc', 'Cancelled / scrapped': 'closedExc' }; if (map[l]) TMD.filters.set('completion', map[l]); } });

  // Analytics-only charts
  D('stageGroup', { title: 'Pipeline by tender stage group', type: 'bar', catLabel: 'Stage group',
    build: (recs) => { const m = TMD.groupCount(recs, (r) => r.calc.stageGroup); const g = TMD.STAGE_GROUPS.filter((x) => m.get(x)); return { labels: g, datasets: [{ label: 'Tenders', data: g.map((x) => m.get(x)) }] }; },
    filter: (l) => addFilter('stageGroup', l) });
  D('ageing', { title: 'Open tenders by age since PR sent', subtitle: 'Not awarded and not closed', type: 'bar', catLabel: 'Days since PR sent',
    build: (recs) => { const vals = recs.filter((r) => !r.calc.awarded && !r.calc.closed && typeof r.calc.daysSincePr === 'number').map((r) => r.calc.daysSincePr); const b = bucket(vals, [30, 60, 90, 120, 180, 100000]); b.labels[b.labels.length - 1] = '> 180'; return { labels: b.labels, datasets: [{ label: 'Open tenders', data: b.counts, color: tone('amber') }] }; } });
})();
