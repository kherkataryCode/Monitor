# User Guide — Tender Monitoring Dashboard

This guide walks through daily use. The application works completely offline. Your data never leaves your computer.

---

## 1. Screen layout

| Area | Purpose |
|------|---------|
| **Header** (compact) | Sidebar button, logo and the title of the current module, a chip with the loaded **file · worksheet(s)** (click to change worksheets), *Demo data* tag, the offline indicator (“Offline Mode • Data remains on this device”), **Import**, **Export**, **Recalculate**, **Light / dark** and **Settings**. |
| **Sidebar** (left) | Hidden to a slim icon rail by default — hover an icon for its name, click the sidebar button (top-left) to show / hide the labels. Sections: **Overview** (Home) · **Tender Monitoring** (Dashboard, Tender Register, Timeline, Analytics, Reports, Alerts) · **Cyber Security Audits** (Cyber Audit Dashboard, Observation Register, Action Tracker, Audit Analytics, Audit Alerts) · **System** (Data Quality, Audit Log, Settings). Red badges count alerts. |
| **Filter bar** (sticky) | One per module: search, *Filters*, All / Any logic, *Presets*, *Clear*, filter chips and the record counter. Tender filters never affect audit data and vice versa. |
| **Edit button** (bottom-left) | **View only — Click to unlock editing**. After unlocking it shows *Editing … · Unsaved changes / All changes saved* with **Undo**, **Redo**, **Save** and **Lock**. |

A yellow **Demonstration data** banner is shown in a module until you import your own file into it.

---

## 2. Importing data

1. Open the module you want to load (Tender or Cyber Audit) and click **Import** (or drag a file anywhere onto the window). On Home or a System page you are asked which module to import into.
2. Choose a `.xlsx`, `.xls` or `.csv` file. It is read locally and never uploaded.

**Excel workbooks** — the *Select worksheets* dialog lists every worksheet with:
* *Recognised as* (CAPEX tracker, CAPEX tracker (modified), REVEX tracker, Contract monitoring, generic, utility),
* the **detected header row** (editable — title rows above it are kept),
* the number of records and columns, and notes such as *dup headers*.

Click a worksheet name to preview it. Tick one or more worksheets and click **Load selected worksheets**. When several compatible sheets are ticked (e.g. *Capex* + *REVEX 2026*), they are analysed together; each keeps its own columns. Rows with fewer than *N* filled cells (e.g. rows containing only a serial number) can be skipped; they are listed in the import report.

**CSV files** — a preview shows the detected delimiter and encoding. You can change the delimiter and choose which row is the header.

After loading, the **Data import report** lists file name and size, worksheet, rows, columns, detected date / numeric columns, blank and duplicate headers, rows with insufficient values, invalid dates, potential Excel serial dates and warnings. Reopen it from *Data Quality → Import report*.

> Tip: set a *Default worksheet on import* in Settings (e.g. `Capex Modified`) to pre-select it every time.

To switch the analysed worksheet(s) later, click the worksheet name in the header (or *Tender Register → worksheet button*). Worksheets not loaded at import can be loaded there too.

---

## 3. Dashboard

* **Headline tiles**: Total tenders, In progress (floated → award), PO / OLA awarded (with value), Delayed, Status follow-up due. Click a tile to open the filtered register.
* **CAPEX / REVEX**: split bar and side-by-side figures (tenders, open, awarded, delayed, estimated value, awarded value). Click a side to filter.
* **Management status**: the configurable status groups (Pre-Tender, Under Tendering, Under Evaluation, Award Stage, Under Execution, Completed, On Hold / Dropped, Needs Attention — rename, recolour, re-map or add your own in *Settings → Management status*). Click a row to filter.
* **Needs attention now**, **Status follow-up** (next action date overdue / due, status not updated recently) and **Next 14 days**.
* **All indicators** (expand) holds all 30 clickable KPI cards.
* **18 charts**: management status, CAPEX vs REVEX by status and by value, stage, department, officer workload, channel, estimated / awarded value by department, monthly floating and award trends, upcoming milestones, PR-to-PO and evaluation durations, delayed by stage, vendor-wise awarded value, completed vs pending, initiator. Click a bar or segment to filter; ▦ shows the chart as a table.
* **Monthly / quarterly report**, **Management summary** and **Print** buttons.

