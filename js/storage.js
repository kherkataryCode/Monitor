/* =====================================================================
 * storage.js — local persistence only (IndexedDB + localStorage).
 * Nothing is ever transmitted off this device.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  /* ---------------- localStorage (small settings / layouts / presets) ---------------- */
  const LS_PREFIX = 'tmd.';
  TMD.ls = {
    get(key, fallback) {
      try {
        const v = window.localStorage.getItem(LS_PREFIX + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; }
      catch (e) { console.warn('localStorage unavailable', e); return false; }
    },
    remove(key) { try { window.localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* ignore */ } },
    clearAll() {
      try {
        Object.keys(window.localStorage).filter((k) => k.indexOf(LS_PREFIX) === 0).forEach((k) => window.localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    },
  };

  /* ---------------- Settings ---------------- */
  const DEFAULTS = {
    title: 'Tender Monitoring Dashboard',
    orgName: 'BPCL Pipelines',
    logo: '',                       // data: URL of a locally chosen image
    theme: 'light',                 // light | dark | system
    defaultSheet: '',               // preferred worksheet on import
    dateFormat: 'dd/mm/yyyy',
    fyStartMonth: 4,                // April
    currency: '₹',
    amountUnit: 'lakh',             // rupees | lakh | crore
    density: 'comfortable',         // compact | comfortable | wrap
    frozenCols: 2,
    persistence: true,              // IndexedDB working copy + recovery
    // Units for amount columns whose header does not state a unit
    unitProjectCost: 'lakh',
    unitBE: 'lakh',
    unitCashOutflow: 'rupees',
    unitEstCost: 'lakh',
    // Alert thresholds (days)
    thrOpeningSoon: 7,
    thrTechEval: 30,
    thrPriceBid: 15,
    thrAward: 30,
    thrPrToPo: 120,
    thrNotFloated: 45,
    thrValidity: 60,
    thrCapexFinish: 30,
    thrFat: 90,
    thrDelivery: 60,
    thrInstall: 45,
    thrUpcoming: 30,
    thrNextAction: 7,
    thrStale: 30,
    mgmtStatuses: null,           // null → defaults (see calculations.js)
    mgmtDelayedTo: 'attention',   // show delayed tenders under this management status ('' = off)
    navExpanded: false,
    cyberFrozenCols: 3,
    cyberThrTarget: 30,           // "target date approaching" window (days)
    cyberThrLongOpen: 90,         // "long pending" age threshold (days)
    cyberSuggest: false,          // show suggested severity / domain (clearly marked, never saved)
    cyberDefaultSheet: '',
    cyberDomains: null,
    cyberAuditTypes: null,
    csvProtect: true,
  };
  let current = Object.assign({}, DEFAULTS, TMD.ls.get('settings', {}));

  TMD.settings = {
    DEFAULTS,
    get: (k) => current[k],
    all: () => Object.assign({}, current),
    set(k, v) { current[k] = v; TMD.ls.set('settings', current); TMD.emit('settings', { key: k, value: v }); },
    setMany(obj) { Object.assign(current, obj); TMD.ls.set('settings', current); TMD.emit('settings', { many: obj }); },
    reset() { current = Object.assign({}, DEFAULTS); TMD.ls.set('settings', current); TMD.emit('settings', { reset: true }); },
  };

  /* ---------------- IndexedDB key/value store ---------------- */
  const DB_NAME = 'tender-monitoring-local';
  const STORE = 'kv';
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (!window.indexedDB) { resolve(null); return; }
        const req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { console.warn('IndexedDB unavailable', req.error); resolve(null); };
        req.onblocked = () => resolve(null);
      } catch (e) { console.warn('IndexedDB unavailable', e); resolve(null); }
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      if (!db) { resolve(undefined); return; }
      let result;
      try {
        const t = db.transaction(STORE, mode);
        const s = t.objectStore(STORE);
        const r = fn(s);
        if (r) r.onsuccess = () => { result = r.result; };
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } catch (e) { reject(e); }
    }));
  }

  TMD.idb = {
    available: () => openDb().then((db) => !!db),
    get: (key) => tx('readonly', (s) => s.get(key)),
    set: (key, value) => tx('readwrite', (s) => s.put(value, key)),
    del: (key) => tx('readwrite', (s) => s.delete(key)),
    clear: () => tx('readwrite', (s) => s.clear()),
  };

  /* ---------------- Workbook (de)serialisation for local working copies ---------------- */
  /** Strip non-cloneable / derived data (calc cache) before persisting. */
  TMD.serialiseWorkbook = function (wb) {
    if (!wb) return null;
    const out = Object.assign({}, wb, { sheets: {} });
    Object.keys(wb.sheets).forEach((name) => {
      const sh = wb.sheets[name];
      out.sheets[name] = Object.assign({}, sh, {
        rows: sh.rows.map((r) => ({
          id: r.id, mod: r.mod, sheet: r.sheet, rowNum: r.rowNum, values: r.values, dateHints: r.dateHints,
          edited: r.edited, editedKeys: r.editedKeys, isNew: r.isNew, override: r.override, followUps: r.followUps,
        })),
      });
    });
    return out;
  };

  /** Save a module's working copy. slot e.g. 'working' / 'recovery' (tender) or 'cyber-working'. M defaults to Tender. */
  TMD.saveWorkingCopy = async function (slot, M) {
    if (!TMD.settings.get('persistence')) return false;
    const mod = M || (TMD.modules && TMD.modules.tender);
    const st = mod ? mod.state : TMD.state;
    if (!st.workbook) return false;
    const payload = {
      savedAt: Date.now(),
      workbook: TMD.serialiseWorkbook(st.workbook),
      activeSheets: st.activeSheets.slice(),
      audit: mod ? mod.audit.all() : TMD.audit.all(),
      version: 1,
    };
    try { await TMD.idb.set(slot || 'working', payload); return true; }
    catch (e) { console.error(e); TMD.toast('Could not write to local browser storage: ' + e.message, 'error'); return false; }
  };
})();
