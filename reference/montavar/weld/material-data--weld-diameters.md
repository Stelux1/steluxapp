# Weld Pilot → Material data → Weld diameters

Source: `weld__material__weld-diameters.txt`, `weld__material__weld-diameters__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/weld-diameters/`.
State of the page for the observing account: normal.

## Page
- Browser title: "Weld diameters - WeldPilot®". Breadcrumb: one active crumb "Weld diameters" (`/weldpilot/weld-diameters/`). Side menu: the group "Material data" is open. No tabs.
- Panel heading: list icon + "Weld diameters", with a blue "+" button at its right end.
- Buttons above the list: "Add weld diameters" (blue, `.buttonInsert`, plus icon, in the top bar; `href="#addWeldDiameters"`, `data-toggle="modal"`) → opens dialog `#addWeldDiameters`. The "+" button in the panel heading (no text) opens the same dialog.
- No other buttons (no Options menu, no export, no print, no refresh).

## List
- Table `#datatableWarehouse`, client-side (`serverSide: false`, `ajax: null`). No server-side table request in the capture.
- Columns in order: Diameter, Size in mm, Size in inches, Outline in mm, Sorting, Options. All visible, all sortable.
- Default sort: column 5 "Sorting", ascending (`order [[4,"asc"]]`).
- Page length options: 5, 20, 50, 100, 500; configured page length 20. The capture nevertheless holds all 500 body rows and its footer reads "Showing 1 to 500 of 500 entries" (no length select is written in the capture).
- Search: one global search box (magnifier icon, placeholder "Search", clear "x" button). No per-column search inputs, no filters.
- Row options, in order: pencil button (yellow, `.buttonEdit.open-editWeldDiameters`, `href="#editWeldDiameters"`, `data-id` = row id) → opens "Edit weld diameters"; trash button (red, `.buttonDelete.open-deleteWeldDiameters`, `href="#deleteWeldDiameters"`, `data-id` = row id) → opens "Delete weld diameters".
- Bulk actions: none. Export / print: none.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries"; empty "No data available in table"; no match "No matching records found".
- The list shows cell text as stored (mixed "," and "." decimals, "-" in Outline in mm for the rows "3500" and "2150"); see Sample data.

## Dialogs

### Add weld diameters (`#addWeldDiameters`) — opened by "Add weld diameters" button (and the heading "+" button)
Form `method="post"`, `onsubmit="return wsappsWeldDiameterDecimalsOk(this);"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Diameter | diameter | text | yes | empty | none |
| 2 | Size in mm | size | text | yes | empty | none |
| 3 | Size in inches | sizeinch | text | no | empty | `oninput="wsappsKeepWeldDecimal(this)"` (see rules) |
| 4 | Outline in mm | outline | text | no | empty | `oninput="wsappsKeepWeldDecimal(this)"` |
| 5 | Sorting | sorting | text | no | empty | none |

Buttons: "Add" (blue, `type="submit"`, `name="addWeldDiameters"`, class `btn-hideInsert`), "Cancel" (closes), header close "x".

### Edit weld diameters (`#editWeldDiameters`) — opened by the pencil in a row
The dialog in the page is empty; its body is loaded on click by `GET /core/ajax/editWeldDiameters.php?id=<row id>&action=showroom` (captured for id=490, row "3"x18""). Form `method="post"`, content in `#contentEditWeldDiameters`.

| # | Label | name | Type | Required | Default (row 490) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Diameter | diameter | text (id `exampleInputEmail1`, autocomplete off) | yes | 3"x18" | filled from the row |
| 2 | Size in mm | size | text | yes | 88,9 | filled from the row |
| 3 | Size in inches | sizeinch | number, step any, inputmode decimal | yes | 3 | filled from the row |
| 4 | Outline in mm | outline | number, step any, inputmode decimal | no | 279.1 | filled from the row |
| 5 | Sorting | sorting | text | no | 0 | filled from the row |
| 6 | (none) | editID | hidden | n/a | 490 | the row id |

Buttons: "Update" (yellow, `type="submit"`, `name="editWeldDiameters"`, class `btn-hideEdit`), "Cancel", header close "x". The list shows 279,1 for the same row while the edit field holds 279.1 (comma shown in the list, point in the number field).

### Delete weld diameters (`#deleteWeldDiameters`) — opened by the trash in a row
Text: "Are you sure?". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | deleteID | hidden (id `bookIdDeleteWeldDiameters`) | n/a | empty in the page | set from the clicked row's `data-id` (the handler is not in this capture) |

Buttons: "Delete" (red, trash icon, `type="submit"`, `name="deleteWeldDiameters"`, class `btn-hideDelete`), "Cancel".

Dialogs described: 3. Fields described: 5 + 6 + 1 = 12 (including 2 hidden).

