# WeldPilot → Welding data → Export weld data

Source: `weld__welding__export-weld-data.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/export-welds/`.
State of the page for the observing account: normal.

Shared script context: the page's large inline script is the same bundle as on the dashboard (only 10 of 10577 lines differ on this page). The export functions described under "Rules found in the page's JavaScript" are in that bundle, as captured on `weld__start__dashboard.txt`. The capture elides some script lines with "already captured on earlier pages" markers; the rules below cover the visible lines.

## Page

- Browser title: `- WeldPilot®`.
- Top bar: language links "Nederlands", "English", "Deutsch", "Français" (each `index.php?lang=<xx>&page=export-welds&id=&project=&projectSite=`). App tiles in the top-bar dropdown: "MTOPilot®" (`/mtopilot/`), "ESTPilot®" (`/estpilot/`), "WeldPilot®" (`/weldpilot/`), "TeamPilot®" (`/teampilot/`), "ToolPilot®" (`/toolpilot/`).
- Breadcrumb: "Zandbak" (link `/weldpilot/`) › "Export welds" (link `/weldpilot/export-welds/`, active).
- Tabs: none.
- Buttons above the list: none (the page has no list or table).
- Page heading panel (text): "Choose which projects you want to export. Leave "All projects" if you want full Project Site export."
- Buttons on the page:
  - "Download XLS" (`button`, name `search`, type submit, icon `glyphicons glyphicons-download`) — submits form `#exportForm` (project export).
  - "Export all data" (`button`, name `search`, type submit, icon `glyphicons glyphicons-download`) — submits form `#exportFormFull` (full export).
- Other menu links on the page: none beyond the top bar and the side menu (menu item "Export weld data" links to `/weldpilot/export-welds/`, seen on the dashboard capture).

## List

There is no list or table on this page. The page has two forms, one "Also export these records" block, and a progress loader. Everything the page shows is listed here.

### Form `#exportForm` (action `#`, method post, marked `data-wsapps-export="1"` by the script)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | "Export welds from:" (label, `for="input00"`) | project | select (select2, `select2-single form-control`) | not shown | shown as current "All projects" | Options (2): `9999999` → "All projects"; `1` → "20240101". No option is marked as default in the capture. |

Buttons in this form: "Download XLS" (type submit, name `search`).

### Form `#exportFormFull` (action `#`, method post, marked `data-wsapps-export="1"`)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 2 | (no label) | full | hidden | — | `ok` | Always submitted with the form. |

Buttons in this form: "Export all data" (type submit, name `search`).

### Block "Also export these records" (`#exportIncludeCodes`)

Heading (label): "Also export these records".
Help text (exact): "These codes are left out of the Excel file. Tick a code to include every record with that code."

Table (`.table.table-condensed`), columns: [checkbox "All"] | Code | Example | Meaning. Each code row has a checkbox labelled "Include".

| # | Checkbox | name | value | Default | Code | Example | Meaning (exact text) |
|---|---|---|---|---|---|---|---|
| 3 | "All" (header) | — (id `exportIncludeAll`, type checkbox) | — | shown as `cur="on"`; see note below | — | — | — |
| 4 | Include | includeCodes | GAP | unchecked | GAP | 12GAP | Gap. An opening in the line, not a welded joint. |
| 5 | Include | includeCodes | SP | unchecked | SP | 1SP2 | Spool. A pipe spool stored on the weld list. |
| 6 | Include | includeCodes | E | unchecked | E | E12, 09E | End / appendage. The triangle marked E, stored as a weld number (E1, E2, …). |
| 7 | Include | includeCodes | B | unchecked | B | B12, 07B | Blind. A blind plate or blind flange (B1, B01). |

Note on field 3: the capture records `cur="on"` for `#exportIncludeAll` and no `CHECKED` flag for it. The four code boxes carry no `CHECKED` flag and no `cur`. The capture does not say whether the "All" box is shown checked. The script only syncs the boxes when one of them changes.

### Progress loader and note (hidden at load)

- Alert, visible text (as captured): "⏳ Please be patient Creating the weld export can take a while." (`.alert.alert-info`, id `exportPatienceNote`). No punctuation between "patient" and "Creating" in the capture.
- Loader `#loader` (hidden at load, text "Export is starting… 0%"). Its inner elements (`progressBar`, `exportLoaderMessage`, `exportLoaderText`, `exportHourglass`) are not in the capture.

### Export output and information texts

- Export output is an Excel file (`.xlsx`); the default filename is `Export.xlsx` when the server gives none (see rules).
- The page has no "Showing … entries" text, no "No data available in table" text, no print or CSV buttons, no bulk actions and no row options (none is in the capture).

### Other fields on the page

None. The capture has no other input, select, textarea or checkbox.

## Dialogs

This page opens no dialog. No control on this page points to a dialog with `href="#id"`, `data-target` or a handler that opens one. The page is not a list page, so the dialog-based row options and bulk actions are absent.

