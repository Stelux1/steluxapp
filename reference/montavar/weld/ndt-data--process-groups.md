# WeldPilot → NDT data → NDT process groups

Source: `weld__ndt__process-groups.txt`, `weld__ndt__process-groups__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/ndt-process-groups/`.
State of the page for the observing account: normal.

## Page
- Browser title: "NDT process groups - WeldPilot®". Page heading in the panel: "NDT process".
- Breadcrumb: "NDT process groups" (active crumb, `href="/weldpilot/ndt-process-groups/"`).
- Tabs: none in the capture.
- Left side menu: "NDT data" (accordion toggle, shown open, `class="menu-open"`). Its sub-items are not in the capture (only the one changed line of the menu is written).
- Header language links: Nederlands, English, Deutsch, Français (`lang=nl|en|de|fr`).
- Buttons above the list:
  - "Add NDT process" (top bar, `.buttonInsert`, `data-toggle="modal"`, `href="#addNdtProcessGroup"`) → opens the Add dialog `#addNdtProcessGroup`.
  - "+" icon button in the panel heading "NDT process" (same `href="#addNdtProcessGroup"`, same dialog).
- Note: the button text reads "Add NDT process" on this page, although the page lists NDT process groups (the reference wording, kept as is).

## List
- Table: `#datatableWarehouse`, client-side (DataTables): `serverSide: false`, `ajax: null` (no server request for the rows; the rows are in the page).
- Columns in order:
  1. "NDT process group" (data 0, sortable, visible)
  2. "Description" (data 1, sortable, visible)
  3. "Options" (data 2, sortable flag set, visible; contains two icon buttons)
- Hidden columns: none.
- Default sort: column 2 "Description", ascending (`order: [[1,"asc"]]`).
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Per-column search inputs: none. Filters: none.
- Global search: one input above the table, `type="search"`, placeholder "Search", with a clear button (`aria-label="Clear"`, icon `fa-times`). DataTables search label text is empty.
- Row options, in order:
  1. Pencil icon (`glyphicon-pencil`, class `btn-warning`, `open-editNdtProcessGroup`, `href="#editNdtProcessGroup"`, `data-toggle="modal"`, `data-id` = row id) → opens Edit dialog `#editNdtProcessGroup`.
  2. Trash icon (`glyphicon-trash`, class `btn-danger`, `open-deleteNdtProcessGroup`, `href="#deleteNdtProcessGroup"`, `data-toggle="modal"`, `data-id` = row id) → opens Delete dialog `#deleteNdtProcessGroup`.
- Bulk actions (Options menu): none in the capture.
- Export / print buttons: none in the capture.
- Info text: "Showing 1 to 11 of 11 entries" (`Showing _START_ to _END_ of _TOTAL_ entries`).
- Empty text: "No data available in table". Search no-match text: "No matching records found".
- Server-side table request: none (`ajax: null`).
- Second table on the page: a table with the same header labels ("NDT process group", "Description", "Options") and no body rows, placed above the main table. Its DataTables configuration failed in the capture (`TypeError: Cannot read properties of undefined (reading 'ajax')`). Its role is not shown in the capture.

## Dialogs

### Add NDT process (`#addNdtProcessGroup`) — opened by "Add NDT process" (top bar) and the "+" button in the panel heading
Dialog title (h4): "Add NDT process". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT process group | process | text | yes | empty | none |
| 2 | Description | description | text | no | empty | none |

No hidden inputs. No tabs.
Buttons: "Add" (submit, `name="addNdtProcessGroup"`, classes `btn-primary btn-hideInsert`); "Cancel" (`data-dismiss="modal"`).
Text rules in the dialog: none (only the REQUIRED flag on field 1).

### Edit NDT process group (`#editNdtProcessGroup`) — opened by the pencil icon of a row (`data-id` = row id)
Dialog title (h4): "Edit NDT process group". Form `method="post"`.
The static dialog in the page has only the header and the footer. The body is loaded when the pencil is clicked: `GET /core/ajax/editNdtProcessGroup.php?id=<row id>&action=showroom` (see Rules). The body captured for row id 13 ("FERRITE"):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT process group | process | text | yes | "FERRITE" (row 13) | value comes from the row |
| 2 | Description | description | text | yes | "Ferrite measurement" (row 13) | value comes from the row |
| 3 | (hidden) | editID | hidden | no | "13" | the row id |

