# MTO Pilot → Materials → Material database

Source: `mto__materials__material-database.txt`, `mto__materials__material-database-import.txt`, `mto__materials__material-database__edit.txt`, `mto__materials__material-database__mass-edit.txt`, `mto__materials__material-database__options.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-database&projectSite=1` (import page: `/mtopilot/index.php?page=material-database-import`).
State of the page for the observing account: normal.

## Page
- Browser title: "Material database - MTOPilot®". Panel title (with a database icon): "Material database".
- Breadcrumb: "Zandbak" (→ `/mtopilot/index.php?page=project-sites&id=1`) › "Material database" (→ `/mtopilot/index.php?page=material-database&projectSite=1`). Left menu group "Materials" is open.
- Tabs: none.
- Buttons in the top bar, in order:
  - "Mass edit materials" (pencil-square icon, id `massEditMaterialDbButton`, in wrapper `#massEditMaterialDbWrap`) → opens dialog `#massEditMaterialDB`. It carries class `disabled` while no row is ticked (clicks are swallowed by a handler); it becomes active when at least one row checkbox is ticked (capture `__options`, and the browser-pass notes: "no menu appears; the only change is that Mass edit materials becomes active").
  - "Import material" (import icon, class `buttonImport`) → link `index.php?page=material-database-import`.
  - "Add material" (plus icon, class `buttonInsert`) → opens dialog `#addMaterial`.
- The panel heading repeats two icon-only buttons (no text): a plus (class `buttonInsert`, → `#addMaterial`) and an import icon (class `buttonImport`, → `index.php?page=material-database-import`).
- The script refers to buttons `#deleteSelectedMaterialDbButton` / `#deleteSelectedMaterialDbButtonMobile` and a dialog `#deleteSelectedMaterialDB`, but none of them is in the captured DOM (see Rules).

## List
- Table `#datatable2mto`, server-side processing. Request: `GET /core/ajax/materials.php?id=1` plus the standard DataTables parameters (`draw`, `columns[i][data|name|searchable|orderable|search]`, `order`, `start`, `length`, `search`). The page made 9 such requests while loading.
- Columns in order (all visible, all sortable except the last):
  | # | Title | data index | Notes |
  |---|---|---|---|
  | 0 | CC | 0 | class `cc-col` (narrow, 20px per script) |
  | 1 | Group | 1 | |
  | 2 | Article No | 2 | |
  | 3 | Material No | 3 | class `mto-mat-no-col` (200px per script) |
  | 4 | Description | 4 | |
  | 5 | DIA | 5 | |
  | 6 | LBS/SCH | 6 | |
  | 7 | UOM | 7 | |
  | 8 | Options | null (not sortable, not searchable) | class `mto-mat-options-col`; the header cell holds a "select all" checkbox (`#mtoMaterialDbCheckAll`, title "Select all") |
- The row's database id is a 9th data element (`data[8]`), not shown as a column; it is the value of the row checkbox and is used by the row buttons.
- Default sort: column index 7 (UOM) ascending (`"order":[[7,"asc"]]`).
- Page length: 20 by default; options 10, 20, 50, 100, 500 (select `datatable2mto_length`, text "Show … entries").
- Per-column search: a second header row (`.mto-mat-db-filter-row`) with one text input per column 0–7, placeholder "Search" (`data-index` 0–7); none for Options. No global search box is rendered (language `search` is empty).
- Row options, in the Options cell, in order:
  1. pencil, yellow (`.open-editMaterialDB`) → dialog `#editMaterialDB`, body loaded by request.
  2. trash, red (`.open-deleteMaterialDB`) → dialog `#deleteMaterialDB`.
  3. euro icon, yellow (`.open-addCalculationMaterial`) → dialog `#addCalculationMaterial`, body loaded by request (calculation / unit rates for the material).
  4. checkbox (`.mto-material-db-select`, value = material id) for bulk selection.
