# MTO Pilot → Order / Take in → Pending order

Source: `mto__order__pending-order.txt` (no click-opened dialog captures exist for this page; browser-pass notes in `reference/montavar/raw/_interactive/I3-mto.md` are consistent with it) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-not-receive`.
State of the page for the observing account: normal.

Note on the menu name: the breadcrumb's last item says "Pending order" and links to `index.php?page=material-receive`, while the page URL is `page=material-not-receive`. The capture shows both as written.

## Page
- Document title: "Pending order - MTOPilot®".
- Breadcrumb (`HEADER #topbar`): "Zandbak" (link `index.php?page=project-sites&id=1`) › "Pending order" (link `index.php?page=material-receive`).
- Tabs: none in the capture.
- Buttons above the list (in the panel heading, `.wsapps-dt-search` and `.dt-buttons`):
  - Search input (`#pendingOrderSearch`, placeholder "Search") → filters the table on each keyup/input (client-side, see Rules).
  - Clear icon button (`#pendingOrderSearchClear`, aria-label "Clear", icon `fa fa-times`) → empties the search input and re-applies the filter.
  - "CSV" (`.dt-button.buttons-csv.buttons-html5`, `href="#"`) → DataTables Buttons HTML5 CSV export.
  - "Excel" (`.dt-button.buttons-excel.buttons-html5`, `href="#"`) → DataTables Buttons HTML5 Excel export.
  - Print (icon `fa fa-print`, `.dt-button.buttons-print`, `href="#"`) → DataTables Buttons print.
- Top bar: no buttons on this page other than the app switcher and language links listed below.
- App switcher (`#topbar-dropmenu`): "MTOPilot®" (`/mtopilot/`), "ESTPilot®" (`/estpilot/`), "WeldPilot®" (`/weldpilot/`), "TeamPilot®" (`/teampilot/`), "ToolPilot®" (`/toolpilot/`).
- Language links in the header: "Nederlands" (`lang=nl`), "English" (`lang=en`), "Deutsch" (`lang=de`), "Français" (`lang=fr`), each keeping `page=material-not-receive`.
- Floating action button (site-wide, bottom right, `.wsapps-handheld-fab-btn`, title and aria-label "Scan QR", icon `fa fa-qrcode`) with two menu items:
  - "Scan material" (`data-action="material-qr-scan"`).
  - "Scan service request" (`data-action="service-request-scan"`). Its click handler is in the shared script of the start dashboard capture (`mto__start__dashboard.txt`): it opens `#srArchiveScanModal` ("Scan QR"). The click binding for "Scan material" was not among the lines read; the modal it targets is `#materialQrScanModal` ("Scan material") as present in the page.

## List
- Panel heading: "Pending order".
- Table: `#datatablePendingMaterials` (inside `#datatablePendingMaterials_wrapper`), class `table table-striped table-bordered table-hover dataTable no-footer`, role grid.
- Columns, in order (from the `DT` line and the header row):
  1. "Group" (data key 0, sortable, visible)
  2. "Material No" (data key 1, sortable, visible)
  3. "Description" (data key 2, sortable, visible)
  4. "Ordered" (data key 3, sortable, visible). Header markup: `hidden-xs` span "Ordered" and `visible-xs` span "Ord." (the header text in the capture reads "Ordered" and "Ord.").
  5. "Ord. No." (data key 4, sortable, visible)
  6. "Date" (data key 5, sortable, visible)
  7. "Received" (data key 6, sortable, visible). Header markup: `hidden-xs` span "Received" and `visible-xs` span "Rec." (the header text in the capture reads "Received" and "Rec.").
- Hidden columns: none.
- Default sort: column index 5 ("Date"), ascending (`order: [[5,"asc"]]`).
- Page length options: 20, 50, 100 (`lengthMenu`); default page length 20.
- Per-column search inputs: none. Only the single global search input above the table.
- Filters: none in the capture.
- Row options (icons / links per row): none. The table has no action column; the rows are read-only ("Read-only list, no row actions" per the browser-pass notes).
- Bulk actions (Options menu): none in the capture. There is no select checkbox column.
- Export / print buttons: CSV, Excel, Print (see Page). The page's inline script would move the `.dt-buttons` group into `.pn-filter-toolbar .ft-filters` if that element exists; the element is not in the capture, so the buttons stay where rendered (in the panel above the table).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (DataTables `lang.info`; footer rendered as "Showing 1 to 4 of 4 entries").
- Empty text: "No data available in table" (`lang.empty`).
- Zero-match text: "No matching records found" (`lang.zero`).
- Search placeholder: "Search".
- Server-side table request: none. `serverSide: false`, `ajax: null`; the table is filled from the rows in the HTML.

