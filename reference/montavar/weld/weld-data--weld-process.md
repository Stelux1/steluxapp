# WeldPilot → Weld data → Weld process

Source: `weld__welddata__weld-process.txt`, `weld__welddata__weld-process__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/welding-process/`.
State of the page for the observing account: normal (the list is shown; no "You do not have rights" message).

## Page
- Title: "Weld process" (browser title "Weld process - WeldPilot®").
- Breadcrumb: one item only, "Weld process" (`.crumb-active`, link `/weldpilot/welding-process/`). No parent crumb in the capture.
- Tabs: none in the capture.
- Buttons above the list:
  - "Add welding process" (top bar, `.btn.btn-sm.btn-primary.btn-block`, glyphicon plus, `href="#addWeldingProcess"`, `data-toggle="modal"`) → opens dialog `#addWeldingProcess`.
  - Same control repeated as an icon-only "+" button in the panel heading (`.buttonInsert`, glyphicon plus, same `href="#addWeldingProcess"`) → opens `#addWeldingProcess`.
- Panel heading: glyphicon list icon and the text "Weld process".
- Other chrome on the page (the same on every page, not specific to this one): app switcher tiles MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®; language links Nederlands, English, Deutsch, Français (`?lang=…&page=welding-process`); a floating "Handheld" button (`title="Handheld"`) with a menu of "Scan weld" (`data-action="weld-scan"`), "Scan flange QR label" (`flange-scan`) and "Add punch" (`punchlist`).

## List
- Table: DataTables instance `#datatableWarehouse` (`.table.table-striped.table-bordered.table-hover`, role grid). Panel wrapper id `datatableWarehouse_wrapper`.
- Columns in order: "Weld process" (data key 0, visible, sortable); "Options" (data key 1, visible, sortable).
- Note on the DOM: a first table without an id sits in front of the drawn table. It has the header row "Weld process | Options", no body rows, and its DataTables setup reports `TypeError: Cannot read properties of undefined (reading 'ajax')`. The capture shows it as an empty table only.
- Default sort: column 0 ascending.
- Page length: default 20. Length options in the DataTables configuration: 5, 20, 50, 100, 500. The capture shows no length selector element in the DOM.
- Per-column search inputs: none.
- Filters: none.
- Global search: one input, `type="search"`, placeholder "Search", with a clear button (`.wsapps-dt-search-clear`, icon times). Label text in the DataTables config is empty.
- Row options, in order:
  1. Pencil icon (no text; `.buttonEdit.open-editWeldingProcess`, `btn-warning`, glyphicon pencil, `href="#editWeldingProcess"`, `data-id` = row id) → opens `#editWeldingProcess`.
  2. Trash icon (no text; `.buttonDelete.open-deleteWeldingProcess`, `btn-danger`, glyphicon trash, `href="#deleteWeldingProcess"`, `data-id` = row id) → opens `#deleteWeldingProcess`.
- Bulk actions (Options menu): none in the capture.
- Export and print buttons (`.dt-buttons`): "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), and an icon-only print button (`buttons-print`, fa print icon). All three have `href="#"`; none was pressed.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (drawn as "Showing 1 to 11 of 11 entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side request: none. `serverSide` is false and `ajax` is null; the rows are client-side, taken from the page HTML.

## Dialogs

### Add welding process (`#addWeldingProcess`) — opened by "Add welding process" (top bar and panel heading "+" icon)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Weld process | weldingProcess | text (class `form-control`) | yes (REQUIRED) | empty (no value attribute) | none. The label has `for="input00"`; the input has no id in the capture. |

- No hidden inputs in this dialog.
- Form: `method="post"`, no action attribute in the capture.
- Buttons: "Add" (type submit, `.btn.btn-primary.btn-hideInsert`, name `addWeldingProcess`); "Cancel" (`.btn.default`, dismisses the dialog); close icon button (times icon, dismisses).
- Text rules in the dialog: none beyond the REQUIRED attribute.

### Edit welding process (`#editWeldingProcess`) — opened by the pencil icon in a row (`.open-editWeldingProcess`, `data-id` = row id)
The dialog in the page has a header and a footer only. Its body is filled after the click by a request (see Rules): `GET /core/ajax/editWeldingProcess.php?id=<row id>&action=showroom`, returned HTML is placed into `#contentEditWeldingProcess`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Weld process | weldingProcess | text (class `form-control`, `autocomplete="off"`, id `exampleInputEmail1`) | yes (REQUIRED) | the row's text. Capture, row id 10: value "111" | none. The label has `for="input00"`, which does not match the input id `exampleInputEmail1`. |
| 2 | (no label) | editID | hidden | — | the row id (capture: "10") | set from the row that was clicked |
| 3 | (no label) | secureCode | hidden, id `bookIdEditWeldingProcessSecure`, in the footer | — | a per-row value set by the click handler before the request (capture: a 32-character hex value; not copied here) | set by the click handler, see Rules |