- Bulk actions: only "Mass edit materials" (top bar) works on the ticked rows. No "Options" menu exists.
- Export / print: the table configuration lists buttons PDF, CSV, Excel and print (icon) that export the visible columns except the last, but the browser-pass notes say no `.dt-buttons` element is rendered, so none are visible on the page. Table layout string: buttons, then length + processing, table, then info + paging.
- Texts: empty "No data available in table"; zero matches "No matching records found"; info "Showing _START_ to _END_ of _TOTAL_ entries"; processing "Processing...". Displayed info in the capture: "Showing 1 to 20 of 34,396 entries (filtered from 38,990 total entries)".

## Dialogs

### Add material (`#addMaterial`) — opened by "Add material" (top bar and panel heading)
Form `#addMaterialDbForm`, method post. Fields in document order:
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | projectSite | hidden | – | 1 | current project site |
| 2 | Component code (ISO progress) (1=pipe, 2=supports, 3=appendages) | componentCode | text | no | empty | placeholder "1=pipe, 2=supports, 3=appendages" |
| 3 | Material group | materialGroup | text | yes | empty | |
| 4 | Article No | articleNo | text | no | empty | |
| 5 | Legacy No | legacyNo | text | no | empty | |
| 6 | Material No | materialNo (id `materialNo`) | text | no | empty | |
| 7 | DIA | dia | text | no | empty | |
| 8 | LBS/SCH | lbs | text | no | empty | |
| 9 | UOM | uom | select (select2) | no | EA | 20 options: 1 EA (default), 2 BX, 3 M, 4 SET, 5 L, 6 PAA, 7 KG, 8 DR, 9 PAC, 10 KIT, 11 TON, 12 M2, 13 H, 14 P, 15 EUR, 17 STK, 18 MTR, 19 -, 20 PC, 21 pcs |
| 10 | Material part | materialPart | select (select2) | no | Pipe (first option) | 68 options; first 10: 2 Pipe, 3 Elbow 45, 4 Elbow 90, 5 Flange, 6 Valve, 7 Cap, 8 Reducer, 9 Nipolet, 13 Outlet, 14 Plug |
| 11 | Type of material | typeMaterial | select (select2) | no | "A234 Gr WPB / CS / Fitting / C-Si" (first option, value 3) | 131 options; first 10: 3 A234 Gr WPB / CS / Fitting / C-Si, 9 A106 Gr B / CS / Pipe / C-Si, 10 A105 / CS / Flange / C-Si, 11 A216 Gr WCB / CS / Valve / C-Si, 12 A335 Gr P1 / HTCS / Pipe / 9Cr-1 Mo-V, 13 A234 Gr WP1 / HTCS / Fitting / 9Cr-1 Mo-V, 14 A182 Gr F1 / HTCS / Flange / 13CrMo4 4, 15 A217 Gr WC1 / HTCS / Valve / C-½ Mo, 18 A312 RVS316L / SS / Pipe / 316L, 19 A403 WP316L / SS / Fitting / SS |
| 12 | Material description | description | text | no | empty | |

Unlike the edit and mass-edit dialogs, this dialog has no "Home location" checkboxes and no "-----" placeholder option in its selects.
Buttons: "Add" (submit, name `addMaterialDB`, class `btn-hideInsert`), "Cancel" (dismiss). Close icon top right.

