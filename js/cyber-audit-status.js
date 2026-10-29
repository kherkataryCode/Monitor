/* =====================================================================
 * cyber-audit-status.js — calculated lifecycle status, overdue, aging,
 * severity / domain normalisation, alerts and management-attention rules
 * for audit observations. The imported status is always preserved as
 * "Original Status"; everything here is calculated separately.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /* ---------------- Calculated status model ---------------- */
  const S = (n, label, tone, icon, bucket, step) => ({ n, label, tone, icon, bucket, step });
  const CSTATUS = [null,
    S(1, 'New Observation', 'grey', 'note', 'Open', 1),
    S(2, 'Under Review', 'grey', 'search', 'Open', 1),
    S(3, 'Action Plan Pending', 'amber', 'clock', 'Open', 1),
    S(4, 'Action Plan Submitted', 'blue', 'file', 'In Progress', 2),
    S(5, 'Remediation In Progress', 'blue', 'wrench', 'In Progress', 2),
    S(6, 'Action Completed', 'teal', 'check', 'In Progress', 3),
    S(7, 'Evidence Pending', 'amber', 'file', 'In Progress', 3),
    S(8, 'Evidence Submitted', 'teal', 'upload', 'In Progress', 4),
    S(9, 'Verification Pending', 'purple', 'shield', 'In Progress', 4),
    S(10, 'Closure Approval Pending', 'purple', 'award', 'In Progress', 5),
    S(11, 'Closed', 'green', 'check', 'Closed', 6),
    S(12, 'Overdue', 'red', 'alert', 'Open', 1),
    S(13, 'On Hold', 'amber', 'pause', 'Open', 1),
    S(14, 'Not Applicable', 'grey', 'ban', 'Closed', 6),
    S(15, 'Risk Accepted', 'grey', 'shield', 'Closed', 6),
    S(16, 'Needs Review', 'orange', 'help', 'Open', 1),
  ];
  TMD.CSTATUS = CSTATUS;
  TMD.cstatusInfo = (n) => CSTATUS[n] || CSTATUS[16];
  TMD.cstatusBadge = (n, extra) => { const s = TMD.cstatusInfo(n); return `<span class="badge tone-${s.tone}">${TMD.icon(s.icon)}<span>${TMD.esc(s.label)}</span>${extra || ''}</span>`; };
  TMD.REMEDIATION_STEPS = ['Observation Raised', 'Action Plan', 'Remediation', 'Evidence', 'Verification', 'Closure'];

  const SEV_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Unclassified'];
  TMD.SEV_ORDER = SEV_ORDER;
  TMD.sevTone = (s) => ({ Critical: 'crit', High: 'red', Medium: 'amber', Low: 'blue', Unclassified: 'grey' }[s] || 'grey');
  TMD.sevBadge = (s, suggested) => `<span class="pill sev-${TMD.sevTone(s)}">${TMD.icon(s === 'Critical' || s === 'High' ? 'alert' : s === 'Unclassified' ? 'help' : 'circle')}${TMD.esc(s)}${suggested ? ' <em>(Suggested)</em>' : ''}</span>`;
  function normSeverity(v) {
    const s = str(v).toLowerCase();
    if (!s) return { sev: 'Unclassified', recognised: true, blank: true };
    if (/crit|very\s*high|^p0|^p1$|severe|^s1$/.test(s)) return { sev: 'Critical', recognised: true };
    if (/high|major|^p2$|^s2$/.test(s)) return { sev: 'High', recognised: true };
    if (/med|moderate|^p3$|^s3$/.test(s)) return { sev: 'Medium', recognised: true };
    if (/low|minor|info|^p4$|^s4$/.test(s)) return { sev: 'Low', recognised: true };
    return { sev: 'Unclassified', recognised: false };
  }
  // Suggested classification (only when enabled in Settings; never replaces the source)
  const SUGGEST = [
    ['Critical', /default\s*pass|internet[\s-]*(facing|exposed)|unauthori[sz]ed\s*remote|no\s*(firewall|authentication)|plain\s*text\s*password|ransomware/],
    ['High', /remote\s*access|unpatched|end[\s-]*of[\s-]*life|\beol\b|obsolete|admin(istrator)?\s*rights|shared\s*(account|password)|no\s*backup|antivirus\s*(not|absent|outdated)|usb/],
    ['Medium', /log(ging)?|monitor|segment|policy|procedure|configuration|hardening|inventory|password\s*policy/],
    ['Low', /document|label|training|awareness|naming/],
  ];
  function suggestSeverity(text) { for (const [s, re] of SUGGEST) if (re.test(text)) return s; return null; }
  TMD.normSeverity = normSeverity; TMD.suggestSeverity = suggestSeverity;

  // Keyword → domain (most specific first). Used only when the source has no recognised domain.
  const DOMAIN_KW = [
    ['Firewall', /firewall/], ['Network Segmentation', /segment|vlan|\bdmz\b|zoning|conduit/], ['Patch Management', /patch|hotfix|security\s*update|outdated\s*(os|software|firmware)/],
    ['Malware Protection', /anti[\s-]*virus|malware|edr\b|endpoint\s*protection/], ['Password Management', /password|credential/], ['Privileged Access', /privileged|admin(istrator)?\s*(rights|account|access)|\bpam\b/],
    ['Identity & Access Management', /access\s*control|user\s*account|active\s*directory|\bmfa\b|multi[\s-]*factor|authenticat|role[\s-]*based/],
    ['Remote Access', /remote\s*access|\bvpn\b|teamviewer|anydesk|\brdp\b/], ['Vendor / Third-Party Access', /vendor|third[\s-]*party|oem\s*access|contractor/],
    ['USB / Removable Media', /\busb\b|removable|pen\s*drive/], ['Backup & Recovery', /backup|restore/], ['SIEM', /\bsiem\b|\bsoc\b/],
    ['Logging & Monitoring', /\blog(s|ging)?\b|audit\s*trail|monitoring/], ['Incident Response', /incident/], ['Asset Management', /asset\s*(register|inventory)|inventory/],
    ['Configuration Management', /configuration|hardening|baseline|unused\s*(port|service)/], ['SCADA Security', /scada|\bhmi\b/], ['PLC / RTU Security', /\bplc\b|\brtu\b/],
    ['OT / ICS Security', /\bics\b|\bot\s*network|\bdcs\b|industrial\s*control/], ['Vulnerability Management', /vulnerab|vapt|penetration|scan/],
    ['Physical Security', /physical|cctv|access\s*card|server\s*room\s*door|rack\s*lock/], ['Disaster Recovery', /disaster\s*recovery|\bdr\s*site/], ['Business Continuity', /business\s*continuity|\bbcp\b/],
    ['Policy / Procedure', /policy|procedure|\bsop\b/], ['Database Security', /database|\bdb\b/], ['Application Security', /web\s*app|application\s*security|input\s*validation/],
    ['Server Security', /server/], ['Endpoint Security', /endpoint|desktop|workstation|laptop/], ['Network Security', /network|switch|router|wireless|wi-?fi/],
    ['Governance', /governance|roles\s*and\s*responsibilit/], ['Risk Management', /risk\s*assessment|risk\s*register/], ['Compliance', /compliance|cert-in\s*(direction|guideline)/],
  ];
  function calcDomain(src, text) {
    const domains = TMD.cyberDomains();
    const s = str(src);
    if (s) {
      const l = s.toLowerCase();
      const exact = domains.find((d) => d.toLowerCase() === l) || domains.find((d) => l.indexOf(d.toLowerCase()) >= 0 || d.toLowerCase().indexOf(l) >= 0);
      if (exact) return { domain: exact, source: 'source' };
      return { domain: s, source: 'source-unlisted' };
    }
    for (const [d, re] of DOMAIN_KW) if (re.test(text)) return { domain: d, source: 'keywords' };
    return { domain: 'Unclassified', source: 'none' };
  }

  const YES = /^(y|yes|true|1|required|repeat(ed)?|✓)$/i;
  const isYes = (v) => YES.test(str(v)) || /^yes\b/i.test(str(v));

  /* ---------------- Base status from source fields ---------------- */
  function baseStatus(c, g) {
    const status = g('currentStatus'), closure = g('closureStatus');
    const txt = (status + ' | ' + closure).toLowerCase();
    const ev = (g('evidenceStatus') + ' ' + g('evidenceSubmitted')).toLowerCase().trim();
    const ver = g('verificationStatus').toLowerCase();
    const appr = g('closureApproval').toLowerCase();
    const R = (n, why) => ({ n, why });
    if (/not\s*applicable|^n\.?\s*a\.?\s*(\||$)|^na\s*(\||$)/.test(txt)) return R(14, 'Status indicates not applicable');
    if (/risk\s*accept|accepted\s*(the\s*)?risk/.test(txt)) return R(15, 'Status indicates risk accepted');
    if (/on\s*hold|deferred|abeyance/.test(txt)) return R(13, 'Status indicates on hold');
    const closedWord = /(^|[^a-z])(closed|complied|compliance\s*done|resolved\s*and\s*closed)([^a-z]|$)/.test(txt) && !/not\s*closed|to\s*be\s*closed|closure\s*(pending|awaited|requested)|partially|pending\s*closure/.test(txt);
    if (closedWord) return R(11, `Status "${status || closure}" indicates closed`);
    if (/closure\s*approval|approval\s*for\s*closure|pending\s*closure|closure\s*(pending|awaited|requested)/.test(txt) || /pending|awaited|requested/.test(appr)) return R(10, 'Closure approval pending');
    const verified = /verified|accepted|satisfactory|^yes|complied|done/.test(ver) && !/not\s*verified|pending|awaited|rejected/.test(ver);
    const verPending = /pending|awaited|under\s*verification|in\s*progress|requested/.test(ver) || /verification\s*pending|under\s*verification|submitted\s*for\s*verification/.test(txt);
    const evSubmitted = /submitted|uploaded|shared|provided|received|^yes/.test(ev) && !/not\s*submitted|pending|awaited/.test(ev);
    const evPending = /pending|awaited|not\s*submitted|^no\b/.test(ev) || /evidence\s*(pending|awaited)/.test(txt);
    if (verified) return R(10, 'Auditor verification recorded; formal closure not yet recorded');
    if (verPending) return R(9, 'Auditor verification pending');
    if (evSubmitted) return R(8, 'Evidence submitted; verification not yet recorded');
    const completed = /complet|implemented|rectified|fixed|resolved|done|remediated|addressed/.test(txt) && !/not\s*(yet\s*)?complet|partially|in\s*progress|to\s*be/.test(txt);
    if (completed && (evPending || c.evidenceTracked)) return R(7, 'Action completed; evidence pending');
    if (completed) return R(6, 'Action reported completed');
    if (evPending && c.actionStarted) return R(7, 'Evidence pending');
    if (/in\s*progress|under\s*process|ongoing|\bwip\b|partial|being|initiated|under\s*implementation|work\s*started|procurement|under\s*progress/.test(txt)) return R(5, 'Remediation in progress');
    if (/plan\s*submitted|action\s*plan\s*(submitted|received|approved)|planned|scheduled/.test(txt)) return R(4, 'Action plan submitted');
    if (/plan\s*(pending|awaited)|awaiting\s*(action\s*)?plan/.test(txt)) return R(3, 'Action plan pending');
    if (/review|examin|discussion|under\s*study|clarification/.test(txt)) return R(2, 'Under review');
    if (/^\s*(\||$)|^open|^new|not\s*started|yet\s*to\s*start|^pending/.test(txt)) {
      if (!status && !closure) {
        if (c.hasPlan && c.effTarget) return R(4, 'No status recorded; corrective action and target date exist');
        if (c.hasOwner && !c.hasPlan) return R(3, 'No status recorded; owner assigned but no action plan');
        return R(1, 'No status recorded');
      }
      if (c.hasPlan && c.effTarget) return R(4, `Status "${status}" with corrective action and target date`);
      return R(1, `Status "${status}"`);
    }
    return R(16, `Status "${status || closure}" could not be classified`);
  }

  /* ---------------- Per-record calculation ---------------- */
  TMD.cyberCalcRecord = function (rec) {
    const sheet = TMD.sheetOf(rec);
    if (!sheet) return null;
    const m = sheet.mapping;
    const g = (f) => (m[f] ? str(rec.values[m[f]]) : '');
    const dt = (f) => { const k = m[f]; if (!k) return null; const p = TMD.parseDate(rec.values[k], rec.dateHints[k], true); return p.date && (p.kind === 'date' || p.kind === 'serial' || p.kind === 'textdate') ? p.date : null; };
    const T = TMD.today();
    const db = TMD.daysBetween;
    const c = { alerts: [], dq: [], attention: [] };
    c.obsId = g('obsId') || g('obsNo');
    c.auditName = g('auditName');
    c.auditType = g('auditType');
    c.agency = g('auditAgency');
    c.auditYear = g('auditYear');
    c.location = g('location');
    c.region = g('region');
    c.asset = g('asset');
    c.system = g('system');
    c.department = g('department');
    c.deptResp = g('deptResponsible') || g('department');
    c.owner = g('owner');
    c.pendingWith = g('pendingWith');
    c.otIt = g('otIt');
    c.framework = g('framework');
    c.clause = g('clause');
    c.originalStatus = g('currentStatus') || g('closureStatus');
    c.evidenceStatus = g('evidenceStatus') || g('evidenceSubmitted');
    c.verificationStatus = g('verificationStatus');
    c.text = [g('observation'), g('finding'), g('obsDescription'), g('gap')].filter(Boolean).join(' — ');
    c.title = c.text ? (c.text.length > 140 ? c.text.slice(0, 137) + '…' : c.text) : '(No observation text)';
    c.ident = c.obsId || (c.auditName ? c.auditName + ' #' + (g('srNo') || rec.rowNum) : `${rec.sheet} row ${rec.rowNum}`);
    c.repeat = m.repeat ? isYes(rec.values[m.repeat]) : false;
    c.escalation = m.escalation ? isYes(rec.values[m.escalation]) : false;
    c.d = { audit: dt('auditDate'), report: dt('reportDate'), obs: dt('obsDate'), target: dt('targetDate'), revised: dt('revisedTarget'), closure: dt('closureDate'), lastFU: dt('lastFollowUp'), nextFU: dt('nextFollowUp'), verification: dt('verificationDate') };
    c.raised = c.d.obs || c.d.audit || c.d.report;
    c.effTarget = c.d.revised || c.d.target;
    c.hasRevised = !!c.d.revised;
    c.hasPlan = !!(g('correctiveAction') || g('remediationPlan') || g('actionRequired'));
    c.hasOwner = !!c.owner;
    c.actionStarted = !!g('actionTaken');
    c.evidenceTracked = !!(m.evidenceStatus || m.evidenceSubmitted);

    // Severity (source preserved; normalised separately)
    const sevSrc = g('severity') || g('criticality') || g('riskLevel') || g('riskRating');
    const ns = normSeverity(sevSrc);
    c.severitySource = sevSrc;
    c.severity = ns.sev;
    c.sevRecognised = ns.recognised;
    c.suggestedSeverity = null;
    if (ns.blank && TMD.settings.get('cyberSuggest')) c.suggestedSeverity = suggestSeverity(c.text.toLowerCase());
    // Domain
    const dom = calcDomain(g('domain') || g('obsCategory'), (c.text + ' ' + g('recommendation')).toLowerCase());
    c.calcDomain = dom.domain; c.domainSource = dom.source; c.domainOriginal = g('domain');

    // Status
    const bs = baseStatus(c, g);
    c.baseStatus = bs.n;
    c.closed = [11, 14, 15].indexOf(bs.n) >= 0;
    c.overdue = !c.closed && !!c.effTarget && c.effTarget < T;
    c.daysOverdue = c.overdue ? db(c.effTarget, T) : 0;
    c.daysRemaining = !c.closed && c.effTarget && !c.overdue ? db(T, c.effTarget) : null;
    let st = bs.n;
    let reason = bs.why;
    if (c.overdue && [13, 16].indexOf(st) < 0) { reason = `${bs.why}; ${c.hasRevised ? 'revised ' : ''}target ${TMD.fmtDate(c.effTarget)} passed ${c.daysOverdue} day(s) ago`; st = 12; }
    if (rec.override && rec.override.stage) { reason = `Manual override${rec.override.note ? ': ' + rec.override.note : ''} (calculated: ${TMD.cstatusInfo(st).label} — ${reason})`; st = +rec.override.stage; c.overridden = true; }
    c.cstatus = st;
    c.statusReason = reason;
    c.statusLabel = TMD.cstatusInfo(st).label + (st === 12 ? ' · ' + TMD.cstatusInfo(bs.n).label : '');
    c.bucket = st === 12 ? TMD.cstatusInfo(bs.n).bucket : TMD.cstatusInfo(st).bucket;
    if (c.overridden) c.closed = [11, 14, 15].indexOf(st) >= 0;
    c.step = TMD.cstatusInfo(bs.n).step;
    c.open = !c.closed;
    c.inProgress = c.bucket === 'In Progress';
    c.evidencePending = !c.closed && (bs.n === 7 || (/pending|awaited|not\s*submitted/i.test(c.evidenceStatus) && bs.n >= 5));
    c.verificationPending = !c.closed && (bs.n === 8 || bs.n === 9);
    c.awaitingClosure = !c.closed && bs.n === 10;
    c.dueLabel = c.closed ? 'Closed' : c.overdue ? `${c.daysOverdue} d overdue` : c.daysRemaining !== null ? (c.daysRemaining === 0 ? 'Due today' : `Due in ${c.daysRemaining} d`) : 'No target date';

    // Aging
    c.age = c.raised ? db(c.raised, c.closed && c.d.closure ? c.d.closure : T) : null;
    const openAge = c.raised && !c.closed ? db(c.raised, T) : null;
    c.ageBucket = openAge === null ? (c.closed ? 'Closed' : 'Unknown') : openAge <= 30 ? '0–30 days' : openAge <= 60 ? '31–60 days' : openAge <= 90 ? '61–90 days' : openAge <= 180 ? '91–180 days' : openAge <= 365 ? '181–365 days' : '> 365 days';
    c.openAge = openAge;
    c.closureDuration = c.closed && c.d.closure && c.raised ? db(c.raised, c.d.closure) : null;
    c.fy = TMD.fyOf(c.raised);

    buildAlerts(rec, c, g);
    TMD.cyberRecordDq(rec, c, sheet, g);
    rec.calc = c;
    return c;
  };

  function A(c, sev, type, msg, o) { c.alerts.push(Object.assign({ sev, type, msg }, o || {})); }
  function buildAlerts(rec, c) {
    const T = TMD.today();
    const set = (k) => +TMD.settings.get(k);
    const db = TMD.daysBetween;
    const f = TMD.fmtDate;
    if (c.closed) return;
    if (c.severity === 'Critical') A(c, 'high', 'Critical open observation', `Critical observation is ${c.bucket.toLowerCase()}.`, { attention: 'Critical + Open' });
    if (c.severity === 'High' && c.overdue) A(c, 'high', 'High-risk overdue observation', `High-severity observation overdue by ${c.daysOverdue} day(s).`, { attention: 'High + Overdue' });
    else if (c.severity === 'High') A(c, 'medium', 'High-risk open observation', 'High-severity observation is open.');
    if (c.overdue) A(c, 'high', 'Overdue observation', `${c.hasRevised ? 'Revised target' : 'Target'} date ${f(c.effTarget)} passed ${c.daysOverdue} day(s) ago.`, { attention: c.hasRevised ? 'Revised target date exceeded' : 'Target date exceeded', date: c.effTarget });
    if (!c.overdue && c.effTarget) {
      const left = db(T, c.effTarget);
      const thr = set('cyberThrTarget') || 30;
      if (left <= thr) A(c, left <= 7 ? 'medium' : 'low', 'Target date approaching', `Target date ${f(c.effTarget)} (in ${left} day(s)).`, { date: c.effTarget, upcoming: true });
    }
    if (c.evidencePending) {
      const late = c.effTarget && c.effTarget < T;
      A(c, late ? 'high' : 'medium', 'Evidence pending', `Action reported complete but supporting evidence is pending${late ? ' beyond the target date' : ''}.`, late ? { attention: 'Evidence pending beyond target' } : {});
    }
    if (c.verificationPending) A(c, 'medium', 'Verification pending', 'Evidence submitted; auditor verification pending.', { attention: 'Verification pending' });
    if (c.awaitingClosure) A(c, 'low', 'Awaiting closure', 'Verified; formal closure / approval pending.');
    if (c.openAge !== null && c.openAge > (set('cyberThrLongOpen') || 90)) A(c, c.openAge > 180 ? 'medium' : 'low', 'Long-open observation', `Open for ${c.openAge} days (since ${f(c.raised)}).`);
    const sh = TMD.sheetOf(rec);
    if (sh.mapping.owner && !c.owner) A(c, c.severity === 'Critical' || c.severity === 'High' ? 'high' : 'medium', 'No assigned owner', 'No action owner recorded.', { attention: 'No owner' });
    if (!c.effTarget) A(c, 'medium', 'No target date', 'No target / revised target date recorded.', { attention: 'No target date' });
    if (c.repeat) A(c, 'medium', 'Repeat observation', 'Observation repeated from an earlier audit.', { attention: 'Repeated observation' });
    if (c.escalation) A(c, 'high', 'Escalation required', 'Escalation required as per the tracker.', { attention: 'Escalation Required = Yes' });
    if (c.d.nextFU && c.d.nextFU < T) A(c, 'low', 'Follow-up date passed', `Next follow-up date ${f(c.d.nextFU)} has passed.`);
    if (c.overdue && !c.d.lastFU && sh.mapping.lastFollowUp) A(c, 'low', 'Overdue without follow-up', 'Overdue observation has no follow-up date recorded.');
    c.attention = Array.from(new Set(c.alerts.filter((a) => a.attention).map((a) => a.attention)));
  }

  /* ---------------- Recalculate ---------------- */
  TMD.cyberRecalcAll = function () {
    const recs = TMD.cyber.state.records;
    for (let i = 0; i < recs.length; i++) TMD.cyberCalcRecord(recs[i]);
    TMD.cyberDatasetChecks(recs);
    TMD.emit('recalculated', { module: 'cyber' });
  };
  TMD.cyberRecalcRecord = function (rec) {
    TMD.cyberCalcRecord(rec);
    TMD.cyber.state.records.forEach((r) => { if (r !== rec && r.calc) r.calc.dq = r.calc.dq.filter((q) => q.code !== 'c-dup-id'); });
    TMD.cyberDatasetChecks(TMD.cyber.state.records);
  };
  TMD.cyberIsYes = isYes;
})();
