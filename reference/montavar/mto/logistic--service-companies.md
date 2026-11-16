# MTO Pilot → Logistic → Service companies

Source: `mto__logistic__service-companies.txt`, `mto__logistic__service-companies__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/service-companies/`.
State of the page for the observing account: normal.

## Page
- Browser title: "Service companies - MTOPilot®".
- Breadcrumb: none in the capture.
- Heading of the panel: icon (fa-users) and the text "Service companies", followed by a second "+" button (icon only, `glyphicon-plus`, `href="#addCompany"`, `data-toggle="modal"`), which opens the Add company dialog.
- Tabs: none in the capture.
- Buttons above the list:
  - "Add company" (text button, `href="#addCompany"`, `data-effect="mfp-flipInY"`, `data-toggle="modal"`, `glyphicon-plus`), placed above the panel → opens the Add company dialog (`#addCompany`).
  - "+" icon button in the panel heading → opens the Add company dialog (`#addCompany`).
  - "Options" toolbar button: not in the capture. From the browser-pass notes (`_interactive/I3-mto.md`): a `⚙ Options ▾` button in the toolbar. Its menu entries were not captured.
- Other elements in the page DOM, not specific to this list (from the same page, no opener shown): a handheld floating "Scan QR" button (`title="Scan QR"`) with two menu items, "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`).
- Side menu: "Logistic" is open (accordion, `menu-open`). Top bar link "Service companies" → `/mtopilot/service-companies/`.

## List
- Table id `#datatableWarehouse` (the data table). A second, unnamed table in the DOM has the same header row only, no body rows, and its DataTables init failed with "TypeError: Cannot read properties of undefined (reading 'ajax')". Ignore it for layout purposes.
- Columns, in order (title → data index):
  0. Name
  1. Address
  2. Phone
  3. Email address
  4. Enabled on this site
  5. Options
  6. checkbox column (header is `<input type="checkbox" id="checkAll">`, the select-all box)
- Hidden columns: none (all `vis: true`).
- All columns sortable (`sort: true`).
- Default sort: `order: [[5, "asc"]]` → column index 5 (Options), ascending.
- Page length options: 5, 20, 50, 100, 500. Default page length: 20. The length selector element itself is not in the DOM capture.
- Per-column search inputs: none in the capture.
- Filters: none in the capture.
- Global search: a box with placeholder "Search" (`type="search"`, class `form-control input-sm`, inside `.wsapps-dt-search` with a search icon) and a clear button (aria-label "Clear", icon `fa-times`).
- Row options, in cell order:
  - Edit (icon-only button, `.buttonEdit.open-editCompany`, `btn-warning`, `glyphicon-pencil`, `data-id` = row id, `href="#editCompany"`, `data-toggle="modal"`) → opens the Edit company dialog for that row.
  - Delete (icon-only button, `.buttonDelete.open-deleteCompany`, `btn-danger`, `glyphicon-trash`, `data-id` = row id, `href="#deleteCompany"`, `data-toggle="modal"`) → opens the Delete company dialog for that row.
  - Row checkbox (`name="ccid_<id>"`, `value="s<id>"`, class `checkbox11`) for bulk actions.
