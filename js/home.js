/* =====================================================================
 * home.js — Home / Executive Dashboard: two entry-point cards (Tender
 * Monitoring, Cyber Security Audit). The modules stay fully separate;
 * these cards only summarise and link.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;

  function stat(label, value, tone) { return `<div class="hstat ${tone ? 'txt-' + tone : ''}"><span class="hstat-n">${esc(value)}</span><span class="hstat-l">${esc(label)}</span></div>`; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function render() {
    const host = TMD.$('#page-home');
    const t = TMD.state, c = TMD.cyber.state;
    const tr = t.records || [], cr = c.records || [];
    const inProg = tr.filter((r) => r.calc && r.calc.stage >= 5 && r.calc.stage <= 15).length;
    const awardPending = tr.filter((r) => r.calc && r.calc.stage >= 13 && r.calc.stage <= 15).length;
    const delayed = tr.filter((r) => r.calc && r.calc.delayed).length;
    const followUp = tr.filter((r) => r.calc && r.calc.alerts.some((a) => a.statusDue)).length;
    const cs = TMD.cyberStats(cr);
    const src = (st) => (st.workbook ? `${esc(st.workbook.fileName)} · ${TMD.fmtInt(st.records.length)} records${st.workbook.isDemo ? ' · <span class="tag tag-amber">demo</span>' : ''}` : 'No data loaded');
    host.innerHTML = `
      <div class="home-hero">
        <div class="eyebrow">${esc(TMD.settings.get('orgName') || '')}</div>
        <h2>${greeting()}.</h2>
        <p class="muted">${esc(TMD.fmtDate(TMD.today(), 'dd mmm yyyy'))} · ${esc(TMD.settings.get('title'))}</p>
        <p class="offline-line">${TMD.icon('lock')} Offline Mode — all data stays on this device</p>
      </div>
      <div class="home-grid">
        <section class="home-card tender">
          <div class="hc-head"><span class="hc-ico">${TMD.icon('file')}</span><div><h3>Tender Monitoring</h3><p class="muted small">${src(t)}</p></div></div>
          <div class="hc-stats">${stat('Total tenders', TMD.fmtInt(tr.length))}${stat('In progress', TMD.fmtInt(inProg))}${stat('Award pending', TMD.fmtInt(awardPending))}${stat('Overdue / delayed', TMD.fmtInt(delayed), delayed ? 'red' : '')}</div>
          ${followUp ? `<p class="hc-note">${TMD.icon('bell')} ${followUp} tender(s) need a status follow-up</p>` : ''}
          <div class="hc-actions"><a class="btn primary" href="#dashboard">Open Tender Dashboard ${TMD.icon('chevronRight')}</a><button class="btn subtle" data-imp="tender">${TMD.icon('upload')}<span>Import tender data</span></button></div>
        </section>
        <section class="home-card cyber">
          <div class="hc-head"><span class="hc-ico">${TMD.icon('shield')}</span><div><h3>Cyber Security Audit</h3><p class="muted small">${src(c)}</p></div></div>
          <div class="hc-stats">${stat('Total observations', TMD.fmtInt(cs.total))}${stat('Open', TMD.fmtInt(cs.pending))}${stat('Critical / High open', TMD.fmtInt(cs.critOpen + cs.highOpen), cs.critOpen ? 'red' : '')}${stat('Overdue', TMD.fmtInt(cs.overdue), cs.overdue ? 'red' : '')}</div>
          <p class="hc-note">${TMD.icon('chart')} Closure progress ${TMD.fmtNum(cs.closurePct, 1)}%<span class="mini-bar"><span style="width:${Math.min(100, cs.closurePct)}%"></span></span></p>
          <div class="hc-actions"><a class="btn primary cyber" href="#cyber">Open Cyber Audit Dashboard ${TMD.icon('chevronRight')}</a><button class="btn subtle" data-imp="cyber">${TMD.icon('upload')}<span>Import audit data</span></button></div>
        </section>
      </div>
      <p class="muted small center">Each module keeps its own data source, filters, edit mode and exports. Loading one never replaces the other.</p>`;
  }
  TMD.home = { render };
  TMD.initHome = function () {
    TMD.$('#page-home').addEventListener('click', (e) => { const b = e.target.closest('[data-imp]'); if (b) TMD.openImport(b.dataset.imp); });
  };
})();
