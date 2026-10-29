# Tender Monitoring Dashboard (offline)

A management-grade, **fully offline** dashboard for monitoring CAPEX / REVEX procurement, tendering, evaluation, award and post-award activities (BPCL Pipelines-style tender trackers).

It runs entirely inside your web browser. The imported Excel / CSV file is the local source of truth. There is no server, cloud database, login, API, CDN, analytics or telemetry. A Content Security Policy blocks all network connections (`connect-src 'none'`).

> **Offline Mode: Data remains on this device.** “Live dashboard” means the dashboard updates the moment local data is imported or edited. It does not mean internet-based live data.

---

## 1. Quick start

### Option A — just open it (Windows and macOS)
1. Unzip the `tender-monitoring-dashboard` folder anywhere (e.g. Documents).
2. Double-click **`index.html`**. It opens in your default browser (Chrome, Edge, Firefox or Safari — current versions).
3. The app starts in **VIEW MODE** with built-in **DEMONSTRATION DATA**.
4. Click **Import Data**, then choose (or drag in) `sample-data/Tender Tracker v1.0.xlsx` or your own `.xlsx`, `.xls` or `.csv`.

### Option B — small local server (optional, recommended for very large files)
A local server lets the browser parse large workbooks in a background Web Worker (browsers block workers for pages opened from `file://`). It is still 100 % local: the server listens on `127.0.0.1` only.

| OS | How |
|----|-----|
| Windows | Double-click `start-server.bat` (needs Python 3 — `py` or `python`), then open <http://127.0.0.1:8080/> |
| macOS | Double-click `start-server.command` (first time: right-click → Open), then open <http://127.0.0.1:8080/> |
| Any | In this folder run `python3 -m http.server 8080 --bind 127.0.0.1` |

If Python is not available, use Option A — every feature works; large files are parsed on the main thread with a progress indicator.

---

## 2. What it does

| Area | Highlights |
|------|-----------|
| **Import** | `.xlsx`, `.xls`, `.csv`; drag & drop; worksheet chooser (detected header row, records, columns, recognised sheet type, preview); CSV preview with delimiter (comma / semicolon / tab / pipe), encoding (UTF-8, fallback Windows-1252) and header-row selection; detailed **import report** (date / numeric columns, blank & duplicate headers, insufficient rows, invalid dates, potential Excel serial dates, warnings). |
| **Source fidelity** | All columns, labels and order preserved; blank cells retained; duplicate headers (e.g. the two **PR No** columns) kept as `PR_No_1` / `PR_No_2` internally while the original header text is shown and exported; identifiers (PR, CRFQ / GeM, PO / OLA, WBS) kept as text, never scientific notation; title rows above the header preserved for export. |
| **Mapping layer** | Each worksheet keeps its own structure (Capex, Capex Modified, REVEX 2026, Sheet3 / Contract Monitoring, others). A configurable mapping links columns to standard analytical fields; unmapped columns stay visible. Compatible sheets can be consolidated. |
| **Status engine** | 27 lifecycle stages; structured dates first, STATUS / Quick Status / Remarks as supporting evidence; shows the **reason**; flags **Data Conflict** instead of silently choosing; manual override in Edit Mode. |
| **Dashboard** | 30 clickable KPI cards (each applies its filter to the Tender Register), attention lists and 15 interactive charts (click to filter, table view for accessibility). |
| **Tender Register** | Virtualised grid for thousands of rows: sticky header, frozen columns (0–4), resize, drag-to-reorder, show/hide, multi-sort, per-column search, wrap, density, grouping, selection, cell-range copy, keyboard navigation, print view, full screen; layouts remembered locally. |
| **Edit Mode** | Explicit, confirmed. Inline and drawer editing with date pickers, number inputs, dropdowns and multi-line editors; validation; undo / redo; add / duplicate / delete rows; “Edited” markers; local audit log; Save Locally (IndexedDB), Export Updated Excel, Export CSV; Cancel with Discard / Continue / Save & exit; automatic recovery of unsaved sessions. |
| **Timeline** | Upcoming & overdue milestones, monthly calendar, Gantt view, lifecycle pipeline. |
| **Alerts** | Calculated from the system date with configurable thresholds (shown only inside the app — no e-mail / SMS). |
| **Data Quality** | 30+ checks with severity, worksheet, row, identifier, field, problem and suggested correction (suggestions never change data). |
| **Export** | Full / filtered / selected rows to Excel (original sheets, headers and order preserved, edits included, optional calculated columns, Dashboard Summary, Data Quality Report, Audit Log); CSV; audit CSV; print dashboard / details; printable & downloadable management summary; PDF via the browser’s **Print → Save as PDF**. |

---

## 3. Project structure

