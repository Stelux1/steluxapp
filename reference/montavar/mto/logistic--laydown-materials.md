# MTOPilot → Logistic → Laydown materials

Source: `mto__logistic__laydown-materials.txt`, `mto__logistic__laydown-materials__edit.txt`, `mto__logistic__laydown-material-1.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-laydowns-material`.
State of the page for the observing account: normal.

## Page
- Page title (`<title>`): empty; the capture shows only "- MTOPilot®".
- Panel heading: "Laydown areas - Materials" (with a `glyphicon-tasks` icon). The panel heading also holds an icon-only plus button (see below).
- Breadcrumb (top bar): link "Laydown areas - Materials" → `index.php?page=material-laydowns-material`.
- Tabs: none.
- Buttons above the list:
  - "Add laydown" (top bar, `btn-primary`, plus icon) → opens dialog `#addLaydownMaterial` (`data-toggle="modal"`).
  - Icon-only plus button in the panel heading (`glyphicon-plus`, no label) → opens dialog `#addLaydownMaterial`.
  - "CSV" → `href="#"`, DataTables Buttons class `buttons-csv` (no handler line in the capture).
  - "Excel" → `href="#"`, DataTables Buttons class `buttons-excel` (no handler line in the capture).
  - Print icon (`fa-print`, class `buttons-print`) → `href="#"` (no handler line in the capture).
- The top bar also has the app tiles (MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®) and the language links (Nederlands, English, Deutsch, Français); these are shared with the other pages.

## List
- Columns in order (DataTables `cols` and header row):
  1. "Laydown" (data 0, visible, sortable)
  2. "Enabled on this site" (data 1, visible, sortable)
  3. "Options" (data 2, visible, sortable)
  4. Header checkbox `#checkAll` with no title (data 3, visible, sortable in the configuration)
- Hidden columns: none.
- Default sort: column index 2, "Options", ascending (`order: [[2,"asc"]]`).
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Per-column search inputs: none.
- Filters: none.
- Global search box: `type="search"`, placeholder "Search", with a clear button (`aria-label="Clear"`, times icon). Search label text is empty.
- Row options (per row, in order):
  1. Laydown name: blue link → `index.php?page=material-laydowns-material&id=<id>` (the detail page below).
  2. Pencil icon (`glyphicon-pencil`, classes `buttonEdit open-editLaydownMaterial btn btn-xs btn-warning`, `data-id`) → opens dialog `#editLaydownMaterial`.
  3. Trash icon (`glyphicon-trash`, classes `buttonDelete open-deleteLaydownMaterial btn btn-xs btn-danger`, `data-id`) → opens dialog `#deleteLaydownMaterial`.
  4. Row checkbox (`#id_<id>`, class `checkbox11`, `name="ccid_<id>"`, value `s<id>`) in the last column.
- Bulk actions (Options menu): no Options menu is shown on this page in the capture. (The browser-pass notes mention "Options ▾" menus on laydowns; that is not shown on this page in the capture.)
- Export / print buttons: CSV, Excel, print (see Page).
- Info and empty texts (DataTables `lang`):
  - info: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered as "Showing 1 to 2 of 2 entries")
  - empty: "No data available in table"
  - zero (no match): "No matching records found"
- Server-side table request: none. The table is client-side (`serverSide: false`, `ajax: null`); the rows are in the HTML.
- Layout note: the capture contains two `TABLE` elements. The first one (no id) holds only the header row and a DataTables error ("TypeError: Cannot read properties of undefined (reading 'ajax')"). The table with id `datatableWarehouse` holds the data described here.

## Detail page (`page=material-laydowns-material&id=1`, reached by clicking a laydown name)
Captured as `mto__logistic__laydown-material-1.txt`. URL: `/mtopilot/index.php?page=material-laydowns-material&id=1`. State: normal.
- Breadcrumb (top bar): link "Laydown areas" → `index.php?page=material-laydowns-material`; a link with empty text → `index.php?page=material-laydowns&id=1` (its label is not in the capture).
- Button "History" (`btn-primary`, top bar) → plain link `index.php?page=material-laydowns&id=1&type=history` (a page, not a dialog).
- Panel: no panel heading in the capture (only the panel body).
- Buttons: CSV, Excel, print (same `href="#"` as the list). No "Add" button on this page.
- Global search box: same as the list (placeholder "Search", clear button).
- Columns in order: "Project", "ISO", "Spool", "PWHT", "Chemical clean", "No of services".
- Hidden columns: none. Default sort: column index 4, "Chemical clean", ascending (`order: [[4,"asc"]]`).
- Page length: default 20; options 5, 20, 50, 100, 500.
- Per-column search, filters, row options, bulk actions: none in the capture (the table has no rows).
- Server-side table request: none (`serverSide: false`, `ajax: null`).
- Info and empty texts: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered "Showing 0 to 0 of 0 entries"); empty "No data available in table"; zero "No matching records found".
- The first table on this page (no id) again shows a DataTables error and only its header; the table `datatableWarehouse` shows one row: "No data available in table" (colspan 6).

## Dialogs

### Add laydown (`#addLaydownMaterial`) — opened by "Add laydown" (top bar) and by the icon-only plus button (panel heading)
Modal title: "Add laydown". Form `method="post"`. Body is in the page (not loaded by a request).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | name | text | yes (`required`) | empty (no `val`) | Label `for="input00"`; input has class `form-control` and no id. No other fields. |