### Edit material (`#editMaterialDB`) — opened by the pencil in a row
Title "Edit material". The body is loaded when the pencil is clicked: `GET /core/ajax/editMaterialDB.php?id=<material id>&time=<ms>&action=showroom` (200, HTML) and placed in `#contentEditMaterialDB` inside a post form. Fields in document order (values shown are those of the first row, material id 33105):
| # | Label | name | Type | Required | Default (first row) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Home location | checkboxMDB[] (ids `checkboxMDB1`, `checkboxMDB2`, `checkboxMDB10`) | checkbox ×3 | no | "Zandbak" ticked (value `p1,`); "10420-2530 Ineos Project ONE" (value `p2,`) and "IPO - Carry Over" (value `p10,`) unticked | one checkbox per project site, value `p<site id>,`; ticked = the material is in that site's database |
| 2 | Component code (ISO progress) (1=pipe, 2=supports, 3=appendages) | componentCode | text | no | empty | placeholder "1=pipe, 2=supports, 3=appendages" |
| 3 | Material group | materialGroup (id `exampleInputEmail1`) | text | yes | FITTING P9 TEE RED | autocomplete off |
| 4 | Article No | articleNo | text | no | 100099003 | |
| 5 | Legacy No | legacyNo | text | no | empty | |
| 6 | Material No | materialNo | text | no | 7632905311 | |
| 7 | DIA | dia | text | no | empty | |
| 8 | LBS/SCH | lbs | text | no | empty | |
| 9 | Material part | materialPart | select (select2) | no | "-----------------------------" (value 0) | 69 options: value 0 placeholder, then the same 68 as in Add material (first 10 after the placeholder: 2 Pipe … 14 Plug) |
| 10 | Type of material | typeMaterial | select (select2) | no | "-----------------------------" (value 0) | 132 options: placeholder, then the same 131 as in Add material |
| 11 | UOM | uom | select (select2) | no | EA (value 1, marked selected) | same 20 options as Add material |
| 12 | Material description | description | text | no | TEE RED BW WP9 40 DN400X300 | |
| 13 | (none) | editID | hidden | – | 33105 (the material id) | |
Footer hidden inputs: `secureCode` (id `bookIdEditMaterialDBSecure`, empty in the capture), `returnToCalculation` (id `editMaterialReturnToCalculation`, 0), `returnCalculationMaterial` (id `editMaterialReturnCalculationMaterial`, 0).
Buttons: "Update" (submit, name `editMaterialDB`, class `btn-hideEdit`), "Cancel". The body contains a commented-out "Charge number" select (name `chargeNo`, not active). The body ends with a script that turns `.select2-single` into select2 widgets.

### Mass edit materials (`#massEditMaterialDB`) — opened by "Mass edit materials"
Title shows the number of ticked rows in grey: "Mass edit materials (1)" (updated by script when the dialog is shown). Help text (paraphrased): changes apply to every selected material, an empty field leaves the existing value, the material number cannot be changed here. Post form fields:
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | ids (id `massEditMaterialDbIds`) | hidden | – | comma-separated ids of the ticked rows (33105 in the capture) | filled by script |
| 2 | (none) | projectSite | hidden | – | 1 | |
| 3 | Home location | checkboxMDB[] (ids `massCheckboxMDB1`, `massCheckboxMDB2`, `massCheckboxMDB10`) | checkbox ×3 | no | Zandbak ticked (`p1,`); 10420-2530 Ineos Project ONE (`p2,`) and IPO - Carry Over (`p10,`) unticked | same three project sites as the edit dialog |
| 4 | Component code (ISO progress) | componentCode | text | no | empty | placeholder "1=pipe, 2=supports, 3=appendages" |
| 5 | Material group | materialGroup | text | no | empty | |
| 6 | Article No | articleNo | text | no | empty | |
| 7 | Legacy No | legacyNo | text | no | empty | |
| 8 | DIA | dia | text | no | empty | |
| 9 | LBS/SCH | lbs | text | no | empty | |
| 10 | UOM | uom | select (select2) | no | "-----------------------------" (value 0) | 21 options: 0 placeholder, 1 EA, 2 BX, 3 M, 4 SET, 5 L, 6 PAA, 7 KG, 8 DR, 9 PAC, 10 KIT, 11 TON, 12 M2, 13 H, 14 P, 15 EUR, 17 STK, 18 MTR, 19 -, 20 PC, 21 pcs |
| 11 | Material part | materialPart | select (select2) | no | placeholder (value 0) | 69 options: placeholder + the same 68 as Add material |
| 12 | Type of material | typeMaterial | select (select2) | no | placeholder (value 0) | 132 options: placeholder + the same 131 |
| 13 | Material description | description | text | no | empty | |
No "Material No" field. Buttons: "Update" (submit, name `massEditMaterialDB`, class `btn-hideEdit`), "Cancel". The selects become select2 widgets (width 100%) when the dialog is shown.

### Delete material (`#deleteMaterialDB`) — opened by the trash in a row
Title "Delete material". Body text "Are you sure?" in a post form with hidden `deleteID` (id `bookIdDeleteMaterialDB`, filled with the row id) and hidden `secureCode` (id `bookIdDeleteMaterialDBSecure`, filled by script with a fixed page token, the row id and the letters "mdb"). Buttons: "Delete" (submit, name `deleteMaterialDB`, trash icon, class `btn-hideDelete`), "Cancel".

