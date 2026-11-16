# WeldPilot → Material data → Material supplier

Source: `weld__material__material-supplier.txt`, `weld__material__material-supplier__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/material-supplier/`.
State of the page for the observing account: normal.

Contact details (e-mail addresses and phone numbers) of the suppliers are present in the sandbox data and in the captures. They are not copied here: the notes say "present (redacted)" where a value exists.

## Page
- Title (browser tab): "Material supplier - WeldPilot®". Panel title: "Material supplier" (list icon, `glyphicon-list`).
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Top bar: link "Material supplier" (`/weldpilot/material-supplier/`, the page itself). Language links "Nederlands", "English", "Deutsch", "Français" (`page=material-supplier`). App switcher tiles "MTOPilot®", "ESTPilot®", "WeldPilot®", "TeamPilot®", "ToolPilot®". Button "Add material supplier" (`#addMaterialSupplier`).
- Buttons above the list:
  - "Add material supplier" (top bar, btn-primary, `href="#addMaterialSupplier"`, `data-toggle="modal"`) → opens the Add dialog.
  - Same button with a "+" icon in the panel heading (`href="#addMaterialSupplier"`) → opens the same Add dialog.
- Shared handheld menu (global, not specific to this page, floating): "Scan weld", "Scan flange QR label", "Add punch".
- No project-site select is shown in the capture for this page.

## List
- Columns in order (DT `cols` and header row): Name | Address | Email address | Phone | Enabled on this site | Options | (header checkbox `#checkAll`, unnamed column).
- Hidden columns: none (all `vis: true`).
- Default sort: `order [[5,"asc"]]`, i.e. on column index 5 "Options" (the column carries buttons, not text). All columns are sortable.
- Page length: default 20. Length options in the DataTables config: 5, 20, 50, 100, 500 (the length select is not in the captured DOM).
- Per-column search inputs: none. Filters: none.
- Search: one global search input (`type="search"`, placeholder "Search"), with a clear button (`aria-label="Clear"`, icon `fa-times`).
- Row options, left to right:
  - pencil (`.buttonEdit.open-editMaterialSupplier`, btn-warning, `glyphicon-pencil`, `href="#editMaterialSupplier"`, `data-id`) → Edit dialog.
  - trash (`.buttonDelete.open-deleteMaterialSupplier`, btn-danger, `glyphicon-trash`, `href="#deleteMaterialSupplier"`, `data-id`) → Delete dialog.
  - row checkbox (`#id_<id>`, class `checkbox11`, `name="ccid_<id>"`, `value="s<id>"`) → selection for bulk actions.
