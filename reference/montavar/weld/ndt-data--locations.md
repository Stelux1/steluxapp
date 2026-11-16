# WeldPilot → NDT data → NDT locations

Source: `weld__ndt__locations.txt`, `weld__ndt__locations__edit.txt`, `weld__ndt__locations__options-menu.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/ndt-location/`.
State of the page for the observing account: normal (the list is shown; no rights message).

## Page
- Browser title: `NDT locations - WeldPilot®`. No breadcrumb and no tabs in the capture.
- Side menu item (topbar section): "NDT locations" → `/weldpilot/ndt-location/`.
- Panel heading: list icon + "NDT locations".
- Buttons above the list:
  - "Add NDT location" (panel heading, icon plus, `btn-primary`, `href="#addNdtLocation"`, `data-toggle="modal"`) → opens dialog `#addNdtLocation`.
  - "Add NDT location" (top bar, `btn-sm btn-primary btn-block`, same `href` and `data-toggle`) → opens dialog `#addNdtLocation`.
- Export and print buttons (above the search box): "CSV" (`buttons-csv`, `href="#"`), "Excel" (`buttons-excel`, `href="#"`), print icon (`buttons-print`, `href="#"`, title not shown).
- Language links in the top bar (not on this page's content): Nederlands, English, Deutsch, Français (`index.php?lang=…&page=ndt-location`).
- The "Options ▾" menu (⚙ Options ▾) that holds the bulk actions is not in the captured DOM. The browser-pass notes (`_interactive/I2a-welders-catalogs.md`, section on NDT locations) say it was seen on this page; the menu itself is captured (see Options menu under List).

## List
- Table: one client-side DataTable, id `datatableWarehouse` (the page also has a header-only table with the same header row, see Not in the capture).
- Columns, in order:
  1. "NDT location" (data key 0, visible, sortable)
  2. "Enabled on this site" (data key 1, visible, sortable)
  3. "Options" (data key 2, visible, sortable) — row buttons, see below
  4. Header: checkbox `#checkAll` (no text title; data key 3, visible, sortable) — row checkboxes
- Hidden columns: none.
- Default sort: `order [[2,"asc"]]` — ascending on column index 2 ("Options").
- Page length: default 20. Length options: 5, 20, 50, 100, 500. The capture shows no length selector in the DOM.
- Server side: no. `ajax` is null (the table holds its rows in the page). No `ajax` URL.
- Per-column search inputs: none.
- Filters: none.
- Global search: input `type="search"`, class `form-control input-sm`, placeholder "Search", with a clear button (`aria-label="Clear"`, icon times). Search label text is empty.
- Row options (column "Options"), left to right:
  1. Pencil (button `btn-xs btn-warning btn-block`, class `buttonEdit open-editNdtLocation`, `data-id`, `href="#editNdtLocation"`, `data-toggle="modal"`) → opens "Edit NDT location" for that row.
  2. Trash (button `btn-xs btn-danger btn-block`, class `buttonDelete open-deleteNdtLocation`, `data-id`, `href="#deleteNdtLocation"`, `data-toggle="modal"`) → opens "Delete NDT location" for that row.
- Row checkbox (column 4): `name="ccid_<id>"`, `value="s<id>"`, id `id_<id>`, class `checkbox11`. Checked state is not shown in the capture; the browser-pass notes say the checkbox was ticked and unticked again with no request made.
- Bulk actions (the "Options ▾" menu, from the captured dropdown `UL .dropdown-menu.pull-right`):
  1. "Activate selected" → opens dialog `#optsActivate` (`href="#optsActivate"`, `data-toggle="modal"`).
  2. "Deactivate selected" → opens dialog `#optsDeactivate` (`href="#optsDeactivate"`, `data-toggle="modal"`).
  Both are confirmations only; neither was confirmed in the browser pass.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (configured). Sample footer shows "Showing 1 to 4 of 4 entries".
- Empty text: "No data available in table". No-match text: "No matching records found".
- Server-side table request (`ajax` url): none; the table is client-side.
- Page load makes one request: `GET /core/ajax/ajax-notifications.php?action=count_unread`.

## Dialogs

### Add NDT location (`#addNdtLocation`) — opened by "Add NDT location" (top bar and panel heading)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT location | location | text (class `form-control`) | yes (HTML required) | empty | none. The label has `for="input00"`, but the input has no id in the capture. |

Buttons: "Add" (`btn-primary btn-hideInsert`, type submit, name `addNdtLocation`); "Cancel" (`btn-default`, closes the dialog).
Rules stated in the dialog: none (no help text in the capture).
The form is `method="post"`; the form `action` is not in the capture.

### Edit NDT location (`#editNdtLocation`) — opened by the pencil button of a row
The body is loaded by a request after the click (`GET /core/ajax/editNdtLocation.php?id=<row id>&action=showroom`, status 200). The capture of the click (row id 10) shows:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT location | location | text (class `form-control`, id `exampleInputEmail1` in the loaded body) | yes | the row's current name (row id 10: "Applus Antwerpen") | Loaded by the request above. The label has `for="input00"`, which does not match the input id. |
| 2 | (hidden) | editID | hidden | — | the row id (10 in the sample) | In the loaded body, after the location field. |
| 3 | (hidden) | secureCode | hidden (id `bookIdEditNdtLocationSecure`) | — | filled by the page's script from the clicked row; the value is not copied here | In the dialog footer, present before the click. |

Buttons: "Update" (`btn-warning btn-hideEdit`, type submit, name `editNdtLocation`); "Cancel" (`btn-default`, closes).
Rules stated in the dialog: none.

### Delete NDT location (`#deleteNdtLocation`) — opened by the trash button of a row
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label; text "Are you sure?") | deleteID | hidden (id `bookIdDeleteNdtLocation`) | — | filled by the page's script from the clicked row's `data-id` | none |
| 2 | (hidden) | secureCode | hidden (id `bookIdDeleteNdtLocationSecure`) | — | filled by the page's script from the clicked row; the value is not copied here | none |

