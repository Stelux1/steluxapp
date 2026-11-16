# MTOPilot → Order / Take in → Order materials

Source: `mto__order__order-materials.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-order`.
State of the page for the observing account: normal.

## Page
- Page title: `Order materials - MTOPilot®`.
- Side menu: the accordion item "Order / Take in" (class `menu-open`, cart icon) is open. Its sub-items are not written in this capture (they are in the full menu of `mto__start__dashboard`).
- Top bar: a link "Order materials" → `index.php?page=material-order`. No separate breadcrumb element and no tabs appear in the capture.
- Panel heading (inside `#content`): "Order materials".
- Buttons above the list (top bar, right side):
  - `Export` (class `btn btn-dark btn-sm`, icon `fa fa-file-excel-o`) → link `export-orders.php`.
  - `Order checked materials` (class `btn btn-sm btn-primary`, `type="submit"`, icon `fa fa-shopping-cart`) → `onclick="return refreshIt()"`. `refreshIt()` schedules a page reload after 300 ms (see Rules). The capture does not show a form element around this button; the browser-pass notes say that this button creates an order at once (from the browser-pass notes, not clicked).
- Floating action button (on every page, rendered in the DOM of this page): `Scan QR` (class `wsapps-handheld-fab-btn`, icon `fa fa-qrcode`), with menu items `Scan material` (`data-action="material-qr-scan"`) and `Scan service request` (`data-action="service-request-scan"`).
- Header language links: Nederlands (`lang=nl`), English (`lang=en`), Deutsch (`lang=de`), Français (`lang=fr`), each keeping `page=material-order`.

## List
- Table id `#dtMaterialOrder`, client-side (`serverSide: false`, `ajax: null`). No server-side table request exists for this page.
- Columns in order (title → data index):
  1. Material group (0), sortable
  2. Article No (1), sortable
  3. Material No (2), sortable
  4. DIA (3), sortable
  5. LBS/SCH (4), sortable
  6. Description (5), sortable
  7. Quantity (6), sortable
  8. UOM (7), sortable
  9. checkbox column (8), not sortable. Header: checkbox `#checkAll`, title and aria-label "Check all".
- Hidden columns: none (all `vis: true`).
- Default sort: the DT configuration line says `order: [[7,"asc"]]` (UOM, ascending). The inline script in the capture initialises the table with `order: [[0, 'asc']]` (Material group, ascending). The capture contains both; the rendered rows follow Material group ascending. Which one is in effect at runtime is not settled by the capture.
- Paging: the inline script sets `paging: false`. The DT configuration line lists `pageLength: 10` and `lengthMenu: [10, 25, 50, 100]`. No length selector is drawn in the capture, and the DOM layout is `rtip` (no length control, no pagination). The table has 5 rows in total.
- Per-column search inputs: none.
- Global search: `IN #moSearch type="text" placeholder="Search"` (no `name` attribute shown), inside `LABEL .wsapps-dt-search` with a magnifier icon (`fa fa-search`). Clear button `BTN #moSearchClear` with `aria-label="Clear"`, icon `fa fa-times`. The search is client-side (DataTables search on the table).
- Filters above the table:
  - `SEL #moFilterProject` (class `ft-select2 select2-hidden-accessible`), current value "All projects", 2 options: 0 → All projects; 1 → 20240101. No option is marked as default in the capture. No `name` attribute shown.
  - `SEL #moFilterIso` (same classes), current value "All isometrics", 1 option: 0 → All isometrics. No `name` attribute shown.
  - Their change handlers are in Rules.
  - A funnel icon next to them and the filter dialog `#filterMaterialOrder` are described in the Dialogs section (the browser-pass notes mention the funnel; the capture does not show its element).
- Form around the table: `FORM #orderMaterialForm action="../core/pdf/order-material.php" method="post" target="_blank"`.

  | name | type | value in capture |
  |---|---|---|
  | projectsite | hidden | 1 |
  | iso | hidden | (none shown) |
  | project | hidden | (none shown) |

- Row options: none per row except the row checkbox (`name="cbList[]"`, class `checkbox11`, `type="checkbox"`, value a JSON string with keys `ids`, `materialNo`, `quantity`; see Sample data). No row icons or row buttons.
- Bulk actions (Options menu): none in the capture. The only bulk control is the header checkbox "Check all".
- Export / print buttons: the `Export` link described under Page. The table has no CSV, Excel or print buttons (the DataTables configuration has no buttons).
- Info and empty texts:
  - info: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered as "Showing 1 to 5 of 5 entries")
  - empty: "No data available in table"
  - zero (no search match): "No matching records found"
  - search label: none

## Dialogs

The capture contains no control on this page that points to a dialog (`data-target`, `data-toggle` or `href="#id"`). Two dialogs are written in full in the capture, not as `SAME-AS` of another page. They belong to this page, but no control in the capture opens them. Both are described here so that every field is listed.

### Filter materials (`#filterMaterialOrder`) — opened by: no control in the capture (the browser-pass notes mention a funnel icon beside the filters; its element is not in the capture)
Form: `FORM method="get"` (no `action` attribute shown).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, no label) | page | hidden, value `material-order` | — | material-order | fixed |
| 2 | Type | project | select (`.select2-single.form-control`, `data-control="select2"`) | not marked in capture | All projects (current; no option marked as default) | 2 options: 0 → All projects; 1 → 20240101 |
| 3 | Find isometric | iso | select (same classes and attributes) | not marked in capture | All isometrics (current; no option marked as default) | 1 option: 0 → All isometrics |

Buttons (footer): `Filter` (`btn btn-dark`, `name="filterIsoExecution"`, `type="submit"`); `Cancel` (`btn default`, `data-dismiss="modal"`). Title: "Filter materials". Close button: `BTN .close data-dismiss="modal"`, icon `fa fa-times`. No rule text in the dialog.

