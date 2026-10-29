/* =====================================================================
 * tender-table.js — Tender Register: configuration of the shared
 * spreadsheet-like grid (grid.js) for Tender Monitoring.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.tender;

  const GROUPS = {
    department: { label: 'Department', get: (r) => r.calc.department },
    capexRevex: { label: 'CAPEX / REVEX', get: (r) => r.calc.capexRevex },
    channel: { label: 'Procurement channel', get: (r) => r.calc.channel },
    stage: { label: 'Current stage', get: (r) => TMD.stageInfo(r.calc.stage).label },
    mgmt: { label: 'Management status', get: (r) => (r.calc.mgmt ? r.calc.mgmt.name : '') },
    officer: { label: 'Officer', get: (r) => r.calc.officer },
    initiator: { label: 'Tender initiator', get: (r) => r.calc.initiator },
    sheet: { label: 'Worksheet', get: (r) => r.sheet },
  };

  function renderCalc(col, rec) {
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
      const att = c.alerts.filter((a) => (a.upcoming || a.statusDue) && !a.silent);
      if (att.length) return `<span class="pill tone-amber" data-tip="${esc(att.map((a) => a.msg).join('\n'))}">${TMD.icon('alert')}Attention</span>`;
      return `<span class="pill tone-green">${TMD.icon('check')}On track</span>`;
    }
    if (col.id === '__mgmt') return c.mgmt ? `<span class="pill tone-${esc(c.mgmt.tone)}">${esc(c.mgmt.name)}</span>` : '';
    return undefined;
  }
  function sortKeyCalc(col, rec) {
    if (col.id === '__stage') return rec.calc.stage;
    if (col.id === '__delay') return rec.calc.delayed ? 0 : rec.calc.closed ? 2 : 1;
    return undefined;
  }
  function plainCalc(col, rec) {
    if (col.id === '__stage') return TMD.stageInfo(rec.calc.stage).label;
    if (col.id === '__delay') return rec.calc.delayLabel;
    return undefined;
  }
  function dateClass(col, rec, p) {
    const c = rec.calc;
    if (col.std === 'openingDate' && c.alerts.some((a) => a.type === 'Bid opening overdue')) return 'cell-overdue';
    if (col.std === 'nextActionDate' && p.date && !c.closed) {
      const d = TMD.daysBetween(TMD.today(), p.date);
      if (d < 0) return 'cell-overdue';
      if (d <= (+TMD.settings.get('thrNextAction') || 7)) return 'cell-soon';
    }
    return '';
  }

  TMD.table = TMD.createGrid({
    M,
    name: 'Tender register',
    printTitle: 'Tender Register',
    layoutPrefix: 'layout.',
    groups: GROUPS,
    groupSort: (g, keys) => (g === 'stage'
      ? keys.sort((a, b) => TMD.STAGES.findIndex((s) => s && s.label === a) - TMD.STAGES.findIndex((s) => s && s.label === b))
      : g === 'mgmt' ? keys.sort((a, b) => TMD.mgmtStatuses().findIndex((s) => s.name === a) - TMD.mgmtStatuses().findIndex((s) => s.name === b))
        : keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))),
    groupSummary: (list) => {
      const est = TMD.sum(list, (r) => (r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees));
      const delayed = list.filter((r) => r.calc.delayed).length;
      return `${est ? ' · Est. ' + esc(TMD.fmtMoney(est)) : ''}${delayed ? ` · <span class="txt-red">${delayed} delayed</span>` : ''}`;
    },
    renderCalc, sortKeyCalc, plainCalc, dateClass,
    dropdownStd: new Set(['channel', 'department', 'capexRevex', 'nature', 'initiator', 'statusFlag', 'quickStatus', 'officer', 'vendor']),
    rowMenuExtra: (rec) => [
      { label: 'Add follow-up note', icon: 'note', action: () => TMD.details.addFollowUp(rec) },
      { label: 'View history', icon: 'history', action: () => TMD.details.open(rec, { section: 'history' }) },
    ],
    openDetails: (rec, o) => TMD.details.open(rec, o),
    openText: (label, text, rec) => TMD.details.openText(label, text, rec),
    onSheets: () => TMD.manageSheets(M),
    onExport: (scope) => TMD.exporter.openDialog(scope),
  });
  TMD.grid = TMD.table.G; // backwards compatibility for tests/tools
})();
