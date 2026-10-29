/* =====================================================================
 * data-normaliser.js
 *  - header row detection (tolerates merged title rows)
 *  - safe internal keys for blank / duplicate headers (PR_No_1, PR_No_2 …)
 *  - configurable mapping of source columns → standard analytical fields
 *  - tolerant date / amount / identifier parsing (source values never altered)
 *  - import report
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  /* ---------------- Standard analytical fields ---------------- */
  // type: id | cat | text | longtext | date | milestone (date or text) | amount | number
  const STD = {
    srNo: { label: 'SR No', type: 'text' },
    channel: { label: 'Procurement Channel (P&CS / CPO)', type: 'cat' },
    department: { label: 'Department', type: 'cat' },
    capexRevex: { label: 'CAPEX / REVEX', type: 'cat' },
    initiator: { label: 'Tender Initiator', type: 'cat' },
    wbs: { label: 'WBS No', type: 'id' },
    projectCost: { label: 'Project Cost', type: 'amount', unitSetting: 'unitProjectCost' },
    be: { label: 'BE (Budget Estimate)', type: 'amount', unitSetting: 'unitBE' },
    capexFinish: { label: 'CAPEX Finish Date', type: 'date' },
    prNo: { label: 'PR No', type: 'id' },
    prNo2: { label: 'PR No (2nd column)', type: 'id' },
    prSentDate: { label: 'PR Sent Date', type: 'date' },
    proposalName: { label: 'Proposal Name', type: 'longtext' },
    jobDescription: { label: 'Job Description', type: 'longtext' },
    status: { label: 'STATUS', type: 'longtext' },
    crfq: { label: 'CRFQ / GeM ID', type: 'id' },
    sentToProcurement: { label: 'Sent to Concerned CPO/P&CS', type: 'milestone' },
    floatDate: { label: 'Tender Floating Date', type: 'date' },
    floatDuration: { label: 'Tender Floating Duration (days)', type: 'number' },
    prebidDate: { label: 'Pre-Bid Meeting Date', type: 'date' },
    openingDate: { label: 'Tender / Bid Opening Date', type: 'date' },
    actualOpeningDate: { label: 'Actual Tender Opening Date', type: 'date' },
    techEvalDate: { label: 'BQC & Technical Evaluation Date', type: 'date' },
    techEvalDuration: { label: 'Technical Evaluation Duration (days)', type: 'number' },
    priceBidDate: { label: 'Price Bid Opened On', type: 'date' },
    tecApprovalDate: { label: 'TEC Approval Date', type: 'date' },
    fat: { label: 'FAT', type: 'milestone' },
    sat: { label: 'SAT', type: 'milestone' },
    installation: { label: 'Installation', type: 'milestone' },
    poNo: { label: 'PO / OLA No', type: 'id' },
    awardDate: { label: 'PO / OLA Award Date', type: 'date' },
    prToPoDuration: { label: 'PR to PO Cycle (days)', type: 'number' },
    sla: { label: 'SLA', type: 'text' },
    validity: { label: 'PO / OLA Validity', type: 'date' },
    cashOutflowIncl: { label: 'Cash Outflow (incl. tax)', type: 'amount', unitSetting: 'unitCashOutflow' },
    cashOutflowExcl: { label: 'Cash Outflow (excl. tax)', type: 'amount', unitSetting: 'unitCashOutflow' },
    cashOutflow: { label: 'PO / OLA Cash Outflow', type: 'amount', unitSetting: 'unitCashOutflow' },
    vendor: { label: 'Vendor', type: 'cat' },
    remarks: { label: 'Remarks', type: 'longtext' },
    remarksAny: { label: 'Remarks (if any)', type: 'longtext' },
    nature: { label: 'Nature', type: 'cat' },
    estCost: { label: 'Estimated Cost', type: 'amount', unitSetting: 'unitEstCost' },
    handover: { label: 'Project Handing Over', type: 'milestone' },
    daysSinceFloat: { label: 'Days Since Float (source)', type: 'number' },
    daysToOpening: { label: 'Days to Opening (source)', type: 'number' },
    statusFlag: { label: 'Status Flag', type: 'cat' },
    quickStatus: { label: 'Quick Status', type: 'cat' },
  };
  TMD.STD = STD;

  // Ordered header-recognition rules (first match wins; each field used once per sheet).
  const RULES = [
    [/^(s\.?\s*r\.?|sl\.?|s\.)\s*no\.?$|^sr\.?\s*no|^serial\s*no/, 'srNo'],
    [/procurement\s*channel|^p\s*&\s*cs\s*\/\s*cpo$/, 'channel'],
    [/capex\s*\/\s*revex|capex\s*or\s*revex/, 'capexRevex'],
    [/capex\s*finish/, 'capexFinish'],
    [/^dep(t|artment)\b/, 'department'],
    [/initiator|indent(o|e)r|tender\s*owner|^owner/, 'initiator'],
    [/\bwbs\b/, 'wbs'],
    [/project\s*cost/, 'projectCost'],
    [/^be\b|budget\s*estimate/, 'be'],
    [/pr\s*sent/, 'prSentDate'],
    [/pr\s*to\s*po/, 'prToPoDuration'],
    [/^pr\s*(no|number|#)/, 'prNo'],
    [/proposal/, 'proposalName'],
    [/job\s*desc|^description|scope\s*of\s*work/, 'jobDescription'],
    [/status\s*flag/, 'statusFlag'],
    [/quick\s*status/, 'quickStatus'],
    [/^status\b|current\s*status/, 'status'],
    [/crfq|gem\s*id|tender\s*id|bid\s*no/, 'crfq'],
    [/sento|sent\s*to\s*conc|sent\s*to\s*(cpo|p\s*&\s*cs|procurement)/, 'sentToProcurement'],
    [/float(ing)?\s*duration/, 'floatDuration'],
    [/days\s*since\s*float/, 'daysSinceFloat'],
    [/days\s*to\s*open/, 'daysToOpening'],
    [/float(ing|ed)?\s*(date|on)|date\s*of\s*float/, 'floatDate'],
    [/pre[\s-]*bid/, 'prebidDate'],
    [/actual.*open/, 'actualOpeningDate'],
    [/tech(nical)?\.?\s*eval(uation)?\s*duration/, 'techEvalDuration'],
    [/price\s*bid/, 'priceBidDate'],
    [/bqc|technical\s*evaluation/, 'techEvalDate'],
    [/tec\s*approval/, 'tecApprovalDate'],
    [/(tender|bid)\s*open(ing)?|opening\s*date/, 'openingDate'],
    [/^fat\b|factory\s*acceptance/, 'fat'],
    [/^sat\b|site\s*acceptance/, 'sat'],
    [/^install|commissioning/, 'installation'],
    [/award\s*date|date\s*of\s*award/, 'awardDate'],
    [/validity/, 'validity'],
    [/cash\s*out\s*flow.*(incl|with\s)/, 'cashOutflowIncl'],
    [/cash\s*out\s*flow.*(excl|without)/, 'cashOutflowExcl'],
    [/cash\s*out\s*flow|order\s*value|po\s*value|awarded\s*value/, 'cashOutflow'],
    [/po\s*\/?\s*ola\s*(no|number)|^po\s*no|^ola\s*no|^loa\s*no/, 'poNo'],
    [/^sla\b/, 'sla'],
    [/vendor|contractor|supplier|party\s*name/, 'vendor'],
    [/^remarks?\s*\(?\s*if\s*any/, 'remarksAny'],
    [/^remarks?\b/, 'remarks'],
    [/^nature/, 'nature'],
    [/estimated\s*cost|^estimate/, 'estCost'],
    [/handing\s*over|hand\s*over|handover/, 'handover'],
  ];

  const normLabel = (s) => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  TMD.normLabel = normLabel;

  TMD.matchStd = function (label) {
    const l = normLabel(label);
    if (!l || l.indexOf('[calc]') === 0) return null; // calculated columns from an earlier export are never mapped
    for (const [re, f] of RULES) if (re.test(l)) return f;
    return null;
  };

  /** Build the std → key mapping for a header list (respecting saved overrides). */
  TMD.autoMapping = function (headers) {
    const map = {};
    headers.forEach((h) => {
      let f = TMD.matchStd(h.label);
      if (!f) return;
      if (map[f]) {
        if (f === 'prNo' && !map.prNo2) f = 'prNo2';
        else if (f === 'remarks' && !map.remarksAny) f = 'remarksAny';
        else return;
      }
      map[f] = h.key;
    });
    // A sheet with only "Remarks (if any)" uses it as its main remarks field too.
    return map;
  };

  /* ---------------- Column-letter helper ---------------- */
  TMD.colLetter = function (i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };

  /* ---------------- Header row detection ---------------- */
  TMD.detectHeaderRow = function (aoa) {
    let best = -1, bestScore = -1;
    const limit = Math.min(aoa.length, 30);
    for (let r = 0; r < limit; r++) {
      const row = aoa[r];
      if (!row) continue;
      let strings = 0, matches = 0, nums = 0;
      const seen = new Set();
      row.forEach((v) => {
        if (v === null || v === undefined || v === '') return;
        if (typeof v === 'number') { nums++; return; }
        const s = String(v).trim();
        if (s.length > 0 && s.length < 90) strings++;
        const f = TMD.matchStd(s);
        if (f && !seen.has(f)) { matches++; seen.add(f); }
      });
      const score = matches * 4 + strings - nums * 2;
      if (strings >= 2 && score > bestScore) { best = r; bestScore = score; }
    }
    if (best < 0) best = aoa.findIndex((r) => !!r);
    return Math.max(0, best);
  };

  /* ---------------- Safe keys for headers ---------------- */
  function safeBase(label, idx) {
    const s = String(label || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) return 'Column_' + TMD.colLetter(idx);
    return /^[0-9]/.test(s) ? 'C_' + s : s;
  }
  TMD.buildHeaders = function (headerCells, nCols) {
    const raw = [];
    for (let c = 0; c < nCols; c++) {
      const v = headerCells ? headerCells[c] : null;
      const label = v === null || v === undefined ? '' : (typeof v === 'number' ? TMD.numToPlainString(v) : String(v));
      raw.push({ index: c, label, blank: label.trim() === '' });
    }
    const counts = {};
    raw.forEach((h) => { h.base = safeBase(h.label, h.index); h.norm = normLabel(h.label); counts[h.base] = (counts[h.base] || 0) + 1; });
    const occ = {};
    const used = new Set();
    raw.forEach((h) => {
      let key = h.base;
      if (counts[h.base] > 1) { occ[h.base] = (occ[h.base] || 0) + 1; key = h.base + '_' + occ[h.base]; h.dup = true; }
      while (used.has(key)) key += '_x';
      used.add(key);
      h.key = key;
      h.display = h.blank ? `(Blank header – column ${TMD.colLetter(h.index)})` : h.label.replace(/\s+/g, ' ').trim();
    });
    return raw;
  };

  /* ---------------- Date parsing ---------------- */
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const DATE_RE = [
    /(\b\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/,
    /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/,
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-.\/]*([A-Za-z]{3,9})[\s\-.,\/']*(\d{4}|\d{2})\b/,
    /\b([A-Za-z]{3,9})[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/,
  ];
  function mk(y, m, d) {
    if (y < 100) y += 2000;
    if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null; // e.g. 31/02
    return dt;
  }
  const DATE_RE_ANCHORED = DATE_RE.map((re) => new RegExp('^\\s*' + re.source.replace(/\\b/g, '') + '\\s*$'));
  function tryPatterns(s, anchored) {
    for (let i = 0; i < DATE_RE.length; i++) {
      const re = anchored ? DATE_RE_ANCHORED[i] : DATE_RE[i];
      const m = re.exec(s);
      if (!m) continue;
      if (i === 0) {
        const a = +m[1], b = +m[2], y = +m[3];
        if (a > 12 && b <= 12) { const d = mk(y, b, a); return d ? { date: d, fmt: 'dmy' } : { invalid: true }; }
        if (b > 12 && a <= 12) { const d = mk(y, a, b); return d ? { date: d, fmt: 'mdy' } : { invalid: true }; }
        if (a > 12 && b > 12) return { invalid: true };
        const d = mk(y, b, a);
        return d ? { date: d, fmt: a === b ? 'dmy' : 'dmy?' } : { invalid: true };
      }
      if (i === 1) { const d = mk(+m[1], +m[2], +m[3]); return d ? { date: d, fmt: 'iso' } : { invalid: true }; }
      if (i === 2) { const mo = MON[m[2].toLowerCase()]; if (!mo) continue; const d = mk(+m[3], mo, +m[1]); return d ? { date: d, fmt: 'text' } : { invalid: true }; }
      if (i === 3) { const mo = MON[m[1].toLowerCase()]; if (!mo) continue; const d = mk(+m[3], mo, +m[2]); return d ? { date: d, fmt: 'text' } : { invalid: true }; }
    }
    return null;
  }

  /**
   * Parse a source value as a date WITHOUT changing the source value.
   * kind: blank | date | serial | text (non-date text) | textdate (date found inside text) | invalid
   * fmt : excel | dmy | dmy? (both parts ≤ 12, read as dd/mm per setting) | mdy | iso | text | serial
   */
  TMD.parseDate = function (v, hint, allowSerial) {
    if (hint) { const d = TMD.fromIso(hint); if (d) return { kind: 'date', date: d, fmt: 'excel' }; }
    if (v === null || v === undefined) return { kind: 'blank' };
    if (v instanceof Date) return isNaN(v) ? { kind: 'invalid' } : { kind: 'date', date: v, fmt: 'excel' };
    if (typeof v === 'number') {
      if (allowSerial !== false && v >= 20000 && v <= 80000) return { kind: 'serial', date: TMD.serialToDate(Math.floor(v)), fmt: 'serial' };
      return { kind: 'invalid' };
    }
    let s = String(v).trim();
    if (!s) return { kind: 'blank' };
    if (/^\d{5}(\.\d+)?$/.test(s) && allowSerial !== false) {
      const n = parseFloat(s);
      if (n >= 20000 && n <= 80000) return { kind: 'serial', date: TMD.serialToDate(Math.floor(n)), fmt: 'serial' };
    }
    s = s.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, '');
    const full = tryPatterns(s, true);
    if (full) return full.invalid ? { kind: 'invalid' } : { kind: 'date', date: full.date, fmt: full.fmt };
    const inner = tryPatterns(s, false);
    if (inner && !inner.invalid) return { kind: 'textdate', date: inner.date, fmt: inner.fmt };
    if (/\d{1,4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,4}/.test(s)) return { kind: 'invalid' };
    return { kind: 'text' };
  };

  /* ---------------- Amount / number parsing ---------------- */
  const UNIT_FACTOR = { rupees: 1, lakh: 1e5, crore: 1e7 };
  TMD.UNIT_FACTOR = UNIT_FACTOR;
  TMD.unitFromHeader = function (label) {
    const l = normLabel(label);
    if (/\blac|lakh|lacs|lakhs/.test(l)) return 'lakh';
    if (/crore|\bcr\b|\(cr\)|in cr/.test(l)) return 'crore';
    if (/\brs\b|rupees|\binr\b|₹/.test(l)) return 'rupees';
    return null;
  };
  /** Returns {kind: blank|na|num|text, value (in source unit), rupees}. */
  TMD.parseAmount = function (v, unit) {
    if (v === null || v === undefined) return { kind: 'blank' };
    if (typeof v === 'number') return { kind: 'num', value: v, rupees: v * (UNIT_FACTOR[unit] || 1) };
    const s = String(v).trim().toLowerCase();
    if (!s) return { kind: 'blank' };
    if (/^(na|n\/a|nil|-+|—|tbd|tba|not applicable|not available)$/.test(s)) return { kind: 'na' };
    let u = unit;
    if (/\bcr(ore)?s?\b/.test(s)) u = 'crore';
    else if (/\b(lakh|lakhs|lac|lacs|l)\b/.test(s)) u = 'lakh';
    else if (/(₹|\brs\.?|\binr\b|rupees)/.test(s)) u = 'rupees';
    const m = /-?\d[\d,]*(\.\d+)?|-?\.\d+/.exec(s);
    if (!m) return { kind: 'text' };
    const n = parseFloat(m[0].replace(/,/g, ''));
    if (isNaN(n)) return { kind: 'text' };
    // Text with a number and other words, e.g. "approx 12 L incl GST" → usable but flagged.
    const leftover = s.replace(m[0], '').replace(/(₹|\brs\.?|\binr\b|rupees|crores?|\bcr\b|lakhs?|lacs?|\bl\b|\/-|[\s.,()])/g, '');
    return { kind: leftover ? 'mixed' : 'num', value: n, rupees: n * (UNIT_FACTOR[u] || 1) };
  };
  TMD.parseNumber = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
  };

  /* ---------------- Sheet type recognition ---------------- */
  TMD.recogniseSheet = function (name, mapping) {
    const n = normLabel(name);
    const has = (f) => !!mapping[f];
    if ((has('wbs') || has('proposalName')) && (has('daysSinceFloat') || has('quickStatus') || has('statusFlag'))) return 'CAPEX tracker (modified)';
    if (has('wbs') || has('proposalName') || has('projectCost')) return 'CAPEX tracker';
    if (has('initiator') && has('estCost') && has('capexRevex')) return 'Contract monitoring';
    if (has('initiator') && has('estCost')) return 'REVEX tracker';
    if (/revex/.test(n)) return 'REVEX tracker';
    if (/capex/.test(n)) return 'CAPEX tracker';
    const core = ['prNo', 'jobDescription', 'crfq', 'floatDate', 'poNo', 'vendor'].filter(has).length;
    return core >= 3 ? 'Tender list (generic)' : 'Utility / other sheet';
  };

  const ID_STD = new Set(['wbs', 'prNo', 'prNo2', 'crfq', 'poNo', 'srNo']);
  const DATE_STD = new Set(['capexFinish', 'prSentDate', 'floatDate', 'prebidDate', 'openingDate', 'actualOpeningDate', 'techEvalDate', 'priceBidDate', 'tecApprovalDate', 'awardDate', 'validity']);
  const MILESTONE_STD = new Set(['sentToProcurement', 'fat', 'sat', 'installation', 'handover']);
  TMD.DATE_STD = DATE_STD; TMD.MILESTONE_STD = MILESTONE_STD; TMD.ID_STD = ID_STD;

  /** Is a header (or mapped field) an identifier column that must stay text? */
  function isIdentifierHeader(h, std) {
    if (std && ID_STD.has(std)) return true;
    return /\b(no|number|id|code|ref)\b\.?$|\bno\.?\b|\bid\b/.test(h.norm) && !/days|duration|cost|value|amount|qty|quantity/.test(h.norm);
  }

  /**
   * Build a Sheet object from raw reader output.
   * raw: {aoa, hints, merges, rowOffset}
   * opts: {headerRow, minFilled, skipInsufficient}
   */
  TMD.buildSheet = function (name, raw, opts) {
    const o = Object.assign({ headerRow: null, minFilled: 2, skipInsufficient: true }, opts || {});
    const aoa = raw.aoa || [];
    const headerRow = o.headerRow === null || o.headerRow === undefined ? TMD.detectHeaderRow(aoa) : o.headerRow;
    const rowOffset = raw.rowOffset || 0;
    // Determine column count: furthest non-empty cell in header or data
    let nCols = 0;
    aoa.forEach((row, r) => {
      if (!row || r < headerRow) return;
      for (let c = row.length - 1; c >= 0; c--) if (row[c] !== null && row[c] !== '') { nCols = Math.max(nCols, c + 1); break; }
    });
    const headers = TMD.buildHeaders(aoa[headerRow], nCols);
    const savedMap = TMD.ls.get('mapping.' + TMD.sheetSignature(name, headers), null);
    const mapping = savedMap || TMD.autoMapping(headers);
    const stdByKey = {};
    Object.keys(mapping).forEach((f) => { stdByKey[mapping[f]] = f; });

    const idKeys = new Set(headers.filter((h) => isIdentifierHeader(h, stdByKey[h.key])).map((h) => h.key));
    const report = {
      sheet: name, headerRow: headerRow + rowOffset + 1, blankRows: 0, insufficientRows: [], skippedRows: 0,
      blankHeaders: headers.filter((h) => h.blank).map((h) => TMD.colLetter(h.index)),
      duplicateHeaders: [], dateColumns: [], numericColumns: [], invalidDates: [], serialDates: [], warnings: [],
    };
    const dupGroups = {};
    headers.filter((h) => h.dup).forEach((h) => { (dupGroups[h.display] = dupGroups[h.display] || []).push(h.key); });
    report.duplicateHeaders = Object.keys(dupGroups).map((k) => ({ label: k, keys: dupGroups[k] }));

    const rows = [];
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) { report.blankRows++; continue; }
      let filled = 0;
      for (let c = 0; c < nCols; c++) if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') filled++;
      if (filled === 0) { report.blankRows++; continue; }
      const excelRow = r + rowOffset + 1;
      if (filled < o.minFilled) {
        report.insufficientRows.push(excelRow);
        if (o.skipInsufficient) { report.skippedRows++; continue; }
      }
      const values = {};
      const dateHints = {};
      headers.forEach((h) => {
        let v = row[h.index];
        if (v === undefined) v = null;
        if (typeof v === 'number' && idKeys.has(h.key)) v = TMD.numToPlainString(v);
        values[h.key] = v;
        const hint = raw.hints && raw.hints[r + ':' + h.index];
        if (hint) dateHints[h.key] = hint;
      });
      rows.push({ id: TMD.uid('r'), sheet: name, rowNum: excelRow, values, dateHints, edited: false, editedKeys: [], isNew: false, override: null, followUps: [] });
    }

    // Column profiling
    const colMeta = {};
    headers.forEach((h) => {
      const std = stdByKey[h.key];
      let nonBlank = 0, nums = 0, dates = 0, serials = 0, invalid = 0;
      rows.forEach((rec) => {
        const v = rec.values[h.key];
        if (TMD.isBlank(v)) return;
        nonBlank++;
        if (typeof v === 'number') nums++;
        if (rec.dateHints[h.key]) { dates++; return; }
        if (typeof v === 'string' && /^-?[\d,]+(\.\d+)?$/.test(v.trim())) nums++;
      });
      const headerSaysDate = /\bdate\b|\bdt\b|validity|\bon$/.test(h.norm) && !/duration|days/.test(h.norm);
      let isDate = (std && (DATE_STD.has(std) || MILESTONE_STD.has(std))) || headerSaysDate || (nonBlank > 0 && dates / nonBlank > 0.6);
      if (std && STD[std] && ['amount', 'number', 'id'].indexOf(STD[std].type) >= 0) isDate = false;
      if (isDate) {
        rows.forEach((rec) => {
          const v = rec.values[h.key];
          if (TMD.isBlank(v) || rec.dateHints[h.key]) return;
          const p = TMD.parseDate(v, null, true);
          if (p.kind === 'serial') { serials++; if (report.serialDates.length < 200) report.serialDates.push({ row: rec.rowNum, col: h.display, value: v, asDate: TMD.fmtDate(p.date) }); }
          if (p.kind === 'invalid') { invalid++; if (report.invalidDates.length < 200) report.invalidDates.push({ row: rec.rowNum, col: h.display, value: v }); }
        });
        report.dateColumns.push(h.display);
      }
      const isNumeric = !isDate && !idKeys.has(h.key) && nonBlank > 0 && nums / nonBlank >= 0.7;
      if (isNumeric) report.numericColumns.push(h.display);
      let type = std ? STD[std].type : (isDate ? 'date' : isNumeric ? 'number' : idKeys.has(h.key) ? 'id' : 'text');
      if (!std && type === 'text') {
        let longCount = 0;
        rows.forEach((rec) => { const v = rec.values[h.key]; if (typeof v === 'string' && (v.length > 60 || v.indexOf('\n') >= 0)) longCount++; });
        if (longCount > 0 && longCount / Math.max(1, nonBlank) > 0.2) type = 'longtext';
      }
      if (type === 'milestone' && !isDate) type = 'text';
      const unit = std && STD[std] && STD[std].type === 'amount' ? (TMD.unitFromHeader(h.label) || null) : null;
      colMeta[h.key] = { std: std || null, type, isDate, isNumeric, isId: idKeys.has(h.key), unit, nonBlank, serials, invalid };
    });

    if (report.blankHeaders.length) report.warnings.push(`${report.blankHeaders.length} column(s) have blank headers (${report.blankHeaders.join(', ')}). They are retained with generated internal keys.`);
    if (report.duplicateHeaders.length) report.warnings.push(`Duplicate headers detected: ${report.duplicateHeaders.map((d) => `"${d.label}" → ${d.keys.join(', ')}`).join('; ')}. All columns are retained.`);
    if (report.serialDates.length) report.warnings.push(`${report.serialDates.length} numeric value(s) in date columns look like Excel serial dates. Source values are kept; they are interpreted as dates for monitoring only.`);
    if (report.invalidDates.length) report.warnings.push(`${report.invalidDates.length} value(s) in date columns could not be read as valid dates.`);
    if (report.insufficientRows.length) report.warnings.push(`${report.insufficientRows.length} row(s) have fewer than ${o.minFilled} filled cells${o.skipInsufficient ? ' and were not loaded' : ''} (rows ${report.insufficientRows.slice(0, 15).join(', ')}${report.insufficientRows.length > 15 ? '…' : ''}).`);
    if (headerRow > 0) report.warnings.push(`${headerRow} title/blank row(s) above the header were detected and preserved for export.`);

    const preHeader = aoa.slice(0, headerRow).map((r) => (r ? r.slice(0, Math.max(nCols, r.length)) : null));
    const merges = (raw.merges || []).filter((m) => m.e.r < headerRow);
    const sheetType = TMD.recogniseSheet(name, mapping);
    report.rows = rows.length; report.columns = headers.length; report.sheetType = sheetType;
    return {
      name, headerRow, rowOffset, preHeader, merges, headers, mapping, mappingSaved: !!savedMap, colMeta, rows, report, sheetType,
      friendly: TMD.ls.get('friendly.' + TMD.sheetSignature(name, headers), {}),
    };
  };

  /** Stable signature of a sheet layout (used to remember layouts / mappings locally). */
  TMD.sheetSignature = function (name, headers) {
    const s = name + '|' + headers.map((h) => h.norm).join('|');
    let hsh = 0;
    for (let i = 0; i < s.length; i++) { hsh = ((hsh << 5) - hsh + s.charCodeAt(i)) | 0; }
    return (name.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'sheet') + '_' + (hsh >>> 0).toString(36);
  };

  /** Re-derive column metadata after the user changes the mapping. */
  TMD.applyMapping = function (sheet, mapping) {
    sheet.mapping = mapping;
    const stdByKey = {};
    Object.keys(mapping).forEach((f) => { if (mapping[f]) stdByKey[mapping[f]] = f; });
    sheet.headers.forEach((h) => {
      const m = sheet.colMeta[h.key];
      const std = stdByKey[h.key] || null;
      m.std = std;
      if (std) {
        m.type = STD[std].type;
        m.isDate = DATE_STD.has(std) || MILESTONE_STD.has(std);
        if (STD[std].type === 'amount') m.unit = TMD.unitFromHeader(h.label);
      }
    });
    sheet.sheetType = TMD.recogniseSheet(sheet.name, mapping);
  };
})();