### Order checked materials (`#pdfOrderMaterialLanguage`) — opened by: no control in the capture
Form: `FORM action="../core/pdf/order-material.php" method="get" target="_blank"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | lang | select (`.select2-single.form-control`, `data-control="select2"`) | not marked in capture | English | 4 options: en → English (marked as default, `*`); nl → Nederlands; de → Deutsch; fr → Français |
| 2 | (hidden, no label) | project | hidden | — | (empty, no value shown) | filled by the page when opened (not in capture) |
| 3 | (hidden, no label) | id | hidden | — | (empty, no value shown) | filled by the page when opened (not in capture) |

Buttons (footer): `Go` (`btn btn-primary btn-hidePrint`, `name="go"`, `type="submit"`); `Cancel` (`btn default`, `data-dismiss="modal"`). Title: "Order checked materials". Close button: `BTN .close data-dismiss="modal"`, icon `fa fa-times`. No rule text in the dialog.

## Rules found in the page's JavaScript
Source: the inline scripts of this capture, `h=1il5i9ax103` (page script), `h=5c8691x31` (refresh functions), and the shared bundle. Only the lines that this capture adds are page-specific.

- Filter selects (`#moFilterProject`, `#moFilterIso`): the select2 initialisation targets `.mo-filter-toolbar .ft-select2` with `minimumResultsForSearch: 8` and `width: '100%'`. The capture shows no element with class `mo-filter-toolbar`, so this selector may match nothing on this page (to be checked against the live page).
- Project filter change (`#moFilterProject`): navigates to `index.php?page=material-order&project=<selected project value>`.
- Isometric filter change (`#moFilterIso`): navigates to `index.php?page=material-order&project=<selected project value>&iso=<selected iso value>`. The project value is read from `#moFilterProject`.
- Select-all (`#checkAll`, click): sets the checked state of every `.checkbox11` to the state of `#checkAll`; calls `$.uniform.update()` if it exists.
- Table initialisation (`#dtMaterialOrder`, DataTables): ordering on, `order [[0, asc]]`, paging off, length change off, info on, searching on, `dom: 'rtip'`; column definition: the last column is not orderable (`targets: -1`).
- Global search (`#moSearch`, `keyup input`): calls the table search with the input value and redraws; toggles class `has-value` on the closest `.wsapps-dt-search` when the trimmed value is not empty.
- Search clear (`#moSearchClear`, click): empties `#moSearch`, triggers `keyup`, and focuses `#moSearch`.
- `refreshIt()` (used by the `Order checked materials` button `onclick`): calls `refreshPage()` after 300 ms. `refreshPage()` reloads the window location.
- Requests: the only request the page makes on load is `GET /core/ajax/ajax-notifications.php?action=count_unread` (XHR list). The shared bundle (captured on earlier pages) also contains `$.getJSON` calls to `getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php` and `searchFactors.php`; the capture does not show that this page triggers them. The only line this capture adds to the shared bundle is the page variable `__wsappsDebugPage = "material-order"`.
- Validations, fields shown or hidden on a condition, and browser-computed values: none found in the capture.

## Sample data
Sandbox state as displayed: 5 rows in total (`Showing 1 to 5 of 5 entries`), all unticked (no CHECKED flag in the capture). The DOM shows no total quantity and no row count other than the info text.

| Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Checkbox (row id; value) |
|---|---|---|---|---|---|---|---|---|
| BOLTS B16 | 100019874 | 8138965891 | - | - | BLT/N A193-B16 8UN 170MM 1.1/4IN | 2 | EA | row id_98762; ids 98762, materialNo 8138965891, quantity 2 |
| BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 13 | EA | row id_108178; ids 108178, materialNo 8138268881, quantity 13 |
| BOLTS B7M | 100237026 | 8138664911 | - | - | BLT/N A193-B7M UNC 280MM 1IN | 16 | EA | row id_108179; ids 108179, materialNo 8138664911, quantity 16 |
| BOLTS A320-L7 | 100458921 | 8138678259 | - | - | BLT/N A320 GR.L7M 8UN 300MM 1 IN | 16 | EA | row id_108180; ids 108180, materialNo 8138678259, quantity 16 |
| PIPE 316 | 100049935 | 7436330731 | - | - | PIPE MET 316L 10S DN100 | 16 | M | row id_108177; ids 108177, materialNo 7436330731, quantity 16 |

Note: the capture writes the first cell of each row as one text ("BOLTS B16", "PIPE 316"); it does not split it into two columns. The eight text cells map to the eight columns in the order of the List section, so the "Article No" cell holds the 9-digit numbers (100019874 etc.) and the "Material No" cell holds the 10-digit numbers (8138965891 etc.), which are the same as `materialNo` in the checkbox value.

## Not in the capture
- Result of `Order checked materials` (it was not clicked; the browser-pass notes say it creates an order at once). The capture does not show the request it sends.
- `Export` result (`export-orders.php`): not requested.
- The PDF output of `../core/pdf/order-material.php`: not requested.
- The opener of `#filterMaterialOrder`: the funnel icon mentioned in the browser-pass notes is not in the DOM capture.
- The opener of `#pdfOrderMaterialLanguage`: no control in the capture points to it.
- The values of the hidden inputs `iso` and `project` in the table form, and of `project` and `id` in the Order checked materials dialog: set by the page at runtime (not in the capture).
- The Options menu (bulk actions): not in the capture.
- Responses of the `ajax-notifications.php` request: not captured.
- Rows beyond the first page: none (5 rows in total).

Also present in the page, opened from elsewhere (identical or page-level dialogs not linked from this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.
