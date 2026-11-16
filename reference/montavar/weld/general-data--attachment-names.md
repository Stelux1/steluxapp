# WeldPilot → General data → Attachment names

Source: `weld__general__attachment-names.txt`, `weld__general__attachment-names-type1.txt`, `weld__general__attachment-names-type2.txt`, `weld__general__attachment-names__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/iso-docs/` (the filtered views are `/weldpilot/index.php?page=iso-docs&type=1` for ISO book and `…&type=2` for Hydrotest).

State of the page for the observing account: normal (the list is shown).

## Page

- Browser title: "Attachment names - WeldPilot®". Panel heading: "Attachment names". Top-bar link to the same page: "Attachment names" (`/weldpilot/index.php?page=iso-docs`).
- Tabs: none in the capture.
- Buttons above the list:
  - "Sorting: OFF" (dark dropdown button with a filter icon, top bar). Its menu has three items, in order:
    - "OFF" → `/weldpilot/index.php?page=iso-docs` (default view, no filter).
    - "ISO book" → `…&type=1` (ISO book view).
    - "Hydrotest" → `…&type=2` (Hydrotest view).
    When a filtered view is open the button reads "Sorting: ISO book" or "Sorting: Hydrotest".
  - "Add Attachment name" (top bar, primary, plus icon, `href="#addIsoName"`, `data-toggle="modal"`) → opens dialog `#addIsoName`.
  - A second plus-icon button in the panel heading (no text, same `href="#addIsoName"`) → opens dialog `#addIsoName`.

## List

- Table id `#datatableWarehouse`, client-side DataTables (`serverSide: false`, `ajax: null`). The table is filled from the page itself.
- Columns, in order (header row "Name | ISO Book | Hydrotest | Options"):
  1. Name
  2. ISO Book (green check or orange × icon)
  3. Hydrotest (green check or orange × icon)
  4. Options (edit and delete icons, or a lock icon)
- No hidden columns. Sorting is off on all four columns. Default order: none (`order: []`).
- Default view page length: 20. Length options: 5 / 20 / 50 / 100 / 500. The "Show … entries" select is in the capture (`name="datatableWarehouse_length"`, current value 20).
- ISO book and Hydrotest views: page length 5000 (all rows on one page). The length options are 5 / 20 / 50 / 100 / 5000. The length select itself is not in the captured DOM of these two views.
- Per-column search inputs: none. One global search box (`type="search"`, placeholder "Search", with a clear button).
- Filter: the "Sorting" dropdown in the top bar (OFF / ISO book / Hydrotest), described above.
- Drag to reorder: in the ISO book and Hydrotest views only. Each row then has the class `wsapps-iso-doc-row` and attribute `data-iso-doc-id`, and its Name cell starts with a drag handle (arrows icon, tooltip "Drag to reorder"). The default view has no drag handle.
- Row options (Options column), in order:
  1. Pencil icon (warning button, `.buttonEdit.open-editIsoName`, `data-id` = row id) → opens `#editIsoName`.
  2. Trash icon (danger button, `.buttonDelete.open-deleteIsoName`, `data-id` = row id) → opens `#deleteIsoName`.
  3. On standard documents, the trash icon is replaced by a grey lock icon (`glyphicon-lock text-muted`) with the tooltip "Standard documents cannot be deleted." Only the pencil is active on these rows.
- Bulk actions: none on this page (no "Options ▾" menu and no row checkboxes, per the browser-pass notes table).
- Export and print buttons above the table: "CSV" (DataTables CSV button), "Excel" (DataTables Excel button), and a print icon button (DataTables print button). In the capture each is `href="#"`; their behaviour is the DataTables button default and is not shown in the capture.
- Info and empty texts:
  - "Showing 1 to 20 of 76 entries" (default view, `Showing _START_ to _END_ of _TOTAL_ entries`).
  - "Showing 1 to 64 of 64 entries" (ISO book view).
  - "Showing 1 to 6 of 6 entries" (Hydrotest view).
  - Empty table: "No data available in table". No match in the search: "No matching records found".
  - The labels "Show" and "entries" surround the length select.
- Server-side table request: none (`ajax: null`). The page makes one request of its own on load: `/core/ajax/ajax-notifications.php?action=count_unread` (site-wide, not part of this list).

Rows drawn in each view (from the captures):

| View | Rows in table | Rows drawn in capture | Row icons |
|---|---|---|---|
| OFF (default) | 76 | 20 (first page) | 18 trash, 2 lock |
| ISO book (`type=1`) | 64 | 40 ("+24 more rows of 64" is written in the capture) | 13 trash, 27 lock |
| Hydrotest (`type=2`) | 6 | 6 | 6 trash, no lock |

In the ISO book view every drawn row has the green check in ISO Book; in the Hydrotest view every row has the green check in Hydrotest.

## Dialogs

