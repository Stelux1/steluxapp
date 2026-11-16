# WeldPilot → Weld data → PQR

Source: `weld__welddata__pqr.txt`, `weld__welddata__pqr-import.txt` (linked page "Import PQR", described below) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/pqr/`.
State of the page for the observing account: normal.

## Page
Title: `- WeldPilot®` (browser title). Breadcrumb in the top bar: `PQR` (link `/weldpilot/index.php?page=pqr`). The panel has no heading text. Tabs: none on this page.

Buttons above the list (in DOM order):
- `Delete selected` (`#deletePqr`, btn-dark btn-sm, trash icon) → opens `#deletePqrModal` (`href="#deletePqrModal"`, `data-toggle="modal"`). Hidden on load; shown only while at least one row is selected (see Rules).
- `Add` (btn-dark btn-sm, plus icon) → opens `#addPqr` (`href="#addPqr"`, `data-toggle="modal"`).
- `Import PQR` (btn-dark btn-sm, upload icon, class `buttonImport`) → navigates to `/weldpilot/index.php?page=pqr-import` (no dialog).

Export buttons above the list (DataTables Buttons, all `href="#"`, class `buttonPrint`): three buttons, classes `buttons-csv`, `buttons-excel`, `buttons-print`. Only the print button has an icon in the capture (`fa fa-print`); the csv and excel buttons have no text or icon in the capture. The browser-pass notes name only "print (dt-buttons)" for this page. Export is configured on columns index 2 and up (see Rules).

### Linked page: Import PQR (`/weldpilot/index.php?page=pqr-import`, from `weld__welddata__pqr-import.txt`)
Breadcrumb: `PQR` (link `/weldpilot/pqr/`) › `Import PQR`. Panel heading: `1 Import PQR`.
- Help panel (paraphrased): steps 1 to 4: download the Excel template (row 1 is the header and the columns match Add PQR); enter one PQR per row from row 2, PQR is required; Valid until accepts day-month-year or year-month-day written with dashes; upload the file and check the preview, where rows with errors are marked red and an existing PQR number is marked update; a row can be set to skip; Import saves new PQRs and updates existing ones, and the PDF on an existing record stays as it is.
- Form `#pqrImportForm` (multipart/form-data):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Excel file * | file | file | yes (REQUIRED) | none | accept `.xlsx` |
- Buttons: `Upload` (`#pqrImportUploadBtn`, btn-primary, submit, upload icon); `Import` (`#pqrImportCommitBtn`, btn-success, check icon, hidden on load); `Cancel` (btn-default, link `/weldpilot/pqr/`).
- Templates well: text `Templates:`, link `Download Excel template` (`/core/export/templates/pqr_import_template_xlsx.php`, btn-xs btn-default, download icon).
- Hidden on load: status alert `#pqrImportStatus` (alert-warning), summary alert `#pqrImportSummary` (alert-info), preview table `#pqrImportTable`.
- Preview table columns (header text): `#`, `Action`, `PQR`, `Material`, `Welding Process EN`, `Position`, `Valid until`, `Errors`. The Action cell is a select with options `import`, `update`, `skip`; it is disabled for rows with an error.
- Summary format written by the script: `Rows: <n> | Errors: <n> | Import: <n> | Update: <n>`.
- Messages in the script (copied exactly): `%d PQR imported, %d updated.`; `%d rows skipped because PQR was empty.`; confirm `Importeer de geldige rijen?`; status `Excel-bestand wordt gecontroleerd...`; success `<n> rijen klaar voor controle.`; errors `Upload mislukt.`, `Preview kon niet worden geladen.`, `Rij kon niet worden gewijzigd.`, `Import mislukt.`.
- Endpoints (base `https://montavar.websonik.nl/core/ajax/pqrImport/`, header `X-Requested-With: XMLHttpRequest`): `upload.php` (sends the form data), `list.php` (parameter `batchId`), `toggleRow.php` (parameters `rowId`, `action`), `commit.php` (parameter `batchId`). The HTTP method is not shown in the lines this capture contains.
- No dialogs opened from this page (only the shared ones, listed at the end).

## List
Table `#datatableDashboardList2` (DataTables, role grid).

