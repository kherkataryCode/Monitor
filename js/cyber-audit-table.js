/* =====================================================================
 * cyber-audit-table.js — AUDIT OBSERVATION REGISTER: the shared
 * spreadsheet-like grid configured for cyber audit observations
 * (independent layout, sorting, header filters and selection).
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;

  const GROUPS = {
    severity: { label: 'Severity', get: (r) => r.calc.severity },
    cstatus: { label: 'Calculated status', get: (r) => TMD.cstatusInfo(r.calc.cstatus).label },
    bucket: { label: 'Open / In Progress / Closed', get: (r) => r.calc.bucket },
    auditName: { label: 'Audit', get: (r) => r.calc.auditName },
    location: { label: 'Location', get: (r) => r.calc.location },
    department: { label: 'Responsible department', get: (r) => r.calc.deptResp },
    owner: { label: 'Action owner', get: (r) => r.calc.owner },
    pendingWith: { label: 'Pending with', get: (r) => r.calc.pendingWith },
    domain: { label: 'Cyber domain', get: (r) => r.calc.calcDomain },
    otIt: { label: 'OT / IT', get: (r) => r.calc.otIt },
  };
  function renderCalc(col, rec) {
    const c = rec.calc;
    if (col.id === '__cstatus') {
      const extra = c.overridden ? `<span class="mini-flag" data-tip="Manual override">${TMD.icon('edit')}</span>` : '';
      return `<span data-tip="${esc(c.statusReason)}">${TMD.cstatusBadge(c.cstatus)}</span>${extra}`;
    }
    if (col.id === '__sev') return TMD.sevBadge(c.severity) + (c.suggestedSeverity ? ` <span class="tag" data-tip="Suggested from text — not saved to the source">${esc(c.suggestedSeverity)}?</span>` : '');
    if (col.id === '__due') {
      if (c.closed) return `<span class="pill tone-grey">${TMD.icon('check')}Closed</span>`;
      if (c.overdue) return `<span class="pill tone-red">${TMD.icon('clock')}${c.daysOverdue} d overdue</span>`;
      if (c.daysRemaining !== null) return `<span class="pill ${c.daysRemaining <= 7 ? 'tone-amber' : 'tone-green'}">${TMD.icon('calendar')}${c.daysRemaining === 0 ? 'Due today' : 'Due in ' + c.daysRemaining + ' d'}</span>`;
      return `<span class="pill tone-grey">${TMD.icon('help')}No target</span>`;
    }
    return undefined;
  }
  const SEVN = { Critical: 0, High: 1, Medium: 2, Low: 3, Unclassified: 4 };
  function sortKeyCalc(col, rec) {
    const c = rec.calc;
    if (col.id === '__cstatus') return c.cstatus;
    if (col.id === '__sev') return SEVN[c.severity];
    if (col.id === '__due') return c.closed ? 99999 : c.overdue ? -c.daysOverdue : c.daysRemaining !== null ? c.daysRemaining : 99998;
    return undefined;
  }
  function plainCalc(col, rec) {
    if (col.id === '__cstatus') return rec.calc.statusLabel;
    if (col.id === '__sev') return rec.calc.severity;
    if (col.id === '__due') return rec.calc.dueLabel;
    return undefined;
  }
  function dateClass(col, rec, p) {
    const c = rec.calc;
    if ((col.std === 'targetDate' || col.std === 'revisedTarget') && !c.closed && p.date) {
      if (p.date < TMD.today() && (col.std === 'revisedTarget' || !c.hasRevised)) return 'cell-overdue';
      if (TMD.daysBetween(TMD.today(), p.date) <= 7 && p.date >= TMD.today()) return 'cell-soon';
    }
    return '';
  }
  function renderSource(col, rec, v, text, term) {
    if (col.std === 'severity' || col.std === 'criticality' || col.std === 'riskLevel') return `<span class="sev-text sev-${TMD.sevTone(rec.calc.severity)}">${TMD.highlight(text, term)}</span>`;
    return undefined;
  }

  TMD.cyber.grid = TMD.createGrid({
    M,
    name: 'Audit observation register',
    printTitle: 'Audit Observation Register',
    layoutPrefix: 'cyber.layout.',
    densityKey: 'density',
    frozenKey: 'cyberFrozenCols',
    groups: GROUPS,
    groupSort: (g, keys) => (g === 'severity' ? keys.sort((a, b) => (SEVN[a] === undefined ? 9 : SEVN[a]) - (SEVN[b] === undefined ? 9 : SEVN[b]))
      : g === 'cstatus' ? keys.sort((a, b) => TMD.CSTATUS.findIndex((s) => s && s.label === a) - TMD.CSTATUS.findIndex((s) => s && s.label === b))
        : keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))),
    groupSummary: (list) => {
      const open = list.filter((r) => r.calc.open).length, od = list.filter((r) => r.calc.overdue).length;
      return ` · ${open} open${od ? ` · <span class="txt-red">${od} overdue</span>` : ''}`;
    },
    renderCalc, sortKeyCalc, plainCalc, dateClass, renderSource,
    dropdownStd: new Set(['currentStatus', 'closureStatus', 'evidenceStatus', 'evidenceSubmitted', 'verificationStatus', 'pendingWith', 'owner', 'deptResponsible', 'severity', 'criticality', 'riskLevel', 'riskRating', 'location', 'region', 'department', 'domain', 'otIt', 'repeat', 'escalation', 'auditName', 'auditType', 'auditAgency', 'closureApproval']),
    rowMenuExtra: (rec) => [
      { label: 'Quick update…', icon: 'zap', action: () => TMD.cyber.details.quickUpdate(rec) },
      { label: 'Add follow-up note', icon: 'note', action: () => TMD.cyber.details.addFollowUp(rec) },
      { label: 'Change history', icon: 'history', action: () => TMD.cyber.details.open(rec, { section: 'history' }) },
    ],
    openDetails: (rec, o) => TMD.cyber.details.open(rec, o),
    openText: (label, text, rec) => TMD.details.openText(label, text, rec),
    onSheets: () => TMD.manageSheets(M),
    onExport: (scope) => TMD.cyber.exporter.openDialog(scope === 'selected' ? 'selected' : 'filtered'),
  });
})();
