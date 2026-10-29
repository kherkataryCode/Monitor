/* =====================================================================
 * cyber-audit-filters.js — independent filters for Cyber Security
 * Audits (cyberAuditFilters). Never shared with Tender filters.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const M = TMD.modules.cyber;
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const gs = (r, f) => str(TMD.getStd(r, f));
  const inWin = TMD.inWindow;
  const yesNo = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];
  const C = (r) => r.calc;

  const DEFS = [
    // Audit
    { id: 'auditName', label: 'Audit name', group: 'Audit', type: 'multi', get: (r) => C(r).auditName, needs: 'auditName' },
    { id: 'auditType', label: 'Audit type', group: 'Audit', type: 'multi', get: (r) => C(r).auditType, needs: 'auditType' },
    { id: 'agency', label: 'Audit agency', group: 'Audit', type: 'multi', get: (r) => C(r).agency, needs: 'auditAgency' },
    { id: 'auditYear', label: 'Audit year', group: 'Audit', type: 'multi', get: (r) => C(r).auditYear, needs: 'auditYear' },
    { id: 'auditRef', label: 'Audit reference / report no.', group: 'Audit', type: 'text', get: (r) => gs(r, 'auditRef') + ' ' + gs(r, 'reportNo') },
    { id: 'd_audit', label: 'Audit date', group: 'Audit', type: 'date', get: (r) => C(r).d.audit || C(r).d.report, needs: 'auditDate' },
    // Organisation
    { id: 'department', label: 'Department', group: 'Organisation', type: 'multi', get: (r) => C(r).department, needs: 'department' },
    { id: 'region', label: 'Region', group: 'Organisation', type: 'multi', get: (r) => C(r).region, needs: 'region' },
    { id: 'location', label: 'Location', group: 'Organisation', type: 'multi', get: (r) => C(r).location, needs: 'location' },
    { id: 'asset', label: 'Pipeline / installation', group: 'Organisation', type: 'multi', get: (r) => C(r).asset, needs: 'asset' },
    { id: 'system', label: 'System / application', group: 'Organisation', type: 'multi', get: (r) => C(r).system, needs: 'system' },
    // Security
    { id: 'severity', label: 'Severity (normalised)', group: 'Security', type: 'multi', get: (r) => C(r).severity, order: TMD.SEV_ORDER },
    { id: 'sevSource', label: 'Criticality / risk level (source)', group: 'Security', type: 'multi', get: (r) => C(r).severitySource },
    { id: 'domain', label: 'Cyber security domain', group: 'Security', type: 'multi', get: (r) => C(r).calcDomain },
    { id: 'otIt', label: 'OT / IT', group: 'Security', type: 'multi', get: (r) => C(r).otIt, needs: 'otIt' },
    { id: 'techProcess', label: 'Technical / process', group: 'Security', type: 'multi', get: (r) => gs(r, 'techProcess'), needs: 'techProcess' },
    { id: 'framework', label: 'Framework / standard', group: 'Security', type: 'multi', get: (r) => C(r).framework, needs: 'framework' },
    { id: 'clause', label: 'Clause / control', group: 'Security', type: 'text', get: (r) => C(r).clause, needs: 'clause' },
    { id: 'repeat', label: 'Repeat observation', group: 'Security', type: 'select', options: yesNo, test: (r, v) => (v === 'yes' ? C(r).repeat : !C(r).repeat) },
    // Action
    { id: 'owner', label: 'Action owner', group: 'Action', type: 'multi', get: (r) => C(r).owner, needs: 'owner' },
    { id: 'deptResp', label: 'Responsible department', group: 'Action', type: 'multi', get: (r) => C(r).deptResp },
    { id: 'cstatus', label: 'Calculated status', group: 'Action', type: 'multi', get: (r) => TMD.cstatusInfo(C(r).cstatus).label, order: TMD.CSTATUS.slice(1).map((s) => s.label) },
    { id: 'bucket', label: 'Open / In Progress / Closed', group: 'Action', type: 'multi', get: (r) => C(r).bucket, order: ['Open', 'In Progress', 'Closed'] },
    { id: 'origStatus', label: 'Current status (source)', group: 'Action', type: 'multi', get: (r) => C(r).originalStatus },
    { id: 'closureStatus', label: 'Closure status', group: 'Action', type: 'multi', get: (r) => gs(r, 'closureStatus'), needs: 'closureStatus' },
    { id: 'pendingWith', label: 'Pending with', group: 'Action', type: 'multi', get: (r) => C(r).pendingWith, needs: 'pendingWith' },
    { id: 'evidence', label: 'Evidence status', group: 'Action', type: 'multi', get: (r) => C(r).evidenceStatus },
    { id: 'verification', label: 'Verification status', group: 'Action', type: 'multi', get: (r) => C(r).verificationStatus, needs: 'verificationStatus' },
    // Dates
    { id: 'd_obs', label: 'Observation date', group: 'Dates', type: 'date', get: (r) => C(r).raised },
    { id: 'd_target', label: 'Target date', group: 'Dates', type: 'date', get: (r) => C(r).d.target, needs: 'targetDate' },
    { id: 'd_revised', label: 'Revised target date', group: 'Dates', type: 'date', get: (r) => C(r).d.revised, needs: 'revisedTarget' },
    { id: 'd_closure', label: 'Closure date', group: 'Dates', type: 'date', get: (r) => C(r).d.closure, needs: 'closureDate' },
    { id: 'd_lastFU', label: 'Last follow-up', group: 'Dates', type: 'date', get: (r) => C(r).d.lastFU, needs: 'lastFollowUp' },
    { id: 'd_nextFU', label: 'Next follow-up', group: 'Dates', type: 'date', get: (r) => C(r).d.nextFU, needs: 'nextFollowUp' },
    // Attention
    { id: 'attention', label: 'Attention', group: 'Attention', type: 'multi', options: ['Overdue', 'Critical open', 'High open', 'Due in 7 days', 'Due in 30 days', 'Evidence pending', 'Verification pending', 'Awaiting closure', 'No owner', 'No target date', 'Revised target', 'Repeat finding', 'Escalation required', 'Open (not closed)'],
      anyTest: (r, vals) => vals.some((v) => TMD.cyberAttentionTest(r, v)) },
    { id: 'kpi', label: 'Dashboard indicator', group: 'Attention', type: 'select', hidden: true, options: [], test: (r, v) => TMD.cyberKpiTest(r, v) },
    { id: 'dq', label: 'Data quality warnings', group: 'Attention', type: 'select', options: [{ v: 'any', label: 'Any warning' }, { v: 'high', label: 'High severity' }, { v: 'none', label: 'No warnings' }], test: (r, v) => (v === 'any' ? C(r).dq.length > 0 : v === 'high' ? C(r).dqHigh : C(r).dq.length === 0) },
    { id: 'edited', label: 'Edited records only', group: 'Attention', type: 'select', options: [{ v: 'yes', label: 'Edited / added in this app' }], test: (r) => r.edited || r.isNew },
  ];

  TMD.cyberAttentionTest = function (r, v) {
    const c = r.calc;
    switch (v) {
      case 'Overdue': return c.overdue;
      case 'Critical open': return c.open && c.severity === 'Critical';
      case 'High open': return c.open && c.severity === 'High';
      case 'Due in 7 days': return c.open && !c.overdue && inWin(c.effTarget, 7);
      case 'Due in 30 days': return c.open && !c.overdue && inWin(c.effTarget, 30);
      case 'Evidence pending': return c.evidencePending;
      case 'Verification pending': return c.verificationPending;
      case 'Awaiting closure': return c.awaitingClosure;
      case 'No owner': return c.open && TMD.hasStd(r, 'owner') && !c.owner;
      case 'No target date': return c.open && !c.effTarget;
      case 'Revised target': return c.hasRevised;
      case 'Repeat finding': return c.repeat;
      case 'Escalation required': return c.open && c.escalation;
      case 'Open (not closed)': return c.open;
      default: return false;
    }
  };

  TMD.cyber.filters = TMD.createFilters(M, DEFS, {
    placeholder: 'Search observations — ID, audit, location, owner, finding…',
    presetKey: 'cyber.presets',
    searchExtra: (r) => [r.calc.statusLabel, r.calc.severity, r.calc.calcDomain],
  });
})();
