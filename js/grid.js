/* =====================================================================
 * grid.js — reusable, virtualised, spreadsheet-like data grid.
 * Used by the Tender Register and the Audit Observation Register; each
 * instance keeps its own layout, sorting, header filters and selection.
 *
 *  sticky header · frozen columns · resize · reorder · show/hide · sort
 *  Excel-style header filters (value list, text contains, sort A–Z/Z–A)
 *  grouping · wrap/density · row selection · range selection & copy
 *  Edit Mode only: type-to-edit in the cell, date picker (defaults to
 *  today), fill handle (copy or continue a series), paste from Excel,
 *  cut, clear, Ctrl+D fill down, insert / duplicate / delete rows,
 *  add column, right-click menu.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const SYS_W = [38, 76]; // checkbox, row number / actions
  const SYS_TOTAL = SYS_W[0] + SYS_W[1];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const RIGHT = ['amount', 'number', 'money', 'pct', 'int'];
  let anyEditor = null; // only one cell editor across all grids

  /**
   * cfg: {
   *   M, name, layoutPrefix, groups, groupSort(key, keys), groupSummary(list),
   *   renderCalc(col, rec, term) → html|undefined, sortKeyCalc(col, rec) → value|undefined,
   *   dropdownStd: Set, rowMenuExtra(rec) → items, openDetails(rec, o), openText(label, text, rec),
   *   onSheets(), onExport(scope), printTitle, densityKey, frozenKey
   * }
   */
  TMD.createGrid = function (cfg) {
    const M = cfg.M;
    const S = () => M.state;
    const G = {
      layoutKey: '', order: [], hidden: new Set(), widths: {}, sort: [], colFilter: {},
      wrap: false, groupBy: '', collapsed: new Set(), items: [], rows: [], vcols: [], lefts: [], total: 0,
      focus: null, anchor: null, mounted: false, editor: null, host: null,
    };
    let els = {};
    const editing = () => S().mode === 'edit';
    const rowH = () => (G.wrap ? 78 : TMD.settings.get(cfg.densityKey || 'density') === 'compact' ? 36 : 44);
    const frozenN = () => Math.max(0, Math.min(6, +TMD.settings.get(cfg.frozenKey || 'frozenCols') || 0));

    /* ---------------- Layout persistence ---------------- */
    function loadLayout() {
      const st = S();
      if (!st.workbook) return;
      const key = (cfg.layoutPrefix || 'layout.') + st.activeSheets.map((n) => TMD.sheetSignature(n, st.workbook.sheets[n].headers)).join('+');
      G.layoutKey = key;
      const saved = TMD.ls.get(key, null);
      const ids = st.columns.map((c) => c.id);
      if (saved) {
        G.order = saved.order.filter((id) => ids.indexOf(id) >= 0);
        // new columns appear at their natural position
        ids.forEach((id, i) => { if (G.order.indexOf(id) < 0) { const prev = ids[i - 1]; const at = prev ? G.order.indexOf(prev) + 1 : 0; G.order.splice(at, 0, id); } });
        G.hidden = new Set((saved.hidden || []).filter((id) => ids.indexOf(id) >= 0));
        G.widths = saved.widths || {};
        G.wrap = !!saved.wrap;
      } else {
        G.order = ids;
        G.hidden = new Set(st.columns.filter((c) => c.hiddenByDefault).map((c) => c.id));
        G.widths = {};
        G.wrap = false;
      }
      G.sort = []; G.colFilter = {}; G.collapsed = new Set();
    }
    const saveLayout = TMD.debounce(() => {
      TMD.ls.set(G.layoutKey, { order: G.order, hidden: Array.from(G.hidden), widths: G.widths, wrap: G.wrap });
    }, 400);
    function resetLayout() { TMD.ls.remove(G.layoutKey); loadLayout(); G.groupBy = ''; refresh(true); TMD.toast('Table layout reset.', 'info'); }

    function colById(id) { return S().columns.find((c) => c.id === id); }
    function computeCols() {
      G.vcols = G.order.map(colById).filter((c) => c && !G.hidden.has(c.id));
      G.lefts = [];
      let x = SYS_TOTAL;
      G.vcols.forEach((c) => { G.lefts.push(x); x += G.widths[c.id] || c.width; });
      G.total = x;
    }
    const colW = (c) => G.widths[c.id] || c.width;

    /* ---------------- Values ---------------- */
    function plainValue(col, rec) {
      if (cfg.plainCalc) { const p = cfg.plainCalc(col, rec); if (p !== undefined) return p; }
      const v = M.colValue(col, rec);
      if (v === null || v === undefined) return '';
      if (col.kind === 'calc' && col.type === 'money') return TMD.fmtMoney(v);
      return TMD.cellText(v);
    }
    function sortKey(col, rec) {
      if (col.kind === 'calc') {
        if (cfg.sortKeyCalc) { const k = cfg.sortKeyCalc(col, rec); if (k !== undefined) return k; }
        const v = M.colValue(col, rec);
        return v === null || v === undefined || v === '' ? null : (typeof v === 'string' ? v.toLowerCase() : v);
      }
      const v = M.colValue(col, rec);
      if (TMD.isBlank(v)) return null;
      if (col.isDate || col.type === 'date' || col.type === 'milestone') {
        const k = col.keysBySheet[rec.sheet];
        const p = TMD.parseDate(v, rec.dateHints[k], true);
        return p.date ? p.date.getTime() : String(v).toLowerCase();
      }
      if (col.type === 'amount' || col.type === 'number') { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? String(v).toLowerCase() : n; }
      return String(v).toLowerCase();
    }
    function cmp(a, b) {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'number') return -1;
      if (typeof b === 'number') return 1;
      return collator.compare(a, b);
    }
    const filterText = (col, r) => { const t = plainValue(col, r); return t === '' ? '(Blanks)' : t; };
    function passesColFilters(r, exceptId) {
      for (const id in G.colFilter) {
        if (id === exceptId) continue;
        const f = G.colFilter[id];
        const col = colById(id);
        if (!col || !f) continue;
        const t = filterText(col, r);
        if (f.values && f.values.indexOf(t) < 0) return false;
        if (f.text && t.toLowerCase().indexOf(f.text.toLowerCase()) < 0) return false;
      }
      return true;
    }
    const activeColFilters = () => Object.keys(G.colFilter).filter((id) => G.colFilter[id] && (G.colFilter[id].values || G.colFilter[id].text));

    function buildRows() {
      let rows = S().filtered;
      if (activeColFilters().length) rows = rows.filter((r) => passesColFilters(r));
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
      const groups = cfg.groups || {};
      if (G.groupBy && groups[G.groupBy]) {
        const getter = groups[G.groupBy].get;
        const map = new Map();
        rows.forEach((r) => { const k = getter(r) || '(Blank)'; (map.get(k) || map.set(k, []).get(k)).push(r); });
        let keys = Array.from(map.keys());
        if (cfg.groupSort) keys = cfg.groupSort(G.groupBy, keys); else keys.sort((a, b) => collator.compare(a, b));
        G.items = [];
        keys.forEach((k) => {
          const list = map.get(k);
          G.items.push({ group: k, count: list.length, summary: cfg.groupSummary ? cfg.groupSummary(list) : '' });
          if (!G.collapsed.has(k)) list.forEach((r) => G.items.push({ rec: r }));
        });
      } else G.items = rows.map((r) => ({ rec: r }));
    }

    /* ---------------- Cell rendering ---------------- */
    function cellInner(col, rec, term) {
      if (col.kind === 'calc') {
        if (cfg.renderCalc) { const h = cfg.renderCalc(col, rec, term); if (h !== undefined) return h; }
        const v = M.colValue(col, rec);
        if (v === null || v === undefined || v === '') return '<span class="nil">—</span>';
        if (col.type === 'money') return `<span data-tip="${esc(TMD.fmtMoneyExact(v))}">${esc(TMD.fmtMoney(v))}</span>`;
        if (col.type === 'pct') return esc(TMD.fmtNum(v, 1) + '%');
        if (col.type === 'int') return `<span class="${v < 0 ? 'neg' : ''}">${esc(TMD.fmtInt(v))}</span>`;
        if (col.type === 'longtext') return `<div class="clamp" data-trunc data-full="${esc(v)}">${TMD.highlight(v, term)}</div>`;
        return `<span class="tx" data-trunc data-full="${esc(v)}">${TMD.highlight(v, term)}</span>`;
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
        const hot = cfg.dateClass ? cfg.dateClass(col, rec, p) : '';
        const amb = p.fmt === 'mdy' ? ` data-tip="Read as ${esc(TMD.fmtDate(p.date))} (mm/dd/yyyy detected)"` : '';
        return `<span class="${hot}${p.fmt === 'mdy' ? ' cell-amb' : ''}"${amb}${p.kind === 'textdate' ? ` data-trunc data-full="${esc(text)}"` : ''}>${TMD.highlight(text, term)}</span>`;
      }
      if (col.type === 'amount') {
        const sh = TMD.sheetOf(rec);
        const STD = TMD.mapperOf(sh).STD;
        const unit = (sh.colMeta[key] && sh.colMeta[key].unit) || TMD.settings.get(STD[col.std] && STD[col.std].unitSetting ? STD[col.std].unitSetting : 'unitCashOutflow') || 'rupees';
        const a = TMD.parseAmount(v, unit);
        if (a.kind === 'num') return `<span data-tip="${esc(TMD.fmtMoneyExact(a.rupees))} — source unit: ${esc(unit)}">${esc(typeof v === 'number' ? TMD.fmtNum(v) : text)}</span>`;
        return `<span class="cell-bad" data-tip="Amount contains text">${TMD.highlight(text, term)}</span>`;
      }
      if (cfg.renderSource) { const h = cfg.renderSource(col, rec, v, text, term); if (h !== undefined) return h; }
      if (col.type === 'number' && typeof v === 'number') return esc(TMD.fmtNum(v));
      if (col.type === 'longtext') return `<div class="clamp lt" data-trunc data-full="${esc(text)}">${TMD.highlight(text, term)}</div>`;
      return `<span data-trunc data-full="${esc(text)}" class="tx">${TMD.highlight(text, term)}</span>`;
    }
    const isRight = (col) => RIGHT.indexOf(col.type) >= 0;
    const isEditableCol = (col, rec) => col && col.kind === 'source' && col.keysBySheet[rec.sheet] !== undefined;

    /* ---------------- Mount & render ---------------- */
    function mount(host) {
      G.host = host;
      host.innerHTML = `
        <div class="reg-toolbar"></div>
        <div class="grid ${G.wrap ? 'wrap' : ''}" role="grid" aria-label="${esc(cfg.name || 'Register')}" aria-rowcount="0">
          <div class="grid-viewport" tabindex="0">
            <div class="grid-head"></div>
            <div class="grid-body"></div>
            <div class="grid-empty" hidden></div>
          </div>
        </div>
        <div class="reg-foot"></div>`;
      const q = (s) => host.querySelector(s);
      els = { tb: q('.reg-toolbar'), grid: q('.grid'), vp: q('.grid-viewport'), head: q('.grid-head'), body: q('.grid-body'), empty: q('.grid-empty'), foot: q('.reg-foot') };
      els.vp.addEventListener('scroll', () => {
        if (!G.raf) G.raf = requestAnimationFrame(() => { G.raf = 0; renderRows(); });
        if (G.editor && Date.now() - G.editor.openedAt > 400) closeEditor(true);
      }, { passive: true });
      wireEvents();
      G.mounted = true;
    }

    function renderToolbar() {
      const edit = editing();
      const sel = S().selection.size;
      const st = S();
      const groups = cfg.groups || {};
      const cf = activeColFilters().length;
      els.tb.innerHTML = `
        <div class="tb-group">
          ${cfg.onSheets ? `<button class="btn subtle" data-act="sheets" data-tip="Choose active worksheet(s)">${TMD.icon('layers')}<span>${esc(st.activeSheets.join(' + ') || 'Worksheet')}</span></button>` : ''}
          <button class="btn subtle" data-act="columns" data-pop-anchor>${TMD.icon('columns')}<span>Columns</span></button>
          <label class="tb-sel"><select class="inp inp-sm" data-act="group" aria-label="Group by"><option value="">No grouping</option>${Object.keys(groups).map((k) => `<option value="${k}" ${G.groupBy === k ? 'selected' : ''}>Group by ${esc(groups[k].label)}</option>`).join('')}</select></label>
          ${cf ? `<button class="btn subtle on" data-act="clearColFilters" data-tip="Clear all column header filters">${TMD.icon('filter')}<span>${cf} column filter${cf > 1 ? 's' : ''} ✕</span></button>` : ''}
          <span class="tb-sep"></span>
          <button class="icon-btn ${G.wrap ? 'on' : ''}" data-act="wrap" aria-pressed="${G.wrap}" aria-label="Wrap text" data-tip="Wrap text">${TMD.icon('wrap')}</button>
          <button class="icon-btn" data-act="density" aria-label="Row density" data-tip="${TMD.settings.get(cfg.densityKey || 'density') === 'compact' ? 'Compact rows — switch to comfortable' : 'Comfortable rows — switch to compact'}">${TMD.icon('rows')}</button>
          <button class="icon-btn" data-act="fullscreen" aria-label="Full screen" data-tip="${document.body.classList.contains('table-full') ? 'Exit full screen (Esc)' : 'Full screen'}">${TMD.icon('expand')}</button>
          <button class="icon-btn" data-act="more" data-pop-anchor aria-label="More table options" data-tip="More">${TMD.icon('more')}</button>
        </div>
        <div class="tb-group edit-tools" ${edit ? '' : 'hidden'}>
          <span class="edit-chip">${TMD.icon('edit')}Editing</span>
          <button class="btn subtle" data-act="add">${TMD.icon('plus')}<span>Row</span></button>
          <button class="btn subtle" data-act="addcol">${TMD.icon('columns')}<span>Column</span></button>
          <button class="btn subtle" data-act="dup" ${sel ? '' : 'disabled'}>${TMD.icon('copy')}<span>Duplicate</span></button>
          <button class="btn subtle danger" data-act="del" ${sel ? '' : 'disabled'}>${TMD.icon('trash')}<span>Delete</span></button>
        </div>
        <div class="tb-group sel-tools" ${sel ? '' : 'hidden'}>
          <span class="sel-count"><strong>${sel}</strong> selected</span>
          <button class="btn subtle" data-act="copy">${TMD.icon('copy')}<span>Copy</span></button>
          <button class="btn subtle" data-act="exportSel">${TMD.icon('download')}<span>Export</span></button>
          <button class="btn subtle" data-act="clearSel">${TMD.icon('x')}<span>Clear</span></button>
        </div>`;
    }

    function headerHtml() {
      const fz = frozenN();
      const allSel = G.rows.length > 0 && G.rows.every((r) => S().selection.has(r.id));
      let h = `<div class="g-row g-hrow" style="width:${G.total}px">`;
      h += `<div class="g-cell g-sys g-frozen" style="left:0;width:${SYS_W[0]}px"><input type="checkbox" class="sel-all" ${allSel ? 'checked' : ''} aria-label="Select all filtered records"></div>`;
      h += `<div class="g-cell g-sys g-frozen g-hash" style="left:${SYS_W[0]}px;width:${SYS_W[1]}px">#</div>`;
      G.vcols.forEach((c, i) => {
        const s = G.sort.findIndex((x) => x.id === c.id);
        const sortIco = s >= 0 ? `<span class="sort-ind">${TMD.icon(G.sort[s].dir === 'asc' ? 'sortAsc' : 'sortDesc')}${G.sort.length > 1 ? `<sub>${s + 1}</sub>` : ''}</span>` : '';
        const frozen = i < fz;
        const filt = G.colFilter[c.id] && (G.colFilter[c.id].values || G.colFilter[c.id].text);
        const title = c.kind === 'source' && c.sourceLabel !== c.label ? `${c.label} (source header: ${c.sourceLabel})` : c.label;
        h += `<div class="g-cell g-hcell ${c.kind === 'calc' ? 'calc' : ''} ${c.added ? 'added' : ''} ${frozen ? 'g-frozen' : ''} ${frozen && i === fz - 1 ? 'g-frozen-last' : ''} ${isRight(c) ? 'right' : ''}" style="${frozen ? `left:${G.lefts[i]}px;` : ''}width:${colW(c)}px" data-col="${esc(c.id)}" draggable="true" role="columnheader" aria-sort="${s >= 0 ? (G.sort[s].dir === 'asc' ? 'ascending' : 'descending') : 'none'}" title="${esc(title)}${c.kind === 'calc' ? ' — calculated, not part of source data' : ''}${c.added ? ' — column added in this app' : ''}. Click to sort; Shift+click for multi-sort; drag to reorder.">
          ${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}<span class="h-label">${esc(c.label)}</span>${sortIco}
          <button class="h-filter ${filt ? 'on' : ''}" data-hf="${esc(c.id)}" aria-label="Filter ${esc(c.label)}" data-pop-anchor>${TMD.icon('filter')}</button>
          <span class="rz" data-rz="${esc(c.id)}" aria-hidden="true"></span></div>`;
      });
      h += '</div>';
      return h;
    }

    function renderHeader() {
      els.head.innerHTML = headerHtml();
      els.body.style.height = (G.items.length * rowH()) + 'px';
      els.body.style.width = G.total + 'px';
      els.grid.classList.toggle('wrap', G.wrap);
      els.grid.classList.toggle('editing', editing());
      els.grid.style.setProperty('--rh', rowH() + 'px');
    }

    function selRange() {
      if (!G.focus || !G.anchor) return null;
      return { r0: Math.min(G.focus.ri, G.anchor.ri), r1: Math.max(G.focus.ri, G.anchor.ri), c0: Math.min(G.focus.ci, G.anchor.ci), c1: Math.max(G.focus.ci, G.anchor.ci) };
    }

    function renderRows() {
      if (!els.vp) return;
      const rh = rowH();
      const headH = els.head.offsetHeight;
      const top = Math.max(0, els.vp.scrollTop - headH);
      const vh = els.vp.clientHeight;
      const start = Math.max(0, Math.floor(top / rh) - 8);
      const end = Math.min(G.items.length, Math.ceil((top + vh) / rh) + 8);
      const fz = frozenN();
      const term = M.filters.searchTerm();
      const edit = editing();
      const sel = S().selection;
      const range = selRange();
      const multi = range && (range.r1 > range.r0 || range.c1 > range.c0);
      // Horizontal virtualisation: frozen columns always, others only when near the viewport.
      const xL = els.vp.scrollLeft - 400, xR = els.vp.scrollLeft + els.vp.clientWidth + 400;
      const show = G.vcols.map((c, ci) => ci < fz || (G.lefts[ci] + colW(c) >= xL && G.lefts[ci] <= xR));
      const firstVis = show.findIndex((v, ci) => v && ci >= fz);
      const frozenEnd = fz && G.vcols[fz - 1] ? G.lefts[fz - 1] + colW(G.vcols[fz - 1]) : SYS_TOTAL;
      const spacerW = firstVis > 0 ? G.lefts[firstVis] - frozenEnd : 0;
      let html = '';
      for (let i = start; i < end; i++) {
        const it = G.items[i];
        const y = i * rh;
        if (it.group !== undefined) {
          const col = G.collapsed.has(it.group);
          const label = (cfg.groups[G.groupBy] || {}).label || '';
          html += `<div class="g-row g-group" style="top:${y}px;width:${G.total}px" data-group="${esc(it.group)}"><div class="g-cell g-frozen g-group-cell" style="left:0">
            <button class="icon-btn sm" aria-label="${col ? 'Expand' : 'Collapse'} group">${TMD.icon(col ? 'chevronRight' : 'chevronDown')}</button>
            <strong>${esc(label)}: ${esc(it.group)}</strong><span class="muted">${TMD.plural(it.count, 'record')}${it.summary || ''}</span></div></div>`;
          continue;
        }
        const r = it.rec;
        const isSel = sel.has(r.id);
        html += `<div class="g-row ${isSel ? 'sel' : ''} ${r.edited || r.isNew ? 'edited' : ''} ${i % 2 ? 'odd' : ''}" style="top:${y}px;width:${G.total}px" data-ri="${i}" data-id="${esc(r.id)}" role="row">`;
        html += `<div class="g-cell g-sys g-frozen" style="left:0;width:${SYS_W[0]}px"><input type="checkbox" class="row-chk" ${isSel ? 'checked' : ''} aria-label="Select row"></div>`;
        html += `<div class="g-cell g-sys g-frozen g-hash" style="left:${SYS_W[0]}px;width:${SYS_W[1]}px"><span class="rownum" title="${esc(r.sheet)} — source row ${r.rowNum}. Click to open details.">${r.isNew ? 'new' : r.rowNum}</span>${r.edited || r.isNew ? `<span class="edited-dot" aria-label="Edited" data-tip="Edited locally${r.editedKeys.length ? ': ' + esc(r.editedKeys.join(', ')) : ''}">Edited</span>` : ''}<button class="icon-btn xs row-menu" aria-label="Row actions" data-pop-anchor>${TMD.icon('more')}</button></div>`;
        G.vcols.forEach((c, ci) => {
          if (!show[ci]) return;
          if (ci === firstVis && spacerW > 0) html += `<div class="g-spacer" style="width:${spacerW}px"></div>`;
          const frozen = ci < fz;
          const editable = edit && isEditableCol(c, r);
          const inRange = multi && i >= range.r0 && i <= range.r1 && ci >= range.c0 && ci <= range.c1;
          const focused = G.focus && G.focus.ri === i && G.focus.ci === ci;
          const modified = c.kind === 'source' && r.editedKeys.indexOf(c.keysBySheet[r.sheet]) >= 0;
          const handle = edit && range && i === range.r1 && ci === range.c1 ? '<span class="fill-handle" data-fill="1" title="Drag to fill (Excel-style). Hold Alt/Option to copy without a series."></span>' : '';
          html += `<div class="g-cell ${frozen ? 'g-frozen' : ''} ${frozen && ci === fz - 1 ? 'g-frozen-last' : ''} ${isRight(c) ? 'right' : ''} ${editable ? 'editable' : ''} ${inRange ? 'in-range' : ''} ${focused ? 'focus' : ''} ${modified ? 'modified' : ''}" style="${frozen ? `left:${G.lefts[ci]}px;` : ''}width:${colW(c)}px" data-ci="${ci}" role="gridcell">${cellInner(c, r, term)}${handle}</div>`;
        });
        html += '</div>';
      }
      els.body.innerHTML = html;
      if (G.fillDrag) paintFillTarget();
    }

    function renderFoot() {
      const st = S();
      const sortTxt = G.sort.length ? ' · Sorted by ' + G.sort.map((s) => { const c = colById(s.id); return c ? `${c.label} (${s.dir})` : ''; }).join(', ') : '';
      const cf = activeColFilters().length;
      els.foot.innerHTML = `<span>${TMD.fmtInt(G.rows.length)} of ${TMD.fmtInt(st.records.length)} records${cf ? ` (${cf} column filter${cf > 1 ? 's' : ''})` : ''}${sortTxt}</span>
        <span class="muted">${st.mode === 'edit' ? 'Editing: type to replace · Enter / double-click to edit · drag the corner square to fill · Ctrl+V paste · Del clear · right-click for more' : 'View Mode: click a row number to open details · Shift+click to select a range · Ctrl+C copies · right-click for options'}</span>`;
      els.grid.setAttribute('aria-rowcount', String(G.rows.length));
      els.empty.hidden = G.rows.length > 0;
      if (!G.rows.length) els.empty.innerHTML = `<div class="empty-state">${TMD.icon('search')}<h3>No records match</h3><p>Adjust or clear the filters to see records.</p><button class="btn" data-act="clearFilters">Clear all filters</button></div>`;
    }

    function sizeGrid() {
      if (!els.grid || !els.grid.offsetParent) return;
      const top = els.grid.getBoundingClientRect().top;
      const footH = els.foot ? els.foot.offsetHeight : 28;
      els.grid.style.height = Math.max(280, window.innerHeight - top - footH - 18) + 'px';
    }

    function isVisible() { return G.mounted && G.host && G.host.offsetParent !== null; }
    function refresh(rebuildHeader) {
      if (!G.mounted || !isVisible()) return;
      computeCols();
      buildRows();
      renderToolbar();
      if (rebuildHeader !== false) renderHeader(); else { els.body.style.height = (G.items.length * rowH()) + 'px'; els.head.innerHTML = headerHtml(); els.grid.classList.toggle('editing', editing()); }
      renderRows();
      renderFoot();
      sizeGrid();
    }

    /* ---------------- Selection / focus ---------------- */
    function paintSelection() {
      const range = selRange();
      const multi = range && (range.r1 > range.r0 || range.c1 > range.c0);
      TMD.$$('.g-cell.focus, .g-cell.in-range', els.body).forEach((c) => c.classList.remove('focus', 'in-range'));
      TMD.$$('.fill-handle', els.body).forEach((h) => h.remove());
      if (!G.focus) return;
      TMD.$$('.g-row[data-ri]', els.body).forEach((row) => {
        const ri = +row.dataset.ri;
        if (!range || ri < range.r0 || ri > range.r1) return;
        row.querySelectorAll('.g-cell[data-ci]').forEach((cell) => {
          const ci = +cell.dataset.ci;
          if (multi && ci >= range.c0 && ci <= range.c1) cell.classList.add('in-range');
          if (ri === G.focus.ri && ci === G.focus.ci) cell.classList.add('focus');
          if (editing() && ri === range.r1 && ci === range.c1) cell.insertAdjacentHTML('beforeend', '<span class="fill-handle" data-fill="1" title="Drag to fill (Excel-style). Hold Alt/Option to copy without a series."></span>');
        });
      });
    }
    function setFocus(ri, ci, extend) {
      ri = Math.max(0, Math.min(G.items.length - 1, ri));
      ci = Math.max(0, Math.min(G.vcols.length - 1, ci));
      G.focus = { ri, ci };
      if (!extend) G.anchor = { ri, ci };
      ensureVisible(ri, ci);
      paintSelection();
    }
    function ensureVisible(ri, ci) {
      const rh = rowH();
      const headH = els.head.offsetHeight;
      const y = ri * rh;
      const vp = els.vp;
      if (y < vp.scrollTop) vp.scrollTop = y;
      else if (y + rh > vp.scrollTop + vp.clientHeight - headH) vp.scrollTop = y + rh - vp.clientHeight + headH + 2;
      const fz = frozenN();
      if (ci >= fz && G.vcols[ci]) {
        const frozenW = (fz && G.vcols[fz - 1] ? G.lefts[fz - 1] + colW(G.vcols[fz - 1]) : SYS_TOTAL);
        const x = G.lefts[ci], w = colW(G.vcols[ci]);
        if (x < vp.scrollLeft + frozenW) vp.scrollLeft = x - frozenW;
        else if (x + w > vp.scrollLeft + vp.clientWidth) vp.scrollLeft = x + w - vp.clientWidth + 4;
      }
    }

    /* ---------------- Clipboard ---------------- */
    function copyText(text) {
      const done = () => TMD.toast('Copied to clipboard.', 'success', 1600);
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
      const ta = TMD.el('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { TMD.toast('Copy failed: ' + e.message, 'error'); }
      ta.remove();
      els.vp.focus({ preventScroll: true });
    }
    const tsv = (v) => String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    function rangeCells() {
      const range = selRange();
      if (!range) return [];
      const out = [];
      for (let i = range.r0; i <= range.r1; i++) {
        const it = G.items[i];
        if (!it || !it.rec) continue;
        for (let c = range.c0; c <= range.c1; c++) out.push({ rec: it.rec, col: G.vcols[c], ri: i, ci: c });
      }
      return out;
    }
    function copySelection() {
      const range = selRange();
      if (range && (range.r1 > range.r0 || range.c1 > range.c0 || S().selection.size === 0)) {
        const lines = [];
        for (let i = range.r0; i <= range.r1; i++) {
          const it = G.items[i];
          if (!it || !it.rec) continue;
          const vals = [];
          for (let c = range.c0; c <= range.c1; c++) vals.push(tsv(plainValue(G.vcols[c], it.rec)));
          lines.push(vals.join('\t'));
        }
        copyText(lines.join('\n'));
        return true;
      }
      const recs = G.rows.filter((r) => S().selection.has(r.id));
      if (!recs.length) { TMD.toast('Select rows (checkboxes) or cells (click, Shift+click) to copy.', 'info'); return false; }
      copyText([G.vcols.map((c) => tsv(c.label)).join('\t')].concat(recs.map((r) => G.vcols.map((c) => tsv(plainValue(c, r))).join('\t'))).join('\n'));
      return true;
    }
    function clearRange(label) {
      if (!editing()) return;
      const items = rangeCells().filter((x) => isEditableCol(x.col, x.rec)).map((x) => ({ rec: x.rec, key: x.col.keysBySheet[x.rec.sheet], nv: null, label: x.col.label }));
      if (items.length) M.edit.setValues(items, label || 'Clear contents');
    }
    function parseTsv(text) {
      const rows = [];
      let row = [], cur = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
        if (ch === '"' && cur === '') { q = true; continue; }
        if (ch === '\t') { row.push(cur); cur = ''; continue; }
        if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; continue; }
        cur += ch;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      return rows;
    }
    function pasteText(text) {
      if (!editing()) { TMD.toast('Unlock editing to paste into cells.', 'warn'); return; }
      if (!G.focus) { TMD.toast('Click a cell first, then paste.', 'info'); return; }
      const data = parseTsv(text.replace(/\n$/, ''));
      if (!data.length) return;
      const range = selRange();
      const items = [];
      const single = data.length === 1 && data[0].length === 1;
      const rows = single && range ? range.r1 - range.r0 + 1 : data.length;
      const cols = single && range ? range.c1 - range.c0 + 1 : data[0].length;
      const r0 = range ? range.r0 : G.focus.ri, c0 = range ? range.c0 : G.focus.ci;
      let ri = r0, used = 0;
      while (used < rows && ri < G.items.length) {
        const it = G.items[ri++];
        if (!it || !it.rec) continue;
        for (let j = 0; j < cols; j++) {
          const col = G.vcols[c0 + j];
          if (!isEditableCol(col, it.rec)) continue;
          const raw = single ? data[0][0] : (data[used] || [])[j];
          if (raw === undefined) continue;
          items.push({ rec: it.rec, key: col.keysBySheet[it.rec.sheet], nv: coerce(col, it.rec, raw), label: col.label });
        }
        used++;
      }
      if (items.length) { const n = M.edit.setValues(items, 'Paste'); if (n) TMD.toast(`Pasted ${n} cell(s).`, 'success', 1800); }
    }
    function coerce(col, rec, raw) {
      if (raw === null || raw === undefined) return null;
      const s = String(raw);
      if (s.trim() === '') return null;
      const meta = TMD.sheetOf(rec).colMeta[col.keysBySheet[rec.sheet]] || {};
      if ((meta.type === 'number' || meta.type === 'amount') && /^-?\d+(\.\d+)?$/.test(s.replace(/,/g, '').trim())) return parseFloat(s.replace(/,/g, ''));
      return s;
    }

    /* ---------------- Fill handle (Excel-style series) ---------------- */
    function seriesFor(vals, count, copyOnly) {
      // vals: source display values (strings / numbers), count: number of cells to generate
      const out = [];
      if (copyOnly || !vals.length) { for (let i = 0; i < count; i++) out.push(vals[i % vals.length]); return out; }
      const nums = vals.map((v) => (typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? parseFloat(v) : null));
      if (nums.every((n) => n !== null)) {
        const step = nums.length > 1 ? (nums[nums.length - 1] - nums[0]) / (nums.length - 1) : 1;
        const width = typeof vals[0] === 'string' && /^0\d+$/.test(vals[0].trim()) ? vals[0].trim().length : 0;
        for (let i = 1; i <= count; i++) {
          const n = Math.round((nums[nums.length - 1] + step * i) * 1e9) / 1e9;
          out.push(typeof vals[0] === 'string' ? (width ? String(n).padStart(width, '0') : String(n)) : n);
        }
        return out;
      }
      const dates = vals.map((v) => { const p = TMD.parseDate(v, null, false); return p.kind === 'date' ? p.date : null; });
      if (dates.every(Boolean)) {
        const step = dates.length > 1 ? Math.round((dates[dates.length - 1] - dates[0]) / TMD.DAY / (dates.length - 1)) : 1;
        const last = dates[dates.length - 1];
        for (let i = 1; i <= count; i++) out.push(TMD.fmtDate(new Date(last.getFullYear(), last.getMonth(), last.getDate() + step * i)));
        return out;
      }
      const m = /^(.*?)(\d+)(\D*)$/.exec(String(vals[vals.length - 1]));
      if (vals.length === 1 && m) {
        const width = m[2].length;
        for (let i = 1; i <= count; i++) out.push(m[1] + String(parseInt(m[2], 10) + i).padStart(width, '0') + m[3]);
        return out;
      }
      for (let i = 0; i < count; i++) out.push(vals[i % vals.length]);
      return out;
    }
    function startFill(e) {
      e.preventDefault(); e.stopPropagation();
      const range = selRange();
      if (!range) return;
      G.fillDrag = { range, to: range.r1 };
      document.body.classList.add('filling');
      let scrollTimer = null;
      const move = (ev) => {
        const rect = els.body.getBoundingClientRect();
        const ri = Math.max(0, Math.min(G.items.length - 1, Math.floor((ev.clientY - rect.top) / rowH())));
        G.fillDrag.to = ri;
        const vr = els.vp.getBoundingClientRect();
        clearInterval(scrollTimer);
        if (ev.clientY > vr.bottom - 24) scrollTimer = setInterval(() => { els.vp.scrollTop += rowH(); }, 60);
        else if (ev.clientY < vr.top + els.head.offsetHeight + 12) scrollTimer = setInterval(() => { els.vp.scrollTop -= rowH(); }, 60);
        paintFillTarget();
      };
      const up = (ev) => {
        clearInterval(scrollTimer);
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('filling');
        const fd = G.fillDrag;
        G.fillDrag = null;
        TMD.$$('.fill-target', els.body).forEach((c) => c.classList.remove('fill-target'));
        applyFill(fd, ev.altKey);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }
    function paintFillTarget() {
      TMD.$$('.fill-target', els.body).forEach((c) => c.classList.remove('fill-target'));
      const fd = G.fillDrag;
      if (!fd) return;
      const lo = fd.to > fd.range.r1 ? fd.range.r1 + 1 : fd.to;
      const hi = fd.to > fd.range.r1 ? fd.to : fd.range.r0 - 1;
      if (fd.to >= fd.range.r0 && fd.to <= fd.range.r1) return;
      TMD.$$('.g-row[data-ri]', els.body).forEach((row) => {
        const ri = +row.dataset.ri;
        if (ri < lo || ri > hi) return;
        row.querySelectorAll('.g-cell[data-ci]').forEach((cell) => { const ci = +cell.dataset.ci; if (ci >= fd.range.c0 && ci <= fd.range.c1) cell.classList.add('fill-target'); });
      });
    }
    function applyFill(fd, copyOnly) {
      if (!fd || (fd.to >= fd.range.r0 && fd.to <= fd.range.r1)) return;
      const down = fd.to > fd.range.r1;
      const srcRows = [];
      for (let i = fd.range.r0; i <= fd.range.r1; i++) if (G.items[i] && G.items[i].rec) srcRows.push(G.items[i].rec);
      const tgtRows = [];
      if (down) { for (let i = fd.range.r1 + 1; i <= fd.to; i++) if (G.items[i] && G.items[i].rec) tgtRows.push(G.items[i].rec); }
      else { for (let i = fd.range.r0 - 1; i >= fd.to; i--) if (G.items[i] && G.items[i].rec) tgtRows.push(G.items[i].rec); }
      const items = [];
      for (let c = fd.range.c0; c <= fd.range.c1; c++) {
        const col = G.vcols[c];
        if (!col || col.kind !== 'source') continue;
        let vals = srcRows.map((r) => { const k = col.keysBySheet[r.sheet]; return k === undefined ? null : r.values[k]; }).filter((v) => !TMD.isBlank(v));
        if (!vals.length) continue;
        // Excel-dated cells keep their display text; use it for series
        if (!down) vals = vals.slice().reverse();
        const seq = !down && !copyOnly ? seriesBackward(vals, tgtRows.length) : seriesFor(vals, tgtRows.length, copyOnly);
        tgtRows.forEach((r, i) => { if (isEditableCol(col, r)) items.push({ rec: r, key: col.keysBySheet[r.sheet], nv: seq[i], label: col.label }); });
      }
      if (!items.length) return;
      const n = M.edit.setValues(items, copyOnly ? 'Fill (copy)' : 'Fill series');
      if (n) TMD.toast(`Filled ${n} cell(s)${copyOnly ? ' (copied)' : ''}. Undo with Ctrl+Z.`, 'success', 2200);
      const last = down ? fd.to : fd.to;
      G.anchor = { ri: down ? fd.range.r0 : last, ci: fd.range.c0 };
      G.focus = { ri: down ? last : fd.range.r1, ci: fd.range.c1 };
      paintSelection();
    }
    function seriesBackward(valsReversed, count) {
      // valsReversed: first = topmost source, filling upwards → negative steps
      const fwd = valsReversed.slice().reverse();
      const nums = fwd.map((v) => (typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? parseFloat(v) : null));
      if (nums.every((n) => n !== null)) {
        const step = nums.length > 1 ? (nums[nums.length - 1] - nums[0]) / (nums.length - 1) : 1;
        return Array.from({ length: count }, (_, i) => { const n = nums[0] - step * (i + 1); return typeof fwd[0] === 'string' ? String(n) : n; });
      }
      const dates = fwd.map((v) => { const p = TMD.parseDate(v, null, false); return p.kind === 'date' ? p.date : null; });
      if (dates.every(Boolean)) {
        const step = dates.length > 1 ? Math.round((dates[dates.length - 1] - dates[0]) / TMD.DAY / (dates.length - 1)) : 1;
        return Array.from({ length: count }, (_, i) => TMD.fmtDate(new Date(dates[0].getFullYear(), dates[0].getMonth(), dates[0].getDate() - step * (i + 1))));
      }
      return Array.from({ length: count }, (_, i) => fwd[(fwd.length - 1 - (i % fwd.length) + fwd.length) % fwd.length]);
    }
    function fillDown() {
      const range = selRange();
      if (!editing() || !range || range.r1 === range.r0) { TMD.toast('Select a range of cells (Shift+click) to fill down.', 'info'); return; }
      const top = G.items[range.r0] && G.items[range.r0].rec;
      if (!top) return;
      const items = [];
      for (let i = range.r0 + 1; i <= range.r1; i++) {
        const it = G.items[i];
        if (!it || !it.rec) continue;
        for (let c = range.c0; c <= range.c1; c++) {
          const col = G.vcols[c];
          if (!isEditableCol(col, it.rec) || !isEditableCol(col, top)) continue;
          items.push({ rec: it.rec, key: col.keysBySheet[it.rec.sheet], nv: top.values[col.keysBySheet[top.sheet]], label: col.label });
        }
      }
      if (items.length) M.edit.setValues(items, 'Fill down');
    }

    /* ---------------- In-cell editor ---------------- */
    function distinctValues(col) {
      const s = new Set();
      S().records.forEach((r) => { const v = M.colValue(col, r); if (!TMD.isBlank(v)) s.add(TMD.cellText(v).trim()); });
      return Array.from(s).sort(collator.compare).slice(0, 300);
    }
    function openEditor(ri, ci, initialChar) {
      if (!editing()) return;
      const it = G.items[ri];
      if (!it || !it.rec) return;
      const col = G.vcols[ci];
      if (!isEditableCol(col, it.rec)) { TMD.toast('Calculated columns cannot be edited.', 'info'); return; }
      closeEditor(true);
      if (anyEditor && anyEditor !== G) anyEditor.closeEditor(true);
      ensureVisible(ri, ci);
      const rec = it.rec, key = col.keysBySheet[rec.sheet];
      const cellEl = els.body.querySelector(`.g-row[data-ri="${ri}"] .g-cell[data-ci="${ci}"]`);
      if (!cellEl) return;
      const rect = cellEl.getBoundingClientRect();
      const v = rec.values[key];
      const text = TMD.cellText(v);
      const isDate = col.isDate || col.type === 'date' || col.type === 'milestone';
      const isNum = col.type === 'amount' || col.type === 'number';
      const isLong = col.type === 'longtext';
      const dropdown = cfg.dropdownStd && cfg.dropdownStd.has(col.std);
      const box = TMD.el('div', { class: 'cell-editor' + (isLong ? ' long' : '') + (isDate ? ' date' : '') });
      const start = initialChar !== undefined ? initialChar : null;
      let html;
      if (isLong) html = `<textarea class="inp" rows="5" aria-label="${esc(col.label)}">${esc(start !== null ? start : text)}</textarea><div class="ce-hint">Enter = new line · Ctrl+Enter or Tab saves · Esc cancels</div>`;
      else if (isDate) {
        const p = TMD.parseDate(v, rec.dateHints[key], true);
        const today = TMD.today();
        const initial = start !== null ? start : (TMD.isBlank(v) ? TMD.fmtDate(today) : text);
        html = `<input class="inp" type="text" value="${esc(initial)}" aria-label="${esc(col.label)}" placeholder="dd/mm/yyyy"><input class="inp ce-date" type="date" value="${TMD.isoDate(p.date || today)}" aria-label="Pick date"><button class="btn sm" data-today="1" type="button">Today</button>${TMD.isBlank(v) ? '<div class="ce-hint">Empty cell — today’s date is pre-filled. Enter to accept, Esc to cancel.</div>' : ''}`;
      } else if (dropdown) {
        const opts = distinctValues(col);
        const lid = 'dl-' + TMD.uid('e');
        html = `<input class="inp" type="text" list="${lid}" value="${esc(start !== null ? start : text)}" aria-label="${esc(col.label)}" placeholder="Type or choose"><datalist id="${lid}">${opts.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
      } else html = `<input class="inp" type="text" ${isNum ? 'inputmode="decimal"' : ''} value="${esc(start !== null ? start : text)}" aria-label="${esc(col.label)}">`;
      box.innerHTML = html;
      document.body.appendChild(box);
      const w = isLong ? Math.max(rect.width, 380) : isDate ? Math.max(rect.width, 330) : Math.max(rect.width, 120);
      box.style.width = w + 'px';
      box.style.minHeight = rect.height + 'px';
      box.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - w - 8)) + 'px';
      box.style.top = Math.max(4, Math.min(rect.top, window.innerHeight - (isLong ? 180 : 60))) + 'px';
      const main = box.querySelector('textarea,input');
      G.editor = { box, rec, key, col, ri, ci, openedAt: Date.now() };
      anyEditor = api;
      const finish = (move) => {
        if (!G.editor) return;
        let nv = main.value;
        if (nv === '') nv = null;
        else if (isNum && /^-?[\d,]*\.?\d+$/.test(nv.trim())) nv = parseFloat(nv.replace(/,/g, ''));
        const changed = !(nv === v || (TMD.isBlank(nv) && TMD.isBlank(v)) || (typeof v === 'number' && String(v) === String(nv)));
        closeEditor(false);
        if (changed) M.edit.setValue(rec, key, nv, col.label);
        if (move) setFocus(ri + move[0], ci + move[1]);
        els.vp.focus({ preventScroll: true });
      };
      G.editor.finish = finish;
      const dp = box.querySelector('.ce-date');
      if (dp) dp.addEventListener('change', () => { if (dp.value) main.value = TMD.fmtDate(TMD.fromIso(dp.value)); main.focus(); });
      const tb = box.querySelector('[data-today]');
      if (tb) tb.addEventListener('click', () => { main.value = TMD.fmtDate(TMD.today()); finish([1, 0]); });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(false); els.vp.focus({ preventScroll: true }); return; }
        if (e.key === 'Tab') { e.preventDefault(); finish([0, e.shiftKey ? -1 : 1]); return; }
        if (e.key === 'Enter') {
          if (isLong && !(e.ctrlKey || e.metaKey)) return;
          if (e.target === dp) return;
          e.preventDefault(); finish([e.shiftKey ? -1 : 1, 0]);
        }
        if (!isLong && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target === main && !main.getAttribute('list')) { e.preventDefault(); finish([e.key === 'ArrowUp' ? -1 : 1, 0]); }
      });
      // Focus synchronously so fast typing after the first key is not lost.
      try { main.focus({ preventScroll: true }); } catch (x) { main.focus(); }
      if (start !== null) { const l = main.value.length; try { main.setSelectionRange(l, l); } catch (x) { /* ignore */ } }
      setTimeout(() => {
        if (document.activeElement !== main && !box.contains(document.activeElement)) main.focus();
        if (start !== null) { const l = main.value.length; try { main.setSelectionRange(l, l); } catch (x) { /* ignore */ } }
        else try { main.select(); } catch (x) { /* ignore */ }
      }, 10);
    }
    function closeEditor(commit) {
      if (!G.editor) return;
      const ed = G.editor;
      if (commit && ed.finish) { ed.finish(null); return; }
      ed.box.remove();
      G.editor = null;
      if (anyEditor === api) anyEditor = null;
    }

    /* ---------------- Menus ---------------- */
    function rowMenu(anchor, rec) {
      const edit = editing();
      TMD.menu(anchor, [
        { label: 'View details', icon: 'eye', action: () => cfg.openDetails(rec) },
        ...(cfg.rowMenuExtra ? cfg.rowMenuExtra(rec) : []),
        { sep: true },
        { label: 'Insert row above', icon: 'plus', disabled: !edit, action: () => M.edit.addRow(rec, 'above') },
        { label: 'Insert row below', icon: 'plus', disabled: !edit, action: () => M.edit.addRow(rec, 'below') },
        { label: 'Duplicate row', icon: 'copy', disabled: !edit, action: () => M.edit.duplicate([rec]) },
        { label: edit ? 'Delete row' : 'Delete (unlock editing first)', icon: 'trash', danger: true, disabled: !edit, action: () => M.edit.remove([rec]) },
      ]);
    }
    function cellMenu(ev, ri, ci) {
      const it = G.items[ri];
      if (!it || !it.rec) return;
      const rec = it.rec, col = G.vcols[ci];
      const edit = editing();
      const range = selRange();
      const inRange = range && ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1;
      if (!inRange) setFocus(ri, ci);
      const val = plainValue(col, rec);
      const anchor = { getBoundingClientRect: () => ({ left: ev.clientX, right: ev.clientX, top: ev.clientY, bottom: ev.clientY }) };
      const canPasteApi = navigator.clipboard && navigator.clipboard.readText && window.isSecureContext;
      TMD.menu(anchor, [
        { header: col.label },
        { label: 'Copy', icon: 'copy', action: copySelection },
        { label: 'Cut', icon: 'copy', disabled: !edit, action: () => { if (copySelection()) clearRange('Cut'); } },
        { label: canPasteApi ? 'Paste' : 'Paste (use Ctrl+V / ⌘V)', icon: 'download', disabled: !edit || !canPasteApi, action: () => navigator.clipboard.readText().then(pasteText, () => TMD.toast('Clipboard access denied — use Ctrl+V / ⌘V.', 'info')) },
        { label: 'Edit cell', icon: 'edit', disabled: !edit || !isEditableCol(col, rec), action: () => openEditor(G.focus.ri, G.focus.ci) },
        { label: 'Fill down (Ctrl+D)', icon: 'sortDesc', disabled: !edit, action: fillDown },
        { label: 'Clear contents (Del)', icon: 'x', disabled: !edit, action: () => clearRange() },
        { sep: true },
        { label: `Filter by “${val.slice(0, 28) || '(Blanks)'}”`, icon: 'filter', action: () => { G.colFilter[col.id] = { values: [val === '' ? '(Blanks)' : val], text: '' }; refresh(false); } },
        { label: 'Sort A → Z', icon: 'sortAsc', action: () => { G.sort = [{ id: col.id, dir: 'asc' }]; refresh(false); } },
        { label: 'Sort Z → A', icon: 'sortDesc', action: () => { G.sort = [{ id: col.id, dir: 'desc' }]; refresh(false); } },
        { sep: true },
        { label: 'Insert row above', icon: 'plus', disabled: !edit, action: () => M.edit.addRow(rec, 'above') },
        { label: 'Insert row below', icon: 'plus', disabled: !edit, action: () => M.edit.addRow(rec, 'below') },
        { label: 'Add column…', icon: 'columns', disabled: !edit, action: () => M.edit.addColumn() },
        { label: 'Delete row', icon: 'trash', danger: true, disabled: !edit, action: () => M.edit.remove([rec]) },
        { sep: true },
        { label: 'View details', icon: 'eye', action: () => cfg.openDetails(rec) },
        ...(edit ? [] : [{ label: 'Unlock editing…', icon: 'lock', action: () => M.edit.enter() }]),
      ], { noFocus: false });
    }

    /* ---------------- Header filter (Excel-style) ---------------- */
    function headerFilter(anchor, colId) {
      const col = colById(colId);
      if (!col) return;
      const base = S().filtered.filter((r) => passesColFilters(r, colId));
      const counts = new Map();
      base.forEach((r) => { const t = filterText(col, r); counts.set(t, (counts.get(t) || 0) + 1); });
      let vals = Array.from(counts.keys()).sort((a, b) => (a === '(Blanks)' ? 1 : b === '(Blanks)' ? -1 : collator.compare(a, b)));
      const truncated = vals.length > 1000;
      vals = vals.slice(0, 1000);
      const cur = G.colFilter[colId] || {};
      const selSet = cur.values ? new Set(cur.values) : null;
      const wrap = TMD.el('div', { class: 'hf-pop' });
      wrap.innerHTML = `<div class="hf-title">${esc(col.label)}</div>
        <div class="hf-sort"><button class="btn subtle sm" data-s="asc">${TMD.icon('sortAsc')}<span>Sort A → Z</span></button><button class="btn subtle sm" data-s="desc">${TMD.icon('sortDesc')}<span>Sort Z → A</span></button></div>
        <input class="inp inp-sm" type="search" data-text placeholder="Text contains…" value="${esc(cur.text || '')}" aria-label="Text contains">
        <input class="inp inp-sm" type="search" data-find placeholder="Search values…" aria-label="Search values">
        <label class="ms-opt hf-all"><input type="checkbox" data-all ${!selSet ? 'checked' : ''}><span class="ms-l"><strong>(Select all)</strong></span></label>
        <div class="ms-list">${vals.map((v) => `<label class="ms-opt"><input type="checkbox" value="${esc(v)}" ${!selSet || selSet.has(v) ? 'checked' : ''}><span class="ms-l">${esc(v)}</span><span class="ms-n">${counts.get(v)}</span></label>`).join('')}</div>
        ${truncated ? '<div class="muted small">Showing the first 1,000 values — use “Text contains”.</div>' : ''}
        <div class="hf-foot"><button class="btn subtle sm" data-clear>Clear filter</button><span class="sp"></span><button class="btn sm" data-cancel>Cancel</button><button class="btn primary sm" data-ok>OK</button></div>`;
      const boxes = () => TMD.$$('.ms-list input[type=checkbox]', wrap);
      wrap.addEventListener('input', (e) => {
        if (e.target.dataset.find !== undefined) { const q = e.target.value.toLowerCase(); TMD.$$('.ms-list .ms-opt', wrap).forEach((o) => { o.hidden = o.textContent.toLowerCase().indexOf(q) < 0; }); }
      });
      wrap.addEventListener('change', (e) => {
        if (e.target.dataset.all !== undefined) boxes().forEach((b) => { if (!b.closest('.ms-opt').hidden) b.checked = e.target.checked; });
        else if (e.target.type === 'checkbox') wrap.querySelector('[data-all]').checked = boxes().every((b) => b.checked);
      });
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); wrap.querySelector('[data-ok]').click(); } });
      wrap.addEventListener('click', (e) => {
        const s = e.target.closest('[data-s]');
        if (s) { G.sort = [{ id: colId, dir: s.dataset.s }]; TMD.closePopover(); refresh(false); return; }
        if (e.target.closest('[data-clear]')) { delete G.colFilter[colId]; TMD.closePopover(); refresh(false); return; }
        if (e.target.closest('[data-cancel]')) { TMD.closePopover(); return; }
        if (e.target.closest('[data-ok]')) {
          const checked = boxes().filter((b) => b.checked).map((b) => b.value);
          const text = wrap.querySelector('[data-text]').value.trim();
          const all = checked.length === vals.length && !truncated;
          if (all && !text) delete G.colFilter[colId];
          else G.colFilter[colId] = { values: all ? null : checked, text };
          TMD.closePopover();
          refresh(false);
        }
      });
      TMD.popover(anchor, wrap, { cls: 'hf-popover' });
    }

    function columnsMenu(anchor) {
      const wrap = TMD.el('div', { class: 'col-pop' });
      const render = () => {
        wrap.innerHTML = `<input class="inp" type="search" placeholder="Find column…" aria-label="Find column">
          <div class="ms-actions"><button class="linklike" data-a="all">Show all</button><button class="linklike" data-a="src">Source columns only</button><button class="linklike" data-a="calc">+ All calculated</button></div>
          <div class="ms-list">${G.order.map((id) => { const c = colById(id); if (!c) return ''; return `<label class="ms-opt"><input type="checkbox" value="${esc(id)}" ${G.hidden.has(id) ? '' : 'checked'}><span class="ms-l">${c.kind === 'calc' ? '<span class="calc-ico">ƒ</span>' : ''}${esc(c.label)}${c.added ? ' <span class="tag">added</span>' : ''}</span></label>`; }).join('')}</div>
          <label class="tb-sel pad">Freeze first <select class="inp inp-sm" data-a="freeze">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option ${frozenN() === n ? 'selected' : ''}>${n}</option>`).join('')}</select> column(s)</label>
          <div class="muted small pad">Drag column headers to reorder; drag a header edge to resize.</div>`;
      };
      render();
      wrap.addEventListener('change', (e) => {
        if (e.target.dataset.a === 'freeze') { TMD.settings.set(cfg.frozenKey || 'frozenCols', +e.target.value); refresh(); return; }
        const id = e.target.value; if (e.target.checked) G.hidden.delete(id); else G.hidden.add(id); saveLayout(); refresh();
      });
      wrap.addEventListener('input', (e) => { if (e.target.type === 'search') { const q = e.target.value.toLowerCase(); TMD.$$('.ms-opt', wrap).forEach((o) => { o.hidden = o.textContent.toLowerCase().indexOf(q) < 0; }); } });
      wrap.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a || a.tagName === 'SELECT') return;
        if (a.dataset.a === 'all') G.hidden.clear();
        if (a.dataset.a === 'src') S().columns.forEach((c) => { if (c.kind === 'calc' && !c.keepWithSource) G.hidden.add(c.id); else G.hidden.delete(c.id); });
        if (a.dataset.a === 'calc') S().columns.forEach((c) => { if (c.kind === 'calc') G.hidden.delete(c.id); });
        saveLayout(); refresh(); render();
      });
      TMD.popover(anchor, wrap, { cls: 'ms-popover wide' });
    }

    function printTable() {
      const rows = G.rows.slice(0, 3000);
      const cols = G.vcols;
      const host = TMD.$('#printHost');
      host.innerHTML = `<div class="print-doc"><h1>${esc(cfg.printTitle || cfg.name)}</h1>
        <p>${esc(S().workbook.fileName)} · ${esc(S().activeSheets.join(', '))} · ${TMD.fmtInt(rows.length)} record(s)${G.rows.length > 3000 ? ' (first 3,000 shown)' : ''} · Printed ${esc(TMD.fmtDateTime(Date.now()))}${M.filters.activeCount() ? ' · Filters applied' : ''}</p>
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
        const selected = () => G.rows.filter((r) => S().selection.has(r.id));
        if (a === 'sheets') cfg.onSheets();
        if (a === 'columns') columnsMenu(b);
        if (a === 'clearColFilters') { G.colFilter = {}; refresh(false); }
        if (a === 'wrap') { G.wrap = !G.wrap; saveLayout(); refresh(); }
        if (a === 'density') { const k = cfg.densityKey || 'density'; TMD.settings.set(k, TMD.settings.get(k) === 'compact' ? 'comfortable' : 'compact'); refresh(); }
        if (a === 'fullscreen') { document.body.classList.toggle('table-full'); refresh(); }
        if (a === 'more') TMD.menu(b, [
          { label: 'Select all filtered records', icon: 'check', action: () => { G.rows.forEach((r) => S().selection.add(r.id)); refresh(false); } },
          { label: 'Export filtered records…', icon: 'download', action: () => cfg.onExport('filtered') },
          { label: 'Print table view', icon: 'printer', action: printTable },
          { label: 'Clear sorting', icon: 'sortAsc', action: () => { G.sort = []; refresh(); } },
          { label: 'Clear column filters', icon: 'filter', action: () => { G.colFilter = {}; refresh(); } },
          { label: 'Reset table layout', icon: 'refresh', action: resetLayout },
        ], { alignRight: true });
        if (a === 'add') M.edit.addRow();
        if (a === 'addcol') M.edit.addColumn();
        if (a === 'dup') M.edit.duplicate(selected());
        if (a === 'del') M.edit.remove(selected());
        if (a === 'copy') copySelection();
        if (a === 'exportSel') cfg.onExport('selected');
        if (a === 'clearSel') { S().selection.clear(); refresh(false); }
      });
      els.tb.addEventListener('change', (e) => {
        if (e.target.dataset.act === 'group') { G.groupBy = e.target.value; G.collapsed.clear(); refresh(); }
      });
      els.head.addEventListener('click', (e) => {
        if (e.target.classList.contains('sel-all')) {
          if (e.target.checked) G.rows.forEach((r) => S().selection.add(r.id)); else G.rows.forEach((r) => S().selection.delete(r.id));
          refresh(false); return;
        }
        const hf = e.target.closest('[data-hf]');
        if (hf) { e.stopPropagation(); headerFilter(hf, hf.dataset.hf); return; }
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
      els.head.addEventListener('mousedown', (e) => {
        const rz = e.target.closest('.rz');
        if (!rz) return;
        e.preventDefault(); e.stopPropagation();
        const id = rz.dataset.rz;
        const col = colById(id);
        const startX = e.clientX, startW = colW(col);
        document.body.classList.add('col-resizing');
        let raf = 0;
        const move = (ev) => {
          G.widths[id] = Math.max(56, Math.min(900, startW + ev.clientX - startX));
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

      // Mouse: selection by dragging across cells (Excel-like), fill handle
      els.body.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('[data-fill]')) { startFill(e); return; }
        const cell = e.target.closest('.g-cell[data-ci]');
        const row = e.target.closest('.g-row[data-ri]');
        if (!cell || !row || e.target.closest('input,button')) return;
        const ri = +row.dataset.ri, ci = +cell.dataset.ci;
        if (e.shiftKey && G.anchor) { e.preventDefault(); G.focus = { ri, ci }; paintSelection(); return; }
        G.dragSel = { ri, ci };
        const move = (ev) => {
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const c2 = el && el.closest && el.closest('.g-cell[data-ci]');
          const r2 = el && el.closest && el.closest('.g-row[data-ri]');
          if (!c2 || !r2 || !els.body.contains(r2)) return;
          const nri = +r2.dataset.ri, nci = +c2.dataset.ci;
          if (G.focus && (G.focus.ri !== nri || G.focus.ci !== nci) && G.dragSel) { G.anchor = { ri: G.dragSel.ri, ci: G.dragSel.ci }; G.focus = { ri: nri, ci: nci }; G.dragged = true; paintSelection(); }
        };
        const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); G.dragSel = null; };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      els.body.addEventListener('click', (e) => {
        const grp = e.target.closest('.g-group');
        if (grp) { const k = grp.dataset.group; if (G.collapsed.has(k)) G.collapsed.delete(k); else G.collapsed.add(k); refresh(false); return; }
        const row = e.target.closest('.g-row[data-id]');
        if (!row) return;
        const rec = G.items[+row.dataset.ri].rec;
        if (e.target.classList.contains('row-chk')) {
          if (e.target.checked) S().selection.add(rec.id); else S().selection.delete(rec.id);
          row.classList.toggle('sel', e.target.checked);
          renderToolbar(); els.head.innerHTML = headerHtml(); return;
        }
        if (e.target.closest('.row-menu')) { rowMenu(e.target.closest('.row-menu'), rec); return; }
        if (e.target.closest('.rownum')) { cfg.openDetails(rec); return; }
        const cell = e.target.closest('.g-cell[data-ci]');
        if (!cell || e.target.closest('[data-fill]')) return;
        const ci = +cell.dataset.ci, ri = +row.dataset.ri;
        if (G.dragged) { G.dragged = false; els.vp.focus({ preventScroll: true }); return; }
        const now = Date.now();
        const wasFocused = G.focus && G.focus.ri === ri && G.focus.ci === ci;
        if (!e.shiftKey && G.lastClick && G.lastClick.ri === ri && G.lastClick.ci === ci && now - G.lastClick.t < 450) {
          G.lastClick = null;
          if (editing()) openEditor(ri, ci); else cfg.openDetails(rec);
          return;
        }
        G.lastClick = { ri, ci, t: now };
        if (e.shiftKey) { els.vp.focus({ preventScroll: true }); return; }
        const lt = e.target.closest('.lt, .clamp');
        if (lt && !editing()) {
          const full = lt.getAttribute('data-full') || lt.textContent, label = G.vcols[ci].label;
          clearTimeout(G.ltTimer);
          G.ltTimer = setTimeout(() => { if (G.lastClick && G.lastClick.t === now) cfg.openText(label, full, rec); }, 460);
        }
        setFocus(ri, ci);
        // Excel feel: clicking an already-selected editable cell in Edit Mode opens the editor
        if (editing() && wasFocused && isEditableCol(G.vcols[ci], rec)) { G.lastClick = null; openEditor(ri, ci); return; }
        els.vp.focus({ preventScroll: true });
      });
      els.body.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.g-cell[data-ci]');
        const row = e.target.closest('.g-row[data-ri]');
        if (!cell || !row) return;
        e.preventDefault();
        cellMenu(e, +row.dataset.ri, +cell.dataset.ci);
      });
      els.vp.addEventListener('paste', (e) => {
        if (G.editor || e.target.closest('input,textarea')) return;
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) { e.preventDefault(); pasteText(text); }
      });
      els.vp.addEventListener('keydown', (e) => {
        if (G.editor) return;
        const t = e.target;
        if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
        const ctrl = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (ctrl && k === 'c') { e.preventDefault(); copySelection(); return; }
        if (ctrl && k === 'x') { e.preventDefault(); if (!editing()) { TMD.toast('Unlock editing to cut cells.', 'info'); return; } if (copySelection()) clearRange('Cut'); return; }
        if (ctrl && k === 'd') { e.preventDefault(); fillDown(); return; }
        if (ctrl && k === 'a') { e.preventDefault(); G.rows.forEach((r) => S().selection.add(r.id)); refresh(false); return; }
        if (!G.focus) { if (/^Arrow|Tab|Enter$/.test(e.key) && G.items.length) { e.preventDefault(); setFocus(G.items[0].rec ? 0 : 1, 0); } return; }
        const { ri, ci } = G.focus;
        const ext = e.shiftKey && e.key.indexOf('Arrow') === 0;
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (moves[e.key]) { e.preventDefault(); setFocus(ri + moves[e.key][0], ci + moves[e.key][1], ext); return; }
        if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); const n = Math.floor(els.vp.clientHeight / rowH()) - 1; setFocus(ri + (e.key === 'PageDown' ? n : -n), ci); return; }
        if (e.key === 'Home') { e.preventDefault(); setFocus(ctrl ? 0 : ri, 0); return; }
        if (e.key === 'End') { e.preventDefault(); setFocus(ctrl ? G.items.length - 1 : ri, G.vcols.length - 1); return; }
        if (e.key === 'Tab') { e.preventDefault(); setFocus(ri, ci + (e.shiftKey ? -1 : 1)); return; }
        if (e.key === 'Escape') { G.anchor = G.focus; paintSelection(); return; }
        const it = G.items[ri];
        if (!it || !it.rec) return;
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          if (editing()) openEditor(ri, ci); else cfg.openDetails(it.rec);
          return;
        }
        if (e.key === ' ' && !editing()) { e.preventDefault(); const sel = S().selection; if (sel.has(it.rec.id)) sel.delete(it.rec.id); else sel.add(it.rec.id); refresh(false); return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && editing()) { e.preventDefault(); clearRange(); return; }
        if (editing() && e.key.length === 1 && !ctrl && !e.altKey) {
          const col = G.vcols[ci];
          if (isEditableCol(col, it.rec)) { e.preventDefault(); openEditor(ri, ci, e.key); }
        }
      });
      els.empty.addEventListener('click', (e) => { if (e.target.closest('[data-act="clearFilters"]')) M.filters.clearAll(); });
      window.addEventListener('resize', TMD.debounce(() => { if (isVisible()) { sizeGrid(); renderRows(); } }, 120));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('table-full') && isVisible() && !G.editor && !TMD.$('#modalHost').children.length && !document.querySelector('.drawer.open')) {
          document.body.classList.remove('table-full'); refresh();
        }
      });
    }
    document.addEventListener('mousedown', (e) => { if (G.editor && !G.editor.box.contains(e.target)) closeEditor(true); });

    const api = {
      G,
      render(host) {
        if (!G.mounted || G.host !== host || !host.querySelector('.grid')) { G.mounted = false; mount(host); }
        refresh(true);
      },
      refresh,
      refreshRows() { if (isVisible()) { buildRows(); renderToolbar(); els.body.style.height = (G.items.length * rowH()) + 'px'; els.head.innerHTML = headerHtml(); els.grid.classList.toggle('editing', editing()); renderRows(); renderFoot(); } },
      onData() { loadLayout(); G.focus = null; G.anchor = null; if (els.vp) { els.vp.scrollTop = 0; els.vp.scrollLeft = 0; } },
      focusRecord(rec) {
        buildRows();
        const i = G.items.findIndex((it) => it.rec === rec);
        if (i >= 0) { if (els.body) { els.body.style.height = (G.items.length * rowH()) + 'px'; renderRows(); } setFocus(i, Math.min(G.vcols.length - 1, frozenN())); }
      },
      closeEditor,
      copyText,
      pasteText,
      visibleColumns: () => G.vcols,
      sortedRows: () => G.rows,
      resize: sizeGrid,
      setColFilter(id, f) { if (f) G.colFilter[id] = f; else delete G.colFilter[id]; refresh(false); },
    };
    return api;
  };
})();