Also present in the page, opened from elsewhere (the capture lists them in the DOM; none is opened by this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal. Handheld floating menu items (not dialogs on this page): "Scan weld" (`data-action="weld-scan"`), "Scan flange QR label" (`data-action="flange-scan"`), "Add punch" (`data-action="punchlist"`).

## Rules found in the page's JavaScript

Source: the shared bundle (see the top of this note). Function names are as in the script.

1. **Form submit (both forms)** — function `__bindExportForm(formId, extraParams)`, bound to `#exportForm` with `{}` and to `#exportFormFull` with `{ full: 'ok' }`. The handler builds the parameters:
   - `includeCodes`: the values of the checked `input[name="includeCodes"]` boxes, joined with commas. Added only when at least one box is checked.
   - `project` (only for `#exportForm`): the select value, or `9999999` when the value is empty.
   - `full=ok` (only for `#exportFormFull`).
   Then it calls `__runWeldsExport(params)`. On error it hides `#loader`, re-enables the buttons and shows the error text in a toast (or an alert if toastr is missing).
2. **Start request** — `__runWeldsExport`: shows `#loader` with "Export is starting…" and then sends the parameters as a form-encoded body (headers: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`) to `ajax/export-welds-start.php` under the core URL. The response needs `ok`, `jobId` and `token`; `filename` defaults to `Export.xlsx`. The HTTP method is not visible in the capture (the request has a body). The job is saved in `sessionStorage` under key `wsappsWeldsExportJobs`. A toast says the export runs in the background.
3. **Core URL** — `__exportCore()`: uses `window._wsappsCoreUrl`, otherwise `(window._wsappsBaseUrl || '/') + 'core/'`.
4. **Polling** — `__exportPump()`: takes the first saved job and calls `ajax/export-welds-process.php?job=<jobId>&token=<token>` (GET, with `X-Requested-With`). Polling is rescheduled every 250 ms while jobs are saved. The response fields used: `ok`, `error`, `status` (`processing`, `done`, `error`), `phase` (`converting` shows the Excel line), `processed`, `total`, `percent`, `finished`, `message`, `readyDownload`.
   - `status` `done` with `processed` ≤ 0 or `readyDownload` false: toast "No welds found for this export.", the loader hides after 2 seconds, and the job is removed.
   - `status` `done` otherwise: the job is removed, a toast with a download link is shown, and the file is downloaded (see 5).
   - `status` `error`: the job is treated as failed; the error text is shown in a toast.
5. **Download** — `__exportDownload(jobId, token, filename)`: GET `ajax/export-welds-download.php?job=<jobId>&token=<token>`. Response must be ok, else error "Download failed (<status>)". The blob is saved under `filename` (default `Export.xlsx`). The same download runs when the toast is clicked.
6. **Busy state** — `__exportSetBusy`: while running, both submit buttons (`#exportForm button, #exportFormFull button`) are disabled. The hourglass element (`#exportHourglass`) and note (`#exportPatienceNote`) get classes `is-running`, `is-active`, `is-done`.
7. **Progress display** — `__exportUpdateUi`: percent = processed ÷ total × 100 (floored, clamped 0–100). With no total and status `processing`, the bar shows at least 2 %. With no known progress the bar is indeterminate. Message: the server message, or "Export in progress…"; during `converting` the text is "The Excel file is being created… ({n} welds)". The line ends with "You can keep working in the meantime." (`#exportLoaderText` or `#exportLoaderMessage`).
8. **Resume** — on page load, if a job is still saved in `sessionStorage`, the loader shows "Export is starting…" and polling restarts.
9. **Include-codes checkbox sync** — the "All" box (`#exportIncludeAll`) on change sets all four code boxes to its state. When a code box changes, "All" is checked only if all code boxes are checked.
10. **Other requests on load** — `GET /core/ajax/ajax-notifications.php?action=count_unread` (from the XHR line of this capture). The shared bundle also contains requests for other screens (for example `getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`); they are not used on this page and are not described here.

Texts used by the export script (from `window.__wsappsWeldExportText`, English, exact): "Export is starting…", "Export in progress…", "The Excel file is being created… ({n} welds)", "No welds found for this export.", "Download started ({n} welds)", "{file} is ready. Click to download.", "Download failed", "Export failed", "Could not start the export", "Export processing failed", "The export is running. You can keep working; the file will download when it is ready.", "You can keep working in the meantime.".

## Sample data

None. The page has no table, no rows and no key figures. The only data on the page is the project select with two options: "All projects" (value `9999999`) and "20240101" (value `1`).

## Not in the capture

- The progress loader's inner markup (`progressBar`, `exportLoaderMessage`, `exportLoaderText`, `exportHourglass`) — the loader is captured only as the hidden line "Export is starting… 0%".
- The result of an export (Excel file contents and columns). Clicking "Download XLS" or "Export all data" starts a server job; the capture does not include any export run, and this note does not state what the file contains.
- Whether the "All" checkbox (`#exportIncludeAll`) is checked on load (see field 3 note).
- The HTTP method of the start, process and download requests (not visible in the capture).
- No dialog is loaded from this page by a click.
