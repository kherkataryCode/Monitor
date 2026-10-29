/* =====================================================================
 * calculations.js — rules-based lifecycle engine and calculated fields.
 *  - Calculated values are cached on record.calc and NEVER written back
 *    into the source values.
 *  - Structured dates are used first; STATUS / Quick Status / Remarks text
 *    is supporting evidence. Conflicts are surfaced, not hidden.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  /* ---------------- Lifecycle stages ---------------- */
  const S = (n, label, group, tone, icon) => ({ n, label, group, tone, icon });
  const STAGES = [null,
    S(1, 'Tender Preparation', 'Pre-tender', 'grey', 'note'),
    S(2, 'Internal Approval', 'Pre-tender', 'grey', 'clock'),
    S(3, 'Sent to P&CS/CPO', 'Pre-tender', 'blue', 'send'),
    S(4, 'Tender Not Floated', 'Pre-tender', 'grey', 'pause'),
    S(5, 'Tender Floated', 'Bidding', 'teal', 'send'),
    S(6, 'Pre-Bid Stage', 'Bidding', 'teal', 'users'),
    S(7, 'Bid Opening Due', 'Bidding', 'teal', 'clock'),
    S(8, 'Bid Opened', 'Evaluation', 'blue', 'file'),
    S(9, 'BQC Evaluation', 'Evaluation', 'blue', 'search'),
    S(10, 'Technical Evaluation', 'Evaluation', 'blue', 'search'),
    S(11, 'Finance/Commercial Evaluation', 'Evaluation', 'purple', 'rupee'),
    S(12, 'Price Bid Opening', 'Evaluation', 'purple', 'rupee'),
    S(13, 'Negotiation', 'Award', 'purple', 'users'),
    S(14, 'TEC Approval', 'Award', 'blue', 'check'),
    S(15, 'Award in Progress', 'Award', 'blue', 'award'),
    S(16, 'PO/OLA Awarded', 'Post-award', 'green', 'award'),
    S(17, 'Drawing Approval', 'Post-award', 'blue', 'file'),
    S(18, 'FAT', 'Post-award', 'blue', 'wrench'),
    S(19, 'Material Delivery', 'Post-award', 'blue', 'truck'),
    S(20, 'SAT', 'Post-award', 'blue', 'wrench'),
    S(21, 'Installation/Commissioning', 'Post-award', 'blue', 'zap'),
    S(22, 'Completed', 'Closed', 'green', 'check'),
    S(23, 'On Hold', 'Exception', 'amber', 'pause'),
    S(24, 'Cancelled', 'Exception', 'red', 'ban'),
    S(25, 'Scrapped', 'Exception', 'red', 'trash'),
    S(26, 'Refloating Required', 'Exception', 'orange', 'repeat'),
    S(27, 'Unknown/Needs Review', 'Needs review', 'grey', 'help'),
  ];
  TMD.STAGES = STAGES;
  TMD.STAGE_GROUPS = ['Pre-tender', 'Bidding', 'Evaluation', 'Award', 'Post-award', 'Closed', 'Exception', 'Needs review'];
  TMD.stageInfo = (n) => STAGES[n] || STAGES[27];
  TMD.stageLabel = (n) => { const s = TMD.stageInfo(n); return `${String(s.n).padStart(2, '0')}. ${s.label}`; };
  TMD.stageBadge = function (n, extra) {
    const s = TMD.stageInfo(n);
    return `<span class="badge tone-${s.tone}" title="${TMD.esc(s.label)}">${TMD.icon(s.icon)}<span>${TMD.esc(s.label)}</span>${extra || ''}</span>`;
  };
  const TERMINAL = new Set([22, 24, 25]);
  const CLOSED_OR_EXCEPTION = new Set([22, 23, 24, 25]);
  TMD.isClosed = (n) => TERMINAL.has(n);

  /* ---------------- Text classification ---------------- */
  const PENDING_RE = /(pending|awaited|awaiting|to be|yet to|\bunder\b|in progress|in process|processing|ongoing|initiated|scheduled|\bdue\b|planned|expected|proposed|required|sought|submitted for|for approval|for award|not yet|being)/;
  const DONE_RE = /(completed|complete\b|\bdone\b|\bover\b|finished|approved|received|opened|issued|awarded|placed|floated|concluded|cleared|accorded|\bheld\b|conducted|signed|released|accepted|delivered|installed|commissioned|obtained|finali[sz]ed|submitted)/;

  const EVENTS = [
    { id: 'tec', re: /\btec\b|tender committee|\btc\b (recommendation|approval)/, p: 14, d: 15, name: 'TEC approval' },
    { id: 'price', re: /price[\s-]*bids?|financial bids?|commercial bids?|\bpbo\b/, p: 12, d: 14, name: 'Price bid' },
    { id: 'nego', re: /negotiat|counter[\s-]*offer|reverse auction|\bl1\b.*(discussion|meeting)/, p: 13, d: 14, name: 'Negotiation' },
    { id: 'finance', re: /financ(e|ial) (review|concurrence|vetting|evaluation)|commercial evaluation|\bcbe\b|price evaluation|\bifd\b|vetting/, p: 11, d: 12, name: 'Finance / commercial evaluation' },
    { id: 'bqc', re: /\bbqc\b/, p: 9, d: 10, name: 'BQC evaluation' },
    { id: 'tech', re: /tech(nical|no)?[\s.-]*(commercial\s*)?evaluation|\btbe\b|technical scrutiny/, p: 10, d: 12, name: 'Technical evaluation' },
    { id: 'tq', re: /technical (clarification|query|queries)|\btqs?\b|clarifications? (sought|issued|awaited|received)/, p: 10, d: 10, name: 'Technical clarifications' },
    { id: 'postaward', re: /post[\s-]*award/, p: 16, d: 16, name: 'Post-award' },
    { id: 'drawing', re: /drawing/, p: 17, d: 18, name: 'Drawing approval' },
    { id: 'fat', re: /\bfat\b|factory acceptance|inspection|pre[\s-]*dispatch|\bpdi\b/, p: 18, d: 19, name: 'FAT / inspection' },
    { id: 'sat', re: /\bsat\b|site acceptance/, p: 20, d: 21, name: 'SAT' },
    { id: 'delivery', re: /deliver|dispatch|material (receipt|received|supplied)|\bsupplied\b/, p: 19, d: 20, name: 'Material delivery' },
    { id: 'install', re: /install|commission|erection|implementation|go[\s-]*live/, p: 21, d: 21, name: 'Installation / commissioning' },
    { id: 'award', re: /\baward|\bloa\b|\bloi\b|\bpo\b|purchase order|\bola\b|work order|\bwo\b|order placed/, p: 15, d: 16, name: 'Award' },
    { id: 'opening', re: /(bids?|tenders?|offers?)\s*(opening|opened|open)\b|\bopening\b|techno[\s-]*commercial bids? opened/, p: 7, d: 8, name: 'Bid opening' },
    { id: 'due', re: /due date|bid submission|submission of bids|date extended|extension|extended/, p: 7, d: 7, name: 'Bid submission' },
    { id: 'prebid', re: /pre[\s-]*bid/, p: 6, d: 7, name: 'Pre-bid meeting' },
    { id: 'bidding', re: /bidding/, p: 5, d: 7, name: 'Bidding' },
    { id: 'notfloated', re: /not (yet )?floated|yet to (be )?float|floating (is )?pending|pending for floating/, p: 4, d: 4, name: 'Tender not floated' },
    { id: 'floated', re: /re-?floated|\bfloated\b|\bfloat(ing)?\b|published|uploaded on gem|(bid|tender) (is )?live|nit issued/, p: 4, d: 5, name: 'Tender floating' },
    { id: 'sent', re: /sent to (p\s*&\s*cs|pcs|cpo|procurement|c\s*&\s*p)|pr (sent|raised|released|submitted|forwarded)|forwarded to (cpo|p\s*&\s*cs)/, p: 2, d: 3, name: 'Sent to procurement' },
    { id: 'approval', re: /approval|sanction|\bfc\b|concurrence|\bdoa\b/, strip: /(tec|drawing|tc|technical|vendor|financ(e|ial)) approval/g, p: 2, d: 3, name: 'Internal approval' },
    { id: 'prep', re: /prepar|draft|specification|\bspecs?\b|estimate|\bnit\b|indent|\bpr\b (creation|to be)/, p: 1, d: 2, name: 'Tender preparation' },
  ];
  const HIGH = [
    { stage: 25, re: /\bscrap(ped)?\b/, name: 'scrapped' },
    { stage: 24, re: /\bcancel+(ed|lation)?\b|withdrawn|annulled|\bdropped\b/, name: 'cancelled' },
    { stage: 26, re: /re-?float(ing)?\s*(is\s*)?(required|to be|needed|pending|proposed|under process|recommended)|to be re-?floated|needs? (to be )?re-?float|re-?tender(ing)?\s*(is\s*)?(required|to be|needed)|re-?tender(ing)? recommended/, name: 'refloating required' },
    { stage: 23, re: /\bon hold\b|in abeyance|put on hold|\bdeferred\b|\bheld up\b/, name: 'on hold' },
    { stage: 22, re: /(work|project|job|supply|contract|order|scope|installation and commissioning)\s*(is\s*|has been\s*|fully\s*)*completed|handed over|\bclosed\b|^\s*completed\.?\s*$|completion certificate|\bclosure\b/, name: 'completed' },
  ];

  function splitClauses(text) {
    return String(text).toLowerCase().split(/[;\n\r]+|\.(?:\s+|$)|,\s*|\s+(?:and|but|however|thereafter|then)\s+/).map((c) => c.trim()).filter(Boolean);
  }

  /**
   * Classify free text. Returns {stage, reason, terminal, events:[...] } or null.
   * Current (pending) statements take priority over historical (completed) ones
   * unless a later milestone has clearly been completed.
   */
  TMD.classifyText = function (text) {
    if (TMD.isBlank(text)) return null;
    const clauses = splitClauses(text);
    let lastTerminalIdx = -1, terminal = null;
    clauses.forEach((c, i) => {
      for (const h of HIGH) if (h.re.test(c)) { lastTerminalIdx = i; terminal = { stage: h.stage, name: h.name, clause: c }; break; }
    });
    let maxP = null, maxD = null;
    const evts = [];
    clauses.forEach((c, i) => {
      EVENTS.forEach((ev) => {
        if (!ev.re.test(ev.strip ? c.replace(ev.strip, '') : c)) return;
        const pending = PENDING_RE.test(c);
        const done = !pending && DONE_RE.test(c);
        const isPending = pending || !done;
        const st = isPending ? ev.p : ev.d;
        const e = { id: ev.id, name: ev.name, stage: st, pending: isPending, clause: c, idx: i };
        evts.push(e);
        if (isPending) { if (!maxP || st > maxP.stage) maxP = e; } else if (!maxD || st > maxD.stage) maxD = e;
      });
    });
    // A terminal statement followed by later progress (e.g. "cancelled; refloated on …") is historical.
    if (terminal) {
      const after = evts.filter((e) => e.idx > lastTerminalIdx && e.stage >= 5);
      if (!after.length || terminal.stage === 22) {
        return { stage: terminal.stage, terminal: true, reason: `Status text indicates "${terminal.name}" ("${terminal.clause}")`, events: evts, highName: terminal.name };
      }
    }
    let pick = null, note = '';
    if (maxP && maxD) {
      if (maxP.stage >= maxD.stage - 1) { pick = maxP; note = ` (current statement; earlier "${maxD.name}" completed)`; }
      else { pick = maxD; note = ` (later completed milestone outranks pending "${maxP.name}")`; }
    } else pick = maxP || maxD;
    if (!pick) return { stage: null, events: evts };
    return { stage: pick.stage, terminal: false, pending: pick.pending, reason: `Status text: "${pick.clause}" → ${pick.name} ${pick.pending ? 'pending/in progress' : 'completed'}${note}`, events: evts };
  };

  /* ---------------- Record field access ---------------- */
  TMD.sheetOf = (rec) => TMD.state.workbook && TMD.state.workbook.sheets[rec.sheet];
  TMD.keyOf = (rec, f) => { const sh = TMD.sheetOf(rec); return sh ? sh.mapping[f] : undefined; };
  TMD.getStd = function (rec, f) {
    const k = TMD.keyOf(rec, f);
    return k === undefined || k === null ? undefined : rec.values[k];
  };
  TMD.hasStd = (rec, f) => !!TMD.keyOf(rec, f);
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

  TMD.recIdent = function (rec) {
    const v = (f) => str(TMD.getStd(rec, f));
    return v('crfq') || v('prNo') || v('prNo2') || v('poNo') || v('wbs') || `${rec.sheet} row ${rec.rowNum}`;
  };
  TMD.recTitle = function (rec) {
    const v = (f) => str(TMD.getStd(rec, f));
    const t = v('proposalName') || v('jobDescription') || '(No description)';
    return t.length > 140 ? t.slice(0, 137) + '…' : t;
  };

  /* ---------------- Normalised categories ---------------- */
  TMD.normChannel = function (v) {
    const s = str(v).toLowerCase();
    if (!s) return '';
    if (/p\s*&\s*cs|\bpcs\b|p\s*and\s*cs/.test(s)) return 'P&CS';
    if (/\bcpo\b/.test(s)) return 'CPO';
    return str(v);
  };
  TMD.deptCategory = function (v) {
    const s = str(v).toLowerCase();
    if (!s) return 'Unspecified';
    if (/instr|c\s*&\s*i\b|automation|scada|telecom|\bi&c\b/.test(s)) return 'Instrumentation';
    if (/elec/.test(s)) return 'Electrical';
    return 'Other';
  };
  TMD.normCapexRevex = function (rec, sheet) {
    const s = str(TMD.getStd(rec, 'capexRevex')).toUpperCase();
    if (s.indexOf('CAPEX') >= 0) return { value: 'CAPEX', inferred: false };
    if (s.indexOf('REVEX') >= 0 || s.indexOf('OPEX') >= 0) return { value: 'REVEX', inferred: false };
    if (s) return { value: s, inferred: false };
    const t = sheet && sheet.sheetType || '';
    if (/CAPEX/i.test(t) || /capex/i.test(rec.sheet)) return { value: 'CAPEX', inferred: true };
    if (/REVEX/i.test(t) || /revex/i.test(rec.sheet)) return { value: 'REVEX', inferred: true };
    return { value: 'Unspecified', inferred: true };
  };
  TMD.fyOf = function (d) {
    if (!d) return '';
    const start = +TMD.settings.get('fyStartMonth') || 4;
    const y = d.getMonth() + 1 >= start ? d.getFullYear() : d.getFullYear() - 1;
    return start === 1 ? `FY ${y}` : `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };

  /* ---------------- Milestone value helper (date or text such as "Completed") ---------------- */
  const DONE_TEXT = /complet|done|\byes\b|\bok\b|over|received|carried out|conducted|cleared|handed|witnessed|successful/;
  const NOT_DONE_TEXT = /pending|awaited|not\b|due|scheduled|planned|expected|to be|yet/;
  function milestone(rec, f, sheet) {
    const k = sheet.mapping[f];
    if (!k) return { mapped: false };
    const v = rec.values[k];
    const p = TMD.parseDate(v, rec.dateHints[k], true);
    const T = TMD.today();
    const out = { mapped: true, raw: v, parse: p, date: p.date || null, done: false, planned: false, na: false };
    if (p.kind === 'blank') return out;
    const s = str(v).toLowerCase();
    if (/^(na|n\/a|not applicable|nil|-)$/.test(s)) { out.na = true; return out; }
    if (p.date) {
      const notDone = p.kind === 'textdate' && NOT_DONE_TEXT.test(s);
      if (!notDone && p.date <= T) out.done = true; else out.planned = true;
    } else if (DONE_TEXT.test(s) && !NOT_DONE_TEXT.test(s)) out.done = true;
    else if (NOT_DONE_TEXT.test(s)) out.planned = true;
    return out;
  }

  /* ---------------- Per-record calculation ---------------- */
  const DATE_FIELDS = ['capexFinish', 'prSentDate', 'floatDate', 'prebidDate', 'openingDate', 'actualOpeningDate', 'techEvalDate', 'priceBidDate', 'tecApprovalDate', 'awardDate', 'validity'];
  const MS_FIELDS = ['sentToProcurement', 'fat', 'sat', 'installation', 'handover'];
  TMD.DATE_FIELDS = DATE_FIELDS; TMD.MS_FIELDS = MS_FIELDS;

  function amountOf(rec, f, sheet) {
    const k = sheet.mapping[f];
    if (!k) return { mapped: false, kind: 'unmapped' };
    const unit = (sheet.colMeta[k] && sheet.colMeta[k].unit) || TMD.settings.get(TMD.STD[f].unitSetting) || 'rupees';
    const r = TMD.parseAmount(rec.values[k], unit);
    r.mapped = true; r.unit = unit;
    return r;
  }
  function numOf(rec, f, sheet) {
    const k = sheet.mapping[f];
    return k ? TMD.parseNumber(rec.values[k]) : null;
  }

  function dateStage(c, sheet) {
    const d = c.d, T = TMD.today(), ms = c.ms;
    const past = (x) => x && x <= T;
    const f = (x) => TMD.fmtDate(x);
    if (ms.handover.done) return { stage: 22, reason: `Project handing over recorded${ms.handover.date ? ' on ' + f(ms.handover.date) : ''}` };
    if (ms.installation.done) return { stage: 21, reason: `Installation recorded${ms.installation.date ? ' on ' + f(ms.installation.date) : ''}; handover not yet recorded` };
    if (ms.sat.done) return { stage: 21, reason: `SAT recorded${ms.sat.date ? ' on ' + f(ms.sat.date) : ''}; installation/commissioning pending` };
    if (ms.fat.done) return { stage: 19, reason: `FAT recorded${ms.fat.date ? ' on ' + f(ms.fat.date) : ''}; material delivery / SAT pending` };
    if (past(d.awardDate)) return { stage: 16, reason: `PO/OLA awarded on ${f(d.awardDate)}` };
    if (c.hasPo) return { stage: 16, reason: 'PO/OLA number recorded (award date blank)' };
    if (past(d.tecApprovalDate)) return { stage: 15, reason: `TEC approved on ${f(d.tecApprovalDate)}; PO/OLA not yet recorded` };
    if (past(d.priceBidDate)) {
      if (sheet.mapping.tecApprovalDate) return { stage: 14, reason: `Price bid opened on ${f(d.priceBidDate)}; TEC approval not yet recorded` };
      return { stage: 15, reason: `Price bid opened on ${f(d.priceBidDate)}; PO/OLA not yet recorded` };
    }
    if (past(d.techEvalDate)) return { stage: 12, reason: `BQC/technical evaluation completed on ${f(d.techEvalDate)}; price bid not yet opened` };
    const opened = sheet.mapping.actualOpeningDate ? d.actualOpeningDate : d.openingDate;
    if (past(opened)) return { stage: 9, reason: `Bids opened on ${f(opened)}${sheet.mapping.actualOpeningDate ? ' (actual)' : ''}; BQC/technical evaluation in progress` };
    if (sheet.mapping.actualOpeningDate && past(d.openingDate)) return { stage: 7, reason: `Scheduled opening ${f(d.openingDate)} has passed; actual opening not recorded`, overdueOpening: true };
    if (d.openingDate && d.openingDate > T) {
      if (d.prebidDate && d.prebidDate >= T) return { stage: 6, reason: `Pre-bid meeting scheduled ${f(d.prebidDate)}; bid opening ${f(d.openingDate)}` };
      const days = TMD.daysBetween(T, d.openingDate);
      if (days <= (+TMD.settings.get('thrOpeningSoon') || 7)) return { stage: 7, reason: `Bid opening due on ${f(d.openingDate)} (in ${days} day${days === 1 ? '' : 's'})` };
      return { stage: 5, reason: `Tender floated${d.floatDate ? ' on ' + f(d.floatDate) : ''}; bid opening ${f(d.openingDate)}` };
    }
    if (past(d.floatDate)) return { stage: 5, reason: `Tender floated on ${f(d.floatDate)}` };
    if (d.floatDate) return { stage: 4, reason: `Tender scheduled to float on ${f(d.floatDate)}` };
    if (ms.sentToProcurement.done) return { stage: 3, reason: `Sent to P&CS/CPO${ms.sentToProcurement.date ? ' on ' + f(ms.sentToProcurement.date) : ''}; tender not yet floated` };
    if (past(d.prSentDate)) return { stage: 3, reason: `PR sent on ${f(d.prSentDate)}; tender not yet floated` };
    return null;
  }

  /** Compute everything derived for one record. */
  TMD.calcRecord = function (rec) {
    const sheet = TMD.sheetOf(rec);
    if (!sheet) return;
    const T = TMD.today();
    const c = { d: {}, dp: {}, ms: {}, alerts: [], dq: [] };
    DATE_FIELDS.forEach((f) => {
      const k = sheet.mapping[f];
      if (!k) { c.dp[f] = { kind: 'unmapped' }; c.d[f] = null; return; }
      const p = TMD.parseDate(rec.values[k], rec.dateHints[k], true);
      c.dp[f] = p; c.d[f] = p.date && (p.kind === 'date' || p.kind === 'serial' || p.kind === 'textdate') ? p.date : null;
    });
    MS_FIELDS.forEach((f) => { c.ms[f] = milestone(rec, f, sheet); });
    if (c.ms.sentToProcurement.date) c.d.sentToProcurement = c.ms.sentToProcurement.date;

    const s = (f) => str(TMD.getStd(rec, f));
    c.prNumber = s('prNo') || s('prNo2');
    c.hasPo = !!s('poNo');
    c.channel = TMD.normChannel(s('channel'));
    c.department = s('department');
    c.deptCat = TMD.deptCategory(c.department);
    const cr = TMD.normCapexRevex(rec, sheet);
    c.capexRevex = cr.value; c.capexRevexInferred = cr.inferred;
    c.initiator = s('initiator');
    c.vendor = s('vendor');
    c.nature = s('nature');
    c.ident = TMD.recIdent(rec);
    c.title = TMD.recTitle(rec);

    // Money (rupees)
    c.amt = {
      est: amountOf(rec, 'estCost', sheet), project: amountOf(rec, 'projectCost', sheet), be: amountOf(rec, 'be', sheet),
      incl: amountOf(rec, 'cashOutflowIncl', sheet), excl: amountOf(rec, 'cashOutflowExcl', sheet), co: amountOf(rec, 'cashOutflow', sheet),
    };
    const rv = (a) => (a && (a.kind === 'num' || a.kind === 'mixed') ? a.rupees : null);
    c.estRupees = rv(c.amt.est);
    c.projectRupees = rv(c.amt.project);
    c.beRupees = rv(c.amt.be);
    c.awardedRupees = rv(c.amt.excl) !== null ? rv(c.amt.excl) : rv(c.amt.co) !== null ? rv(c.amt.co) : rv(c.amt.incl);
    c.cashOutflowRupees = rv(c.amt.incl) !== null ? rv(c.amt.incl) : rv(c.amt.co) !== null ? rv(c.amt.co) : rv(c.amt.excl);
    c.taxRupees = rv(c.amt.incl) !== null && rv(c.amt.excl) !== null ? rv(c.amt.incl) - rv(c.amt.excl) : null;
    const estBase = c.estRupees !== null ? c.estRupees : c.projectRupees;
    c.estVsAward = estBase !== null && c.awardedRupees !== null ? c.awardedRupees - estBase : null;
    c.estVsAwardPct = estBase && c.awardedRupees !== null ? (c.awardedRupees - estBase) / estBase * 100 : null;

    // Durations
    const d = c.d;
    const opened = d.actualOpeningDate || d.openingDate;
    const db = TMD.daysBetween;
    c.daysSincePr = d.prSentDate ? db(d.prSentDate, T) : null;
    c.daysSinceSent = d.sentToProcurement ? db(d.sentToProcurement, T) : null;
    c.daysSinceFloat = d.floatDate && d.floatDate <= T ? db(d.floatDate, T) : null;
    c.daysToOpening = d.openingDate ? db(T, d.openingDate) : null;
    c.floatDurationCalc = d.floatDate && opened ? db(d.floatDate, opened) : null;
    c.floatDuration = c.floatDurationCalc !== null ? c.floatDurationCalc : numOf(rec, 'floatDuration', sheet);
    c.techEvalDurationCalc = opened && d.techEvalDate ? db(opened, d.techEvalDate) : null;
    c.techEvalDuration = c.techEvalDurationCalc !== null ? c.techEvalDurationCalc : numOf(rec, 'techEvalDuration', sheet);
    c.prToPoCalc = d.prSentDate && d.awardDate ? db(d.prSentDate, d.awardDate) : null;
    c.prToPo = c.prToPoCalc !== null ? c.prToPoCalc : numOf(rec, 'prToPoDuration', sheet);
    c.daysSinceAward = d.awardDate ? db(d.awardDate, T) : null;
    c.daysToExpiry = d.validity ? db(T, d.validity) : null;
    c.daysToCapexFinish = d.capexFinish ? db(T, d.capexFinish) : null;
    c.fy = TMD.fyOf(d.floatDate || d.prSentDate || d.awardDate);

    // ---- Stage engine ----
    const statusText = [s('status'), s('quickStatus')].filter(Boolean).join('; ');
    const remarksText = [s('remarks'), s('remarksAny')].filter(Boolean).join('; ');
    const tStatus = TMD.classifyText(statusText);
    const tRemarks = TMD.classifyText(remarksText);
    c.textStatus = tStatus; c.textRemarks = tRemarks;
    const dS = dateStage(c, sheet);
    c.dateStage = dS;
    let terminal = null;
    if (tStatus && tStatus.terminal) terminal = tStatus;
    else if (tRemarks && tRemarks.terminal && tRemarks.stage !== 22) terminal = tRemarks; // remarks can flag cancel/scrap/refloat/hold
    const tS = tStatus && tStatus.stage ? tStatus : (tRemarks && tRemarks.stage && !tRemarks.terminal ? tRemarks : null);
    let stage, reason, conflict = null;
    if (terminal) {
      stage = terminal.stage; reason = terminal.reason + (terminal === tRemarks ? ' [from Remarks]' : '');
      if ((stage === 24 || stage === 25) && (d.awardDate || c.hasPo) && dS && dS.stage >= 16) conflict = `Status says ${TMD.stageInfo(stage).label.toLowerCase()} but PO/OLA award details are recorded.`;
      if (stage === 26 && dS && dS.stage >= 16) conflict = 'Status says refloating required but PO/OLA award details are recorded.';
      if (stage === 22 && dS && dS.stage < 16 && (sheet.mapping.awardDate || sheet.mapping.poNo)) conflict = 'Status says completed but no PO/OLA award date or number is recorded.';
    } else if (tS && dS) {
      if (tS.stage > dS.stage) { stage = tS.stage; reason = `${tS.reason}; dates show only "${TMD.stageInfo(dS.stage).label}" (${dS.reason})`; }
      else if (tS.pending && tS.stage >= 9 && dS.stage >= 9 && dS.stage <= 16 && tS.stage >= dS.stage - 2) {
        // Dates are coarse between bid opening and award; a current status statement refines them.
        stage = tS.stage; reason = `${tS.reason} (refines date-based "${TMD.stageInfo(dS.stage).label}": ${dS.reason})`;
      } else if (tS.stage < dS.stage - 2) {
        stage = dS.stage; reason = dS.reason;
        conflict = `Status text suggests "${TMD.stageInfo(tS.stage).label}" but recorded dates indicate "${TMD.stageInfo(dS.stage).label}".`;
      } else { stage = dS.stage; reason = `${dS.reason} (consistent with status text)`; }
    } else if (dS) { stage = dS.stage; reason = dS.reason; }
    else if (tS) { stage = tS.stage; reason = tS.reason + ' (no milestone dates recorded)'; }
    else if (statusText || remarksText) { stage = 27; reason = 'Needs review: status/remarks text could not be classified and no milestone dates are recorded'; }
    else if (s('jobDescription') || s('proposalName')) { stage = 1; reason = 'No milestone dates or status recorded — assumed tender preparation'; }
    else { stage = 27; reason = 'No status, description or milestone dates recorded'; }
    c.calcStage = stage; c.calcReason = reason; c.conflict = conflict;
    if (rec.override && rec.override.stage) {
      c.stage = +rec.override.stage;
      c.stageReason = `Manual override${rec.override.note ? ': ' + rec.override.note : ''} (calculated: ${TMD.stageInfo(stage).label} — ${reason})`;
      c.overridden = true;
    } else { c.stage = stage; c.stageReason = reason; c.overridden = false; }
    const st = c.stage;
    c.stageGroup = TMD.stageInfo(st).group;
    c.awarded = (st >= 16 && st <= 22) || ((d.awardDate || c.hasPo) && st !== 24 && st !== 25 && st !== 26);
    c.completed = st === 22;
    c.closed = CLOSED_OR_EXCEPTION.has(st);

    // ---- Next milestone ----
    c.next = nextMilestone(c, sheet);

    // ---- Alerts ----
    buildAlerts(rec, c, sheet);
    c.delayed = c.alerts.some((a) => a.delay);
    c.overdue = c.alerts.some((a) => a.overdue);
    c.delayLabel = c.closed ? (st === 22 ? 'Closed' : TMD.stageInfo(st).label) : c.delayed ? 'Delayed' : 'On track';

    // ---- Record-level data quality ----
    buildRecordDq(rec, c, sheet);

    // Completeness of key fields
    const keyFields = ['prNo', 'wbs', 'channel', 'department', 'capexRevex', 'initiator', 'jobDescription', 'crfq', 'floatDate', 'openingDate', 'estCost', 'projectCost'];
    if (c.awarded) keyFields.push('poNo', 'awardDate', 'vendor', 'validity');
    let mapped = 0, filled = 0;
    keyFields.forEach((f) => {
      if (!sheet.mapping[f]) return;
      mapped++;
      if (!TMD.isBlank(rec.values[sheet.mapping[f]]) || (f === 'prNo' && c.prNumber)) filled++;
    });
    c.completeness = mapped ? Math.round(filled / mapped * 100) : null;
    rec.calc = c;
    return c;
  };

  function nextMilestone(c, sheet) {
    const st = c.stage, d = c.d, T = TMD.today();
    const fut = (x) => (x && x >= T ? x : null);
    const M = {
      1: ['Internal approval of tender documents'], 2: ['Send PR to P&CS/CPO'], 3: ['Tender floating', fut(d.floatDate)], 4: ['Tender floating', fut(d.floatDate)],
      5: ['Bid opening', fut(d.openingDate)], 6: ['Pre-bid meeting', fut(d.prebidDate) || fut(d.openingDate)], 7: ['Bid opening', d.openingDate],
      8: ['BQC evaluation'], 9: ['BQC / technical evaluation'], 10: ['Technical evaluation completion'], 11: ['Finance / commercial review'],
      12: ['Price bid opening', fut(d.priceBidDate)], 13: ['TEC approval'], 14: ['TEC approval', fut(d.tecApprovalDate)], 15: ['PO/OLA award'],
      16: [sheet.mapping.fat ? 'Drawing approval / FAT' : 'Execution / delivery'], 17: ['FAT'], 18: ['Material delivery'], 19: ['Material delivery / SAT'],
      20: ['Installation / commissioning'], 21: ['Project handing over'], 22: ['—'], 23: ['Resume (on hold)'], 24: ['—'], 25: ['—'], 26: ['Refloat tender'], 27: ['Review status'],
    };
    const m = M[st] || ['—'];
    return { label: m[0], date: m[1] || null };
  }

  function A(c, sev, type, msg, opts) { c.alerts.push(Object.assign({ sev, type, msg }, opts || {})); }

  function buildAlerts(rec, c, sheet) {
    const st = c.stage, d = c.d, T = TMD.today();
    const g = (k) => +TMD.settings.get(k);
    const db = TMD.daysBetween;
    const f = (x) => TMD.fmtDate(x);
    const active = !c.closed && st !== 27;
    if (c.conflict) A(c, 'high', 'Status/date conflict', c.conflict);
    if (st === 26) A(c, 'high', 'Tender awaiting refloating', 'Tender marked for refloating.', { delay: true });
    if (!active) return;
    // Bid opening
    if (d.openingDate && st <= 7 && d.openingDate < T) A(c, 'high', 'Bid opening overdue', `Bid opening date ${f(d.openingDate)} passed ${db(d.openingDate, T)} day(s) ago; opening not recorded.`, { delay: true, overdue: true, date: d.openingDate });
    if (d.openingDate && st <= 7 && d.openingDate >= T && db(T, d.openingDate) <= g('thrOpeningSoon')) A(c, 'medium', 'Bid opening within 7 days', `Bid opening on ${f(d.openingDate)} (in ${db(T, d.openingDate)} day(s)).`, { date: d.openingDate, upcoming: true });
    // Technical evaluation pending
    const opened = d.actualOpeningDate || d.openingDate;
    if (st >= 8 && st <= 10 && opened && opened <= T && db(opened, T) > g('thrTechEval')) A(c, 'high', 'Technical evaluation pending', `${db(opened, T)} days since bid opening (${f(opened)}); threshold ${g('thrTechEval')} days.`, { delay: true, overdue: true });
    // Price bid pending
    if ((st === 11 || st === 12) && d.techEvalDate && db(d.techEvalDate, T) > g('thrPriceBid')) A(c, 'medium', 'Price bid pending', `${db(d.techEvalDate, T)} days since technical evaluation (${f(d.techEvalDate)}); price bid not opened.`, { delay: true });
    // Award pending
    const techDone = d.tecApprovalDate || d.priceBidDate || d.techEvalDate;
    if (st >= 13 && st <= 15 && techDone && db(techDone, T) > g('thrAward')) A(c, 'high', 'Award pending after technical completion', `${db(techDone, T)} days since ${d.tecApprovalDate ? 'TEC approval' : d.priceBidDate ? 'price bid opening' : 'technical evaluation'} (${f(techDone)}); PO/OLA not recorded.`, { delay: true, overdue: true });
    // PR-to-PO threshold
    if (st < 16 && d.prSentDate && db(d.prSentDate, T) > g('thrPrToPo')) A(c, 'medium', 'PR-to-PO cycle exceeded', `${db(d.prSentDate, T)} days since PR sent (${f(d.prSentDate)}); threshold ${g('thrPrToPo')} days.`, { delay: true });
    // Not floated after being sent
    const sent = d.sentToProcurement || d.prSentDate;
    if (st >= 2 && st <= 4 && sent && db(sent, T) > g('thrNotFloated')) A(c, 'medium', 'Tender not floated after being sent to procurement', `${db(sent, T)} days since sent to P&CS/CPO (${f(sent)}); tender not floated.`, { delay: true });
    // Validity
    if (d.validity) {
      const left = db(T, d.validity);
      if (left < 0 && st >= 16) A(c, 'medium', 'PO/OLA validity expired', `PO/OLA validity ended on ${f(d.validity)} (${-left} days ago) and the record is not closed.`, { overdue: true, date: d.validity });
      else if (left >= 0 && left <= Math.max(90, g('thrValidity'))) {
        const band = left <= 30 ? 30 : left <= 60 ? 60 : 90;
        A(c, left <= 30 ? 'high' : 'medium', `PO/OLA validity expiring within ${band} days`, `Validity ends ${f(d.validity)} (in ${left} days).`, { date: d.validity, upcoming: true, validityBand: band });
      }
    }
    // CAPEX finish
    if (d.capexFinish) {
      const left = db(T, d.capexFinish);
      if (left < 0) A(c, 'high', 'CAPEX finish date passed', `CAPEX finish date ${f(d.capexFinish)} passed ${-left} day(s) ago; work not completed.`, { delay: true, overdue: true, date: d.capexFinish });
      else if (left <= g('thrCapexFinish')) A(c, 'medium', 'CAPEX finish date approaching', `CAPEX finish date ${f(d.capexFinish)} (in ${left} days).`, { date: d.capexFinish, upcoming: true });
    }
    // Post-award execution
    if (sheet.mapping.fat && (st === 16 || st === 17) && d.awardDate && !c.ms.fat.done && !c.ms.fat.na && db(d.awardDate, T) > g('thrFat')) A(c, 'medium', 'FAT overdue', `${db(d.awardDate, T)} days since award (${f(d.awardDate)}); FAT not recorded.`, { delay: true, overdue: true });
    if (st === 19 && c.ms.fat.date && db(c.ms.fat.date, T) > g('thrDelivery')) A(c, 'medium', 'Material delivery overdue', `${db(c.ms.fat.date, T)} days since FAT (${f(c.ms.fat.date)}); delivery/SAT not recorded.`, { delay: true, overdue: true });
    if ((st === 20 || st === 21) && c.ms.sat.date && !c.ms.installation.done && db(c.ms.sat.date, T) > g('thrInstall')) A(c, 'medium', 'Installation overdue', `${db(c.ms.sat.date, T)} days since SAT (${f(c.ms.sat.date)}); installation not recorded.`, { delay: true, overdue: true });
    // Planned milestones coming up (for timeline / KPI)
    [['prebidDate', 'Pre-bid meeting'], ['priceBidDate', 'Price bid'], ['tecApprovalDate', 'TEC approval'], ['floatDate', 'Tender floating']].forEach(([fld, lbl]) => {
      if (d[fld] && d[fld] > T && db(T, d[fld]) <= g('thrUpcoming')) c.alerts.push({ sev: 'low', type: 'Upcoming milestone', msg: `${lbl} on ${f(d[fld])}.`, date: d[fld], upcoming: true, silent: true });
    });
  }

  /* ---------------- Record-level data quality ---------------- */
  function Q(c, sev, field, msg, suggestion, code) { c.dq.push({ sev, field, msg, suggestion, code }); }
  function buildRecordDq(rec, c, sheet) {
    const m = sheet.mapping, st = c.stage, d = c.d;
    const blank = (f) => m[f] && TMD.isBlank(rec.values[m[f]]);
    const lbl = (f) => { const h = sheet.headers.find((x) => x.key === m[f]); return h ? h.display : TMD.STD[f].label; };
    const progressed = st >= 5 && st <= 22;
    if (m.prNo && !c.prNumber) Q(c, st <= 2 || st >= 23 ? 'low' : 'medium', lbl('prNo'), 'Missing PR number', 'Enter the PR number from SAP/ERP.', 'missing-pr');
    if (blank('wbs') && c.capexRevex === 'CAPEX') Q(c, 'medium', lbl('wbs'), 'Missing WBS number', 'Enter the WBS element for this CAPEX proposal.', 'missing-wbs');
    if (blank('channel')) Q(c, 'medium', lbl('channel'), 'Missing procurement channel', 'Select P&CS or CPO.', 'missing-channel');
    if (blank('department')) Q(c, 'medium', lbl('department'), 'Missing department', 'Enter the owning department (e.g. INSTR, ELECTRICAL).', 'missing-dept');
    if (blank('initiator')) Q(c, 'low', lbl('initiator'), 'Missing tender initiator', 'Enter the name of the tender initiator.', 'missing-initiator');
    if (progressed && blank('floatDate')) Q(c, 'medium', lbl('floatDate'), 'Missing tender floating date', 'Record the date the tender was floated.', 'missing-float');
    if (st >= 7 && st <= 22 && blank('openingDate')) Q(c, 'medium', lbl('openingDate'), 'Missing tender opening date', 'Record the (scheduled) bid opening date.', 'missing-opening');
    if (progressed && blank('crfq')) Q(c, 'medium', lbl('crfq'), 'Missing CRFQ / GeM ID', 'Enter the CRFQ number or GeM bid ID.', 'missing-crfq');
    if (c.awarded && blank('poNo')) Q(c, 'high', lbl('poNo'), 'Missing PO/OLA number after award', 'Enter the PO/OLA number issued.', 'missing-po');
    if (c.awarded && blank('vendor')) Q(c, 'high', lbl('vendor'), 'Missing vendor after award', 'Enter the name of the successful vendor.', 'missing-vendor');
    // Dates
    Object.keys(c.dp).forEach((f) => {
      const p = c.dp[f];
      if (!m[f]) return;
      if (p.kind === 'invalid') Q(c, 'high', lbl(f), `Invalid date "${str(rec.values[m[f]])}"`, 'Correct the value to a real calendar date in dd/mm/yyyy format.', 'invalid-date');
      if (p.kind === 'serial') Q(c, 'low', lbl(f), `Excel serial number ${str(rec.values[m[f]])} in a date column (read as ${TMD.fmtDate(p.date)})`, 'Format the cell as a date in Excel or enter dd/mm/yyyy.', 'serial-date');
      if (p.fmt === 'mdy') Q(c, 'medium', lbl(f), `Date "${str(rec.values[m[f]])}" appears to be in mm/dd/yyyy format (read as ${TMD.fmtDate(p.date)})`, 'Confirm the intended date and enter it as dd/mm/yyyy.', 'mdy-date');
      if (p.kind === 'textdate') Q(c, 'low', lbl(f), `Date column contains text with a date ("${str(rec.values[m[f]]).slice(0, 60)}")`, 'Keep only the date in this column and move notes to Remarks.', 'text-date');
    });
    const before = (a, b) => d[a] && d[b] && d[a] < d[b];
    if (before('actualOpeningDate', 'floatDate')) Q(c, 'high', lbl('actualOpeningDate'), 'Actual opening date is earlier than the tender floating date', 'Check both dates.', 'seq-open-float');
    if (before('openingDate', 'floatDate')) Q(c, 'high', lbl('openingDate'), 'Tender opening date is earlier than the floating date', 'Check both dates.', 'seq-open-float');
    const opened = d.actualOpeningDate || d.openingDate;
    if (d.awardDate && opened && d.awardDate < opened) Q(c, 'high', lbl('awardDate'), 'PO/OLA award date is earlier than the bid opening date', 'Check the award and opening dates.', 'seq-award-open');
    if (before('validity', 'awardDate')) Q(c, 'high', lbl('validity'), 'PO/OLA validity/expiry is earlier than the award date', 'Check the validity date.', 'seq-validity');
    if (d.techEvalDate && opened && d.techEvalDate < opened) Q(c, 'medium', lbl('techEvalDate'), 'Technical evaluation date is earlier than bid opening', 'Check the evaluation and opening dates.', 'seq-tech-open');
    if (d.prSentDate && d.floatDate && d.floatDate < d.prSentDate) Q(c, 'medium', lbl('floatDate'), 'Tender floated before the PR sent date', 'Check the PR sent and floating dates.', 'seq-float-pr');
    if (d.awardDate && d.awardDate > TMD.today()) Q(c, 'low', lbl('awardDate'), 'PO/OLA award date is in the future', 'Confirm whether this is a planned date.', 'future-award');
    // Negative durations
    [['floatDuration', c.floatDuration], ['techEvalDuration', c.techEvalDuration], ['prToPoDuration', c.prToPo]].forEach(([f, v]) => {
      if (typeof v === 'number' && v < 0) Q(c, 'medium', m[f] ? lbl(f) : TMD.STD[f].label, `Negative duration (${v} days)`, 'Check the underlying dates.', 'neg-duration');
    });
    // Costs containing text
    Object.keys(c.amt).forEach((k) => {
      const a = c.amt[k];
      const f = { est: 'estCost', project: 'projectCost', be: 'be', incl: 'cashOutflowIncl', excl: 'cashOutflowExcl', co: 'cashOutflow' }[k];
      if (a.kind === 'text') Q(c, 'medium', lbl(f), `Cost field contains text ("${str(rec.values[m[f]]).slice(0, 40)}")`, 'Enter a numeric amount; move notes to Remarks.', 'cost-text');
      if (a.kind === 'mixed') Q(c, 'low', lbl(f), `Cost field mixes text and number ("${str(rec.values[m[f]]).slice(0, 40)}"); read as ${TMD.fmtMoney(a.rupees)}`, 'Enter a plain numeric amount.', 'cost-mixed');
    });
    if (st === 22 && ((m.poNo && blank('poNo')) || (m.vendor && blank('vendor')) || (m.awardDate && blank('awardDate')))) Q(c, 'medium', 'STATUS', 'Tender marked completed but key completion details (PO/OLA no, award date or vendor) are blank', 'Complete the award details for closed tenders.', 'completed-blank');
    const awardText = c.textStatus && c.textStatus.events && c.textStatus.events.some((e) => e.id === 'award' && !e.pending);
    if (awardText && m.poNo && blank('poNo')) Q(c, 'high', lbl('poNo'), 'Status indicates award but PO/OLA number is blank', 'Enter the PO/OLA number or correct the status text.', 'award-no-po');
    // Contradictory status vs remarks
    const ts = c.textStatus, tr = c.textRemarks;
    if (ts && tr && ts.stage && tr.stage) {
      const exc = (x) => x === 24 || x === 25 || x === 26;
      if ((exc(tr.stage) && ts.stage >= 16 && ts.stage <= 22) || (exc(ts.stage) && tr.stage >= 16 && tr.stage <= 22) || Math.abs(ts.stage - tr.stage) >= 8) {
        Q(c, 'medium', 'STATUS / Remarks', `Status ("${TMD.stageInfo(ts.stage).label}") and remarks ("${TMD.stageInfo(tr.stage).label}") appear to contradict each other`, 'Review and align the status and remarks text.', 'status-remarks');
      }
    }
    if (c.conflict) Q(c, 'high', 'Calculated stage', 'Data conflict: ' + c.conflict, 'Review the status text and milestone dates.', 'conflict');
    if (st === 27) Q(c, 'low', 'STATUS', 'Current stage could not be determined', 'Update STATUS with the current activity or record milestone dates.', 'needs-review');
  }

  /* ---------------- Dataset-level checks ---------------- */
  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  TMD.datasetChecks = function (records) {
    // Duplicate identifiers (within the active dataset)
    const dupCheck = (getter, label, code) => {
      const m = new Map();
      records.forEach((r) => { const v = getter(r); if (v) { const k = v.toUpperCase().replace(/\s+/g, ''); (m.get(k) || m.set(k, []).get(k)).push(r); } });
      m.forEach((list) => {
        if (list.length < 2) return;
        list.forEach((r) => {
          const others = list.filter((x) => x !== r).map((x) => `${x.sheet} row ${x.rowNum}`).slice(0, 4).join(', ');
          r.calc.dq.push({ sev: 'medium', field: label, msg: `Duplicate ${label} "${getter(r)}" (also in ${others}${list.length > 5 ? '…' : ''})`, suggestion: 'Confirm whether these are separate tenders or duplicate entries.', code });
        });
      });
    };
    dupCheck((r) => r.calc.prNumber, 'PR number', 'dup-pr');
    dupCheck((r) => str(TMD.getStd(r, 'crfq')).replace(/^(na|n\/a|-)$/i, ''), 'CRFQ / GeM ID', 'dup-crfq');
    dupCheck((r) => str(TMD.getStd(r, 'poNo')).replace(/^(na|n\/a|-)$/i, ''), 'PO/OLA number', 'dup-po');

    // Inconsistent date formats within a column (dd/mm and mm/dd both positively present)
    const bySheetField = {};
    records.forEach((r) => Object.keys(r.calc.dp).forEach((f) => {
      const p = r.calc.dp[f];
      if (!p || !p.fmt) return;
      const k = r.sheet + '|' + f;
      const o = bySheetField[k] || (bySheetField[k] = { dmy: 0, mdy: 0, amb: [] });
      if (p.fmt === 'dmy' || p.fmt === 'excel') o.dmy++;
      if (p.fmt === 'mdy') o.mdy++;
      if (p.fmt === 'dmy?') o.amb.push(r);
    }));
    Object.keys(bySheetField).forEach((k) => {
      const o = bySheetField[k];
      if (o.mdy > 0 && o.amb.length) {
        const f = k.split('|')[1];
        o.amb.forEach((r) => r.calc.dq.push({ sev: 'medium', field: TMD.STD[f].label, msg: `Ambiguous date "${str(TMD.getStd(r, f))}" in a column that mixes dd/mm and mm/dd formats (read as ${TMD.fmtDate(r.calc.d[f])})`, suggestion: 'Confirm the intended day and month.', code: 'ambiguous-date' }));
      }
    });

    // Spelling inconsistencies in categorical fields
    ['department', 'channel', 'nature', 'initiator', 'capexRevex'].forEach((f) => {
      const variants = new Map();
      records.forEach((r) => {
        const v = str(TMD.getStd(r, f));
        if (!v) return;
        const canon = v.toLowerCase().replace(/[^a-z0-9&]/g, '');
        const e = variants.get(canon) || variants.set(canon, new Map()).get(canon);
        e.set(v, (e.get(v) || 0) + 1);
      });
      const canons = Array.from(variants.keys());
      const flagged = new Map(); // raw variant -> suggestion
      variants.forEach((raws) => {
        if (raws.size < 2) return;
        const top = Array.from(raws.entries()).sort((a, b) => b[1] - a[1])[0][0];
        raws.forEach((n, raw) => { if (raw !== top) flagged.set(raw, top); });
      });
      for (let i = 0; i < canons.length; i++) for (let j = i + 1; j < canons.length; j++) {
        const a = canons[i], b = canons[j];
        if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) === 1) {
          const ca = Array.from(variants.get(a).values()).reduce((x, y) => x + y, 0);
          const cb = Array.from(variants.get(b).values()).reduce((x, y) => x + y, 0);
          const [minor, major] = ca < cb ? [a, b] : [b, a];
          const majorRaw = Array.from(variants.get(major).keys())[0];
          variants.get(minor).forEach((n, raw) => flagged.set(raw, majorRaw));
        }
      }
      if (!flagged.size) return;
      records.forEach((r) => {
        const v = str(TMD.getStd(r, f));
        if (flagged.has(v)) r.calc.dq.push({ sev: 'low', field: TMD.STD[f].label, msg: `Potential spelling inconsistency: "${v}" vs "${flagged.get(v)}"`, suggestion: `Consider using "${flagged.get(v)}" consistently.`, code: 'spelling' });
      });
    });

    records.forEach((r) => {
      const c = r.calc;
      const sevW = { high: 20, medium: 8, low: 3 };
      c.dqScore = Math.max(0, 100 - c.dq.reduce((s, q) => s + (sevW[q.sev] || 0), 0));
      c.dqHigh = c.dq.some((q) => q.sev === 'high');
      c.hasDq = c.dq.some((q) => q.sev !== 'low' || q.code !== 'needs-review');
    });
  };

  /** Sheet-level structural issues (blank / duplicate headers). */
  TMD.sheetIssues = function (sheet) {
    const out = [];
    const hr = sheet.headerRow + (sheet.rowOffset || 0) + 1;
    sheet.headers.filter((h) => h.blank).forEach((h) => {
      const colHasData = sheet.rows.some((r) => !TMD.isBlank(r.values[h.key]));
      out.push({ sev: colHasData ? 'medium' : 'low', sheet: sheet.name, rowNum: hr, ident: 'Header row', field: `Column ${TMD.colLetter(h.index)}`, msg: `Blank source header${colHasData ? ' (column contains data)' : ''}`, suggestion: 'Add a header in the source workbook; the column is retained as ' + h.key + '.', code: 'blank-header' });
    });
    const dups = {};
    sheet.headers.filter((h) => h.dup).forEach((h) => { (dups[h.display] = dups[h.display] || []).push(h); });
    Object.keys(dups).forEach((lbl) => out.push({ sev: 'low', sheet: sheet.name, rowNum: hr, ident: 'Header row', field: lbl, msg: `Duplicate source header "${lbl}" in columns ${dups[lbl].map((h) => TMD.colLetter(h.index)).join(', ')}`, suggestion: `Both are kept (internal keys ${dups[lbl].map((h) => h.key).join(', ')}). Assign friendly labels in Settings if helpful.`, code: 'dup-header' }));
    return out;
  };

  /* ---------------- Recalculate everything ---------------- */
  TMD.recalcAll = function () {
    const recs = TMD.state.records;
    for (let i = 0; i < recs.length; i++) TMD.calcRecord(recs[i]);
    TMD.datasetChecks(recs);
    TMD.emit('recalculated');
  };
  /** Fast path after editing one record: recompute it, then dataset-level checks. */
  TMD.recalcRecord = function (rec) {
    TMD.calcRecord(rec);
    // dataset checks append to dq; recompute record dq for all to avoid duplicates
    TMD.state.records.forEach((r) => { if (r !== rec) { r.calc.dq = r.calc.dq.filter((q) => !/^(dup-|ambiguous-date|spelling)/.test(q.code)); } });
    TMD.datasetChecks(TMD.state.records);
  };

  /** Milestones for timeline/calendar. */
  const MS_TYPES = [
    ['prSentDate', 'PR sent'], ['sentToProcurement', 'Sent to procurement'], ['floatDate', 'Tender floated'], ['prebidDate', 'Pre-bid meeting'],
    ['openingDate', 'Bid opening'], ['techEvalDate', 'Technical evaluation'], ['priceBidDate', 'Price bid'], ['tecApprovalDate', 'TEC approval'],
    ['awardDate', 'Award'], ['fat', 'FAT'], ['sat', 'SAT'], ['installation', 'Installation'], ['handover', 'Handover'], ['validity', 'Validity expiry'], ['capexFinish', 'CAPEX finish'],
  ];
  TMD.MS_TYPES = MS_TYPES;
  TMD.milestonesOf = function (rec) {
    const c = rec.calc, out = [];
    MS_TYPES.forEach(([f, label]) => {
      let date = c.d[f];
      if (!date && c.ms[f]) date = c.ms[f].date;
      if (f === 'openingDate' && c.d.actualOpeningDate) date = c.d.actualOpeningDate;
      if (date) out.push({ field: f, type: label, date, rec });
    });
    return out;
  };
})();
