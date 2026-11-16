# WeldPilot → General data → Companies

Source: `weld__general__companies.txt`, `weld__general__companies__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/companies/`.
State of the page for the observing account: normal.

## Page
- Title (`<title>`): "Companies - WeldPilot®".
- Breadcrumb: "Companies" (current item, link `/weldpilot/companies/`).
- Tabs: none.
- Panel heading: icon `fa-users`, text "Companies", and an "Add company" button (glyphicon plus, class `buttonInsert`, `href="#addCompany"`, `data-toggle="modal"`).
- Buttons above the list:
  - "Add company" in the top bar (class `buttonInsert`, `href="#addCompany"`, `data-toggle="modal"`) → opens dialog `#addCompany`.
  - "Add company" in the panel heading (same attributes) → opens dialog `#addCompany`.
- Top bar pilot switcher (links): MTOPilot® (`/mtopilot/`), ESTPilot® (`/estpilot/`), WeldPilot® (`/weldpilot/`), TeamPilot® (`/teampilot/`), ToolPilot® (`/toolpilot/`).
- Language links in the header (current page, `page=companies`): Nederlands (`lang=nl`), English (`lang=en`), Deutsch (`lang=de`), Français (`lang=fr`).

## List
- Table id `#datatableWarehouse` (DataTables, bootstrap styling). `serverSide: false`, `ajax: null`: the table is client-side; all rows are in the DOM. The capture shows no server-side table request for this list.
- Columns, in order (DT `cols` and header row):
  1. Name (`d` 0, visible, sortable)
  2. Address (`d` 1, visible, sortable)
  3. Phone (`d` 2, visible, sortable)
  4. Email address (`d` 3, visible, sortable)
  5. Options (`d` 4, visible, sortable)
- Hidden columns: none.
- Default sort: `order: [[3, "asc"]]` → Email address, ascending.
- Page length select: `name="datatableWarehouse_length"`, options 5 / 20 / 50 / 100 / 500, default 20 (`cur="20"`).
- Search: one global search box (`IN type="search" placeholder="Search"`, class `form-control input-sm`) with a clear button (aria-label "Clear"). No per-column search inputs.
- Filters: none.
- Row options (Options column), in order:
  - pencil icon (`glyphicon-pencil`, class `buttonEdit open-editCompany`, `href="#editCompany"`, `data-toggle="modal"`, `data-id` = company id) → opens the "Edit company" dialog.
  - trash icon (`glyphicon-trash`, class `buttonDelete open-deleteCompany`, `href="#deleteCompany"`, `data-toggle="modal"`, `data-id` = company id) → opens the "Delete company" dialog.
- Bulk actions (Options menu): none. The capture shows no row checkboxes and no Options menu on this page.
- Export / print buttons (DataTables Buttons, all `href="#"`, shown above the table, in this order): "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), print icon (`fa-print`, `buttons-print`).
- Info text: "Showing 1 to 2 of 2 entries" (template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table".
- Zero-match text (search without results): "No matching records found".
- Server-side table request: none (`ajax: null`).

## Dialogs

### Add company (`#addCompany`) — opened by "Add company" (top bar and panel heading buttons, class `buttonInsert`)
Header: close button (×, `fa-times`), title "Add company".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | empty | — |
| 2 | Address | address | text | yes | empty | — |
| 3 | Phone | phone | text | no | empty | — |
| 4 | Email address | email | email | no | empty | — |

- Hidden inputs: none.
- Tabs: none.
- Form: `method="post"` (no action attribute shown in the capture).
- All four labels carry `for="input00"` in the capture (as written).
- Buttons: "Add" (type submit, `name="addCompany"`, classes `btn-primary btn-hideInsert`); "Cancel" (type button, `data-dismiss="modal"`).
- Text rules in the dialog: none beyond the required fields (Name and Address are marked required).

### Edit company (`#editCompany`) — opened by the pencil icon in a row (class `open-editCompany`)
Header: close button (×), title "Edit company". The dialog's body is empty in the page's own DOM; it is loaded by a request when the pencil is clicked (see Rules). The captured body is from the request for company id 8 (`weld__general__companies__edit`).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | the row's name (sample, id 8: "Websonik Applicaties BV") | element id `exampleInputEmail1` (as written) |
| 2 | Address | address | text | yes | the row's address (sample: "Hopperweg 11-16 (16)") | — |
| 3 | Phone | phone | text | no | the row's phone (sample: "phone A") | — |
| 4 | Email address | email | text | no | the row's email (sample: "e-mail A") | type is `text` here, while the Add dialog uses `email` |
| 5 | (hidden) | editID | hidden | — | company id (sample: 8) | the value is the id of the row whose pencil was clicked |

- Labels in the loaded body: "Name", "Address", "Phone", "Email address" (`for="input00"`).
- Form: `method="post"` (no action attribute shown).
- Buttons: "Update" (type submit, `name="editCompany"`, classes `btn-warning btn-hideEdit`); "Cancel" (type button, `data-dismiss="modal"`).
- Text rules: none beyond the required fields.

### Delete company (`#deleteCompany`) — opened by the trash icon in a row (class `open-deleteCompany`)
Header: close button (×), title "Delete company".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, no label) | deleteID | hidden | — | empty in the page's DOM; set by the page script when the trash icon is clicked | id `bookIdEditCompany`; value = the row's `data-id` |

