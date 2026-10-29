/* =====================================================================
 * utils.js — shared namespace, escaping, formatting and UI primitives.
 * Everything runs locally. No network access is used anywhere.
 * ===================================================================== */
(function () {
  'use strict';

  const TMD = (window.TMD = window.TMD || {});

  /* ---------------- Application state (single source in memory) -------------- */
  TMD.state = {
    workbook: null,        // see data-loader.js for shape
    activeSheets: [],      // names of worksheets currently analysed
    records: [],           // active records (array of Record objects)
    filtered: [],          // records after global filters
    columns: [],           // grid column definitions for active view
    mode: 'view',          // 'view' | 'edit'
    dirty: false,          // unsaved edit-mode changes
    page: 'dashboard',
    selection: new Set(),  // selected record ids
    sessionId: null,
  };

  /* ---------------- Simple event bus ---------------- */
  const listeners = {};
  TMD.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  TMD.emit = (evt, payload) => { (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(evt, e); } }); };

  /* ---------------- Escaping (all spreadsheet content is untrusted) ------------ */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  TMD.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"'`]/g, (c) => ESC[c]);
  };
  /** Escape and keep line breaks visible. */
  TMD.escMultiline = (v) => TMD.esc(v).replace(/\r\n|\r|\n/g, '<br>');

  /** Escape text and wrap case-insensitive matches of `term` in <mark>. */
  TMD.highlight = function (text, term) {
    const s = text === null || text === undefined ? '' : String(text);
    if (!term) return TMD.esc(s);
    const lower = s.toLowerCase();
    const t = term.toLowerCase();
    let out = '';
    let i = 0;
    let idx;
    while ((idx = lower.indexOf(t, i)) !== -1) {
      out += TMD.esc(s.slice(i, idx)) + '<mark>' + TMD.esc(s.slice(idx, idx + t.length)) + '</mark>';
      i = idx + t.length;
    }
    return out + TMD.esc(s.slice(i));
  };

  /* ---------------- DOM helpers ---------------- */
  TMD.$ = (sel, root) => (root || document).querySelector(sel);
  TMD.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  TMD.el = function (tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  TMD.debounce = function (fn, ms) {
    let t;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  TMD.uid = (function () {
    let n = 0;
    return (prefix) => (prefix || 'id') + '-' + Date.now().toString(36) + '-' + (++n).toString(36);
  })();

  TMD.randomHex = function (bytes) {
    const a = new Uint8Array(bytes || 4);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  TMD.deepClone = function (o) {
    if (typeof structuredClone === 'function') return structuredClone(o);
    return JSON.parse(JSON.stringify(o));
  };

  TMD.isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  /* ---------------- Dates ---------------- */
  TMD.today = function () {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const DAY = 86400000;
  TMD.DAY = DAY;
  TMD.daysBetween = (a, b) => (a && b ? Math.round((b - a) / DAY) : null);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  TMD.MONTHS = MONTHS;
  const p2 = (n) => String(n).padStart(2, '0');

  /** Format a Date according to the user's date-format setting. */
  TMD.fmtDate = function (d, fmt) {
    if (!d || isNaN(d)) return '';
    const f = fmt || (TMD.settings && TMD.settings.get('dateFormat')) || 'dd/mm/yyyy';
    const dd = p2(d.getDate()), mm = p2(d.getMonth() + 1), yyyy = d.getFullYear();
    switch (f) {
      case 'dd-mm-yyyy': return `${dd}-${mm}-${yyyy}`;
      case 'dd-mmm-yyyy': return `${dd}-${MONTHS[d.getMonth()]}-${yyyy}`;
      case 'yyyy-mm-dd': return `${yyyy}-${mm}-${dd}`;
      case 'dd mmm yyyy': return `${dd} ${MONTHS[d.getMonth()]} ${yyyy}`;
      default: return `${dd}/${mm}/${yyyy}`;
    }
  };
  TMD.isoDate = (d) => (d && !isNaN(d) ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : '');
  TMD.fromIso = function (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  TMD.fmtDateTime = function (ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${TMD.fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  TMD.monthKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
  TMD.monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
  TMD.stamp = function () {
    const d = new Date();
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
  };
  /** Excel serial number (1900 date system) for a local date. */
  TMD.dateToSerial = function (d) {
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return utc / DAY + 25569;
  };
  TMD.serialToDate = function (n) {
    const ms = Math.round((n - 25569) * DAY);
    const u = new Date(ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  };

  /* ---------------- Numbers / currency (Indian format) ---------------- */
  const nfIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  const nfIN0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const nfCache = {};
  const nfFor = (dp) => {
    const k = dp === undefined ? 'u' : dp;
    return nfCache[k] || (nfCache[k] = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp === undefined ? 2 : dp }));
  };
  TMD.fmtNum = (n, dp) => (n === null || n === undefined || isNaN(n) ? '' : (dp === 0 ? nfIN0.format(n) : nfFor(dp).format(n)));
  TMD.fmtInt = (n) => (n === null || n === undefined || isNaN(n) ? '' : nfIN0.format(n));

  /** Format a rupee amount according to settings (rupees / lakh / crore). */
  TMD.fmtMoney = function (rupees, opts) {
    if (rupees === null || rupees === undefined || isNaN(rupees)) return '—';
    const o = opts || {};
    const unit = o.unit || (TMD.settings && TMD.settings.get('amountUnit')) || 'lakh';
    const sym = (TMD.settings && TMD.settings.get('currency')) || '₹';
    if (unit === 'crore') return `${sym} ${TMD.fmtNum(rupees / 1e7, 2)} Cr`;
    if (unit === 'rupees') return `${sym} ${nfIN0.format(rupees)}`;
    return `${sym} ${TMD.fmtNum(rupees / 1e5, 2)} L`;
  };
  /** Exact full value for tooltips. */
  TMD.fmtMoneyExact = function (rupees) {
    if (rupees === null || rupees === undefined || isNaN(rupees)) return '';
    const sym = (TMD.settings && TMD.settings.get('currency')) || '₹';
    return `${sym} ${nfIN.format(rupees)}  (= ${TMD.fmtNum(rupees / 1e5, 4)} lakh = ${TMD.fmtNum(rupees / 1e7, 4)} crore)`;
  };

  /** Convert any number to a plain digit string (never scientific notation). */
  TMD.numToPlainString = function (n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    let s = String(n);
    if (/e/i.test(s)) s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
    return s;
  };

  /* ---------------- CSV helpers ---------------- */
  TMD.csvCell = function (v, protect) {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? TMD.fmtDate(v) : String(v);
    // Optional protection against spreadsheet formula injection in exported CSV.
    if (protect && /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d[\d,.]*$/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  TMD.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };
  TMD.downloadText = (text, filename, mime) =>
    TMD.downloadBlob(new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' }), filename);

  /* ---------------- Toasts ---------------- */
  TMD.toast = function (msg, kind, ms) {
    const host = TMD.$('#toastHost');
    const t = TMD.el('div', { class: 'toast ' + (kind || 'info'), role: kind === 'error' ? 'alert' : 'status' });
    t.innerHTML = `<span class="ti">${TMD.icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : kind === 'warn' ? 'alert' : 'info')}</span><span>${TMD.esc(msg)}</span>`;
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 3800);
  };

  /* ---------------- Progress overlay ---------------- */
  TMD.progress = function (text) {
    const o = TMD.$('#progressOverlay');
    if (text === false) { o.hidden = true; return; }
    TMD.$('#progressText').textContent = text || 'Working…';
    o.hidden = false;
  };
  /** Let the browser paint before heavy synchronous work. */
  TMD.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  /* ---------------- Modal dialogs ---------------- */
  /**
   * TMD.modal({title, body (html string or Node), buttons:[{label, value, kind}], wide, onOpen})
   * Resolves with the clicked button's value (or null when dismissed).
   */
  TMD.modal = function (opts) {
    return new Promise((resolve) => {
      const host = TMD.$('#modalHost');
      const back = TMD.el('div', { class: 'modal-back' });
      const dlg = TMD.el('div', { class: 'modal' + (opts.wide ? ' wide' : '') + (opts.xwide ? ' xwide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
      dlg.innerHTML = `<div class="modal-head"><h2>${TMD.esc(opts.title || '')}</h2><button class="icon-btn modal-x" aria-label="Close">${TMD.icon('x')}</button></div><div class="modal-body"></div><div class="modal-foot"></div>`;
      const body = dlg.querySelector('.modal-body');
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
      const foot = dlg.querySelector('.modal-foot');
      const prevFocus = document.activeElement;
      let done = false;
      const close = (val) => {
        if (done) return;
        if (opts.beforeClose && opts.beforeClose(val, dlg) === false) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
        resolve(val);
      };
      (opts.buttons || [{ label: 'Close', value: null }]).forEach((b) => {
        const btn = TMD.el('button', { class: 'btn ' + (b.kind || '') }, TMD.esc(b.label));
        btn.addEventListener('click', () => close(b.value));
        foot.appendChild(btn);
      });
      dlg.querySelector('.modal-x').addEventListener('click', () => close(opts.dismissValue === undefined ? null : opts.dismissValue));
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(opts.dismissValue === undefined ? null : opts.dismissValue); }
        if (e.key === 'Tab') { // simple focus trap
          const f = TMD.$$('button,input,select,textarea,[tabindex]:not([tabindex="-1"]),a[href]', dlg).filter((x) => !x.disabled && x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      back.appendChild(dlg);
      host.appendChild(back);
      if (opts.onOpen) opts.onOpen(dlg, close);
      const first = dlg.querySelector('[autofocus]') || foot.querySelector('.btn.primary') || foot.querySelector('.btn');
      if (first) setTimeout(() => first.focus(), 30);
    });
  };
  TMD.confirm = (title, message, okLabel, kind) => TMD.modal({
    title, body: `<p>${TMD.escMultiline(message)}</p>`,
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, kind: kind || 'primary' }],
    dismissValue: false,
  });
  TMD.prompt = function (title, label, initial) {
    return TMD.modal({
      title,
      body: `<label class="field"><span>${TMD.esc(label)}</span><input type="text" class="inp" id="promptInp" value="${TMD.esc(initial || '')}" autofocus></label>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', kind: 'primary' }],
      onOpen: (dlg, close) => {
        const i = dlg.querySelector('#promptInp');
        setTimeout(() => { i.focus(); i.select(); }, 40);
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { dlg._val = i.value; close('ok'); } });
        dlg.addEventListener('input', () => { dlg._val = i.value; });
        dlg._val = i.value;
        TMD._promptDlg = dlg;
      },
    }).then((v) => (v === 'ok' ? TMD._promptDlg._val : null));
  };

  /* ---------------- Popover menus ---------------- */
  let openPop = null;
  TMD.closePopover = function () { if (openPop) { openPop.remove(); openPop = null; } };
  /** Show a popover anchored to an element. content: html string or Node. */
  TMD.popover = function (anchor, content, opts) {
    TMD.closePopover();
    const pop = TMD.el('div', { class: 'popover' + (opts && opts.cls ? ' ' + opts.cls : ''), role: 'menu' });
    if (typeof content === 'string') pop.innerHTML = content; else pop.appendChild(content);
    TMD.$('#popoverHost').appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = (opts && opts.alignRight) ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    openPop = pop;
    setTimeout(() => { const f = pop.querySelector('input,button,[tabindex]'); if (f && !(opts && opts.noFocus)) f.focus(); }, 20);
    return pop;
  };
  document.addEventListener('mousedown', (e) => {
    if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-pop-anchor]')) TMD.closePopover();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) TMD.closePopover(); });

  /** Simple action menu. items: [{label, icon, action, disabled, danger, sep}] */
  TMD.menu = function (anchor, items, opts) {
    const wrap = TMD.el('div', { class: 'menu' });
    items.forEach((it) => {
      if (it.sep) { wrap.appendChild(TMD.el('div', { class: 'menu-sep' })); return; }
      if (it.header) { wrap.appendChild(TMD.el('div', { class: 'menu-h' }, TMD.esc(it.header))); return; }
      const b = TMD.el('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem' });
      b.innerHTML = `${it.icon ? TMD.icon(it.icon) : '<span class="ico-sp"></span>'}<span>${TMD.esc(it.label)}</span>`;
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', () => { TMD.closePopover(); it.action && it.action(); });
      wrap.appendChild(b);
    });
    return TMD.popover(anchor, wrap, opts);
  };

  /* ---------------- Tooltip (for truncated values) ---------------- */
  let tipTimer = null;
  TMD.showTip = function (target, html) {
    const tip = TMD.$('#tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - tw - 10);
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 6) top = r.top - th - 6;
    tip.style.left = Math.max(6, left) + 'px';
    tip.style.top = Math.max(6, top) + 'px';
  };
  TMD.hideTip = () => { clearTimeout(tipTimer); TMD.$('#tooltip').hidden = true; };
  // Elements with data-tip get a styled tooltip; [data-trunc] only when truncated.
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip],[data-trunc]');
    if (!t) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      if (t.hasAttribute('data-tip')) { TMD.showTip(t, TMD.escMultiline(t.getAttribute('data-tip'))); return; }
      if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 2) {
        const full = t.getAttribute('data-full');
        TMD.showTip(t, TMD.escMultiline(full !== null ? full : t.textContent).slice(0, 4000));
      }
    }, 350);
  });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip],[data-trunc]')) TMD.hideTip(); });
  document.addEventListener('scroll', TMD.hideTip, true);

  /* ---------------- Misc ---------------- */
  TMD.groupCount = function (arr, keyFn) {
    const m = new Map();
    arr.forEach((x) => {
      const ks = keyFn(x);
      (Array.isArray(ks) ? ks : [ks]).forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    });
    return m;
  };
  TMD.sum = (arr, fn) => arr.reduce((s, x) => { const v = fn(x); return s + (typeof v === 'number' && isFinite(v) ? v : 0); }, 0);
  TMD.median = function (nums) {
    const a = nums.filter((n) => typeof n === 'number' && isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  TMD.plural = (n, w) => `${TMD.fmtInt(n)} ${w}${n === 1 ? '' : 's'}`;
})();
