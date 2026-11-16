# MTOPilot → Logistic → Service req. - Materials

Source: `mto__logistic__service-request-materials.txt`, `mto__logistic__service-request-materials__filtered.txt`, `mto__logistic__service-request-materials__history.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=spools-transport-materials`.
State of the page for the observing account: normal.

Filtered capture URL: `/mtopilot/index.php?page=spools-transport-materials&project=1&group=BOLTS+A320-L43&keywordCC=&keyword=&currently=`.

## Page

- Title: the page title is "MTOPilot®" (browser title "- MTOPilot®"). No breadcrumb is shown in the capture.
- Panel heading (blue): the material group name. Default view: "SUPPORT". Filtered view: "BOLTS A320-L43".
- Tabs (top bar, class of the header):
  - "Service request" → link `index.php?page=spools-transport-materials` (as captured; the same href as the "Materials" tab on this page; on the Service request page the same tab links to `index.php?page=spools-transport`).
  - "Materials" → link `index.php?page=spools-transport-materials`.
- Buttons above the list:
  - "Move to laydown" (id `laydownTransportID`, classes `btn btn-dark btn-sm open-laydownTransport disabled`, type submit, icon `fa fa-arrow-right`, `data-id="10"`, `data-type=""`, `data-toggle="modal"`, `href="#laydownTransportMaterial"`) → opens dialog `#laydownTransportMaterial` (Move to laydown). The button has the class `disabled` in both captures (default view and filtered view). The capture does not show the code that removes this class.
  - "Filter" (dark button, from the browser-pass notes, not in these captured lines) → toggles the inline filter toolbar described under List. The browser-pass notes do not name a dialog for it; the modal `#filterSpoolTransportMaterials` is in the DOM but no control in these captures points to it.
  - No "Export" or "Print" button is in the captured DOM of this page.
- Floating action button (mobile, class `wsapps-handheld-fab-btn`, title/aria "Scan QR") with two menu items: "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`). Not part of the list.

## List

- Inline filter toolbar (`#materialsFilterPanel`, class `spool-filter-toolbar`, shown open in the filtered capture, closed in the default view). It is a GET form to `index.php` with a hidden `page` = `spools-transport-materials`. Fields in order:
  - "Project" — select `name="project"`. Options: (blank) → "All"; `1` → "20240101". Default "All"; filtered view "20240101".
  - "Material group" — select `name="group"`. 262 options in total; first 10: "BOLTS A320-L43", "BOLTS A320-L7", "BOLTS B16", "BOLTS B7", "BOLTS B7M", "FITTING 304 BRF", "FITTING 304 BRFF", "FITTING 304 BRFN", "FITTING 304 BRN", "FITTING 304 CAP" (the value equals the text). Default (page load) "SUPPORT". Filtered view "BOLTS A320-L43". The `*` default marker is not visible in the captured part of the list because "SUPPORT" is beyond the first 80 options listed in the capture.
  - "Chemical clean" — text `name="keywordCC"`, placeholder "...".
  - "Material No / Descr." — text `name="keyword"`, placeholder "...".
  - "Currently on" — select `name="currently"`. 5 options: (blank) → "------" (default); `Plava Hala` → "Laydown: Plava Hala"; `SS` → "Laydown: SS"; `Farbara` → "Service: Farbara"; `Transport` → "Service: Transport".
  - Button "Filter" (primary, icon check, type submit).
  - Link "Reset" → `index.php?page=spools-transport-materials` (icon times).