### Add Attachment name (`#addIsoName`) — opened by "Add Attachment name" (top bar) and the plus button in the panel heading

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | `name` | text (`.form-control`) | yes (`REQUIRED`) | empty | — |
| 2 | ISO Book | `isobook` | checkbox, `value="ok"`, id `checkboxExample4trd` | no | checked | — |
| 3 | Hydrotest | `hydrotest` | checkbox, `value="ok"`, id `checkboxExample4bgt` | no | unchecked | — |
| 4 | Position | `position` | select (select2 single, `data-control="select2"`) | no | "Before Isometric" | 2 options: `0` → Before Isometric (selected by default); `1` → After Isometric |
| 5 | (hidden, no label) | `type` | hidden, in the footer | — | `1` | — |

- Field 2 and 3 labels: "ISO Book" and "Hydrotest" (text next to the checkbox). Labels "Name" and "Position" are shown above the fields.
- Buttons: "Add" (primary, `name="addIsoName"`, submit; the page script hides it, see Rules) and "Cancel" (default, closes the dialog). Header close button (×).
- Rules stated in the dialog text: none beyond the required Name. The form has `method="post"`; the capture shows no `action` attribute.

### Edit Attachment name (`#editIsoName`) — opened by the pencil icon of a row

The dialog body is not in the static DOM. Clicking the pencil loads it into `#contentEditIsoName` (see Rules). The capture of this click is for row id 2 ("Flange tightening").

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | `name` | text (`.form-control`) | yes (`REQUIRED`) | stored name (row 2: "Flange tightening") | the record |
| 2 | ISO Book | `isobook` | checkbox, `value="ok"`, id `checkboxExample4trd2` | no | stored value (row 2: checked) | the record |
| 3 | Hydrotest | `hydrotest` | checkbox, `value="ok"`, id `checkboxExample4bgt2` | no | stored value (row 2: unchecked) | the record |
| 4 | Position | `position` | select (`select2-single form-control`, `data-control="select2"`) | no | stored value (row 2: "Before Isometric") | 2 options: `0` → Before Isometric (selected for row 2); `1` → After Isometric |
| 5 | (hidden, no label) | `editID` | hidden | — | row id (row 2: `2`) | the record |

- Buttons: "Update" (warning, `name="editIsoName"`, submit; hidden by the page script, see Rules) and "Cancel". Header close button (×).
- The browser-pass notes say the footer showed only "Cancel" on screen for this dialog (the Update button is in the DOM but not visible).

### Delete iAttachment name (`#deleteIsoName`) — opened by the trash icon of a row (not on standard rows)

The title is written exactly as in the reference: "Delete iAttachment name".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, no label) | `deleteID` (id `bookIdDeleteIsoName`) | hidden | — | empty in the static DOM; set to the row id when the trash icon is clicked | the clicked row |

- Body text: "Are you sure?".
- Buttons: "Delete" (danger, icon trash, `name="deleteIsoName"`, submit; hidden by the page script, see Rules) and "Cancel". Header close button (×).

Also present in the page, opened from elsewhere (not opened by a control on this page): `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`, `#searchProject`.

## Rules found in the page's JavaScript

- Edit: a click on `.open-editIsoName` requests `/core/ajax/editIsoName.php?id=` + `myBookId` and writes the returned HTML into `#contentEditIsoName`. The captured XHR for row 2 is `GET /core/ajax/editIsoName.php?id=2&action=showroom` (status 200). Where `myBookId` is set is not in the captured lines.
- Delete: a click on `.open-deleteIsoName` writes `myBookId` into the hidden input `#bookIdDeleteIsoName` inside `.modal-body`. No request is made on opening.
- Visibility of action buttons (page script, run on load): `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport` and `.buttonPrint` are set to visible; `.btn-hideInsert`, `.btn-hideEdit`, `.btn-hideDelete` and `.btn-hidePrint` are set to hidden (`visibility`). So the Add, Update and Delete submit buttons exist in the DOM but are not visible. The Add/Edit/Delete buttons are the `btn-hide*` ones.
- Row reorder (ISO book and Hydrotest views only; the init function checks `__wsappsIsoDocsSortMode` first and returns when it is empty):
  - Rows `tr.wsapps-iso-doc-row` are sortable vertically by the handle `.wsapps-iso-drag-handle`. Clicks in the Options column (inputs, buttons, links, forms) are not dragged.
  - On drop, the page collects `data-iso-doc-id` of the rows in their new order. If the list is empty it stops.
  - While saving, the table gets class `wsapps-iso-saving` (dimmed, no pointer events).
  - It sends `POST /core/ajax/reorderIsoDocsNames.php` with `mode` = the sort mode and `order` = the ids array.
  - Success: toastr message "Order saved". Error: toastr message "Something went wrong.". The saving class is removed when the request completes.
  - The captured lines do not show the value of the sort mode or where the init function is called.
- Styling rule used by the reorder code: the Options column is at least 90px wide and does not wrap.
- Validation: the Name field is `REQUIRED` in the HTML. No JavaScript validation for this page is in the capture.
- Other requests in the same script (`getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`) are in the shared script section. The capture does not tie them to this page, so they are not described here.

