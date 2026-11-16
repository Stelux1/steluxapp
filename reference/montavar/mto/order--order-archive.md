# MTO Pilot → Order / Take in → Order archive

Source: `mto__order__order-archive.txt`, `mto__order__order-archive-15.txt`, `mto__order__order-archive-6.txt`, `mto__order__order-archive__assign-supplier.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-order-archive&from=01.01.2020&to=31.12.2026`.
State of the page for the observing account: normal.

The page has two views: the list (`page=material-order-archive`, with the filter card) and the order contents of one order (`page=material-order-archive&fileid=<id>`), reached from the list. Both are described here.

## Page

- Browser title: `Order archive - MTOPilot®`.
- Panel heading (list view): list icon, "Order archive", and a button group on the right.
- Breadcrumb (list view): `Zandbak` (link `index.php?page=project-sites&id=1`) › `Order archive` (link `index.php?page=material-order-archive&from=01.11.2026&to=30.11.2026`). The breadcrumb link's date range (01.11.2026 to 30.11.2026) differs from the page's own default range (01.01.2020 to 31.12.2026).
- Breadcrumb (order contents view, `fileid=`): `Zandbak` › `Order archive` › the request number of the order (`00007` for fileid 15 and `00004` for fileid 6, each linking to `index.php?page=material-order-archive&fileid=<id>`).
- Tabs: none.
- Buttons above the list:
  - "Order by date desc." (dark button with dropdown, `data-toggle="dropdown"`, right side of the panel heading) → menu with two links:
    - "Order by date desc." → `index.php?page=material-order-archive&project=&from=01.01.2020&to=31.12.2026`
    - "Order by date asc." → `index.php?page=material-order-archive&project=&from=01.01.2020&to=31.12.2026&sort=asc`
- The order contents view has no buttons above its table and no filter card. Its only control above the table is the table's search box (see List).
- No export, print or Options (bulk action) button is in the capture for either view.

## List

Filter card (list view only), a GET form (`method="get"`):
- Project: select2 select `name="project"`, shown as "All projects" (see Dialogs for other fields; no dialog).
- From Date: text input `name="from"`, placeholder "From date", value `01.01.2020`.
- To Date: text input `name="to"`, placeholder "To date", value `31.12.2026`.
- "Filter" button (`name="search"`, type submit, search icon).
- Hidden inputs: `page` = `material-order-archive`, `type` (empty), `project` (empty).

Table (list view): id `datatable4paginate`, classes table-striped, table-bordered, table-hover.
- Columns in order: **Date**, **Request number**, **Assigned supplier**, **Options**.
- Hidden columns: none. Default sort: not in the capture (the table has no DataTables configuration line in this capture; see "Not in the capture").
- Page length options, search inputs, info text and empty text for this table: not in the capture.
- Server-side request (`ajax` url): not in the capture for this table.
- Row options (Options column), three icon buttons per row, in order:
  1. Link icon (`glyphicon-link`, class `open-linkSupplier`, orange outline, `href="#linkSupplier"`, `data-toggle="modal"`, `data-id` = the order file id) → opens the dialog "Assign order to supplier" (see Dialogs).
  2. Print icon (`glyphicon-print`, orange outline) → `../core/export/down.php?file=<yyyymmdd>_R<request number>-OrderMaterial.pdf`, target `_blank` (opens an existing PDF in a new tab; not opened in the browser pass).
  3. List icon (`glyphicon-list`, orange outline) → `index.php?page=material-order-archive&fileid=<file id>` (the order contents view).
- Assigned supplier shows `NA` when no supplier is assigned, otherwise the supplier name.

Table (order contents view, `fileid=`): id `datatable3`, inside a DataTables wrapper `datatable3_wrapper`.
- Search box above the table: label with search icon, input `type="search"` placeholder "Search", clear button (aria-label "Clear", times icon) — class `wsapps-dt-search`.
- DataTables configuration (from the capture): `serverSide: false`, `ajax: null` (client side), `pageLength: 20`, `order: [[0, "asc"]]`, `lengthMenu: [10, 25, 50, 100]`.
- Columns in order (all visible, none sortable: `sort: false`): **Material group**, **Article No**, **Material No**, **DIA**, **LBS/SCH**, **Description**, **UOM**, **Ordered**, **Received**, **Left**, **Audit**. Header row text: "Material group, Article No, Material No, DIA, LBS/SCH, Description, UOM, Ordered, Received, Left, Audit".
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries".
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Search text: empty.
- Row count in capture: total 1, shown 1 (for both captured orders).
- Row options / cells: "Received" value is a link (`href="#"`, tooltip) for fileid 15 and plain text for fileid 6. "Audit" column has one truck icon link (`fa-truck`, `title="Audit trail"`, `data-toggle="modal"`) → the Audit trail dialog (see Dialogs).