### Officer and status follow-up
Every tender sheet gets four columns if the source does not already have them (they are marked “+” in the header and exported with your data): **Officer**, **Current Status Remark**, **Next Action Date** and **Status Updated On**. When you change STATUS or the Current Status Remark, *Status Updated On* is set to today automatically. Alerts are raised when the next action date is overdue or due within *N* days, or when the status has not been updated for *N* days (thresholds in Settings).

---

## 4. Tender Register

**Navigation**: scroll freely both ways; headers and the first data columns stay visible. Use the arrow keys, Tab / Shift+Tab, PgUp / PgDn, Home / End. Press Enter (or double-click) to open the details panel in View Mode.

| Toolbar | Function |
|---------|----------|
| Worksheet button | Choose active worksheet(s) |
| **Columns** | Show / hide columns; “+ All calculated” adds Next Milestone, durations, completeness, data-quality score, etc. (ƒ marks calculated columns) |
| **Group** | Group by Department, CAPEX/REVEX, Channel, Stage, Initiator or Worksheet; click a group row to expand / collapse |
| **Freeze** | Freeze 0–4 data columns |
| **Column search** | Adds a filter box under every header |
| **Wrap / Compact** | Text wrapping (3 lines) and row density |
| **Full screen** | Hides navigation and filters (Esc or the button returns) |
| **More** | Select all filtered, export filtered, print table view, clear sorting, reset layout |

* **Sort**: click a header (again for descending, again to clear). **Shift+click** adds secondary sorts.
* **Resize**: drag a header’s right edge. **Reorder**: drag a header onto another. Widths, order and visibility are remembered.
* **Select rows** with the checkboxes (header checkbox = all filtered rows). Then use **Copy**, **Export selected** or (Edit Mode) **Duplicate / Delete**.
* **Copy cells**: click a cell, Shift+click another to select a range, then Ctrl+C (⌘C on Mac). The copy is tab-separated and pastes straight into Excel.
* **Long text** (STATUS, Remarks, descriptions): hover to see the full text, or click to open it in the side panel with line breaks preserved.
* Formatting cues: red = overdue opening dates; ⚠ = invalid date or text in an amount; *serial* = Excel serial number read as a date (source unchanged); dashed underline = mm/dd/yyyy detected; amber corner = edited cell.
* **Row menu (⋯)**: View details · Edit · Duplicate · Add follow-up · View history · Delete (Edit Mode only).

---

## 5. Tender Details panel

Opens from the row number, double-click, Enter, or any list on other pages. It shows:

* a **lifecycle stepper** (Preparation → Completed; exceptions such as Cancelled are marked),
* **G. Current Status**: calculated stage, *reason*, data-conflict warning, delay indicator, next milestone, original STATUS / Remarks, alerts and data warnings,
* **A–F**: Identification, Description, Financial (with calculated rupee values), Tender Timeline (with calculated durations), Execution, Award,
* other source columns, **follow-up notes** and **H. Local Change History**.

Use ‹ › to move between records and **Print** for a printable record sheet.

---

## 6. Editing safely (Excel-style)

The application always opens in **View Mode** — data is protected.

1. Click the highlighted **View only — Click to unlock editing** button at the bottom-left and confirm.
2. Edit **directly in the cells**, like Excel:
   * click a cell and just start typing (replaces the value), or double-click / Enter / F2 to edit the existing text;
   * **date cells** open with a date picker; an empty date cell is pre-filled with **today** (Enter accepts, *Today* button);
   * Tab / Enter move to the next cell; Esc cancels;
   * **fill handle**: select a cell (or range) and drag the small blue square at its bottom-right corner down / up / sideways. Numbers, dates and text ending in a number continue as a series (1, 2, 3 · 01/11, 02/11 · Item 1, Item 2); other values are copied. Hold **Alt / Option** to copy without a series;
   * **paste** a range copied from Excel (Ctrl+V), **Ctrl+D** fills down, **Delete** clears the selection, Ctrl+X cuts;
   * right-click a cell for *Edit, Copy, Paste, Fill down, Clear, Insert row above / below, Duplicate, Delete row, Add column*;
   * the toolbar adds **Row**, **Column**, **Duplicate**, **Delete**.
