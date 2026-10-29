/* =====================================================================
 * timeline.js — milestones: upcoming / overdue lists, monthly calendar,
 * Gantt-style view and lifecycle pipeline. Click any marker to open the
 * corresponding tender.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const T = () => TMD.today();
  const V = { tab: 'list', window: 30, dept: '', owner: '', group: '', month: null, zoom: 70, types: null };

  const MS_TONE = {
    'PR sent': 'grey', 'Sent to procurement': 'grey', 'Tender floated': 'teal', 'Pre-bid meeting': 'teal', 'Bid opening': 'teal',
    'Technical evaluation': 'blue', 'Price bid': 'purple', 'TEC approval': 'purple', 'Award': 'green', 'FAT': 'blue', 'SAT': 'blue',
    'Installation': 'blue', 'Handover': 'green', 'Validity expiry': 'amber', 'CAPEX finish': 'orange',
  };
  TMD.MS_TONE = MS_TONE;

  function records() {
    return TMD.state.filtered.filter((r) => (!V.dept || r.calc.department === V.dept) && (!V.owner || r.calc.initiator === V.owner) && (!V.group || r.calc.stageGroup === V.group));
  }
  function allMilestones(recs) {
    const out = [];
    recs.forEach((r) => TMD.milestonesOf(r).forEach((m) => { if (!V.types || V.types.has(m.type)) out.push(m); }));
    return out;
  }
  const marker = (type) => `<span class="ms-dot tone-${MS_TONE[type] || 'grey'}" aria-hidden="true"></span>`;
  const msBadge = (type) => `<span class="ms-badge tone-${MS_TONE[type] || 'grey'}">${marker(type)}${esc(type)}</span>`;

  function opts(values, cur, all) {
    return `<option value="">${esc(all)}</option>` + values.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }

  function render() {
    const host = TMD.$('#page-timeline');
    const base = TMD.state.filtered;
    const depts = Array.from(new Set(base.map((r) => r.calc.department).filter(Boolean))).sort();
    const owners = Array.from(new Set(base.map((r) => r.calc.initiator).filter(Boolean))).sort();
    host.innerHTML = `
      <div class="page-head"><div><h2>Timeline &amp; Milestones</h2><p class="muted">Based on the system date ${esc(TMD.fmtDate(T()))}. Global filters apply; refine below.</p></div></div>
      <div class="toolbar-row">
        <div class="tabs" role="tablist">${[['list', 'Upcoming & overdue'], ['calendar', 'Monthly calendar'], ['gantt', 'Gantt view'], ['life', 'Lifecycle']].map(([k, l]) => `<button role="tab" class="tab ${V.tab === k ? 'active' : ''}" aria-selected="${V.tab === k}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="tb-group">
          <label class="tb-sel">Department<select class="inp inp-sm" data-v="dept">${opts(depts, V.dept, 'All')}</select></label>
          <label class="tb-sel">Owner / initiator<select class="inp inp-sm" data-v="owner">${opts(owners, V.owner, 'All')}</select></label>
          <label class="tb-sel">Status<select class="inp inp-sm" data-v="group">${opts(TMD.STAGE_GROUPS, V.group, 'All stages')}</select></label>
          <button class="btn subtle" data-v="types" data-pop-anchor>${TMD.icon('filter')}<span>Milestone types${V.types ? ` (${V.types.size})` : ''}</span></button>
        </div>
      </div>
      <div class="legend-row">${Object.keys(MS_TONE).map((t) => `<span class="legend-item">${marker(t)}${esc(t)}</span>`).join('')}</div>
      <div id="tlBody"></div>`;
    const body = TMD.$('#tlBody');
    if (V.tab === 'list') renderList(body);
    if (V.tab === 'calendar') renderCalendar(body);
    if (V.tab === 'gantt') renderGantt(body);
    if (V.tab === 'life') renderLife(body);
  }

  function renderList(body) {
    const recs = records();
    const today = T();
    const ups = allMilestones(recs.filter((r) => !r.calc.closed)).map((m) => Object.assign(m, { days: TMD.daysBetween(today, m.date) })).filter((m) => m.days >= 0 && m.days <= V.window).sort((a, b) => a.days - b.days);
    const over = [];
    recs.forEach((r) => r.calc.alerts.forEach((a) => { if (a.overdue) over.push({ r, a }); }));
    over.sort((x, y) => (x.a.date || 0) - (y.a.date || 0));
    body.innerHTML = `<div class="two-col">
      <section class="card"><header class="card-h"><div><h3>${TMD.icon('calendar')} Upcoming milestones</h3><p class="card-sub">${ups.length} in the next
        <select class="inp inp-xs" data-v="window">${[7, 15, 30, 60, 90].map((n) => `<option ${V.window === n ? 'selected' : ''}>${n}</option>`).join('')}</select> days</p></div></header>
        <div class="table-wrap"><table class="data-table hover"><thead><tr><th>Date</th><th>In</th><th>Milestone</th><th>Tender</th><th>Stage</th><th>Dept</th></tr></thead><tbody>
        ${ups.map((m) => `<tr data-rec="${esc(m.rec.id)}" tabindex="0"><td class="nowrap"><strong>${esc(TMD.fmtDate(m.date))}</strong></td><td class="nowrap ${m.days <= 7 ? 'txt-amber' : ''}">${m.days === 0 ? 'Today' : m.days + ' d'}</td><td>${msBadge(m.type)}</td><td><div class="cell-title">${esc(m.rec.calc.title)}</div><div class="muted small">${esc(m.rec.calc.ident)}</div></td><td>${TMD.stageBadge(m.rec.calc.stage)}</td><td>${esc(m.rec.calc.department)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted pad">No upcoming milestones in this window.</td></tr>'}
        </tbody></table></div></section>
      <section class="card"><header class="card-h"><div><h3>${TMD.icon('alert')} Overdue milestones</h3><p class="card-sub">${over.length} overdue action(s)</p></div></header>
        <div class="table-wrap"><table class="data-table hover"><thead><tr><th>Type</th><th>Tender</th><th>Details</th></tr></thead><tbody>
        ${over.map(({ r, a }) => `<tr data-rec="${esc(r.id)}" tabindex="0"><td><span class="pill tone-red">${TMD.icon('clock')}${esc(a.type)}</span></td><td><div class="cell-title">${esc(r.calc.title)}</div><div class="muted small">${esc(r.calc.ident)} · ${esc(r.calc.department)}</div></td><td class="small">${esc(a.msg)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted pad">No overdue milestones.</td></tr>'}
        </tbody></table></div></section></div>`;
  }

  function renderCalendar(body) {
    const today = T();
    if (!V.month) V.month = new Date(today.getFullYear(), today.getMonth(), 1);
    const m0 = V.month;
    const start = new Date(m0); start.setDate(1 - ((m0.getDay() + 6) % 7)); // Monday start
    const ms = allMilestones(records());
    const byDay = new Map();
    ms.forEach((m) => { const k = TMD.isoDate(m.date); (byDay.get(k) || byDay.set(k, []).get(k)).push(m); });
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const k = TMD.isoDate(d);
      const list = byDay.get(k) || [];
      const inMonth = d.getMonth() === m0.getMonth();
      cells.push(`<div class="cal-cell ${inMonth ? '' : 'out'} ${k === TMD.isoDate(today) ? 'today' : ''} ${d < today ? 'past' : ''}">
        <div class="cal-d">${d.getDate()}</div>
        ${list.slice(0, 3).map((m) => `<button class="cal-ev tone-${MS_TONE[m.type] || 'grey'}" data-rec="${esc(m.rec.id)}" data-tip="${esc(m.type + ' — ' + m.rec.calc.title + ' (' + m.rec.calc.ident + ')')}">${marker(m.type)}<span>${esc(m.type)}: ${esc(m.rec.calc.ident)}</span></button>`).join('')}
        ${list.length > 3 ? `<button class="cal-more linklike" data-day="${k}" data-pop-anchor>+${list.length - 3} more</button>` : ''}
      </div>`);
    }
    body.innerHTML = `<section class="card"><header class="card-h"><div class="cal-nav">
        <button class="icon-btn" data-cal="-1" aria-label="Previous month">${TMD.icon('chevronLeft')}</button>
        <h3>${TMD.MONTHS[m0.getMonth()]} ${m0.getFullYear()}</h3>
        <button class="icon-btn" data-cal="1" aria-label="Next month">${TMD.icon('chevronRight')}</button>
        <button class="btn subtle" data-cal="0">Today</button></div><p class="card-sub">${ms.filter((m) => m.date.getMonth() === m0.getMonth() && m.date.getFullYear() === m0.getFullYear()).length} milestone(s) this month</p></header>
      <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div></section>`;
    body._byDay = byDay;
  }

  function renderGantt(body) {
    const recs = records().slice(0, 400);
    const today = T();
    const rows = recs.map((r) => ({ r, ms: TMD.milestonesOf(r).filter((m) => !V.types || V.types.has(m.type)) })).filter((x) => x.ms.length);
    if (!rows.length) { body.innerHTML = '<div class="card empty-state">No dated milestones for the current selection.</div>'; return; }
    let min = Infinity, max = -Infinity;
    rows.forEach((x) => x.ms.forEach((m) => { min = Math.min(min, m.date); max = Math.max(max, m.date); }));
    min = Math.min(min, today); max = Math.max(max, today);
    let s = new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1);
    const e = new Date(new Date(max).getFullYear(), new Date(max).getMonth() + 1, 1);
    // clamp to 36 months
    if ((e - s) / TMD.DAY > 1100) s = new Date(e.getFullYear() - 3, e.getMonth(), 1);
    const months = [];
    for (let d = new Date(s); d < e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
    const pxPerDay = V.zoom / 30;
    const x = (d) => Math.max(0, (d - s) / TMD.DAY * pxPerDay);
    const width = x(e);
    const LBL = 300;
    body.innerHTML = `<section class="card"><header class="card-h"><div><h3>Gantt view</h3><p class="card-sub">${rows.length} tender(s)${records().length > 400 ? ' (first 400 shown)' : ''} · bar spans first → last recorded milestone (to today for open tenders)</p></div>
      <label class="tb-sel">Zoom<select class="inp inp-sm" data-v="zoom">${[[40, 'Compact'], [70, 'Normal'], [120, 'Wide'], [200, 'Extra wide']].map(([v, l]) => `<option value="${v}" ${V.zoom === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></header>
      <div class="gantt" style="--lbl:${LBL}px">
        <div class="gantt-inner" style="width:${LBL + width}px">
          <div class="g-axis"><div class="g-lbl-h">Tender</div>${months.map((m) => `<div class="g-month" style="left:${LBL + x(m)}px;width:${x(new Date(m.getFullYear(), m.getMonth() + 1, 1)) - x(m)}px">${TMD.MONTHS[m.getMonth()]} ${String(m.getFullYear()).slice(2)}</div>`).join('')}</div>
          <div class="g-today" style="left:${LBL + x(today)}px" title="Today ${esc(TMD.fmtDate(today))}"></div>
          ${rows.map(({ r, ms }) => {
            const ds = ms.map((m) => m.date).filter((d) => d >= s);
            const first = ds.length ? Math.min.apply(null, ds) : null;
            let last = ds.length ? Math.max.apply(null, ds.filter((d) => d <= today).concat([first])) : null;
            if (!r.calc.closed) last = Math.max(last || 0, today);
            const tn = TMD.stageInfo(r.calc.stage).tone;
            return `<div class="g-line" data-rec="${esc(r.id)}">
              <button class="g-lbl" data-rec="${esc(r.id)}" title="${esc(r.calc.title)}"><span class="g-title">${esc(r.calc.title)}</span><span class="muted small">${esc(r.calc.ident)} · ${esc(TMD.stageInfo(r.calc.stage).label)}</span></button>
              ${first !== null ? `<div class="g-bar tone-${tn} ${r.calc.delayed ? 'delayed' : ''}" style="left:${LBL + x(first)}px;width:${Math.max(4, x(last) - x(first))}px"></div>` : ''}
              ${ms.filter((m) => m.date >= s).map((m) => `<button class="g-mk tone-${MS_TONE[m.type] || 'grey'} ${m.date > today ? 'future' : ''}" style="left:${LBL + x(m.date) - 6}px" data-rec="${esc(r.id)}" data-tip="${esc(m.type + ': ' + TMD.fmtDate(m.date) + (m.date > today ? ' (planned)' : ''))}" aria-label="${esc(m.type + ' ' + TMD.fmtDate(m.date))}"></button>`).join('')}
            </div>`;
          }).join('')}
        </div></div></section>`;
    // Bring "today" into view (most active milestones are recent)
    const g = body.querySelector('.gantt');
    if (g) g.scrollLeft = Math.max(0, LBL + x(today) - g.clientWidth * 0.7);
  }

  function renderLife(body) {
    const recs = records();
    const groups = TMD.STAGE_GROUPS.map((g) => {
      const list = recs.filter((r) => r.calc.stageGroup === g);
      const stages = TMD.STAGES.slice(1).filter((s) => s.group === g).map((s) => ({ s, n: list.filter((r) => r.calc.stage === s.n).length, delayed: list.filter((r) => r.calc.stage === s.n && r.calc.delayed).length }));
      return { g, list, stages };
    });
    body.innerHTML = `<section class="card"><header class="card-h"><div><h3>Tender lifecycle timeline</h3><p class="card-sub">Count of tenders at each stage (click a stage to filter the register)</p></div></header>
      <div class="life-flow">${groups.filter((x) => x.g !== 'Exception' && x.g !== 'Needs review').map((x) => `<div class="life-col"><div class="life-h">${esc(x.g)} <span class="tag">${x.list.length}</span></div>
        ${x.stages.map(({ s, n, delayed }) => `<button class="life-stage tone-${s.tone} ${n ? '' : 'zero'}" data-stage="${esc(s.label)}"><span>${TMD.icon(s.icon)} ${esc(s.label)}</span><strong>${n}</strong>${delayed ? `<span class="txt-red small">${delayed} delayed</span>` : ''}</button>`).join('')}</div>`).join('<div class="life-arrow">' + TMD.icon('chevronRight') + '</div>')}</div>
      <div class="life-exc"><h4>Exceptions</h4>${groups.filter((x) => x.g === 'Exception' || x.g === 'Needs review').map((x) => x.stages.map(({ s, n }) => `<button class="life-stage tone-${s.tone} ${n ? '' : 'zero'}" data-stage="${esc(s.label)}"><span>${TMD.icon(s.icon)} ${esc(s.label)}</span><strong>${n}</strong></button>`).join('')).join('')}</div></section>
      <div class="chart-grid" id="lifeCharts"></div>`;
    TMD.charts.mount(TMD.$('#lifeCharts'), ['stageGroup', 'ageing']);
  }

  function typesMenu(anchor) {
    const wrap = TMD.el('div', { class: 'ms-pop' });
    const all = Object.keys(MS_TONE);
    const sel = V.types || new Set(all);
    wrap.innerHTML = `<div class="ms-actions"><button class="linklike" data-a="all">All</button><button class="linklike" data-a="none">None</button></div><div class="ms-list">${all.map((t) => `<label class="ms-opt"><input type="checkbox" value="${esc(t)}" ${sel.has(t) ? 'checked' : ''}>${marker(t)}<span class="ms-l">${esc(t)}</span></label>`).join('')}</div>`;
    const commit = () => { const v = TMD.$$('input:checked', wrap).map((c) => c.value); V.types = v.length === all.length ? null : new Set(v); render(); };
    wrap.addEventListener('change', commit);
    wrap.addEventListener('click', (e) => { const a = e.target.closest('[data-a]'); if (!a) return; TMD.$$('input', wrap).forEach((c) => { c.checked = a.dataset.a === 'all'; }); commit(); });
    TMD.popover(anchor, wrap, { cls: 'ms-popover' });
  }

  TMD.timeline = { render, MS_TONE };
  TMD.initTimeline = function () {
    const host = TMD.$('#page-timeline');
    host.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { V.tab = tab.dataset.tab; render(); return; }
      const cal = e.target.closest('[data-cal]');
      if (cal) { const n = +cal.dataset.cal; const t = T(); V.month = n === 0 ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(V.month.getFullYear(), V.month.getMonth() + n, 1); render(); return; }
      const ty = e.target.closest('[data-v="types"]');
      if (ty) { typesMenu(ty); return; }
      const more = e.target.closest('[data-day]');
      if (more) {
        const list = TMD.$('#tlBody')._byDay.get(more.dataset.day) || [];
        const wrap = TMD.el('div', { class: 'menu' });
        wrap.innerHTML = `<div class="menu-h">${esc(TMD.fmtDate(TMD.fromIso(more.dataset.day)))}</div>` + list.map((m) => `<button class="menu-item" data-rec="${esc(m.rec.id)}">${marker(m.type)}<span>${esc(m.type)} — ${esc(m.rec.calc.ident)}</span></button>`).join('');
        wrap.addEventListener('click', (ev) => { const b = ev.target.closest('[data-rec]'); if (b) { TMD.closePopover(); const rec = TMD.state.records.find((x) => x.id === b.dataset.rec); if (rec) TMD.details.open(rec); } });
        TMD.popover(more, wrap);
        return;
      }
      const st = e.target.closest('[data-stage]');
      if (st) { TMD.filters.set('stage', [st.dataset.stage]); TMD.go('register'); return; }
      const r = e.target.closest('[data-rec]');
      if (r) { const rec = TMD.state.records.find((x) => x.id === r.dataset.rec); if (rec) TMD.details.open(rec); }
    });
    host.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('tr[data-rec]'); if (r) r.click(); } });
    host.addEventListener('change', (e) => {
      const v = e.target.dataset.v;
      if (!v) return;
      if (v === 'window' || v === 'zoom') V[v] = +e.target.value; else V[v] = e.target.value;
      render();
    });
  };
})();
