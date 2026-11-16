# WeldPilot → Welding data → Isometrics list

Source: `weld__welding__isometrics-list.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=isometrics-list`.
State of the page for the observing account: normal (the page shows its list; no rights message). The capture contains no click-opened captures for this page (`weld__welding__isometrics-list__*` does not exist) and no browser-pass note in `_interactive/` covers this page.

## Page
- Title: `Isometrics list - WeldPilot®`.
- Breadcrumb (top bar, two links): `Zandbak` → `index.php?page=isometrics-list`; `Isometrics list` → `index.php?page=isometrics-list`. The top bar also shows the date label `16.11.2026. 12:22`.
- Tabs: none in the capture.
- Top bar and panel buttons:
  - Last refresh label (`#lastRefreshLabel`, title "Last refresh"): shows `16.11.2026. 12:22` (data-refresh-ts 1794828164). Not a button.
  - Refresh (`#btnRefreshIso`, title "Refresh data", icon fa-refresh, no text): handler not in this capture.
  - Filter (`href="#filterIsoList"`, `data-toggle="modal"`, icon fa-sliders, text "Filter"): opens dialog `#filterIsoList` (described below).
  - Panel header, plus button (`href="#addMaterial"`, `data-toggle="modal"`, icon glyphicon-plus, no text): opens `#addMaterial`. That dialog is not in the capture (see "Not in the capture").
  - Panel header, import button (`href="index.php?page=material-database-import"`, icon glyphicon-import, no text, not a dialog): navigates to the material database import page.
- KPI row (`#isoKpiRow`, data-pilot="weldpilot"), as shown in the capture: `7 Total Isometrics`; `0% NDT Approved 0 / 7`; `14.3% PWHT Approved 1 / 7`; `14.3% Prefab Complete 1 / 7`; `28.6% Field Complete 2 / 7`; `14.3% Documentation 1 / 7`. The flattened text puts each percentage before its label; the pairing was inferred from the fractions (0/7 = 0%, 1/7 = 14.3%, 2/7 = 28.6%), not from markup.
- Panel title: `Isometrics list`.

## List
- Table id `#datatableIsoList`, panel wrapper `#datatableIsoList_wrapper`, role grid.
- Export buttons (above the table, left): `CSV` (buttons-csv), `Excel` (buttons-excel), print (icon fa-print, no text). All three are `href="#"`, class `buttonPrint` plus dt-button classes.
- Page length select (`name="datatableIsoList_length"`): `Show` [10 / 20 / 50 / 100 / 500] `entries`; default 20.
- Global search (`#datatableIsoList_filter`): label with icon fa-search, input type search, placeholder `Search`, clear button (icon fa-times, aria-label "Clear").
- Columns, in order (DT `cols`, index → title, classes, sortable):
  0 `Project` (sortable); 1 `ISO No` (sortable); 2 `IRN` (sortable); 3 `ITP No` (sortable); 4 `ITP No 2` (sortable); 5 `P.Class` (sortable); 6 `NoBo` (text-center, not sortable); 7 `PWHT` (text-center, not sortable); 8 `M` (text-center, not sortable); 9 `E` (text-center, not sortable); 10 `W` (text-center, not sortable); 11 `Pfb` (text-center, not sortable); 12 `Fld` (text-center, not sortable); 13 `Doc.` (text-center, not sortable); 14 `Prio.` (text-center, sortable); 15 `Opts` (sortable).
- Hidden columns: none (all `vis: true`).
- Default sort (DT `order`): column index 15 (`Opts`), ascending.
- Per-column search: a second header row (class `iso-filter-row`) with text inputs (class `iso-col-filter`, placeholder `Filter...`) under columns 0 to 5 (data-col 0 to 5) and a text input with placeholder `#` under `Prio.` (data-col 14). Columns 6 to 13 and 15 show `-` in that row (no input).
- Filters: none beyond the per-column inputs and the dialog below.
- Row options: one per row, the link `Open` (`href="index.php?page=isometrics&id=<id>&project=1"`, `target="_blank"`), placed in column `Opts`. No other row action appears in the capture.
- Bulk actions (Options menu): none on this page in the capture.
- Empty and info texts (DT `lang`):
  - empty: `No data available in table`
  - info: `Showing _START_ to _END_ of _TOTAL_ entries`; as rendered: `Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)`
  - zero: `No matching records found`
  - search: empty string
- Processing indicator: `Loading...` (two hidden elements, `.dataTables_processing`).
- Server-side table: `serverSide: true`. The DT `ajax` config shows an empty url (`"url": ""`), but the page's requests show `/core/ajax/ajax-table-isometrics.php` with query parameters `id=1`, `project`, `ndt`, `pwht`, `prio`, `mto`, `est`, `weld`, `draw`, and `columns[n][…]` / search values. The request is truncated in the capture after about 3,500 characters, so the remaining parameters and the response are not shown.
- DT totals in the configuration: `total: 16058`, `shown: 7`.

## Dialogs