Columns in order (`DT` line; 29 columns, all visible, all sortable). Index: title:
0. `&nbsp;` (no text; the row selection column, per the script's `input` handler)
1. `&nbsp;`
2. Material EN15608
3. PQR
4. Insp Authority No.
5. Report No.
6. Material
7. Filler Material
8. Pipe/ Plate
9. t
10. Position
11. Welding Process ASME
12. Welding Process EN
13. Weld Groove Type
14. Shielding Gas
15. Mat. gr.
16. Ø
17. T
18. Mat. gr.
19. Ø
20. T
21. Preheat (°C)
22. Annealing (°C/1h)
23. Impact Test
24. Hardness Test
25. Macro
26. Standard
27. Comments
28. Valid until

Header text as written in the capture (THEAD): `Certificate No. Scope ENScope ASME Material EN15608PQRInsp Authority No.Report No.Material…`. The capture does not show which header cell carries "Certificate No.", "Scope EN" or "Scope ASME": the DataTables configuration has only 29 columns, the first two titled `&nbsp;`. Those three words appear before `Material EN15608` in the header text and no column configuration matches them.

Hidden columns: none. Default sort: column 27 (`Comments`), ascending. Server-side: no (`serverSide: false`, `ajax: null`); the table is filled from the rows the server draws in the page.

Page length options: `10`, `20`, `50`, `100`, `500`; default `100` (`Show` [select] `entries`).

Per-column search: a second header row with 29 text inputs, class `cc0` … `cc28`, placeholder `Search...`, one per column in the order above.

Global search: `Search` (type search, placeholder `Search`, with a Clear button, aria-label `Clear`).

Filters: none beyond the search boxes.

Row options: none shown (the list has no rows in the sandbox). Row-level controls named by the script: a row checkbox (selection) and an edit control with class `open-editPqr` (opens `#editPqr`). Neither is drawn in the capture.

Bulk actions: `Delete selected` (see Page). The Options menu is not in the capture.

Export / print: CSV, Excel and print buttons (see Page).

Info and empty texts:
- Info: `Showing 0 to 0 of 0 entries`.
- Empty: `No data available in table` (single row, colspan 29).
- Zero matches (DataTables setting, not drawn): `No matching records found`.

Server-side table request: none (client-side table).

## Dialogs

### Add (`#addPqr`) — opened by `Add` (top button, `href="#addPqr"`, `data-toggle="modal"`)
Title: `Add`. Form `method="post" enctype="multipart/form-data"`, no action attribute in the capture.

Each of the 26 "stored value" fields is a pair: a select `pqr_N` and a text input `pqrText_N` (text input hidden on load). The pairs are the same for all 26; only the label changes.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material EN15608 | pqr_1 | select (select2-single) | no | `---` (no option marked default) | opts: `0` → `---`; `x` → `Add new...`. Choosing `x` shows text input 1 (see Rules). |
| 2 | (text for Material EN15608) | pqrText_1 | text | no | empty | placeholder `Type here...`; hidden on load; shown when select 1 is `x` |
| 3 | PQR | pqr_2 | select | no | `---` | same options as 1 |
| 4 | (text for PQR) | pqrText_2 | text | no | empty | placeholder `Type here...`; hidden on load |
| 5 | Insp Authority No. | pqr_3 | select | no | `---` | same options as 1 |
| 6 | (text for Insp Authority No.) | pqrText_3 | text | no | empty | placeholder `Type here...`; hidden on load |
| 7 | Report No. | pqr_4 | select | no | `---` | same options as 1 |
| 8 | (text for Report No.) | pqrText_4 | text | no | empty | placeholder `Type here...`; hidden on load |
| 9 | Material | pqr_5 | select | no | `---` | same options as 1 |
| 10 | (text for Material) | pqrText_5 | text | no | empty | placeholder `Type here...`; hidden on load |
| 11 | Filler Material | pqr_6 | select | no | `---` | same options as 1 |
| 12 | (text for Filler Material) | pqrText_6 | text | no | empty | placeholder `Type here...`; hidden on load |
| 13 | Pipe/ Plate | pqr_7 | select | no | `---` | same options as 1 |
| 14 | (text for Pipe/ Plate) | pqrText_7 | text | no | empty | placeholder `Type here...`; hidden on load |
| 15 | t | pqr_8 | select | no | `---` | same options as 1 |
| 16 | (text for t) | pqrText_8 | text | no | empty | placeholder `Type here...`; hidden on load |
| 17 | Position | pqr_9 | select | no | `---` | same options as 1 |
| 18 | (text for Position) | pqrText_9 | text | no | empty | placeholder `Type here...`; hidden on load |
| 19 | Welding Process ASME | pqr_10 | select | no | `---` | same options as 1 |
| 20 | (text for Welding Process ASME) | pqrText_10 | text | no | empty | placeholder `Type here...`; hidden on load |
| 21 | Welding Process EN | pqr_11 | select | no | `---` | same options as 1 |
| 22 | (text for Welding Process EN) | pqrText_11 | text | no | empty | placeholder `Type here...`; hidden on load |
| 23 | Weld Groove Type | pqr_12 | select | no | `---` | same options as 1 |
| 24 | (text for Weld Groove Type) | pqrText_12 | text | no | empty | placeholder `Type here...`; hidden on load |
| 25 | Shielding Gas | pqr_13 | select | no | `---` | same options as 1 |
| 26 | (text for Shielding Gas) | pqrText_13 | text | no | empty | placeholder `Type here...`; hidden on load |
| 27 | Mat. gr. | pqr_14 | select | no | `---` | same options as 1 |
| 28 | (text for Mat. gr.) | pqrText_14 | text | no | empty | placeholder `Type here...`; hidden on load |
| 29 | EN Ø | pqr_15 | select | no | `---` | same options as 1 |
| 30 | (text for EN Ø) | pqrText_15 | text | no | empty | placeholder `Type here...`; hidden on load |
| 31 | EN T | pqr_16 | select | no | `---` | same options as 1 |
| 32 | (text for EN T) | pqrText_16 | text | no | empty | placeholder `Type here...`; hidden on load |
| 33 | ASME IX Mat.gr | pqr_17 | select | no | `---` | same options as 1 |
| 34 | (text for ASME IX Mat.gr) | pqrText_17 | text | no | empty | placeholder `Type here...`; hidden on load |
| 35 | ASME IX Ø | pqr_18 | select | no | `---` | same options as 1 |
| 36 | (text for ASME IX Ø) | pqrText_18 | text | no | empty | placeholder `Type here...`; hidden on load |
| 37 | ASME IX T | pqr_19 | select | no | `---` | same options as 1 |
| 38 | (text for ASME IX T) | pqrText_19 | text | no | empty | placeholder `Type here...`; hidden on load |
| 39 | Preheat (°C) | pqr_20 | select | no | `---` | same options as 1 |
| 40 | (text for Preheat (°C)) | pqrText_20 | text | no | empty | placeholder `Type here...`; hidden on load |
| 41 | Annealing (°C/1h) | pqr_21 | select | no | `---` | same options as 1 |
| 42 | (text for Annealing (°C/1h)) | pqrText_21 | text | no | empty | placeholder `Type here...`; hidden on load |
| 43 | Impact Test | pqr_22 | select | no | `---` | same options as 1 |
| 44 | (text for Impact Test) | pqrText_22 | text | no | empty | placeholder `Type here...`; hidden on load |
| 45 | Hardness Test | pqr_23 | select | no | `---` | same options as 1 |
| 46 | (text for Hardness Test) | pqrText_23 | text | no | empty | placeholder `Type here...`; hidden on load |
| 47 | Macro | pqr_24 | select | no | `---` | same options as 1 |
| 48 | (text for Macro) | pqrText_24 | text | no | empty | placeholder `Type here...`; hidden on load |
| 49 | Standard | pqr_25 | select | no | `---` | same options as 1 |
| 50 | (text for Standard) | pqrText_25 | text | no | empty | placeholder `Type here...`; hidden on load |
| 51 | Comments | pqr_26 | select | no | `---` | same options as 1 |
| 52 | (text for Comments) | pqrText_26 | text | no | empty | placeholder `Type here...`; hidden on load |
| 53 | Valid until | valid_until (id `pqrValidUntilAdd`) | date | no | empty | date input |
| 54 | File | file (class `gui-file`) | file | no | none | `Choose file` button (span, btn-dark). No accept attribute. Its onchange copies the chosen file name into the field in row 55. |
| 55 | File (display) | none (id `uploader2kolikos`) | text (gui-input) | no | empty | placeholder `Nothing selected`; no name attribute; shows the selected file name |

Notes on the table: rows 1 to 52 are 26 select and 26 text inputs. The sandbox has no stored values, so each select has only `0` → `---` and `x` → `Add new...`. None of the selects marks an option as default; the capture shows the displayed value as `---`. No input in this dialog has a REQUIRED flag, and no hidden inputs are in the form.

Buttons: `Add` (btn-success, name `addPqr`, type submit); `Cancel` (btn-default, data-dismiss modal).
Rule text in the dialog: none.

### Delete selected PQRs (`#deletePqrModal`) — opened by `Delete selected` (`href="#deletePqrModal"`, `data-toggle="modal"`)
Title: `Delete selected PQRs`. Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | name | hidden | READONLY | no value in the capture | no id in the capture |
| 2 | (text "Are you sure?" precedes it) | selectedIDS (id `t2lager`) | hidden | READONLY | set by script | value = the selected row values joined by commas (see Rules); the script also writes `#sids`, which is not in this page's DOM |
| 3 | (none) | fileid | hidden | no | no value in the capture | none |

Text: `Are you sure?`.
Buttons: `Delete` (btn-danger, name `deletePqr`, type submit, trash icon); `Cancel` (btn-default, data-dismiss modal).
Rule text: `Are you sure?` only.

### PQR edit (`#editPqr`, title `Edit PQR`) — opened by the row edit control (class `open-editPqr`)
No row exists in the sandbox, so no control was seen. The body is not in the capture: the script loads it into `#contentEditPqr` (see Rules). Footer: `Update` (btn-warning btn-hideEdit, name `editPqr`, type submit); `Cancel` (btn-default, data-dismiss modal). Input list: not in the capture.

## Rules found in the page's JavaScript
Sources: this page's inline script `q15bvvx7rlz` (new lines in this capture) and the shared script whose full text is in `weld__start__dashboard.txt`.

1. Selection and delete button: on load, `#deletePqr` is hidden. `updateTextArea()` collects the value of every checked input inside `#datatableDashboardList2`, writes the array into `#t2lager` (selectedIDS) and `#sids`, shows `#deletePqr` when at least one value is collected and hides it otherwise. It runs on each click of an input in the list.
2. Init on load: `__wsappsDebugPage = "pqr"`; `__wsappsInitPqrFields($('#addPqr'))` runs for the Add dialog. The function is defined in the shared script (`weld__start__dashboard.txt`); it is also run on the edit dialog after its body is loaded.
3. Stored-value fields (for each N from 1 to 26), from `__wsappsInitPqrFields`:
   - On load, `pqrText_N` and `pqrBack_N` are hidden.
   - Change of `pqr_N`: if the value is `x` (`Add new...`), `pqrText_N` and `pqrBack_N` are shown, and the select and its select2 container are hidden. Any other value hides `pqrText_N` and `pqrBack_N`, shows the select, and re-applies select2 if not yet applied.
   - Click on `pqrBack_N` (undo icon): hides `pqrText_N`, sets `pqr_N` to `0`, shows the select, hides `pqrBack_N`.
   - Click on `pqrDelete_N` (trash icon): if the selected value is empty, `0` or `x`, nothing happens. Otherwise it asks `Deze waarde verwijderen uit de dropdown?` (copied exactly). On confirm it sends a POST to `/core/ajax/deletePqrOption.php` with `dim` (the number taken from the field's suffix) and `id` (the selected value). On success it removes that option, sets the select to `0`, triggers change, and shows the toast `Waarde verwijderd`. On failure it shows the server's `error` text, or `Verwijderen mislukt`.
4. Edit row: click on `.open-editPqr` takes the row id and requests `/core/ajax/editPqr.php?id=<row id>` (the HTTP method is not in the captured lines). The response goes into `#contentEditPqr` inside `#editPqr`, which is then opened; `__wsappsInitPqrFields` runs on that container.
5. Table: DataTables with `serverSide: false`, `ajax: null`, default order column 27 ascending, page length 100, length menu 10/20/50/100/500. The export buttons (CSV, Excel, print) are shown only when the export right is set in the page (`__wsappsCanExport`); they export columns with index 2 and up, which leaves out the first two columns.
6. Validations: none found in the capture for the Add or Delete dialogs. The import page's only rule is the REQUIRED file input in the DOM (see the import section).
7. Requests the page makes: at load, `/core/ajax/ajax-notifications.php?action=count_unread` (XHR shown in the capture). From the script: `POST /core/ajax/deletePqrOption.php` (dim, id) and `/core/ajax/editPqr.php?id=` (method not shown; see rule 4). The shared script also defines `/core/ajax/getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php` and `saveAddCalculationModalState.php`; the capture shows no control on this page that triggers them, so they are not described as this page's requests.

## Sample data
- Rows: 0 (`total: 0`, `shown: 0`). No key figures or percentages are shown.
- Info text: `Showing 0 to 0 of 0 entries`.
- Empty text: `No data available in table`.
- Example rows: none.
- Stored values in the stored-value dropdowns: none (each select has only `---` and `Add new...`).

## Not in the capture
- Table rows (none in the sandbox): row selection checkbox, the row edit control (`open-editPqr`), and all cell contents. The browser-pass notes (`_interactive/I2a-welders-catalogs.md`) also record "table empty in Zandbak (0 entries), nothing to edit", and the PQR edit dialog was not captured.
- Edit PQR dialog body: loaded from `/core/ajax/editPqr.php` after a row edit click; opened from a row that does not exist in the sandbox.
- Delete flow: the confirmation appears only after rows are selected; no row was selected.
- Import PQR preview rows, the summary, the Import button and the commit result: these need an uploaded file.
- The content of the CSV, Excel and print exports.
- Stored values of the 26 dropdowns (sandbox empty).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, editServiceRequest (Upload signed doc), chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, searchProject. The handheld floating menu (`Scan weld`, `Scan flange QR label`, `Add punch`) is also on the page.
