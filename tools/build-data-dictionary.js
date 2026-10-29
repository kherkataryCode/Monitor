#!/usr/bin/env node
/* Generates sample-data/data-dictionary.json from the application's own mapping rules. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Intl, Date, Math, JSON, setTimeout, clearTimeout, Uint8Array };
ctx.window = ctx; ctx.self = ctx; ctx.document = { addEventListener() {}, querySelector() { return null; } };
ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
vm.createContext(ctx);
['js/utils.js', 'js/icons.js', 'js/storage.js', 'js/data-normaliser.js', 'js/calculations.js', 'js/sample-data.js', 'js/audit-log.js', 'js/data-loader.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const T = ctx.TMD;
const DESC = {
  srNo: 'Serial number of the row in the tracker.', channel: 'Procurement channel handling the tender (P&CS or CPO).', department: 'Owning department (e.g. INSTR, ELECTRICAL).',
  capexRevex: 'Budget head: CAPEX or REVEX.', initiator: 'Person who initiated the tender.', wbs: 'SAP WBS element (CAPEX). Kept as text.', projectCost: 'Sanctioned project cost (unit per header or Settings; default lakh).',
  be: 'Budget estimate for the financial year.', capexFinish: 'Target date for completion of CAPEX.', prNo: 'Purchase requisition number (first PR No column). Kept as text.', prNo2: 'Second "PR No" column in the CAPEX tracker (duplicate header retained).',
  prSentDate: 'Date the PR was sent.', proposalName: 'Name of the CAPEX proposal.', jobDescription: 'Description of the job / supply.', status: 'Free-text status as maintained by the user. Never overwritten.',
  crfq: 'CRFQ number or GeM bid ID. Kept as text.', sentToProcurement: 'Date (or note) when sent to the concerned CPO / P&CS.', floatDate: 'Date the tender was floated.', floatDuration: 'Source value: tender floating duration in days.',
  prebidDate: 'Pre-bid meeting date.', openingDate: 'Scheduled tender / bid opening date.', actualOpeningDate: 'Actual tender opening date.', techEvalDate: 'BQC & technical evaluation completion date.',
  techEvalDuration: 'Source value: technical evaluation duration in days.', priceBidDate: 'Date the price bid was opened.', tecApprovalDate: 'Tender Evaluation Committee approval date.', fat: 'Factory Acceptance Test date or status.',
  sat: 'Site Acceptance Test date or status.', installation: 'Installation / commissioning date or status.', poNo: 'PO / OLA number. Kept as text.', awardDate: 'PO / OLA award date.', prToPoDuration: 'Source value: PR-to-PO cycle in days.',
  sla: 'Service level / delivery terms.', validity: 'PO / OLA validity (expiry) date.', cashOutflowIncl: 'PO / OLA value including tax (default rupees).', cashOutflowExcl: 'PO / OLA value excluding tax (default rupees).',
  cashOutflow: 'PO / OLA cash outflow (default rupees).', vendor: 'Successful vendor / contractor.', remarks: 'Remarks column (REVEX).', remarksAny: 'Remarks (if any).', nature: 'Nature of work (Supply / Service / Works / Rate contract).',
  estCost: 'Estimated cost (header states unit, e.g. In Lacs).', handover: 'Project handing-over date or status.', daysSinceFloat: 'Source snapshot: days since float (Capex Modified).', daysToOpening: 'Source snapshot: days to opening (Capex Modified).',
  statusFlag: 'Source status flag (Capex Modified).', quickStatus: 'Source quick status (Capex Modified).',
};
const sheets = {};
T.SAMPLE.sheets.forEach((sh) => {
  const headers = T.buildHeaders(sh.headers, sh.headers.length);
  const map = T.autoMapping(headers);
  const byKey = {}; Object.keys(map).forEach((f) => { byKey[map[f]] = f; });
  sheets[sh.name] = {
    recognisedAs: T.recogniseSheet(sh.name, map),
    columns: headers.map((h, i) => {
      const f = byKey[h.key];
      return { order: i + 1, column: T.colLetter(i), sourceHeader: h.label, internalKey: h.key, duplicateHeader: !!h.dup, standardField: f || null,
        type: f ? T.STD[f].type : 'text', unit: f && T.STD[f].type === 'amount' ? (T.unitFromHeader(h.label) || 'from Settings') : undefined, description: f ? DESC[f] : 'Unmapped source column — retained and shown as-is.' };
    }),
  };
});
const out = {
  title: 'Tender Monitoring Dashboard — data dictionary',
  generated: new Date().toISOString().slice(0, 10),
  notes: [
    'Source columns are preserved exactly (labels, order, blanks). Duplicate headers receive internal keys with _1, _2 suffixes; the original header text is displayed and exported.',
    'Standard fields are an analytical mapping layer. Mappings can be changed per worksheet layout under Settings → Column mapping.',
    'Calculated fields are never written into source columns. They can optionally be exported as extra "[Calc]" columns.',
    'Dates: dd/mm/yyyy and dd-mm-yyyy (default reading when both parts ≤ 12), mm/dd/yyyy only when the day part is > 12, "31 Aug 2026", ISO, and Excel serial numbers in date columns.',
  ],
  standardFields: Object.keys(T.STD).map((k) => ({ field: k, label: T.STD[k].label, type: T.STD[k].type, description: DESC[k] })),
  calculatedFields: [
    { field: 'Current Stage', description: 'Rules-based lifecycle stage (see stages). Structured dates first; STATUS / Quick Status / Remarks text as supporting evidence; manual override possible in Edit Mode.' },
    { field: 'Stage Reason', description: 'Explanation of how the stage was determined, including any data conflict.' },
    { field: 'Delay / Track', description: 'Delayed when any delay alert applies (thresholds in Settings); Closed for completed / cancelled / scrapped / on hold.' },
    { field: 'Next Milestone', description: 'Next expected step for the current stage, with its planned date when known.' },
  ].concat(T.CALC_COLS.map((c) => ({ field: c.label, description: 'Calculated (' + c.type + ').' }))),
  stages: T.STAGES.slice(1).map((s) => ({ number: s.n, stage: s.label, group: s.group, colour: s.tone })),
  sheets,
};
fs.writeFileSync(path.join(ROOT, 'sample-data', 'data-dictionary.json'), JSON.stringify(out, null, 2));
console.log('Wrote sample-data/data-dictionary.json with', Object.keys(sheets).length, 'sheets');