3. Each change is validated (invalid dates are kept as typed and flagged), recalculated immediately and written to the local change log. Edited cells have an amber corner.
4. **Undo / Redo** (Ctrl+Z / Ctrl+Y) — a fill or paste is one undo step.
5. **Save** (Ctrl+S): *Save Locally* (IndexedDB working copy, restored next time), *Export Updated Excel* or *Export CSV*.
6. **Lock**: returns to View Mode; with unsaved changes choose *Discard*, *Continue editing* or *Save locally and exit*.

**Header filters**: every column header has a filter button (appears on hover) with *Sort A → Z / Z → A*, a value checklist with search and (Select all), and *Clear filter*. Active header filters are highlighted and can be cleared from the toolbar.

If the browser closes during editing, the next start offers to **recover** the unsaved changes. Tender and Cyber Audit edit sessions are independent.

> The source file on your disk is never modified.

---

## 7. Filters

* **Global search** matches all fields (several words = all must match).
* **Advanced Filters**:
  * Scope: worksheet, financial year, department, Instrumentation/Electrical/Other, CAPEX/REVEX, channel, initiator, nature, vendor
  * Identifiers: WBS, PR, CRFQ/GeM, PO/OLA
  * Status: tender stage, calculated status, status flag, quick status, completed/pending, delayed/on track, overdue, opening due within 7/15/30 days, upcoming milestones, award due, awarded, post-award, FAT/SAT/installation status
  * Amounts (₹ lakh): estimated, project and cash-outflow ranges
  * Dates: PR sent, floating, opening, technical evaluation, price bid, award, validity and CAPEX finish ranges
  * Data: missing critical fields, data-quality warnings, edited records, manual overrides
* Multi-select filters allow several values. **AND** requires all filters; **OR** any filter (search always applies).
* Remove a filter via its chip ×; **Clear all** removes everything.
* **Presets → Save current filters as preset…** stores named presets on this device; load or delete them later.

---

## 8. Timeline, Analytics, Alerts, Data Quality, Audit Log

* **Timeline**: *Upcoming & overdue* lists (window 7–90 days), *Monthly calendar* (colour-coded markers, “+n more”), *Gantt view* (bars from first to latest milestone; hollow markers are planned dates; hatched bars are delayed), *Lifecycle* (counts per stage). Filter by department, owner / initiator, stage group and milestone types. Click any marker to open the tender.
* **Analytics**: department, channel, initiator and CAPEX/REVEX summaries (click a row to filter); cycle-time statistics (min / median / average / max); estimate-versus-award variances; ageing charts.
* **Alerts**: high / medium / low severity cards and alert-type chips. Thresholds are under Settings. Alerts are visible only inside the app — no e-mails or messages are sent.
* **Data Quality**: findings with severity, worksheet, Excel row, identifier, field, problem and suggested correction; filter by check, worksheet or text; *Open record*; export the findings to CSV. Suggestions never change data.
* **Audit Log**: imports, edits (previous → new value), overrides, row additions / deletions, saves, exports, with local timestamps and session ID. Filter, search, export to CSV, or include it in the Excel export. Clear it under Settings.

---

## 9. Settings

Title, organisation, logo, theme (light / dark / system), default worksheet, date format, financial-year start, currency symbol, amount display (rupees / lakh / crore), row density, frozen columns, units for amount columns without a unit in the header, all alert thresholds, **column mapping** per worksheet layout, **friendly column labels** (e.g. “PR No (Indent)” / “PR No (SAP)” for the duplicated headers), IndexedDB persistence, CSV formula-injection protection, **Clear local working data**, **Clear audit history**, **Reset application**.

---

## 10. Understanding the calculated stage

The stage engine first looks at structured dates (PR sent → floated → opening → BQC/technical → price bid → TEC → award → FAT → SAT → installation → handover). It then reads STATUS / Quick Status / Remarks:

* *cancelled, scrapped, refloat required, on hold, completed / handed over* are high-priority indicators;
* current (“pending”, “under”, “in progress”, “to be …”) statements take priority over historical (“completed”) ones;
* “Technical evaluation completed” alone never means the tender is completed;
* when text and dates clearly disagree, the record shows a **Data Conflict** warning;
* unrecognised text without dates is marked **Unknown/Needs Review**.

The reason is always shown. Use a manual override when you know better.

