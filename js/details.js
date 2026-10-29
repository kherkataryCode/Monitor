/* =====================================================================
 * details.js — Tender Details drawer (read-only in View Mode, editable in
 * Edit Mode), lifecycle stepper, local change history, follow-up notes,
 * full-text side panel.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  let current = null;
  let opts = {};

  const SECTIONS = [
    { id: 'ident', title: 'A. Identification', fields: ['srNo', 'wbs', 'prNo', 'prNo2', 'crfq', 'department', 'capexRevex', 'channel', 'initiator'] },
    { id: 'desc', title: 'B. Description', fields: ['proposalName', 'jobDescription', 'nature'] },
    { id: 'fin', title: 'C. Financial', fields: ['projectCost', 'estCost', 'be', 'cashOutflow', 'cashOutflowIncl', 'cashOutflowExcl'] },
    { id: 'time', title: 'D. Tender Timeline', fields: ['prSentDate', 'sentToProcurement', 'floatDate', 'prebidDate', 'openingDate', 'actualOpeningDate', 'techEvalDate', 'priceBidDate', 'tecApprovalDate', 'awardDate', 'floatDuration', 'techEvalDuration', 'prToPoDuration'] },
    { id: 'exec', title: 'E. Execution', fields: ['fat', 'sat', 'installation', 'handover', 'sla', 'validity', 'capexFinish'] },
    { id: 'award', title: 'F. Award', fields: ['poNo', 'vendor'] },
  ];
  const STEPS = [
    { label: 'Preparation', stages: [1, 2] }, { label: 'Sent to P&CS/CPO', stages: [3, 4] }, { label: 'Floated', stages: [5, 6, 7] },
    { label: 'Bids opened', stages: [8] }, { label: 'Evaluation', stages: [9, 10, 11] }, { label: 'Price bid', stages: [12, 13] },
    { label: 'TEC / Award', stages: [14, 15] }, { label: 'PO/OLA', stages: [16, 17] }, { label: 'FAT / Delivery', stages: [18, 19] },
    { label: 'SAT / Install', stages: [20, 21] }, { label: 'Completed', stages: [22] },
  ];

  function stepper(c) {
    const st = c.stage;
    let idx = STEPS.findIndex((s) => s.stages.indexOf(st) >= 0);
    const exception = [23, 24, 25, 26, 27].indexOf(st) >= 0;
    if (exception) {
      // Show progress reached according to dates, then the exception marker
      idx = c.dateStage ? STEPS.findIndex((s) => s.stages.indexOf(c.dateStage.stage) >= 0) : -1;
    }
    return `<ol class="stepper ${exception ? 'has-exc' : ''}" aria-label="Tender lifecycle progress">${STEPS.map((s, i) => {
      const cls = i < idx ? 'done' : i === idx ? (exception ? 'done' : 'current') : '';
      return `<li class="${cls}"><span class="dot">${i < idx || (exception && i === idx) ? TMD.icon('check') : i + 1}</span><span class="lbl">${esc(s.label)}</span></li>`;
    }).join('')}</ol>${exception ? `<div class="stepper-exc">${TMD.stageBadge(st)} <span class="muted">— lifecycle interrupted/flagged</span></div>` : ''}`;
  }

  function fieldRow(rec, f, edit) {
    const sheet = TMD.sheetOf(rec);
    const key = sheet.mapping[f];
    if (!key) return '';
    const h = sheet.headers.find((x) => x.key === key);
    const label = (sheet.friendly && sheet.friendly[key]) || h.display;
    const v = rec.values[key];
    const text = TMD.cellText(v);
    const meta = sheet.colMeta[key];
    const modified = rec.editedKeys.indexOf(key) >= 0;
    let display = TMD.isBlank(v) ? '<span class="nil">—</span>' : TMD.escMultiline(text);
    let extra = '';
    if (meta.isDate || meta.type === 'date' || meta.type === 'milestone') {
      const p = TMD.parseDate(v, rec.dateHints[key], true);
      if (p.date && (p.kind === 'serial' || p.fmt === 'mdy' || p.kind === 'textdate')) extra = `<span class="hint">read as ${esc(TMD.fmtDate(p.date))}${p.kind === 'serial' ? ' (Excel serial)' : p.fmt === 'mdy' ? ' (mm/dd/yyyy detected)' : ''}</span>`;
      if (p.kind === 'invalid') extra = `<span class="hint bad">${TMD.icon('alert')} invalid date</span>`;
    }
    if (meta.type === 'amount') {
      const unit = meta.unit || TMD.settings.get(TMD.STD[f].unitSetting) || 'rupees';
      const a = TMD.parseAmount(v, unit);
      if (a.kind === 'num' || a.kind === 'mixed') extra = `<span class="hint" data-tip="${esc(TMD.fmtMoneyExact(a.rupees))}">${esc(TMD.fmtMoney(a.rupees))} (source unit: ${esc(unit)})</span>`;
    }
    let ctrl = '';
    if (edit) {
      const isLong = meta.type === 'longtext';
      const isNum = meta.type === 'amount' || meta.type === 'number';
      const isDate = meta.isDate || meta.type === 'date' || meta.type === 'milestone';
      if (isLong) ctrl = `<textarea class="inp" rows="3" data-key="${esc(key)}" data-label="${esc(label)}">${esc(text)}</textarea>`;
      else if (isDate) { const p = TMD.parseDate(v, rec.dateHints[key], true); ctrl = `<div class="date-combo"><input class="inp" type="text" data-key="${esc(key)}" data-label="${esc(label)}" value="${esc(text)}" placeholder="dd/mm/yyyy"><input class="inp" type="date" data-date-for="${esc(key)}" value="${p.date ? TMD.isoDate(p.date) : ''}" aria-label="Pick ${esc(label)}"></div>`; }
      else if (isNum && (typeof v === 'number' || TMD.isBlank(v) || TMD.parseNumber(v) !== null)) ctrl = `<input class="inp" type="number" step="any" data-key="${esc(key)}" data-label="${esc(label)}" data-num="1" value="${TMD.isBlank(v) ? '' : esc(typeof v === 'number' ? v : TMD.parseNumber(v))}">`;
      else ctrl = `<input class="inp" type="text" data-key="${esc(key)}" data-label="${esc(label)}" value="${esc(text)}" ${['channel', 'department', 'capexRevex', 'nature', 'initiator'].indexOf(f) >= 0 ? `list="dl-${f}"` : ''}>`;
    }
    return `<div class="f-row ${modified ? 'modified' : ''}"><div class="f-label" title="Source column: ${esc(h.display)} (${esc(key)})">${esc(label)}${modified ? ' <span class="edited-dot">Edited</span>' : ''}</div><div class="f-val">${edit ? ctrl : display}${extra}</div></div>`;
  }

  function datalists(rec) {
    return ['channel', 'department', 'capexRevex', 'nature', 'initiator'].map((f) => {
      const vals = new Set();
      TMD.state.records.forEach((r) => { const v = TMD.getStd(r, f); if (!TMD.isBlank(v)) vals.add(String(v).trim()); });
      return `<datalist id="dl-${f}">${Array.from(vals).sort().map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
    }).join('');
  }

  function render() {
    const rec = current;
    if (!rec) return;
    const c = rec.calc;
    const edit = TMD.state.mode === 'edit' && opts.edit !== false;
    const sheet = TMD.sheetOf(rec);
    const mappedKeys = new Set(Object.values(sheet.mapping));
    const unmapped = sheet.headers.filter((h) => !mappedKeys.has(h.key));
    const hist = TMD.audit.forRecord(rec.id).filter((e) => ['EDIT', 'OVERRIDE_STAGE', 'ADD_ROW', 'DUPLICATE_ROW', 'FOLLOW_UP', 'UNDO', 'REDO'].indexOf(e.action) >= 0).slice().reverse();
    const orig = TMD.state.workbook.original[rec.sheet] && TMD.state.workbook.original[rec.sheet][rec.id];
    const alerts = c.alerts.filter((a) => !a.silent);
    const dr = TMD.$('#detailsDrawer');
    dr.innerHTML = `
      <div class="dr-head">
        <div class="dr-titles">
          <div class="dr-kicker">${esc(rec.sheet)} · source row ${rec.isNew ? '(new)' : rec.rowNum} · ${esc(c.ident)}</div>
          <h2>${esc(c.title)}</h2>
          <div class="dr-badges">${TMD.stageBadge(c.stage)} ${c.delayed ? `<span class="pill tone-red">${TMD.icon('clock')}Delayed</span>` : c.closed ? '' : `<span class="pill tone-green">${TMD.icon('check')}On track</span>`} ${c.conflict ? `<span class="pill tone-orange">${TMD.icon('alert')}Data conflict</span>` : ''} ${rec.edited || rec.isNew ? '<span class="edited-dot">Edited</span>' : ''}
          <span class="mode-mini ${edit ? 'edit' : 'view'}">${edit ? 'EDITING' : 'READ-ONLY'}</span></div>
        </div>
        <div class="dr-actions">
          ${TMD.state.mode === 'edit' ? '' : `<button class="btn subtle" data-a="edit">${TMD.icon('edit')}<span>Edit</span></button>`}
          <button class="btn subtle" data-a="follow">${TMD.icon('note')}<span>Follow-up</span></button>
          <button class="btn subtle" data-a="print">${TMD.icon('printer')}<span>Print</span></button>
          <button class="icon-btn" data-a="prev" aria-label="Previous record" data-tip="Previous record">${TMD.icon('chevronLeft')}</button>
          <button class="icon-btn" data-a="next" aria-label="Next record" data-tip="Next record">${TMD.icon('chevronRight')}</button>
          <button class="icon-btn" data-a="close" aria-label="Close details">${TMD.icon('x')}</button>
        </div>
      </div>
      <div class="dr-body" id="drBody">
        ${stepper(c)}
        <section class="dr-sec status-sec">
          <h3>G. Current Status</h3>
          <div class="f-row"><div class="f-label">Calculated stage</div><div class="f-val">${TMD.stageBadge(c.stage)}${c.overridden ? ' <span class="tag tag-amber">manual override</span>' : ''}</div></div>
          <div class="f-row"><div class="f-label">Reason</div><div class="f-val reason">${esc(c.stageReason)}</div></div>
          ${c.conflict ? `<div class="notice warn">${TMD.icon('alert')} <strong>Data conflict:</strong> ${esc(c.conflict)}</div>` : ''}
          <div class="f-row"><div class="f-label">Delay indicator</div><div class="f-val">${c.delayed ? `<span class="txt-red">${TMD.icon('clock')} Delayed</span>` : esc(c.delayLabel)}</div></div>
          <div class="f-row"><div class="f-label">Next suggested milestone</div><div class="f-val">${esc(c.next.label)}${c.next.date ? ' — ' + esc(TMD.fmtDate(c.next.date)) : ''}</div></div>
          ${fieldRow(rec, 'status', edit)}${fieldRow(rec, 'quickStatus', edit)}${fieldRow(rec, 'statusFlag', edit)}${fieldRow(rec, 'remarks', edit)}${fieldRow(rec, 'remarksAny', edit)}
          ${alerts.length ? `<div class="dr-alerts">${alerts.map((a) => `<div class="alert-line sev-${a.sev}">${TMD.icon(a.sev === 'high' ? 'alert' : 'clock')}<div><strong>${esc(a.type)}</strong><div>${esc(a.msg)}</div></div></div>`).join('')}</div>` : ''}
          ${c.dq.length ? `<details class="dr-dq"><summary>${TMD.icon('shield')} ${c.dq.length} data warning(s) · quality score ${c.dqScore}</summary><ul>${c.dq.map((q) => `<li class="sev-${q.sev}"><strong>${esc(q.field)}:</strong> ${esc(q.msg)} <span class="muted">— ${esc(q.suggestion)}</span></li>`).join('')}</ul></details>` : ''}
          ${TMD.state.mode === 'edit' ? `<div class="override-box"><label class="field"><span>Manual stage override</span><select class="inp" id="ovStage"><option value="">No override (use calculated stage)</option>${TMD.STAGES.slice(1).map((s) => `<option value="${s.n}" ${rec.override && +rec.override.stage === s.n ? 'selected' : ''}>${esc(TMD.stageLabel(s.n))}</option>`).join('')}</select></label>
            <label class="field"><span>Override note</span><input class="inp" id="ovNote" value="${esc(rec.override && rec.override.note || '')}" placeholder="Reason for override"></label><button class="btn" data-a="override">Apply override</button></div>` : ''}
        </section>
        ${SECTIONS.map((s) => { const rows = s.fields.map((f) => fieldRow(rec, f, edit)).join(''); return rows ? `<section class="dr-sec" id="sec-${s.id}"><h3>${esc(s.title)}</h3>${rows}${s.id === 'fin' ? finSummary(c) : ''}${s.id === 'time' ? timeSummary(c) : ''}</section>` : ''; }).join('')}
        ${unmapped.length ? `<section class="dr-sec"><h3>Other source columns</h3>${unmapped.map((h) => otherRow(rec, h, edit, sheet)).join('')}</section>` : ''}
        <section class="dr-sec" id="sec-follow"><h3>Follow-up notes (local)</h3>
          ${(rec.followUps || []).length ? `<ul class="follow-list">${rec.followUps.slice().reverse().map((f) => `<li><div class="muted small">${esc(TMD.fmtDateTime(f.ts))}${f.due ? ' · due ' + esc(TMD.fmtDate(TMD.fromIso(f.due))) : ''}</div>${TMD.escMultiline(f.note)}</li>`).join('')}</ul>` : '<p class="muted">No follow-up notes.</p>'}
          <button class="btn subtle" data-a="follow">${TMD.icon('plus')}<span>Add follow-up</span></button></section>
        <section class="dr-sec" id="sec-history"><h3>H. Local Change History</h3>
          ${hist.length ? `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>Date/time</th><th>Action</th><th>Field</th><th>Previous</th><th>New</th></tr></thead><tbody>${hist.map((e) => `<tr><td class="nowrap">${esc(TMD.fmtDateTime(e.ts))}</td><td>${esc(e.action)}</td><td>${esc(e.field)}</td><td class="wrap">${esc(e.oldValue)}</td><td class="wrap">${esc(e.newValue)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No local changes recorded for this record.</p>'}
          ${orig && rec.edited ? `<details><summary>Original imported values of edited fields</summary><ul>${rec.editedKeys.map((k) => `<li><strong>${esc(k)}:</strong> ${esc(TMD.cellText(orig.values[k])) || '<em>blank</em>'}</li>`).join('')}</ul></details>` : ''}
        </section>
      </div>${edit ? datalists(rec) : ''}`;
    if (opts.section) { const s = dr.querySelector('#sec-' + opts.section); if (s) setTimeout(() => s.scrollIntoView({ block: 'start' }), 50); opts.section = null; }
  }
  function otherRow(rec, h, edit, sheet) {
    const v = rec.values[h.key];
    const label = (sheet.friendly && sheet.friendly[h.key]) || h.display;
    const ctrl = edit ? `<input class="inp" type="text" data-key="${esc(h.key)}" data-label="${esc(label)}" value="${esc(TMD.cellText(v))}">` : (TMD.isBlank(v) ? '<span class="nil">—</span>' : TMD.escMultiline(TMD.cellText(v)));
    return `<div class="f-row ${rec.editedKeys.indexOf(h.key) >= 0 ? 'modified' : ''}"><div class="f-label">${esc(label)}</div><div class="f-val">${ctrl}</div></div>`;
  }
  function finSummary(c) {
    const items = [
      ['Estimated cost (₹)', c.estRupees], ['Project cost (₹)', c.projectRupees], ['Awarded value (₹)', c.awardedRupees], ['Cash outflow (₹)', c.cashOutflowRupees], ['Tax component (₹)', c.taxRupees], ['Awarded − estimated', c.estVsAward],
    ].filter((x) => x[1] !== null && x[1] !== undefined);
    if (!items.length && c.estVsAwardPct === null) return '';
    return `<div class="calc-box"><div class="calc-h">ƒ Calculated (not stored in source)</div><div class="kv-grid">${items.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><strong data-tip="${esc(TMD.fmtMoneyExact(v))}">${esc(TMD.fmtMoney(v))}</strong></div>`).join('')}${c.estVsAwardPct !== null ? `<div class="kv"><span>Awarded vs estimate</span><strong>${esc(TMD.fmtNum(c.estVsAwardPct, 1))}%</strong></div>` : ''}</div></div>`;
  }
  function timeSummary(c) {
    const items = [['Days since PR sent', c.daysSincePr], ['Days since tender float', c.daysSinceFloat], ['Days to bid opening', c.daysToOpening], ['Floating duration', c.floatDuration], ['Technical evaluation duration', c.techEvalDuration], ['PR-to-PO cycle', c.prToPo], ['Days since award', c.daysSinceAward], ['Days to PO/OLA expiry', c.daysToExpiry], ['Days to CAPEX finish', c.daysToCapexFinish], ['Record completeness', c.completeness !== null ? c.completeness + '%' : null]].filter((x) => x[1] !== null && x[1] !== undefined);
    if (!items.length) return '';
    return `<div class="calc-box"><div class="calc-h">ƒ Calculated (system date ${esc(TMD.fmtDate(TMD.today()))})</div><div class="kv-grid">${items.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><strong>${esc(typeof v === 'number' ? TMD.fmtInt(v) + ' d' : v)}</strong></div>`).join('')}</div></div>`;
  }

  function show(drawerId) {
    const dr = TMD.$('#' + drawerId);
    dr.classList.add('open');
    dr.setAttribute('aria-hidden', 'false');
    TMD.$('#scrim').hidden = false;
  }
  function hideAll() {
    ['detailsDrawer', 'textDrawer'].forEach((id) => { const d = TMD.$('#' + id); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); });
    TMD.$('#scrim').hidden = true;
    current = null;
  }

  function step(dir) {
    const list = TMD.state.page === 'register' && TMD.table.sortedRows().length ? TMD.table.sortedRows() : TMD.state.filtered;
    const i = list.indexOf(current);
    const n = list[i + dir];
    if (n) { current = n; render(); TMD.$('#drBody').scrollTop = 0; }
  }

  function printDetails() {
    const rec = current;
    const host = TMD.$('#printHost');
    const body = TMD.$('#drBody').cloneNode(true);
    TMD.$$('input,select,textarea,button', body).forEach((e) => e.remove());
    TMD.$$('details', body).forEach((d) => d.setAttribute('open', ''));
    host.innerHTML = `<div class="print-doc"><h1>Tender details — ${esc(rec.calc.title)}</h1><p>${esc(rec.sheet)} · row ${rec.rowNum} · ${esc(rec.calc.ident)} · printed ${esc(TMD.fmtDateTime(Date.now()))}</p></div>`;
    host.firstChild.appendChild(body);
    document.body.classList.add('printing-custom');
    window.print();
    setTimeout(() => { document.body.classList.remove('printing-custom'); host.innerHTML = ''; }, 500);
  }

  async function addFollowUp(rec) {
    const body = `<label class="field"><span>Follow-up note</span><textarea class="inp" id="fuNote" rows="4" autofocus></textarea></label><label class="field"><span>Follow-up due date (optional)</span><input class="inp" type="date" id="fuDue"></label><p class="muted small">Follow-up notes are local annotations. They do not change source cells and are included in the working copy and audit log.</p>`;
    let note = '', due = '';
    const res = await TMD.modal({ title: 'Add follow-up — ' + rec.calc.ident, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Add note', value: 'ok', kind: 'primary' }],
      onOpen: (dlg) => { dlg.addEventListener('input', () => { note = dlg.querySelector('#fuNote').value; due = dlg.querySelector('#fuDue').value; }); setTimeout(() => dlg.querySelector('#fuNote').focus(), 40); } });
    if (res !== 'ok' || !note.trim()) return;
    rec.followUps = rec.followUps || [];
    rec.followUps.push({ ts: Date.now(), note: note.trim(), due });
    TMD.audit.log({ action: 'FOLLOW_UP', sheet: rec.sheet, recordId: rec.id, recordLabel: rec.calc.ident, rowNum: rec.rowNum, field: 'Follow-up note', newValue: note.trim() + (due ? ` (due ${due})` : '') });
    if (TMD.settings.get('persistence')) { if (TMD.state.mode === 'edit') TMD.editMode.autosave(); else TMD.saveWorkingCopy('working'); }
    TMD.toast('Follow-up note added.', 'success');
    if (current === rec) render();
  }

  /* ---------------- Wiring ---------------- */
  TMD.initDetails = function () {
    const dr = TMD.$('#detailsDrawer');
    dr.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') hideAll();
      if (a === 'prev') step(-1);
      if (a === 'next') step(1);
      if (a === 'print') printDetails();
      if (a === 'follow') addFollowUp(current);
      if (a === 'edit') { const rec = current; const ok = await TMD.editMode.enter(); if (ok) TMD.details.open(rec, { edit: true }); }
      if (a === 'override') {
        const s = dr.querySelector('#ovStage').value, n = dr.querySelector('#ovNote').value;
        TMD.editMode.setOverride(current, s ? { stage: +s, note: n.trim(), at: Date.now() } : null);
      }
    });
    dr.addEventListener('change', (e) => {
      const t = e.target;
      if (!current || TMD.state.mode !== 'edit') return;
      if (t.dataset.dateFor) {
        const inp = dr.querySelector(`[data-key="${CSS.escape(t.dataset.dateFor)}"]`);
        if (inp && t.value) { inp.value = TMD.fmtDate(TMD.fromIso(t.value)); inp.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (t.dataset.key) {
        let nv = t.value;
        if (t.dataset.num) nv = nv === '' ? null : parseFloat(nv);
        else if (nv === '') nv = null;
        const old = current.values[t.dataset.key];
        if (nv === old || (TMD.isBlank(nv) && TMD.isBlank(old))) return;
        const rec = current;
        const scroll = TMD.$('#drBody').scrollTop;
        TMD.editMode.setValue(rec, t.dataset.key, nv, t.dataset.label);
        if (current === rec) { TMD.$('#drBody').scrollTop = scroll; }
      }
    });
    TMD.$('#scrim').addEventListener('click', hideAll);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (dr.classList.contains('open') || TMD.$('#textDrawer').classList.contains('open')) && !TMD.$('#modalHost').children.length && !TMD.grid.editor) hideAll();
    });
    TMD.$('#textDrawer').addEventListener('click', (e) => {
      if (e.target.closest('[data-a="close"]')) hideAll();
      if (e.target.closest('[data-a="copy"]')) TMD.table.copyText(TMD.$('#textDrawer .full-text').innerText);
      const o = e.target.closest('[data-a="open"]');
      if (o && TMD._textRec) { const r = TMD._textRec; hideAll(); TMD.details.open(r); }
    });
    TMD.on('recalculated', () => { if (current && TMD.$('#detailsDrawer').classList.contains('open')) { if (TMD.state.records.indexOf(current) < 0) hideAll(); else { const s = TMD.$('#drBody') && TMD.$('#drBody').scrollTop; render(); if (s) TMD.$('#drBody').scrollTop = s; } } });
    TMD.on('mode', () => { if (current) render(); });
  };

  TMD.details = {
    open(rec, o) {
      if (!rec) return;
      current = rec; opts = o || {};
      TMD.$('#textDrawer').classList.remove('open');
      render();
      show('detailsDrawer');
      setTimeout(() => { const f = TMD.$('#detailsDrawer .dr-actions .icon-btn[data-a="close"]'); if (f) f.focus({ preventScroll: true }); }, 50);
    },
    close: hideAll,
    current: () => current,
    addFollowUp,
    /** Side panel showing full long text with preserved line breaks. */
    openText(title, text, rec) {
      TMD._textRec = rec || null;
      const d = TMD.$('#textDrawer');
      d.innerHTML = `<div class="dr-head"><div class="dr-titles"><div class="dr-kicker">${rec ? esc(rec.sheet + ' · row ' + rec.rowNum + ' · ' + rec.calc.ident) : ''}</div><h2>${esc(title)}</h2></div>
        <div class="dr-actions"><button class="btn subtle" data-a="copy">${TMD.icon('copy')}<span>Copy</span></button>${rec ? `<button class="btn subtle" data-a="open">${TMD.icon('eye')}<span>Open record</span></button>` : ''}<button class="icon-btn" data-a="close" aria-label="Close">${TMD.icon('x')}</button></div></div>
        <div class="dr-body"><div class="full-text">${TMD.escMultiline(text)}</div></div>`;
      show('textDrawer');
    },
  };
})();
