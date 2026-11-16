# WeldPilot → Welder data → Customs

Source: `weld__welder__customs.txt`, `weld__welder__customs__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/customs/`.
State of the page for the observing account: normal.

## Page
- Title: "Customs - WeldPilot®". Panel title: "Customs".
- Breadcrumb: a single active crumb "Customs" (link `index.php?page=customs`). Under WeldPilot → Welder data → Customs.
- Tabs: none on this page.
- Buttons above the list:
  - "Add Custom" (top bar, next to the breadcrumb; `href="#addCustom"`, `data-toggle="modal"`) → opens dialog `#addCustom`.
  - "+" icon button with no text in the panel heading (`href="#addCustom"`, `data-toggle="modal"`, glyphicon plus) → opens dialog `#addCustom`. Same action as the top-bar button.
- Export and print buttons above the table (DataTables buttons): "CSV" (`href="#"`), "Excel" (`href="#"`), print icon (`href="#"`). No handler for these is in the captured lines; they were not clicked.
- Chrome present on every page and not described here: top app tiles (MTOPilot, ESTPilot, WeldPilot, TeamPilot, ToolPilot), language links, and the floating handheld menu (Scan weld, Scan flange QR label, Add punch).

## List
- Table id `#datatableWarehouse`, class `table table-striped table-bordered table-hover dataTable no-footer`.
- Columns in order (DT config and header row, identical):
  1. Name (`d` 0, visible, sortable)
  2. Abbreviation (`d` 1, visible, sortable)
  3. Options (`d` 2, visible, sortable in config; header text "Options"; cell holds the row icons)
- Hidden columns: none.
- Default sort: column index 1 (Abbreviation), ascending (`order: [[1,"asc"]]`).
- Page length: DT config `pageLength` 20 with `lengthMenu` 5 / 20 / 50 / 100 / 500. No length selector is present in the captured DOM, and the table shows all 52 rows (`total` 52, `shown` 52). The browser-pass notes also record "none (52 rows, no paging)".
- Per-column search inputs: none.
- Global search: a text box (type "search", placeholder "Search") with a clear button (aria-label "Clear", × icon) in the table's filter block.
- Filters: none in the capture.
- Row options, left to right (from the Options cell):
  1. Pencil icon (`.buttonEdit.open-editCustom`, class `btn-warning`, `href="#editCustom"`, `data-toggle="modal"`, `data-id` = row id) → opens dialog `#editCustom`, loads its body (see Dialogs).
  2. Red trash icon (`.buttonDelete.open-deleteCustom`, class `btn-danger`, `href="#deleteCustom"`, `data-toggle="modal"`, `data-id` = row id) → opens dialog `#deleteCustom`.
- Bulk actions (Options menu): none in the capture.
- Export / print: see Page.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (config); the rendered footer reads "Showing 1 to 52 of 52 entries".
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Server-side table request: none. `serverSide` is false and `ajax` is null; the rows are drawn from the page itself.

## Dialogs

### Add Custom (`#addCustom`) — opened by "Add Custom" (top bar) and the "+" icon button in the panel heading
Form `method="post"`, no action attribute in the capture. Body is in the page (not loaded on click).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text (maxlength 256) | yes | (empty) | none |
| 2 | Abbreviation | abbreviation | text (maxlength 256) | yes | (empty) | none |
| 3 | Diameter from | diameterFrom | text, pattern `^[0-9\\.]*$` | no | 0.00 | none |
| 4 | Diameter to | diameterTo | text, pattern `^[0-9\\.]*$` | no | 0.00 | none |
| 5 | Wall thickness from | wtFrom | text, pattern `^[0-9\\.]*$` | no | 0.00 | none |
| 6 | Wall thickness to | wtTo | text, pattern `^[0-9\\.]*$` | no | 0.00 | none |
| H | (hidden) | type | hidden | — | 1 | fixed value |

The pattern is written in the capture as `^[0-9\\.]*$`; it is shown as the page carries it.

Buttons (footer): "Add" (type submit, `name="addCustom"`, classes `btn btn-primary btn-hideInsert`); "Cancel" (`btn default`, dismisses the dialog).
Text rule in the dialog: none (no help text). Name and Abbreviation are marked required in the markup; the three numeric-style fields allow only digits and dots by pattern.