## Dialogs
No dialog is opened by a control of this page in the capture.

The page contains site-wide dialogs that are also present on other pages. Also present in the page, opened from elsewhere: `editCompanyData`, `passwordChange`, `themeChange`, `admin` (System settings), `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.

## Rules found in the page's JavaScript
Inline script `h=37vn54xrs` (page-specific, from the capture):
- Search: on `keyup input` of `#pendingOrderSearch`, the DataTable is searched with the input's value and redrawn (`dt.search(value).draw()`); only if the DataTable is initialised. The wrapper `.wsapps-dt-search` gets class `has-value` when the trimmed value is not empty.
- Clear: clicking `#pendingOrderSearchClear` sets the input to empty, triggers `keyup`, and focuses the input.
- Export buttons: a retry loop (every 100 ms, up to 50 tries) moves `#datatablePendingMaterials_wrapper .dt-buttons` (with `pull-right` removed) into `.pn-filter-toolbar .ft-filters` when both exist.

Other script lines in the capture (the shared site script; only its lines new to this capture are written out):
- `var __wsappsDebugPage = "material-not-receive";` (page identifier).
- Requests the shared script makes (endpoint, parameters): `getJSON /core/ajax/getListOfMaterials.php` (params `id`, `timer`, `ajax`); `/core/ajax/searchProject.php` (AJAX url with a `time` parameter); `getJSON /core/ajax/saveAddCalculationModalState.php` (params `k`, `v`, `timer`, `ajax`); `getJSON /core/ajax/searchUnitRates.php` (`id`, `timer`, `ajax`); `getJSON /core/ajax/searchTarrifs.php` (`id`, `timer`, `ajax`), twice; `getJSON /core/ajax/searchFactors.php` (`id`, `timer`, `ajax`), twice. The functions these lines belong to are in earlier captures; they are not described here. Whether they run on this page is not shown.
- Request on load (XHR list): `/core/ajax/ajax-notifications.php?action=count_unread`.
- No validations, no conditional fields, and no computed values are in this page's own script.

## Sample data
- Rows: 4 of 4 (`total: 4`, `shown: 4`). Footer: "Showing 1 to 4 of 4 entries".
- Rows as displayed (Group | Material No | Description | Ordered | Ord. No. | Date | Received):

| # | Group | Material No | Description | Ordered | Ord. No. | Date | Received |
|---|---|---|---|---|---|---|---|
| 1 | BOLTS A320-L43 | 8138268881 | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 3 | 00004 | 04.07.2024. | 0 |
| 2 | FITTING CS FLG | 7662782601 | FLG PIPE WN A105 CL150 30 DN250 | 6 | 00001 | 20.03.2024. | 4 |
| 3 | CS | P235GH | PIPE, EN 10216-2 (SEAMLESS) | 10.4 | 00001 | 20.03.2024. | 7 |
| 4 | PIPE CS | 7430052832 | PIPE MET GR.B - - - 30 250MM | 12 | 00001 | 20.03.2024. | 0 |

Row 1's Group cell is captured as one text ("BOLTS A320-L43"); the capture does not show whether it is one field or a label plus a value. Rows are in the order displayed (sorted by Date ascending).

## Not in the capture
- Dialogs: none opened by this page's own controls were captured (no `mto__order__pending-order__*` files exist).
- The "Scan material" menu item's click handler (the `material-qr-scan` binding) and the body of `#materialQrScanModal` are not in this page's capture; the modal markup is in the page (see Dialogs list).
- Rows beyond the first page: none (4 rows, one page).
- Table body is loaded client-side from the HTML; no server request for the rows was captured.
