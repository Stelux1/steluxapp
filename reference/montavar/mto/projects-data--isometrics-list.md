# MTO Pilot → Projects data → Isometrics list

Source: `mto__projects__isometrics-list.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=isometrics-list`. Page title: `Isometrics list - MTOPilot®`.
State of the page for the observing account: normal (the table and the KPI row are filled).

## Page
- Title in the panel heading: "Isometrics list". No breadcrumb and no tabs are in the capture.
- Top bar (shared with the other MTOPilot pages): a "Last refresh" label (`#lastRefreshLabel`, title "Last refresh") showing "16.11.2026. 12:47" (`data-refresh-ts` 1794829641). Pilot tiles, each a link: MTOPilot® (`/mtopilot/`), ESTPilot® (`/estpilot/`), WeldPilot® (`/weldpilot/`), TeamPilot® (`/teampilot/`), ToolPilot® (`/toolpilot/`). Language links: Nederlands (`lang=nl`), English (`lang=en`), Deutsch (`lang=de`), Français (`lang=fr`).
- KPI row above the panel (`#isoKpiRow`, `data-pilot="mtopilot"`), values as displayed: see Sample data.
- Buttons in the panel heading (right side, icon only, no text):
  - blue `+` (class `btn-sm btn-primary`, icon `glyphicon glyphicon-plus`) → `href="#addMaterial"` with `data-toggle="modal"`: opens dialog `#addMaterial`. That dialog is not in this capture (see "Not in the capture").
  - grey import icon (class `btn-sm btn-default`, icon `glyphicon glyphicon-import`) → link to `index.php?page=material-database-import`.
- Export and print buttons above the table (DataTables Buttons, class `btn-xs btn-dark buttonPrint`, all with `href="#"` and no `onclick`):
  - "CSV" → `buttons-csv`
  - "Excel" → `buttons-excel`
  - print icon (`fa fa-print`) → `buttons-print`
  The capture does not show the handler code for these three buttons beyond the library scripts they load.
- Floating button at the bottom right of the page (class `wsapps-handheld-fab-btn`, title and aria-label "Scan QR", icon `fa fa-qrcode`), with two menu items: "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`). The capture does not show what these actions open; the page contains the dialogs `#materialQrScanModal` and `#srArchiveScanModal` (listed under "Also present").

## List
- Table id `#datatableIsoList`, server-side (`serverSide: true`), page length 20 by default, in a `role="grid"` DataTables wrapper.
- Columns in order (header row):

| # | Title | Data key | Sortable | Hidden | Header class |
|---|---|---|---|---|---|
| 1 | Project | 0 | yes | no | — |
| 2 | ISO No | 1 | yes | no | — |
| 3 | IRN | 2 | yes | no | — |
| 4 | ITP No | 3 | yes | no | — |
| 5 | ITP No 2 | 4 | yes | no | — |
| 6 | P.Class | 5 | yes | no | — |
| 7 | NoBo | 6 | no | no | text-center |
| 8 | PWHT | 7 | no | no | text-center |
| 9 | M | 8 | no | no | text-center |
| 10 | E | 9 | no | no | text-center |
| 11 | W | 10 | no | no | text-center |
| 12 | Pfb | 11 | no | no | text-center |
| 13 | Fld | 12 | no | no | text-center |
| 14 | Doc. | 13 | no | no | text-center |
| 15 | Prio. | 14 | yes | no | text-center |
| 16 | Opts | 15 | yes (config) | no | — |

- No column is hidden.
- Default sort: `order: [[15, "asc"]]`, i.e. column 16 "Opts", ascending.
- Page length options: 10, 20, 50, 100, 500 (select `datatableIsoList_length`, label "Show … entries", current 20).
- Global search: input type "search", placeholder "Search", with a clear button (aria-label "Clear"), top right of the table.
- Per-column search row (class `iso-filter-row`, inputs class `iso-col-filter`, type text):
  - columns 1 to 6 (Project, ISO No, IRN, ITP No, ITP No 2, P.Class): placeholder "Filter..."
  - column 15 (Prio.): placeholder "#"
  - columns 7 to 14 and 16: no input; the cell shows "-".