- Buttons: "Add" (`btn-primary`, type submit, `name="addLaydownMaterial"`); "Cancel" (`btn default`, closes the dialog). Close × icon in the header.
- Text in the dialog that states a rule: none. The "Laydown" field is required (HTML `required`).

### Edit laydown material (`#editLaydownMaterial`) — opened by the pencil icon of each row (`data-id` = row id)
Modal title: "Edit laydown material". Form `method="post"`. The body is empty in the page and is filled by a request when the pencil is clicked (see Rules). Captured for row id 1 only ("Plava Hala").

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | name | text | yes (`required`) | "Plava Hala" (row id 1) | Loaded by the request `editLaydownMaterial.php?id=<row id>` into `#contentLaydownMaterial`. Element id in the loaded HTML `exampleInputEmail1`; label `for="input00"`. The loaded HTML carries two `value` attributes on this input (`value="Plava Hala"` and `value=""`); the captured field shows "Plava Hala". |
| 2 | (no label, hidden) | editID | hidden | — | "1" (row id 1) | Set in the loaded HTML from the row id. |

- Buttons: "Update" (`btn-warning`, type submit, `name="editLaydownMaterial"`); "Cancel" (`btn default`, closes the dialog). Close × icon in the header.
- Text in the dialog that states a rule: none.

### Delete laydown (`#deleteLaydownMaterial`) — opened by the trash icon of each row (`data-id` = row id)
Modal title: "Delete laydown". Form `method="post"`. Body is in the page.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label, hidden) | deleteID | hidden | — | empty in the page; set to the row's `data-id` when the trash icon is clicked | Input id `bookIdDeleteLaydownMaterial`. Set by the click handler (see Rules). |

- Buttons: "Delete" (`btn-danger`, type submit, `name="deleteLaydownMaterial"`, trash icon); "Cancel" (`btn default`, closes the dialog). Close × icon in the header.
- Text in the dialog that states a rule: "Are you sure?" (confirmation question).

## Rules found in the page's JavaScript
- Required field: the "Laydown" field in Add and Edit has the HTML `required` attribute. No JavaScript validation and no validation message lines are in the capture (none found in the capture beyond `required`).
- Pencil click (`jQuery(document).on("click", ".open-editLaydownMaterial", …)`): reads the row id from `data-id` into `myBookId`, then requests `/core/ajax/editLaydownMaterial.php?id=` + `myBookId` and puts the response HTML into `#contentLaydownMaterial` (`.html(data)`). The captured request on opening row 1 was `/core/ajax/editLaydownMaterial.php?id=1&action=showroom` (status 200). The `action=showroom` part is not in the visible excerpt of the script; the rest of this handler is in the shared script of earlier captures.
- Trash click (`jQuery(document).on("click", ".open-deleteLaydownMaterial", …)`): copies `myBookId` into the value of `.modal-body #bookIdDeleteLaydownMaterial`.
- Requests the page makes on load: `/core/ajax/ajax-notifications.php?action=count_unread` (both captures).
- Other requests in the shared inline script that the page carries (visible as excerpts, not triggered by a control on this page in the capture): `/core/ajax/getListOfMaterials.php` (params `id`, `timer`, `ajax`); `/core/ajax/searchProject.php` (with a `time` parameter); `/core/ajax/saveAddCalculationModalState.php` (params `k`, `v`, `timer`, `ajax`); `/core/ajax/searchUnitRates.php` (param `id`); `/core/ajax/searchTarrifs.php` (param `id`); `/core/ajax/searchFactors.php` (param `id`). The `getListOfMaterials.php` and `searchProject.php` requests belong to other dialogs of the page (see the list below).
- Select-all checkbox `#checkAll` and row checkboxes: no handler line in the capture.
- Sorting, paging and search: DataTables defaults with the configuration above; no custom handler lines are in the capture.

## Sample data
- List page: 2 laydown rows, "Showing 1 to 2 of 2 entries" (total 2, shown 2). No percentages or key figures are shown.

| Laydown | Enabled on this site | Options | Row checkbox |
|---|---|---|---|
| Plava Hala (link `id=1`) | No | pencil (data-id 1), trash (data-id 1) | `#id_1`, `name="ccid_1"`, value `s1` |
| SS (link `id=2`) | No | pencil (data-id 2), trash (data-id 2) | `#id_2`, `name="ccid_2"`, value `s2` |

- Detail page (`id=1`): 0 rows ("Showing 0 to 0 of 0 entries", total 0). The empty text "No data available in table" is shown.

## Not in the capture
- The Edit dialog body for any row other than id 1: loaded after the pencil click (`editLaydownMaterial.php?id=<row id>`); captured only for "Plava Hala" (id 1). The control: pencil icon of each row.
- The value of the Delete dialog's hidden `deleteID` after a click: set by the script; the capture has the field empty in the page and does not show the value after a click.
- Results of Add, Update and Delete (submits were not made, the server responses are not captured).
- Export files (CSV, Excel) and the print output: the buttons are `href="#"`; the capture has no handler lines for them.
- Rows beyond the first page: none (2 rows in total).
- The detail page's laydown name link text (empty in the capture) and the rows of the detail table (none for laydown id 1).
- An Options menu for bulk actions on this page: not shown.
- Dialogs of the other pages that are present in the DOM but not opened by a control on this page (listed below).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal. (The last two are reached by the QR floating button menu items "Scan material" and "Scan service request", `data-action` `material-qr-scan` and `service-request-scan`; the capture does not show which dialog each item opens, so they are not described.)