```
tender-monitoring-dashboard/
├── index.html                 Application shell (+ local CSP)
├── css/   styles.css · dashboard.css · table.css · print.css
├── js/
│   ├── app.js                 Bootstrapping, routing, header, import dialog, recovery
│   ├── utils.js               Namespace, escaping, formatting, modal/toast/popover/tooltip
│   ├── icons.js               Inline SVG icon set (local)
│   ├── storage.js             IndexedDB + localStorage, settings
│   ├── xlsx-reader.js         Workbook → arrays (shared by main thread and worker)
│   ├── parse-worker.js        Optional Web Worker parser (http://localhost only)
│   ├── data-loader.js         Import flows, sheet chooser, CSV preview, import report, columns
│   ├── data-normaliser.js     Header detection, safe keys, mapping, date/amount parsing
│   ├── calculations.js        Status engine, calculated fields, alerts, data-quality rules
│   ├── filters.js             Global search, advanced filters, chips, presets
│   ├── tender-table.js        Virtualised Tender Register grid
│   ├── details.js             Tender Details drawer
│   ├── edit-mode.js           Edit Mode, undo/redo, save/cancel, recovery
│   ├── charts.js              Chart definitions (Chart.js)
│   ├── dashboard.js           KPI cards + dashboard
│   ├── timeline.js · analytics.js · alerts.js · data-quality.js
│   ├── export.js              Excel/CSV export, printing, management summary
│   ├── settings.js            Settings page + Audit Log page
│   ├── audit-log.js           Local audit log
│   └── sample-data.js         Built-in DEMONSTRATION DATA
├── lib/                       Third-party libraries (local copies) + licences
├── assets/                    Logo placeholder, icons
├── sample-data/
│   ├── Tender Tracker v1.0.xlsx   Demonstration workbook (9 worksheets)
│   ├── tender-sample.csv          Demonstration CSV (Capex layout)
│   └── data-dictionary.json       Columns, standard fields, calculated fields, stages
├── tests/self-test.html       Offline automated self-test (open in a browser)
├── tools/                     Node scripts to regenerate the samples / dictionary (optional)
├── README.md · USER-GUIDE.md · TEST-CHECKLIST.md
└── start-server.bat / start-server.command / start-server.sh (optional)
```

No build step is required. The JavaScript is plain browser script (no modules) so that it runs from `file://`.

---

## 4. Third-party libraries (bundled locally in `lib/`)

| Library | Version | Licence | Used for |
|---------|---------|---------|----------|
| SheetJS Community Edition (`xlsx.full.min.js`) | 0.20.3 | Apache-2.0 | Reading `.xlsx` / `.xls`, writing `.xlsx` |
| Papa Parse (`papaparse.min.js`) | 5.4.1 | MIT | CSV parsing and delimiter detection |
| Chart.js (`chart.umd.min.js`) | 4.4.4 | MIT | Charts |

Licence texts are in `lib/licenses/`. SheetJS 0.20.3 was taken from the npm package `@e965/xlsx@0.20.3`, a republication of the official SheetJS 0.20.3 build. The official npm `xlsx` package (0.18.5) has known security advisories, which is why it is not used. If your organisation requires it, replace `lib/xlsx.full.min.js` with the file from the official SheetJS distribution (`https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`), downloaded once on a connected machine. No other change is needed.

Fonts: the system UI font is used (Segoe UI on Windows, SF Pro on macOS). No web fonts are loaded.

---

## 5. Data handling, privacy and security

* Files are read with the browser File API and processed in memory. Nothing is uploaded.
* No external requests: the Content Security Policy (`connect-src 'none'`, local scripts only) blocks network access, and there are no CDN references.
* All spreadsheet content is treated as untrusted. It is HTML-escaped before rendering, and `eval` and dynamic code are not used.
* File extension, size and content signature are validated (ZIP for `.xlsx`, OLE / XML for `.xls`, text for `.csv`).
* CSV exports can prefix cells starting with `= + - @` to prevent formula injection (on by default).
* Local persistence (optional, Settings): the working copy, recovery data and audit log are kept in this browser’s IndexedDB; settings, layouts and presets in localStorage. Use **Settings → Clear local working data / Clear audit history / Reset application**.
* The audit log is a local convenience log. It is **not** tamper-proof and not equivalent to an enterprise audit system.

---

## 6. Important behaviour and limitations

* **The original file is never modified.** Saving keeps a working copy in the browser; exporting downloads a *new* file (`Tender_Tracker_Updated_YYYY-MM-DD_HHMM.xlsx`).
* **Values, not formatting:** exports preserve sheets, headers, column order, title rows, merged title cells and values. Cell colours, fonts, conditional formatting, data validation, comments and **formulas** of the original workbook are not reproduced (formulas are exported as their last calculated values). Keep the original workbook as the formatted master and use the export for data exchange.
* **Dates:** `dd/mm/yyyy` is the default reading when both day and month are ≤ 12. `mm/dd/yyyy` is accepted only when it is positively identified (day > 12). Mixed formats in a column are flagged for review. The original text is always kept; normalised dates are stored separately.
* **Amount units:** a unit in the header (e.g. “(In Lacs)”) is used. Otherwise the per-field defaults in Settings apply (Project Cost / BE: lakh; cash outflow: rupees — adjust if your sheet differs).
* **Status engine:** keyword rules are heuristics. Always read the *Stage Reason*; use manual overrides where needed.
* IndexedDB data are per browser and per profile. Opening the app in another browser starts fresh.
* Web Workers are not available on `file://`. Large files are then parsed on the main thread with a progress indicator. Use the local server for workbooks with tens of thousands of rows.

---

## 7. Testing

* Open **`tests/self-test.html`** in a browser: it runs 50 offline checks of date parsing, amounts, identifiers, duplicate headers, header detection, mapping, the status engine and demonstration-data results.
* Follow **`TEST-CHECKLIST.md`** for the manual acceptance checklist (import, edit, export / re-import, offline verification, etc.).

## 8. Regenerating samples (optional, developers)
With Node.js installed: `node tools/build-samples.js` (rebuilds the sample workbook and CSV from `js/sample-data.js`) and `node tools/build-data-dictionary.js`. Neither script needs network access.

---
**All sample records are fictitious DEMONSTRATION DATA.**
