# Test Checklist

Tick each item when verified. “Sample” refers to files in `sample-data/`.

## A. Automated (run first)
- [ ] Open `tests/self-test.html` → **50 passed, 0 failed** (date formats, serial dates, amounts, lakh/crore, identifiers, duplicate headers, header detection below merged title rows, mapping, status engine, demonstration-data results).

## B. Offline operation
- [ ] Disconnect all networks (Wi-Fi off / cable out) **before** opening `index.html`.
- [ ] App loads with styles, icons and charts; no broken images.
- [ ] Browser DevTools → Network: only local `file://` (or `127.0.0.1`) requests; no external hosts.
- [ ] Privacy indicator “Offline Mode: Data remains on this device.” is visible.

## C. Start-up & demonstration data
- [ ] Without any working copy, the app opens with **DEMONSTRATION DATA** banner and VIEW MODE badge.
- [ ] Dashboard KPI cards and 15 charts render; clicking a KPI opens the Register filtered.

## D. Excel import (`Tender Tracker v1.0.xlsx`)
- [ ] Worksheet dialog lists all 9 worksheets (Sheet3, for PPT, Capex, REVEX 2026, P&CS discussion, WF&P, Capex Modified, spare revex, Sheet1).
- [ ] Capex header row detected as **4** (merged title rows above).
- [ ] Multiple sheets can be selected; compatibility note appears.
- [ ] Import report shows duplicate headers `PR_No_1, PR_No_2`, 1 potential serial date, 1 invalid date, date and numeric columns.
- [ ] Both **PR No** columns are present in the Register in the original order.
- [ ] PR / CRFQ numbers stored as numbers in Excel (e.g. `18011234`, `1000412345`) display as text, no scientific notation.
- [ ] Excel-formatted dates display as in Excel (e.g. `04-09-2026`); text dates kept as typed (`02 Nov 2026`, `08-10-2026`).
- [ ] Blank cells stay blank; long remarks (Capex #2) keep line breaks in the side panel.
- [ ] Header shows file name, worksheet(s), record count and import time; demo banner disappears.
- [ ] Selecting **Capex Modified** shows the four extra columns (Days Since Float, Days to Opening, Status Flag, Quick Status).

## E. CSV import (`tender-sample.csv`)
- [ ] Preview shows delimiter “Comma”, encoding “UTF-8 with BOM”.
- [ ] Changing the delimiter / header row updates the preview.
- [ ] Loads 29 records; identifiers stay text.
- [ ] Try a semicolon-separated and a tab-separated CSV → auto-detected.

## F. View Mode protection
- [ ] Double-click / Enter / typing in a cell does not edit; details drawer is read-only.
- [ ] Add Row / Duplicate / Delete / Save are hidden.
- [ ] Cells can still be selected and copied (Ctrl+C) into Excel.

## G. Edit Mode
- [ ] Edit shows the confirmation text; badge becomes “EDIT MODE – Unsaved local changes”.
- [ ] Inline editing: date picker, number input, dropdown, multi-line editor; Tab / Shift+Tab / Enter / arrows work.
- [ ] Editing STATUS changes the calculated stage, KPIs and charts immediately; row shows the Edited marker.
- [ ] Invalid date (e.g. `31/02/2026`) is kept as typed, flagged with a warning and in Data Quality.
- [ ] Undo / Redo (buttons and Ctrl+Z / Ctrl+Y) work; undoing all changes clears the Edited marker.
- [ ] Add Row (chooses worksheet when several are active), Duplicate, Delete (with confirmation, undoable).
- [ ] Manual stage override in the details panel; reason shows “Manual override … (calculated: …)”.
- [ ] Audit Log records each change with previous / new value, timestamp and session ID.
- [ ] Save → Save Locally → badge “Changes saved locally”; reload the page → working copy restored.
- [ ] Cancel Editing with unsaved changes → Discard restores the previous values; Continue keeps editing; Save & exit saves.
- [ ] Close the tab during editing (unsaved) → reopen → recovery prompt offered.

## H. Export & re-import
- [ ] Export full dataset → file named `Tender_Tracker_Updated_YYYY-MM-DD_HHMM.xlsx`.
- [ ] Exported workbook contains all original worksheets (including utility sheets), original headers (both PR No), column order, title rows, edits; optional Dashboard Summary, Data Quality Report, Audit Log, Export Info.
- [ ] With “Add calculated columns”, `[Calc] …` columns appear at the end only.
- [ ] Identifiers are text cells in Excel; dates are real Excel dates (dd-mm-yyyy); amounts numeric.
- [ ] Re-import the exported file → same records, edits present, duplicate headers preserved.
- [ ] Export filtered and selected rows; export current sheet to CSV; export audit log to CSV.
- [ ] The originally imported file on disk is unchanged (check modified time).

## I. Filtering & sorting
- [ ] Global search highlights matches in the Register.
- [ ] Multi-select filters, ranges, date ranges; AND vs OR; chips; clear individual / all.
- [ ] Save, load and delete a filter preset.
- [ ] Filters persist when switching Dashboard ↔ Register; page does not jump.
- [ ] Multi-column sort (Shift+click), per-column search, grouping with expand / collapse.

## J. Grid behaviour & performance
- [ ] Sticky header, frozen columns (0–4), column resize, reorder, show / hide; layout remembered after reload; Reset layout works.
- [ ] Wrap and density toggles; full-screen mode.
- [ ] Generate or use a workbook with 5,000+ rows: import completes with a progress indicator; scrolling stays smooth; search responds quickly.

## K. Data quality, alerts, timeline
- [ ] Data Quality lists missing fields, duplicates (PR / CRFQ), invalid / inconsistent dates, sequence errors, cost text, spelling variants (“Instr.” vs “INSTR”), blank / duplicate headers, status/date conflict.
- [ ] Open record from a finding.
- [ ] Alerts: bid opening overdue / within 7 days, technical evaluation pending, award pending, validity expiry bands, CAPEX finish, FAT / delivery / installation overdue, refloating, not floated. Changing thresholds in Settings updates alerts.
- [ ] Timeline: upcoming / overdue lists, calendar navigation, Gantt, lifecycle; click opens the tender.

## L. Settings, theme, printing
- [ ] Dark mode, title / logo change, date format, FY start, amount display (rupees / lakh / crore with exact tooltip).
- [ ] Column mapping change re-calculates; friendly labels appear in the grid but not in exports.
- [ ] Print dashboard, print table view, print tender details, management summary (print and download HTML); “Save as PDF” works.
- [ ] Clear local working data, clear audit history, reset application.

## M. Security
- [ ] Import a CSV containing `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` in cells → shown as plain text, no script runs.
- [ ] Rename a `.txt` to `.xlsx` → rejected with a clear error.
- [ ] CSV export of a cell starting with `=` is prefixed with `'` (when protection is on).

## N. Browsers / platforms
- [ ] Windows: Edge, Chrome, Firefox (current) — opened via double-click and via `start-server.bat`.
- [ ] macOS: Safari, Chrome, Firefox (current) — opened via double-click and via `start-server.command`.