Buttons: "Delete" (`btn-danger btn-hideDelete`, type submit, name `deleteNdtLocation`); "Cancel" (`btn-default`, closes).
Rules stated in the dialog: the body says "Are you sure?" and nothing more. The delete is submitted from this dialog; the capture does not show the form's action.

### Activate selected (`#optsActivate`) — opened by "Activate selected" in the Options menu
Not in this capture; taken from the dashboard capture `weld__start__dashboard.txt` (the dialog is identical there, "SAME-AS" here).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text) | selectedIDS | hidden (id `activationIds`, class `form-control`, readonly) | — | filled by the page's script with the selected rows; the capture does not show the script that fills it | inside the form |
| 2 | (hidden) | fileid | hidden | — | no value in the capture | outside the form, in the dialog |

Text: "By clicking ‘Confirm,’ you will activate the selected options."
Buttons: "Confirm" (`btn-success`, type submit, name `optsActivate`); "Cancel" (closes).

### Deactivate selected (`#optsDeactivate`) — opened by "Deactivate selected" in the Options menu
Taken from the dashboard capture (SAME-AS here).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text) | selectedIDS | hidden (id `deactivationIds`, class `form-control`, readonly) | — | filled by the page's script with the selected rows; the capture does not show the script that fills it | inside the form |

Text: "By clicking ‘Confirm,’ you will deactivate the selected options."
Buttons: "Confirm" (`btn-success`, type submit, name `optsDeactivate`); "Cancel" (closes).

## Rules found in the page's JavaScript
- Edit: clicking a pencil button (`.open-editNdtLocation`) takes the row's `data-id` and its secure value, writes the secure value into `#bookIdEditNdtLocationSecure`, and requests `/core/ajax/editNdtLocation.php?id=<row id>` (the logged request also carries `action=showroom`), then puts the response into `#contentEditNdtLocation`. The capture shows these lines only partly (some lines are in the shared script; the lines where the id and secure value are read are not shown).
- Delete: clicking a trash button (`.open-deleteNdtLocation`) writes the row id into `.modal-body #bookIdDeleteNdtLocation` and the secure value into `.modal-body #bookIdDeleteNdtLocationSecure` (selectors from the script).
- Validation: none found in the capture for this page other than the HTML `required` attribute on the location field.
- Fields shown or hidden on a condition: none found in the capture for this page.
- Values computed in the browser: none found in the capture for this page.
- Requests made by this page: `GET /core/ajax/ajax-notifications.php?action=count_unread` (on load); `GET /core/ajax/editNdtLocation.php?id=<id>&action=showroom` (on opening Edit). No request is made when Add, Update, Delete or the bulk dialogs are opened.
- The page-level script defines `__wsappsDebugPage = "ndt-location"`.
- The shared script also contains request functions for other screens (`searchProject.php`, `getListOfMaterials.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`); no control on this page was seen to call them.
- The "Enabled on this site" column has no script in the capture.

## Sample data
- Row count: 4 total, 4 shown, on one page (page length 20).
- Key figures: none shown besides the footer "Showing 1 to 4 of 4 entries".

| # | NDT location | Enabled on this site | Edit row id (`data-id`) | Row checkbox |
|---|---|---|---|---|
| 1 | Applus Antwerpen | No | 10 | `ccid_10` / `s10` |
| 2 | Mistras Antwerpen | No | 6 | `ccid_6` / `s6` |
| 3 | TEAM Antwerpen | No | 12 | `ccid_12` / `s12` |
| 4 | Workshop Beograd | No | 11 | `ccid_11` / `s11` |

Row order is as displayed (the table's default sort is column "Options", ascending; the order above is the DOM order of the captured rows).

## Not in the capture
- The "Options ▾" trigger button (⚙ Options ▾) that opens the bulk menu: not in the captured DOM. Seen in the browser pass (see Page).
- The response of Add, Update, Delete and the Activate/Deactivate confirmations: not requested in this capture (no submit was clicked).
- The form `action` of the Add, Edit and Delete forms: not in the capture (all three are `method="post"`).
- The first table header clone: the capture contains a header-only table with the same header row (`TABLE .table.table-striped…dataTable`, no id) and the DataTables config of that table reads `{"err":"TypeError: Cannot read properties of undefined (reading 'ajax')"}`. I could not make sense of this error; the table with id `datatableWarehouse` is the one with the rows and config described above.
- Pagination controls and a page-length selector: not in the captured DOM (only 4 rows, one page).
- Checked state of the row checkboxes and of the header checkbox: not shown (`cur="on"` is the checkbox value, not its state).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal. Handheld floating menu items (Scan weld, Scan flange QR label, Add punch) are also on every page.
