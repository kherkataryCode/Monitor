/* =====================================================================
 * cyber-audit-loader.js — independent Cyber Audit data source:
 * [Import Audit Data] (via the shared local import flow, cyber mapper),
 * built-in demonstration data, edit controller, observation detail
 * drawer with remediation timeline, Quick Update and change history.
 * Loading audit data never replaces Tender data (and vice versa).
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;
  const S = M.state;

  /* ---------------- Demo / import ---------------- */
  TMD.cyber.loadDemo = function () {
    const raw = TMD.sampleToRaw(TMD.CYBER_SAMPLE);
    const wb = TMD.buildWorkbook(raw, { fileName: TMD.CYBER_SAMPLE.fileName, fileSize: 0, isDemo: true, sourceType: 'demo' }, { sheets: ['Observations'], minFilled: 2, skipInsufficient: true }, M);
    M.install(wb, TMD.CYBER_SAMPLE.defaultActive);
  };
  TMD.cyber.importFile = (file) => TMD.importFile(file, M);

  /* ---------------- Edit controller ---------------- */
  TMD.cyber.edit = TMD.createEditController(M, {
    enterText: 'You are entering Edit Mode. Cyber Security Audit changes remain local until an updated file is exported.',
    details: { open: (r, o) => TMD.cyber.details.open(r, o), current: () => TMD.cyber.details.current(), close: () => TMD.cyber.details.close() },
    exportDialog: () => TMD.cyber.exporter.openDialog('register'),
    csvDialog: () => TMD.cyber.exporter.csvExport(),
    overrideLabel: (n) => TMD.cstatusInfo(n).label,
  });

  /* ---------------- Detail drawer ---------------- */
  let current = null, opts = {};
  const drawer = () => TMD.$('#cyberDrawer');
  const g = (rec, f) => { const sh = TMD.sheetOf(rec); const k = sh.mapping[f]; return k ? rec.values[k] : undefined; };
  const SECTIONS = [
    { id: 'ident', title: 'Identification', fields: ['auditName', 'obsId', 'obsNo', 'auditType', 'auditAgency', 'auditYear', 'auditRef', 'reportNo', 'auditDate', 'reportDate', 'obsDate', 'location', 'region', 'department', 'asset', 'system', 'assetCategory', 'coordinator'] },
    { id: 'obs', title: 'Observation', fields: ['observation', 'finding', 'obsDescription', 'gap', 'recommendation', 'auditorRecommendation', 'evidenceRef'] },
    { id: 'risk', title: 'Risk', fields: ['severity', 'criticality', 'riskRating', 'riskLevel', 'domain', 'obsCategory', 'otIt', 'techProcess', 'complianceCategory', 'regulatory', 'repeat', 'framework', 'clause', 'controlDesc'] },
    { id: 'action', title: 'Action', fields: ['actionRequired', 'correctiveAction', 'remediationPlan', 'owner', 'deptResponsible', 'targetDate', 'revisedTarget', 'dependency', 'pendingWith'] },
    { id: 'progress', title: 'Progress', fields: ['currentStatus', 'actionTaken', 'lastFollowUp', 'nextFollowUp', 'mgmtResponse', 'escalation', 'escalationLevel', 'remarks'] },
    { id: 'closure', title: 'Closure', fields: ['evidenceSubmitted', 'evidenceStatus', 'verificationStatus', 'verifiedBy', 'verificationDate', 'closureStatus', 'closureRemarks', 'closureDate', 'closureApproval'] },
  ];

  function fieldRow(rec, f, edit) {
    const sh = TMD.sheetOf(rec);
    const key = sh.mapping[f];
    if (!key) return '';
    const h = sh.headers.find((x) => x.key === key);
    const label = (sh.friendly && sh.friendly[key]) || h.display;
    const v = rec.values[key];
    const meta = sh.colMeta[key];
    const text = TMD.cellText(v);
    let ctrl;
    if (edit) {
      if (meta.type === 'longtext') ctrl = `<textarea class="inp" rows="3" data-key="${esc(key)}" data-label="${esc(label)}">${esc(text)}</textarea>`;
      else if (meta.isDate || meta.type === 'date') { const p = TMD.parseDate(v, rec.dateHints[key], true); ctrl = `<div class="date-combo"><input class="inp" type="text" data-key="${esc(key)}" data-label="${esc(label)}" value="${esc(text)}" placeholder="dd/mm/yyyy"><input class="inp" type="date" data-date-for="${esc(key)}" value="${p.date ? TMD.isoDate(p.date) : ''}" aria-label="Pick ${esc(label)}"></div>`; }
      else ctrl = `<input class="inp" type="text" data-key="${esc(key)}" data-label="${esc(label)}" value="${esc(text)}" list="cdl-${f}">`;
    } else ctrl = TMD.isBlank(v) ? '<span class="nil">—</span>' : TMD.escMultiline(text);
    return `<div class="f-row ${rec.editedKeys.indexOf(key) >= 0 ? 'modified' : ''}"><div class="f-label" title="Source column: ${esc(h.display)}">${esc(label)}</div><div class="f-val">${ctrl}</div></div>`;
  }
  function datalists() {
    return ['currentStatus', 'evidenceStatus', 'verificationStatus', 'pendingWith', 'owner', 'severity', 'criticality', 'location', 'domain', 'closureStatus', 'escalation'].map((f) => {
      const vals = new Set();
      S.records.forEach((r) => { const v = g(r, f); if (!TMD.isBlank(v)) vals.add(String(v).trim()); });
      if (f === 'domain') TMD.cyberDomains().forEach((d) => vals.add(d));
      return `<datalist id="cdl-${f}">${Array.from(vals).sort().map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
    }).join('');
  }
  function stepper(c) {
    const steps = TMD.REMEDIATION_STEPS;
    const cur = c.closed ? steps.length : c.step; // 1..6, current position index (0-based = step-? )
    return `<ol class="stepper rem" aria-label="Remediation progress">${steps.map((s, i) => {
      const done = c.closed || i < cur;
      const isCur = !c.closed && i === cur;
      return `<li class="${done ? 'done' : isCur ? 'current' : ''}"><span class="dot">${done ? TMD.icon('check') : isCur ? '●' : '○'}</span><span class="lbl">${esc(s)}</span></li>`;
    }).join('')}</ol>`;
  }
  function render() {
    const rec = current;
    if (!rec) return;
    const c = rec.calc;
    const edit = S.mode === 'edit' && opts.edit !== false;
    const sh = TMD.sheetOf(rec);
    const mapped = new Set(Object.values(sh.mapping));
    const unmapped = sh.headers.filter((h) => !mapped.has(h.key));
    const hist = M.audit.forRecord(rec.id).slice().reverse();
    const d = drawer();
    d.innerHTML = `
      <div class="dr-head cyber">
        <div class="dr-titles">
          <div class="dr-kicker">${TMD.icon('shield')} ${esc(c.auditName || rec.sheet)} · ${esc(c.ident)} · row ${rec.isNew ? 'new' : rec.rowNum}</div>
          <h2>${esc(c.title)}</h2>
          <div class="dr-badges">${TMD.cstatusBadge(c.cstatus)} ${TMD.sevBadge(c.severity)} ${c.overdue ? `<span class="pill tone-red">${TMD.icon('clock')}${c.daysOverdue} days overdue</span>` : ''} ${c.repeat ? '<span class="pill tone-orange">Repeat</span>' : ''} <span class="mode-mini ${edit ? 'edit' : 'view'}">${edit ? 'EDITING' : 'READ-ONLY'}</span></div>
        </div>
        <div class="dr-actions">
          <button class="btn primary" data-a="quick">${TMD.icon('zap')}<span>Quick Update</span></button>
          <button class="btn subtle" data-a="follow">${TMD.icon('note')}<span>Follow-up</span></button>
          <button class="btn subtle" data-a="print">${TMD.icon('printer')}</button>
          <button class="icon-btn" data-a="prev" aria-label="Previous">${TMD.icon('chevronLeft')}</button>
          <button class="icon-btn" data-a="next" aria-label="Next">${TMD.icon('chevronRight')}</button>
          <button class="icon-btn" data-a="close" aria-label="Close">${TMD.icon('x')}</button>
        </div>
      </div>
      <div class="dr-body" id="cdrBody">
        ${stepper(c)}
        <section class="dr-sec status-sec"><h3>Status</h3>
          <div class="kv-grid">
            <div class="kv"><span>Calculated status</span><strong>${esc(c.statusLabel)}</strong></div>
            <div class="kv"><span>Original status</span><strong>${esc(c.originalStatus || '—')}</strong></div>
            <div class="kv"><span>Effective target</span><strong>${c.effTarget ? esc(TMD.fmtDate(c.effTarget)) + (c.hasRevised ? ' (revised)' : '') : '—'}</strong></div>
            <div class="kv"><span>${c.overdue ? 'Days overdue' : 'Days remaining'}</span><strong class="${c.overdue ? 'txt-red' : ''}">${c.overdue ? c.daysOverdue : c.daysRemaining !== null ? c.daysRemaining : '—'}</strong></div>
            <div class="kv"><span>Days open</span><strong>${c.openAge !== null ? c.openAge : c.closureDuration !== null ? c.closureDuration + ' (to closure)' : '—'}</strong></div>
            <div class="kv"><span>Calculated cyber domain</span><strong>${esc(c.calcDomain)}${c.domainSource === 'keywords' ? ' <em class="muted">(suggested)</em>' : ''}</strong></div>
            ${c.suggestedSeverity ? `<div class="kv"><span>Suggested severity</span><strong>${esc(c.suggestedSeverity)} <em class="muted">(Suggested)</em></strong></div>` : ''}
          </div>
          <p class="muted small">${esc(c.statusReason)}</p>
          ${c.attention.length ? `<div class="notice warn">${TMD.icon('alert')} <strong>Management attention:</strong> ${esc(c.attention.join(' · '))}</div>` : ''}
          ${c.alerts.length ? `<div class="dr-alerts">${c.alerts.map((a) => `<div class="alert-line sev-${a.sev}">${TMD.icon(a.sev === 'high' ? 'alert' : 'clock')}<div><strong>${esc(a.type)}</strong><div>${esc(a.msg)}</div></div></div>`).join('')}</div>` : ''}
          ${c.dq.length ? `<details class="dr-dq"><summary>${TMD.icon('shield')} ${c.dq.length} data warning(s)</summary><ul>${c.dq.map((q) => `<li class="sev-${q.sev}"><strong>${esc(q.field)}:</strong> ${esc(q.msg)} <span class="muted">— ${esc(q.suggestion)}</span></li>`).join('')}</ul></details>` : ''}
          ${S.mode === 'edit' ? `<div class="override-box"><label class="field"><span>Manual status override</span><select class="inp" id="covStage"><option value="">No override (use calculated status)</option>${TMD.CSTATUS.slice(1).map((s) => `<option value="${s.n}" ${rec.override && +rec.override.stage === s.n ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
            <label class="field"><span>Note</span><input class="inp" id="covNote" value="${esc((rec.override && rec.override.note) || '')}"></label><button class="btn" data-a="override">Apply</button></div>` : ''}
        </section>
        ${SECTIONS.map((s) => { const rows = s.fields.map((f) => fieldRow(rec, f, edit)).join(''); return rows ? `<section class="dr-sec" id="csec-${s.id}"><h3>${esc(s.title)}</h3>${rows}</section>` : ''; }).join('')}
        ${unmapped.length ? `<section class="dr-sec"><h3>Other source columns</h3>${unmapped.map((h) => `<div class="f-row"><div class="f-label">${esc(h.display)}</div><div class="f-val">${edit ? `<input class="inp" data-key="${esc(h.key)}" data-label="${esc(h.display)}" value="${esc(TMD.cellText(rec.values[h.key]))}">` : (TMD.isBlank(rec.values[h.key]) ? '<span class="nil">—</span>' : TMD.escMultiline(TMD.cellText(rec.values[h.key])))}</div></div>`).join('')}</section>` : ''}
        <section class="dr-sec"><h3>Follow-up notes (local)</h3>${(rec.followUps || []).length ? `<ul class="follow-list">${rec.followUps.slice().reverse().map((x) => `<li><div class="muted small">${esc(TMD.fmtDateTime(x.ts))}${x.due ? ' · next ' + esc(TMD.fmtDate(TMD.fromIso(x.due))) : ''}</div>${TMD.escMultiline(x.note)}</li>`).join('')}</ul>` : '<p class="muted">No follow-up notes.</p>'}</section>
        <section class="dr-sec" id="csec-history"><h3>Change History</h3>
          ${hist.length ? `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>Timestamp</th><th>Field</th><th>Old value</th><th>New value</th><th>Action</th></tr></thead><tbody>${hist.map((e) => `<tr><td class="nowrap">${esc(TMD.fmtDateTime(e.ts))}</td><td>${esc(e.field)}</td><td class="wrap">${esc(e.oldValue)}</td><td class="wrap">${esc(e.newValue)}</td><td>${esc(e.action)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No local changes recorded for this observation.</p>'}
          <p class="muted small">Local change history kept in this browser; it is not a cryptographically secure audit trail.</p>
        </section>
      </div>${edit ? datalists() : ''}`;
    if (opts.section) { const s = d.querySelector('#csec-' + opts.section); if (s) setTimeout(() => s.scrollIntoView({ block: 'start' }), 50); opts.section = null; }
  }

  function show() { drawer().classList.add('open'); drawer().setAttribute('aria-hidden', 'false'); TMD.$('#scrim').hidden = false; }
  function hide() { drawer().classList.remove('open'); drawer().setAttribute('aria-hidden', 'true'); if (!TMD.$('#detailsDrawer').classList.contains('open') && !TMD.$('#textDrawer').classList.contains('open')) TMD.$('#scrim').hidden = true; current = null; }

  /* ---------------- Quick Update ---------------- */
  const QUICK = [['currentStatus', 'Current Status'], ['actionTaken', 'Action Taken'], ['pendingWith', 'Pending With'], ['targetDate', 'Target Date'], ['revisedTarget', 'Revised Target Date'], ['evidenceStatus', 'Evidence Status'], ['lastFollowUp', 'Last Follow-up Date'], ['nextFollowUp', 'Next Follow-up Date'], ['remarks', 'Remarks']];
  async function quickUpdate(rec) {
    if (S.mode !== 'edit') {
      const ok = await M.edit.enter();
      if (!ok) return;
    }
    const sh = TMD.sheetOf(rec);
    const fields = QUICK.filter(([f]) => sh.mapping[f]);
    if (!fields.length) { TMD.toast('This worksheet has none of the Quick Update columns (status, action taken, dates …).', 'warn'); return; }
    const vals = {};
    const body = TMD.el('div', { class: 'quick-form' });
    body.innerHTML = `<p class="muted small">${esc(rec.calc.ident)} — ${esc(rec.calc.title)}</p><div class="form-grid tight">${fields.map(([f, l]) => {
      const key = sh.mapping[f];
      const meta = sh.colMeta[key];
      const v = TMD.cellText(rec.values[key]);
      if (meta.isDate || meta.type === 'date') {
        const p = TMD.parseDate(rec.values[key], rec.dateHints[key], true);
        const def = f === 'lastFollowUp' && !v ? TMD.today() : p.date;
        return `<label class="field"><span>${esc(l)}</span><input class="inp" type="date" data-q="${f}" value="${def ? TMD.isoDate(def) : ''}"></label>`;
      }
      if (meta.type === 'longtext') return `<label class="field wide"><span>${esc(l)}</span><textarea class="inp" rows="3" data-q="${f}">${esc(v)}</textarea></label>`;
      return `<label class="field"><span>${esc(l)}</span><input class="inp" data-q="${f}" value="${esc(v)}" list="cdl-${f}"></label>`;
    }).join('')}</div>${datalists()}<p class="muted small">Dates default: Last Follow-up = today when blank. Only changed fields are saved; every change is logged.</p>`;
    const res = await TMD.modal({
      title: 'Quick Update', body, wide: true,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save Locally', value: 'ok', kind: 'primary' }],
      beforeClose: (v, dlg) => { if (v === 'ok') TMD.$$('[data-q]', dlg).forEach((i) => { vals[i.dataset.q] = i.type === 'date' ? (i.value ? TMD.fmtDate(TMD.fromIso(i.value)) : null) : (i.value === '' ? null : i.value); }); return true; },
    });
    if (res !== 'ok') return;
    const items = [];
    fields.forEach(([f, l]) => {
      const key = sh.mapping[f];
      const old = rec.values[key];
      let nv = vals[f];
      const meta = sh.colMeta[key];
      if (meta.isDate || meta.type === 'date') {
        const po = TMD.parseDate(old, rec.dateHints[key], true);
        if (po.date && nv && TMD.fmtDate(po.date) === nv) return; // same date, keep original text
      }
      if (TMD.cellText(old) === TMD.cellText(nv) || (TMD.isBlank(old) && TMD.isBlank(nv))) return;
      items.push({ rec, key, nv, label: l });
    });
    if (!items.length) { TMD.toast('No changes.', 'info'); return; }
    M.edit.setValues(items, 'Quick update');
    const ok = await M.edit.saveLocal();
    if (ok) TMD.toast(`Quick update saved locally (${items.length} field(s)).`, 'success');
    if (current === rec) render();
  }

  async function addFollowUp(rec) {
    let note = '', due = '';
    const res = await TMD.modal({ title: 'Add follow-up — ' + rec.calc.ident,
      body: '<label class="field"><span>Follow-up note</span><textarea class="inp" id="cfuNote" rows="4"></textarea></label><label class="field"><span>Next follow-up (optional)</span><input class="inp" type="date" id="cfuDue"></label><p class="muted small">Stored as a local note and in the change log; source columns are not changed.</p>',
      buttons: [{ label: 'Cancel', value: null }, { label: 'Add note', value: 'ok', kind: 'primary' }],
      onOpen: (dlg) => { dlg.addEventListener('input', () => { note = dlg.querySelector('#cfuNote').value; due = dlg.querySelector('#cfuDue').value; }); setTimeout(() => dlg.querySelector('#cfuNote').focus(), 40); } });
    if (res !== 'ok' || !note.trim()) return;
    rec.followUps = rec.followUps || [];
    rec.followUps.push({ ts: Date.now(), note: note.trim(), due });
    M.audit.log({ action: 'FOLLOW_UP', sheet: rec.sheet, recordId: rec.id, recordLabel: rec.calc.ident, rowNum: rec.rowNum, field: 'Follow-up note', newValue: note.trim() + (due ? ` (next ${due})` : '') });
    if (TMD.settings.get('persistence')) TMD.saveWorkingCopy(S.mode === 'edit' ? M.slots.recovery : M.slots.working, M);
    TMD.toast('Follow-up note added.', 'success');
    if (current === rec) render();
  }

  function print() {
    const host = TMD.$('#printHost');
    const body = TMD.$('#cdrBody').cloneNode(true);
    TMD.$$('input,select,textarea,button', body).forEach((e) => e.remove());
    host.innerHTML = `<div class="print-doc"><h1>Audit observation — ${esc(current.calc.ident)}</h1><p>${esc(current.calc.auditName)} · printed ${esc(TMD.fmtDateTime(Date.now()))}</p></div>`;
    host.firstChild.appendChild(body);
    document.body.classList.add('printing-custom');
    window.print();
    setTimeout(() => { document.body.classList.remove('printing-custom'); host.innerHTML = ''; }, 500);
  }

  TMD.cyber.details = {
    open(rec, o) { if (!rec) return; current = rec; opts = o || {}; render(); show(); },
    close: hide, current: () => current, quickUpdate, addFollowUp, render: () => { if (current) render(); },
  };
  TMD.initCyberDetails = function () {
    const d = drawer();
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') hide();
      if (a === 'quick') quickUpdate(current);
      if (a === 'follow') addFollowUp(current);
      if (a === 'print') print();
      if (a === 'prev' || a === 'next') {
        const list = TMD.cyber.grid && TMD.cyber.grid.sortedRows().length ? TMD.cyber.grid.sortedRows() : S.filtered;
        const n = list[list.indexOf(current) + (a === 'next' ? 1 : -1)];
        if (n) { current = n; render(); }
      }
      if (a === 'override') { const s = d.querySelector('#covStage').value, n = d.querySelector('#covNote').value; M.edit.setOverride(current, s ? { stage: +s, note: n.trim(), at: Date.now() } : null); }
    });
    d.addEventListener('change', (e) => {
      const t = e.target;
      if (!current || S.mode !== 'edit') return;
      if (t.dataset.dateFor) { const inp = d.querySelector(`[data-key="${CSS.escape(t.dataset.dateFor)}"]`); if (inp && t.value) { inp.value = TMD.fmtDate(TMD.fromIso(t.value)); inp.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (t.dataset.key) {
        const nv = t.value === '' ? null : t.value;
        const old = current.values[t.dataset.key];
        if (nv === old || (TMD.isBlank(nv) && TMD.isBlank(old))) return;
        const y = TMD.$('#cdrBody').scrollTop;
        M.edit.setValue(current, t.dataset.key, nv, t.dataset.label);
        TMD.$('#cdrBody').scrollTop = y;
      }
    });
    TMD.on('recalculated', (e) => { if (e && e.module === 'cyber' && current && d.classList.contains('open')) { if (S.records.indexOf(current) < 0) hide(); else { const y = TMD.$('#cdrBody').scrollTop; render(); TMD.$('#cdrBody').scrollTop = y; } } });
    TMD.on('mode', (e) => { if (e && e.module === 'cyber' && current) render(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.classList.contains('open') && !TMD.$('#modalHost').children.length) hide(); });
  };
})();
