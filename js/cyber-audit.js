/* =====================================================================
 * cyber-audit.js — Cyber Security Audit Monitoring: data model,
 * column mapping and module registration.
 *
 * Completely independent from Tender Monitoring:
 *   cyberAuditData  → TMD.cyber.state
 *   own mapper, filters, grid layout, edit controller, change log and
 *   IndexedDB slots ('cyber-working', 'cyber-recovery').
 * Imported source columns are preserved exactly; mapping is internal.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  /* ---------------- Standard audit fields (none is mandatory) ---------------- */
  const F = (label, type, group) => ({ label, type, group });
  const STD = {
    srNo: F('Sr. No.', 'text', 'Identification'),
    auditName: F('Audit Name', 'cat', 'Identification'),
    auditType: F('Audit Type', 'cat', 'Identification'),
    auditAgency: F('Audit Agency', 'cat', 'Identification'),
    auditYear: F('Audit Year', 'cat', 'Identification'),
    auditRef: F('Audit Reference No.', 'id', 'Identification'),
    reportNo: F('Audit Report No.', 'id', 'Identification'),
    auditDate: F('Audit Date', 'date', 'Identification'),
    reportDate: F('Report Date', 'date', 'Identification'),
    department: F('Department', 'cat', 'Identification'),
    region: F('Region', 'cat', 'Identification'),
    location: F('Location', 'cat', 'Identification'),
    asset: F('Pipeline / Installation / Asset', 'cat', 'Identification'),
    system: F('System / Application', 'cat', 'Identification'),
    assetCategory: F('Asset Category', 'cat', 'Identification'),
    coordinator: F('Audit Coordinator', 'cat', 'Identification'),
    obsId: F('Observation ID', 'id', 'Observation'),
    obsNo: F('Observation No.', 'id', 'Observation'),
    obsDate: F('Observation Date', 'date', 'Observation'),
    observation: F('Observation', 'longtext', 'Observation'),
    finding: F('Audit Finding', 'longtext', 'Observation'),
    obsDescription: F('Observation Description', 'longtext', 'Observation'),
    gap: F('Vulnerability / Gap', 'longtext', 'Observation'),
    recommendation: F('Audit Recommendation', 'longtext', 'Observation'),
    auditorRecommendation: F('Auditor Recommendation', 'longtext', 'Observation'),
    evidenceRef: F('Evidence / Reference', 'longtext', 'Observation'),
    framework: F('Framework / Standard', 'cat', 'Classification'),
    clause: F('Clause / Control Reference', 'text', 'Classification'),
    controlDesc: F('Control Description', 'longtext', 'Classification'),
    criticality: F('Criticality', 'cat', 'Classification'),
    severity: F('Severity', 'cat', 'Classification'),
    riskRating: F('Risk Rating', 'cat', 'Classification'),
    riskLevel: F('Risk Level', 'cat', 'Classification'),
    obsCategory: F('Observation Category', 'cat', 'Classification'),
    domain: F('Cyber Security Domain', 'cat', 'Classification'),
    complianceCategory: F('Compliance Category', 'cat', 'Classification'),
    otIt: F('OT / IT', 'cat', 'Classification'),
    techProcess: F('Technical / Process', 'cat', 'Classification'),
    repeat: F('Repeat Observation', 'cat', 'Classification'),
    regulatory: F('Regulatory / Internal', 'cat', 'Classification'),
    actionRequired: F('Action Required', 'longtext', 'Action'),
    correctiveAction: F('Corrective Action', 'longtext', 'Action'),
    remediationPlan: F('Remediation Plan', 'longtext', 'Action'),
    owner: F('Action Owner', 'cat', 'Action'),
    deptResponsible: F('Department Responsible', 'cat', 'Action'),
    targetDate: F('Target Date', 'date', 'Action'),
    revisedTarget: F('Revised Target Date', 'date', 'Action'),
    actionTaken: F('Action Taken', 'longtext', 'Progress'),
    currentStatus: F('Current Status', 'cat', 'Progress'),
    closureStatus: F('Closure Status', 'cat', 'Closure'),
    closureDate: F('Closure Date', 'date', 'Closure'),
    closureRemarks: F('Closure Remarks', 'longtext', 'Closure'),
    evidenceSubmitted: F('Evidence Submitted', 'cat', 'Closure'),
    evidenceStatus: F('Evidence Status', 'cat', 'Closure'),
    verificationStatus: F('Auditor Verification Status', 'cat', 'Closure'),
    verifiedBy: F('Verified By', 'cat', 'Closure'),
    verificationDate: F('Verification Date', 'date', 'Closure'),
    closureApproval: F('Closure Approval', 'cat', 'Closure'),
    mgmtResponse: F('Management Response', 'longtext', 'Follow-up'),
    remarks: F('Remarks', 'longtext', 'Follow-up'),
    lastFollowUp: F('Last Follow-up Date', 'date', 'Follow-up'),
    nextFollowUp: F('Next Follow-up Date', 'date', 'Follow-up'),
    escalation: F('Escalation Required', 'cat', 'Follow-up'),
    escalationLevel: F('Escalation Level', 'cat', 'Follow-up'),
    dependency: F('Dependency', 'longtext', 'Follow-up'),
    pendingWith: F('Pending With', 'cat', 'Follow-up'),
  };

  // Ordered header-recognition rules (first match wins).
  const RULES = [
    [/^(s\.?\s*r\.?|sl\.?|s\.)\s*no\.?$|^sr\.?\s*no|^serial\s*no/, 'srNo'],
    [/audit\s*report\s*(no|number|ref)|^report\s*(no|number)/, 'reportNo'],
    [/audit\s*(ref|reference)/, 'auditRef'],
    [/report\s*date|date\s*of\s*report/, 'reportDate'],
    [/audit\s*date|date\s*of\s*audit|audit\s*conducted\s*on/, 'auditDate'],
    [/observation\s*date|date\s*of\s*observation|raised\s*on|reported\s*on/, 'obsDate'],
    [/audit\s*year|^year$|^fy$/, 'auditYear'],
    [/audit\s*type|type\s*of\s*audit|assessment\s*type/, 'auditType'],
    [/audit\s*agency|auditor\s*(name|agency)|^agency|audited\s*by|audit\s*firm/, 'auditAgency'],
    [/coordinator|nodal\s*officer/, 'coordinator'],
    [/audit\s*name|^audit$|audit\s*title|name\s*of\s*(the\s*)?audit/, 'auditName'],
    [/dep(t|artment)\s*responsible|responsible\s*dep/, 'deptResponsible'],
    [/^dep(t|artment)\b/, 'department'],
    [/^region|^zone/, 'region'],
    [/asset\s*(category|type)/, 'assetCategory'],
    [/pipeline|installation|^asset$|asset\s*name/, 'asset'],
    [/^location|^site\b|^station/, 'location'],
    [/system|application/, 'system'],
    [/observation\s*(id|ref)|obs\.?\s*id|finding\s*id/, 'obsId'],
    [/observation\s*(no|number|#)|obs\.?\s*no/, 'obsNo'],
    [/observation\s*category|finding\s*category/, 'obsCategory'],
    [/observation\s*desc|^description/, 'obsDescription'],
    [/vulnerab|^gap/, 'gap'],
    [/auditor'?s?\s*recommend/, 'auditorRecommendation'],
    [/recommend/, 'recommendation'],
    [/audit\s*finding|^finding/, 'finding'],
    [/^observation|observation\s*details/, 'observation'],
    [/evidence\s*(\/\s*)?ref/, 'evidenceRef'],
    [/control\s*desc|clause\s*desc/, 'controlDesc'],
    [/clause|control\s*(ref|reference|no|id)|^control$/, 'clause'],
    [/framework|standard/, 'framework'],
    [/criticality/, 'criticality'],
    [/severity/, 'severity'],
    [/risk\s*rating/, 'riskRating'],
    [/risk\s*level|^risk$/, 'riskLevel'],
    [/cyber\s*(security\s*)?domain|^domain|security\s*domain/, 'domain'],
    [/compliance\s*category/, 'complianceCategory'],
    [/ot\s*\/\s*it|it\s*\/\s*ot/, 'otIt'],
    [/technical\s*\/\s*process|process\s*\/\s*technical/, 'techProcess'],
    [/repeat/, 'repeat'],
    [/regulatory|internal\s*\/\s*external/, 'regulatory'],
    [/action\s*required|required\s*action/, 'actionRequired'],
    [/corrective\s*action/, 'correctiveAction'],
    [/remediation\s*plan|action\s*plan/, 'remediationPlan'],
    [/action\s*owner|^owner|^responsib|assigned\s*to/, 'owner'],
    [/revised\s*(target|due|completion)/, 'revisedTarget'],
    [/target\s*date|due\s*date|target\s*completion/, 'targetDate'],
    [/closure\s*status/, 'closureStatus'],
    [/closure\s*date|closed\s*on|date\s*of\s*closure/, 'closureDate'],
    [/closure\s*remark/, 'closureRemarks'],
    [/closure\s*approval|approved\s*for\s*closure/, 'closureApproval'],
    [/evidence\s*submitted|evidence\s*provided/, 'evidenceSubmitted'],
    [/evidence\s*status/, 'evidenceStatus'],
    [/verification\s*status|auditor\s*verification/, 'verificationStatus'],
    [/verification\s*date|date\s*of\s*verification|verified\s*on/, 'verificationDate'],
    [/verified\s*by/, 'verifiedBy'],
    [/action\s*taken|^progress|work\s*done/, 'actionTaken'],
    [/current\s*status|^status$|compliance\s*status|observation\s*status/, 'currentStatus'],
    [/management\s*(response|comment)/, 'mgmtResponse'],
    [/last\s*follow/, 'lastFollowUp'],
    [/next\s*follow/, 'nextFollowUp'],
    [/escalation\s*level/, 'escalationLevel'],
    [/escalat/, 'escalation'],
    [/dependen/, 'dependency'],
    [/pending\s*(with|at)|lying\s*with/, 'pendingWith'],
    [/^remarks?/, 'remarks'],
  ];
  const DATE_STD = new Set(Object.keys(STD).filter((k) => STD[k].type === 'date'));
  const ID_STD = new Set(['srNo', 'auditRef', 'reportNo', 'obsId', 'obsNo']);

  function recognise(name, mapping) {
    const has = (f) => !!mapping[f];
    const core = ['observation', 'finding', 'obsDescription', 'obsId', 'severity', 'criticality', 'currentStatus', 'targetDate', 'owner', 'recommendation', 'auditName'].filter(has).length;
    if (core >= 4) return 'Cyber audit observations';
    if (core >= 2) return 'Audit list (partial)';
    return 'Utility / other sheet';
  }

  TMD.cyberMapper = TMD.makeMapper({ id: 'cyber', STD, rules: RULES, idStd: ID_STD, dateStd: DATE_STD, msStd: new Set(), recognise, dupMap: { remarks: 'closureRemarks' } });
  TMD.CYBER_STD = STD;

  /* ---------------- Configurable vocabularies ---------------- */
  TMD.CYBER_DOMAINS_DEFAULT = ['Network Security', 'OT / ICS Security', 'SCADA Security', 'PLC / RTU Security', 'Endpoint Security', 'Server Security', 'Identity & Access Management', 'Privileged Access', 'Password Management', 'Firewall', 'Network Segmentation', 'Vulnerability Management', 'Patch Management', 'Malware Protection', 'Backup & Recovery', 'Logging & Monitoring', 'SIEM', 'Incident Response', 'Asset Management', 'Configuration Management', 'Remote Access', 'Vendor / Third-Party Access', 'USB / Removable Media', 'Application Security', 'Database Security', 'Physical Security', 'Business Continuity', 'Disaster Recovery', 'Policy / Procedure', 'Governance', 'Risk Management', 'Compliance', 'Other'];
  TMD.CYBER_AUDIT_TYPES_DEFAULT = ['Internal Cyber Security Audit', 'C-DAC Audit', 'CERT-In related assessment', 'VAPT', 'OT Security Assessment', 'IS Audit', 'Internal Audit', 'External Audit', 'OEM Security Assessment'];
  TMD.cyberDomains = () => { const v = TMD.settings.get('cyberDomains'); return Array.isArray(v) && v.length ? v : TMD.CYBER_DOMAINS_DEFAULT; };
  TMD.cyberAuditTypes = () => { const v = TMD.settings.get('cyberAuditTypes'); return Array.isArray(v) && v.length ? v : TMD.CYBER_AUDIT_TYPES_DEFAULT; };

  /* ---------------- Module state & registration (cyberAuditData) ---------------- */
  const state = { workbook: null, activeSheets: [], records: [], filtered: [], columns: [], mode: 'view', dirty: false, selection: new Set(), lastLocalSave: null };
  TMD.cyber = { state };

  const CYBER_CALC = [
    { id: '__cstatus', label: 'Calculated Status', type: 'cstatus', width: 200 },
    { id: '__sev', label: 'Severity (normalised)', type: 'sev', width: 128 },
    { id: '__due', label: 'Due / Overdue', type: 'due', width: 132 },
  ];
  const CYBER_EXTRA = [
    { id: '__orig', label: 'Original Status', type: 'text', w: 180, get: (c) => c.originalStatus },
    { id: '__bucket', label: 'Open / In Progress / Closed', type: 'text', w: 150, get: (c) => c.bucket },
    { id: '__domain', label: 'Calculated Cyber Domain', type: 'text', w: 190, get: (c) => c.calcDomain + (c.domainSource === 'keywords' ? ' (suggested)' : '') },
    { id: '__effTarget', label: 'Effective Target Date', type: 'text', w: 130, get: (c) => (c.effTarget ? TMD.fmtDate(c.effTarget) : '') },
    { id: '__daysOver', label: 'Days Overdue', type: 'int', w: 110, get: (c) => (c.daysOverdue > 0 ? c.daysOverdue : null) },
    { id: '__daysRemain', label: 'Days Remaining', type: 'int', w: 110, get: (c) => c.daysRemaining },
    { id: '__age', label: 'Observation Age (days)', type: 'int', w: 130, get: (c) => c.age },
    { id: '__ageBucket', label: 'Aging Bucket', type: 'text', w: 120, get: (c) => c.ageBucket },
    { id: '__closureDur', label: 'Closure Duration (days)', type: 'int', w: 140, get: (c) => c.closureDuration },
    { id: '__suggested', label: 'Suggested Severity', type: 'text', w: 140, get: (c) => (c.suggestedSeverity ? c.suggestedSeverity + ' (Suggested)' : '') },
    { id: '__attention', label: 'Management Attention', type: 'longtext', w: 240, get: (c) => c.attention.join('; ') },
    { id: '__reason', label: 'Status Reason', type: 'longtext', w: 260, get: (c) => c.statusReason },
    { id: '__dq', label: 'Data Quality Score', type: 'int', w: 110, get: (c) => c.dqScore },
  ];
  TMD.CYBER_EXTRA = CYBER_EXTRA;
  // Recommended column order (when the fields exist)
  const PREFERRED = ['srNo', 'obsId', 'auditName', 'location', '__sev', '__cstatus', 'currentStatus', '__due'];

  function buildColumns() {
    const src = TMD.sourceColumns(state);
    const calc = CYBER_CALC.map((c) => ({ id: c.id, label: c.label, kind: 'calc', type: c.type, width: c.width, keepWithSource: true }));
    const all = calc.concat(src);
    const pick = [];
    PREFERRED.forEach((p) => { const c = all.find((x) => (p.indexOf('__') === 0 ? x.id === p : x.std === p)); if (c && pick.indexOf(c) < 0) pick.push(c); });
    const rest = all.filter((c) => pick.indexOf(c) < 0);
    if (state.activeSheets.length > 1) pick.splice(1, 0, { id: '__sheet', label: 'Worksheet', kind: 'calc', type: 'text', width: 120, get: (c, r) => r.sheet });
    state.columns = pick.concat(rest).concat(CYBER_EXTRA.map((c) => ({ id: c.id, label: c.label, kind: 'calc', type: c.type, width: c.w, get: c.get, hiddenByDefault: true })));
  }
  function colValue(col, rec) {
    if (col.kind === 'source') { const k = col.keysBySheet[rec.sheet]; return k === undefined ? undefined : rec.values[k]; }
    if (col.get) return col.get(rec.calc, rec);
    const c = rec.calc;
    if (col.id === '__cstatus') return c.statusLabel;
    if (col.id === '__sev') return c.severity;
    if (col.id === '__due') return c.dueLabel;
    return undefined;
  }
  function install(wb, active) {
    state.workbook = wb;
    state.selection.clear();
    const valid = (active || []).filter((n) => wb.sheets[n]);
    setActiveSheets(valid.length ? valid : wb.loadOrder.slice(0, 1));
  }
  function setActiveSheets(names) {
    state.activeSheets = names.filter((n) => state.workbook.sheets[n]);
    state.records = [];
    state.activeSheets.forEach((n) => { state.records = state.records.concat(state.workbook.sheets[n].rows); });
    buildColumns();
    TMD.cyberRecalcAll();
    TMD.emit('data', { module: 'cyber' });
  }

  TMD.cyber.audit = TMD.createAuditLog('cyber');
  TMD.registerModule({
    id: 'cyber',
    label: 'Cyber Security Audits',
    noun: 'observation', nounPlural: 'observations',
    state,
    slots: { working: 'cyber-working', recovery: 'cyber-recovery', meta: 'cyber-recoveryMeta' },
    pages: ['cyber', 'cyber-register', 'cyber-actions', 'cyber-analytics', 'cyber-alerts'],
    mapper: TMD.cyberMapper,
    get audit() { return TMD.cyber.audit; },
    get edit() { return TMD.cyber.edit; },
    get filters() { return TMD.cyber.filters; },
    get grid() { return TMD.cyber.grid; },
    recalcAll: () => TMD.cyberRecalcAll(),
    recalcRecord: (r) => TMD.cyberRecalcRecord(r),
    buildColumns, colValue, install, setActiveSheets,
    openDetails: (rec, o) => TMD.cyber.details.open(rec, o),
    loadDemo: () => TMD.cyber.loadDemo(),
    isRelevantSheet: (s) => /cyber audit|audit list/i.test(s.sheetType),
    preselect(raw, summaries) {
      const def = TMD.settings.get('cyberDefaultSheet');
      if (def && raw.sheets[def]) return [def];
      return raw.sheetNames.filter((n) => summaries && /cyber audit/i.test(summaries[n].sheetType)).slice(0, 1);
    },
    compatFields: ['observation', 'severity', 'currentStatus', 'targetDate', 'owner', 'location', 'auditName', 'obsId'],
  });
})();