### Add calculation (`#addCalculationMaterial`) — opened by the euro icon in a row
Shell in the page: title "Add calculation", a post form (multipart) with the body `#contentAddCalculationMaterial` filled by a request (not captured). Footer buttons: "Delete selected unit rates" (submit, name `deleteCalculationMaterial`, trash icon, tooltip "Check for delete"), "Add" (submit, id `addCalculationMaterialSubmit`, name `addCalculationMaterial`, disabled until the rule below is met), "Cancel". The fields of the body are not in the capture; the script names these controls: selects `sitefactor`, `tarrif`, `calcgroup`, `subdescr`, `unitrate`, `factors[]` (multiple), checkboxes `suggest[]`, input `quantity`, hidden `material`, search inputs `.js-mto-ac-search`, and a summary area with the text "Nothing selected yet" when empty.

### Import page (separate page, `index.php?page=material-database-import`) — opened by "Import material"
Panel title "Import material"; breadcrumb "Material database" › "Import material"; top-bar button "Cancel" → `index.php?page=material-database&projectSite=1`. Browser title is just "- MTOPilot®".
- Info box (paraphrased): the Excel columns match the database columns CC, Group, Article No, Material No, Description, DIA, LBS/SCH, UOM; optional extra columns Legacy No, Type Material, Material Part; CC means 1=pipe, 2=supports, 3=appendages; the template contains example rows that can be kept or replaced.
- "Templates:" link "Download Excel template" → `/core/export/templates/material_db_import_template_xlsx.php`.
- Well "Take over missing materials from this site": help text says it creates catalog rows for unique materials already used on isometrics or still on Order materials but not in this site's material database, with a preview before commit. Status line: "Missing from catalog: 1 unique isometric material(s), of which 0 still appear on Order materials." Buttons: "Take over from isometrics (1)" (id `matImportFromIsoBtn`, active), "Take over from order materials" (id `matImportFromOrderBtn`, disabled).
- Upload form `#matImportUploadForm` (multipart):
  | # | Label | name | Type | Required | Default | Notes |
  |---|---|---|---|---|---|---|
  | 1 | Excel bestand (.xlsx) | file | file | yes | – | accept `.xlsx` |
  | 2 | Clean import (verwijder bestaande materialen voor deze projectsite) | clean | checkbox | no | unticked | value `ok` |
  Button "Upload" (submit).
- Hidden until used: status alert `#matImportStatus`, button "Commit import" (`#matImportCommitBtn`, success style), table `#matImportTable`.