- Search box above the table: a label with search icon and a text input `#materialsSearch`, placeholder "Search"; clear button `#materialsSearchClear` (aria-label "Clear search"). This is the only search input in the captured DOM; no per-column search inputs.
- Table `#datatableWarehouse999` (DataTables, client-side: `serverSide` false, `ajax` null).
  - Columns in order (header text):
    1. Project (sortable)
    2. ISO (sortable)
    3. Material (sortable)
    4. Dia (sortable)
    5. P.Spec. (sortable)
    6. Ch.clean (sortable)
    7. Qty. (sortable)
    8. Currently on (sortable)
    9. Header checkbox `#materialsCheckAll`, title "Check all" (not sortable)
  - Hidden columns: none (all `vis` true).
  - Default sort: column index 7 ("Currently on"), ascending.
  - Page length: 100 by default; length options 10, 25, 50, 100 (the length selector itself is not in the captured DOM).
  - Row content (filtered view): Project text; ISO is a link to `index.php?page=isometrics&project=1&id=<iso id>`; Material cell shows the material number, then " | " and the description (the Dia column is "-" in all four rows; see Sample data); P.Spec.; Ch.clean; Qty.; Currently on = a link "No update" (class `open-showServiceHistory`, `href="#showServiceHistory"`, `data-toggle="modal"`, `data-id` = e.g. `1.1.12595`) that opens the Material history dialog; last cell = row checkbox.
  - Row checkbox: `id="id_<key>"`, `name="ccid_<key>"`, `type="checkbox"`, `value` = e.g. `1.12595`, `data-id` = "Project | ISO | Material no." (e.g. `20240101 | 0001 | 8138265581`).
  - Row options: no icon buttons per row in the capture. Row actions are the "No update" link (opens history) and the row checkbox (selection for "Move to laydown").
  - Bulk actions: none in a menu (no Options menu in the capture). Bulk action is the top-bar "Move to laydown" button, which uses the ticked rows. Header checkbox "Check all" ticks every row on the current page.
  - Export / print: none in the captured DOM.
  - Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered as "Showing 0 to 0 of 0 entries" in the default view and "Showing 1 to 4 of 4 entries" in the filtered view).
  - Empty text: "No data available in table" (shown in the default view as the only row).
  - Zero-match text configured as "No matching records found" (not displayed in the capture).
  - Search text configured as empty (no DataTables search box rendered in the capture; the custom search box above is used).
  - Server-side table request: none (the table is not server-side; `ajax` is null).

## Dialogs

### Move to laydown (`#laydownTransportMaterial`) — opened by "Move to laydown" (`#laydownTransportID`, `href="#laydownTransportMaterial"`, `data-toggle="modal"`)

Title: "Move to laydown".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | laydown | select (select2, `select2-single form-control`) | not marked required in the capture | empty (`cur=""`) | 0 options in the sandbox capture (the list is empty). |
| 2 | (no label, hidden) | selectedIDS (`id="sids"`) | hidden, READONLY | – | no value attribute in the capture | Filled by the page script with the comma-joined values of the ticked rows (see Rules). |
| 3 | (no label, hidden) | fileid | hidden | – | empty | none shown |

The dialog has no other inputs. The form has `method="post"` and no action attribute.

Buttons:
- "Confirm" (class `btn btn-primary btn-hideInsert`, type submit, name `confirmMoveToLaydownMaterial`).
- "Cancel" (class `btn default`, closes the dialog).
- Header close button (×).

Rule text in the dialog: none (no help text in the capture).

### Material history (`#showServiceHistory`) — opened by "No update" link in the "Currently on" column of each row (`.open-showServiceHistory`, `href="#showServiceHistory"`, `data-toggle="modal"`, `data-id` = row key)

Title: "Material history". The dialog has no input, select, textarea or checkbox.

Body: loaded by the page when the link is clicked (XHR, see Rules). Table `#c_b` with header columns "Date", "Location", "Ord. No.". In the captured response the table has no data rows; the capture ends at the opening `<tbody>` tag (response length 367 bytes). The browser-pass notes also say the table is empty.

Buttons:
- "Close" (class `btn default`, closes the dialog).
- Header close button (×).

Rule text in the dialog: none.

Also present in the page (in the DOM, not opened by any control in these captures): admin dialog "System settings" (`#admin`), `#editCompanyData`, `#passwordChange`, `#themeChange`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#releaseRequestModal`, `#releaseRequestModalField`, `#showCustomHydro`, `#showCustomHydroAgain`, `#hydrotestRequest`, `#transferLagerRequest`, `#inventoryTransport` ("Move to inventory"; body text "Move material back to inventory?"), `#moveToLaydownDashboard`, `#filterReleases`, `#filterSpoolTransport`, `#filterSpoolTransportMaterials` ("Filter"), `#importHydrotestResults`, `#importHydrotestResultsSingle`, `#filterPendingMaterials`, `#spoolTransport` ("Service request"), `#showHydrotestResultsSingle`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#srArchiveScanModal`, `#materialQrScanModal`, `#pdfSpoolLocation`, `#pdfSpoolLocationTabs`, `#pdfPendingMaterials`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`.

## Rules found in the page's JavaScript

