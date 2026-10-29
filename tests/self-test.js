/* self-test.js — automated checks for the offline engine (no network). */
(function () {
  'use strict';
  const TMD = window.TMD;
  const rows = [];
  let pass = 0, fail = 0;
  const t = (name, expected, actual) => {
    const ok = JSON.stringify(expected) === JSON.stringify(actual);
    ok ? pass++ : fail++;
    rows.push(`<tr><td class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</td><td>${TMD.esc(name)}</td><td><code>${TMD.esc(JSON.stringify(expected))}</code></td><td><code>${TMD.esc(JSON.stringify(actual))}</code></td></tr>`);
  };
  const d = (v, hint) => { const p = TMD.parseDate(v, hint, true); return [p.kind, p.date ? TMD.isoDate(p.date) : null, p.fmt || null]; };

  // Dates
  t('dd/mm/yyyy', ['date', '2026-09-04', 'dmy?'], d('04/09/2026'));
  t('dd-mm-yyyy (day > 12)', ['date', '2026-09-24', 'dmy'], d('24-09-2026'));
  t('mm/dd/yyyy positively identified', ['date', '2026-10-25', 'mdy'], d('10/25/2026'));
  t('"31 Aug 2026"', ['date', '2026-08-31', 'text'], d('31 Aug 2026'));
  t('"Aug 31, 2026"', ['date', '2026-08-31', 'text'], d('Aug 31, 2026'));
  t('ISO yyyy-mm-dd', ['date', '2026-11-04', 'iso'], d('2026-11-04'));
  t('Two-digit year dd.mm.yy', ['date', '2026-08-31', 'dmy'], d('31.08.26'));
  t('Impossible date 31/02/2026 is invalid', ['invalid', null, null], d('31/02/2026'));
  t('Excel serial number', ['serial', '2026-10-05', 'serial'], d(46300));
  t('Excel date hint wins', ['date', '2026-09-04', 'excel'], d('04-09-2026', '2026-09-04'));
  t('Date inside text', ['textdate', '2026-08-12', 'dmy?'], d('Completed on 12/08/2026'));
  t('Plain text in date column', ['text', null, null], d('Completed'));
  t('Blank', ['blank', null, null], d('  '));

  // Amounts
  t('Amount in lakh header', 190000, TMD.parseAmount(1.9, 'lakh').rupees);
  t('Amount text with crore', 25000000, TMD.parseAmount('2.5 Cr', 'rupees').rupees);
  t('Amount "approx 25 lakh" flagged mixed', ['mixed', 2500000], (() => { const a = TMD.parseAmount('approx 25 lakh', 'rupees'); return [a.kind, a.rupees]; })());
  t('Amount "TBD" treated as n/a', 'na', TMD.parseAmount('TBD', 'lakh').kind);
  t('Amount "₹ 1,18,00,000"', 11800000, TMD.parseAmount('₹ 1,18,00,000', 'rupees').rupees);
  t('Unit from header "(In Lacs)"', 'lakh', TMD.unitFromHeader('Estimated Cost (In Lacs)'));

  // Identifiers & headers
  t('Large id never scientific', '123456789012345680000', TMD.numToPlainString(1.2345678901234568e20));
  const hs = TMD.buildHeaders(['SR NO', 'PR No', 'PR sent date', 'PR No', null], 5);
  t('Duplicate headers get safe keys', ['SR_NO', 'PR_No_1', 'PR_sent_date', 'PR_No_2', 'Column_E'], hs.map((h) => h.key));
  t('Duplicate PR No mapped to prNo / prNo2', ['PR_No_1', 'PR_No_2'], (() => { const m = TMD.autoMapping(hs); return [m.prNo, m.prNo2]; })());
  t('Header row detected below merged title rows', 3, TMD.detectHeaderRow([['TITLE'], ['subtitle'], null, ['SR NO', 'Department', 'PR No', 'Job Description', 'STATUS'], [1, 'INSTR', 123, 'x', 'y']]));
  t('Header mapping: "Price Bid Open On"', 'priceBidDate', TMD.matchStd('Price Bid Open On'));
  t('Header mapping: "Actual tender opening date"', 'actualOpeningDate', TMD.matchStd('Actual tender opening date'));
  t('Header mapping: "PR TO PO CYCLE duration in days"', 'prToPoDuration', TMD.matchStd('PR TO PO CYCLE duration in days'));
  t('Header mapping: "Sento Concenred CPO/P&CS"', 'sentToProcurement', TMD.matchStd('Sento Concenred CPO/P&CS'));
  t('[Calc] columns are never mapped', null, TMD.matchStd('[Calc] Days to Bid Opening'));

  // Status text classification
  const cls = (s) => { const r = TMD.classifyText(s); return r && r.stage ? TMD.stageInfo(r.stage).label : null; };
  t('Award under processing', 'Award in Progress', cls('Technical evaluation completed; price bid opened; award under processing'));
  t('Earlier completion does not mean completed', 'Finance/Commercial Evaluation', cls('Technical evaluation completed; finance concurrence pending'));
  t('Post-award: inspection pending', 'FAT', cls('LOA awarded; drawing approval completed; inspection pending'));
  t('Cancelled is high priority', 'Cancelled', cls('Tender cancelled due to change in scope'));
  t('Scrapped', 'Scrapped', cls('Proposal scrapped'));
  t('Refloat required', 'Refloating Required', cls('Single bid received; tender to be refloated'));
  t('Cancelled then refloated = floated', 'Tender Floated', cls('Earlier tender cancelled; refloated on 12/10/2026'));
  t('On hold', 'On Hold', cls('Kept on hold pending budget'));
  t('Completed and handed over', 'Completed', cls('Work completed and handed over to O&M'));
  t('"Technical evaluation completed" alone ≠ completed', 'Price Bid Opening', cls('Technical evaluation completed'));
  t('TEC approval is not internal approval', 'Award in Progress', cls('TEC approved; LOA to be issued'));
  t('Unclassifiable text', null, cls('Discussed with HOD'));

  // Full engine on demonstration data
  TMD.loadDemo();
  const by = (sheet, sr) => TMD.state.records.find((r) => r.sheet === sheet && String(Object.values(r.values)[0]) === String(sr));
  const stg = (r) => TMD.stageInfo(r.calc.stage).label;
  t('Demo Capex #1', 'Award in Progress', stg(by('Capex', 1)));
  t('Demo Capex #3 (post-award)', 'FAT', stg(by('Capex', 3)));
  t('Demo Capex #10 opening overdue', ['Bid Opening Due', true], [stg(by('Capex', 10)), by('Capex', 10).calc.alerts.some((a) => a.type === 'Bid opening overdue')]);
  t('Demo Capex #27 status/date conflict detected', true, !!by('Capex', 27).calc.conflict);
  t('Demo Capex #28 duplicate PR flagged', true, by('Capex', 28).calc.dq.some((q) => q.code === 'dup-pr'));
  t('Demo Capex #28 invalid date flagged', true, by('Capex', 28).calc.dq.some((q) => q.code === 'invalid-date'));
  t('Demo Capex #28 spelling variant flagged', true, by('Capex', 28).calc.dq.some((q) => q.code === 'spelling'));
  t('Demo REVEX #1 (Sample 4) bid opening due', 'Bid Opening Due', stg(by('REVEX 2026', 1)));
  t('Source values unchanged by calculations', 'Technical evaluation completed; price bid opened; award under processing', by('Capex', 1).values.STATUS);
  t('Original snapshot stored', true, !!TMD.state.workbook.original.Capex[by('Capex', 1).id]);

  document.getElementById('out').innerHTML = rows.join('');
  const sum = document.getElementById('sum');
  sum.textContent = `${pass} passed, ${fail} failed (system date ${TMD.fmtDate(TMD.today())})`;
  sum.className = 'sum ' + (fail ? 'fail' : 'pass');
  window.SELFTEST = { pass, fail };
})();
