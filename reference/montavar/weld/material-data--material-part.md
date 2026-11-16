# WeldPilot → Material data → Material part

Source: `weld__material__material-part.txt`, `weld__material__material-part__edit.txt` (the edit dialog opened by clicking a row's pencil button) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/material-part/`.
State of the page for the observing account: normal (the list is shown).

## Page
- Title: "Material part - WeldPilot®" (page `<title>`).
- Breadcrumb: "Material part" (active crumb, link `/weldpilot/material-part/`).
- Panel heading: icon (list) and the text "Material part".
- Tabs: none on this page.
- Buttons above the list:
  - "Add material part" (top bar, sticky header; btn-primary, block) → opens `#addMaterialPart` (`href="#addMaterialPart"`, `data-toggle="modal"`).
  - "Add material part" (same button again, inside the panel heading, with a plus icon) → opens `#addMaterialPart`.
  - "CSV" (`buttons-csv`, `href="#"`) → export handler not named in the capture.
  - "Excel" (`buttons-excel`, `href="#"`) → export handler not named in the capture.
  - Print icon (`buttons-print`, `href="#"`, icon `fa fa-print`) → print handler not named in the capture.
  - Search box above the table (see List).

## List
- Table id `#datatableWarehouse`, DataTables client-side (`serverSide: false`, `ajax: null`). No server-side table request exists for this list.
- Columns, in order (header text "Part", "Custom", "Options"):
  1. Part (index 0, sortable, visible)
  2. Custom (index 1, sortable, visible)
  3. Options (index 2, sortable, visible; contains the row buttons)
- Hidden columns: none.
- Default sort: column 1 (Custom), ascending.
- Page length: default 20. The configured length menu is 5 / 20 / 50 / 100 / 500. The browser-pass notes say no page-length control is visible on the page.
- Per-column search inputs: none.
- Filters: none in the capture.
- Global search: one input, `type="search"`, placeholder "Search", with a clear button (aria-label "Clear", icon `fa-times`). Filter wrapper id `#datatableWarehouse_filter`.
- Row options, in order, in the Options cell (both icon-only, no text):
  1. Pencil icon (`glyphicon-pencil`, class `buttonEdit open-editMaterialPart btn btn-xs btn-warning btn-block`, `data-id` = row id) → opens `#editMaterialPart`.
  2. Trash icon (`glyphicon-trash`, class `buttonDelete open-deleteMaterialPart btn btn-xs btn-danger btn-block`, `data-id` = row id) → opens `#deleteMaterialPart`.
- Bulk actions (Options menu): none in the capture.
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered in the capture as "Showing 1 to 68 of 68 entries").
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Search placeholder: "Search".
- Markup note: the page also contains a second, empty table with the same header ("Part", "Custom", "Options") and no body rows, whose DataTables configuration could not be read (the capture records the error `TypeError: Cannot read properties of undefined (reading 'ajax')`).
- Server-side table request: none (client-side table).

## Dialogs

### Add material part (`#addMaterialPart`) — opened by "Add material part" (top bar and panel heading)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Part | part | text | yes | empty | none |
| 2 | Custom | custom | text | no | empty | none |

- Both labels have `for="input00"`, which matches no input in this dialog.
- No hidden inputs. No tabs in the dialog.
- Buttons: "Add" (type submit, btn-primary, name `addMaterialPart`, class `btn-hideInsert`); "Cancel" (btn default, dismisses the dialog).
- Rule stated in the dialog: the Part field is required (HTML `required`). No other text.

### Edit material part (`#editMaterialPart`) — opened by the pencil button on each row

The static dialog in the page holds only the header, a hidden field in the footer and the buttons. The body is loaded when the pencil is clicked (see the rules section). The fields below are from the click capture for the row with id 47.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Part | part | text | yes (`required`, `autocomplete="off"`) | value of the row, e.g. "Lateral-Bellow" (id 47) | loaded from the server on click |
| 2 | Custom | custom | text | no | value of the row, e.g. "Bellow" (id 47) | loaded from the server on click |
| 3 | (none, hidden) | editID | hidden | — | row id, e.g. 47 | set in the loaded body |
| 4 | (none, hidden, in footer) | secureCode | hidden (`#bookIdEditMaterialPartSecure`) | — | set by the page's script when the dialog opens (captured value is a 32-character hex string) | not a visible field |

- Label for field 1 and field 2: "Part" and "Custom", both with `for="input00"` as in the Add dialog. The Part input in the loaded body has the id `exampleInputEmail1`.
- The Custom input in the loaded body has `size="16"`.
- Buttons: "Update" (type submit, btn-warning, name `editMaterialPart`, class `btn-hideEdit`); "Cancel" (btn default, dismisses).
- Text stating a rule: none in the dialog (the Part field carries the `required` attribute only).
- Tabs: none.

