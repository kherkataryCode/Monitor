/* =====================================================================
 * modules.js — registry of independent application modules.
 * Each module (Tender Monitoring, Cyber Security Audits) owns its own
 * dataset, filters, table configuration, edit controller, audit log and
 * local storage slots. Nothing is shared except the UI infrastructure.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  TMD.modules = {};
  TMD.registerModule = function (m) { TMD.modules[m.id] = m; return m; };
  TMD.moduleOf = (rec) => TMD.modules[(rec && rec.mod) || 'tender'];

  /* Tender Monitoring — wraps the original application objects (behaviour unchanged). */
  TMD.registerModule({
    id: 'tender',
    label: 'Tender Monitoring',
    noun: 'tender', nounPlural: 'tenders',
    state: TMD.state,                       // tenderData
    slots: { working: 'working', recovery: 'recovery', meta: 'recoveryMeta' },
    pages: ['dashboard', 'register', 'timeline', 'analytics', 'alerts', 'reports'],
    get mapper() { return TMD.tenderMapper; },
    get audit() { return TMD.audit; },
    get edit() { return TMD.editMode; },
    get filters() { return TMD.filters; },  // tenderFilters
    get grid() { return TMD.table; },
    recalcAll: () => TMD.recalcAll(),
    recalcRecord: (r) => TMD.recalcRecord(r),
    buildColumns: () => TMD.buildColumns(),
    colValue: (c, r) => TMD.colValue(c, r),
    install: (wb, active) => TMD.installWorkbook(wb, active),
    setActiveSheets: (n) => TMD.setActiveSheets(n),
    openDetails: (rec, o) => TMD.details.open(rec, o),
    loadDemo: () => TMD.loadDemo(),
    isRelevantSheet: (s) => /tracker|monitoring|tender list/i.test(s.sheetType),
    preselect(raw) {
      const def = TMD.settings.get('defaultSheet');
      if (def && raw.sheets[def]) return [def];
      return ['Capex', 'REVEX 2026'].filter((n) => raw.sheets[n]);
    },
    compatFields: ['channel', 'department', 'prNo', 'prSentDate', 'jobDescription', 'crfq', 'floatDate', 'openingDate', 'techEvalDate', 'poNo', 'awardDate', 'validity', 'vendor'],
  });
})();