### Edit custom (`#editCustom`) — opened by the pencil icon on a row (`.open-editCustom`, `data-id`)
The dialog shell in the page has the header "Edit custom" and the footer buttons, with an empty body container `#contentEditCustom`. The body is loaded when the pencil is clicked: `GET /core/ajax/editCustom.php?id=<row id>&action=showroom`, and its HTML is put into `#contentEditCustom`. The values below are from that response for row id 25 (the captured example).
Form `method="post"`.

| # | Label | name | Type | Required | Default (row 25) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text (maxlength 256) | yes | 111-B\|FM1-FM2\|ISO9606-1 | filled from the row |
| 2 | Abbreviation | abbreviation | text (maxlength 256) | yes | 111-B\|FM1-FM2\|ISO9606-1 | filled from the row |
| 3 | Diameter from | diameterFrom | text, pattern `^[0-9\\.]*$` | no | 30.00 | filled from the row |
| 4 | Diameter to | diameterTo | text, pattern `^[0-9\\.]*$` | no | 99999.00 | filled from the row |
| 5 | Wall thickness from | wtFrom | text, pattern `^[0-9\\.]*$` | no | 3.00 | filled from the row |
| 6 | Wall thickness to | wtTo | text, pattern `^[0-9\\.]*$` | no | 9999.00 | filled from the row |
| H | (hidden) | editID | hidden | — | 25 | the row id |

Buttons (footer): "Update" (type submit, `name="editCustom"`, classes `btn btn-warning btn-hideEdit`); "Cancel" (`btn default`, dismisses).
Text rule: none.

### Delete custom (`#deleteCustom`) — opened by the trash icon on a row (`.open-deleteCustom`, `data-id`)
Body: the text "Are you sure?" and a form `method="post"` with one hidden field. The page's script sets the hidden field's value to the clicked row's id when the trash icon is clicked (see Rules). No request is made on open.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| H | (hidden, id `bookIdDeleteCustom`) | deleteID | hidden | — | (empty in the markup; set to the row id on click) | set by the page's script |

Buttons (footer): "Delete" (type submit, `name="deleteCustom"`, classes `btn btn-danger btn-hideDelete`, trash icon); "Cancel" (`btn default`, dismisses).
Text rule: the dialog asks "Are you sure?" before the delete button. The markup has no separate confirm step.