## Rules found in the page's JavaScript
Material database page:
- `__mtoMaterialDbUpdateMassEditUi` (runs on every row checkbox change, on the select-all checkbox, and after each table redraw): collects ids of ticked rows, writes them comma-separated into `#massEditMaterialDbIds` and `#deleteSelectedMaterialDbIds`, shows "(n)" in the count elements when n > 0, enables "Mass edit materials" (and the unrendered delete-selected buttons) when n > 0 and disables them with `aria-disabled` otherwise; with none ticked the select-all box is unticked. After every redraw the select-all box is cleared.
- Select-all (`#mtoMaterialDbCheckAll`) ticks or unticks every row checkbox on the current page only.
- Clicking a disabled "Mass edit materials" is intercepted (handler on `.disabled`).
- Delete-selected confirmation text in the script: "Permanently delete %d selected material(s)? This cannot be undone." put into `#deleteSelectedMaterialDbConfirm` when `#deleteSelectedMaterialDB` is shown; that dialog is not in the captured DOM.
- Per-column search: typing in a filter input (keyup, change, search) waits via a per-column timer, then sets that column's search and redraws only if the value changed; clicks in the filter row are handled so they do not sort the column.
- Row checkbox is added by `createdRow` into the row's action cell with the material id (`data[8]`); a fallback also defines the three row buttons (edit, delete, euro) as default cell content.
- Edit: clicking the pencil clears the "return to calculation" state, then requests `/core/ajax/editMaterialDB.php?id=<id>&time=<ms>` (GET) and fills `#contentEditMaterialDB`. If the edit dialog was opened from the calculation dialog (class `.js-mto-open-material-edit`), `returnToCalculation=1` and `returnCalculationMaterial=<id>` are set, the calculation dialog is hidden first, and after the edit dialog closes (or is submitted, via sessionStorage key `wsappsReturnAddCalculationMaterial`) the calculation dialog for that material is reopened.
- Delete: clicking the trash copies the row id to `deleteID` and builds `secureCode`.
- Calculation dialog: clicking the euro icon requests `GET /core/ajax/addCalculationMaterial.php?id=<id>&projectSite=<site>&time=<ms>`, fills `#contentAddCalculationMaterial`, initialises it and shows the dialog. The project site comes from the URL parameter `projectSite`, else 1.
  - The "Add" button is enabled only when `unitrate` has a value greater than 0 or at least one `suggest[]` checkbox is ticked.
  - Submitting does not post normally: `__mtoSubmitMaterialCalc` sends the form fields plus the clicked button name set to 1, `ajax=1`, `projectSite` and `_csrf` (when a token exists) to `/core/ajax/saveCalculationMaterial.php`. Add is refused when there is no unit rate and no suggestion, or no material id; delete needs a material id. On success a toast shows the server message or "Calculation has been added" and the dialog body is reloaded and kept open; on failure a toast shows the server message or "Something went wrong."
  - Changing `sitefactor` loads tariffs (`/core/ajax/searchTarrifs.php`, parameter `id`, `projectSite`) and factors (`/core/ajax/searchFactors.php`); changing `subdescr` (sub-group) loads unit rates (`/core/ajax/searchUnitRates.php`); changing `calcgroup` clears the sub-group when the chosen sub-group belongs to another group. Tariff auto-selection: keeps the saved tariff when present; otherwise picks the single real tariff when only one exists; otherwise among tariffs whose code starts with "01" picks the one when exactly one matches, else none (the capture shows these lines only in part).
  - Empty-state texts: "Choose a site factor first.", "Choose a group first.", "Choose a sub-group first.", "No factors found for this site factor.", "No unit rates found for this sub-group.", "No sub-groups found for this group."
  - Every change of site factor, tariff, group, sub-group, unit rate, factors, and the blur of `quantity` is stored with `GET /core/ajax/saveMaterialModalState.php` (parameters `k`, `v`, `projectSite`, `timer`, `ajax`) under keys `mat_sitefactor`, `mat_tarrif`, `mat_calcgroup`, `mat_subdescr`, `mat_unitrate`, `mat_factors` (comma-separated), `mat_quantity`.
- Other requests the page's shared script makes: `/core/ajax/getListOfMaterials.php` (GET, parameters `id`, `timer`, `ajax`), `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/ajax-notifications.php?action=count_unread` (response `{"count":0}`).
- Not wired to anything visible: the `#importMaterial` dialog ("Import materials from CSV") holds the info text "Gebruik de Excel import wizard: upload, preview met validatie, daarna commit." and a button "Open Excel import" → `/mtopilot/index.php?page=material-database-import`; no control seen in the capture opens it.

Import page script (base `https://montavar.websonik.nl/core/ajax/materialDbImport/`):
- Upload form submit: status "Uploaden en valideren…", then a batch id is read from the response (error "Geen batchId ontvangen" when missing), status "Upload OK. Preview laden…" and the preview is loaded.
- "Take over" buttons call `fromProject.php` with parameter `source` = `iso` or `order`; status "Collecting unique materials…"; empty answer → "No missing materials for this source."; success → "Preview loaded. Check the rows and commit."; failure → server error or "Overnemen mislukt".
- Preview table: first column "#", second "Actie" (select per row with options import / skip, `skip` rows get a skipped style), then one column per header of the uploaded file. Cells in error get an error style for materialNo, materialGroup, uom, componentCode, typeMaterial, materialPart. A Material No cell in error, or one that already exists (warning `materialNoExists`, shown as a tooltip), becomes an editable text input that saves on blur (field `materialNoRaw`). Changing "Actie" saves the choice and reloads the preview. Failed saves show the server error or "Update mislukt"; failed preview load shows "Kon preview niet laden".
- Summary line: "Rijen: N | Errors: N | Importeerbaar nu: N". "Commit import" is shown only when at least one row is importable; commit status "Committen…", then "Commit klaar. Gecommit: N" and the button hides.
- The names of the upload, preview, row-update and commit endpoints are on lines of the capture that were left out as already captured; only `fromProject.php` is visible.

