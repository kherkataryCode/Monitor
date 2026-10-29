/* =====================================================================
 * filters.js — global search, advanced filters (AND/OR), chips, presets.
 * createFilters() builds an independent filter engine + filter bar for a
 * module (tenderFilters, cyberAuditFilters). Filters survive page
 * switches within a module and never affect the other module.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const BLANK = '(Blank)';
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
  TMD.inWindow = (d, n) => { if (!d) return false; const x = TMD.daysBetween(TMD.today(), d); return x >= 0 && x <= n; };

  /**
   * M     : module
   * DEFS  : filter definitions [{id,label,group,type:'multi'|'text'|'select'|'range'|'date', get|test|options|anyTest|order|needs}]
   * opts  : { root (element), placeholder, presetKey, searchExtra(rec) → string[] }
   */
  TMD.createFilters = function (M, DEFS, opts) {
    const o = opts || {};
    const st = { logic: 'AND', search: '', values: {} };
    const DEF = {};
    DEFS.forEach((d) => { DEF[d.id] = d; });
    let els = {};

    function isActive(id) {
      const v = st.values[id];
      const d = DEF[id];
      if (!d || v === undefined || v === null) return false;
      if (d.type === 'multi') return v.length > 0;
      if (d.type === 'text' || d.type === 'select') return String(v).trim() !== '';
      if (d.type === 'range') return (v.min !== '' && v.min !== null && v.min !== undefined) || (v.max !== '' && v.max !== null && v.max !== undefined);
      if (d.type === 'date') return !!(v.from || v.to);
      return false;
    }
    function test(d, r) {
      const v = st.values[d.id];
      if (d.type === 'multi') {
        if (d.anyTest) return d.anyTest(r, v);
        const x = d.get(r);
        if (Array.isArray(x)) return x.some((y) => v.indexOf(str(y) || BLANK) >= 0);
        return v.indexOf(str(x) || BLANK) >= 0;
      }
      if (d.type === 'text') return str(d.get(r)).toLowerCase().indexOf(String(v).trim().toLowerCase()) >= 0;
      if (d.type === 'select') return d.test(r, v);
      if (d.type === 'range') {
        const x = d.get(r);
        if (x === null || x === undefined || isNaN(x)) return false;
        if (v.min !== '' && v.min !== null && v.min !== undefined && x < +v.min) return false;
        if (v.max !== '' && v.max !== null && v.max !== undefined && x > +v.max) return false;
        return true;
      }
      if (d.type === 'date') {
        const x = d.get(r);
        if (!x) return false;
        if (v.from && x < TMD.fromIso(v.from)) return false;
        if (v.to && x > TMD.fromIso(v.to)) return false;
        return true;
      }
      return true;
    }
    function searchText(r) {
      if (r.calc._s) return r.calc._s;
      const parts = [r.sheet, r.calc.ident || ''].concat(o.searchExtra ? o.searchExtra(r) : []);
      Object.keys(r.values).forEach((k) => { const v = r.values[k]; if (v !== null && v !== undefined) parts.push(String(v)); });
      r.calc._s = parts.join(' \u0001 ').toLowerCase();
      return r.calc._s;
    }

    function apply() {
      const recs = M.state.records;
      const active = DEFS.filter((d) => isActive(d.id));
      const terms = st.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const out = [];
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (!r.calc) continue;
        if (terms.length) { const s = searchText(r); if (!terms.every((t) => s.indexOf(t) >= 0)) continue; }
        if (active.length) {
          const ok = st.logic === 'AND' ? active.every((d) => test(d, r)) : active.some((d) => test(d, r));
          if (!ok) continue;
        }
        out.push(r);
      }
      M.state.filtered = out;
      renderChips();
      updateCount();
      TMD.emit('filtered', { module: M.id });
    }

    function optionsFor(d) {
      const recs = M.state.records;
      if (d.options && d.type === 'multi') {
        return d.options.map((x) => { const label = typeof x === 'string' ? x : x.label; return { v: label, label, n: d.anyTest ? recs.filter((r) => r.calc && d.anyTest(r, [label])).length : null }; });
      }
      const m = new Map();
      recs.forEach((r) => {
        if (!r.calc) return;
        const x = d.get(r);
        (Array.isArray(x) ? x : [x]).forEach((y) => { const k = str(y) || BLANK; m.set(k, (m.get(k) || 0) + 1); });
      });
      let keys = Array.from(m.keys());
      const order = typeof d.order === 'function' ? d.order() : d.order;
      if (order) keys.sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      else keys.sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, undefined, { numeric: true })));
      return keys.map((k) => ({ v: k, label: k, n: m.get(k) }));
    }

    /* ---------------- UI ---------------- */
    function updateCount() {
      if (!els.count) return;
      const t = M.state.records.length, f = M.state.filtered.length;
      els.count.innerHTML = f === t ? `<strong>${TMD.fmtInt(t)}</strong> records` : `<strong>${TMD.fmtInt(f)}</strong> of ${TMD.fmtInt(t)}`;
      const n = DEFS.filter((d) => isActive(d.id)).length;
      els.advCount.textContent = n ? String(n) : '';
      els.advCount.hidden = !n;
    }
    function describe(id) {
      const d = DEF[id], v = st.values[id];
      if (d.type === 'multi') return v.length > 3 ? `${v.slice(0, 3).join(', ')} +${v.length - 3}` : v.join(', ');
      if (d.type === 'select') { const x = d.options.find((y) => y.v === v); return x ? x.label : v; }
      if (d.type === 'text') return `contains "${v}"`;
      if (d.type === 'range') return `${v.min !== '' && v.min !== undefined && v.min !== null ? '≥ ' + v.min : ''}${v.min && v.max ? ' and ' : ''}${v.max !== '' && v.max !== undefined && v.max !== null ? '≤ ' + v.max : ''}`;
      if (d.type === 'date') return `${v.from ? 'from ' + TMD.fmtDate(TMD.fromIso(v.from)) : ''} ${v.to ? 'to ' + TMD.fmtDate(TMD.fromIso(v.to)) : ''}`.trim();
      return '';
    }
    function renderChips() {
      if (!els.chips) return;
      const chips = [];
      if (st.search.trim()) chips.push(`<span class="chip"><span class="chip-k">Search</span> "${esc(st.search.trim())}" <button class="chip-x" data-clear="__search" aria-label="Clear search">${TMD.icon('x')}</button></span>`);
      DEFS.filter((d) => isActive(d.id)).forEach((d) => {
        chips.push(`<span class="chip"><span class="chip-k">${esc(d.label)}</span> ${esc(describe(d.id))} <button class="chip-x" data-clear="${d.id}" aria-label="Remove filter ${esc(d.label)}">${TMD.icon('x')}</button></span>`);
      });
      if (chips.length > 1) chips.push(`<span class="chip-logic">Combined with <strong>${st.logic}</strong></span>`);
      els.chips.innerHTML = chips.join('');
      els.chips.hidden = !chips.length;
    }
    function controlHtml(d) {
      const v = st.values[d.id];
      if (d.type === 'multi') return `<button class="inp ms-btn" data-ms="${d.id}" data-pop-anchor aria-haspopup="listbox"><span>${v && v.length ? esc(describe(d.id)) : 'All'}</span>${TMD.icon('chevronDown')}</button>`;
      if (d.type === 'text') return `<input class="inp" type="search" data-ft="${d.id}" value="${esc(v || '')}" placeholder="Contains…">`;
      if (d.type === 'select') return `<select class="inp" data-fs="${d.id}"><option value="">Any</option>${d.options.map((x) => `<option value="${esc(x.v)}" ${v === x.v ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
      if (d.type === 'range') return `<div class="range2"><input class="inp" type="number" step="any" data-fr="${d.id}" data-part="min" placeholder="Min" value="${esc(v && v.min !== undefined ? v.min : '')}"><span>–</span><input class="inp" type="number" step="any" data-fr="${d.id}" data-part="max" placeholder="Max" value="${esc(v && v.max !== undefined ? v.max : '')}"></div>`;
      if (d.type === 'date') return `<div class="range2"><input class="inp" type="date" data-fd="${d.id}" data-part="from" value="${esc((v && v.from) || '')}" aria-label="${esc(d.label)} from"><span>–</span><input class="inp" type="date" data-fd="${d.id}" data-part="to" value="${esc((v && v.to) || '')}" aria-label="${esc(d.label)} to"></div>`;
      return '';
    }
    function relevant(d) {
      if (!d.needs) return true;
      const s = M.state;
      return !!s.workbook && s.activeSheets.some((n) => s.workbook.sheets[n].mapping[d.needs]);
    }
    function renderPanel() {
      if (!els.panel || els.panel.hidden) return;
      const groups = {};
      DEFS.forEach((d) => { if (d.hidden || (!relevant(d) && !isActive(d.id))) return; (groups[d.group] = groups[d.group] || []).push(d); });
      els.panel.innerHTML = Object.keys(groups).map((g) => `<fieldset class="fgroup"><legend>${esc(g)}</legend><div class="fgrid">${groups[g].map((d) => `<label class="field ${isActive(d.id) ? 'active' : ''}" data-fid="${d.id}"><span>${esc(d.label)}</span>${controlHtml(d)}</label>`).join('')}</div></fieldset>`).join('');
    }
    function openMulti(btn) {
      const d = DEF[btn.dataset.ms];
      const optsList = optionsFor(d);
      const sel = new Set(st.values[d.id] || []);
      const wrap = TMD.el('div', { class: 'ms-pop' });
      wrap.innerHTML = `<input class="inp" type="search" placeholder="Search ${esc(d.label.toLowerCase())}…" aria-label="Search options">
        <div class="ms-actions"><button class="linklike" data-a="all">Select all</button><button class="linklike" data-a="none">Clear</button></div>
        <div class="ms-list" role="listbox" aria-multiselectable="true">${optsList.map((x) => `<label class="ms-opt"><input type="checkbox" value="${esc(x.v)}" ${sel.has(x.v) ? 'checked' : ''}><span class="ms-l">${esc(x.label)}</span>${x.n !== null ? `<span class="ms-n">${x.n}</span>` : ''}</label>`).join('') || '<div class="muted pad">No values</div>'}</div>`;
      const commit = () => {
        const vals = TMD.$$('input[type=checkbox]', wrap).filter((c) => c.checked).map((c) => c.value);
        if (vals.length) st.values[d.id] = vals; else delete st.values[d.id];
        apply();
        const b = els.panel.querySelector(`[data-ms="${d.id}"] span`);
        if (b) b.textContent = vals.length ? describe(d.id) : 'All';
        const f = els.panel.querySelector(`[data-fid="${d.id}"]`); if (f) f.classList.toggle('active', vals.length > 0);
      };
      wrap.addEventListener('change', commit);
      wrap.addEventListener('input', (e) => {
        if (e.target.type !== 'search') return;
        const q = e.target.value.toLowerCase();
        TMD.$$('.ms-opt', wrap).forEach((x) => { x.hidden = x.textContent.toLowerCase().indexOf(q) < 0; });
      });
      wrap.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        TMD.$$('.ms-opt', wrap).forEach((x) => { if (!x.hidden) x.querySelector('input').checked = a.dataset.a === 'all'; });
        commit();
      });
      TMD.popover(btn, wrap, { cls: 'ms-popover' });
    }
    function setLogic(l, silent) {
      st.logic = l;
      if (els.root) TMD.$$('[data-logic]', els.root).forEach((b) => b.classList.toggle('active', b.dataset.logic === l));
      if (!silent) apply();
    }
    const presetKey = o.presetKey || 'presets';
    const presets = () => TMD.ls.get(presetKey, []);
    function openPresets(anchor) {
      const list = presets();
      const wrap = TMD.el('div', { class: 'menu preset-menu' });
      wrap.innerHTML = `<div class="menu-h">Saved filter presets (this device)</div>
        ${list.length ? list.map((p, i) => `<div class="preset-row"><button class="menu-item" data-load="${i}">${TMD.icon('bookmark')}<span>${esc(p.name)}</span></button><button class="icon-btn sm" data-del="${i}" aria-label="Delete preset ${esc(p.name)}">${TMD.icon('trash')}</button></div>`).join('') : '<div class="muted pad">No presets yet.</div>'}
        <div class="menu-sep"></div><button class="menu-item" data-save="1">${TMD.icon('plus')}<span>Save current filters as preset…</span></button>`;
      wrap.addEventListener('click', async (e) => {
        const l = e.target.closest('[data-load]'), dl = e.target.closest('[data-del]'), sv = e.target.closest('[data-save]');
        if (l) { const p = list[+l.dataset.load]; TMD.closePopover(); api.replace(p.values, { search: p.search || '', logic: p.logic || 'AND' }); TMD.toast(`Preset "${p.name}" applied.`, 'info'); }
        if (dl) { const p = list[+dl.dataset.del]; list.splice(+dl.dataset.del, 1); TMD.ls.set(presetKey, list); TMD.closePopover(); TMD.toast(`Preset "${p.name}" deleted.`, 'info'); }
        if (sv) {
          TMD.closePopover();
          if (!api.activeCount()) { TMD.toast('Set at least one filter before saving a preset.', 'warn'); return; }
          const name = await TMD.prompt('Save filter preset', 'Preset name', '');
          if (!name || !name.trim()) return;
          const all = presets().filter((p) => p.name !== name.trim());
          all.push({ name: name.trim(), values: TMD.deepClone(st.values), search: st.search, logic: st.logic, savedAt: Date.now() });
          TMD.ls.set(presetKey, all);
          TMD.toast(`Preset "${name.trim()}" saved locally.`, 'success');
        }
      });
      TMD.popover(anchor, wrap);
    }

    function mount(root) {
      root.innerHTML = `
        <div class="fb-row">
          <div class="search-box">
            <span class="search-ico">${TMD.icon('search')}</span>
            <input type="search" class="fb-search" placeholder="${esc(o.placeholder || 'Search…')}" aria-label="Search ${esc(M.label)}" autocomplete="off">
          </div>
          <button class="btn subtle fb-adv" aria-expanded="false">${TMD.icon('filter')}<span>Filters</span> <span class="pill-count" hidden></span></button>
          <div class="seg" role="group" aria-label="Filter logic"><button class="seg-btn active" data-logic="AND" title="Records must match every filter">All</button><button class="seg-btn" data-logic="OR" title="Records may match any filter">Any</button></div>
          <button class="btn subtle fb-presets" data-pop-anchor>${TMD.icon('bookmark')}<span>Presets</span></button>
          <button class="btn subtle fb-clear">${TMD.icon('x')}<span>Clear</span></button>
          <div class="fb-count" aria-live="polite"></div>
        </div>
        <div class="chips" hidden></div>
        <div class="adv-filters" hidden></div>`;
      const q = (s) => root.querySelector(s);
      els = { root, search: q('.fb-search'), adv: q('.fb-adv'), advCount: q('.fb-adv .pill-count'), chips: q('.chips'), panel: q('.adv-filters'), count: q('.fb-count') };
      els.search.value = st.search;
      const debounced = TMD.debounce(apply, 220);
      els.search.addEventListener('input', (e) => { st.search = e.target.value; debounced(); });
      TMD.$$('[data-logic]', root).forEach((b) => b.addEventListener('click', () => setLogic(b.dataset.logic)));
      els.adv.addEventListener('click', () => {
        els.panel.hidden = !els.panel.hidden;
        els.adv.setAttribute('aria-expanded', String(!els.panel.hidden));
        els.adv.classList.toggle('on', !els.panel.hidden);
        renderPanel();
        TMD.emit('layout');
      });
      q('.fb-clear').addEventListener('click', () => api.clearAll());
      q('.fb-presets').addEventListener('click', (e) => openPresets(e.currentTarget));
      els.chips.addEventListener('click', (e) => {
        const b = e.target.closest('[data-clear]');
        if (!b) return;
        if (b.dataset.clear === '__search') { st.search = ''; els.search.value = ''; apply(); } else api.clear(b.dataset.clear);
      });
      els.panel.addEventListener('click', (e) => { const b = e.target.closest('[data-ms]'); if (b) { e.preventDefault(); openMulti(b); } });
      const dText = TMD.debounce((id, v) => { if (v.trim()) st.values[id] = v; else delete st.values[id]; apply(); }, 250);
      els.panel.addEventListener('input', (e) => { const t = e.target; if (t.dataset.ft) dText(t.dataset.ft, t.value); });
      els.panel.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.fs) { if (t.value) st.values[t.dataset.fs] = t.value; else delete st.values[t.dataset.fs]; apply(); }
        if (t.dataset.fr) { const v = st.values[t.dataset.fr] || {}; v[t.dataset.part] = t.value; st.values[t.dataset.fr] = v; apply(); }
        if (t.dataset.fd) { const v = st.values[t.dataset.fd] || {}; v[t.dataset.part] = t.value; st.values[t.dataset.fd] = v; apply(); }
        const f = t.closest('[data-fid]'); if (f) f.classList.toggle('active', isActive(f.dataset.fid));
      });
      renderChips(); updateCount();
    }

    const api = {
      DEFS, DEF, state: st, BLANK,
      apply,
      mount,
      set(id, value, silent) { st.values[id] = value; if (!silent) { apply(); renderPanel(); } },
      clear(id) { delete st.values[id]; apply(); renderPanel(); },
      clearAll() { st.values = {}; st.search = ''; if (els.search) els.search.value = ''; apply(); renderPanel(); },
      activeCount: () => DEFS.filter((d) => isActive(d.id)).length + (st.search.trim() ? 1 : 0),
      searchTerm: () => st.search.trim(),
      replace(values, ro) {
        st.values = TMD.deepClone(values || {});
        if (ro && ro.search !== undefined) { st.search = ro.search; if (els.search) els.search.value = ro.search; }
        if (ro && ro.logic) setLogic(ro.logic, true);
        apply(); renderPanel();
      },
      /** Merge filter values (used by KPI cards and charts). */
      merge(values) { const cur = TMD.deepClone(st.values); Object.keys(values).forEach((k) => { cur[k] = TMD.deepClone(values[k]); }); api.replace(cur, { logic: 'AND' }); },
      options: (id) => optionsFor(DEF[id]),
      describe,
      text() {
        const parts = DEFS.filter((d) => isActive(d.id)).map((d) => `${d.label}: ${describe(d.id)}`);
        if (st.search.trim()) parts.unshift(`Search: "${st.search.trim()}"`);
        return parts.join('; ') + (parts.length ? ` (${st.logic})` : '');
      },
    };
    if (o.root) mount(o.root);
    TMD.on('data', (e) => { if (!e || e.module === M.id) { apply(); renderPanel(); } });
    return api;
  };

  /* =================== Tender Monitoring filters =================== */
  const getStd = (r, f) => str(TMD.getStd(r, f));
  const msOpts = [{ v: 'done', label: 'Completed / recorded' }, { v: 'planned', label: 'Planned / pending' }, { v: 'blank', label: 'Blank' }, { v: 'na', label: 'Not applicable' }];
  const msTest = (f) => (r, v) => {
    const m = r.calc.ms[f];
    if (!m || !m.mapped) return v === 'blank';
    if (v === 'done') return m.done; if (v === 'planned') return m.planned; if (v === 'na') return m.na;
    return m.parse.kind === 'blank';
  };
  const MISSING = {
    'PR number': (r) => TMD.hasStd(r, 'prNo') && !r.calc.prNumber,
    'WBS': (r) => TMD.hasStd(r, 'wbs') && !getStd(r, 'wbs'),
    'CRFQ / GeM ID': (r) => TMD.hasStd(r, 'crfq') && !getStd(r, 'crfq'),
    'Tender floating date': (r) => TMD.hasStd(r, 'floatDate') && !getStd(r, 'floatDate'),
    'Tender opening date': (r) => TMD.hasStd(r, 'openingDate') && !getStd(r, 'openingDate'),
    'PO/OLA number (awarded)': (r) => r.calc.awarded && TMD.hasStd(r, 'poNo') && !getStd(r, 'poNo'),
    'Vendor (awarded)': (r) => r.calc.awarded && TMD.hasStd(r, 'vendor') && !getStd(r, 'vendor'),
    'Department': (r) => TMD.hasStd(r, 'department') && !getStd(r, 'department'),
    'Procurement channel': (r) => TMD.hasStd(r, 'channel') && !getStd(r, 'channel'),
    'Tender initiator': (r) => TMD.hasStd(r, 'initiator') && !getStd(r, 'initiator'),
    'Officer': (r) => TMD.hasStd(r, 'officer') && !getStd(r, 'officer'),
    'Current status remark': (r) => TMD.hasStd(r, 'statusRemark') && !getStd(r, 'statusRemark'),
  };
  const inWindow = TMD.inWindow;
  const TENDER_DEFS = [
    { id: 'worksheet', label: 'Worksheet', group: 'Scope', type: 'multi', get: (r) => r.sheet },
    { id: 'fy', label: 'Financial year', group: 'Scope', type: 'multi', get: (r) => r.calc.fy },
    { id: 'department', label: 'Department', group: 'Scope', type: 'multi', get: (r) => r.calc.department },
    { id: 'deptCat', label: 'Instrumentation / Electrical / Other', group: 'Scope', type: 'multi', get: (r) => r.calc.deptCat },
    { id: 'capexRevex', label: 'CAPEX / REVEX', group: 'Scope', type: 'multi', get: (r) => r.calc.capexRevex },
    { id: 'channel', label: 'Procurement channel', group: 'Scope', type: 'multi', get: (r) => r.calc.channel },
    { id: 'officer', label: 'Officer', group: 'Scope', type: 'multi', get: (r) => r.calc.officer, needs: 'officer' },
    { id: 'initiator', label: 'Tender initiator', group: 'Scope', type: 'multi', get: (r) => r.calc.initiator, needs: 'initiator' },
    { id: 'nature', label: 'Nature of work', group: 'Scope', type: 'multi', get: (r) => r.calc.nature, needs: 'nature' },
    { id: 'vendor', label: 'Vendor', group: 'Scope', type: 'multi', get: (r) => r.calc.vendor, needs: 'vendor' },
    { id: 'wbs', label: 'WBS number', group: 'Identifiers', type: 'text', get: (r) => getStd(r, 'wbs') },
    { id: 'prNo', label: 'PR number', group: 'Identifiers', type: 'text', get: (r) => r.calc.prNumber },
    { id: 'crfq', label: 'CRFQ / GeM ID', group: 'Identifiers', type: 'text', get: (r) => getStd(r, 'crfq') },
    { id: 'poNo', label: 'PO / OLA number', group: 'Identifiers', type: 'text', get: (r) => getStd(r, 'poNo') },
    { id: 'mgmt', label: 'Management status', group: 'Status', type: 'multi', get: (r) => (r.calc.mgmt ? r.calc.mgmt.name : ''), order: () => TMD.mgmtStatuses().map((s) => s.name) },
    { id: 'stageGroup', label: 'Tender stage', group: 'Status', type: 'multi', get: (r) => r.calc.stageGroup, order: TMD.STAGE_GROUPS },
    { id: 'stage', label: 'Calculated current status', group: 'Status', type: 'multi', get: (r) => TMD.stageInfo(r.calc.stage).label, order: TMD.STAGES.slice(1).map((s) => s.label) },
    { id: 'statusFlag', label: 'Status flag (source)', group: 'Status', type: 'multi', get: (r) => getStd(r, 'statusFlag'), needs: 'statusFlag' },
    { id: 'quickStatus', label: 'Quick status (source)', group: 'Status', type: 'multi', get: (r) => getStd(r, 'quickStatus'), needs: 'quickStatus' },
    { id: 'completion', label: 'Completed / pending', group: 'Status', type: 'select', options: [{ v: 'completed', label: 'Completed' }, { v: 'pending', label: 'Pending (open)' }, { v: 'closedExc', label: 'Cancelled / scrapped / on hold' }],
      test: (r, v) => (v === 'completed' ? r.calc.stage === 22 : v === 'pending' ? !r.calc.closed : [23, 24, 25].indexOf(r.calc.stage) >= 0) },
    { id: 'delay', label: 'Delayed / on track', group: 'Status', type: 'select', options: [{ v: 'delayed', label: 'Delayed' }, { v: 'ontrack', label: 'On track' }, { v: 'closed', label: 'Closed / exception' }],
      test: (r, v) => (v === 'delayed' ? r.calc.delayed : v === 'ontrack' ? !r.calc.delayed && !r.calc.closed : r.calc.closed) },
    { id: 'attention', label: 'Needs attention (status follow-up)', group: 'Status', type: 'select', options: [{ v: 'any', label: 'Any status follow-up alert' }, { v: 'overdue', label: 'Next action date overdue' }, { v: 'due', label: 'Next action date due soon' }, { v: 'stale', label: 'Status not updated recently' }],
      test: (r, v) => r.calc.alerts.some((a) => a.statusDue && (v === 'any' || (v === 'overdue' && a.type === 'Status action date overdue') || (v === 'due' && a.type === 'Status action date due') || (v === 'stale' && a.type === 'Status not updated recently'))) },
    { id: 'overdue', label: 'Overdue milestones', group: 'Status', type: 'select', options: [{ v: 'yes', label: 'Has overdue milestone' }, { v: 'no', label: 'No overdue milestone' }], test: (r, v) => (v === 'yes' ? r.calc.overdue : !r.calc.overdue) },
    { id: 'openingDue', label: 'Bid opening due within', group: 'Status', type: 'select', options: [{ v: '7', label: '7 days' }, { v: '15', label: '15 days' }, { v: '30', label: '30 days' }],
      test: (r, v) => r.calc.stage <= 7 && inWindow(r.calc.d.openingDate, +v) },
    { id: 'upcoming', label: 'Upcoming milestone within', group: 'Status', type: 'select', options: [{ v: '7', label: '7 days' }, { v: '30', label: '30 days' }],
      test: (r, v) => !r.calc.closed && TMD.milestonesOf(r).some((m) => inWindow(m.date, +v)) },
    { id: 'awardDue', label: 'Award due', group: 'Status', type: 'select', options: [{ v: 'yes', label: 'Award due (TEC / negotiation / award in progress)' }], test: (r) => r.calc.stage >= 13 && r.calc.stage <= 15 },
    { id: 'awarded', label: 'PO/OLA awarded', group: 'Status', type: 'select', options: [{ v: 'yes', label: 'Awarded' }, { v: 'no', label: 'Not awarded' }], test: (r, v) => (v === 'yes' ? r.calc.awarded : !r.calc.awarded) },
    { id: 'postAward', label: 'Post-award execution', group: 'Status', type: 'select', options: [{ v: 'yes', label: 'In execution (drawing → installation)' }], test: (r) => r.calc.stage >= 17 && r.calc.stage <= 21 },
    { id: 'inProgress', label: 'In progress', group: 'Status', type: 'select', options: [{ v: 'yes', label: 'Floated → award (not yet awarded)' }], test: (r) => r.calc.stage >= 5 && r.calc.stage <= 15, hidden: true },
    { id: 'fat', label: 'FAT status/date', group: 'Status', type: 'select', options: msOpts, test: msTest('fat'), needs: 'fat' },
    { id: 'sat', label: 'SAT status/date', group: 'Status', type: 'select', options: msOpts, test: msTest('sat'), needs: 'sat' },
    { id: 'installation', label: 'Installation status/date', group: 'Status', type: 'select', options: msOpts, test: msTest('installation'), needs: 'installation' },
    { id: 'estCost', label: 'Estimated cost (₹ lakh)', group: 'Amounts (₹ lakh)', type: 'range', get: (r) => (r.calc.estRupees === null ? null : r.calc.estRupees / 1e5) },
    { id: 'projectCost', label: 'Project cost (₹ lakh)', group: 'Amounts (₹ lakh)', type: 'range', get: (r) => (r.calc.projectRupees === null ? null : r.calc.projectRupees / 1e5) },
    { id: 'cashOutflow', label: 'Cash outflow (₹ lakh)', group: 'Amounts (₹ lakh)', type: 'range', get: (r) => (r.calc.cashOutflowRupees === null ? null : r.calc.cashOutflowRupees / 1e5) },
    { id: 'd_prSentDate', label: 'PR sent date', group: 'Dates', type: 'date', get: (r) => r.calc.d.prSentDate },
    { id: 'd_floatDate', label: 'Tender floating date', group: 'Dates', type: 'date', get: (r) => r.calc.d.floatDate },
    { id: 'd_openingDate', label: 'Bid opening date', group: 'Dates', type: 'date', get: (r) => r.calc.d.actualOpeningDate || r.calc.d.openingDate },
    { id: 'd_techEvalDate', label: 'Technical evaluation date', group: 'Dates', type: 'date', get: (r) => r.calc.d.techEvalDate },
    { id: 'd_priceBidDate', label: 'Price bid date', group: 'Dates', type: 'date', get: (r) => r.calc.d.priceBidDate },
    { id: 'd_awardDate', label: 'PO/OLA award date', group: 'Dates', type: 'date', get: (r) => r.calc.d.awardDate },
    { id: 'd_validity', label: 'PO/OLA validity date', group: 'Dates', type: 'date', get: (r) => r.calc.d.validity },
    { id: 'd_capexFinish', label: 'CAPEX finish date', group: 'Dates', type: 'date', get: (r) => r.calc.d.capexFinish },
    { id: 'd_nextAction', label: 'Next action date', group: 'Dates', type: 'date', get: (r) => r.calc.nextAction, needs: 'nextActionDate' },
    { id: 'missing', label: 'Blank / missing critical fields', group: 'Data', type: 'multi', options: Object.keys(MISSING), anyTest: (r, vals) => vals.some((k) => MISSING[k] && MISSING[k](r)) },
    { id: 'dq', label: 'Data quality warnings', group: 'Data', type: 'select', options: [{ v: 'any', label: 'Any warning' }, { v: 'high', label: 'High severity' }, { v: 'conflict', label: 'Data conflict' }, { v: 'none', label: 'No warnings' }],
      test: (r, v) => (v === 'any' ? r.calc.dq.length > 0 : v === 'high' ? r.calc.dqHigh : v === 'conflict' ? !!r.calc.conflict : r.calc.dq.length === 0) },
    { id: 'edited', label: 'Edited records only', group: 'Data', type: 'select', options: [{ v: 'yes', label: 'Edited / added in this app' }], test: (r) => r.edited || r.isNew },
    { id: 'override', label: 'Manual status overrides', group: 'Data', type: 'select', options: [{ v: 'yes', label: 'Has manual override' }], test: (r) => !!(r.override && r.override.stage) },
  ];

  TMD.filters = TMD.createFilters(TMD.modules.tender, TENDER_DEFS, {
    placeholder: 'Search tenders — PR, WBS, GeM ID, vendor, officer, status…',
    presetKey: 'presets',
    searchExtra: (r) => [TMD.stageInfo(r.calc.stage).label, r.calc.mgmt ? r.calc.mgmt.name : ''],
  });
  TMD.initFilters = function () { TMD.filters.mount(TMD.$('#fbTender')); };
})();