- Bulk actions: an "Options ▾" menu (`#showWPSgroupOptions` in the script) is listed for this page in the browser-pass notes. The capture does not show its element in the DOM and its items were not opened. See "Not in the capture".
- Export / print: "CSV" (`.buttons-csv`, `href="#"`), "Excel" (`.buttons-excel`, `href="#"`), print icon (`.buttons-print`, `fa-print`, `href="#"`).
- Info text: "Showing 1 to 8 of 8 entries" (DataTables info template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none. `serverSide: false`, `ajax: null`; all 8 rows are in the page.

## Dialogs

### Add material supplier (`#addMaterialSupplier`) — opened by "Add material supplier" (top bar) or the "+" in the panel heading
Form `method="post" enctype="multipart/form-data"`, no `action` in the capture. No hidden inputs.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | empty | — |
| 2 | Address | address | text | no | empty | — |
| 3 | Zip code | zip | text | no | empty | — |
| 4 | Residence | residence | text | no | empty | — |
| 5 | Mailbox number | mailbox | text | no | empty | — |
| 6 | MN-Zip code | mnzip | text | no | empty | — |
| 7 | MN-Residence | mnresidence | text | no | empty | — |
| 8 | Phone | phone | text | no | empty | — |
| 9 | Fax | fax | text | no | empty | — |
| 10 | Email address | email | email | no | empty | — |

- Buttons: "Add" (`btn-primary`, `btn-hideInsert`, `name="addMaterialSupplier"`, type submit); "Cancel" (`btn default`, closes the dialog).
- Rules stated in the dialog: none beyond the required mark on Name.
- The Add dialog is in the DOM; the capture does not show it opened by a click.

### Edit material supplier (`#editMaterialSupplier`) — opened by the pencil in a row
The body is loaded by a request on click into `#contentEditMaterialSupplier` (see "Rules"). The values below are those of row 1 (PFF BV), as the request returned them. Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | "PFF BV" | input has `id="exampleInputEmail1"` |
| 2 | Address | address | text | no | "Wielewaalweg 4" | — |
| 3 | Zip code | zip | text | no | "4791 PD" | — |
| 4 | Residence | residence | text | no | "Klundert" | — |
| 5 | Mailbox number | mailbox | text | no | empty | — |
| 6 | MN-Zip code | mnzip | text | no | empty | — |
| 7 | MN-Residence | mnresidence | text | no | empty | — |
| 8 | Phone | phone | text | no | present (redacted) | — |
| 9 | Fax | fax | text | no | empty | — |
| 10 | Email address | email | email | no | present (redacted) | — |
| 11 | (hidden) | editID | hidden | — | "1" | in the form body, sent by the loaded HTML |
| 12 | (hidden) | secureCode | hidden | — | set by the click handler (value not reproduced) | in the footer, `#bookIdEditMaterialSupplierSecure`; set on each click |

- Buttons: "Update" (`btn-warning`, `btn-hideEdit`, `name="editMaterialSupplier"`, type submit); "Cancel" (`btn default`, closes).
- Labels in the loaded body: all carry `for="input00"`. The capture shows no input with that id.
- Labels are exactly as listed in the table, except "Fax " which has a trailing space in the loaded HTML.
- Rules stated in the dialog: none.

### Delete material supplier (`#deleteMaterialSupplier`) — opened by the trash icon in a row
Form `method="post"`, no `action` in the capture.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID | hidden | — | empty in the DOM | set by the click handler to the row's `data-id` |
| 2 | (hidden) | secureCode | hidden | — | empty in the DOM | set by the click handler (`#bookIdDeleteMaterialSupplierSecure`); value not reproduced |

- Body text: "Are you sure?"
- Buttons: "Delete" (`btn-danger`, `btn-hideDelete`, `glyphicon-trash`, `name="deleteMaterialSupplier"`, type submit); "Cancel" (`btn default`, closes).
- Rules stated in the dialog: none beyond "Are you sure?".

Also present in the page, opened from elsewhere (not opened by a control of this page in the capture): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.

## Rules found in the page's JavaScript
- **Edit button handler** (`.open-editMaterialSupplier` click, shared script): reads the row id, sets `#bookIdEditMaterialSupplierSecure` to a fixed prefix + the row id + a fixed suffix (`mspE`), then requests the edit form for that id and writes the response HTML into `#contentEditMaterialSupplier`. Request: `GET /core/ajax/editMaterialSupplier.php?id=<id>` (the observed request also carried `&action=showroom`; the capture does not show the code that adds it).
- **Delete button handler** (`.open-deleteMaterialSupplier` click, shared script): sets `#bookIdDeleteMaterialSupplier` to the row id and `#bookIdDeleteMaterialSupplierSecure` to a fixed prefix + row id + fixed suffix (`msp`). No request.
- **Bulk selection** (inline block, this page only): on click or change of `#datatableWarehouse input.checkbox11`, and on click or change of `#checkAll`, the page collects the checked row values, writes them comma-separated into `#activationIds` and `#deactivationIds`, and removes the class `is-inactive` from `#showWPSgroupOptions` when at least one row is checked (adds it when none is). `#checkAll` checks or unchecks all row checkboxes and then runs the same sync.
- **Options menu guard** (inline block, this page only): a click on `#showWPSgroupOptions .dropdown-toggle` is stopped while `#showWPSgroupOptions` has `is-inactive`.
- **Page marker** (shared script): `__wsappsDebugPage = "material-supplier"`.
- **Validation:** Name is required (HTML `required` on Add and on Edit). E-mail fields are `type="email"` (browser format check). No other JavaScript validation found in the capture.
- **Requests the page makes:**
  - On load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (top bar notifications; not specific to this page).
  - On pencil click: `GET /core/ajax/editMaterialSupplier.php?id=<id>&action=showroom`, response written into the Edit dialog.
  - On the forms' submit buttons (Add, Update, Delete): POST of the form fields listed above; the capture shows no submit.
  - Other request paths present in the shared script fragments of this capture (`getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`). The capture does not tie them to this page's controls, so they are not listed as this page's requests.

## Sample data
Sandbox: 8 suppliers, all on one page. "Showing 1 to 8 of 8 entries". "Enabled on this site" is "No" for all 8. The row id (`data-id`) is in the last column of this table. Rows are in the rendered order.

| Name | Address | Email address | Phone | Enabled on this site | Row id |
|---|---|---|---|---|---|
| Technip Energies | - | - | - | No | 7 |
| Tecnicas Reunidas S.A. | - | - | - | No | 8 |
| ELIMP D.O.O. | 13. OKTOBRA , UMKA | present (redacted) | - | No | 3 |
| HONEX D.O.O. | Mije Kovacevica 9/3, Beograd | present (redacted) | - | No | 4 |
| Montavar Metalna Lola D.O.O. | Jugoslovenska 2 | present (redacted) | - | No | 6 |
| PFF BV | Wielewaalweg 4 | present (redacted) | present (redacted) | No | 1 |
| VAN LEEUVEN JR BUIZENHANDEL BV | Lindtsedijk 120 3336 LE Zwijndrecht | present (redacted) | present (redacted) | No | 2 |
| Bus Industrial Tools | Belder 7 | present (redacted) | present (redacted) | No | 5 |

Address column: the page shows only the `address` value; zip code and residence are not in the list. The Edit dialog for row 1 (PFF BV) shows Zip code "4791 PD" and Residence "Klundert".

## Not in the capture
- **Options ▾ menu** (bulk actions): the browser-pass notes (I2a) list "Options ▾" on this page's panel, but the capture does not show its items, and they were not opened. On other pages with this menu the items are "Activate selected" (`#optsActivate`) and "Deactivate selected" (`#optsDeactivate`), per the same notes. Opening the menu is the control that would show them.
- **CSV / Excel / print** outputs: buttons present, not clicked, no file captured.
- **Add dialog and Delete dialog**: captured from the base page DOM only, not opened by click. No browser-pass note covers their opening.
- **Edit dialog for other rows**: only row 1 was opened (pencil of PFF BV). Each row's pencil loads its own record.
- **Submit responses** (Add, Update, Delete): no submit was made; the response and any resulting row changes are not in the capture.
- **Rows beyond the first page**: none; all 8 rows are shown.
- **Project-site scope of "Enabled on this site"**: the capture shows the column only, no control for changing it on this page.

## Notes on the capture
- A first `TABLE` element without an id, holding only the header row, is in the DOM before the list. Its DataTables read returned `TypeError: Cannot read properties of undefined (reading 'ajax')`. It is not described as a separate list.
- The list's DataTables config shows `total: 8` and `shown: 8`.
