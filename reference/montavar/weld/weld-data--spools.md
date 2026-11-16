# WeldPilot → Weld data → Spools

Source: `weld__welddata__spools.txt`, `weld__welddata__spools__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/material-spools/`.
State of the page for the observing account: normal (the list is shown).

The page title is "Spools - WeldPilot®". The menu item is "Spools" under the Weld data group in the reference's menu (the browser-pass notes use "Weld data → Spools").

## Page
- Title (panel heading): "Spools", with a `glyphicon-tasks` icon. The panel has no tabs.
- Breadcrumb: the capture shows no breadcrumb trail. The top bar (`#topbar`) holds the link "Zandbak" → `/weldpilot/index.php?page=project-sites&id=1` and the link "Spools" → `/weldpilot/index.php?page=material-spools`.
- Buttons above the list:
  - "Add spool" (in the top bar, class `buttonInsert`) → opens dialog `#addSpool` (`href="#addSpool"`, `data-toggle="modal"`).
  - "Add spool" (icon-only plus button in the panel heading, same attributes) → opens dialog `#addSpool`.
  - "Options ▾": not in the captured DOM. The browser-pass notes (`_interactive/I2a-welders-catalogs.md`) list an "Options ▾" button on this page; that note does not describe its menu. The script on this page (see Rules) refers to a `#showWPSgroupOptions` element, which is not in the capture.
- Search field: see List.

## List
- Table: `#datatableWarehouse` (the visible list). The capture also has a second, unnamed table element that holds only a header row; its DataTables reader recorded `TypeError: Cannot read properties of undefined (reading 'ajax')`.
- Columns in order (from the `DT` line and the header row):
  1. "Spool name" (data key 0; sortable; visible)
  2. "Enabled on this site" (data key 1; sortable; visible)
  3. "Options" (data key 2; sortable; visible; no header text beyond "Options")
  4. Header: a checkbox with id `checkAll` (data key 3; sortable; visible)
