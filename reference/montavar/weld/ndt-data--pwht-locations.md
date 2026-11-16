# WeldPilot → NDT data → PWHT locations

Source: `weld__ndt__pwht-locations.txt`, `weld__ndt__pwht-locations__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/pwht-location/`.
State of the page for the observing account: normal.

## Page
- Browser title: "PWHT locations - WeldPilot®".
- Panel heading: "PWHT locations" (list icon `glyphicon-list`), with a "+" icon button that opens `#addPwhtLocation`.
- Breadcrumb: not in the capture.
- Tabs: none in the capture.
- Header language links: Nederlands, English, Deutsch, Français (`lang=nl|en|de|fr`, same page id).
- Top bar link: "PWHT locations" (`href="/weldpilot/pwht-location/"`).
- Buttons above the list:
  - "Add PWHT location" (top bar, `.buttonInsert`, `data-toggle="modal"`, `href="#addPwhtLocation"`) → opens the Add dialog `#addPwhtLocation`.
  - "+" icon button in the panel heading (same `href="#addPwhtLocation"`, same dialog).
- Top-bar item "Add PWHT location" is shown on this page as the only page-specific button of the top bar.

## List
- Table: `#datatableWarehouse`, client-side (DataTables): `serverSide: false`, `ajax: null` (rows are in the page; no server request for the rows).
- Columns in order (DT `cols` and header row):
  1. "PWHT location" (data 0, sortable, visible)
  2. "Enabled on this site" (data 1, sortable, visible)
  3. "Options" (data 2, sortable, visible; two icon buttons)
  4. Checkbox column (data 3, sortable flag set, visible); header cell is a select-all checkbox `#checkAll`; each row has a checkbox `#id_<row id>`, `name="ccid_<row id>"`, `val="s<row id>"`.
- Hidden columns: none.
- Default sort: as configured, `order: [[2,"asc"]]` (column index 2, "Options"), ascending.
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Per-column search inputs: none. Filters: none.
- Global search: one input above the table, `type="search"`, placeholder "Search", with a clear button (`aria-label="Clear"`, icon `fa-times`).
- Export / print buttons (DataTables Buttons, above the table): "CSV" (`buttons-csv`, `href="#"`), "Excel" (`buttons-excel`, `href="#"`), print icon (`buttons-print`, `href="#"`, `fa-print`). Their result was not captured.
- Row options, in order:
  1. Pencil icon (`glyphicon-pencil`, class `buttonEdit open-editPwhtLocation btn-warning`, `href="#editPwhtLocation"`, `data-toggle="modal"`, `data-id` = row id) → opens Edit dialog `#editPwhtLocation`.
  2. Trash icon (`glyphicon-trash`, class `buttonDelete open-deletePwhtLocation btn-danger`, `href="#deletePwhtLocation"`, `data-toggle="modal"`, `data-id` = row id) → opens Delete dialog `#deletePwhtLocation`.
- Bulk actions (Options menu): none in the raw capture (no Options button in the DOM). The browser-pass table in `_interactive/I2a-welders-catalogs.md` lists "Options ▾" for this page; its dialog notes describe that menu only on NDT locations (see Not in the capture).
- Info text: "Showing 1 to 3 of 3 entries" (`Showing _START_ to _END_ of _TOTAL_ entries`).
- Empty text: "No data available in table". Search no-match text: "No matching records found".
- Server-side table request: none (`ajax: null`).
- Second table on the page: a table with the same header labels ("PWHT location", "Enabled on this site", "Options", checkbox) and no body rows, placed above `#datatableWarehouse`. Its DataTables configuration failed in the capture (`TypeError: Cannot read properties of undefined (reading 'ajax')`). Its role is not shown in the capture.

## Dialogs

### Add PWHT location (`#addPwhtLocation`) — opened by "Add PWHT location" (top bar) and the "+" button in the panel heading
Dialog title (h4): "Add PWHT location". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | PWHT location | location | text | yes | empty | none |

No hidden inputs. No tabs.
Buttons: "Add" (submit, `name="addPwhtLocation"`, classes `btn-primary btn-hideInsert`); "Cancel" (`data-dismiss="modal"`).
Text rules in the dialog: none (only the REQUIRED flag on field 1).

### Edit PWHT location (`#editPwhtLocation`) — opened by the pencil icon of a row (`data-id` = row id)
Dialog title (h4): "Edit PWHT location". The static dialog has only the header and the footer; the body is loaded when the pencil is clicked (`GET /core/ajax/editPwhtLocation.php?id=<row id>&action=showroom`, see Rules). Body captured for row id 4 ("Site MNT - Antwerp"); the body is inside a `<form method="post">`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | PWHT location | location | text | yes | "Site MNT - Antwerp" (row 4) | value comes from the row, loaded on open; the input has id `exampleInputEmail1` as written in the response; its label has `for="input00"` |
| 2 | (hidden) | editID | hidden | no | "4" (row 4) | the row id, written by the loaded body |
| 3 | (hidden) | secureCode | hidden, `id="bookIdEditPwhtLocationSecure"` (footer) | no | set by script on open (from the variable `secure`); the value is a per-open token and is not reproduced here | set on every row click |