## Sample data
- Totals: 38,990 materials in the table in total; 34,396 shown after the page's own filtering (info line "Showing 1 to 20 of 34,396 entries (filtered from 38,990 total entries)"). 20 rows on page 1, sorted by UOM ascending. All 20 rows have CC "-", DIA "-", LBS/SCH "-", UOM "EA".
- First 15 rows (columns CC | Group | Article No | Material No | Description | DIA | LBS/SCH | UOM; row ids 33105–33119 in order):
| CC | Group | Article No | Material No | Description | DIA | LBS/SCH | UOM |
|---|---|---|---|---|---|---|---|
| - | FITTING P9 TEE RED | 100099003 | 7632905311 | TEE RED BW WP9 40 DN400X300 | - | - | EA |
| - | FITTING P9 TEE RED | 100099006 | 7632905561 | TEE RED BW WP9 40 DN400X350 | - | - | EA |
| - | FITTING P9 TEE RED | 100124329 | 7632901571 | TEE RED BW WP9 40/80 DN100X50 | - | - | EA |
| - | FITTING P9 TEE RED | 100125292 | 7632901321 | TEE RED BW WP9 40/80 DN80X50 | - | - | EA |
| - | FITTING P9 TEE RED | 100124327 | 7632901541 | TEE RED BW WP9 80 DN100X50 | - | - | EA |
| - | FITTING P9 TEE RED | 100124331 | 7632901661 | TEE RED BW WP9 80 DN100X80 | - | - | EA |
| - | FITTING P9 TEE RED | 100124341 | 7632901901 | TEE RED BW WP9 80 DN150X100 | - | - | EA |
| - | FITTING P9 TEE RED | 100124335 | 7632901781 | TEE RED BW WP9 80 DN150X80 | - | - | EA |
| - | FITTING P9 TEE RED | 100125299 | 7632902151 | TEE RED BW WP9 80 DN200X100 | - | - | EA |
| - | FITTING P9 TEE RED | 100125302 | 7632902351 | TEE RED BW WP9 80 DN200X150 | - | - | EA |
| - | FITTING P9 TEE RED | 100125285 | 7632900361 | TEE RED BW WP9 80 DN20X15 | - | - | EA |
| - | FITTING P9 TEE RED | 100125305 | 7632902611 | TEE RED BW WP9 80 DN250X100 | - | - | EA |
| - | FITTING P9 TEE RED | 100125935 | 7632902801 | TEE RED BW WP9 80 DN250X150 | - | - | EA |
| - | FITTING P9 TEE RED | 100125938 | 7632902931 | TEE RED BW WP9 80 DN250X200 | - | - | EA |
| - | FITTING P9 TEE RED | 100125286 | 7632900461 | TEE RED BW WP9 80 DN25X15 | - | - | EA |
- Project sites in the "Home location" lists: Zandbak (current site, id 1), 10420-2530 Ineos Project ONE (id 2), IPO - Carry Over (id 10).
- Import page: "Missing from catalog: 1 unique isometric material(s), of which 0 still appear on Order materials."

## Not in the capture
- Body of "Add calculation" (`#addCalculationMaterial`): loaded by `addCalculationMaterial.php` after the euro icon is clicked; its fields and any list of existing unit rates are not shown.
- Delete-selected dialog (`#deleteSelectedMaterialDB`) and its buttons: referenced by script but not in the DOM; what makes them appear is not shown.
- Export buttons (PDF, CSV, Excel, print): configured but not rendered (browser-pass notes: none in the DOM).
- Rows beyond page 1 (34,396 filtered rows), results of column searches, the sort effect of other columns.
- The import preview table, error messages from a real upload, and the names of the upload / preview / update / commit endpoints (nothing was uploaded).
- Server-side validation messages of Add, Edit, Mass edit and Delete (nothing was submitted).
- Which fields of the Mass edit dialog are applied when a select is left at the placeholder (the help text says empty keeps the existing value).

Also present in the page, opened from elsewhere: `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.