## Rules found in the page's JavaScript
Only the lines of the shared inline script that are new in this capture contain this page's handlers (the rest of the script is shown as "already captured on earlier pages" and is not repeated here).
- Edit open: on click of `.open-editCustom`, the page takes the row id into a variable (`myBookId`; its assignment is in an earlier part of the script that this capture does not repeat), requests `/core/ajax/editCustom.php?id=` + that id, and puts the response HTML into `#contentEditCustom`.
- Delete open: on click of `.open-deleteCustom`, the page sets the value of `.modal-body #bookIdDeleteCustom` to `myBookId`.
- Add, edit and delete form submissions: no handler, validation or message for `addCustom`, `editCustom` or `deleteCustom` is in the captured lines. The browser-side checks come only from the HTML attributes listed above (`required`, `maxlength`, `pattern`).
- The classes `btn-hideInsert`, `btn-hideEdit` and `btn-hideDelete` appear on the submit buttons; their handler is not in the captured lines.
- Other handlers in the same script (project search, unit rates, tariffs, factors, material list, calculation modal state) belong to other screens and dialogs; they are not used by this page.
- Requests made by the page: `/core/ajax/ajax-notifications.php?action=count_unread` on load (the page's own periodic check); `/core/ajax/editCustom.php?id=<id>&action=showroom` on pencil click.

## Sample data
- Row count: 52 (`total` 52, `shown` 52). Footer: "Showing 1 to 52 of 52 entries".
- The capture draws 40 body rows and says "(+12 more rows of 52)". Rows 41–52 are not in the capture.
- Columns of the sample: Name | Abbreviation | Options (Edit / Delete icons with the row id).

| # | Name | Abbreviation | Options (row id) |
|---|---|---|---|
| 1 | 111-B\|FM1-FM2\|ISO9606-1 | 111-B\|FM1-FM2\|ISO9606-1 | Edit / Delete (25) |
| 2 | 111-B\|FM1-FM2\|ISO9606-1/NEN3650 | 111-B\|FM1-FM2\|ISO9606-1/NEN3650 | Edit / Delete (10) |
| 3 | 111-B\|FM3\|ISO9606-1 | 111-B\|FM3\|ISO9606-1 | Edit / Delete (26) |
| 4 | 111-B\|FM5\|ISO9606-1 | 111-B\|FM5\|ISO9606-1 | Edit / Delete (27) |
| 5 | 111-C\|FM1-FM2\|ISO9606-1/NEN3650 | 111-C\|FM1-FM2\|ISO9606-1/NEN3650 | Edit / Delete (12) |
| 6 | 121\|FM1-FM2\|ISO14732 | 121\|FM1-FM2\|ISO14732 | Edit / Delete (33) |
| 7 | 121\|FM3\|ISO14732 | 121\|FM3\|ISO14732 | Edit / Delete (34) |
| 8 | 135-STT/136\|FM1-FM2\|ISO9606-1 | 135-STT/136\|FM1-FM2\|ISO9606-1 | Edit / Delete (21) |
| 9 | 135-STT\|FM1-FM2\|ISO9606-1 | 135-STT\|FM1-FM2\|ISO9606-1-1 | Edit / Delete (20) |
| 10 | 135/136\|FM1-FM2\|ISO9606-1 | 135/136\|FM1-FM2\|ISO9606-1 | Edit / Delete (42) |
| 11 | 135/136\|FM1-FM2\|ISO9606-1/NEN3650 | 135/136\|FM1-FM2\|ISO9606-1/NEN3650 | Edit / Delete (44) |
| 12 | 135/136\|FM3\|ISO9606-1 | 135/136\|FM3\|ISO9606-1 | Edit / Delete (43) |
| 13 | 135/138\|FM1-FM2\|ISO9606-1 | 135/138\|FM1-FM2\|ISO9606-1 | Edit / Delete (48) |
| 14 | 135/138\|FM3\|ISO9606-1 | 135/138\|FM3\|ISO9606-1 | Edit / Delete (49) |
| 15 | 135/138\|FM5\|ISO9606-1 | 135/138\|FM5\|ISO9606-1 | Edit / Delete (50) |

Further rows in the 40 drawn (not in the table above), in order: 141/111|FM1-FM2|ISO9606-1/NEN3650 (29); 141/111|FM5|ISO9606-1 (30); 141|FM1-FM2|ISO9606-1 (7); 141|FM1-FM2|ISO9606-1/NEN3650 (8); 141|FM3|ISO9606-1 (23); 141|FM3|ISO9606-1/NEN3650 (22); 141|FM4|ISO9606-1 (18); 141|FM5|ISO9606-1 (14); 141|FM6|ISO9606-1 (16); 141|FM6|ISO9606-4 (55); CrMo|GTAW|Ø=All T=<7.4| / CrMo|GTAW (4); CS|GTAW|Ø=All T=<11| / CS|GTAW (2); GMAW-STT/FCAW|FM1-FM2|ASME (45); GMAW-STT/FCAW|FM3|ASME (46); GMAW-STT/FCAW|FM5|ASME (47); GMAW-STT/GTAW|FM1-FM2|ASME (53); GMAW-STT/GTAW|FM5|ASME (54); GMAW-STT|FM1-FM2|ASME (38); GMAW-STT|FM3|ASME (39); GMAW-STT|FM5|ASME (40); GTAW/SMAW|FM1-FM2|ASME (32); GTAW/SMAW|FM5|ASME (31). Each row has the same text in Name and Abbreviation except where shown in the table above.

Example values of the Edit dialog for row 25 (see Dialogs): Diameter from 30.00, Diameter to 99999.00, Wall thickness from 3.00, Wall thickness to 9999.00.

## Not in the capture
- Rows 41–52 of the list (the page draws 40; "+12 more rows of 52").
- The body of `#editCustom` for any row other than id 25 (loaded per row on the pencil click; only id 25 was captured as a click).
- Results of the Add, Update and Delete submissions: the form action and any response are not in the capture; no submit was made.
- Output of the CSV, Excel and print buttons (their `href` is "#"; not clicked).
- A length selector (5 / 20 / 50 / 100 / 500): the config lists it, but it is not drawn in the captured DOM.
- The handler that sets `myBookId` (an earlier part of the shared script, not repeated in this capture).
- From the browser-pass notes (`_interactive/I2a-welders-catalogs.md`): the notes record the same two row options (Edit, Delete) and that the table has no paging. The notes also record that the names of the Customs appear as qualification names in the welder documents dialog of the Welder data welder page (another screen; not described here).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, searchProject.
