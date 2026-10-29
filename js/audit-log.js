/* =====================================================================
 * audit-log.js — local log of changes made inside this application.
 * NOTE: this is a convenience log kept in the browser; it is not
 * tamper-proof and is not equivalent to an enterprise audit system.
 * ===================================================================== */
(function () {
  'use strict';
  const TMD = window.TMD;

  /** Create an independent local audit log (one per module). */
  TMD.createAuditLog = function (moduleId) {
  let entries = [];
  return {
    all: () => entries,
    load(list) { entries = Array.isArray(list) ? list : []; },
    clear() { entries = []; TMD.emit('audit', { module: moduleId }); },
    /** {action, sheet, recordId, recordLabel, field, oldValue, newValue} */
    log(e) {
      const entry = Object.assign({
        id: TMD.uid('a'), ts: Date.now(), sessionId: TMD.state.sessionId, module: moduleId,
        action: 'EDIT', sheet: '', recordId: '', recordLabel: '', rowNum: '', field: '', oldValue: '', newValue: '',
      }, e);
      ['oldValue', 'newValue'].forEach((k) => { if (entry[k] === null || entry[k] === undefined) entry[k] = ''; else if (typeof entry[k] !== 'string') entry[k] = String(entry[k]); });
      entries.push(entry);
      TMD.emit('audit', entry);
      return entry;
    },
    forRecord: (id) => entries.filter((e) => e.recordId === id),
    toCsv(list) {
      const head = ['Local timestamp', 'Session ID', 'Action', 'Worksheet', 'Row', 'Record identifier', 'Field', 'Previous value', 'New value'];
      const protect = TMD.settings.get('csvProtect');
      const lines = [head.join(',')].concat((list || entries).map((e) => [TMD.fmtDateTime(e.ts) + ':' + String(new Date(e.ts).getSeconds()).padStart(2, '0'), e.sessionId, e.action, e.sheet, e.rowNum, e.recordLabel || e.recordId, e.field, e.oldValue, e.newValue].map((v) => TMD.csvCell(v, protect)).join(',')));
      return lines.join('\r\n');
    },
    toAoa(list) {
      return [['Local timestamp', 'Session ID', 'Action', 'Worksheet', 'Row', 'Record identifier', 'Field', 'Previous value', 'New value']]
        .concat((list || entries).map((e) => [new Date(e.ts).toLocaleString('en-IN'), e.sessionId, e.action, e.sheet, e.rowNum, e.recordLabel || e.recordId, e.field, e.oldValue, e.newValue]));
    },
  };
  };
  TMD.audit = TMD.createAuditLog('tender');
})();