## Rules found in the page's JavaScript
Inline script of this page (`wsappsKeepWeldDecimal`, `wsappsWeldDiameterDecimalsOk`), applying to the Add dialog only (the Edit body uses number inputs instead):
- `wsappsKeepWeldDecimal(el)` (on input in "Size in inches" and "Outline in mm"): a typed value is accepted only if empty, or digits with an optional "." or "," and further digits (also a leading "." / "," followed by digits, and digits followed by a trailing separator). Otherwise the field reverts to the last accepted value (stored in `data-last-decimal`) or to empty.
- `wsappsWeldDiameterDecimalsOk(form)` (on submit of the Add form): for "Size in inches" and "Outline in mm", the value is trimmed, "," becomes ".", one trailing "." is dropped; if the result is not empty and not digits with optional "." + digits, the submit is cancelled and an error toast "Size in inch and outline in mm must be numbers." is shown. Empty is allowed.
- Requests made on this page: `GET /core/ajax/editWeldDiameters.php?id=<id>&action=showroom` (on pencil click, returns the Edit body); page load also calls `/core/ajax/ajax-notifications.php?action=count_unread`. The form posts (add / edit / delete) go to the page itself as normal form posts named by their submit buttons (`addWeldDiameters`, `editWeldDiameters`, `deleteWeldDiameters`); their handlers are not in the capture.
- The shared scripts (`SAME-AS weld__start__dashboard`) are not part of this page's note.

## Sample data
Total: 500 rows (footer "Showing 1 to 500 of 500 entries"). The capture writes them as `TR` rows (no `DTROW` lines) in the default order (Sorting ascending). Columns: Diameter | Size in mm | Size in inches | Outline in mm | Sorting | row id (`data-id`, not a column).

First 30 rows:

| Diameter | Size in mm | Size in inches | Outline in mm | Sorting | row id |
|---|---|---|---|---|---|
| 3500 | 3500 | 138 | - | 0 | 519 |
| 2150 | 2150 | 84 | - | 0 | 518 |
| 5 mm | 5 | . | 5 | 0 | 489 |
| 6 mm | 6 | . | 6 | 0 | 488 |
| 3"x18" | 88,9 | 3 | 279,1 | 0 | 490 |
| 8 mm | 8 | -- | 8 | 1 | 524 |
| 10 mm | 10 | -- | 10 | 1 | 491 |
| 12 mm | 12 | -- | 12 | 1 | 498 |
| 16 mm | 16 | -- | 16 | 1 | 496 |
| 20 mm | 20 | . | 20 | 1 | 525 |
| 40 mm | 40 | -- | 40 | 1 | 529 |
| 50 mm | 50 | . | 50 | 1 | 495 |
| 60 mm | 60 | . | 60 | 1 | 530 |
| 80 mm | 80 | - | 80 | 1 | 499 |
| 100 mm | 100 | . | 100 | 1 | 494 |
| 120 mm | 120 | . | 120 | 1 | 500 |
| 140 mm | 140 | . | 140 | 1 | 493 |
| 160 mm | 160 | . | 160 | 1 | 520 |
| 180 mm | 180 | . | 180 | 1 | 516 |
| 200 mm | 200 | . | 200 | 1 | 527 |
| 240 mm | 240 | . | 240 | 1 | 517 |
| 260 mm | 260 | -- | 260 | 1 | 523 |
| 280 mm | 280 | - | 280 | 1 | 497 |
| 300 mm | 300 | . | 300 | 1 | 492 |
| 1/2" | 21,3 | 0,5 | 66,9 | 1 | 1 |
| 900mm | 900 | -- | 900 | 1 | 532 |
| 3/4"x16" | 26.7 | 0.75 | 83.8 | 2 | 522 |
| 3/4" | 26,7 | 0,75 | 83,8 | 2 | 2 |
| 3/4" x 2" | 26,7 | 0,75 | 83,8 | 2 | 476 |
| 3/4"x12" | 26,7 | 0,75 | 83,8 | 2 | 503 |

Values are shown exactly as stored: decimal comma and decimal point both occur (for example "26,7" and "26.7"), and "Size in inches" holds placeholder text ".", "-", "--" in rows such as "5 mm", "280 mm", "8 mm". Rows "3500" and "2150" have "-" in Outline in mm.

All distinct "Size in inches" values (53, in order of first appearance): 138 ; 84 ; . ; 3 ; -- ; - ; 0,5 ; 0.75 ; 0,75 ; 1 ; 1,25 ; 1,5 ; 1.5 ; 2 ; 4 ; 72 ; 58 ; 2,5 ; 3,5 ; 68 ; 4,75 ; 5 ; 6 ; 8 ; 10 ; 12 ; 14 ; 16 ; 18 ; 20 ; 22 ; 24 ; 26 ; 28 ; 30 ; 32 ; 34 ; 36 ; 38 ; 40 ; 42 ; 44 ; 46 ; 50 ; 52 ; 54 ; 56 ; 60 ; 64 ; 66 ; 48 ; 0,38 ; 1,38

## Not in the capture
- The Add and Delete dialogs were read from the page; the Edit body was captured for one row only (id 490); the numeric inputs of other rows were not captured.
- The code that fills `deleteID` and the server handlers of the three form posts (validation, duplicate checks, messages after save) are not in the capture.
- The page-length select and pagination controls are not written in the capture (only the options 5, 20, 50, 100, 500 from the table configuration).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
