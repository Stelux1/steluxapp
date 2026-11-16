# WeldPilot → Welder data → Roles

Source: `weld__welder__roles.txt`, `weld__welder__roles__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/roles/`.
State of the page for the observing account: normal.

## Page
- Page title: `Roles - WeldPilot®`. Panel heading: "Roles".
- Breadcrumb: "Roles" (active crumb, link `/weldpilot/roles/`). No tabs on this page.
- Buttons above the list:
  - "Add Role" (top bar, class `buttonInsert`, `href="#addRole"`, `data-toggle="modal"`, plus icon) → opens dialog `#addRole`.
  - Icon-only plus button in the dark panel header (same `href="#addRole"`, no text) → opens dialog `#addRole`.
  - "CSV" (`dt-button buttons-csv`, `href="#"`) → export of the table; no handler in the capture.
  - "Excel" (`dt-button buttons-excel`, `href="#"`) → export; no handler in the capture.
  - Print icon-only button (`dt-button buttons-print`, `href="#"`, icon `fa-print`) → print; no handler in the capture.
  - The CSV, Excel and print buttons sit in the dark panel header area, above the table (the note of the browser pass places them in the dark panel header).
- Floating handheld button (global layout, outside `#main`, not specific to this page): "Scan weld", "Scan flange QR label", "Add punch". Not part of this page's content.

## List
- Table id `#datatableWarehouse` (DataTables, client-side: `serverSide: false`, `ajax: null`).
- Columns in order (DT line and header row):
  1. Role (data key 0), sortable
  2. Abbreviation (data key 1), sortable
  3. Max amount tasks (data key 2), sortable
  4. Lead role? (data key 3), sortable
  5. Options (data key 4), sortable
- Hidden columns: none.
- Default sort: column index 3 ("Lead role?"), ascending (`order: [[3,"asc"]]`).
- Page length: "Show" select (name `datatableWarehouse_length`), options 5 / 20 / 50 / 100 / 500; default 20 (`pageLength: 20`).
- Search: one global search box (type search, placeholder "Search", with a clear button, aria-label "Clear"). No per-column search inputs.
- Filters: none on this page.
- Row options (Options column), in order:
  - Pencil (class `open-editRole`, `href="#editRole"`, `data-toggle="modal"`, `data-id` = row id) → opens dialog `#editRole`.
  - Red trash (class `open-deleteRole`, `href="#deleteRole"`, `data-toggle="modal"`, `data-id` = row id) → opens dialog `#deleteRole`.
  - The row "Welder" has the pencil only (no trash). All other rows have pencil and trash.
- Bulk actions (Options menu): none in the capture (no row checkboxes, no bulk menu).
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 7 of 7 entries" (`_START_ to _END_ of _TOTAL_ entries`).
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none (client-side table). The only request made on load is `/core/ajax/ajax-notifications.php?action=count_unread` (page chrome, not the table).
- Lead role? column: the list shows the text "No" for every row in the capture. From the browser-pass notes: it is displayed as an orange "No" badge.

## Dialogs

### Add Role (`#addRole`) — opened by "Add Role" (top bar) and by the icon-only plus button in the panel header
Form `method="post"`. Dialog is in the page DOM (not loaded by request).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Role | name | text | yes (`REQUIRED`) | empty | — |
| 2 | Abbreviation | abbreviation | text | yes (`REQUIRED`) | empty | — |
| 3 | Max amount tasks | max_tasks | text | no | empty | — |
| 4 | Lead role? | lead | checkbox, value `1` (label "Lead role?") | no | unchecked | — |
| 5 | (no label, hidden) | type | hidden | — | `1` | in the footer, part of the form |

- Buttons: "Add" (type submit, name `addRole`, classes `btn-primary btn-hideInsert`); "Cancel" (dismiss, `btn default`).
- Text rules in the dialog: none (no help text in the dialog).

### Edit role (`#editRole`) — opened by the pencil icon of a row (`open-editRole`, `data-id` = row id)
Form `method="post"`. The page DOM holds only the header, an empty content container (`#contentEditRole`) and the footer. The body is loaded for each click by a request (see Rules). The fields below are the body loaded for row id 1 ("Welder"); the defaults depend on the row clicked.

