/* =====================================================================
 * cyber-audit-alerts.js — CYBER SECURITY ACTION TRACKER and the
 * CYBER SECURITY AUDIT ALERT CENTRE (configurable thresholds).
 * Alerts exist only inside this offline application.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;
  const M = TMD.modules.cyber;
  const S = M.state;
  const inWin = TMD.inWindow;

  /* ---------------- Action Tracker ---------------- */
  const CATS = [
    { id: 'immediate', label: 'Immediate attention', tone: 'red', icon: 'alert', test: (c) => c.open && (c.severity === 'Critical' || c.escalation || (c.overdue && c.severity === 'High') || c.daysOverdue > 60), attn: ['Critical open', 'Escalation required'], hint: 'Critical, escalated, high & overdue, or > 60 days overdue' },
    { id: 'week', label: 'Due this week', tone: 'amber', icon: 'calendar', test: (c) => c.open && !c.overdue && inWin(c.effTarget, 7), attn: ['Due in 7 days'] },
    { id: 'month', label: 'Due this month', tone: 'blue', icon: 'calendar', test: (c) => c.open && !c.overdue && inWin(c.effTarget, 30), attn: ['Due in 30 days'] },
    { id: 'overdue', label: 'Overdue', tone: 'red', icon: 'clock', test: (c) => c.overdue, attn: ['Overdue'] },
    { id: 'evidence', label: 'Awaiting evidence', tone: 'amber', icon: 'file', test: (c) => c.evidencePending, attn: ['Evidence pending'] },
    { id: 'verification', label: 'Awaiting verification', tone: 'purple', icon: 'shield', test: (c) => c.verificationPending, attn: ['Verification pending'] },
    { id: 'closure', label: 'Awaiting closure', tone: 'teal', icon: 'award', test: (c) => c.awaitingClosure, attn: ['Awaiting closure'] },
    { id: 'noowner', label: 'No owner', tone: 'orange', icon: 'users', test: (c, r) => c.open && TMD.hasStd(r, 'owner') && !c.owner, attn: ['No owner'] },
    { id: 'notarget', label: 'No target date', tone: 'grey', icon: 'help', test: (c) => c.open && !c.effTarget, attn: ['No target date'] },
  ];
  const AV = { cat: 'immediate' };

  function trackerRow(r) {
    const c = r.calc;
    const g = (f) => { const v = TMD.getStd(r, f); return v === undefined || v === null ? '' : TMD.cellText(v); };
    const action = g('actionRequired') || g('correctiveAction') || g('remediationPlan');
    return `<tr data-crec="${esc(r.id)}" tabindex="0">
      <td class="nowrap"><strong>${esc(c.obsId || '#' + r.rowNum)}</strong></td><td class="small">${esc(c.auditName)}</td><td>${esc(c.location)}</td>
      <td><div class="clamp2" title="${esc(c.text)}">${esc(c.title)}</div></td><td>${TMD.sevBadge(c.severity)}</td>
      <td><div class="clamp2 small" title="${esc(action)}">${esc(action) || '<span class="nil">—</span>'}</div></td>
      <td>${esc(c.owner) || '<span class="txt-red">—</span>'}</td><td>${esc(c.pendingWith)}</td>
      <td class="nowrap">${c.d.target ? esc(TMD.fmtDate(c.d.target)) : '—'}</td><td class="nowrap">${c.d.revised ? esc(TMD.fmtDate(c.d.revised)) : '—'}</td>
      <td>${TMD.cstatusBadge(c.cstatus)}</td><td class="small">${esc(c.evidenceStatus)}</td>
      <td class="num">${c.daysRemaining !== null ? c.daysRemaining : '—'}</td><td class="num ${c.overdue ? 'txt-red' : ''}">${c.overdue ? c.daysOverdue : '—'}</td>
      <td class="nowrap">${c.d.nextFU ? esc(TMD.fmtDate(c.d.nextFU)) : '—'}</td>
      <td><button class="btn subtle sm" data-quick="${esc(r.id)}">${TMD.icon('zap')}<span>Update</span></button></td></tr>`;
  }
  function renderTracker() {
    const host = TMD.$('#page-cyber-actions');
    const recs = S.filtered;
    const counts = CATS.map((k) => ({ k, list: recs.filter((r) => k.test(r.calc, r)) }));
    const cur = counts.find((x) => x.k.id === AV.cat) || counts[0];
    const list = cur.list.slice().sort((a, b) => (b.calc.daysOverdue - a.calc.daysOverdue) || ((a.calc.daysRemaining === null ? 9999 : a.calc.daysRemaining) - (b.calc.daysRemaining === null ? 9999 : b.calc.daysRemaining)));
    host.innerHTML = `
      <div class="page-head cyber-head"><div><div class="eyebrow">${TMD.icon('shield')} Cyber Security Audits</div><h2>Cyber Security Action Tracker</h2><p class="muted">Actions requiring follow-up · use <strong>Update</strong> for quick status / follow-up changes</p></div>
        <div class="page-actions"><button class="btn subtle" data-exp="tracker">${TMD.icon('download')}<span>Export action tracker</span></button></div></div>
      <div class="cat-grid">${counts.map(({ k, list: l }) => `<button class="cat-card tone-${k.tone} ${k.id === cur.k.id ? 'active' : ''}" data-cat="${k.id}" ${k.hint ? `data-tip="${esc(k.hint)}"` : ''}><span class="kpi-ico">${TMD.icon(k.icon)}</span><span class="cat-n">${l.length}</span><span class="cat-l">${esc(k.label)}</span></button>`).join('')}</div>
      <section class="card"><header class="card-h"><div><h3>${esc(cur.k.label)}</h3><p class="card-sub">${list.length} observation(s)</p></div><button class="btn subtle" data-toreg="${cur.k.id}">Show in register →</button></header>
        <div class="table-wrap tracker"><table class="data-table hover"><thead><tr><th>Obs. ID</th><th>Audit</th><th>Location</th><th>Observation</th><th>Severity</th><th>Action required</th><th>Action owner</th><th>Pending with</th><th>Target</th><th>Revised</th><th>Current status</th><th>Evidence</th><th class="num">Days remaining</th><th class="num">Days overdue</th><th>Next follow-up</th><th></th></tr></thead>
        <tbody>${list.map(trackerRow).join('') || '<tr><td colspan="16" class="pad muted">Nothing in this category.</td></tr>'}</tbody></table></div></section>`;
  }

  /* ---------------- Alert Centre ---------------- */
  const SECTIONS = [
    ['Critical open observations', (c) => c.open && c.severity === 'Critical', 'high'],
    ['High-risk open observations', (c) => c.open && c.severity === 'High', 'high'],
    ['Overdue observations', (c) => c.overdue, 'high'],
    ['Target dates approaching', (c) => c.open && !c.overdue && inWin(c.effTarget, +TMD.settings.get('cyberThrTarget') || 30), 'medium'],
    ['Evidence pending', (c) => c.evidencePending, 'medium'],
    ['Verification pending', (c) => c.verificationPending, 'medium'],
    ['Long-open observations', (c) => c.open && c.openAge !== null && c.openAge > (+TMD.settings.get('cyberThrLongOpen') || 90), 'medium'],
    ['No assigned owner', (c, r) => c.open && TMD.hasStd(r, 'owner') && !c.owner, 'medium'],
    ['No target date', (c) => c.open && !c.effTarget, 'medium'],
    ['Repeat observations', (c) => c.repeat && c.open, 'low'],
    ['Escalation required', (c) => c.open && c.escalation, 'high'],
    ['Data conflicts', (c) => c.dq.some((q) => /c-conflict|c-open-closuredate|c-seq-closure|c-closed-nodate/.test(q.code)), 'low'],
  ];
  const AL = { open: new Set(['Critical open observations', 'Overdue observations']) };
  function renderAlerts() {
    const host = TMD.$('#page-cyber-alerts');
    const recs = S.filtered;
    const thrT = +TMD.settings.get('cyberThrTarget') || 30, thrL = +TMD.settings.get('cyberThrLongOpen') || 90;
    host.innerHTML = `
      <div class="page-head cyber-head"><div><div class="eyebrow">${TMD.icon('shield')} Cyber Security Audits</div><h2>Cyber Security Audit Alerts</h2><p class="muted">Calculated offline from the system date (${esc(TMD.fmtDate(TMD.today()))}). No e-mail, SMS or online notifications are sent.</p></div>
        <div class="page-actions">
          <label class="tb-sel">Target approaching within <select class="inp inp-sm" data-thr="cyberThrTarget">${[7, 15, 30, 60].map((n) => `<option ${thrT === n ? 'selected' : ''}>${n}</option>`).join('')}</select> days</label>
          <label class="tb-sel">Long open after <select class="inp inp-sm" data-thr="cyberThrLongOpen">${[30, 60, 90, 180, 365].map((n) => `<option ${thrL === n ? 'selected' : ''}>${n}</option>`).join('')}</select> days</label>
        </div></div>
      <div class="alert-sections">${SECTIONS.map(([label, fn, sev]) => {
        const list = recs.filter((r) => fn(r.calc, r));
        const open = AL.open.has(label);
        return `<section class="card alert-sec sev-${sev} ${list.length ? '' : 'empty'}"><button class="alert-sec-h" data-sec="${esc(label)}" aria-expanded="${open}"><span class="sev-dot"></span><span class="as-l">${esc(label)}</span><span class="as-n">${list.length}</span>${TMD.icon(open ? 'chevronDown' : 'chevronRight')}</button>
          ${open && list.length ? `<div class="as-list">${list.slice(0, 50).map((r) => `<button class="att-item" data-crec="${esc(r.id)}"><span class="att-type">${esc(r.calc.obsId || '#' + r.rowNum)}</span><span class="att-title">${esc(r.calc.title)}</span><span class="att-msg muted">${esc([r.calc.location, r.calc.owner, r.calc.statusLabel, r.calc.dueLabel].filter(Boolean).join(' · '))}</span></button>`).join('')}${list.length > 50 ? `<p class="muted small pad">+ ${list.length - 50} more</p>` : ''}</div>` : ''}</section>`;
      }).join('')}</div>`;
  }

  TMD.cyber.alertsPage = { render: renderAlerts };
  TMD.cyber.tracker = { render: renderTracker, CATS };
  TMD.cyberAlertCount = () => S.records.filter((r) => r.calc && r.calc.open && (r.calc.overdue || r.calc.severity === 'Critical' || r.calc.escalation)).length;

  TMD.initCyberAlerts = function () {
    const t = TMD.$('#page-cyber-actions');
    t.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quick]'); if (q) { e.stopPropagation(); const rec = S.records.find((x) => x.id === q.dataset.quick); if (rec) TMD.cyber.details.quickUpdate(rec); return; }
      const c = e.target.closest('[data-cat]'); if (c) { AV.cat = c.dataset.cat; renderTracker(); return; }
      const tr = e.target.closest('[data-toreg]'); if (tr) { const k = CATS.find((x) => x.id === tr.dataset.toreg); M.filters.merge({ attention: k.attn }); TMD.go('cyber-register'); return; }
      if (e.target.closest('[data-exp]')) { TMD.cyber.exporter.exportPreset('tracker'); return; }
      const r = e.target.closest('[data-crec]'); if (r) { const rec = S.records.find((x) => x.id === r.dataset.crec); if (rec) TMD.cyber.details.open(rec); }
    });
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('tr[data-crec]'); if (r) r.click(); } });
    const a = TMD.$('#page-cyber-alerts');
    a.addEventListener('click', (e) => {
      const s = e.target.closest('[data-sec]'); if (s) { const k = s.dataset.sec; if (AL.open.has(k)) AL.open.delete(k); else AL.open.add(k); renderAlerts(); return; }
      const r = e.target.closest('[data-crec]'); if (r) { const rec = S.records.find((x) => x.id === r.dataset.crec); if (rec) TMD.cyber.details.open(rec); }
    });
    a.addEventListener('change', (e) => { if (e.target.dataset.thr) TMD.settings.set(e.target.dataset.thr, +e.target.value); });
  };
})();
