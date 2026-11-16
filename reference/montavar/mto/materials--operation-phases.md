# MTOPilot → Materials → Operation Phases

Source: `mto__materials__operation-phases.txt`, `mto__materials__operation-phases__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/material-types/`.
State of the page for the observing account: normal.

## Page
- Browser title: "Operation Phases - MTOPilot®".
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Top bar (`#topbar`): link "Operation Phases" → `/mtopilot/material-types/` (the current page); button "Add Operation Phase" (primary, plus icon) → opens `#addMaterialType`.
- Panel title (dark panel, list icon): "Operation Phases". Inside the panel heading a second button with a plus icon and no text → opens `#addMaterialType`.
- Chrome around the page (same as other pages of the site): app-switcher tiles MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®; language links Nederlands, English, Deutsch, Français; side menu (full menu in the `mto__start__dashboard` capture).

## List
- Table: `#datatableWarehouse` (client-side DataTables: `serverSide: false`, `ajax: null`; all rows are in the page, no table request).
- Columns in order: **ID** (data 0), **Operation Phase** (data 1), **Options** (data 2). All three visible; the capture marks all three as sortable.
- Default sort: column "Operation Phase", ascending.
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Per-column search inputs: none. One global search box above the table: input type "search", placeholder "Search", with a clear button (aria-label "Clear").
- Filters: none in the capture.
- Row options (column "Options", in order):
  1. Pencil icon (glyphicon-pencil, warning button, no text) → opens `#editMaterialType` (data-id = row id).
  2. Trash icon (glyphicon-trash, danger button, no text) → opens `#deleteMaterialType` (data-id = row id).
- Bulk actions: none in the capture (no row checkboxes, no Options menu on this page).
- Export / print buttons above the table: "CSV" (DataTables buttons-csv), "Excel" (buttons-excel), print icon (fa-print, buttons-print). All three are `href="#"`; none was clicked, so their output is not in the capture.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (the footer reads "Showing 1 to 14 of 14 entries").
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Server-side request for the table: none (client-side table).

## Dialogs

### Add Operation Phase (`#addMaterialType`) — opened by the top-bar "Add Operation Phase" button and the plus button in the panel heading
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material type | type | text | yes (`REQUIRED`) | empty (no value attribute) | none. The label's `for="input00"` matches no element id in the dialog. |

Form method post. No hidden inputs. Buttons: "Add" (submit, primary, `name="addMaterialType"`); "Cancel" (default, closes the dialog). The header has a close button (×). The dialog has no text stating a rule.

### Edit material type (`#editMaterialType`) — opened by the pencil button of a row (`data-id` = row id)
Body is loaded by a request when the pencil is clicked: `/core/ajax/editMaterialType.php?id=<row id>&action=showroom` (the capture shows it for row 7, "Bernecker"; the response is put into `#contentEditMaterialType`). The field values below are those of row 7.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material type | type | text | yes (`REQUIRED`) | "Bernecker" (row 7) | Comes from the request for the clicked row. Element id `exampleInputEmail1`. Label `for="input00"` (no element with that id). |
| 2 | (none) | editID | hidden | — | "7" (row 7) | Written into the response by the server for the clicked row. |
| 3 | (none) | secureCode | hidden (id `bookIdEditMaterialTypeSecure`) | — | a 32-character hex code for row 7 (not copied here) | Set by the browser on the pencil click, before the request, from the row id and a fixed text (see Rules). |

Form method post. The body of the form is replaced by the request response, so the three fields above exist only after the request has finished. No tab.
Buttons: "Update" (submit, warning, `name="editMaterialType"`, class `btn-hideEdit`); "Cancel" (default, closes the dialog). The capture does not mark Update as hidden. The browser-pass notes do not say whether it was visible on screen. (In the UOMs dialog of the same site the browser pass found the same `btn-hideEdit` Update button not visible.)
No rule text in the dialog.

### Delete material type (`#deleteMaterialType`) — opened by the trash button of a row (`data-id` = row id)
Not opened in the capture; the content below is the static DOM plus the click handler in the scripts.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text "Are you sure?" — not a field) | — | — | — | — | — |
| 2 | (none) | deleteID | hidden (id `bookIdDeleteMaterialType`) | — | empty in the DOM | Set on the trash click to the row id (`data-id`). |
| 3 | (none) | secureCode | hidden (id `bookIdDeleteMaterialTypeSecure`) | — | empty in the DOM | Set on the trash click by the browser (see Rules). |