- Filters: the dialog `#filterIsoList` ("Filter isometrics", described below). No button on this page in the capture opens it.
- Row options (column 16 "Opts"): one link "Open" per row, `href="index.php?page=isometrics&id=<iso id>&project=1"`, `target="_blank"`. The iso id is in each row's link (see Sample data).
- Bulk actions: none in the capture. There is no checkbox column and no "Options" menu on this page.
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)" (DataTables `info`; the table config carries "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Processing text: "Loading..." (hidden in the capture).
- Server-side table request: `/core/ajax/ajax-table-isometrics.php` (the DataTables config has `ajax: {url: ""}`; the actual URL is the one in the XHR list). Parameters visible in the URL: `id=1`, `project=`, `ndt=`, `pwht=`, `prio=`, `mto=`, `est=`, `weld=` (all empty in the capture), `draw` (9, 17, 18 in the three calls), and the standard DataTables `columns[i][data|name|searchable|orderable|search][value|regex]` parameters. The capture cuts the URL off after the first columns (the XHR list shows "…[3567]" and "…[3568]" characters).
- Requests made on page load (from the XHR list, in order): `/core/ajax/ajax-notifications.php?action=count_unread`; `/core/ajax/ajax-table-isometrics.php?…&draw=9`; `/core/ajax/ajax-table-isometrics.php?…&draw=17`; `/core/ajax/ajax-refresh-isometrics.php?project=&pilot=mtopilot`; `/core/ajax/ajax-table-isometrics.php?…&draw=18`. The table is requested three times, the refresh request sits between the second and third. The capture does not show the response of the refresh request.

## Dialogs

### Filter isometrics (`#filterIsoList`) — opened by: none seen in the capture
The capture has no control on this page that points to `#filterIsoList` (no `href` or `data-target` to it in the captured DOM). The dialog is in the page markup, and its field names are the same as the table request's parameters (`project`, `ndt`, `pwht`, `mto`, `est`, `weld`). The control that opens it is not captured.

Form: `method="get"`. No tabs. Each select has class `select2-single form-control` and `data-control="select2"`. None of the fields is marked REQUIRED. Field "depends on": the capture shows no condition for any field.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | page | hidden | — | `isometrics-list` | hidden value |
| 2 | Project | project | select (select2) | no | All | 2 options: (empty) → All (selected); 1 → 20240101 |
| 3 | NDT | ndt | select (select2) | no | All | 3 options: (empty) → All (selected); 0 → No; 1 → Yes |
| 4 | PWHT | pwht | select (select2) | no | All | 3 options: (empty) → All (selected); 0 → No; 1 → Yes |
| 5 | MTOPilot ready | mto | select (select2) | no | All | 3 options: (empty) → All (selected); 0 → No; 1 → Yes |
| 6 | ESTPilot ready | est | select (select2) | no | All | 3 options: (empty) → All (selected); 0 → No; 1 → Yes |
| 7 | WeldPilot ready | weld | select (select2) | no | All | 3 options: (empty) → All (selected); 0 → No; 1 → Yes |

- Dialog title "Filter isometrics". Header close button (× icon, `data-dismiss="modal"`).
- Footer buttons: "Filter" (`btn-primary`, type submit, `name="filterIsoExecution"`); "Cancel" (`btn default`, `data-dismiss="modal"`).
- No text in the dialog states a rule.