Notes from the capture: both visible inputs have the same element id `exampleInputEmail1` as written in the page; both labels point to `for="input00"`.
Buttons: "Update" (submit, `name="editNdtProcessGroup"`, classes `btn-warning btn-hideEdit`); "Cancel" (`data-dismiss="modal"`).
From the browser-pass notes (`_interactive/I2a-welders-catalogs.md`, not in the raw capture): on screen the footer showed only "Cancel"; the "Update" button is in the DOM with class `btn-hideEdit` but was not visible.

### Delete NDT process group (`#deleteNdtProcessGroup`) — opened by the trash icon of a row (`data-id` = row id)
Dialog title (h4): "Delete NDT process group". Form `method="post"`.
Body text: "Are you sure?"

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID | hidden, `id="bookIdDeleteNdtProcessGroup"` | no | not shown in the capture (the value is set by script when the trash icon is clicked, see Rules) | the row id of the clicked row |

Buttons: "Delete" (submit, `name="deleteNdtProcessGroup"`, classes `btn-danger btn-hideDelete`); "Cancel" (`data-dismiss="modal"`).
Text rules in the dialog: the text "Are you sure?" only.

## Rules found in the page's JavaScript
- Click on a pencil (`.open-editNdtProcessGroup`, delegated jQuery handler): the handler takes the row's `data-id` into `myBookId`, requests `/core/ajax/editNdtProcessGroup.php?id=<myBookId>` and writes the response HTML into `#contentEditNdtProcessGroup`. The request in the browser's network log for row 13 also carries `action=showroom`; the visible script lines do not show where that parameter is added.
- Click on a trash icon (`.open-deleteNdtProcessGroup`, delegated jQuery handler): sets the value of `.modal-body #bookIdDeleteNdtProcessGroup` to `myBookId`.
- Validation: the REQUIRED flag on "NDT process group" (Add and Edit) and on "Description" (Edit). No validation message text is in the capture.
- Fields shown or hidden on a condition: none found in the capture. The classes `btn-hideInsert`, `btn-hideEdit` and `btn-hideDelete` are on the footer buttons; the code that hides them is not in the new script lines of this capture.
- Values computed in the browser: none found in the capture.
- Requests the page makes:
  - On load: `GET /core/ajax/ajax-notifications.php?action=count_unread`.
  - On pencil click: `GET /core/ajax/editNdtProcessGroup.php?id=<row id>&action=showroom` (parameters: `id`, `action`; response is the dialog body HTML with the two inputs and the hidden `editID`).
  - Add, Update and Delete submit as form posts (the form's action URL is not in the capture).
- The page's bundled script is a shared file used by all WeldPilot pages. Its other requests (for example `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `getListOfMaterials.php`) are in the bundle but are not tied to any control of this page in the capture.

## Sample data
- Row count: 11 rows, all shown on one page (page length 20). Info: "Showing 1 to 11 of 11 entries". The capture shows no filter or search text.
- Rows in the order the page draws them (sorted by Description ascending). Options column shows the row ids (`data-id`) for the pencil and the trash buttons; both carry the same id.

| NDT process group | Description | Row id (Options: edit / delete) |
|---|---|---|
| FERRITE | Ferrite measurement | 13 |
| RT | Gammagrafisch, Rontgenen | 1 |
| MT | Magnetic treatment | 3 |
| MT-b | Magnetic treatment bevel | 7 |
| PT | Penetrant treatment | 2 |
| PT-b | Penetrant treatment bevel | 8 |
| PA | Phased Array | 6 |
| PMI | Positive Material Identification | 12 |
| UT | Ultrasonic Testing | 10 |
| UT-ToFD | Ultrasonic Testing ToFD | 4 |
| VT | Visual inspection | 5 |

## Not in the capture
- The Edit dialog body is captured only for row 13 (separate capture `weld__ndt__process-groups__edit`); the other rows' bodies are loaded by the same request on click.
- The Delete dialog's hidden value after a trash click: the capture shows the dialog without a value.
- Results of Add, Update and Delete submits, and the form action URLs.
- The footer "Update" button's visibility (see the browser-pass note under Edit).
- The "NDT data" side-menu sub-items (only the "NDT data" toggle line is in the capture).
- Column sorting results other than the default; the search result for a typed term.
- Dialogs listed in the next line are opened from other pages, not from this page.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal (and the handheld floating menu items "Scan weld", "Scan flange QR label", "Add punch").