- Form: `method="post"`, no action attribute in the capture.
- Buttons: "Update" (type submit, `.btn.btn-warning.btn-hideEdit`, name `editWeldingProcess`); "Cancel" (`.btn.default`, dismisses); close icon button (dismisses).
- Text rules in the dialog: none beyond the REQUIRED attribute.

### Delete welding process (`#deleteWeldingProcess`) — opened by the trash icon in a row (`.open-deleteWeldingProcess`, `data-id` = row id)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label; body text "Are you sure?") | deleteID | hidden, id `bookIdDeleteWeldingProcess` | — | set by the click handler to the row id | set from the row that was clicked |
| 2 | (no label) | secureCode | hidden, id `bookIdDeleteWeldingProcessSecure` | — | set by the click handler (value not shown in the capture; not copied here) | set by the click handler, see Rules |

- Form: `method="post"`, no action attribute in the capture.
- Body text: "Are you sure?" (a plain text node in the form).
- Buttons: "Delete" (type submit, `.btn.btn-danger.btn-hideDelete`, name `deleteWeldingProcess`); "Cancel" (`.btn.default`, dismisses); close icon button (dismisses).

Also present in the page, opened from elsewhere (not opened by any control on this page): editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.

## Rules found in the page's JavaScript
Source: the page-specific handlers in the captured script (the large shared script loaded by the page, and its lines that name this page); the capture does not tie the shared requests below to any control on this page.
- Page load: the only request the capture shows is `GET /core/ajax/ajax-notifications.php?action=count_unread` (the notification counter, shared by all pages).
- Opening the edit dialog (click on `.open-editWeldingProcess`): reads the row's `data-id` into a variable, computes the secure code as a fixed text prefix, the row id and a fixed suffix (the suffix is `wprE` for edit), writes it into `#bookIdEditWeldingProcessSecure`, and requests `/core/ajax/editWeldingProcess.php?id=<row id>` with the response HTML placed into `#contentEditWeldingProcess`. The capture shows the request actually sent as `editWeldingProcess.php?id=10&action=showroom`.
- Opening the delete dialog (click on `.open-deleteWeldingProcess`): writes the row's `data-id` into `#bookIdDeleteWeldingProcess` (`deleteID`), and computes the secure code the same way with suffix `wpr` into `#bookIdDeleteWeldingProcessSecure` (`secureCode`).
- Validation: only the REQUIRED attribute on the weld process text field in the add and edit dialogs. No custom validation found in the capture.
- Fields shown or hidden on a condition: none found in the capture.
- Values computed in the browser: the secure code for edit and delete (see above).
- Requests that the shared script names (not tied to this page's controls in the capture): `/core/ajax/getListOfMaterials.php`, `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`.
- The add form submit has no handler in the captured lines (no action attribute, no page-specific script for `addWeldingProcess`).

## Sample data
- Row count: 11 (`total` 11, `shown` 11). Footer as displayed: "Showing 1 to 11 of 11 entries".
- Rows in the order drawn (default sort, ascending). Row id is the `data-id` of the pencil and trash icons.

| # | Weld process | Options (icons) | Row id (data-id) |
|---|---|---|---|
| 1 | 111 | pencil, trash | 10 |
| 2 | 135 | pencil, trash | 13 |
| 3 | 135-138 | pencil, trash | 14 |
| 4 | 138 | pencil, trash | 15 |
| 5 | 141 | pencil, trash | 12 |
| 6 | 141-111 | pencil, trash | 11 |
| 7 | 141-138 | pencil, trash | 17 |
| 8 | GTAW | pencil, trash | 18 |
| 9 | GTAW/SMAW | pencil, trash | 20 |
| 10 | SMAW | pencil, trash | 19 |
| 11 | TB | pencil, trash | 7 |

- Edit dialog example (row id 10): Weld process = "111", editID = "10".

## Not in the capture
- Edit dialog bodies for rows other than id 10 (open the pencil icon of a row, `#editWeldingProcess`, which loads its body by request).
- Result of the Add, Update or Delete submits (no submit was made).
- Export results of CSV, Excel and print (buttons seen, not pressed).
- Search and sort results (no search typed, no column header clicked).
- Length selector values (configured 5 / 20 / 50 / 100 / 500, but no selector element drawn in the capture).
- The delete dialog's values after a click on a row (the capture holds the dialog's DOM before a click only).
- From the browser-pass notes (`_interactive/I2a-welders-catalogs.md`, Part B): on this list the trash icons look pale on most rows and bright on a few. This is visual only; the markup is the same on every row. The browser pass did not open the delete dialog.
- Pagination controls (none drawn, the table has 11 rows on one page at length 20).