### Delete material part (`#deleteMaterialPart`) — opened by the trash button on each row

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none, hidden) | deleteID | hidden (`#bookIdDeleteMaterialPart`) | — | set by the page's script on click to the row id | not visible |
| 2 | (none, hidden) | secureCode | hidden (`#bookIdDeleteMaterialPartSecure`) | — | set by the page's script on click | not visible |

- Dialog text: "Are you sure?"
- Buttons: "Delete" (type submit, btn-danger, name `deleteMaterialPart`, class `btn-hideDelete`, icon `glyphicon-trash`); "Cancel" (btn default, dismisses).
- Text stating a rule: none beyond "Are you sure?".
- Tabs: none.

Also present in the page, opened from elsewhere (their controls are not on this page's list or buttons): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, editServiceRequest, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal. The handheld menu (floating button) on every page lists "Scan weld", "Scan flange QR label" and "Add punch".

## Rules found in the page's JavaScript
- Edit open (click on `.open-editMaterialPart`): reads the row's id, builds a secure code in the browser from a fixed prefix string, the row id and the suffix "mtpE", and writes it into the hidden `secureCode` field of the Edit dialog. Then it loads the dialog body with a request to `/core/ajax/editMaterialPart.php?id=<row id>` and puts the returned HTML into the element `#contentEditMaterialPart`. The capture's request log shows this as a GET with `id` and `action=showroom`; the visible script line shows only the `id` part of the URL, so the `action` parameter comes from lines the capture does not show in full.
- Delete open (click on `.open-deleteMaterialPart`): writes the row id into the hidden `deleteID` field of the Delete dialog, builds a secure code in the browser from a fixed prefix, the row id and the suffix "mtp", and writes it into the hidden `secureCode` field.
- Add dialog: no validation or computed value for this dialog is visible in the capture beyond the HTML `required` attribute on Part.
- Requests the shared script makes for this page's scripts: `/core/ajax/getListOfMaterials.php` (GET via jQuery, parameters `id`, `timer`, `ajax`), `/core/ajax/searchProject.php` (with a `time` parameter), and several `/core/ajax/search…` and `saveAddCalculationModalState.php` calls. The capture does not show which control on this page calls the first three; the last group is in the shared script for other screens.
- On load the page makes one request: `/core/ajax/ajax-notifications.php?action=count_unread` (shared with every page).
- Other behaviour in the shared script (calculator, notification, and other screens) is not described here.

## Sample data
- Total rows: 68 (info text "Showing 1 to 68 of 68 entries").
- The capture draws 40 body rows and says "(+28 more rows of 68)".
- Custom column: the rows in the capture show "-" in the Custom column. The browser-pass notes say only 3 of the 68 rows have Custom filled.
- Row data for the record opened in the edit capture: id 47, Part "Lateral-Bellow", Custom "Bellow" (not among the 40 rows drawn).

First 15 drawn rows (in the order shown):

| Part | Custom | Options (edit id / delete id) |
|---|---|---|
| 22 1/2 Deg Elbow | - | 68 / 68 |
| Angular-Bellow | - | 45 / 45 |
| Ball Valve | - | 59 / 59 |
| Blind disk | - | 54 / 54 |
| Blind flange | - | 22 / 22 |
| Butterf. Valve | - | 56 / 56 |
| Cap | - | 7 / 7 |
| Conc. swage nipple | - | 17 / 17 |
| Conc.Reducer | - | 28 / 28 |
| Concentric Swage | - | 76 / 76 |
| Coupling | - | 19 / 19 |
| D. Plate Check V. | - | 73 / 73 |
| DP Check V. | - | 75 / 75 |
| ECC Swage | - | 79 / 79 |
| ECC Y-PIECE | - | 82 / 82 |

## Not in the capture
- Rows 41 to 68 of the list (the capture draws 40 body rows; the remaining 28 are in the table data but not in the capture).
- The body of the Edit dialog for any row other than id 47 (loaded on click from `/core/ajax/editMaterialPart.php?id=<row id>`; reach it through the pencil button of a row).
- The export and print outputs (CSV, Excel, print buttons): the handlers and the files they produce are not shown.
- Any page-length selector: none is visible in the capture.
- Result of pressing "Add", "Update" or "Delete": not captured (no button was pressed; the capture is read-only).
- The row id 47 as an entry in the list (it is not in the 40 drawn rows).
