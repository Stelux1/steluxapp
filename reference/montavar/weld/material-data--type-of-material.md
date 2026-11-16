# WeldPilot → Material data → Type of material

Source: `weld__material__type-of-material.txt`, `weld__material__type-of-material__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/type-material/`.
State of the page for the observing account: normal (the list and its buttons are shown).

## Page
- Browser title: "Type of material - WeldPilot®". Panel title: "Type of material" (list icon).
- Breadcrumb: "Type of material" (active crumb, link `/weldpilot/type-material/`).
- Tabs: none in the capture.
- Buttons above the list:
  - "Add type of material" (top bar, `href="#addTypeMaterial"`, opens dialog `#addTypeMaterial`).
  - "Add type of material" (same label, inside the panel heading, same target `#addTypeMaterial`).
  - "CSV" (DataTables Buttons class `buttons-csv`, `href="#"`), "Excel" (`buttons-excel`, `href="#"`), print icon (`buttons-print`, `href="#"`). The handlers are DataTables standard classes; no custom handler is shown.
- Search input (placeholder "Search", with a clear button, aria-label "Clear") sits beside the export buttons.
- Language links in the header: Nederlands, English, Deutsch, Français (each keeps `page=type-material`).
- A floating "Handheld" button (fa-qrcode) with menu items "Scan weld", "Scan flange QR label", "Add punch". These belong to the shared layout, not to this list; not described further.

## List
- Table: `#datatableWarehouse`, client-side (`serverSide: false`, `ajax: null`). All rows are in the page; the capture shows no list request. The server-side table request is therefore none.
- Columns in order (none hidden, all sortable):
  1. Type of material
  2. Type of steel
  3. Material description
  4. Basic material
  5. Material group
  6. ISO / ASME
  7. Options
- Default sort: column 6 (ISO / ASME), ascending.
- Page length: default 20. Length options: 5, 20, 50, 100, 500. The DOM lines in the capture show no length selector element.
- Per-column search inputs: none. Filters: none. The only search is the global "Search" box.
- Row options (column "Options"), in order:
  1. Pencil icon (`glyphicon-pencil`, class `buttonEdit open-editTypeMaterial`, `href="#editTypeMaterial"`, `data-id` = row id) → opens the Edit dialog.
  2. Trash icon (`glyphicon-trash`, class `buttonDelete open-deleteTypeMaterial`, `href="#deleteTypeMaterial"`, `data-id` = row id) → opens the Delete dialog.
- Bulk actions (Options menu): none in the capture. The word "Options" is only the header of the per-row column.
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 131 of 131 entries" (template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Total rows: 131 (shown 131). The capture drew 40 body rows and says "(+91 more rows of 131)".
- Capture oddity: a first table element (no id, class `.dataTable`) holds only the header row and reports a JavaScript error in its DataTables setup ("Cannot read properties of undefined (reading 'ajax')"). It draws no rows; the visible table is `#datatableWarehouse`.

## Dialogs

### Add type of material (`#addTypeMaterial`) — opened by "Add type of material" (top bar button and panel-heading button)
Form in the dialog body (no hidden inputs; no tabs).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type of material | typeMaterial | text | yes (HTML required) | empty | none shown |
| 2 | Type of steel | typeSteel | text | yes (HTML required) | empty | none shown |
| 3 | Material description | description | text | no | empty | none shown |
| 4 | Basic material | basicMaterial | text | no | empty | none shown |
| 5 | Material group | materialGroup | text | no | empty | none shown |
| 6 | Lucefin group nr. | lucefinGroup | text | no | empty | none shown. Help text (see Buttons and text) sits after this field |
| 7 | ISO 15608 group | iso15608Group | select (select2 with tags, placeholder "Choose or type") | no | no option selected (blank) | 33 options, see Select options below. Tags on: a value not in the list can be typed |
| 8 | ASME P-Number | asmePNumber | select (select2 with tags, placeholder "Choose or type") | no | no option selected (blank) | 17 options, see below. Tags on |
| 9 | ASME Group Number | asmeGroupNumber | select (select2 with tags, placeholder "Choose or type") | no | no option selected (blank) | 6 options, see below. Tags on |

Select options (same lists for Add and Edit; value → text, the first option is blank and is the default):
- iso15608Group (33): blank; 1.1; 1.2; 1.3; 1.4; 2.1; 2.2; 3.1; 3.2; 3.3; 4.1; 4.2; 5.1; 5.2; 5.3; 5.4; 6.1; 6.2; 6.3; 6.4; 7.1; 7.2; 7.3; 8.1; 8.2; 8.3; 9.1; 9.2; 9.3; 10.1; 10.2; 10.3; 11.1 (value equals text in every option)
- asmePNumber (17): blank; P-1; P-3; P-4; P-5A; P-5B; P-5C; P-6; P-7; P-8; P-9A; P-9B; P-10A; P-10H; P-10I; P-15E; P-34
- asmeGroupNumber (6): blank; 1; 2; 3; 4; 5

Buttons: "Add" (type submit, name `addTypeMaterial`, primary, class `btn-hideInsert`); "Cancel" (dismisses the dialog); header × (dismisses the dialog).
Text in the dialog that states a rule: the help block under Lucefin group nr. says, in short, that the field is optional, can be left empty, and that a value can be picked from the list or typed when it is not listed (paraphrase).

### Edit type of material (`#editTypeMaterial`) — opened by the pencil icon of a row (`.open-editTypeMaterial`, `data-id` of that row)
The shell in the page is empty; the body is loaded by a GET to `/core/ajax/editTypeMaterial.php?id=<row id>&action=showroom` and placed into `#contentEditTypeMaterial`. The fields below come from the capture of the dialog opened for id 22 (see Not in the capture). Values are those of that record.

