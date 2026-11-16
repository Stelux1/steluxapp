# MTO Pilot → Materials → Type of material

Source: `mto__materials__type-of-material.txt`, plus the dialog bodies that the page shares with WeldPilot: `weld__material__type-of-material.txt` (dialog shells `#editTypeMaterial`, `#deleteTypeMaterial`) and `weld__material__type-of-material__edit.txt` (the body loaded by the Edit click, one row) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/type-material/`.
State of the page for the observing account: normal.

## Page
- Browser title: "Type of material - MTOPilot®".
- Breadcrumb (top bar): "Type of material" (active crumb, no link).
- Tabs: none in the capture.
- Panel heading: list icon + "Type of material", followed by a blue "+" button (`#addTypeMaterial`, no text).
- Buttons above the list:
  - "Add type of material" (top bar, btn-primary, icon plus) → opens dialog `#addTypeMaterial`.
  - "+" button in the panel heading (no text) → opens dialog `#addTypeMaterial`.
  - "CSV" (`.buttons-csv`), "Excel" (`.buttons-excel`), print icon (`.buttons-print`, no text): export / print buttons, all `href="#"`; their handlers are not shown in the capture.
  - Search box: placeholder "Search", with a clear button (aria-label "Clear").

## List
- Table: `#datatableWarehouse`, client-side (serverSide false, `ajax` null). No server-side table request is made by this table.
- Columns in order: Type of material | Type of steel | Material description | Basic material | Material group | ISO / ASME | Options. All seven are visible and sortable in the DataTables config.
- Hidden columns: none.
- Default sort: column "ISO / ASME", ascending (DataTables order `[[5,"asc"]]`, zero-based index 5).
- Page length: default 20. Length options: 5, 20, 50, 100, 500. The capture shows no page-length selector element in the DOM.
- Per-column search inputs: none (only the global search box).
- Filters: none.
- Row options (Options column, in order):
  1. Pencil icon (glyphicon-pencil, btn-warning, btn-xs, no text) → `.open-editTypeMaterial`, `href="#editTypeMaterial"`, opens dialog "Edit type of material"; carries `data-id` = row id.
  2. Red trash icon (glyphicon-trash, btn-danger, btn-xs, no text) → `.open-deleteTypeMaterial`, `href="#deleteTypeMaterial"`, opens dialog "Delete type of material"; carries `data-id` = row id.
- Bulk actions (Options menu): none in the capture. No row checkboxes.
- Export / print buttons: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 131 of 131 entries" (DataTables info template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Filtered-empty text: "No matching records found".
- Server-side table request: none (table is client-side, `ajax` null).
- Other requests on page load: `/core/ajax/ajax-notifications.php?action=count_unread` (page-wide notification counter, not this table).
- Note on the DOM: a second table element without an id, with the same classes, holds only a header row (same seven titles). Its DataTables configuration read failed in the capture with "TypeError: Cannot read properties of undefined (reading 'ajax')". The visible list is the table with id `datatableWarehouse`.

## Dialogs

### Add type of material (`#addTypeMaterial`) — opened by "Add type of material" (top bar) and by the "+" in the panel heading
Form method post. Fields in document order (none has a default value; no field is hidden):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type of material | typeMaterial | text | yes | empty | — |
| 2 | Type of steel | typeSteel | text | yes | empty | — |
| 3 | Material description | description | text | no | empty | — |
| 4 | Basic material | basicMaterial | text | no | empty | — |
| 5 | Material group | materialGroup | text | no | empty | — |
| 6 | Lucefin group nr. | lucefinGroup | text | no | empty | Help text below this field (see the paragraph after the table) |
| 7 | ISO 15608 group | iso15608Group | select (select2, tags on, placeholder "Choose or type") | no (no REQUIRED flag) | nothing selected | 33 options, see below |
| 8 | ASME P-Number | asmePNumber | select (select2, tags on, placeholder "Choose or type") | no | nothing selected | 17 options, see below |
| 9 | ASME Group Number | asmeGroupNumber | select (select2, tags on, placeholder "Choose or type") | no | nothing selected | 6 options, see below |