| # | Label | name | Type | Required | Default (row id 1) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Function | name | text | yes (`required="required"`) | `Welder` | value from the row record |
| 2 | Abbreviation | abbreviation | text | yes (`required="required"`) | `WE` | value from the row record |
| 3 | Max amount tasks | max_tasks | text | no | `1` | value from the row record |
| 4 | Lead role? | lead | checkbox, value `1` (label "Lead role?") | no | unchecked | checked state from the row record (unchecked for id 1) |
| 5 | (no label, hidden) | editID | hidden | — | `1` | the row id; it changes with the row clicked |

- Note the label of field 1 is "Function" in this dialog; the Add dialog labels the same field "Role".
- Buttons: "Update" (type submit, name `editRole`, classes `btn-warning btn-hideEdit`); "Cancel" (dismiss, `btn default`).
- Text rules in the dialog: none.

### Delete role (`#deleteRole`) — opened by the red trash icon of a row (`open-deleteRole`, `data-id` = row id)
Form `method="post"`. Dialog is in the page DOM.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label; the body text is "Are you sure?") | deleteID | hidden, id `bookIdDeleteRole` | — | empty in the page DOM | set to the clicked row's id when the dialog is opened (see Rules) |

- Dialog body text: "Are you sure?"
- Buttons: "Delete" (type submit, name `deleteRole`, classes `btn-danger btn-hideDelete`, glyphicon trash icon); "Cancel" (dismiss, `btn default`).

Also present in the page, opened from elsewhere (not opened by a control on this page): `#admin` (System settings), `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.

## Rules found in the page's JavaScript
- Required fields: the Add and Edit forms mark "Role" (Add) / "Function" (Edit) and "Abbreviation" as required (HTML `required` attribute). No other validation, custom message or conditional field is visible in the capture.
- Click on `.open-editRole`: stores the row's `data-id` as `myBookId`, then loads `/core/ajax/editRole.php?id=` + `myBookId` and writes the returned HTML into `#contentEditRole`. The request observed in the capture is `GET /core/ajax/editRole.php?id=<id>&action=showroom` (status 200); the `action=showroom` parameter is not in the visible script lines, so it comes from a part of the script not shown in this capture.
- Click on `.open-deleteRole`: stores `myBookId` and sets the value of `.modal-body #bookIdDeleteRole` to it. No request is made by this handler in the visible lines. The trash click itself was not captured as a request log.
- Button classes `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete` are on the Add, Update and Delete buttons; the capture shows no script that acts on these classes.
- Table: `#datatableWarehouse` is client-side; the visible script lines also contain a DataTables init for an element `#table` (`scrollX`, `paging: false`, `scrollY: "80%"`, `fixedHeader`). The page DOM has no `#table` element, so this init does not apply to the roles table as far as the capture shows.
- Requests the page makes: on load `GET /core/ajax/ajax-notifications.php?action=count_unread`; on pencil click `GET /core/ajax/editRole.php?id=<id>&action=showroom`. The capture shows no request on trash click and no submission (Add, Update, Delete were not submitted).
- The visible script also contains `var __wsappsDebugPage = "roles";`. Other script lines of the same file are marked in the capture as already captured on earlier pages (not shown here).

## Sample data
Sandbox project site: 7 rows in total, all 7 shown on the one page (page length 20). Info text as displayed: "Showing 1 to 7 of 7 entries".

| Role | Abbreviation | Max amount tasks | Lead role? | Options (row id) |
|---|---|---|---|---|
| Welder | WE | 1 | No | pencil (1) |
| Fitter | FI | 2 | No | pencil (14), trash (14) |
| Lasser | LA | 2 | No | pencil (15), trash (15) |
| Montagewerker | MW | 2 | No | pencil (16), trash (16) |
| WVB | WVB | 4 | No | pencil (17), trash (17) |
| Voorman | VR | 10 | No | pencil (2), trash (2) |
| Uitvoerder | UV | 20 | No | pencil (3), trash (3) |

Default sort is "Lead role?" ascending; all rows show "No", so the displayed order is the stable order of the records as the capture shows it.

## Not in the capture
- The Edit role body for any row other than id 1 (loaded per click, shown only for "Welder").
- The state of the Delete role dialog after a trash click (the hidden `deleteID` value is set by script; the capture shows the empty DOM value only). The delete dialog was not opened in a capture.
- Result of submitting Add, Update or Delete (not submitted; nothing was saved or deleted).
- Output of CSV, Excel and print buttons.
- Rows beyond the first page: none, the table has 7 rows and fits on one page.
- The meaning of the `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete` classes (no script in the capture shows it).