| # | Label | name | Type | Required | Default (record id 22) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type of material | typeMaterial | text (element id `exampleInputEmail1`) | yes | "A420 WPL6" | none shown |
| 2 | Type of steel | typeSteel | text | yes | "CS" | none shown |
| 3 | Material description | description | text | no | "Fitting" | none shown |
| 4 | Basic material | basicMaterial | text | no | "CS" | none shown |
| 5 | Material group | materialGroup | text | no | "1" | none shown |
| 6 | Lucefin group nr. | lucefinGroup | text | no | empty | none shown. Help text after this field, as in Add |
| 7 | ISO 15608 group | iso15608Group | select (select2 with tags) | no | no option marked selected in the response (blank) | same 33 options as Add |
| 8 | ASME P-Number | asmePNumber | select (select2 with tags) | no | no option marked selected (blank) | same 17 options as Add |
| 9 | ASME Group Number | asmeGroupNumber | select (select2 with tags) | no | no option marked selected (blank) | same 6 options as Add |
| 10 | (hidden) | editID | hidden | — | "22" | the record id, sent with the form |

Buttons: "Update" (type submit, name `editTypeMaterial`, warning style, class `btn-hideEdit`); "Cancel"; header × (dismisses the dialog).
Text rules: none beyond the required flags on fields 1 and 2 and the same help text as Add.

### Delete type of material (`#deleteTypeMaterial`) — opened by the trash icon of a row (`.open-deleteTypeMaterial`)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, id `bookIdDeleteTypeMaterial`) | deleteID | hidden | — | empty in the page; set to the row's `data-id` when the trash icon is clicked | the row's `data-id` |

Body text: "Are you sure?" (the only text in the body).
Buttons: "Delete" (type submit, name `deleteTypeMaterial`, danger style, class `btn-hideDelete`, trash icon); "Cancel"; header × (dismisses the dialog).

## Rules found in the page's JavaScript
- Edit icon: a click on `.open-editTypeMaterial` takes the row's `data-id` (`myBookId`), requests `/core/ajax/editTypeMaterial.php?id=<myBookId>` (GET) and puts the response HTML into `#contentEditTypeMaterial`; the `$modal` variable refers to `#editTypeMaterial`. The lines that open the modal after that are not in this capture's diff (elided as already captured in an earlier page).
- Delete icon: a click on `.open-deleteTypeMaterial` writes the row's `data-id` into the hidden field `#bookIdDeleteTypeMaterial` inside the modal body.
- Requests present in the shared script, context not shown in this capture (no control of this page is shown calling them): `/core/ajax/getListOfMaterials.php` (params `id`, `timer`, `ajax`), `/core/ajax/searchProject.php` (`time`), `/core/ajax/saveAddCalculationModalState.php` (`k`, `v`, `timer`, `ajax`), `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php` and `/core/ajax/searchFactors.php` (param `id`, `timer`, `ajax`).
- Also in the capture: `var __wsappsDebugPage = "type-material";`.
- Validations: none found in the captured scripts for this page. The only validation is the HTML `required` flag on typeMaterial and typeSteel (Add and Edit).
- Select2 tag mode (`data-tags="1"`) and the classes `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete` appear in markup; the capture does not show the scripts that act on those classes.
- Page load request: `/core/ajax/ajax-notifications.php?action=count_unread` (notifications counter, not part of this list).

## Sample data
- Row count: 131 entries (footer "Showing 1 to 131 of 131 entries"). Rows drawn in the capture: 40. Not drawn: 91.
- Of the 40 drawn rows: Type of steel CS in 37 rows, SS in 3 rows (1.4401/1.4404, 316, A182 F304/304L BW). Material description, Basic material, Material group and ISO / ASME are "-" in all 40 drawn rows.
- First 15 rows (all columns; Options column = edit and delete icons, omitted):

| Type of material | Type of steel | Material description | Basic material | Material group | ISO / ASME |
|---|---|---|---|---|---|
| A105N | CS | - | - | - | - |
| A106-B | CS | - | - | - | - |
| A182-F11 | CS | - | - | - | - |
| A193 B7/2H | CS | - | - | - | - |
| A216-WCB | CS | - | - | - | - |
| A216-WCC | CS | - | - | - | - |
| A217-C12A | CS | - | - | - | - |
| A217-WC6 | CS | - | - | - | - |
| A234 -WPBW | CS | - | - | - | - |
| A234-WP11 | CS | - | - | - | - |
| A234-WP91 | CS | - | - | - | - |
| A234-WPB | CS | - | - | - | - |
| A333-6 | CS | - | - | - | - |
| A335-P11 | CS | - | - | - | - |
| A335-P91 | CS | - | - | - | - |

- Row with "A420-WPL6" (data-id 76): Type of steel CS; the other columns "-" (as in the list capture).

## Not in the capture
- Rows 41 to 131 of the list (91 rows): the capture stopped at 40 body rows.
- Edit dialog body for any row other than id 22: the body is loaded only after a click on that row's pencil icon. The capture holds only the response for id 22 (request `editTypeMaterial.php?id=22&action=showroom`). The row labelled "A420-WPL6" in the list carries `data-id="76"`, not 22; no drawn row carries `data-id="22"`. The edit body for id 76 is not captured, so the record shown in the Edit dialog cannot be matched to that row from the captures; it is not verified which row the browser pass opened.
- Results of Add, Update and Delete (submits): none were made; the capture is read-only.
- Bulk Options menu for this list: not present in the capture.

Also present in the page, opened from elsewhere (not opened by a control of this page in the capture): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, searchProject.