- Hidden inputs: none in this dialog.
- Select options (value → text; none is marked as selected by default):
  - iso15608Group (33 options): empty → empty; 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 11.1 (each value → the same text).
  - asmePNumber (17 options): empty → empty; P-1, P-3, P-4, P-5A, P-5B, P-5C, P-6, P-7, P-8, P-9A, P-9B, P-10A, P-10H, P-10I, P-15E, P-34 (each value → the same text).
  - asmeGroupNumber (6 options): empty → empty; 1, 2, 3, 4, 5 (each value → the same text).
- Help text (paraphrased): under "Lucefin group nr.", a note states the field is optional and may be left empty, and that the user can pick a value or type one that is not in the list.
- Buttons: "Add" (btn-primary, type submit, name addTypeMaterial); "Cancel" (default, closes the dialog); header close button (×, no text, closes the dialog).
- Rules stated in the dialog: the note above only. Required markers: "Type of material" and "Type of steel".

### Edit type of material (`#editTypeMaterial`) — opened by the pencil icon of a row (`data-id` = row id)
Shell in the DOM: header "Edit type of material", a body container `#contentEditTypeMaterial` (filled on click), footer buttons. The body is loaded on click by `GET /core/ajax/editTypeMaterial.php?id=<row id>&action=showroom`. The capture of this page contains no click, so the body for a MTO row is not shown; the body shape below is taken from the WeldPilot capture (`weld__material__type-of-material__edit.txt`, row id 22, status 200, len 4411), and the MTO page shares the same dialog (SAME-AS).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type of material | typeMaterial | text | yes | the row's value (WeldPilot example: "A420 WPL6") | — |
| 2 | Type of steel | typeSteel | text | yes | the row's value (example: "CS") | — |
| 3 | Material description | description | text | no | the row's value (example: "Fitting") | — |
| 4 | Basic material | basicMaterial | text | no | the row's value (example: "CS") | — |
| 5 | Material group | materialGroup | text | no | the row's value (example: "1") | — |
| 6 | Lucefin group nr. | lucefinGroup | text | no | empty (example) | Same help text as in Add |
| 7 | ISO 15608 group | iso15608Group | select (select2, tags on) | no | empty in the WeldPilot example | Same 33 options as Add |
| 8 | ASME P-Number | asmePNumber | select (select2, tags on) | no | empty in the example | Same 17 options as Add |
| 9 | ASME Group Number | asmeGroupNumber | select (select2, tags on) | no | empty in the example | Same 6 options as Add |
| 10 | (hidden) | editID | hidden | — | row id (example: 22) | Set from the row on click |

- Buttons: "Update" (btn-warning, class btn-hideEdit, type submit, name editTypeMaterial); "Cancel" (default, closes the dialog). The capture does not say whether Update was visible on screen for this dialog.
- Rules stated in the dialog: the same help text as in Add.

### Delete type of material (`#deleteTypeMaterial`) — opened by the red trash icon of a row
- Body: the text "Are you sure?" and one hidden input.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, id bookIdDeleteTypeMaterial) | deleteID | hidden | — | row id (set on click; no value in the capture) | — |

- Buttons: "Delete" (btn-danger, class btn-hideDelete, type submit, name deleteTypeMaterial, trash icon); "Cancel" (default, closes the dialog).
- Rules stated in the dialog: none beyond the confirmation question "Are you sure?".