## Sample data

Totals and figures exactly as displayed: "Showing 1 to 20 of 76 entries" (default), "Showing 1 to 64 of 64 entries" (ISO book), "Showing 1 to 6 of 6 entries" (Hydrotest).

Default view, first 15 rows (of 20 drawn):

| # | Name | ISO Book | Hydrotest | Options | row id |
|---|---|---|---|---|---|
| 1 | Flange tightening | ✓ | × | edit, delete | 2 |
| 2 | Cleanliness form | × | × | edit, delete | 3 |
| 3 | Punchlist | × | ✓ | edit, delete | 4 |
| 4 | Support index | ✓ | × | edit, delete | 5 |
| 5 | 3D snippet | ✓ | ✓ | edit, delete | 6 |
| 6 | Supports | ✓ | × | edit, delete | 7 |
| 7 | Blind list | × | ✓ | edit, delete | 8 |
| 8 | Piping layout | ✓ | × | edit, delete | 9 |
| 9 | Piping and instrumentation diagram (P&ID) | × | ✓ | edit, delete | 10 |
| 10 | Prefab signed off | ✓ | × | edit, delete | 11 |
| 11 | Pressure gauge/recorder calibration cert. | × | ✓ | edit, delete | 14 |
| 12 | Pressure test ITP | × | ✓ | edit, delete | 15 |
| 13 | Field signed off | ✓ | × | edit, delete | 16 |
| 14 | Tracing | × | × | edit, delete | 17 |
| 15 | Pressure Test Checklist | × | × | edit, delete | 18 |

Rows 16–20 of the default view: Special item (20, × ×, delete), Linelist (21, × ×, delete), Info Documents (22, ✓ ×, delete), Task sheet (23, ✓ ×, lock only), ITP documents (24, ✓ ×, lock only).

ISO book view, first 15 rows (of 40 drawn; all ISO Book ✓, Hydrotest ×):

| # | Name | Options | row id |
|---|---|---|---|
| 1 | 2-200-AS PREFABRICATED | edit, delete | 73 |
| 2 | 108 - Isometric pre-fab | edit, delete | 72 |
| 3 | 107 - Blank LISL rev | edit, delete | 71 |
| 4 | 106 - CUT LISt rev | edit, delete | 70 |
| 5 | 103 - MTO SUPPORT rev | edit, delete | 69 |
| 6 | 105 - 3D rev | edit, delete | 68 |
| 7 | Ready for work | edit, delete | 64 |
| 8 | 104 - Support rev | edit, delete | 67 |
| 9 | 101 - Isometric rev | edit, delete | 65 |
| 10 | 102 - MTO rev | edit, delete | 66 |
| 11 | Task sheet | lock only | 23 |
| 12 | Isometric | lock only | 26 |
| 13 | Support SHOP | edit, delete | 45 |
| 14 | Support FIELD | edit, delete | 46 |
| 15 | Support index | edit, delete | 5 |

Hydrotest view, all 6 rows (all Hydrotest ✓; all with edit and delete):

| # | Name | ISO Book | Hydrotest | row id |
|---|---|---|---|---|
| 1 | Punchlist | × | ✓ | 4 |
| 2 | Pressure test ITP | × | ✓ | 15 |
| 3 | Blind list | × | ✓ | 8 |
| 4 | Pressure gauge/recorder calibration cert. | × | ✓ | 14 |
| 5 | Piping and instrumentation diagram (P&ID) | × | ✓ | 10 |
| 6 | 3D snippet | ✓ | ✓ | 6 |

Edit dialog example (row id 2, "Flange tightening"): Name "Flange tightening"; ISO Book checked; Hydrotest unchecked; Position "Before Isometric".

## Not in the capture

- Rows 21–76 of the default view (56 rows), and rows 41–64 of the ISO book view (24 rows, marked "+24 more rows of 64"). Control: the "Show … entries" select and the table pager in the default view, and the "Sorting: ISO book" menu item for the ISO book view. The pager controls are not in the captured DOM.
- Edit dialog content for any row other than id 2: loaded only by clicking that row's pencil icon.
- Delete dialog as opened on a row: the static DOM only. The click that fills `deleteID` was not captured. Control: trash icon of a non-standard row.
- Add dialog as opened: static DOM only (no click capture). Control: "Add Attachment name".
- Results of the Add, Update and Delete submits, and the request they send: not captured and not sent.
- Reorder request `POST /core/ajax/reorderIsoDocsNames.php` and its response: not captured (no drag was made). Control: drag a row's handle in the ISO book or Hydrotest view.
- Export output of "CSV", "Excel" and print: not captured.
- The "Sorting: OFF" value stored for the user: the browser-pass notes call it a stored setting; the capture does not show what is stored.
- The page-length select in the ISO book and Hydrotest views is not in the captured DOM.
- The browser-pass notes say the footer of the Edit dialog showed only "Cancel" on screen, so the Update button was not seen. Nothing else on this page was seen beyond the captures.