Form method post. Buttons: "Delete" (submit, danger, `name="deleteMaterialType"`, trash icon, class `btn-hideDelete`); "Cancel" (default, closes the dialog). The capture does not mark Delete as hidden.
Text stating a rule: the only text is "Are you sure?".

## Rules found in the page's JavaScript
- Pencil handler (`jQuery(document).on("click", ".open-editMaterialType", …)`): computes the secure value for the row in the browser (a fixed text, the row id, and a second fixed text ending in "mttE") and writes it into `#bookIdEditMaterialTypeSecure`; then loads `/core/ajax/editMaterialType.php?id=<row id>` and puts the response HTML into `#contentEditMaterialType`. The XHR log shows the request with `action=showroom` added. The lines that read the row id are in earlier captures and not in this one.
- Trash handler (`jQuery(document).on("click", ".open-deleteMaterialType", …)`): writes the row id into `.modal-body #bookIdDeleteMaterialType` (deleteID) and computes a secure value (a fixed text, the row id, and a different fixed text ending in "mtt") into `.modal-body #bookIdDeleteMaterialTypeSecure`. The secure value for delete and edit differ only in the final fixed text.
- No client-side validation for Add, Edit or Delete in the capture, apart from the `required` attribute on the Material type field.
- No fields shown or hidden on a condition in these dialogs.
- Requests this page makes: on load, `/core/ajax/ajax-notifications.php?action=count_unread` (GET, in XHR list); on Edit click, `/core/ajax/editMaterialType.php?id=<row id>&action=showroom` (GET). The table makes no request (client-side).
- Other request URLs (e.g. `getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`) are in the shared script of the site, not in this page's handlers; this page's capture does not trigger them.
- Fixed secure-code text values are in the script; they are not copied into this note.

## Sample data
- Row count: 14 (`total` 14, `shown` 14). Default page length 20, so all rows are on one page.
- Rows as displayed (ID | Operation Phase | Options = pencil and trash):

| ID | Operation Phase | Options |
|---|---|---|
| 7 | Bernecker | pencil, trash |
| 2 | Field | pencil, trash |
| 17 | Field IYM | pencil, trash |
| 3 | Hydrotest field | pencil, trash |
| 15 | Revision mat | pencil, trash |
| 11 | Rilco | pencil, trash |
| 1 | Shop | pencil, trash |
| 16 | Shop IYM | pencil, trash |
| 14 | Shop missing | pencil, trash |
| 4 | Support Field | pencil, trash |
| 10 | Support FW | pencil, trash |
| 8 | Support Shop | pencil, trash |
| 9 | Support WS | pencil, trash |
| 5 | Valves | pencil, trash |

- The dialogs title these records "Operation Phase" (Add, title "Add Operation Phase") and "material type" (Edit, title "Edit material type"; Delete, title "Delete material type"; field label "Material type").

## Not in the capture
- Add Operation Phase dialog: the capture has its static DOM only; it was not opened.
- Delete material type dialog: its opening (the hidden values written by the click) is not captured; only the static DOM and the handler code are.
- Results of Add, Update or Delete (form submission responses): none captured; nothing was submitted.
- Export results (CSV, Excel, print): not captured.
- Sorting, paging and search on the table: not exercised.
- Contents of the first table on the page (see the unclear items below).

Also present in the page, opened from elsewhere (not controls of this page): editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal; plus the scan floating button with its two menu items ("Scan material", "Scan service request").

## Unclear in the capture
- The page holds two tables. The first has only a header row (ID | Operation Phase | Options) and a DataTables config error ("Cannot read properties of undefined (reading 'ajax')"). The visible table is `#datatableWarehouse`, which has the 14 rows.
- Two buttons open Add Operation Phase (top bar and panel heading).
- The Add dialog's label `for="input00"` does not match any element id; the Edit dialog's input has id `exampleInputEmail1` (an id that does not match the field).
- The truncated script lines do not show where the row id is read; the buttons carry it as `data-id`.