- Bulk actions (Options menu): not in the capture (see Page).
- Export and print buttons above the table, in order: "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), and an icon-only print button (`buttons-print`, `fa-print`). All are `href="#"`.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (sample shows "Showing 1 to 2 of 2 entries").
- Empty text: "No data available in table".
- No-match text: "No matching records found".
- Search label text: empty (the `search` language string is empty).
- Server-side table request: none. `serverSide: false`, `ajax: null`. The rows are in the page.
- Other requests on load: `/core/ajax/ajax-notifications.php?action=count_unread` (the page's notification counter, not part of the table).

## Dialogs

### Add company (`#addCompany`) — opened by "Add company" button and the "+" icon button in the panel heading
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | (empty) | — |
| 2 | Address | address | text | yes | (empty) | — |
| 3 | Phone | phone | text | no | (empty) | — |
| 4 | Email address | email | email | no | (empty) | — |

No hidden inputs, no selects, no checkboxes. All four inputs are in the form's body (no tabs).

Buttons:
- "Add" (`btn-primary`, `btn-hideInsert`, `name="addServiceCompany"`, type submit).
- "Cancel" (`btn default`, closes the dialog).
- Header close button (icon `fa-times`, closes the dialog).

Rules stated in the dialog: none in text. The Name and Address fields are marked required.

### Edit company (`#editCompany`) — opened by the Edit button in each row (`.open-editCompany`, `data-id` = row id)
The closed dialog has an empty body in the DOM. The body is loaded by a GET request when the dialog opens (see Rules). The capture shows it for row id 2, "Transport":

| # | Label | name | Type | Required | Default (row 2, "Transport") | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text (id `exampleInputEmail1`, `autocomplete="off"`) | yes | Transport | loaded by request for the row |
| 2 | Address | address | text | yes | dbbfn | loaded by request for the row |
| 3 | Phone | phone | text | no | (empty) | loaded by request for the row |
| 4 | Email address | email | text | no | (empty) | loaded by request for the row; type is `text` here, not `email` as in Add |
| 5 | (hidden) | editID | hidden | — | 2 | value is the row id |

No selects, no checkboxes, no tabs.

Buttons:
- "Update" (`btn-warning`, `btn-hideEdit`, `name="editServiceCompany"`, type submit).
- "Cancel" (`btn default`, closes the dialog).
- Header close button (icon `fa-times`).

Rules stated in the dialog: none in text. Name and Address are marked required.

### Delete company (`#deleteCompany`) — opened by the Delete button in each row (`.open-deleteCompany`, `data-id` = row id)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID (element id `bookIdEditCompany`) | hidden | — | (empty in the closed dialog) | value is not shown in the capture; it is set from the row when the dialog opens (per the script, see Rules) |

Body text: "Are you sure?"

Buttons:
- "Delete" (`btn-danger`, `btn-hideDelete`, `name="deleteServiceCompany"`, type submit, icon `glyphicon-trash`).
- "Cancel" (`btn default`, closes the dialog).
- Header close button (icon `fa-times`).

## Rules found in the page's JavaScript
Only the script lines that the capture lists as not present on earlier pages are shown. The surrounding code of these lines is not in the capture.

- The page sets its debug id: `__wsappsDebugPage = "service-companies"`.
- Edit company: the page calls `/core/ajax/editCompany.php?id=<myBookId>&type=s` (a URL built from the variable `myBookId`). The capture shows this URL only. The HTTP method and the button it serves are not visible in the capture. On opening Edit, the browser made `GET /core/ajax/editCompany.php?id=2&type=s&action=showroom` (status 200), so the parameters are `id` (row id), `type` (`s`) and `action` (`showroom`) for that load.
- Search of projects: the page calls `/core/ajax/searchProject.php?time=<n>`. This belongs to the Project search dialog (`#searchProject`), which is in the DOM; its opener is not in this capture.
- Several other `$.getJSON` calls appear in the same script, with parameter names `id`, `timer` and `ajax` (value `'true'`): `/core/ajax/getListOfMaterials.php` (param `id`), `/core/ajax/saveAddCalculationModalState.php` (params `k`, `v`), `/core/ajax/searchUnitRates.php` (param `id`), `/core/ajax/searchTarrifs.php` (param `id`), `/core/ajax/searchFactors.php` (param `id`). None of them is tied to a control of this list page in the capture.
- Validation messages, field show/hide conditions, and computed values for the Add, Edit and Delete dialogs: none found in the capture. The `required` and `type="email"` attributes are in the markup (see the tables above).
- Confirmation or result messages after Add, Update or Delete: none found in the capture (toastr is loaded on the page; its calls are not shown).

## Sample data
- Row count: 2 companies in total, 2 shown on the one page. Info text: "Showing 1 to 2 of 2 entries".
- Enabled on this site: "No" for both rows.

| Name | Address | Phone | Email address | Enabled on this site | Options | Row id |
|---|---|---|---|---|---|---|
| Transport | dbbfn | - | - | No | Edit, Delete | 2 |
| Farbara | fbxb | - | - | No | Edit, Delete | 1 |

Row order as displayed: Transport, then Farbara.

The "Enabled on this site" column is shown as "No" text in the DOM. The orange badge styling is from the browser-pass notes, not visible in the DOM text.

The Add and Edit dialogs have no control for "Enabled on this site" in the capture.

## Not in the capture
- Options menu (toolbar `⚙ Options ▾` per the browser-pass notes): its entries and any bulk actions are not captured. The row checkboxes and the select-all checkbox are present.
- Length selector element of the table (values 5, 20, 50, 100, 500 are in the DataTables config only).
- Rows beyond the first page: none; the table has 2 rows.
- Value of the hidden `deleteID` after the Delete button is clicked (the capture shows the closed dialog only).
- Result messages after Add, Update or Delete.
- Also present in the page, opened from elsewhere or not opened by a control on this page in the capture (not described above): `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#srArchiveScanModal`, `#materialQrScanModal`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`.
