# WeldPilot → Welding data → QA/QC engineers

Source: `weld__welding__qaqc-engineers.txt`, `weld__welding__qaqc-engineers__edit.txt` (the second is the Edit dialog opened for one row; the Edit dialog content comes from its XHR) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/test-engineers/`.
State of the page for the observing account: normal.

## Page
- Document title: "QA/QC engineers - WeldPilot®".
- Breadcrumb: not in the capture.
- Tabs: none in the capture.
- Panel heading: icon `fa fa-users`, text "QA/QC engineers", followed by an icon-only add button (see below).
- Top bar (every page): app switcher tiles "MTOPilot®" (`/mtopilot/`), "ESTPilot®" (`/estpilot/`), "WeldPilot®" (`/weldpilot/`), "TeamPilot®" (`/teampilot/`), "ToolPilot®" (`/toolpilot/`); language links "Nederlands", "English", "Deutsch", "Français" (each `index.php?lang=…&page=test-engineers`). The side/top menu entry "QA/QC engineers" links to `/weldpilot/test-engineers/`.
- Floating "Handheld" button (`title="Handheld"`) with three menu items: "Scan weld" (`data-action="weld-scan"`), "Scan flange QR label" (`data-action="flange-scan"`), "Add punch" (`data-action="punchlist"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"`). The capture does not show what the handlers open beyond these data attributes.

Buttons above the list:
- "Add QA/QC engineer" (top bar; class `buttonInsert btn btn-sm btn-primary btn-block`, icon `glyphicon glyphicon-plus`) → opens dialog `#addCompany` (`href="#addCompany" data-toggle="modal"`).
- Icon-only "+" button in the panel heading (`buttonInsert`, same `href="#addCompany"`, `data-toggle="modal"`) → opens `#addCompany`.
- Export and print buttons above the table: "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), print icon (`buttons-print`, `fa fa-print`). All three are `href="#"`; the capture shows no handler for them beyond the DataTables Buttons classes.
- Search box (see List).

## List
- Table: `#datatableWarehouse` (wrapper `#datatableWarehouse_wrapper`), classes `table table-striped table-bordered table-hover dataTable no-footer`.
- Columns in order:
  1. Name
  2. Company
  3. Phone
  4. Email address
  5. Stamp
  6. Enabled on this site
  7. Options
  8. Select-all checkbox (header cell is the checkbox markup `<input type="checkbox" id="checkAll">`; it has no text title)
- Hidden columns: none (all eight columns have `vis: true`).
- Default sort: column index 6 ("Options"), ascending (`order: [[6,"asc"]]`). All columns are sortable (`sort: true`).
- Page length: default 20. Length menu options: 5, 20, 50, 100, 500.
- Per-column search inputs: none in the capture.
- Filters: none in the capture.
- Global search: input `type="search"`, placeholder "Search", inside a label with a search icon (`fa fa-search`) and a clear button (`aria-label="Clear"`, `fa fa-times`). The search label text (`lang.search`) is empty.
- Row options (Options column), in order:
  1. Edit: `A` with classes `buttonEdit open-editCompany btn btn-xs btn-warning btn-block`, `href="#editCompany"`, `data-toggle="modal"`, `data-id` = the record id, icon `glyphicon glyphicon-pencil` → opens `#editCompany`.
  2. Delete: `A` with classes `buttonDelete open-deleteCompany btn btn-xs btn-danger btn-block`, `href="#deleteCompany"`, `data-toggle="modal"`, `data-id` = the record id, icon `glyphicon glyphicon-trash` → opens `#deleteCompany`.
  3. Row select checkbox (column 8): `name="ccid_<id>"`, `value="s<id>"`, class `checkbox11`.
- Bulk actions (Options menu): the capture shows no Options menu button on this page. The select-all checkbox (`#checkAll`) and the per-row checkboxes are present. The bulk dialogs `#optsActivate`, `#optsDeactivate` are in the page but no control on this page points to them in the capture (see the last section).
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 30 of 30 entries" (footer `dt-panelfooter`). DataTables language strings: info "Showing _START_ to _END_ of _TOTAL_ entries"; empty "No data available in table"; zero "No matching records found".
- Server-side request: none. `serverSide: false`, `ajax: null`; the 30 rows are in the page. The only request made on load is `/core/ajax/ajax-notifications.php?action=count_unread` (GET).
- Note: a first `TABLE` element without an id holds only the header row; its DataTables reader reports `TypeError: Cannot read properties of undefined (reading 'ajax')`. The body table is `#datatableWarehouse`.