### Filter isometrics (`#filterIsoList`) — opened by the `Filter` button (`href="#filterIsoList"`) in the top bar
Form: `method="get"`. Header title `Filter isometrics`. The selects use select2 (`select2-single`, `data-control="select2"`); the select element is the real field.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | page | hidden | — | `isometrics-list` | hidden value |
| 2 | Project | project | select | no | All | 2 options: `` → All (default); `1` → 20240101 |
| 3 | NDT | ndt | select | no | All | 3 options: `` → All (default); `0` → No; `1` → Yes |
| 4 | PWHT | pwht | select | no | All | 3 options: `` → All (default); `0` → No; `1` → Yes |
| 5 | MTOPilot ready | mto | select | no | All | 3 options: `` → All (default); `0` → No; `1` → Yes |
| 6 | ESTPilot ready | est | select | no | All | 3 options: `` → All (default); `0` → No; `1` → Yes |
| 7 | WeldPilot ready | weld | select | no | All | 3 options: `` → All (default); `0` → No; `1` → Yes |

The capture shows no condition for when a field appears or is limited; all fields are always visible and default to All. The field names match the request parameters of the table (`project`, `ndt`, `pwht`, `mto`, `est`, `weld`).

Buttons: `Filter` (btn-primary, name `filterIsoExecution`, type submit); `Cancel` (btn default, data-dismiss modal). No text in the dialog states a rule.

## Rules found in the page's JavaScript
- The page's own script name is set as `var __wsappsDebugPage = "isometrics-list";` (the inline script of this capture, new lines only).
- The page's table, filter and refresh logic is not in this capture. The large inline script of this capture is written only as lines not already in earlier captures (the sweep's first capture holds the rest), so no validation, condition or computed value specific to this page appears here.
- Requests made by the page in the capture (XHR list at load):
  - `/core/ajax/ajax-notifications.php?action=count_unread`
  - `/core/ajax/ajax-table-isometrics.php` (table data, three requests with `draw` 9, 17 and 18; parameters listed above)
  - `/core/ajax/ajax-refresh-isometrics.php?project=&pilot=weldpilot` (one request at load)
- Lines of the shared inline script that the capture writes (not specific to this page, but present in its scripts): `$.getJSON("/core/ajax/getListOfMaterials.php", {id, timer, ajax})`; `url: "/core/ajax/searchProject.php?time=…"`; `$.getJSON("/core/ajax/saveAddCalculationModalState.php", {k, v, timer, ajax})`; `$.getJSON("/core/ajax/searchUnitRates.php", {id, timer, ajax})`; `$.getJSON("/core/ajax/searchTarrifs.php", {id, timer, ajax})` (two places); `$.getJSON("/core/ajax/searchFactors.php", {id, timer, ajax})` (two places).
- Handler for the Refresh button (`#btnRefreshIso`) and for the per-column filters (`.iso-col-filter`): not in this capture.

## Sample data
Sandbox state as displayed:
- Counts: 7 total isometrics (KPI); the table shows 7 of 16,058 total entries ("filtered from 16,058 total entries"); page length 20, so all 7 rows are on one page.
- KPI values: 0% NDT Approved (0 / 7); 14.3% PWHT Approved (1 / 7); 14.3% Prefab Complete (1 / 7); 28.6% Field Complete (2 / 7); 14.3% Documentation (1 / 7).
- All 7 rows show Project `20240101`.

Rows (all 16 columns; icons are shown as their icon class, `-` is the literal text in the cell):

| Project | ISO No | IRN | ITP No | ITP No 2 | P.Class | NoBo | PWHT | M | E | W | Pfb | Fld | Doc. | Prio. | Opts | row class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20240101 | 0001 | 1000 | 111111 | 222222 | A11011 | fa-times | fa-check | fa-times | fa-check | fa-check | fa-minus | fa-check | fa-check | P1 | Open (id 1) | — |
| 20240101 | WF-73031-ST_STB000-01 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-times | fa-minus | fa-check | - | Open (id 15424) | iso-row-critical |
| 20240101 | 0007 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-minus | fa-minus | fa-times | - | Open (id 15767) | iso-row-critical |
| 20240101 | 00022 | - | - | - | - | fa-times | fa-times | fa-check | fa-times | fa-check | - | fa-minus | fa-times | - | Open (id 6) | iso-row-critical |
| 20240101 | 00032 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-minus | fa-minus | fa-times | - | Open (id 6191) | iso-row-critical |
| 20240101 | 0005 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-times | fa-minus | fa-times | - | Open (id 6598) | iso-row-critical |
| 20240101 | 0003 | - | - | - | - | fa-times | fa-times | fa-times | fa-times | fa-check | fa-check | fa-check | fa-times | - | Open (id 895) | iso-row-critical |

The meaning of the icon classes is not stated in the capture; the table shows them as found. The `Opts` link targets are `index.php?page=isometrics&id=<id>&project=1` (the id is shown in the table).

## Not in the capture
- The `Add` dialog `#addMaterial` (opened by the plus button in the panel header): it is not in the DOM of this capture, so its fields and buttons are unknown. Its opening control is `href="#addMaterial"`, `data-toggle="modal"`.
- Refresh button (`#btnRefreshIso`) result and handler: not in the capture.
- Import page (`index.php?page=material-database-import`): a link, not captured.
- Rows beyond the 7 shown (the server reports 16,058 total entries; the filter that reduces them is not visible in the capture): not shown.
- Full table request query string (cut off after about 3,500 characters) and the table response bodies: not in the capture.
- Export output (CSV, Excel, print): not triggered; the buttons are present with `href="#"`.
- Browser-pass notes for this page: none exist in `_interactive/`.

Also present in the page, opened from elsewhere (no control of this page points to them): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, editServiceRequest, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest. The handheld menu items (`Scan weld`, `Scan flange QR label`, `Add punch`) are in the DOM as floating-button items.
