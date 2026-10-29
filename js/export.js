/* =====================================================================
 * export.js — Excel / CSV export, printing and management summary.
 * Downloads are generated in the browser (Blob) — the uploaded source
 * file is never overwritten. Identifiers are written as text.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;
  const esc = TMD.esc;

  function uniqueName(name, used) {
    let n = String(name).replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31) || 'Sheet';
    let i = 2;
    while (used.has(n.toLowerCase())) { const suf = ` (${i++})`; n = n.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  /** Build a SheetJS cell for a source value. */
  function makeCell(v, meta, hint, opts) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      if (meta && meta.isId) return { t: 's', v: TMD.numToPlainString(v) };
      if (meta && (meta.isDate || meta.type === 'date') && opts.realDates && hint) { const d = TMD.fromIso(hint); return { t: 'n', v: TMD.dateToSerial(d), z: 'dd-mm-yyyy' }; }
      if (meta && meta.type === 'amount') return { t: 'n', v, z: '#,##0.00' };
      return { t: 'n', v };
    }
    const s = String(v);
    if (meta && (meta.isDate || meta.type === 'date' || meta.type === 'milestone') && opts.realDates) {
      const p = TMD.parseDate(s, hint, false);
      if (p.kind === 'date' && p.date) return { t: 'n', v: TMD.dateToSerial(p.date), z: 'dd-mm-yyyy' };
    }
    return { t: 's', v: s };
  }

  function calcExportCols() {
    return [
      { label: '[Calc] Current Stage', get: (r) => TMD.stageInfo(r.calc.stage).label },
      { label: '[Calc] Stage Reason', get: (r) => r.calc.stageReason },
      { label: '[Calc] Delay / Track', get: (r) => r.calc.delayLabel },
      { label: '[Calc] Data Conflict', get: (r) => r.calc.conflict || '' },
    ].concat(TMD.CALC_COLS.filter((c) => c.id !== '__reason').map((c) => ({ label: '[Calc] ' + c.label, get: (r) => { const v = c.get(r.calc, r); return v === null || v === undefined ? '' : (c.type === 'pct' ? Math.round(v * 10) / 10 : v); } })));
  }

  function writeLoadedSheet(sheet, rows, opts) {
    const ws = {};
    const enc = window.XLSX.utils.encode_cell;
    let r = 0, maxC = sheet.headers.length;
    (sheet.preHeader || []).forEach((row) => {
      if (row) row.forEach((v, c) => { if (v !== null && v !== undefined && v !== '') { ws[enc({ r, c })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) }; maxC = Math.max(maxC, c + 1); } });
      r++;
    });
    const hdrRow = r;
    sheet.headers.forEach((h, c) => { if (!h.blank) ws[enc({ r, c })] = { t: 's', v: h.label }; });
    const calc = opts.calcDefs ? opts.calcDefs : opts.calcCols ? calcExportCols() : [];
    calc.forEach((cc, j) => { ws[enc({ r, c: sheet.headers.length + j })] = { t: 's', v: cc.label }; });
    r++;
    rows.forEach((rec) => {
      sheet.headers.forEach((h, c) => {
        const cell = makeCell(rec.values[h.key], sheet.colMeta[h.key], rec.dateHints[h.key], opts);
        if (cell) ws[enc({ r, c })] = cell;
      });
      calc.forEach((cc, j) => { const v = cc.get(rec); if (v !== '' && v !== null && v !== undefined) ws[enc({ r, c: sheet.headers.length + j })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) }; });
      r++;
    });
    const lastC = Math.max(maxC, sheet.headers.length + calc.length) - 1;
    ws['!ref'] = window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, hdrRow), c: Math.max(0, lastC) } });
    if (sheet.merges && sheet.merges.length) ws['!merges'] = sheet.merges.map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
    ws['!autofilter'] = { ref: window.XLSX.utils.encode_range({ s: { r: hdrRow, c: 0 }, e: { r: Math.max(hdrRow, r - 1), c: Math.max(0, sheet.headers.length + calc.length - 1) } }) };
    ws['!cols'] = sheet.headers.map((h) => ({ wch: Math.max(8, Math.min(50, (sheet.colMeta[h.key].type === 'longtext' ? 40 : h.display.length + 2))) })).concat(calc.map((c) => ({ wch: Math.min(40, c.label.length + 2) })));
    return ws;
  }

  function writeRawSheet(raw) {
    const ws = {};
    const enc = window.XLSX.utils.encode_cell;
    let maxC = 0;
    (raw.aoa || []).forEach((row, r) => {
      if (!row) return;
      row.forEach((v, c) => {
        if (v === null || v === undefined || v === '') return;
        const hint = raw.hints && raw.hints[r + ':' + c];
        ws[enc({ r, c })] = hint ? { t: 'n', v: TMD.dateToSerial(TMD.fromIso(hint)), z: 'dd-mm-yyyy' } : typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) };
        maxC = Math.max(maxC, c);
      });
    });
    const n = (raw.aoa || []).length;
    ws['!ref'] = window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, n - 1), c: maxC } });
    if (raw.merges && raw.merges.length) ws['!merges'] = raw.merges;
    return ws;
  }

  function aoaSheet(aoa, widths) {
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
  }

  function summaryAoa(recs) {
    const st = TMD.state;
    const aoa = [[`${TMD.settings.get('title')} — Dashboard Summary`], [`Generated locally ${new Date().toLocaleString('en-IN')} · source: ${st.workbook.fileName} · worksheet(s): ${st.activeSheets.join(', ')}`], [TMD.filters.activeCount() ? 'Filters applied: ' + filterText() : 'No filters applied'], [], ['Indicator', 'Value', 'Notes']];
    TMD.kpiValues(recs).forEach((x) => aoa.push([x.k.label, x.k.money ? Math.round(x.value) : x.value, x.k.money ? `₹ (rupees); ${TMD.fmtMoney(x.value)}` : '']));
    aoa.push([], ['Stage', 'Count']);
    TMD.STAGES.slice(1).forEach((s) => { const n = recs.filter((r) => r.calc.stage === s.n).length; if (n) aoa.push([TMD.stageLabel(s.n), n]); });
    return aoa;
  }
  function filterText() {
    const f = TMD.filters;
    const parts = f.DEFS.filter((d) => { const v = f.state.values[d.id]; return v && (Array.isArray(v) ? v.length : typeof v === 'object' ? (v.min || v.max || v.from || v.to) : String(v).trim()); }).map((d) => `${d.label}: ${f.describe(d.id)}`);
    if (f.searchTerm()) parts.unshift(`Search: "${f.searchTerm()}"`);
    return parts.join('; ') + ` (${f.state.logic})`;
  }

  /** Build and download the workbook. */
  async function exportExcel(o) {
    const st = TMD.state;
    const wbState = st.workbook;
    const X = window.XLSX;
    TMD.progress('Building Excel workbook…');
    await TMD.nextFrame();
    try {
      const out = X.utils.book_new();
      const used = new Set();
      let scopeSet = null;
      if (o.scope === 'filtered') scopeSet = new Set(st.filtered.map((r) => r.id));
      if (o.scope === 'selected') scopeSet = new Set(Array.from(st.selection));
      let written = 0;
      wbState.sheetNames.forEach((name) => {
        const sheet = wbState.sheets[name];
        if (sheet) {
          if (o.scope !== 'full' && st.activeSheets.indexOf(name) < 0) return;
          const rows = scopeSet ? sheet.rows.filter((r) => scopeSet.has(r.id)) : sheet.rows;
          if (o.scope !== 'full' && !rows.length) return;
          X.utils.book_append_sheet(out, writeLoadedSheet(sheet, rows, o), uniqueName(name, used));
          written += rows.length;
          if (o.origCopies && sheet.rows.some((r) => r.edited || r.isNew) && wbState.original[name]) {
            const origRows = sheet.rows.filter((r) => !r.isNew && wbState.original[name][r.id]).map((r) => Object.assign({}, r, { values: wbState.original[name][r.id].values, dateHints: wbState.original[name][r.id].dateHints }));
            X.utils.book_append_sheet(out, writeLoadedSheet(sheet, origRows, Object.assign({}, o, { calcCols: false })), uniqueName('Orig - ' + name, used));
          }
        } else if (o.scope === 'full' && o.otherSheets && wbState.raw[name]) {
          X.utils.book_append_sheet(out, writeRawSheet(wbState.raw[name]), uniqueName(name, used));
        }
      });
      const recs = o.scope === 'full' ? st.records : st.records.filter((r) => scopeSet.has(r.id));
      if (o.summary) X.utils.book_append_sheet(out, aoaSheet(summaryAoa(recs), [40, 18, 40]), uniqueName('Dashboard Summary', used));
      if (o.dq) {
        const list = TMD.dataQuality.collect('tender').filter((x) => !x.rec || recs.indexOf(x.rec) >= 0);
        X.utils.book_append_sheet(out, aoaSheet([['Severity', 'Worksheet', 'Row', 'Tender identifier', 'Affected field', 'Problem', 'Suggested correction']].concat(list.map((x) => [x.sev, x.sheet, x.rowNum, x.ident, x.field, x.msg, x.suggestion])), [10, 16, 6, 24, 24, 60, 50]), uniqueName('Data Quality Report', used));
      }
      if (o.audit) X.utils.book_append_sheet(out, aoaSheet(TMD.audit.toAoa(), [20, 18, 16, 16, 6, 24, 28, 40, 40]), uniqueName('Audit Log', used));
      X.utils.book_append_sheet(out, aoaSheet([
        ['Export information'], ['Generated (local time)', new Date().toLocaleString('en-IN')], ['Source file', wbState.fileName], ['Scope', o.scope + (o.scope === 'filtered' ? ' — ' + filterText() : '')],
        ['Records exported', recs.length], ['Calculated columns included', o.calcCols ? 'Yes ([Calc] prefix — not part of the source data)' : 'No'], ['Dates written as Excel dates', o.realDates ? 'Yes (unrecognised or text values kept as text)' : 'No (original text kept)'],
        ['Note', 'Generated offline by the Tender Monitoring Dashboard. The original imported workbook was not modified.'],
        ...(wbState.isDemo ? [['WARNING', 'DEMONSTRATION DATA — fictitious sample records']] : []),
      ], [32, 90]), uniqueName('Export Info', used));
      const data = X.write(out, { bookType: 'xlsx', type: 'array', compression: true });
      const fname = o.filename || `Tender_Tracker_Updated_${TMD.stamp()}.xlsx`;
      TMD.downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
      TMD.audit.log({ action: 'EXPORT', field: 'Excel export', newValue: `${fname} — ${o.scope}, ${written} row(s)` });
      TMD.progress(false);
      TMD.toast(`Downloaded ${fname}. Your original file was not modified.`, 'success', 5000);
      return true;
    } catch (e) {
      console.error(e);
      TMD.progress(false);
      TMD.toast('Excel export failed: ' + e.message, 'error', 7000);
      return false;
    }
  }

  async function openDialog(scope) {
    const st = TMD.state;
    if (!st.workbook) return false;
    const selN = st.selection.size;
    const def = `Tender_Tracker_Updated_${TMD.stamp()}.xlsx`;
    const body = `
      <fieldset class="fgroup"><legend>Records</legend>
        <label class="chk"><input type="radio" name="xs" value="full" ${scope === 'full' ? 'checked' : ''}> Full dataset — all loaded worksheets (${TMD.fmtInt(Object.values(st.workbook.sheets).reduce((s, sh) => s + sh.rows.length, 0))} records)</label>
        <label class="chk"><input type="radio" name="xs" value="filtered" ${scope === 'filtered' ? 'checked' : ''}> Filtered dataset — ${TMD.fmtInt(st.filtered.length)} record(s) in the current view</label>
        <label class="chk"><input type="radio" name="xs" value="selected" ${scope === 'selected' ? 'checked' : ''} ${selN ? '' : 'disabled'}> Selected rows — ${selN} selected</label>
      </fieldset>
      <fieldset class="fgroup"><legend>Options</legend>
        <label class="chk"><input type="checkbox" id="xOther" checked> Preserve all other original worksheets (full export)</label>
        <label class="chk"><input type="checkbox" id="xCalc"> Add calculated columns (stage, delay, durations…) at the end of each sheet</label>
        <label class="chk"><input type="checkbox" id="xDates" checked> Write recognised dates as Excel dates (dd-mm-yyyy)</label>
        <label class="chk"><input type="checkbox" id="xSummary" checked> Add “Dashboard Summary” sheet</label>
        <label class="chk"><input type="checkbox" id="xDq" checked> Add “Data Quality Report” sheet</label>
        <label class="chk"><input type="checkbox" id="xAudit" checked> Add “Audit Log” sheet</label>
        <label class="chk"><input type="checkbox" id="xOrig"> Also include unedited original copies of edited worksheets (“Orig - …”)</label>
      </fieldset>
      <label class="field"><span>File name</span><input class="inp" id="xName" value="${esc(def)}"></label>
      <p class="muted small">Headers, column order and identifiers (PR, CRFQ/GeM, PO/OLA, WBS) are preserved as text. The file downloads to your computer; nothing is uploaded.</p>`;
    let o = null;
    const res = await TMD.modal({ title: 'Export to Excel (.xlsx)', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Download Excel', value: 'ok', kind: 'primary' }],
      beforeClose: (v, dlg) => {
        if (v === 'ok') {
          const q = (id) => dlg.querySelector(id);
          let name = q('#xName').value.trim() || def;
          name = name.replace(/[\\\/:*?"<>|]/g, '_');
          if (!/\.xlsx$/i.test(name)) name += '.xlsx';
          o = { scope: dlg.querySelector('input[name=xs]:checked').value, otherSheets: q('#xOther').checked, calcCols: q('#xCalc').checked, realDates: q('#xDates').checked, summary: q('#xSummary').checked, dq: q('#xDq').checked, audit: q('#xAudit').checked, origCopies: q('#xOrig').checked, filename: name };
        }
        return true;
      } });
    if (res !== 'ok' || !o) return false;
    return exportExcel(o);
  }

  async function csvDialog(scopeHint) {
    const st = TMD.state;
    const body = `
      <label class="field"><span>Worksheet</span><select class="inp" id="cSheet">${st.activeSheets.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <fieldset class="fgroup"><legend>Records</legend>
        <label class="chk"><input type="radio" name="cs" value="full" ${scopeHint !== 'filtered' ? 'checked' : ''}> Full worksheet</label>
        <label class="chk"><input type="radio" name="cs" value="filtered" ${scopeHint === 'filtered' ? 'checked' : ''}> Filtered records only</label>
        <label class="chk"><input type="radio" name="cs" value="selected" ${st.selection.size ? '' : 'disabled'}> Selected rows only (${st.selection.size})</label></fieldset>
      <label class="chk"><input type="checkbox" id="cCalc"> Add calculated columns</label>
      <label class="chk"><input type="checkbox" id="cProt" ${TMD.settings.get('csvProtect') ? 'checked' : ''}> Protect against spreadsheet formula injection (prefix cells starting with = + - @)</label>
      <p class="muted small">UTF-8 with BOM, comma-separated. Values are written exactly as stored (dates as originally displayed).</p>`;
    let o = null;
    const res = await TMD.modal({ title: 'Export CSV', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Download CSV', value: 'ok', kind: 'primary' }],
      beforeClose: (v, dlg) => { if (v === 'ok') o = { sheet: dlg.querySelector('#cSheet').value, scope: dlg.querySelector('input[name=cs]:checked').value, calc: dlg.querySelector('#cCalc').checked, protect: dlg.querySelector('#cProt').checked }; return true; } });
    if (res !== 'ok' || !o) return false;
    const sheet = st.workbook.sheets[o.sheet];
    let rows = sheet.rows;
    if (o.scope === 'filtered') { const s = new Set(st.filtered.map((r) => r.id)); rows = rows.filter((r) => s.has(r.id)); }
    if (o.scope === 'selected') rows = rows.filter((r) => st.selection.has(r.id));
    const calc = o.calc ? calcExportCols() : [];
    const lines = [sheet.headers.map((h) => TMD.csvCell(h.label, o.protect)).concat(calc.map((c) => TMD.csvCell(c.label))).join(',')];
    rows.forEach((r) => lines.push(sheet.headers.map((h) => TMD.csvCell(TMD.cellText(r.values[h.key]), o.protect)).concat(calc.map((c) => TMD.csvCell(c.get(r), o.protect))).join(',')));
    const fname = `${o.sheet.replace(/[^A-Za-z0-9]+/g, '_')}_${o.scope}_${TMD.stamp()}.csv`;
    TMD.downloadText(lines.join('\r\n'), fname);
    TMD.audit.log({ action: 'EXPORT', field: 'CSV export', newValue: `${fname} — ${rows.length} row(s)` });
    TMD.toast(`Downloaded ${fname}.`, 'success');
    return true;
  }

  function exportAuditCsv(list) {
    const fname = `Audit_Log_${TMD.stamp()}.csv`;
    TMD.downloadText(TMD.audit.toCsv(list), fname);
    TMD.toast(`Downloaded ${fname}.`, 'success');
  }

  async function printDashboard() {
    if (TMD.state.page !== 'dashboard') { TMD.go('dashboard'); await TMD.nextFrame(); }
    TMD.charts.renderAll();
    await new Promise((r) => setTimeout(r, 450));
    document.body.classList.add('printing-dashboard');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-dashboard'), 500);
  }

  /* ---------------- Management summary (printable / downloadable HTML) ---------------- */
  function summaryHtml() {
    const st = TMD.state;
    const recs = st.filtered;
    const vals = TMD.kpiValues(recs);
    const kp = (id) => vals.find((x) => x.k.id === id);
    const fmt = (x) => (x.k.money ? TMD.fmtMoney(x.value) : TMD.fmtInt(x.value));
    const stageRows = TMD.STAGES.slice(1).map((s) => ({ s, n: recs.filter((r) => r.calc.stage === s.n).length, d: recs.filter((r) => r.calc.stage === s.n && r.calc.delayed).length })).filter((x) => x.n);
    const depts = new Map();
    recs.forEach((r) => { const k = r.calc.department || '(Blank)'; const o = depts.get(k) || depts.set(k, { n: 0, open: 0, delayed: 0, awarded: 0, est: 0, aw: 0 }).get(k); o.n++; if (!r.calc.closed) o.open++; if (r.calc.delayed) o.delayed++; if (r.calc.awarded) { o.awarded++; o.aw += r.calc.awardedRupees || 0; } o.est += (r.calc.estRupees !== null ? r.calc.estRupees : r.calc.projectRupees) || 0; });
    const delayed = recs.filter((r) => r.calc.delayed).slice(0, 25);
    const T = TMD.today();
    const ups = [];
    recs.forEach((r) => { if (r.calc.closed) return; TMD.milestonesOf(r).forEach((m) => { const d = TMD.daysBetween(T, m.date); if (d >= 0 && d <= 30) ups.push({ r, m, d }); }); });
    ups.sort((a, b) => a.d - b.d);
    const dqHigh = recs.filter((r) => r.calc.dqHigh).length;
    const card = (id) => { const x = kp(id); return `<div class="sk"><div class="skl">${esc(x.k.label)}</div><div class="skv">${esc(fmt(x))}</div></div>`; };
    return `<!DOCTYPE html><html lang="en-IN"><head><meta charset="utf-8"><title>Management Summary — ${esc(TMD.settings.get('title'))}</title>
<style>
body{font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#1b1f24;margin:24px;font-size:12.5px;line-height:1.45;background:#fff}
h1{font-size:20px;margin:0 0 2px;color:#0f3d75}h2{font-size:14px;color:#0f3d75;border-bottom:2px solid #0f3d75;padding-bottom:3px;margin:22px 0 8px}
.meta{color:#5b6573;margin-bottom:12px}.demo{background:#fff4d6;border:1px solid #e3b341;padding:6px 10px;border-radius:6px;margin:8px 0;font-weight:600}
.skgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sk{border:1px solid #d8dee6;border-radius:8px;padding:8px 10px}.skl{color:#5b6573;font-size:11px}.skv{font-size:18px;font-weight:650}
table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border:1px solid #d8dee6;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f7}td.n,th.n{text-align:right}
.red{color:#b42318;font-weight:600}.note{color:#5b6573;font-size:11px;margin-top:18px}
@media print{body{margin:10mm}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(TMD.settings.get('title'))} — Management Summary</h1>
<div class="meta">${esc(TMD.settings.get('orgName'))} · As on ${esc(TMD.fmtDate(T))} · Source: ${esc(st.workbook.fileName)} (${esc(st.activeSheets.join(', '))}) · ${TMD.fmtInt(recs.length)} of ${TMD.fmtInt(st.records.length)} records${TMD.filters.activeCount() ? ' · Filters: ' + esc(filterText()) : ''}</div>
${st.workbook.isDemo ? '<div class="demo">DEMONSTRATION DATA — fictitious sample records</div>' : ''}
<h2>Key indicators</h2><div class="skgrid">${['total', 'capex', 'revex', 'delayed', 'awarded', 'done', 'up7', 'overdue', 'est', 'awval', 'cash', 'dq'].map(card).join('')}</div>
<h2>Pipeline by stage</h2><table><thead><tr><th>Stage</th><th class="n">Tenders</th><th class="n">Delayed</th></tr></thead><tbody>${stageRows.map((x) => `<tr><td>${esc(TMD.stageLabel(x.s.n))}</td><td class="n">${x.n}</td><td class="n ${x.d ? 'red' : ''}">${x.d}</td></tr>`).join('')}</tbody></table>
<h2>Department summary</h2><table><thead><tr><th>Department</th><th class="n">Tenders</th><th class="n">Open</th><th class="n">Delayed</th><th class="n">Awarded</th><th class="n">Estimated</th><th class="n">Awarded value</th></tr></thead><tbody>${Array.from(depts.entries()).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="n">${o.n}</td><td class="n">${o.open}</td><td class="n ${o.delayed ? 'red' : ''}">${o.delayed}</td><td class="n">${o.awarded}</td><td class="n">${esc(TMD.fmtMoney(o.est))}</td><td class="n">${esc(TMD.fmtMoney(o.aw))}</td></tr>`).join('')}</tbody></table>
<h2>Delayed tenders (${recs.filter((r) => r.calc.delayed).length})</h2><table><thead><tr><th>Tender</th><th>Identifier</th><th>Dept</th><th>Stage</th><th>Reason for delay</th></tr></thead><tbody>${delayed.map((r) => `<tr><td>${esc(r.calc.title)}</td><td>${esc(r.calc.ident)}</td><td>${esc(r.calc.department)}</td><td>${esc(TMD.stageInfo(r.calc.stage).label)}</td><td>${esc(r.calc.alerts.filter((a) => a.delay).map((a) => a.msg).join(' '))}</td></tr>`).join('') || '<tr><td colspan="5">None</td></tr>'}</tbody></table>
<h2>Milestones in the next 30 days (${ups.length})</h2><table><thead><tr><th>Date</th><th>Milestone</th><th>Tender</th><th>Identifier</th></tr></thead><tbody>${ups.slice(0, 40).map((u) => `<tr><td>${esc(TMD.fmtDate(u.m.date))}</td><td>${esc(u.m.type)}</td><td>${esc(u.r.calc.title)}</td><td>${esc(u.r.calc.ident)}</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>'}</tbody></table>
<h2>Data quality</h2><p>${TMD.fmtInt(recs.filter((r) => r.calc.dq.length).length)} record(s) have data-quality findings; ${dqHigh} with high-severity findings. See the Data Quality page for details.</p>
<p class="note">Generated offline on ${esc(new Date().toLocaleString('en-IN'))} by the Tender Monitoring Dashboard. Calculated stages are derived from milestone dates and status text; source data were not modified. Amounts in ${esc(TMD.amountScale().label)}.</p>
</body></html>`;
  }

  function managementSummary() { showPrintable(summaryHtml(), 'Management summary', 'Management_Summary'); }
  /** Preview a standalone HTML report in-page with Print / Download HTML / Close. */
  function showPrintable(html, title, filePrefix) {
    const host = TMD.$('#printHost');
    // Render inside the page (no pop-ups, no iframes) for preview & printing.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    host.innerHTML = `<div class="summary-view"><div class="summary-bar no-print"><strong>${esc(title)}</strong><span class="muted">Printable HTML — use Print to save as PDF</span>
      <span class="sp"></span><button class="btn primary" data-s="print">${TMD.icon('printer')}<span>Print / Save as PDF</span></button><button class="btn" data-s="dl">${TMD.icon('download')}<span>Download HTML</span></button><button class="btn" data-s="close">${TMD.icon('x')}<span>Close</span></button></div>
      <div class="summary-doc">${doc.body.innerHTML}</div></div>`;
    document.body.classList.add('summary-open');
    const close = () => { document.body.classList.remove('summary-open', 'printing-custom'); host.innerHTML = ''; };
    host.querySelector('.summary-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      if (b.dataset.s === 'print') { document.body.classList.add('printing-custom'); window.print(); setTimeout(() => document.body.classList.remove('printing-custom'), 500); }
      if (b.dataset.s === 'dl') TMD.downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${filePrefix}_${TMD.stamp()}.html`);
      if (b.dataset.s === 'close') close();
    });
    const onKey = (e) => { if (e.key === 'Escape' && document.body.classList.contains('summary-open')) { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  function exportMenu(anchor) {
    const has = !!TMD.state.workbook;
    TMD.menu(anchor, [
      { header: 'Excel (.xlsx)' },
      { label: 'Export full dataset to Excel…', icon: 'download', disabled: !has, action: () => openDialog('full') },
      { label: 'Export filtered dataset to Excel…', icon: 'filter', disabled: !has, action: () => openDialog('filtered') },
      { label: `Export selected rows to Excel… (${TMD.state.selection.size})`, icon: 'check', disabled: !TMD.state.selection.size, action: () => openDialog('selected') },
      { header: 'CSV' },
      { label: 'Export current sheet to CSV…', icon: 'file', disabled: !has, action: () => csvDialog() },
      { label: 'Export change log (audit log) to CSV', icon: 'history', action: () => exportAuditCsv() },
      { header: 'Reports' },
      { label: 'Monthly / quarterly report…', icon: 'calendar', disabled: !has, action: () => TMD.go('reports') },
      { label: 'Tender report generator…', icon: 'columns', disabled: !has, action: () => { TMD.reportsTab = 'generator'; TMD.go('reports'); } },
      { header: 'Print & reports' },
      { label: 'Print dashboard / Save as PDF', icon: 'printer', action: printDashboard },
      { label: 'Management summary (printable HTML)', icon: 'file', disabled: !has, action: managementSummary },
      { label: 'Print tender details', icon: 'printer', disabled: !TMD.details.current(), action: () => { const b = TMD.$('#detailsDrawer [data-a="print"]'); if (b) b.click(); } },
    ], { alignRight: true });
  }

  TMD.xlsxWriters = { writeLoadedSheet, writeRawSheet, aoaSheet, uniqueName };
  TMD.showPrintable = showPrintable;
  TMD.reportCss = () => (/<style>([\s\S]*?)<\/style>/.exec(summaryHtml()) || [])[1] || '';
  TMD.exporter = { openDialog, exportExcel, csvDialog, exportAuditCsv, printDashboard, managementSummary, exportMenu, summaryHtml };
})();