## Rules found in the page's JavaScript
- Select2 initialisation for the dialogs: a jQuery handler bound to `shown.bs.modal` for `#addWps, #addTypeMaterial, #editTypeMaterial, #editWps` calls `__wsappsInitSelect2Element` on every `select.wsapps-group-select` inside the dialog (shared script in `weld__start__dashboard.txt`, the handler at about line 5461; the MTO page's copy of the script is the same code, captured as SAME-AS). This is the only script that touches these dialogs in the captures. The three selects (ISO 15608 group, ASME P-Number, ASME Group Number) are the ones with the class `wsapps-group-select`.
- Tags on the three selects: the attribute `data-tags="1"` (with placeholder "Choose or type") lets the user type a value that is not in the list; the capture does not show the code that stores typed values.
- Required fields: the browser-side REQUIRED attribute on Type of material and Type of steel only. No custom validation rule or message for these fields was found in the captures.
- Table: the DataTables configuration is inline in the page (client-side table, default order by ISO / ASME ascending, page length 20). No script in the captures adds a filter or a render function for this table.
- Requests the page makes in the captures:
  - On load: `/core/ajax/ajax-notifications.php?action=count_unread` (GET, notification counter).
  - On Edit click (WeldPilot capture, same dialog): `GET /core/ajax/editTypeMaterial.php?id=<id>&action=showroom`; response is the dialog body HTML.
  - Add, Update and Delete submissions: the captures contain no request for them (no submit was made). The submit button names are addTypeMaterial, editTypeMaterial and deleteTypeMaterial.
- None found in the capture beyond the above.

## Sample data
- Row count: 131 total; the DataTables footer reads "Showing 1 to 131 of 131 entries". The capture wrote 40 body rows; the rest are shown as "(+91 more rows of 131)".
- In the 40 drawn rows, Material description, Basic material, Material group and ISO / ASME show "-" in every row. Type of steel is "CS" in 37 rows and "SS" in 3 rows (1.4401/1.4404, 316, A182 F304/304L BW). The capture shows "-" in these cells; it does not say whether the cells are empty.
- First 15 rows as displayed (Type of material | Type of steel | Material description | Basic material | Material group | ISO / ASME | row data-id):

| Type of material | Type of steel | Material description | Basic material | Material group | ISO / ASME | data-id |
|---|---|---|---|---|---|---|
| A105N | CS | - | - | - | - | 105 |
| A106-B | CS | - | - | - | - | 66 |
| A182-F11 | CS | - | - | - | - | 89 |
| A193 B7/2H | CS | - | - | - | - | 114 |
| A216-WCB | CS | - | - | - | - | 85 |
| A216-WCC | CS | - | - | - | - | 87 |
| A217-C12A | CS | - | - | - | - | 72 |
| A217-WC6 | CS | - | - | - | - | 96 |
| A234 -WPBW | CS | - | - | - | - | 73 |
| A234-WP11 | CS | - | - | - | - | 93 |
| A234-WP91 | CS | - | - | - | - | 70 |
| A234-WPB | CS | - | - | - | - | 67 |
| A333-6 | CS | - | - | - | - | 78 |
| A335-P11 | CS | - | - | - | - | 88 |
| A335-P91 | CS | - | - | - | - | 68 |

- The capture draws 40 rows; the 40th drawn row is A182 F304/304L BW (SS, data-id 119). Rows 41 to 131 are not in the capture.

## Not in the capture
- Rows 41 to 131 of the list (the capture draws 40; "+91 more rows of 131"). Reached by paging (page length 20 by default) or by the search box.
- The page-length selector: the DOM shows no length control, so the length options are known only from the DataTables configuration.
- Edit dialog body for a MTO row: loaded only after clicking a pencil icon (`GET editTypeMaterial.php?id=<row id>&action=showroom`). The field shape and sample values in this note come from the WeldPilot capture of the same dialog.
- Delete dialog's hidden deleteID value for a MTO row: set on click; the capture shows none.
- Results of Add, Update and Delete (submissions and their responses): not made, not captured.
- Export results (CSV, Excel, print): not triggered.
- From the browser-pass notes (`reference/montavar/raw/_interactive/*.md`): no note on this page was found, so nothing else is added.
- Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, searchProject, srArchiveScanModal, materialQrScanModal.
