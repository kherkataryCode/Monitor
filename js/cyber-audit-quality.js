/* =====================================================================
 * cyber-audit-quality.js — cybersecurity-audit-specific data quality
 * checks. Findings are suggestions only; source data is never altered.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  function Q(c, sev, field, msg, suggestion, code) { c.dq.push({ sev, field, msg, suggestion, code }); }

  TMD.cyberRecordDq = function (rec, c, sheet, g) {
    const m = sheet.mapping;
    const lbl = (f) => { const h = sheet.headers.find((x) => x.key === m[f]); return h ? h.display : TMD.CYBER_STD[f].label; };
    const blank = (f) => m[f] && !g(f);
    if (m.obsId && !g('obsId')) Q(c, 'medium', lbl('obsId'), 'Missing Observation ID', 'Enter the observation reference from the audit report.', 'c-missing-id');
    const textFields = ['observation', 'finding', 'obsDescription', 'gap'].filter((f) => m[f]);
    if (textFields.length && !textFields.some((f) => g(f))) Q(c, 'high', lbl(textFields[0]), 'Missing observation text', 'Enter the audit observation / finding.', 'c-missing-obs');
    const sevFields = ['severity', 'criticality', 'riskLevel', 'riskRating'].filter((f) => m[f]);
    if (sevFields.length && !c.severitySource) Q(c, 'medium', lbl(sevFields[0]), 'Missing severity', 'Enter Critical / High / Medium / Low as per the audit report.', 'c-missing-sev');
    if (c.severitySource && !c.sevRecognised) Q(c, 'medium', lbl(sevFields[0]), `Unrecognised severity "${c.severitySource}"`, 'Use Critical, High, Medium or Low.', 'c-bad-sev');
    if (blank('location')) Q(c, 'low', lbl('location'), 'Missing location', 'Enter the location / installation.', 'c-missing-loc');
    if (!c.closed && blank('owner')) Q(c, c.severity === 'Critical' ? 'high' : 'medium', lbl('owner'), c.severity === 'Critical' ? 'Critical observation without Action Owner' : 'Missing Action Owner', 'Record the person / role responsible for the action.', 'c-missing-owner');
    const actFields = ['correctiveAction', 'remediationPlan', 'actionRequired'].filter((f) => m[f]);
    if (!c.closed && actFields.length && !actFields.some((f) => g(f))) Q(c, 'low', lbl(actFields[0]), 'Missing corrective action', 'Record the agreed corrective action / remediation plan.', 'c-missing-action');
    if (!c.closed && (m.targetDate || m.revisedTarget) && !c.effTarget) Q(c, 'medium', lbl(m.targetDate ? 'targetDate' : 'revisedTarget'), 'Missing target date', 'Agree and record a target date.', 'c-missing-target');
    // Dates
    ['auditDate', 'reportDate', 'obsDate', 'targetDate', 'revisedTarget', 'closureDate', 'lastFollowUp', 'nextFollowUp', 'verificationDate'].forEach((f) => {
      const k = m[f];
      if (!k) return;
      const p = TMD.parseDate(rec.values[k], rec.dateHints[k], true);
      if (p.kind === 'invalid') Q(c, 'high', lbl(f), `Invalid date "${TMD.cellText(rec.values[k])}"`, 'Correct the value to a real calendar date (dd/mm/yyyy).', 'c-invalid-date');
      if (p.kind === 'serial') Q(c, 'low', lbl(f), `Excel serial number in a date column (read as ${TMD.fmtDate(p.date)})`, 'Format the cell as a date in Excel.', 'c-serial-date');
    });
    const d = c.d;
    if (d.target && c.raised && d.target < c.raised) Q(c, 'medium', lbl('targetDate'), 'Target date is before the observation / audit date', 'Check both dates.', 'c-seq-target');
    if (d.closure && c.raised && d.closure < c.raised) Q(c, 'high', lbl('closureDate'), 'Closure date is before the observation / audit date', 'Check both dates.', 'c-seq-closure');
    if (d.revised && d.target && d.revised < d.target) Q(c, 'medium', lbl('revisedTarget'), 'Revised target date is earlier than the original target', 'Check whether the dates were swapped.', 'c-seq-revised');
    if (d.closure && d.closure > TMD.today()) Q(c, 'low', lbl('closureDate'), 'Closure date is in the future', 'Confirm whether this is a planned date.', 'c-future-closure');
    if (c.closed && c.baseStatus === 11 && m.closureDate && !d.closure) Q(c, 'medium', lbl('closureDate'), 'Closed observation without closure date', 'Record the date of closure.', 'c-closed-nodate');
    if (c.closed && c.baseStatus === 11 && c.evidenceTracked && !/submitted|uploaded|shared|provided|received|yes|verified|accepted/i.test(c.evidenceStatus)) Q(c, 'medium', lbl(m.evidenceStatus ? 'evidenceStatus' : 'evidenceSubmitted'), 'Closed observation without closure evidence', 'Record the closure evidence status.', 'c-closed-noevidence');
    if (!c.closed && d.closure) Q(c, 'high', lbl('closureDate'), 'Open observation has a closure date', 'Update the status or remove the closure date.', 'c-open-closuredate');
    if (c.overdue && m.lastFollowUp && !d.lastFU) Q(c, 'low', lbl('lastFollowUp'), 'Overdue observation without follow-up', 'Record the last follow-up date.', 'c-overdue-nofu');
    if (c.baseStatus === 16) Q(c, 'low', lbl('currentStatus'), `Status "${c.originalStatus}" could not be classified`, 'Use a clear status (Open, In progress, Action completed, Evidence submitted, Closed …).', 'c-status-review');
    // Status / date contradictions
    if (c.baseStatus === 11 && /pending|awaited|in\s*progress/i.test(c.verificationStatus)) Q(c, 'medium', lbl('verificationStatus'), 'Status says closed but verification is still pending', 'Review status and verification fields.', 'c-conflict');
    if (c.baseStatus <= 3 && d.closure) Q(c, 'medium', lbl('currentStatus'), 'Status indicates not started but a closure date exists', 'Review status and dates.', 'c-conflict');
  };

  TMD.cyberDatasetChecks = function (records) {
    const m = new Map();
    records.forEach((r) => {
      const id = r.calc && r.calc.obsId;
      if (!id) return;
      const k = ((r.calc.auditName || '') + '|' + id).toUpperCase().replace(/\s+/g, '');
      (m.get(k) || m.set(k, []).get(k)).push(r);
    });
    m.forEach((list) => {
      if (list.length < 2) return;
      list.forEach((r) => r.calc.dq.push({ sev: 'medium', field: 'Observation ID', msg: `Duplicate Observation ID "${r.calc.obsId}" within audit "${r.calc.auditName || '—'}" (also ${list.filter((x) => x !== r).map((x) => 'row ' + x.rowNum).slice(0, 4).join(', ')})`, suggestion: 'Confirm whether these are separate observations.', code: 'c-dup-id' }));
    });
    records.forEach((r) => {
      if (!r.calc) return;
      const w = { high: 20, medium: 8, low: 3 };
      r.calc.dqScore = Math.max(0, 100 - r.calc.dq.reduce((s, q) => s + (w[q.sev] || 0), 0));
      r.calc.dqHigh = r.calc.dq.some((q) => q.sev === 'high');
    });
  };

  TMD.CYBER_DQ_LABEL = {
    'c-missing-id': 'Missing Observation ID', 'c-missing-obs': 'Missing Observation', 'c-missing-sev': 'Missing Severity', 'c-bad-sev': 'Unrecognised severity', 'c-missing-loc': 'Missing Location',
    'c-missing-owner': 'Missing Action Owner', 'c-missing-action': 'Missing Corrective Action', 'c-missing-target': 'Missing Target Date', 'c-invalid-date': 'Invalid Date', 'c-serial-date': 'Excel serial dates',
    'c-seq-target': 'Target Date before Observation Date', 'c-seq-closure': 'Closure Date before Observation Date', 'c-seq-revised': 'Revised target earlier than original', 'c-future-closure': 'Closure date in future',
    'c-closed-nodate': 'Closed without closure date', 'c-closed-noevidence': 'Closed without evidence', 'c-open-closuredate': 'Open with a closure date', 'c-overdue-nofu': 'Overdue without follow-up',
    'c-status-review': 'Status needs review', 'c-conflict': 'Status/date contradiction', 'c-dup-id': 'Duplicate Observation ID', 'blank-header': 'Blank source headers', 'dup-header': 'Duplicate source headers',
  };
})();
