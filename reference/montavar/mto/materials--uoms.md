# MTO Pilot → Materials → UOMs

Source: `mto__materials__uoms.txt`, `mto__materials__uoms__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/material-uoms/`.
State of the page for the observing account: normal.

## Page
- Browser title: "UOMs - MTOPilot®".
- Breadcrumb / top bar: a link "UOMs" → `index.php?page=material-uoms` (top bar, next to the top bar's other entries; no other breadcrumb items in the capture).
- Tabs: none.
- Panel heading: icon (tasks) + title "UOMs", followed by a button "+" (blue, `href="#addUOM"`, `data-toggle="modal"`) that opens the Add UOM dialog.
- Buttons above the list:
  - "Add UOM" (top bar, blue, full width, plus icon) → opens `#addUOM`.
  - "+" in the panel heading (same button as the top bar's, opens `#addUOM`).
  - "CSV" → export link (`href="#"`, DataTables HTML5 CSV button).
  - "Excel" → export link (`href="#"`, DataTables HTML5 Excel button).
  - Print icon (no text, `fa fa-print`) → DataTables print button.
  - Search box (placeholder "Search", search icon, clear button with aria-label "Clear") → global search of the table.

## List
- Table id `#datatableWarehouse`, class `table table-striped table-bordered table-hover dataTable`.
- Columns in order: **UOM**, **Options**. Both columns are visible and sortable in the DataTables configuration. The header row reads "UOM" and "Options".
- Hidden columns: none.
- Default sort: column 0 (UOM), ascending.
- Server-side: no (`serverSide: false`). The server-side table request (ajax url): none (`ajax: null`); all rows are in the page.
- Page length options: 5, 20, 50, 100, 500. Default page length: 20. The length selector itself is not present in the rendered DOM of the capture, so only the configuration is shown.
- Per-column search inputs: none. Global search only.
- Filters: none.
- Row options, in order (the Options column):
  1. Pencil icon, warning-coloured small button (`open-editUOM`, `href="#editUOM"`, `data-id` = row id) → opens the Edit UOM dialog for that row.
  2. Trash icon, danger-coloured small button (`open-deleteUOM`, `href="#deleteUOM"`, `data-id` = row id) → opens the Delete UOM dialog for that row.
- Bulk actions (Options menu): none. No row checkboxes and no Options menu are shown on this page.
- Export / print buttons: CSV, Excel, print (see Page).
- Info and empty texts (DataTables language):
  - Info: "Showing _START_ to _END_ of _TOTAL_ entries".
  - Empty: "No data available in table".
  - Zero matches: "No matching records found".
  - Footer shown on the sandbox: "Showing 1 to 20 of 20 entries".
- A second, empty table element sits above the list: its header reads "UOM" and "Options" (the capture shows the header text "UOMOptions"), it has no rows, and its DataTables configuration failed in the capture with the error "TypeError: Cannot read properties of undefined (reading 'ajax')". The visible list is the second table (`#datatableWarehouse`).

## Dialogs

### Add UOM (`#addUOM`) — opened by "Add UOM" (top bar) and the "+" button in the panel heading
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | UOM | name | text | yes (`required`) | empty | Free text. The label has `for="input00"`; the input has no id in the closed dialog. |

- Form: `method="post"`. Dialog title "Add UOM".
- Buttons: "Add" (btn-primary, type submit, `name="addUOM"`, class `btn-hideInsert`); "Cancel" (btn default, closes the dialog).
- Rule text in the dialog: none.

### Edit UOM (`#editUOM`) — opened by the pencil button of a row (`data-id` = row id)
The dialog body is loaded by a request when the button is clicked (see Rules). The closed dialog holds only the footer; the body is filled from the response.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | UOM | name | text | yes (`required`) | the row's current UOM (captured for row id 2: "BX") | Loaded by `GET /core/ajax/editUOM.php?id=<row id>` (see Rules). Label `for="input00"`; the loaded input has id `exampleInputEmail1`. |
| 2 | (none, hidden) | editID | hidden | — | the row id (captured: 2) | Present in the loaded response only, not in the closed dialog. |
| 3 | (none, hidden) | secureCode | hidden (`#bookIdEditUOMSecure`) | — | empty in the closed dialog; the script sets it on click | Value computed by the page script on click (see Rules). |

- Form: `method="post"`. Dialog title "Edit UOM".
- Buttons: "Update" (btn-warning, type submit, `name="editUOM"`, class `btn-hideEdit`); "Cancel" (btn default).
- Note from the browser-pass notes (`_interactive/I3-mto.md`): on the sandbox the Update button was not visible on screen, only Cancel was; it is in the DOM with class `btn-hideEdit`. This capture shows the same DOM and no script line that explains it.
- Rule text in the dialog: none.

### Delete UOM (`#deleteUOM`) — opened by the trash button of a row (`data-id` = row id)
Not captured opened. Described from the closed DOM; the browser-pass notes do not mention it.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none, hidden) | deleteID | hidden (`#bookIdDeleteUOM`) | — | empty in the closed dialog; the script sets the row id on click | Set from the clicked row's `data-id` (see Rules). |
| 2 | (none, hidden) | secureCode | hidden (`#bookIdDeleteUOMSecure`) | — | empty in the closed dialog; the script sets it on click | Value computed by the page script on click (see Rules). |

- Form: `method="post"`. Dialog title "Delete UOM".
- Buttons: "Delete" (btn-danger, type submit, `name="deleteUOM"`, class `btn-hideDelete`, trash icon); "Cancel" (btn default).
- Rule text in the dialog: "Are you sure?" (plain text in the form body).

## Rules found in the page's JavaScript
- Edit button (`.open-editUOM`, click handler): reads the row's `data-id` as `myBookId`; sets the hidden `#bookIdEditUOMSecure` value to a fixed prefix (a constant from the script) + `myBookId` + the suffix `uomE`; then requests `/core/ajax/editUOM.php?id=` + `myBookId` and puts the returned HTML into `#contentUOM`. The logged request for row 2 was `GET /core/ajax/editUOM.php?id=2&action=showroom` (status 200): the logged URL carries `action=showroom`, which the visible script line does not show.
- Delete button (`.open-deleteUOM`, click handler): sets `#bookIdDeleteUOM` in the modal body to `myBookId` (the row id); sets `#bookIdDeleteUOMSecure` to the same fixed prefix + `myBookId` + the suffix `uom`. No request is made on open (none appears in the capture).
- Add button: no click handler for `#addUOM` appears in this capture (the button only opens the modal via `data-toggle="modal"`).
- The submit handlers of the Add, Update and Delete buttons (`addUOM`, `editUOM`, `deleteUOM`) are not in these captures; they were in earlier captures of the sweep and are marked "already captured" here.
- Page load: a request `GET /core/ajax/ajax-notifications.php?action=count_unread` appears in the capture; it belongs to the shared header, not to this list.
- The rest of the script in the capture is shared across the site (requests to `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `getListOfMaterials.php`, `saveAddCalculationModalState.php`). None of them is triggered on this page in the capture.

## Sample data
- Row count: 20 entries, all on one page (20 per page). The footer reads "Showing 1 to 20 of 20 entries".
- Table order (sorted by UOM, ascending, as displayed). Row id is the `data-id` of the row's buttons, not a visible column. Options: pencil (edit) and trash (delete) on every row.

First 15 rows:

| # | Row id | UOM | Options |
|---|---|---|---|
| 1 | 19 | - | edit, delete |
| 2 | 2 | BX | edit, delete |
| 3 | 8 | DR | edit, delete |
| 4 | 1 | EA | edit, delete |
| 5 | 15 | EUR | edit, delete |
| 6 | 13 | H | edit, delete |
| 7 | 7 | KG | edit, delete |
| 8 | 10 | KIT | edit, delete |
| 9 | 5 | L | edit, delete |
| 10 | 3 | M | edit, delete |
| 11 | 12 | M2 | edit, delete |
| 12 | 18 | MTR | edit, delete |
| 13 | 14 | P | edit, delete |
| 14 | 6 | PAA | edit, delete |
| 15 | 9 | PAC | edit, delete |

Last 5 rows (not in the table above): row id 20 "PC"; row id 21 "pcs"; row id 4 "SET"; row id 17 "STK"; row id 11 "TON".

Full UOM list in display order: -, BX, DR, EA, EUR, H, KG, KIT, L, M, M2, MTR, P, PAA, PAC, PC, pcs, SET, STK, TON.

## Not in the capture
- Edit UOM body for every row other than id 2 (BX): the body is loaded per row by `editUOM.php?id=<row id>` after the pencil click; only row 2 was opened.
- Delete UOM dialog: never captured opened; no request on open is visible.
- Results of the submit buttons (Add, Update, Delete) and of the CSV, Excel and print buttons: not performed, not captured.
- The page-length selector control (5 / 20 / 50 / 100 / 500) and the rendered per-page select: the configuration is in the capture, the control is not in the rendered DOM.
- Row option "remove" or any second menu on the row: none found in the capture.
- Import of UOMs: no Import control is on this page.

## Also present in the page, opened from elsewhere
editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.