---

## 11. Reports

*Tender Monitoring → Reports* (or **Monthly / quarterly report** on the dashboard).

* **Monthly / quarterly / financial-year report**: choose the period; the report lists headline figures, tenders floated, opened, evaluated, awarded, completed and delayed in that period, CAPEX vs REVEX and department breakdowns and the management-status split. Export to **Excel**, **HTML** or **Print / PDF**.
* **Report generator**: title, records (filtered / all / selected), group by, sort, optional summary table, and **selectable columns** — add from the list on the right, reorder with ↑ ↓, remove with ×; *Management set* restores a sensible default. Save the configuration as a **template** on this device. Output: Excel, CSV, HTML, Print / PDF. A live preview is shown below.

## 12. Cyber Security Audits

A separate module with its own data source, filters, edit mode, change log and exports.

* **Import Audit Data**: any audit observation tracker (.xlsx / .xls / .csv). Columns are recognised flexibly (Observation ID, Observation / Finding, Severity / Criticality / Risk, Location, Department, Action Owner, Target / Revised Target Date, Current Status, Evidence, Verification, Closure Date, Domain, Framework / Clause, …). **No column is mandatory** and nothing is invented. Mappings can be corrected in *Settings → Column mapping → Cyber Security Audits*.
* **Cyber Audit Dashboard** (“Cyber Security Audit Monitoring — Audit Observations • Remediation • Compliance Tracking”): source strip, status summary, **closure progress** (Closed ÷ Total × 100; Closed includes Not Applicable and Risk Accepted), 17 clickable KPIs, **Management Attention** (explicit rules such as Critical + Open, High + Overdue, revised target exceeded, evidence pending beyond target, no owner, no target date, repeated, escalation), location view and audit-wise view, charts.
* **Status**: a calculated 16-step lifecycle (New → Under Review → Action Plan … → Closed, plus Overdue, On Hold, Not Applicable, Risk Accepted, Needs Review). The **original status is always kept** and shown alongside. *Overdue* uses the revised target date when present, otherwise the target date; closed items are never overdue.
* **Severity colours**: Critical (dark red), High (red), Medium (amber), Low (blue), Unclassified (grey). Optional suggested severities (Settings) are always labelled *Suggested* and never saved.
* **Observation Register**: the same Excel-style grid (unlock editing, edit in cells, fill handle, header filters).
* **Observation details**: remediation timeline (Raised → Action Plan → Remediation → Evidence → Verification → Closure), status, all fields, follow-ups and change history. **Quick Update** edits Current Status, Action Taken, Pending With, Target / Revised dates, Evidence Status, Last / Next Follow-up and Remarks in one form (*Save Locally*).
* **Action Tracker**: immediate attention, due this week, due this month, overdue, awaiting evidence / verification / closure, no owner, no target date — with *Update* buttons and export.
* **Audit Alerts**: sections with configurable thresholds (target approaching 7 / 15 / 30 / 60 days; long-open 30 / 60 / 90 / 180 / 365 days).
* **Audit Analytics**: 18 charts (open vs closed, severity, location, department, audit, agency, domain, status, overdue by department / location, ageing 0–30 … >365 days, closure trend, raised vs closed, pending with, repeat, OT vs IT, evidence, compliance).
* **Exports**: full register, filtered, open, overdue, closure report, management summary, action tracker, change log (Excel workbook sheets: Cyber Audit Register, Dashboard Summary, Open Observations, Overdue, Action Tracker, Data Quality, Change Log).

The change history is a local convenience log — it is not cryptographically secured.

## 13. Troubleshooting

| Symptom | Remedy |
|---------|--------|
| A worksheet shows wrong columns | Adjust the header row in the worksheet dialog, or fix the mapping under Settings → Column mapping. |
| Amounts look 100,000× too large / small | Set the correct unit under Settings → Units for amount columns. |
| Dates look swapped | Check Data Quality for “mm/dd/yyyy detected” / “ambiguous” findings and correct the source. |
| Working copy not restored | Local persistence may be off, or a different browser / profile is being used. |
| Very large workbook is slow to open | Use the optional local server (`start-server`) so parsing runs in a background worker. |
| Want a PDF | Use *Print / Save as PDF* and choose “Save as PDF” as the printer. |