## Dialogs

### Add QA/QC engineer (`#addCompany`) — opened by "Add QA/QC engineer" (top bar) and by the icon "+" button in the panel heading
Form: `method="post"` (no `action` attribute in the capture). No tabs.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | empty | none shown |
| 2 | Company | address | text | yes | empty | none shown |
| 3 | Phone | phone | text | no | empty | none shown |
| 4 | Email address | email | email | no | empty | none shown |
| 5 | Stamp | stamp | text | no | empty | none shown |
| 6 | Level | level | text | no | empty | none shown |
| 7 | Certificate 1 | cert1 | text | no | empty | none shown |
| 8 | Certificate 2 | cert2 | text | no | empty | none shown |
| 9 | Enable on this site (Zandbak) (checkbox, id `checkboxPSXcv1`, value `ok`) | site | checkbox | no | unchecked | none shown |

Hidden inputs: none. Selects: none.
Buttons: "Add" (`btn btn-primary btn-hideInsert`, `name="addTestEngineer"`, type submit); "Cancel" (`btn default`, `data-dismiss="modal"`); close icon button in the header (`data-dismiss="modal"`).
Text rules in the dialog: the Name and Company fields are marked required. No other rule text.

### Edit QA/QC engineer (`#editCompany`) — opened by the row "Edit" button (`buttonEdit`, `data-id` = record id)
Content is loaded by `GET /core/ajax/editCompany.php?id=<record id>&type=e&action=showroom` when the dialog opens. The capture shows it for record id 3; the field values below are that record's values (personal values not copied). Form: `method="post"`; the fields are inside `#contentCompanyEdit`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | record value (a person's name; not copied) | loaded per record |
| 2 | Company | address | text | yes | "Beograd, Karaburma" | loaded per record |
| 3 | Phone | phone | text | no | record value (present; not copied) | loaded per record |
| 4 | Email address | email | text | no | record value (present; not copied) | loaded per record. Type is text here, not email as in Add |
| 5 | Stamp | stamp | text | no | "QC001" | loaded per record |
| 6 | Level | level | text | no | "II" | loaded per record |
| 7 | Certificate 1 | cert1 | text | no | "15-505-VT2-00023-22-01" | loaded per record |
| 8 | Certificate 2 | cert2 | text | no | empty | loaded per record |
| 9 | Enable on this site (Zandbak) (checkbox, id `checkboxPSX1`, no label `for`; label text follows the input) | sites[] | checkbox | no | value "1", unchecked for record 3 | visible; checked state per record |
| 10 | (hidden block, `display:none`, label "Enable on this site") — checkbox "10420-2530 Ineos Project ONE" (id `checkboxPSX2`) | sites[] | checkbox | no | value "2", checked for record 3 | inside a hidden block; checked state per record |
| 11 | (same hidden block) — checkbox "IPO - Carry Over" (id `checkboxPSX10`) | sites[] | checkbox | no | value "10", checked for record 3 | inside a hidden block; checked state per record |
| 12 | (hidden input) | editID | hidden | — | value = record id (3 for the captured record) | set per record |

Selects: none. Hidden inputs: `editID` only (item 12).
Buttons: "Update" (`btn btn-warning btn-hideEdit`, `name="editTestEngineer"`, type submit); "Cancel" (`btn default`, `data-dismiss="modal"`); close icon button in the header.
Text rules: none in the dialog besides the required markers.

### Delete QA/QC engineer (`#deleteCompany`) — opened by the row "Delete" button (`buttonDelete`, `data-id` = record id)
Form: `method="post"`. Text: "Are you sure?".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | deleteID | hidden (id `bookIdEditCompany`) | — | no `value` attribute in the capture (empty in the captured DOM) | the capture does not show how the value is set |

Buttons: "Delete" (`btn btn-danger btn-hideDelete`, `name="deleteTestEngineer"`, type submit, icon `glyphicon glyphicon-trash`); "Cancel" (`btn default`, `data-dismiss="modal"`); close icon button in the header.

