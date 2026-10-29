# User Guide — Tender Monitoring Dashboard

This guide walks through daily use. The application works completely offline. Your data never leaves your computer.

---

## 1. Screen layout

| Area | Purpose |
|------|---------|
| **Header** | Title and logo, loaded **file name**, **selected worksheet(s)** (click to change), **record count**, **last import date/time**, privacy indicator, **mode badge** (VIEW MODE / EDIT MODE) and the buttons *Import Data, Refresh, Edit, Save\*, Cancel Editing\*, Export, Settings, Theme* (\* Edit Mode only). |
| **Navigation** (left) | Dashboard · Tender Register · Timeline · Analytics · Alerts · Data Quality · Audit Log · Settings. The ☰ button collapses it. |
| **Filter bar** (sticky) | Global search, AND / OR logic, *Advanced Filters*, *Presets*, *Clear all*, active filter chips and the “Showing X of Y records” counter. Filters stay active when you switch pages. |

A yellow **DEMONSTRATION DATA** banner is shown until you import your own workbook.

---

## 2. Importing data

1. Click **Import Data** (or drag a file anywhere onto the window).
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

* **KPI cards** (Portfolio, Tender pipeline, Value, Watch list) reflect the current filters. **Click any card** to open the Tender Register filtered to those records. Amount cards show an exact rupee tooltip.
* **Needs attention now** lists high-severity alerts. **Next 14 days** lists upcoming milestones. Click an item to open the tender.
* **15 charts**: stage, department, CAPEX vs REVEX, channel, initiator, estimated cost and awarded value by department, monthly floating and award trends, PR-to-PO and technical evaluation durations, upcoming milestones, delayed by stage, vendor-wise awarded value, completed vs pending. Click a bar or segment to filter. The ▦ icon shows the chart as a table.
* **Management summary** opens a printable HTML report (print / save as PDF / download HTML). **Print / Save as PDF** prints the dashboard. In the print dialog, choose *Save as PDF* to create a PDF locally.

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

## 6. Editing safely

The application always opens in **VIEW MODE – Data is protected from editing**.

1. Click **Edit** and confirm: *“You are entering Edit Mode. Changes will remain local until exported or downloaded.”*
2. The badge changes to **EDIT MODE – Unsaved local changes**. Editable cells are tinted.
3. Edit in the grid (double-click, Enter or F2; type to replace text) or in the details panel:
   * dates: type `dd/mm/yyyy` or use the date picker,
   * costs / durations: number input,
   * Channel, Department, CAPEX/REVEX, Nature, Initiator: dropdown (or *Other…* for a new value),
   * STATUS / Remarks / descriptions: multi-line editor (Ctrl+Enter saves).
4. Each change is validated. Invalid dates are saved as typed but flagged. Stages, alerts, KPIs and charts recalculate immediately.
5. **Add Row**, **Duplicate**, **Delete**, **Undo** (Ctrl+Z), **Redo** (Ctrl+Y) are in the register toolbar.
6. **Manual stage override**: in the details panel, choose a stage and add a note. The calculated stage is still shown in the reason.

**Save** (Ctrl+S) offers:
* **Save Locally**: keeps a working copy in this browser (IndexedDB). It is restored automatically next time.
* **Export Updated Excel**: downloads `Tender_Tracker_Updated_YYYY-MM-DD_HHMM.xlsx`.
* **Export CSV**.

**Cancel Editing**: if there are unsaved changes, choose *Discard changes*, *Continue editing* or *Save locally and exit*.

If the browser closes during editing, the next start offers to **recover** the unsaved changes (when local persistence is enabled).

> The source workbook on your disk is never modified.

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

## 11. Troubleshooting

| Symptom | Remedy |
|---------|--------|
| A worksheet shows wrong columns | Adjust the header row in the worksheet dialog, or fix the mapping under Settings → Column mapping. |
| Amounts look 100,000× too large / small | Set the correct unit under Settings → Units for amount columns. |
| Dates look swapped | Check Data Quality for “mm/dd/yyyy detected” / “ambiguous” findings and correct the source. |
| Working copy not restored | Local persistence may be off, or a different browser / profile is being used. |
| Very large workbook is slow to open | Use the optional local server (`start-server`) so parsing runs in a background worker. |
| Want a PDF | Use *Print / Save as PDF* and choose “Save as PDF” as the printer. |