- Hidden columns: none.
- Default sort: `order: [[2, "asc"]]` (column index 2, "Options", ascending).
- Page length: `pageLength` 20. Length menu in the DataTables config: 5 / 20 / 50 / 100 / 500. The captured DOM has no length selector, and the browser-pass notes also say none.
- Per-column search inputs: none in the capture.
- Filters: none in the capture.
- Global search: a text input `type="search"` with placeholder "Search" (label "Search" wrapper with a magnifier icon), and a clear button (`aria-label="Clear"`). The DataTables search label text is empty.
- Row options, in order (each row's last cell in the "Options" column):
  1. Pencil icon (`glyphicon-pencil`, class `buttonEdit open-editSpool`, no text, `href="#editSpool"`, `data-toggle="modal"`, `data-id` = the spool's id) → opens dialog "Edit spool" (`#editSpool`).
  2. Trash icon (`glyphicon-trash`, class `buttonDelete open-deleteSpool`, no text, `href="#deleteSpool"`, `data-toggle="modal"`, `data-id` = the spool's id) → opens dialog "Delete spool" (`#deleteSpool`).
- Row checkbox: the last column, `name="cbList[]"`, class `checkbox11`, value `s<id>` (for example `s54`). The header checkbox (`#checkAll`) ticks or unticks all row checkboxes (see Rules).
- Bulk actions (Options menu): the menu contents are not in the capture. The browser-pass notes only record that the "Options ▾" button exists.
- Export / print buttons: none in the captured DOM. The page's script shows and hides `.buttonImport` and `.buttonPrint` elements, but none is in the DOM.
- Info and empty texts:
  - Footer: "Showing 1 to 53 of 53 entries" (DataTables `info`: "Showing _START_ to _END_ of _TOTAL_ entries").
  - Empty table: "No data available in table".
  - Search with no match: "No matching records found".
- Server-side table request: none. The table is client-side (`serverSide: false`, `ajax: null`); its rows are in the DOM.
- Other request on load: `/core/ajax/ajax-notifications.php?action=count_unread` (site-wide notifications, not this table).

## Dialogs

### Add spool (`#addSpool`) — opened by "Add spool" (top bar and panel heading)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Spool name | `name` | text | yes | empty | — |
| 2 | Abbreviation | `abbr` | text | yes | empty | — |
| 3 | Enable on this site (Zandbak) | `site` (id `checkboxPSXcv1`, value `ok`) | checkbox | no | unchecked | — |

- Form: `method="post"`. The form's action is not in the capture.
- Buttons: "Add" (`btn-primary`, `btn-hideInsert`, submit, `name="addSpool"`); "Cancel" (`btn default`, closes the dialog).
- Text stating a rule: none beyond the required markers on the two text fields.
- Field 3 is the only site checkbox in this dialog (it is labelled with the Zandbak site name). No other site appears here.

### Edit spool (`#editSpool`) — opened by the pencil icon on a row (`.open-editSpool`)
The static page holds this dialog with only its footer (hidden `secureCode`, "Update", "Cancel"). The body is loaded when the pencil is clicked (`/core/ajax/editSpool.php?id=<row id>`, GET, with `action=showroom` as seen in the browser pass) into `#contentSpool`. The fields below are from the captured open dialog for spool "SP01A" (row id 54).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Spool name | `name` (id `exampleInputEmail1`) | text | yes | "SP01A" (this row) | loaded on pencil click |
| 2 | Abbreviation | `abbr` (id `exampleInputEmail1`, same id as field 1 in the markup) | text | yes | "SP01A" (this row) | loaded on pencil click |
| 3 | Enable on this site (Zandbak) | `sites[]` value `1` (id `checkboxPSX1`) | checkbox | no | unchecked | visible |
| 4 | 10420-2530 Ineos Project ONE | `sites[]` value `2` (id `checkboxPSX2`) | checkbox | no | checked | inside a `div` with inline `display:none`, under the label "Enable on this site"; the capture does not show what makes that block visible |
| 5 | IPO - Carry Over | `sites[]` value `10` (id `checkboxPSX10`) | checkbox | no | unchecked | same hidden block as field 4 |
| 6 | (none shown) | `editID` | hidden | — | row id (54 for SP01A) | set by the server response |
| 7 | (none shown) | `secureCode` (id `bookIdEditSpoolSecure`, in the footer) | hidden | — | value set by the page script on click | the value is not copied here |

- Form: `method="post"`. The form's action is not in the capture; the submit button is named `editSpool`.
- Buttons: "Update" (`btn-warning`, `btn-hideEdit`, submit, `name="editSpool"`); "Cancel" (`btn default`, closes the dialog).
- Text stating a rule: none in the body beyond the field labels.
- Site fields: the three `sites[]` checkboxes are the only site choices captured. Field 3 is the visible one; fields 4 and 5 are in the hidden block. The "Enable on this site" label of the hidden block is in the markup but is not shown.

### Delete spool (`#deleteSpool`) — opened by the trash icon on a row (`.open-deleteSpool`)
The delete dialog is in the static page, with its full body. No open capture of this dialog exists.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none shown) | `deleteID` (id `bookIdDeleteSpool`) | hidden | — | empty in the static page; set to the row's id by the page script on click | — |
| 2 | (none shown) | `secureCode` (id `bookIdDeleteSpoolSecure`) | hidden | — | empty in the static page; set by the page script on click | the value is not copied here |

- Form: `method="post"`. The form's action is not in the capture.
- Text in the dialog: "Are you sure?"
- Buttons: "Delete" (`btn-danger`, `btn-hideDelete`, submit, `name="deleteSpool"`, trash icon); "Cancel" (`btn default`, closes the dialog).

### Also present in the page, opened from elsewhere
Dialogs in the page that no control on this page opens (their ids are listed from the capture; they are the same on every page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.

Note on `optsActivate` and `optsDeactivate`: the page's script writes the ids of the ticked spools into `#activationIds` and `#deactivationIds`. The capture does not show a control on this page that opens these dialogs.

## Rules found in the page's JavaScript
- Row selection (`updateSpoolSelection`): collects the values of all ticked `input.checkbox11`, joins them with commas, and writes the result into `#activationIds` and `#deactivationIds`. If at least one row is ticked it removes the class `is-inactive` from `#showWPSgroupOptions`; if none is ticked it adds the class. Runs on click and change of each row checkbox.
- Options menu lock: a click on `#showWPSgroupOptions .dropdown-toggle` is cancelled (default prevented, propagation stopped) while `#showWPSgroupOptions` has the class `is-inactive`, so the menu opens only when at least one spool is ticked.
- Header checkbox (`[id="checkAll"]`): on click or change, sets every `input.checkbox11` to the header's checked state, then runs `updateSpoolSelection`.
- Pencil click (`.open-editSpool`): reads the row id (named `myBookId` in the script), computes the `secureCode` value from a fixed prefix, the id and the fixed suffix `spoE`, and writes it into `#bookIdEditSpoolSecure`. It then loads `/core/ajax/editSpool.php?id=<id>` and puts the response into `#contentSpool`. The capture elides the lines between the computation and the request; whether a hash function is applied to that value is not visible in the capture (the page also loads `md5.js`).
- Trash click (`.open-deleteSpool`): writes the row id into `.modal-body #bookIdDeleteSpool` and computes `secureCode` from the same fixed prefix, the id and the fixed suffix `spo`, into `#bookIdDeleteSpoolSecure`.
- Button visibility (inline script, top level, no condition shown in the capture): sets `visibility: visible` on `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport`, `.buttonPrint`; and `visibility: hidden` on `.btn-hideInsert`, `.btn-hideImport`, `.btn-hidePrint`, `.btn-hideDelete`. On this page, the "Add" button of `#addSpool` has `btn-hideInsert` and the "Delete" button of `#deleteSpool` has `btn-hideDelete`. The capture does not show the condition under which the statement runs.
- Requests named in this page's scripts:
  - `GET /core/ajax/editSpool.php?id=<id>` (on pencil click; the browser pass saw it with `action=showroom`).
  - `/core/ajax/ajax-notifications.php?action=count_unread` (on page load).
  - The shared script of the site (10,604 lines in the first capture of the sweep, of which this capture shows 19 new lines) also contains requests to `/core/ajax/getListOfMaterials.php` (with `id`), `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php` (`k`, `v`), `/core/ajax/searchUnitRates.php` (`id`), `/core/ajax/searchTarrifs.php` (`id`) and `/core/ajax/searchFactors.php` (`id`). The capture elides their surrounding lines and does not show which control triggers them on this page.
- Submitting the Add, Edit or Delete forms: the capture has no form action. The submit buttons are named `addSpool`, `editSpool` and `deleteSpool`.
- No validation rules beyond the `required` attribute on the Add and Edit name and abbreviation fields.

## Sample data
- Row count: "Showing 1 to 53 of 53 entries" (53 spools). The capture draws 40 body rows and says "(+13 more rows of 53)".
- Captured rows: 35 with "Enabled on this site" = "No", and 5 with "Yes". Three rows are named "SP22" (ids 68, 76, 77). The names are as displayed.
- Example rows (the first 10 drawn rows and the 5 "Yes" rows, in drawn order):

| Spool name | Enabled on this site | Row id (pencil / trash `data-id`) | Row checkbox value |
|---|---|---|---|
| SP01A | No | 54 | s54 |
| SP01B | No | 60 | s60 |
| SP02 | No | 1 | s1 |
| SP02A | No | 59 | s59 |
| SP03 | No | 2 | s2 |
| SP03A | No | 58 | s58 |
| SP04 | No | 4 | s4 |
| SP04A | No | 57 | s57 |
| SP05 | No | 28 | s28 |
| SP05A | No | 61 | s61 |
| SP01 | Yes | 52 | s52 |
| SP11 | Yes | 50 | s50 |
| SP12 | Yes | 49 | s49 |
| SP13 | Yes | 48 | s48 |
| SP14 | Yes | 47 | s47 |

- Edit dialog example (row SP01A, id 54), as loaded: name "SP01A", abbreviation "SP01A", Zandbak checkbox unticked, hidden block with "10420-2530 Ineos Project ONE" ticked and "IPO - Carry Over" unticked.

## Not in the capture
- Rows 41 to 53 of the 53 rows (the capture shows "(+13 more rows of 53)").
- The content of the "Options ▾" menu (the button exists per the browser-pass notes; its items are not captured). Bulk actions that would use `#activationIds` / `#deactivationIds` are therefore not described.
- The `#showWPSgroupOptions` element itself (referenced by the script, absent from the DOM).
- The DataTables length selector (the config lists 5 / 20 / 50 / 100 / 500 with a default of 20, but no selector is in the DOM).
- The "Delete spool" dialog in an opened state (no open capture; its fields are described from the static DOM).
- The form action and response of Add, Edit and Delete submits.
- The "Enable on this site" block of the Edit dialog while it is displayed (the capture shows it only with `display:none`).
- Empty table, no-match and filtered states beyond the texts listed.
- Export and print buttons (none in the DOM; the browser-pass notes also say none).
- Other rows' Edit dialogs (only spool SP01A, id 54, was opened in the browser pass).

## Also present
- Site-wide handheld menu (in the page DOM on every page): "Scan weld" (opens `#wpWeldScanModal`), "Scan flange QR label" (opens `#wpFlangeScanModal`), and "Add punch" (`data-action="punchlist"`, no dialog id in the capture).