## Rules found in the page's JavaScript
- Page identifier: `var __wsappsDebugPage = "test-engineers";` (inline script, shared with the other pages). No rule.
- Button visibility on load: a top-level statement in the shared inline script (same code as `weld__start__dashboard`, line 5076 of that capture) sets `visibility: visible` for `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport`, `.buttonPrint` and `visibility: hidden` for `.btn-hideInsert`, `.btn-hideEdit`, `.btn-hideDelete`, `.btn-hideImport`, and `visibility: visible` for `.btn-hidePrint`. On this page the Add, Update and Delete submit buttons carry `btn-hideInsert`, `btn-hideEdit` and `btn-hideDelete`. The capture does not show when this statement runs.
- Requests made by the page's scripts (captured lines, all in the shared script; the capture does not show which of them this page triggers, except the editCompany request below):
  - `GET /core/ajax/editCompany.php?id=<id>&type=e` — loads the Edit dialog body. The XHR log shows the request with an additional `action=showroom` parameter (GET, status 200).
  - `GET /core/ajax/ajax-notifications.php?action=count_unread` — on page load (XHR log).
  - `searchProject.php?time=<n>` — project search (the capture does not show its trigger on this page).
  - `getListOfMaterials.php` (params `id`, `timer`, `ajax`) — `$.getJSON`; not tied to this page's controls in the capture.
  - `saveAddCalculationModalState.php` (params `k`, `v`, `timer`, `ajax`) — `$.getJSON`.
  - `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php` (params `id`, `timer`, `ajax`) — `$.getJSON`.
- Validations: none found in the capture for the dialogs of this page. The required markers are HTML attributes (`required`) on Name and Company in Add and Edit; the Email field in Add is `type="email"` (browser format check).
- Other scripts: none found in the capture.

## Sample data
- Records: 30 rows in total; 30 shown on the page (`total: 30`, `shown: 30`).
- "Enabled on this site": Yes = 1 row, No = 29 rows.
- Stamps filled: 2 rows (`QC001` and `00111`); the other 28 rows show "-".
- Phone and e-mail are not copied (shown as "given" or "-").

First 15 rows in the order displayed (Name replaced by "person A" … "person O"):

| # | Name | Company | Phone | Email address | Stamp | Enabled on this site | Options |
|---|---|---|---|---|---|---|---|
| 1 | person A | Montavar | - | - | - | No | edit, delete, select |
| 2 | person B | Montavar | - | - | - | No | edit, delete, select |
| 3 | person C | Montavar | - | - | - | No | edit, delete, select |
| 4 | person D | MONTAVAR | - | - | - | No | edit, delete, select |
| 5 | person E | Montavar Shop | - | - | - | No | edit, delete, select |
| 6 | person F | Project One Site, Lillo | - | - | - | No | edit, delete, select |
| 7 | person G | Site Lillo | - | - | - | No | edit, delete, select |
| 8 | person H | Site Lillo | - | - | - | No | edit, delete, select |
| 9 | person I | Montavar Shop | given | - | - | No | edit, delete, select |
| 10 | person J | address given (not copied) | given | - | - | No | edit, delete, select |
| 11 | person K | SIte Lillo | - | given | - | No | edit, delete, select |
| 12 | person L | Site Lillo | given | given | - | No | edit, delete, select |
| 13 | person M | SIte Lillo | given | given | - | No | edit, delete, select |
| 14 | person N | Project One Site, Lillo | given | given | - | No | edit, delete, select |
| 15 | person O | Montavar | - | given | - | No | edit, delete, select |

Rows 16–30 (same columns; not written out): the Stamp is filled only on row 29 (`QC001`, Company "Beograd, Karaburma") and row 30 (`00111`, Company given as a street address, not copied). Row 30 is the only row with "Yes" under "Enabled on this site".

## Not in the capture
- Rows 16–30 as individual rows, beyond the first 15 in this note (listed above only where noted). The capture contains all 30 body rows in the DOM; the DataTables pager (page length 20) and its controls are not in the capture.
- Edit dialog content for any record other than id 3. It is loaded per click by `editCompany.php?id=<record id>`.
- The value of the hidden `deleteID` in the Delete dialog after a click on a row (no value attribute in the capture).
- Results after submitting Add, Update or Delete (responses, success or error messages).
- Results of the Search, CSV, Excel and print buttons.
- Column search and filters: none exist in the capture.
- The DataTables pager markup (page buttons, page-length select).
- Behaviour of the select-all checkbox and any bulk action (none shown on this page).
- Also present in the page, opened from elsewhere or with no control of this page in the capture: editCompanyData, passwordChange, themeChange, admin (System settings, `#admin`, no opener in the capture), chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, docPersonnel ("Personel's certificates and files"), cardPersonnel and cardPersonnelEdit ("Welder card"), searchProject ("Project search").

Notes from the browser-pass notes (`reference/montavar/raw/_interactive/*.md`): none of them name this page, so nothing from them is used here.
