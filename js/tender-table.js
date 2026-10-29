/* =====================================================================
 * tender-table.js — virtualised Tender Register grid.
 *  sticky header · frozen columns · resize · reorder · show/hide
 *  multi-sort · per-column search · grouping · wrap/density · selection
 *  cell-range copy · keyboard navigation · inline editing (Edit Mode)
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const SYS_W = [34, 70]; // checkbox, row number / actions
  const SYS_TOTAL = SYS_W[0] + SYS_W[1];

  const G = {
    layoutKey: '', order: [], hidden: new Set(), widths: {}, sort: [], colSearch: {}, showColSearch: false,
    wrap: false, groupBy: '', collapsed: new Set(), items: [], rows: [], vcols: [], lefts: [], total: 0,
    focus: null, anchor: null, mounted: false, editor: null, lastRange: [0, 0],
  };
  TMD.grid = G;

  const rowH = () => (G.wrap ? 66 : TMD.settings.get('density') === 'comfortable' ? 38 : 30);
  const frozenN = () => Math.max(0, Math.min(4, +TMD.settings.get('frozenCols') || 0));

  /* ---------------- Layout persistence ---------------- */
  function loadLayout() {
    const st = TMD.state;
    const key = 'layout.' + st.activeSheets.map((n) => TMD.sheetSignature(n, st.workbook.sheets[n].headers)).join('+');
    G.layoutKey = key;
    const saved = TMD.ls.get(key, null);
    const ids = st.columns.map((c) => c.id);
    if (saved) {
      G.order = saved.order.filter((id) => ids.indexOf(id) >= 0).concat(ids.filter((id) => saved.order.indexOf(id) < 0));
      G.hidden = new Set((saved.hidden || []).filter((id) => ids.indexOf(id) >= 0));
      G.widths = saved.widths || {};
      G.wrap = !!saved.wrap;
    } else {
      G.order = ids;
      G.hidden = new Set(st.columns.filter((c) => c.hiddenByDefault).map((c) => c.id));
      G.widths = {};
      G.wrap = false;
    }
    G.sort = []; G.colSearch = {}; G.collapsed = new Set();
  }
  const saveLayout = TMD.debounce(() => {
    TMD.ls.set(G.layoutKey, { order: G.order, hidden: Array.from(G.hidden), widths: G.widths, wrap: G.wrap });
  }, 400);
  function resetLayout() { TMD.ls.remove(G.layoutKey); loadLayout(); G.groupBy = ''; refresh(true); TMD.toast('Table layout reset.', 'info'); }

  function colById(id) { return TMD.state.columns.find((c) => c.id === id); }
  function computeCols() {
    G.vcols = G.order.map(colById).filter((c) => c && !G.hidden.has(c.id));
    G.lefts = [];
    let x = SYS_TOTAL;
    G.vcols.forEach((c) => { G.lefts.push(x); x += G.widths[c.id] || c.width; });
    G.total = x;
  }

  /* ---------------- Sorting / column search / grouping ---------------- */
  function sortKey(col, rec) {
    const c = rec.calc;
    if (col.id === '__stage') return c.stage;
    if (col.id === '__delay') return c.delayed ? 0 : c.closed ? 2 : 1;
    if (col.kind === 'calc') { const v = TMD.colValue(col, rec); return v === null || v === undefined ? null : v; }
    const v = TMD.colValue(col, rec);
    if (TMD.isBlank(v)) return null;
    if (col.isDate || col.type === 'date' || col.type === 'milestone') {
      const k = col.keysBySheet[rec.sheet];
      const p = TMD.parseDate(v, rec.dateHints[k], true);
      return p.date ? p.date.getTime() : String(v).toLowerCase();
    }
    if (col.type === 'amount' || col.type === 'number') { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? String(v).toLowerCase() : n; }
    return String(v).toLowerCase();
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  function cmp(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return collator.compare(a, b);
  }

  function buildRows() {
    let rows = TMD.state.filtered;
    const cs = Object.keys(G.colSearch).filter((id) => G.colSearch[id]);
    if (cs.length) {
      rows = rows.filter((r) => cs.every((id) => {
        const col = colById(id);
        if (!col) return true;
        const v = TMD.colValue(col, r);
        return String(v === null || v === undefined ? '' : v).toLowerCase().indexOf(G.colSearch[id].toLowerCase()) >= 0;
      }));
    }
    if (G.sort.length) {
      const sorts = G.sort.map((s) => ({ col: colById(s.id), dir: s.dir })).filter((s) => s.col);
      const keyed = rows.map((r, i) => ({ r, i, k: sorts.map((s) => sortKey(s.col, r)) }));
      keyed.sort((a, b) => {
        for (let j = 0; j < sorts.length; j++) {
          const ka = a.k[j], kb = b.k[j];
          if (ka === null && kb === null) continue;
          if (ka === null) return 1; // blanks always last
          if (kb === null) return -1;
          const c = cmp(ka, kb) * (sorts[j].dir === 'desc' ? -1 : 1);
          if (c) return c;
        }
        return a.i - b.i;
      });
      rows = keyed.map((x) => x.r);
    }
    G.rows = rows;
    if (G.groupBy) {
      const getter = GROUPS[G.groupBy].get;
      const map = new Map();
      rows.forEach((r) => { const k = getter(r) || '(Blank)'; (map.get(k) || map.set(k, []).get(k)).push(r); });
      let keys = Array.from(map.keys());
      if (G.groupBy === 'stage') keys.sort((a, b) => TMD.STAGES.findIndex((s) => s && s.label === a) - TMD.STAGES.findIndex((s) => s && s.label === b));
      else keys.sort((a, b) => collator.compare(a, b));
      G.items = [];
      keys.forEach((k) => {
        const list = map.get(k);
        G.items.push({ group: k, count: list.length, est: TMD.sum(list, (r) => r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees), delayed: list.filter((r) => r.calc.delayed).length });
        if (!G.collapsed.has(k)) list.forEach((r) => G.items.push({ rec: r }));
      });
    } else G.items = rows.map((r) => ({ rec: r }));
  }
  const GROUPS = {
    department: { label: 'Department', get: (r) => r.calc.department },
    capexRevex: { label: 'CAPEX / REVEX', get: (r) => r.calc.capexRevex },
    channel: { label: 'Procurement channel', get: (r) => r.calc.channel },
    stage: { label: 'Current stage', get: (r) => TMD.stageInfo(r.calc.stage).label },
    initiator: { label: 'Tender initiator', get: (r) => r.calc.initiator },
    sheet: { label: 'Worksheet', get: (r) => r.sheet },
  };

  /* ---------------- Cell rendering ---------------- */
  function cellInner(col, rec, term) {
    const c = rec.calc;
    if (col.id === '__stage') {
      let extra = '';
      if (c.conflict) extra += `<span class="mini-flag warn" data-tip="Data conflict: ${esc(c.conflict)}">${TMD.icon('alert')}</span>`;
      if (c.overridden) extra += `<span class="mini-flag" data-tip="Manual override">${TMD.icon('edit')}</span>`;
      return `<span data-tip="${esc(c.stageReason)}">${TMD.stageBadge(c.stage)}</span>${extra}`;
    }
    if (col.id === '__delay') {
      if (c.delayed) return `<span class="pill tone-red" data-tip="${esc(c.alerts.filter((a) => a.delay).map((a) => a.type + ': ' + a.msg).join('\n'))}">${TMD.icon('clock')}Delayed</span>`;
      if (c.closed) return `<span class="pill tone-grey">${TMD.icon(c.stage === 22 ? 'check' : 'pause')}${esc(c.stage === 22 ? 'Closed' : TMD.stageInfo(c.stage).label)}</span>`;
      if (c.alerts.some((a) => a.upcoming && !a.silent)) return `<span class="pill tone-amber" data-tip="${esc(c.alerts.filter((a) => a.upcoming && !a.silent).map((a) => a.msg).join('\n'))}">${TMD.icon('alert')}Attention</span>`;
      return `<span class="pill tone-green">${TMD.icon('check')}On track</span>`;
    }
    if (col.kind === 'calc') {
      const v = TMD.colValue(col, rec);
      if (v === null || v === undefined || v === '') return '<span class="nil">—</span>';
      if (col.type === 'money') return `<span data-tip="${esc(TMD.fmtMoneyExact(v))}">${esc(TMD.fmtMoney(v))}</span>`;
      if (col.type === 'pct') return esc(TMD.fmtNum(v, 1) + '%');
      if (col.type === 'int') return `<span class="${v < 0 ? 'neg' : ''}">${esc(TMD.fmtInt(v))}</span>`;
      if (col.type === 'longtext') return `<div class="clamp" data-trunc data-full="${esc(v)}">${TMD.highlight(v, term)}</div>`;
      return TMD.highlight(v, term);
    }
    const key = col.keysBySheet[rec.sheet];
    if (key === undefined) return '<span class="nil na" title="Column not present in this worksheet">n/a</span>';
    const v = rec.values[key];
    if (TMD.isBlank(v)) return '';
    const text = TMD.cellText(v);
    if (col.isDate || col.type === 'date' || col.type === 'milestone') {
      const p = TMD.parseDate(v, rec.dateHints[key], true);
      if (p.kind === 'serial') return `<span class="cell-serial" data-tip="Excel serial number ${esc(text)} — read as ${esc(TMD.fmtDate(p.date))}. Source value unchanged.">${esc(TMD.fmtDate(p.date))}<sup>serial</sup></span>`;
      if (p.kind === 'invalid') return `<span class="cell-bad" data-tip="Not a valid date">${TMD.icon('alert')}${TMD.highlight(text, term)}</span>`;
      const overdue = col.std === 'openingDate' && c.alerts.some((a) => a.type === 'Bid opening overdue');
      const amb = p.fmt === 'mdy' ? ` data-tip="Read as ${esc(TMD.fmtDate(p.date))} (mm/dd/yyyy detected)"` : '';
      return `<span class="${overdue ? 'cell-overdue' : ''}${p.fmt === 'mdy' ? ' cell-amb' : ''}"${amb}${p.kind === 'textdate' ? ` data-trunc data-full="${esc(text)}"` : ''}>${TMD.highlight(text, term)}</span>`;
    }
    if (col.type === 'amount') {
      const sh = TMD.sheetOf(rec);
      const unit = (sh.colMeta[key] && sh.colMeta[key].unit) || TMD.settings.get(TMD.STD[col.std] ? TMD.STD[col.std].unitSetting : 'unitCashOutflow') || 'rupees';
      const a = TMD.parseAmount(v, unit);
      if (a.kind === 'num') return `<span data-tip="${esc(TMD.fmtMoneyExact(a.rupees))} — source unit: ${esc(unit)}">${esc(typeof v === 'number' ? TMD.fmtNum(v) : text)}</span>`;
      return `<span class="cell-bad" data-tip="Amount contains text">${TMD.highlight(text, term)}</span>`;
    }
    if (col.type === 'number' && typeof v === 'number') return esc(TMD.fmtNum(v));
    if (col.type === 'longtext') return `<div class="clamp lt" data-trunc data-full="${esc(text)}">${TMD.highlight(text, term)}</div>`;
    return `<span data-trunc data-full="${esc(text)}" class="tx">${TMD.highlight(text, term)}</span>`;
  }

  function isRightAligned(col) { return ['amount', 'number', 'money', 'pct', 'int'].indexOf(col.type) >= 0; }

  /* ---------------- Rendering ---------------- */
  let els = {};
  function mount(host) {
    host.innerHTML = `
      <div class="reg-toolbar" id="regToolbar"></div>
      <div class="grid ${G.wrap ? 'wrap' : ''}" id="grid" role="grid" aria-label="Tender register" aria-rowcount="0">
        <div class="grid-viewport" id="gridViewport" tabindex="0">
          <div class="grid-head" id="gridHead"></div>
          <div class="grid-body" id="gridBody"></div>
          <div class="grid-empty" id="gridEmpty" hidden></div>
        </div>
      </div>
      <div class="reg-foot" id="regFoot"></div>`;
    els = { tb: TMD.$('#regToolbar'), grid: TMD.$('#grid'), vp: TMD.$('#gridViewport'), head: TMD.$('#gridHead'), body: TMD.$('#gridBody'), empty: TMD.$('#gridEmpty'), foot: TMD.$('#regFoot') };
    els.vp.addEventListener('scroll', () => {
      if (!G.raf) G.raf = requestAnimationFrame(() => { G.raf = 0; renderRows(); });
      // A scroll right after opening is caused by bringing the cell into view; keep the editor then.
      if (G.editor && Date.now() - G.editor.openedAt > 400) closeEditor(true);
    }, { passive: true });
    wireEvents();
    G.mounted = true;
  }

  function renderToolbar() {
    const edit = TMD.state.mode === 'edit';
    const sel = TMD.state.selection.size;
    const st = TMD.state;
    els.tb.innerHTML = `
      <div class="tb-group">
        <button class="btn subtle" data-act="sheets" data-tip="Choose active worksheet(s)">${TMD.icon('layers')}<span>${esc(st.activeSheets.join(' + ') || 'Worksheet')}</span></button>
        <button class="btn subtle" data-act="columns" data-pop-anchor>${TMD.icon('columns')}<span>Columns</span></button>
        <label class="tb-sel">${TMD.icon('rows')}<select class="inp inp-sm" data-act="group" aria-label="Group by"><option value="">No grouping</option>${Object.keys(GROUPS).map((k) => `<option value="${k}" ${G.groupBy === k ? 'selected' : ''}>Group: ${esc(GROUPS[k].label)}</option>`).join('')}</select></label>
        <label class="tb-sel" data-tip="Number of data columns frozen on the left">Freeze<select class="inp inp-sm" data-act="freeze" aria-label="Frozen columns">${[0, 1, 2, 3, 4].map((n) => `<option ${frozenN() === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn subtle ${G.showColSearch ? 'on' : ''}" data-act="colsearch" aria-pressed="${G.showColSearch}">${TMD.icon('search')}<span>Column search</span></button>
        <button class="btn subtle ${G.wrap ? 'on' : ''}" data-act="wrap" aria-pressed="${G.wrap}">${TMD.icon('wrap')}<span>Wrap</span></button>
        <button class="btn subtle" data-act="density" data-tip="Toggle compact / comfortable rows">${TMD.icon('rows')}<span>${TMD.settings.get('density') === 'comfortable' ? 'Comfortable' : 'Compact'}</span></button>
        <button class="btn subtle" data-act="fullscreen">${TMD.icon('expand')}<span>${document.body.classList.contains('table-full') ? 'Exit full screen' : 'Full screen'}</span></button>
        <button class="btn subtle" data-act="more" data-pop-anchor>${TMD.icon('more')}<span>More</span></button>
      </div>
      <div class="tb-group edit-tools" ${edit ? '' : 'hidden'}>
        <button class="btn subtle" data-act="add">${TMD.icon('plus')}<span>Add Row</span></button>
        <button class="btn subtle" data-act="dup" ${sel ? '' : 'disabled'}>${TMD.icon('copy')}<span>Duplicate</span></button>
        <button class="btn subtle danger" data-act="del" ${sel ? '' : 'disabled'}>${TMD.icon('trash')}<span>Delete</span></button>
        <button class="icon-btn" data-act="undo" aria-label="Undo" data-tip="Undo (Ctrl+Z)" ${TMD.editMode && TMD.editMode.canUndo() ? '' : 'disabled'}>${TMD.icon('undo')}</button>
        <button class="icon-btn" data-act="redo" aria-label="Redo" data-tip="Redo (Ctrl+Y)" ${TMD.editMode && TMD.editMode.canRedo() ? '' : 'disabled'}>${TMD.icon('redo')}</button>
      </div>
      <div class="tb-group sel-tools" ${sel ? '' : 'hidden'}>
        <span class="sel-count"><strong>${sel}</strong> selected</span>
        <button class="btn subtle" data-act="copy">${TMD.icon('copy')}<span>Copy</span></button>
        <button class="btn subtle" data-act="exportSel">${TMD.icon('download')}<span>Export selected</span></button>
        <button class="btn subtle" data-act="clearSel">${TMD.icon('x')}<span>Clear</span></button>
      </div>`;
  }

  function headerHtml() {
    const fz = frozenN();
    const allSel = G.rows.length > 0 && G.rows.every((r) => TMD.state.selection.has(r.id));
    let h = `<div class="g-row g-hrow" style="width:${G.total}px">`;
    h += `<div class="g-cell g-sys g-frozen" style="left:0;width:${SYS_W[0]}px"><input type="checkbox" class="sel-all" ${allSel ? 'checked' : ''} aria-label="Select all filtered records"></div>`;
    h += `<div class="g-cell g-sys g-frozen g-hash" style="left:${SYS_W[0]}px;width:${SYS_W[1]}px">#</div>`;
    G.vcols.forEach((c, i) => {
      const w = G.widths[c.id] || c.width;
      const s = G.sort.findIndex((x) => x.id === c.id);
      const sortIco = s >= 0 ? `<span class="sort-ind">${TMD.icon(G.sort[s].dir === 'asc' ? 'sortAsc' : 'sortDesc')}${G.sort.length > 1 ? `<sub>${s + 1}</sub>` : ''}</span>` : '';
      const frozen = i < fz;
      const title = c.kind === 'source' && c.sourceLabel !== c.label ? `${c.label} (source header: ${c.sourceLabel})` : c.label;
      h += `<div class="g-cell g-hcell ${c.kind === 'calc' ? 'calc' : ''} ${frozen ? 'g-frozen' : ''} ${frozen && i === fz - 1 ? 'g-frozen-last' : ''} ${isRightAligned(c) ? 'right' : ''}" style="${frozen ? `left:${G.lefts[i]}px;` : ''}width:${w}px" data-col="${esc(c.id)}" draggable="true" role="columnheader" aria-sort="${s >= 0 ? (G.sort[s].dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="${esc(title)}${c.kind === 'calc' ? ' — calculated, not part of source data' : ''}. Click to sort; Shift+click for multi-sort; drag to reorder.">
        ${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}<span class="h-label">${esc(c.label)}</span>${sortIco}<span class="rz" data-rz="${esc(c.id)}" aria-hidden="true"></span></div>`;
    });
    h += '</div>';
    if (G.showColSearch) {
      h += `<div class="g-row g-frow" style="width:${G.total}px"><div class="g-cell g-sys g-frozen" style="left:0;width:${SYS_TOTAL}px"></div>`;
      G.vcols.forEach((c, i) => {
        const frozen = i < fz;
        h += `<div class="g-cell ${frozen ? 'g-frozen' : ''}" style="${frozen ? `left:${G.lefts[i]}px;` : ''}width:${G.widths[c.id] || c.width}px"><input class="inp inp-xs colsearch" type="search" data-cs="${esc(c.id)}" value="${esc(G.colSearch[c.id] || '')}" placeholder="Filter…" aria-label="Filter ${esc(c.label)}"></div>`;
      });
      h += '</div>';
    }
    return h;
  }

  function renderHeader() {
    els.head.innerHTML = headerHtml();
    els.body.style.height = (G.items.length * rowH()) + 'px';
    els.body.style.width = G.total + 'px';
    els.grid.classList.toggle('wrap', G.wrap);
    els.grid.classList.toggle('editing', TMD.state.mode === 'edit');
    els.grid.style.setProperty('--rh', rowH() + 'px');
  }

  function renderRows() {
    if (!els.vp) return;
    const rh = rowH();
    const headH = els.head.offsetHeight;
    const top = Math.max(0, els.vp.scrollTop - headH);
    const vh = els.vp.clientHeight;
    const start = Math.max(0, Math.floor(top / rh) - 8);
    const end = Math.min(G.items.length, Math.ceil((top + vh) / rh) + 8);
    G.lastRange = [start, end];
    const fz = frozenN();
    const term = TMD.filters.searchTerm();
    const edit = TMD.state.mode === 'edit';
    const sel = TMD.state.selection;
    const range = selRange();
    // Horizontal virtualisation: frozen columns always, others only when near the viewport.
    const xL = els.vp.scrollLeft - 400, xR = els.vp.scrollLeft + els.vp.clientWidth + 400;
    const show = G.vcols.map((c, ci) => ci < fz || (G.lefts[ci] + (G.widths[c.id] || c.width) >= xL && G.lefts[ci] <= xR));
    const firstVis = show.findIndex((v, ci) => v && ci >= fz);
    const frozenEnd = fz ? G.lefts[fz - 1] + (G.widths[G.vcols[fz - 1].id] || G.vcols[fz - 1].width) : SYS_TOTAL;
    const spacerW = firstVis > 0 ? G.lefts[firstVis] - frozenEnd : 0;
    let html = '';
    for (let i = start; i < end; i++) {
      const it = G.items[i];
      const y = i * rh;
      if (it.group !== undefined) {
        const col = G.collapsed.has(it.group);
        html += `<div class="g-row g-group" style="top:${y}px;width:${G.total}px" data-group="${esc(it.group)}"><div class="g-cell g-frozen g-group-cell" style="left:0">
          <button class="icon-btn sm" aria-label="${col ? 'Expand' : 'Collapse'} group">${TMD.icon(col ? 'chevronRight' : 'chevronDown')}</button>
          <strong>${esc(GROUPS[G.groupBy].label)}: ${esc(it.group)}</strong><span class="muted">${TMD.plural(it.count, 'record')}${it.est ? ' · Est. ' + esc(TMD.fmtMoney(it.est)) : ''}${it.delayed ? ` · <span class="txt-red">${it.delayed} delayed</span>` : ''}</span></div></div>`;
        continue;
      }
      const r = it.rec;
      const isSel = sel.has(r.id);
      html += `<div class="g-row ${isSel ? 'sel' : ''} ${r.edited || r.isNew ? 'edited' : ''} ${i % 2 ? 'odd' : ''}" style="top:${y}px;width:${G.total}px" data-ri="${i}" data-id="${esc(r.id)}" role="row">`;
      html += `<div class="g-cell g-sys g-frozen" style="left:0;width:${SYS_W[0]}px"><input type="checkbox" class="row-chk" ${isSel ? 'checked' : ''} aria-label="Select row"></div>`;
      html += `<div class="g-cell g-sys g-frozen g-hash" style="left:${SYS_W[0]}px;width:${SYS_W[1]}px"><span class="rownum" title="${esc(r.sheet)} — source row ${r.rowNum}">${r.isNew ? 'new' : r.rowNum}</span>${r.edited || r.isNew ? `<span class="edited-dot" aria-label="Edited" data-tip="Edited locally${r.editedKeys.length ? ': ' + esc(r.editedKeys.join(', ')) : ''}">Edited</span>` : ''}<button class="icon-btn xs row-menu" aria-label="Row actions" data-pop-anchor>${TMD.icon('more')}</button></div>`;
      G.vcols.forEach((c, ci) => {
        if (!show[ci]) return;
        if (ci === firstVis && spacerW > 0) html += `<div class="g-spacer" style="width:${spacerW}px"></div>`;
        const frozen = ci < fz;
        const editable = edit && c.kind === 'source' && c.keysBySheet[r.sheet] !== undefined;
        const inRange = range && (range.r1 > range.r0 || range.c1 > range.c0) && i >= range.r0 && i <= range.r1 && ci >= range.c0 && ci <= range.c1;
        const focused = G.focus && G.focus.ri === i && G.focus.ci === ci;
        const modified = c.kind === 'source' && r.editedKeys.indexOf(c.keysBySheet[r.sheet]) >= 0;
        html += `<div class="g-cell ${frozen ? 'g-frozen' : ''} ${frozen && ci === fz - 1 ? 'g-frozen-last' : ''} ${isRightAligned(c) ? 'right' : ''} ${editable ? 'editable' : ''} ${inRange ? 'in-range' : ''} ${focused ? 'focus' : ''} ${modified ? 'modified' : ''}" style="${frozen ? `left:${G.lefts[ci]}px;` : ''}width:${G.widths[c.id] || c.width}px" data-ci="${ci}" role="gridcell">${cellInner(c, r, term)}</div>`;
      });
      html += '</div>';
    }
    els.body.innerHTML = html;
  }

  function renderFoot() {
    const st = TMD.state;
    const sortTxt = G.sort.length ? ' · Sorted by ' + G.sort.map((s) => { const c = colById(s.id); return c ? `${c.label} (${s.dir})` : ''; }).join(', ') : '';
    const cs = Object.keys(G.colSearch).filter((k) => G.colSearch[k]).length;
    els.foot.innerHTML = `<span>${TMD.fmtInt(G.rows.length)} of ${TMD.fmtInt(st.records.length)} records${cs ? ` (${cs} column filter${cs > 1 ? 's' : ''})` : ''}${sortTxt}</span>
      <span class="muted">${st.mode === 'edit' ? 'Edit Mode: double-click or press Enter to edit a cell · Tab / arrows to move · Esc to cancel' : 'View Mode: click a row number or press Enter to open details · Shift+click cells to select a range · Ctrl+C to copy'}</span>`;
    els.grid.setAttribute('aria-rowcount', String(G.rows.length));
    els.empty.hidden = G.rows.length > 0;
    if (!G.rows.length) els.empty.innerHTML = `<div class="empty-state">${TMD.icon('search')}<h3>No records match</h3><p>Adjust or clear the filters to see records.</p><button class="btn" data-act="clearFilters">Clear all filters</button></div>`;
  }

  function sizeGrid() {
    if (!els.grid || !els.grid.offsetParent) return;
    const top = els.grid.getBoundingClientRect().top;
    const footH = els.foot ? els.foot.offsetHeight : 28;
    const h = Math.max(260, window.innerHeight - top - footH - 14);
    els.grid.style.height = h + 'px';
  }

  /** Full refresh (layout + rows). keepScroll preserves scroll position. */
  function refresh(rebuildHeader) {
    if (!G.mounted || TMD.state.page !== 'register') return;
    computeCols();
    buildRows();
    renderToolbar();
    if (rebuildHeader !== false) renderHeader(); else { els.body.style.height = (G.items.length * rowH()) + 'px'; els.head.innerHTML = headerHtml(); }
    renderRows();
    renderFoot();
    sizeGrid();
  }

  /* ---------------- Selection / range ---------------- */
  function selRange() {
    if (!G.focus || !G.anchor) return null;
    return { r0: Math.min(G.focus.ri, G.anchor.ri), r1: Math.max(G.focus.ri, G.anchor.ri), c0: Math.min(G.focus.ci, G.anchor.ci), c1: Math.max(G.focus.ci, G.anchor.ci) };
  }
  function plainValue(col, rec) {
    if (col.id === '__stage') return TMD.stageInfo(rec.calc.stage).label;
    if (col.id === '__delay') return rec.calc.delayLabel;
    const v = TMD.colValue(col, rec);
    if (v === null || v === undefined) return '';
    if (col.kind === 'calc' && col.type === 'money') return TMD.fmtMoney(v);
    return TMD.cellText(v);
  }
  function copyText(text) {
    const done = () => TMD.toast('Copied to clipboard.', 'success', 1800);
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); }
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = TMD.el('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { TMD.toast('Copy failed: ' + e.message, 'error'); }
    ta.remove();
  }
  function tsv(v) { return String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' '); }
  function copySelection() {
    const range = selRange();
    if (range && (range.r1 > range.r0 || range.c1 > range.c0 || TMD.state.selection.size === 0)) {
      const lines = [];
      for (let i = range.r0; i <= range.r1; i++) {
        const it = G.items[i];
        if (!it || !it.rec) continue;
        const vals = [];
        for (let c = range.c0; c <= range.c1; c++) vals.push(tsv(plainValue(G.vcols[c], it.rec)));
        lines.push(vals.join('\t'));
      }
      copyText(lines.join('\n'));
      return;
    }
    const recs = G.rows.filter((r) => TMD.state.selection.has(r.id));
    if (!recs.length) { TMD.toast('Select rows (checkboxes) or cells (click, Shift+click) to copy.', 'info'); return; }
    const lines = [G.vcols.map((c) => tsv(c.label)).join('\t')].concat(recs.map((r) => G.vcols.map((c) => tsv(plainValue(c, r))).join('\t')));
    copyText(lines.join('\n'));
  }
  function setFocus(ri, ci, extend) {
    ri = Math.max(0, Math.min(G.items.length - 1, ri));
    ci = Math.max(0, Math.min(G.vcols.length - 1, ci));
    G.focus = { ri, ci };
    if (!extend) G.anchor = { ri, ci };
    ensureVisible(ri, ci);
    paintSelection();
  }
  /** Update focus / range highlighting in place (keeps DOM nodes stable, so double-click works). */
  function paintSelection() {
    const range = selRange();
    TMD.$$('.g-cell.focus, .g-cell.in-range', els.body).forEach((c) => c.classList.remove('focus', 'in-range'));
    if (!G.focus) return;
    TMD.$$('.g-row[data-ri]', els.body).forEach((row) => {
      const ri = +row.dataset.ri;
      if (!range || ri < range.r0 || ri > range.r1) { if (ri !== G.focus.ri) return; }
      row.querySelectorAll('.g-cell[data-ci]').forEach((cell) => {
        const ci = +cell.dataset.ci;
        if (range && ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1 && (range.r1 > range.r0 || range.c1 > range.c0)) cell.classList.add('in-range');
        if (ri === G.focus.ri && ci === G.focus.ci) cell.classList.add('focus');
      });
    });
  }
  function ensureVisible(ri, ci) {
    const rh = rowH();
    const headH = els.head.offsetHeight;
    const y = ri * rh;
    const vp = els.vp;
    if (y < vp.scrollTop) vp.scrollTop = y;
    else if (y + rh > vp.scrollTop + vp.clientHeight - headH) vp.scrollTop = y + rh - vp.clientHeight + headH + 2;
    const fz = frozenN();
    if (ci >= fz) {
      const frozenW = (fz ? G.lefts[fz - 1] + (G.widths[G.vcols[fz - 1].id] || G.vcols[fz - 1].width) : SYS_TOTAL);
      const x = G.lefts[ci], w = G.widths[G.vcols[ci].id] || G.vcols[ci].width;
      if (x < vp.scrollLeft + frozenW) vp.scrollLeft = x - frozenW;
      else if (x + w > vp.scrollLeft + vp.clientWidth) vp.scrollLeft = x + w - vp.clientWidth + 4;
    }
  }

  /* ---------------- Inline editor ---------------- */
  function distinctValues(col) {
    const s = new Set();
    TMD.state.records.forEach((r) => { const v = TMD.colValue(col, r); if (!TMD.isBlank(v)) s.add(TMD.cellText(v).trim()); });
    return Array.from(s).sort(collator.compare).slice(0, 300);
  }
  const DROPDOWN_STD = new Set(['channel', 'department', 'capexRevex', 'nature', 'initiator', 'statusFlag', 'quickStatus']);
  function openEditor(ri, ci, initialChar) {
    if (TMD.state.mode !== 'edit') return;
    const it = G.items[ri];
    if (!it || !it.rec) return;
    const col = G.vcols[ci];
    if (!col || col.kind !== 'source' || col.keysBySheet[it.rec.sheet] === undefined) { TMD.toast('Calculated columns cannot be edited. Use the details panel to override the stage.', 'info'); return; }
    closeEditor(true);
    const rec = it.rec, key = col.keysBySheet[rec.sheet];
    const cellEl = els.body.querySelector(`.g-row[data-ri="${ri}"] .g-cell[data-ci="${ci}"]`);
    if (!cellEl) return;
    const rect = cellEl.getBoundingClientRect();
    const v = rec.values[key];
    const text = TMD.cellText(v);
    const isDate = col.isDate || col.type === 'date' || col.type === 'milestone';
    const isNum = col.type === 'amount' || col.type === 'number';
    const isLong = col.type === 'longtext';
    const box = TMD.el('div', { class: 'cell-editor' + (isLong ? ' long' : '') });
    let html;
    if (isLong) html = `<textarea class="inp" rows="6" aria-label="${esc(col.label)}">${esc(text)}</textarea><div class="ce-hint">Ctrl+Enter to save · Esc to cancel</div>`;
    else if (isDate) {
      const p = TMD.parseDate(v, rec.dateHints[key], true);
      html = `<input class="inp" type="text" value="${esc(text)}" aria-label="${esc(col.label)}" placeholder="dd/mm/yyyy or text"><input class="inp ce-date" type="date" value="${p.date ? TMD.isoDate(p.date) : ''}" aria-label="Pick date">`;
    } else if (isNum) {
      const n = typeof v === 'number' ? v : TMD.parseNumber(v);
      html = n !== null || TMD.isBlank(v) ? `<input class="inp" type="number" step="any" value="${n === null ? '' : n}" aria-label="${esc(col.label)}">` : `<input class="inp" type="text" value="${esc(text)}" aria-label="${esc(col.label)}"><div class="ce-hint warn">Existing value is not numeric; saved as typed.</div>`;
    } else if (DROPDOWN_STD.has(col.std)) {
      const opts = distinctValues(col);
      html = `<select class="inp" aria-label="${esc(col.label)}"><option value="">(blank)</option>${opts.map((o) => `<option ${o === text.trim() ? 'selected' : ''}>${esc(o)}</option>`).join('')}${text && opts.indexOf(text.trim()) < 0 ? `<option selected>${esc(text)}</option>` : ''}<option value="__other">Other (type new value)…</option></select>`;
    } else html = `<input class="inp" type="text" value="${esc(initialChar !== undefined ? initialChar : text)}" aria-label="${esc(col.label)}">`;
    box.innerHTML = html;
    document.body.appendChild(box);
    box.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - (isLong ? 420 : Math.max(rect.width, 180)) - 8)) + 'px';
    box.style.top = Math.max(4, Math.min(rect.top, window.innerHeight - (isLong ? 190 : 50))) + 'px';
    box.style.minWidth = Math.max(rect.width, isDate ? 280 : 160) + 'px';
    const main = box.querySelector('textarea,input,select');
    G.editor = { box, rec, key, col, ri, ci, original: v, openedAt: Date.now() };
    const finish = (move) => {
      if (!G.editor) return;
      let nv;
      if (main.tagName === 'SELECT') nv = main.value;
      else nv = main.value;
      if (isNum && main.type === 'number') nv = nv === '' ? null : parseFloat(nv);
      else if (typeof nv === 'string' && nv === '' ) nv = null;
      const changed = !(nv === v || (TMD.isBlank(nv) && TMD.isBlank(v)) || (typeof v === 'number' && String(v) === String(nv)));
      closeEditor(false);
      if (changed) TMD.editMode.setValue(rec, key, nv, col.label);
      if (move) { const [dr, dc] = move; setFocus(ri + dr, ci + dc); }
      els.vp.focus({ preventScroll: true });
    };
    G.editor.finish = finish;
    if (main.tagName === 'SELECT') {
      main.addEventListener('change', () => {
        if (main.value === '__other') {
          const inp = TMD.el('input', { class: 'inp', type: 'text', 'aria-label': col.label });
          inp.value = text;
          main.replaceWith(inp); inp.focus();
          inp.addEventListener('keydown', (e) => keyHandler(e, inp));
          G.editor.box = box;
          G.editor.finish = () => { const nv = inp.value === '' ? null : inp.value; closeEditor(false); if (nv !== v) TMD.editMode.setValue(rec, key, nv, col.label); els.vp.focus({ preventScroll: true }); };
        }
      });
    }
    const dp = box.querySelector('.ce-date');
    if (dp) dp.addEventListener('change', () => { if (dp.value) main.value = TMD.fmtDate(TMD.fromIso(dp.value)); main.focus(); });
    const keyHandler = (e, target) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(false); els.vp.focus({ preventScroll: true }); return; }
      if (e.key === 'Tab') { e.preventDefault(); (G.editor.finish)([0, e.shiftKey ? -1 : 1]); return; }
      if (e.key === 'Enter') {
        if (isLong && !(e.ctrlKey || e.metaKey)) return;
        if (target === dp) return;
        e.preventDefault(); (G.editor.finish)([e.shiftKey ? -1 : 1, 0]);
      }
    };
    box.addEventListener('keydown', (e) => keyHandler(e, e.target));
    setTimeout(() => { main.focus(); if (main.select && initialChar === undefined) try { main.select(); } catch (e) { /* ignore */ } }, 10);
  }
  function closeEditor(commit) {
    if (!G.editor) return;
    const ed = G.editor;
    if (commit && ed.finish) { ed.finish(null); return; }
    ed.box.remove();
    G.editor = null;
  }
  document.addEventListener('mousedown', (e) => { if (G.editor && !G.editor.box.contains(e.target)) closeEditor(true); });

  /* ---------------- Row action menu ---------------- */
  function rowMenu(anchor, rec) {
    const edit = TMD.state.mode === 'edit';
    TMD.menu(anchor, [
      { label: 'View details', icon: 'eye', action: () => TMD.details.open(rec) },
      { label: edit ? 'Edit in details panel' : 'Edit (enter Edit Mode)', icon: 'edit', action: async () => { if (!edit) { const ok = await TMD.editMode.enter(); if (!ok) return; } TMD.details.open(rec, { edit: true }); } },
      { label: 'Duplicate row', icon: 'copy', disabled: !edit, action: () => TMD.editMode.duplicate([rec]) },
      { label: 'Add follow-up note', icon: 'note', action: () => TMD.details.addFollowUp(rec) },
      { label: 'View history', icon: 'history', action: () => TMD.details.open(rec, { section: 'history' }) },
      { sep: true },
      { label: edit ? 'Delete row' : 'Delete (Edit Mode only)', icon: 'trash', danger: true, disabled: !edit, action: () => TMD.editMode.remove([rec]) },
    ]);
  }

  /* ---------------- Column chooser ---------------- */
  function columnsMenu(anchor) {
    const wrap = TMD.el('div', { class: 'col-pop' });
    const render = () => {
      wrap.innerHTML = `<input class="inp" type="search" placeholder="Find column…" aria-label="Find column">
        <div class="ms-actions"><button class="linklike" data-a="all">Show all</button><button class="linklike" data-a="src">Source columns only</button><button class="linklike" data-a="calc">+ All calculated</button></div>
        <div class="ms-list">${G.order.map((id) => { const c = colById(id); if (!c) return ''; return `<label class="ms-opt"><input type="checkbox" value="${esc(id)}" ${G.hidden.has(id) ? '' : 'checked'}><span class="ms-l">${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}${esc(c.label)}</span></label>`; }).join('')}</div>
        <div class="muted small pad">Drag column headers to reorder. Drag the header edge to resize.</div>`;
    };
    render();
    wrap.addEventListener('change', (e) => { const id = e.target.value; if (e.target.checked) G.hidden.delete(id); else G.hidden.add(id); saveLayout(); refresh(); });
    wrap.addEventListener('input', (e) => { if (e.target.type === 'search') { const q = e.target.value.toLowerCase(); TMD.$$('.ms-opt', wrap).forEach((o) => { o.hidden = o.textContent.toLowerCase().indexOf(q) < 0; }); } });
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      if (a.dataset.a === 'all') G.hidden.clear();
      if (a.dataset.a === 'src') TMD.state.columns.forEach((c) => { if (c.kind === 'calc' && c.id !== '__stage' && c.id !== '__delay' && c.id !== '__sheet') G.hidden.add(c.id); else G.hidden.delete(c.id); });
      if (a.dataset.a === 'calc') TMD.state.columns.forEach((c) => { if (c.kind === 'calc') G.hidden.delete(c.id); });
      saveLayout(); refresh(); render();
    });
    TMD.popover(anchor, wrap, { cls: 'ms-popover wide' });
  }

  /* ---------------- Print-friendly view ---------------- */
  function printTable() {
    const rows = G.rows.slice(0, 3000);
    const cols = G.vcols;
    const host = TMD.$('#printHost');
    host.innerHTML = `<div class="print-doc"><h1>${esc(TMD.settings.get('title'))} — Tender Register</h1>
      <p>${esc(TMD.state.workbook.fileName)} · ${esc(TMD.state.activeSheets.join(', '))} · ${TMD.fmtInt(rows.length)} record(s)${G.rows.length > 3000 ? ' (first 3,000 shown)' : ''} · Printed ${esc(TMD.fmtDateTime(Date.now()))}${TMD.filters.activeCount() ? ' · Filters applied' : ''}</p>
      <table class="print-table"><thead><tr><th>#</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.rowNum}</td>${cols.map((c) => `<td>${TMD.escMultiline(plainValue(c, r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    document.body.classList.add('printing-custom');
    window.print();
    setTimeout(() => { document.body.classList.remove('printing-custom'); host.innerHTML = ''; }, 500);
  }

  /* ---------------- Events ---------------- */
  function wireEvents() {
    els.tb.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'SELECT') return;
      const a = b.dataset.act;
      const selected = () => G.rows.filter((r) => TMD.state.selection.has(r.id));
      if (a === 'sheets') TMD.manageSheets();
      if (a === 'columns') columnsMenu(b);
      if (a === 'colsearch') { G.showColSearch = !G.showColSearch; if (!G.showColSearch) G.colSearch = {}; refresh(); }
      if (a === 'wrap') { G.wrap = !G.wrap; saveLayout(); refresh(); }
      if (a === 'density') { TMD.settings.set('density', TMD.settings.get('density') === 'comfortable' ? 'compact' : 'comfortable'); refresh(); }
      if (a === 'fullscreen') { document.body.classList.toggle('table-full'); refresh(); }
      if (a === 'more') TMD.menu(b, [
        { label: 'Select all filtered records', icon: 'check', action: () => { G.rows.forEach((r) => TMD.state.selection.add(r.id)); refresh(false); } },
        { label: 'Export filtered records (Excel)…', icon: 'download', action: () => TMD.exporter.openDialog('filtered') },
        { label: 'Print table view', icon: 'printer', action: printTable },
        { label: 'Clear sorting', icon: 'sortAsc', action: () => { G.sort = []; refresh(); } },
        { label: 'Reset table layout', icon: 'refresh', action: resetLayout },
      ]);
      if (a === 'add') TMD.editMode.addRow();
      if (a === 'dup') TMD.editMode.duplicate(selected());
      if (a === 'del') TMD.editMode.remove(selected());
      if (a === 'undo') TMD.editMode.undo();
      if (a === 'redo') TMD.editMode.redo();
      if (a === 'copy') copySelection();
      if (a === 'exportSel') TMD.exporter.openDialog('selected');
      if (a === 'clearSel') { TMD.state.selection.clear(); refresh(false); }
    });
    els.tb.addEventListener('change', (e) => {
      const a = e.target.dataset.act;
      if (a === 'group') { G.groupBy = e.target.value; G.collapsed.clear(); refresh(); }
      if (a === 'freeze') { TMD.settings.set('frozenCols', +e.target.value); refresh(); }
    });
    // Header: sort / select all / resize / reorder / column search
    els.head.addEventListener('click', (e) => {
      if (e.target.classList.contains('sel-all')) {
        if (e.target.checked) G.rows.forEach((r) => TMD.state.selection.add(r.id)); else G.rows.forEach((r) => TMD.state.selection.delete(r.id));
        refresh(false); return;
      }
      if (e.target.closest('.rz') || e.target.closest('input')) return;
      const h = e.target.closest('.g-hcell');
      if (!h) return;
      const id = h.dataset.col;
      const idx = G.sort.findIndex((s) => s.id === id);
      if (e.shiftKey) {
        if (idx < 0) G.sort.push({ id, dir: 'asc' });
        else if (G.sort[idx].dir === 'asc') G.sort[idx].dir = 'desc';
        else G.sort.splice(idx, 1);
      } else if (idx >= 0 && G.sort.length === 1) {
        if (G.sort[0].dir === 'asc') G.sort[0].dir = 'desc'; else G.sort = [];
      } else G.sort = [{ id, dir: 'asc' }];
      refresh(false);
    });
    const csDebounce = TMD.debounce(() => { buildRows(); els.body.style.height = (G.items.length * rowH()) + 'px'; renderRows(); renderFoot(); }, 200);
    els.head.addEventListener('input', (e) => { const id = e.target.dataset.cs; if (id) { G.colSearch[id] = e.target.value; csDebounce(); } });
    els.head.addEventListener('mousedown', (e) => {
      const rz = e.target.closest('.rz');
      if (!rz) return;
      e.preventDefault(); e.stopPropagation();
      const id = rz.dataset.rz;
      const col = colById(id);
      const startX = e.clientX, startW = G.widths[id] || col.width;
      document.body.classList.add('col-resizing');
      let raf = 0;
      const move = (ev) => {
        G.widths[id] = Math.max(48, Math.min(900, startW + ev.clientX - startX));
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; computeCols(); els.head.innerHTML = headerHtml(); els.body.style.width = G.total + 'px'; renderRows(); });
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('col-resizing'); saveLayout(); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    let dragId = null;
    els.head.addEventListener('dragstart', (e) => { const h = e.target.closest('.g-hcell'); if (!h || document.body.classList.contains('col-resizing')) { e.preventDefault(); return; } dragId = h.dataset.col; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* ignore */ } });
    els.head.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); const h = e.target.closest('.g-hcell'); TMD.$$('.g-hcell.drop', els.head).forEach((x) => x.classList.remove('drop')); if (h) h.classList.add('drop'); } });
    els.head.addEventListener('drop', (e) => {
      e.preventDefault();
      const h = e.target.closest('.g-hcell');
      if (!h || !dragId || h.dataset.col === dragId) { dragId = null; return; }
      const from = G.order.indexOf(dragId), to = G.order.indexOf(h.dataset.col);
      G.order.splice(from, 1); G.order.splice(to, 0, dragId);
      dragId = null; saveLayout(); refresh();
    });
    els.head.addEventListener('dragend', () => { dragId = null; TMD.$$('.g-hcell.drop', els.head).forEach((x) => x.classList.remove('drop')); });

    // Body
    els.body.addEventListener('click', (e) => {
      const grp = e.target.closest('.g-group');
      if (grp) { const k = grp.dataset.group; if (G.collapsed.has(k)) G.collapsed.delete(k); else G.collapsed.add(k); refresh(false); return; }
      const row = e.target.closest('.g-row[data-id]');
      if (!row) return;
      const rec = G.items[+row.dataset.ri].rec;
      if (e.target.classList.contains('row-chk')) {
        if (e.target.checked) TMD.state.selection.add(rec.id); else TMD.state.selection.delete(rec.id);
        row.classList.toggle('sel', e.target.checked);
        renderToolbar(); els.head.innerHTML = headerHtml(); return;
      }
      if (e.target.closest('.row-menu')) { rowMenu(e.target.closest('.row-menu'), rec); return; }
      if (e.target.closest('.rownum')) { TMD.details.open(rec); return; }
      const cell = e.target.closest('.g-cell[data-ci]');
      if (!cell) return;
      const ci = +cell.dataset.ci, ri = +row.dataset.ri;
      // Manual double-click detection (row DOM may be re-rendered between clicks while scrolling)
      const now = Date.now();
      if (!e.shiftKey && G.lastClick && G.lastClick.ri === ri && G.lastClick.ci === ci && now - G.lastClick.t < 450) {
        G.lastClick = null;
        if (TMD.state.mode === 'edit') openEditor(ri, ci); else TMD.details.open(rec);
        return;
      }
      G.lastClick = { ri, ci, t: now };
      const lt = e.target.closest('.lt, .clamp');
      if (lt && TMD.state.mode !== 'edit' && !e.shiftKey) {
        const full = lt.getAttribute('data-full') || lt.textContent, label = G.vcols[ci].label;
        clearTimeout(G.ltTimer);
        G.ltTimer = setTimeout(() => { if (G.lastClick && G.lastClick.t === now) TMD.details.openText(label, full, rec); }, 460);
      }
      if (e.shiftKey && G.anchor) { G.focus = { ri, ci }; paintSelection(); }
      else setFocus(ri, ci);
      els.vp.focus({ preventScroll: true });
    });
    els.vp.addEventListener('keydown', (e) => {
      if (G.editor) return;
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); G.rows.forEach((r) => TMD.state.selection.add(r.id)); refresh(false); return; }
      if (!G.focus) { if (/^Arrow|Tab|Enter$/.test(e.key) && G.items.length) { e.preventDefault(); setFocus(G.items[0].rec ? 0 : 1, 0); } return; }
      const { ri, ci } = G.focus;
      const ext = e.shiftKey && e.key.indexOf('Arrow') === 0;
      const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (moves[e.key]) { e.preventDefault(); setFocus(ri + moves[e.key][0], ci + moves[e.key][1], ext); return; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); const n = Math.floor(els.vp.clientHeight / rowH()) - 1; setFocus(ri + (e.key === 'PageDown' ? n : -n), ci); return; }
      if (e.key === 'Home') { e.preventDefault(); setFocus(e.ctrlKey ? 0 : ri, 0); return; }
      if (e.key === 'End') { e.preventDefault(); setFocus(e.ctrlKey ? G.items.length - 1 : ri, G.vcols.length - 1); return; }
      if (e.key === 'Tab') { e.preventDefault(); setFocus(ri, ci + (e.shiftKey ? -1 : 1)); return; }
      if (e.key === 'Escape') { G.anchor = G.focus; paintSelection(); return; }
      const it = G.items[ri];
      if (!it || !it.rec) return;
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        if (TMD.state.mode === 'edit') openEditor(ri, ci); else TMD.details.open(it.rec);
        return;
      }
      if (e.key === ' ' && TMD.state.mode !== 'edit') { e.preventDefault(); const sel = TMD.state.selection; if (sel.has(it.rec.id)) sel.delete(it.rec.id); else sel.add(it.rec.id); refresh(false); return; }
      if (TMD.state.mode === 'edit' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const col = G.vcols[ci];
        if (col && col.kind === 'source' && col.type !== 'longtext' && !col.isDate && !DROPDOWN_STD.has(col.std) && col.type !== 'amount' && col.type !== 'number') { e.preventDefault(); openEditor(ri, ci, e.key); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && TMD.state.mode === 'edit') {
        const col = G.vcols[ci];
        if (col && col.kind === 'source' && col.keysBySheet[it.rec.sheet] !== undefined) { e.preventDefault(); TMD.editMode.setValue(it.rec, col.keysBySheet[it.rec.sheet], null, col.label); }
      }
    });
    els.empty.addEventListener('click', (e) => { if (e.target.closest('[data-act="clearFilters"]')) TMD.filters.clearAll(); });
    window.addEventListener('resize', TMD.debounce(() => { sizeGrid(); renderRows(); }, 120));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('table-full') && !G.editor && !TMD.$('#modalHost').children.length && !TMD.$('#detailsDrawer').classList.contains('open')) {
        document.body.classList.remove('table-full'); refresh();
      }
    });
  }

  /* ---------------- Public API ---------------- */
  TMD.table = {
    render(host) {
      if (!G.mounted || !host.querySelector('#grid')) { G.mounted = false; mount(host); }
      refresh(true);
    },
    refresh,
    refreshRows() { if (G.mounted && TMD.state.page === 'register') { buildRows(); renderToolbar(); els.body.style.height = (G.items.length * rowH()) + 'px'; renderRows(); renderFoot(); } },
    onData() { loadLayout(); G.focus = null; G.anchor = null; if (els.vp) { els.vp.scrollTop = 0; els.vp.scrollLeft = 0; } },
    focusRecord(rec) {
      const i = G.items.findIndex((it) => it.rec === rec);
      if (i >= 0) setFocus(i, Math.min(G.vcols.length - 1, frozenN()));
    },
    closeEditor,
    copyText,
    visibleColumns: () => G.vcols,
    sortedRows: () => G.rows,
    resize: sizeGrid,
  };
})();