Filter and table requests: the filter form submits as GET (a full page load with the query string shown in the URL above); no separate table request is visible in the capture.

## Dialogs

### Assign order to supplier (`#linkSupplier`) — opened by the link icon (`.open-linkSupplier`) in the Options column of a list row

Title: "Assign order to supplier". The body is loaded on click by a request (see Rules); the capture shows the loaded state for the row with data-id 15 (request number 00007). Other rows' links carry data-id 14, 7, 6, 5, 2 and 1.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Supplier | supplier | select (class `form-control`) | not marked required in the capture | `PFF BV Klundert` (value 1) | 8 options (value → text): 1 → PFF BV Klundert (selected by default); 2 → VAN LEEUVEN JR BUIZENHANDEL BV NL; 3 → ELIMP D.O.O. RS; 4 → HONEX D.O.O. RS; 5 → Bus Industrial Tools Roosendaal; 6 → Montavar Metalna Lola D.O.O.; 7 → Technip Energies; 8 → Tecnicas Reunidas S.A. The options come from the loaded body (see Rules), not from the page's own markup. |
| 2 | (no label) | editID | hidden | — | `15` for request 00007 (the order file id; equals the row's data-id) | none; the value comes from the link that was clicked |

- Dialog buttons: "Assign" (class `btn btn-primary`, name `linkSupplier`, type submit); "Cancel" (class `btn default`, closes the dialog); header close button (times icon, closes the dialog).
- Dialog text that states a rule: none. The dialog has no help text or validation message in the capture.
- Form: `method="post"`. The form's action attribute is not in the capture.
- The select for supplier and the hidden field are inside a `#contentLinkSupplier` container, which is replaced by the loaded body.

### Audit trail (inline modal, `#showOrderAuditTrail-<hash>`) — opened by the truck icon (`title="Audit trail"`) in the Audit column of the order contents view

This modal sits in the row's Audit cell in the capture. It has no inputs. Its ids are per row: `showOrderAuditTrail-749a50de0e05ff11d3653b9132faf618` (row 00007, fileid 15) and `showOrderAuditTrail-bc64ef8916e7a782a2eae5d89c7c75b9` (row 00004, fileid 6).

Content for fileid 15 (request 00007), in the order shown:
- Summary: Audit / Material No `8138268881` / `BLT/N A320-L43 CTD 8UN 1000MM 4IN` / Ord. No. `00007` / Date `06.11.2025.` / Ordered `10.00` / Received in this order `10.00` / Inventory on site `0.00`.
- Table headers: Date | Order No. | Quantity | Supplier | Actie | Gebruiker.
  - `06.11.2025 07:43` | `00007` | `-10.00` | `PFF BV` | `Correctie` | `Administrator`
  - `06.11.2025 07:42` | `00007` | `10.00` | `PFF BV` | `Ontvangst` | `Administrator`
  - `06.11.2025 07:42` | `00007` | `10.00` | `PFF BV` | `Ontvangst` | `Administrator`
- "Actie" is Dutch for "action"; the two values shown are "Correctie" (correction) and "Ontvangst" (receipt). "Gebruiker" is Dutch for "user"; the user name shown is the account `Administrator`.

Content for fileid 6 (request 00004):
- Summary: Audit / Material No `8138268881` / `BLT/N A320-L43 CTD 8UN 1000MM 4IN` / Ord. No. `00004` / Date `04.07.2024.` / Ordered `3.00` / Received in this order `0.00` / Inventory on site `0.00`.
- Table headers as above, no rows. The message shown is `Er zijn nog geen auditregels voor dit materiaal.` (Dutch for "There are no audit lines for this material yet.").

Buttons: "Close" (class `btn btn-primary`, closes the modal). Header close button (×).

Dialog fields: none (no inputs).

## Rules found in the page's JavaScript

- Click handler on `.open-linkSupplier`: builds the URL `/core/ajax/linkSupplier.php?id=` plus the clicked link's data-id (variable `myBookId`), requests it, and puts the returned HTML into `#contentLinkSupplier`. The request observed on click was `GET /core/ajax/linkSupplier.php?id=15&action=showroom` (status 200); the `action=showroom` parameter appears in the observed request, but the part of the script that adds it is not in the capture.
- Validation for the Assign form, its submit handler, and the form's action URL: none found in the capture.
- Filter form: no client-side validation or handler found in the capture.
- Dropdown "Order by date desc." / "asc.": plain links; no script found in the capture that handles them.
- Tooltip on the Received value (fileid view): a Bootstrap tooltip (`data-toggle="tooltip"`, `data-placement="left"`, HTML content in `data-original-title`). The script line that sets `placement: 'left'` is shown in the capture without its surrounding code.
- Other script lines in the capture's shared page script that are not tied to a visible control on this page: `$.getJSON("/core/ajax/getListOfMaterials.php", ...)`, `/core/ajax/searchProject.php` (the Project search dialog, not on this page), `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`. The capture shows these lines without their calling context; they are not confirmed as requests made by this page.
- Page marker: `var __wsappsDebugPage = "material-order-archive";`.
- Requests on load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (page chrome, present on every page).

## Sample data

List view (sandbox, filter "All projects", range 01.01.2020 to 31.12.2026; 7 rows, no paging shown in the capture):

| Date | Request number | Assigned supplier | Link data-id (order file id) | PDF file | List link (fileid) |
|---|---|---|---|---|---|
| 06.11.2025. 07:42 | 00007 | NA | 15 | 20251106_R00007-OrderMaterial.pdf | 15 |
| 06.11.2025. 07:41 | 00006 | NA | 14 | 20251106_R00006-OrderMaterial.pdf | 14 |
| 04.07.2024. 11:23 | 00005 | NA | 7 | 20240704_R00005-OrderMaterial.pdf | 7 |
| 04.07.2024. 11:14 | 00004 | NA | 6 | 20240704_R00004-OrderMaterial.pdf | 6 |
| 04.07.2024. 10:22 | 00003 | NA | 5 | 20240704_R00003-OrderMaterial.pdf | 5 |
| 21.03.2024. 13:44 | 00002 | PFF BV | 2 | 20240321_R00002-OrderMaterial.pdf | 2 |
| 20.03.2024. 11:16 | 00001 | PFF BV | 1 | 20240320_R00001-OrderMaterial.pdf | 1 |

Counts: 7 orders in the list; 2 of them have an assigned supplier (PFF BV), 5 show NA. The filter's project select has 2 options (All projects, 20240101).

Order contents, fileid 15 (request 00007), 1 row, shown 1 of total 1:

| Material group | Article No | Material No | DIA | LBS/SCH | Description | UOM | Ordered | Received | Left | Audit |
|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | EA | 10 | 10 | 0 | truck icon |

Received tooltip (fileid 15) — columns Date | Supplier | Quantity: `06.11.2025. 07:43` | `PFF BV` | `-10`; `06.11.2025. 07:42` | `PFF BV` | starts with `1` (cut off in the capture; the third row is not visible in the tooltip).

Order contents, fileid 6 (request 00004), 1 row, shown 1 of total 1:

| Material group | Article No | Material No | DIA | LBS/SCH | Description | UOM | Ordered | Received | Left | Audit |
|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | EA | 3 | 0 | 3 | truck icon |

Assign dialog sample (request 00007): Supplier preselected `PFF BV Klundert`; hidden `editID` = `15`.

## Not in the capture

- Assign dialog submit: the "Assign" button was not clicked in the browser pass (dialog cancelled, per the browser-pass notes). The result of submitting, and the form's action URL, are not in the capture.
- Assign dialog for the other rows (data-id 14, 7, 6, 5, 2, 1): not opened; the body loads on click by the request described above.
- Printing: the PDF links (print icon in each row) were not opened.
- Order contents views for file ids 14, 7, 5, 2 and 1: not captured. Only 15 and 6 were captured (the list links for the others are listed above).
- Table configuration for the list view (`datatable4paginate`): no DataTables configuration line in the capture, so page length, search inputs, sort, info and empty texts, and any server-side request for the list are not shown.
- Filter results: the filter was not run with other dates or projects; only the default range is shown.
- Sort dropdown: the "asc." option was not selected; the capture shows the list in the order of the default "Order by date desc.".
- Tooltip for the Received value on fileid 15 is cut off after the second row in the capture.
- Dialog that is in the DOM for order contents view but has no opener seen in the capture: `#optsActivate` "Activate selected" (body text "By clicking ‘Confirm,’ you will activate the selected options.", hidden `selectedIDS` (readonly), hidden `fileid` = 15 or 6, buttons "Confirm" (class `btn btn-success`, name `optsActivate`, type submit) and "Cancel"). No row checkbox, Options menu or other control that opens it appears in the capture for these views. From the browser-pass notes: no opener for it was noted either.
- Pages beyond the first page of the list: none shown; the list has 7 rows.

Also present in the page (in the DOM, opened from elsewhere, not from a control of this page as captured): editCompanyData ("Company data"), passwordChange ("Change password"), themeChange ("Change theme"), admin ("System settings"), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal, and the floating "Scan QR" menu (scan material, scan service request).