- Inline filter form: the selects `#materialsFilterPanel .ft-select2` are initialised as select2 with search hidden below 8 options and width 100% (the inline script section for the filter panel). None found beyond this in the captured part.
- Search box: when the value of `#materialsSearch` is longer than 0, the parent `.spool-search-box` gets class `is-active`; otherwise the class is removed. The clear button `#materialsSearchClear` empties the field (captured part of the inline script).
- Row selection is kept in a page-wide map `window.__materialsSelection` (a JavaScript Map), keyed by the checkbox `value`, storing the checkbox `data-id`. The map keeps ticks across pages of the table because rows that are not drawn are not in the DOM.
- Row checkbox change (`#datatableWarehouse999 tbody input[type=checkbox]`): when checked, the entry is added to the map; when unchecked, it is removed. The header checkbox `#materialsCheckAll` is then set to checked only when every row checkbox on the current page is checked.
- Header checkbox `#materialsCheckAll` change: adds to / removes from the map every row checkbox on the current page.
- Table draw: `__materialsSyncCheckboxes()` sets each row checkbox's checked state from the map (`cb.checked = map.has(cb.value)`), updates the header checkbox, and writes the comma-joined list of all selected keys into `#t` and into `#sids` (`$('#sids').val(allVals.join(','))`). `#sids` is the hidden selectedIDS of the Move to laydown dialog. The function is called from the DataTables setup on `#datatableWarehouse999`.
- Double-submit guard (shared script, applies to the form inside `#laydownTransportMaterial`): on submit, the form gets attribute `data-wsapps-submitting="1"`; a second submit is stopped; the submit button gets class `disabled` and `pointer-events: none`. The capture comments say this is deliberate so that a second click on Confirm does not create a duplicate request.
- Requests made by this page in the capture:
  - On load: GET `/core/ajax/ajax-notifications.php?action=count_unread`.
  - On "No update" click: GET `/core/ajax/showServiceHistoryMaterials.php?id=<data-id>&action=showroom` (the `data-id` of the clicked row, e.g. `1.1.12595`; the response is the Material history table).
  - The filter toolbar and the Filter modal submit as GET to `index.php` with the field names listed under List (`project`, `group`, `keywordCC`, `keyword`, `currently`, `page`, and the button name `filterSpools` in the modal).
  - Move to laydown Confirm: POST of the form (no action, so the same URL) with fields `laydown`, `selectedIDS`, `fileid` and the button name `confirmMoveToLaydownMaterial`. Not submitted in the capture.
  - The shared script of the site also contains other request URLs (`getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`); the capture does not show which of them this page calls, so they are not attributed to this page.
- Validation: none found in the capture for the Move to laydown dialog (the Laydown field has no required flag and no check in the captured script).
- Shown or hidden on a condition: the Move to laydown button's `disabled` class is set in the captured DOM; the code that changes it is not in these captures.

## Sample data

Default view (project All, group SUPPORT, no search): 0 rows. Table text "No data available in table"; info "Showing 0 to 0 of 0 entries".

Filtered view (project 20240101, group BOLTS A320-L43): 4 rows. Info "Showing 1 to 4 of 4 entries". Columns as in the capture; all rows show "No update" in Currently on.

| Project | ISO | Material | Dia | P.Spec. | Ch.clean | Qty. | Currently on | Checkbox value |
|---|---|---|---|---|---|---|---|---|
| 20240101 | 0001 | 8138265581 \| BLT/N A320-L43 CTD 8UN 530MM 2.3/4IN | - | A10 | N/A | 2 | No update | 1.12595 |
| 20240101 | 0001 | 8138268881 \| BLT/N A320-L43 CTD 8UN 1000MM 4IN | - | A10 | N/A | 3 | No update | 1.1939 |
| 20240101 | 00022 | 8138268881 \| BLT/N A320-L43 CTD 8UN 1000MM 4IN | - | - | - | 10 | No update | 6.98463 |
| 20240101 | 00032 | 8138268881 \| BLT/N A320-L43 CTD 8UN 1000MM 4IN | - | - | - | 16 | No update | 6191.108178 |

Notes on the table: the capture's cell separator is also " | ", so the Material cell is read as two parts (material number, then description) by counting the nine header columns. The ISO links are `index.php?page=isometrics&project=1&id=1` (0001), `id=6` (00022), `id=6191` (00032).

Material history for the first row (`data-id` 1.1.12595): table with headers Date | Location | Ord. No. and no data rows in the captured response.

## Not in the capture

- Rows for other material groups, projects or "Currently on" values: only the default view (0 rows) and one filter (4 rows) are captured.
- Material history rows for rows 2 to 4 (only the first row's "No update" link was opened).
- Laydown options in the Move to laydown dialog: none in the sandbox at capture time (0 options); a laydown list would appear only if the site has laydowns.
- The Move to laydown button's enabling: the capture shows it disabled; the capture does not show the state after a row is ticked.
- The result of Confirm in Move to laydown: not submitted in the capture.
- The Filter button in the top bar and its inline toolbar state changes beyond the two captured states: from the browser-pass notes only.
- The "Move to inventory" dialog (`#inventoryTransport`): present in the DOM, but no control in these captures opens it.
- Table length selector (10/25/50/100) and the DataTables search control: configured, but not rendered in the captured DOM.
- The "Scan material" and "Scan service request" floating menu actions: present, not opened.