## Rules found in the page's JavaScript
- The page's own table setup and filter handlers are not in this capture. The large shared inline script (`len=360323`) is written here only as "new lines" (LINEDIFF); the rest is in earlier captures. The new lines contain these requests, none of them specific to this page:
  - `$.getJSON("/core/ajax/getListOfMaterials.php", {id: mark, timer, ajax: 'true'})`
  - `url: "/core/ajax/searchProject.php?time=…"`
  - `$.getJSON("/core/ajax/saveAddCalculationModalState.php", {k, v, timer, ajax: 'true'})`
  - `$.getJSON("/core/ajax/searchUnitRates.php", {id: code, timer, ajax: 'true'})`
  - `$.getJSON("/core/ajax/searchTarrifs.php", {id: code, timer, ajax: 'true'})` (twice)
  - `$.getJSON("/core/ajax/searchFactors.php", {id: code, timer, ajax: 'true'})` (twice)
- Validations, fields shown or hidden on a condition, and browser-side computed values for this page: none found in the capture.
- Requests made by this page on load: see the List section.

## Sample data
Counts and figures as displayed:
- KPI row (`#isoKpiRow`), as displayed in reading order. The flattened text lists each percentage before its label; the pairing below is the one that matches the fractions:
  - Total Isometrics: 7
  - MTO Started: 1 / 7 (14.3%)
  - Materials Linked: 4 / 7 (57.1%)
  - Documentation: 1 / 7 (14.3%)
  - Prefab Complete: 1 / 7 (14.3%)
  - Field Complete: 2 / 7 (28.6%)
- Table info: "Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)". The DataTables config has `total: 16058` and `shown: 7`.
- Rows shown: 7 (all rows of the capture). Icons are written as their Font Awesome class: fa-check, fa-times, fa-minus. A "-" is text in the cell.
- Row 2 to row 7 carry the class `iso-row-critical`; row 1 does not. The capture does not show what the class does.

| Project | ISO No | IRN | ITP No | ITP No 2 | P.Class | NoBo | PWHT | M | E | W | Pfb | Fld | Doc. | Prio. | Opts (link target) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20240101 | 0001 | 1000 | 111111 | 222222 | A11011 | fa-times | fa-check | fa-times | fa-check | fa-check | fa-minus | fa-check | fa-check | P1 | Open → `page=isometrics&id=1&project=1` |
| 20240101 | WF-73031-ST_STB000-01 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-times | fa-minus | fa-check | - | Open → `id=15424&project=1` |
| 20240101 | 0007 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-minus | fa-minus | fa-times | - | Open → `id=15767&project=1` |
| 20240101 | 00022 | - | - | - | - | fa-times | fa-times | fa-check | fa-times | fa-check | - | fa-minus | fa-times | - | Open → `id=6&project=1` |
| 20240101 | 00032 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-minus | fa-minus | fa-times | - | Open → `id=6191&project=1` |
| 20240101 | 0005 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-times | fa-minus | fa-times | - | Open → `id=6598&project=1` |
| 20240101 | 0003 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-check | fa-check | fa-times | - | Open → `id=895&project=1` |

All links open in a new tab (`target="_blank"`). Project column value "20240101" is the sandbox project (project id 1).

## Not in the capture
- The dialog `#addMaterial` that the blue `+` button opens (`href="#addMaterial"`, `data-toggle="modal"`). It is not in this page's markup in the capture. The browser-pass notes (`_interactive/I3-mto.md`) name a dialog with the same id on the Material database page, not on this page.
- The opener of the dialog `#filterIsoList` (see Dialogs).
- Rows beyond the 7 shown. The table reports 16,058 entries before filtering, and the capture shows only the 7 rows of the first page.
- The response of `/core/ajax/ajax-refresh-isometrics.php` (the capture shows only the request). The capture does not show what it changes.
- The response of the three `ajax-table-isometrics.php` requests beyond the first columns of their URLs (the URLs are cut off in the capture).
- The output of the CSV, Excel and print buttons. Not triggered.
- The actions behind the "Scan material" and "Scan service request" menu items. Not triggered.

Also present in the page, not opened by any control of this page in the capture: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.