- Body text: "Are you sure?"
- Form: `method="post"` (no action attribute shown).
- Buttons: "Delete" (type submit, `name="deleteCompany"`, classes `btn-danger btn-hideDelete`, icon `glyphicon-trash`); "Cancel" (type button, `data-dismiss="modal"`).
- The Delete button has class `btn-hideDelete`; see Rules for the visibility rule.

Also present in the page, opened from elsewhere (no control on this page in the capture opens them): `#admin` ("System settings", Update/Cancel, form name "admin"), `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`. The handheld floating menu (Scan weld / Scan flange QR label / Add punch, outside the content area) is also in the page DOM.

## Rules found in the page's JavaScript
- Button visibility on load (page script, line `$(".buttonInsert").css("visibility", "visible")` and following): sets `visibility: visible` on `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport`, `.buttonPrint`, and `visibility: hidden` on `.btn-hideDelete`, `.btn-hideImport`, `.btn-hidePrint`. Effect on this page: the Delete button of `#deleteCompany` (class `btn-hideDelete`) is set to hidden. The capture shows no element with class `buttonImport` or `buttonPrint` on this page. The capture does not show a state in which the Delete button is visible.
- Trash icon click (`jQuery(document).on("click", ".open-deleteCompany", …)`): copies the row's id (`myBookId`) into `.modal-body #bookIdEditCompany` (the hidden `deleteID` field).
- Pencil icon click (`jQuery(document).on("click", ".open-editCompany", …)`): calls `showEditCompany()`, which requests `/core/ajax/editCompany.php?id=<id>&type=` and writes the response HTML into `#contentCompanyEdit`. The captured request was `GET /core/ajax/editCompany.php?id=8&type=&action=showroom` (status 200); the `&action=showroom` part is in the captured request, not in the excerpt of the script.
- Page marker: `var __wsappsDebugPage = "companies";`.
- Shared script (not attributable to this page): the capture contains the large shared script with requests to `/core/ajax/searchProject.php`, `/core/ajax/getListOfMaterials.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`. The capture does not show that this page calls them.
- Validation: none found in the capture's page-specific script. The only constraints are the HTML `required` attributes (Name and Address, Add and Edit) and `type="email"` on the Add dialog's Email field.
- Submit handling for `addCompany`, `editCompany`, `deleteCompany`: none found in the capture (the form has no action attribute shown).
- Requests on load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (header request, shared by all pages).

## Sample data
- Rows: 2 of 2 (info text "Showing 1 to 2 of 2 entries"). Page length 20.
- Rows, exactly as displayed:

| Name | Address | Phone | Email address | Options |
|---|---|---|---|---|
| Websonik Applicaties BV | Hopperweg 11-16 (16) | phone A | e-mail A | pencil (edit, data-id 8), trash (delete, data-id 8) |
| MONTAVAR METALNA LOLA | Jugoslovenska 2, 11250 Belgrade – Železnik | phone B | e-mail B | pencil (edit, data-id 7), trash (delete, data-id 7) |

- Sample dialog values for Edit (company id 8): Name "Websonik Applicaties BV", Address "Hopperweg 11-16 (16)", Phone "phone A", Email address "e-mail A", editID 8.

## Not in the capture
- Result of submitting Add company, Edit company or Delete company: no submit was made. Add: "Add company" button (topbar or panel heading). Edit: pencil icon, then "Update". Delete: trash icon, then "Delete".
- Export and print output: the "CSV", "Excel" and print buttons were not used.
- Search, sorting and page-length results: not captured (the default view only).
- Languages other than English: not captured (the header links only).
- Delete dialog's hidden value at runtime: set by the script on click; the capture shows only the empty field in the DOM.
- Edit dialog for any other company than id 8: not captured (the browser-pass notes also name id 8 only).
- Bulk actions / Options menu on this page: none is shown in the capture.
- Browser-pass notes (`raw/_interactive/I2a-welders-catalogs.md`, General data → Companies): "+ Add company", CSV / Excel / print, length 5 / 20 / 50 / 100 / 500 (20 default), the Edit dialog request `editCompany.php?id=8&type=` with fields Name, Address, Phone, Email address. These agree with the captures.