Buttons: "Update" (submit, `name="editPwhtLocation"`, classes `btn-warning btn-hideEdit`); "Cancel" (`data-dismiss="modal"`).
Text rules in the dialog: none (only the REQUIRED flag on field 1).

### Delete PWHT location (`#deletePwhtLocation`) — opened by the trash icon of a row (`data-id` = row id)
Dialog title (h4): "Delete PWHT location". Form `method="post"`.
Body text: "Are you sure?"

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID | hidden, `id="bookIdDeletePwhtLocation"` | no | empty in the static DOM; set by script to the row id on trash click | the row id of the clicked row |
| 2 | (hidden) | secureCode | hidden, `id="bookIdDeletePwhtLocationSecure"` | no | empty in the static DOM; set by script on trash click (from `secure`); value not reproduced | set on every trash click |

Buttons: "Delete" (submit, `name="deletePwhtLocation"`, classes `btn-danger btn-hideDelete`); "Cancel" (`data-dismiss="modal"`).
Text rules in the dialog: the text "Are you sure?" only.

Also present in the page, opened from elsewhere: admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, editCompanyData, passwordChange, themeChange, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal (the handheld menu items "Scan weld", "Scan flange QR label" and "Add punch" are in the page's handheld button, not this page's list controls).

## Rules found in the page's JavaScript
- Page identifier: `__wsappsDebugPage = "pwht-location"` (a debug variable of the page).
- Click on a pencil (`.open-editPwhtLocation`, delegated jQuery handler): takes the row's `data-id` into `myBookId`, copies the script variable `secure` into `#bookIdEditPwhtLocationSecure`, requests `/core/ajax/editPwhtLocation.php?id=<myBookId>` and writes the response HTML into `#contentEditPwhtLocation`. The browser's request log for row 4 shows the URL with `&action=showroom` added; the visible script lines do not show where that parameter is added. How `secure` is produced is in lines captured on earlier pages, not in this file.
- Click on a trash icon (`.open-deletePwhtLocation`, delegated jQuery handler): sets `.modal-body #bookIdDeletePwhtLocation` to `myBookId` and `.modal-body #bookIdDeletePwhtLocationSecure` to `secure`.
- Validation: the REQUIRED flag on "PWHT location" (Add and Edit). No validation message text is in the capture.
- Requests made on page load (XHR log): `/core/ajax/ajax-notifications.php?action=count_unread`.
- Requests whose code is in the page's script text in this capture (shared script bundle; the capture does not show that this page's controls call them): `/core/ajax/searchProject.php?time=…`; `/core/ajax/saveAddCalculationModalState.php` (parameters `k`, `v`, `timer`, `ajax`); `/core/ajax/getListOfMaterials.php` (parameters `id`, `timer`, `ajax`); `/core/ajax/searchUnitRates.php` (`id`, `timer`, `ajax`); `/core/ajax/searchTarrifs.php` (`id`, `timer`, `ajax`); `/core/ajax/searchFactors.php` (`id`, `timer`, `ajax`). Methods are GET (`$.getJSON`) where visible.

## Sample data
Sandbox list: 3 rows, `total` 3, `shown` 3 ("Showing 1 to 3 of 3 entries"). Browser-pass notes give the project site as Zandbak (`_interactive/I2a-welders-catalogs.md`, header).

| PWHT location | Enabled on this site | Options | Row id (`data-id`) |
|---|---|---|---|
| Site MNT - Antwerp | No | pencil, trash | 4 |
| Termoproces - Beograd | No | pencil, trash | 2 |
| Workshop MNT - Beograd | No | pencil, trash | 1 |

Rows are shown in this order in the capture. The table has no further rows.

## Not in the capture
- Edit dialog body for rows 2 and 1, and for any other row: loaded only after the pencil click (only row 4 was captured, by `weld__ndt__pwht-locations__edit`). Control: pencil icon of the row.
- Delete dialog: its DOM is in the page capture, but no click capture exists; the values the script sets on trash click (row id, `secureCode`) are known only from the script. Control: trash icon of the row.
- Add dialog: DOM only; no opening capture. Control: "Add PWHT location" button or "+" in the panel heading.
- Bulk actions / Options menu: the raw capture has no Options button. The browser-pass table (`_interactive/I2a-welders-catalogs.md`) lists "Options ▾, + Add PWHT location" for this page, but its dialog notes describe the Options menu only on NDT locations ("Activate selected" / "Deactivate selected", both opening confirmation dialogs). What the menu holds on this page is not confirmed by a capture.
- Enable checkbox: the browser-pass header states that dialogs on these pages carry "Enable on this site (Zandbak)". For PWHT locations, the raw capture's Add and Edit dialogs have no such checkbox, and the browser-pass dialog note for this page lists one field only. The raw capture is taken as correct.
- Export and print results (CSV, Excel, print): not captured (`href="#"`).
- Saving, updating or deleting a location: not performed (read-only capture); the responses of the submit buttons are not in the capture.
- Rows beyond the three shown: none in the sandbox.
- The second table (empty, DataTables configuration failed): its role and content are not shown.
