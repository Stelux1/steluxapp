# MTO Pilot → Logistic → Service request

Source: `mto__logistic__service-request.txt`, `mto__logistic__service-request-hide-finished.txt`, `mto__logistic__service-request__dialog.txt`, `mto__logistic__service-request__move-to-laydown.txt`, `mto__logistic__service-request__spool-history.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=spools-transport` (second capture: `/mtopilot/index.php?page=spools-transport&show=hideFinished`).
State of the page for the observing account: normal.

## Page
- Browser title: "Service request - MTOPilot®". Breadcrumb / page link: "Service request" (`index.php?page=spools-transport`). No tabs.
- Panel (dark) heading: "Service request".
- Buttons in the top bar, in order:
  | Label | Icon | Look / state | Opens or does |
  |---|---|---|---|
  | Service request (`#spoolTransportID`) | fa-play | dark, small; class `disabled` on load (from the browser-pass notes: shown grey at opacity 0.5 until a spool is ticked) | opens dialog `#spoolTransport` (`href="#spoolTransport"`, `data-toggle="modal"`) |
  | Move to laydown (`#laydownTransportID`) | fa-arrow-right | same as above | opens dialog `#laydownTransport` |
  | Filter (`#toggleFilterPanel`) | fa-sliders | dark | no dialog: toggles the inline filter panel `#spoolFilterPanel` open / closed (script) |
  | Export | fa-file-excel-o | dark | link `export-spools.php` |
- Below the panel heading: inline filter panel (see List), then the panel body with a search box and the table.
- Search box (`#spoolTransportSearch`, placeholder "Search", magnifier icon) with a clear button (`#spoolSearchClear`, aria-label "Clear search").

## List
- Table `#datatablePendingMaterialsDashboard`; client-side (`serverSide: false`, `ajax: null`), no server-side table request. DataTables `dom` is table + footer with info and paging only (the built-in search box is not shown; the page's own search box drives it).
- Columns in order (all visible; all sortable except the last):
  | # | Title | Cell content |
  |---|---|---|
  | 0 | Project | project number text |
  | 1 | ISO | link to `index.php?page=isometrics&project=<project id>&id=<iso id>` |
  | 2 | Spool | spool name |
  | 3 | Diameter | text |
  | 4 | Paint spec. | text, "-" when empty |
  | 5 | PWHT | icon: `fa fa-check` or `fa fa-times` (from the browser-pass notes: green tick / red cross round icons) |
  | 6 | Chemical clean | text ("N/A" or "-" in the sample) |
  | 7 | Currently on | link (class `open-showServiceHistory`, `href="#showServiceHistory"`, `data-toggle="modal"`, `data-id="<project>.<iso id>.<spool id>"`); the link text is the last location; empty text when no location |
  | 8 | Last request | request number (e.g. 00002) or "-" |
  | 9 | checkbox | header: checkbox `#spoolCheckAll` (title "Check all"), not sortable; rows: checkbox class `spool-check`, `name="ccid_<iso id>"`, `value="<iso id>.<spool id>"`, `data-id="<project> \| <iso> \| <spool>"` |
- Default sort: column 8 (Last request) ascending. Page length 100; length-menu options 10, 25, 50, 100 (the dom shows no length selector in the capture). Paging is on.
- Per-column search inputs: none. Global search: the page's own search box (filters the table as you type; clear button empties it).
- Row options: the ISO link (opens the isometric page), the "Currently on" link (opens Spool history dialog `#showServiceHistory`), the row checkbox. No other row icons.
- Bulk actions: tick rows (or "Check all" `#spoolCheckAll`, which ticks all rows on the current page); the selection is kept across pages and redraws. Ticked rows feed the Service request and Move to laydown dialogs. No Options menu.
- Export button: `export-spools.php` (Excel icon). No print / CSV buttons.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries"; empty "No data available in table"; no match "No matching records found". Capture shows "Showing 1 to 3 of 3 entries".

### Inline filter panel (`#spoolFilterPanel`, form GET to `index.php`)
Toggled by the Filter button. Controls in order:
| Label | name | Type | Default | Options |
|---|---|---|---|---|
| (hidden) | page | hidden | `spools-transport` | |
| Project | project | select (select2) | All | 2: (empty) → All; 1 → 20240101 |
| Spool | spool | select (select2) | All | 54: (empty) → All; then spool ids → names (52 → SP01, 54 → SP01A, 60 → SP01B, 1 → SP02, 59 → SP02A, 2 → SP03, 58 → SP03A, 4 → SP04, 57 → SP04A, 28 → SP05 …, 46 → Spool V). Names SP22 appear three times (ids 68, 76, 77). First 10: All, SP01, SP01A, SP01B, SP02, SP02A, SP03, SP03A, SP04, SP04A |
| Show | show | select (select2) | All | 2: all → All; hideFinished → Hide finished |
| Paint spec. | paintSpec | text, placeholder "..." | empty | |
| Diameter | diameter | text, placeholder "..." | empty | |
| Chemical clean | chemicalClean | text, placeholder "..." | empty | |
| Currently on | currently | select (select2) | "------" | 11: (empty) → ------; "Farbara osnovi premaz" → Laydown: Farbara osnovi premaz; "Farbara završni premaz" → Laydown: Farbara završni premaz; "INEOS Lilo" → Laydown: INEOS Lilo; "Marshalling Yard" → Laydown: Marshalling Yard; "Nova Hala" → Laydown: Nova Hala; "Prostor izmedju stare i nove hale" → Laydown: Prostor izmedju stare i nove hale; "Stara Hala" → Laydown: Stara Hala; "Transportovano" → Laydown: Transportovano; "Farbara" → Service: Farbara; "Transport" → Service: Transport |
| Request | lastReport | select (select2) | "------" | 3: (empty) → ------; 00001; 00002 |
Buttons: "Filter" (submit, check icon, primary); "Reset" (link to `index.php?page=spools-transport`, times icon). The filter is a GET, so it lives in the URL (the "Hide finished" capture has `&show=hideFinished`, select showing "Hide finished").

## Dialogs

### Service request (`#spoolTransport`) — opened by the "Service request" button
Form `method="post"`. Body of the capture after ticking one spool (from the click capture).
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Company | company | select (select2) | not marked | empty | 0 options in the sandbox (list of service companies; the options come from elsewhere, none shown) |
| 2 | Name | name | text, read-only | not marked | the signed-in user's name | |
| 3 | Note | note | textarea (classes `no-tinymce no-quill`, i.e. plain) | not marked | empty | |
| 4 | Include isometric drawings in PDF | includeIsometrics | checkbox | not marked | unchecked, value `1` | |
| – | (list "Selected spools:") | – | display `#myList` | – | numbered lines "1. 20240101 \| 0001 \| SP01" | filled by the page script from the ticked rows |
| 5 | (none) | selectedIDS (`#t`) | hidden, read-only | – | `1.52` with one spool ticked (comma-joined `<iso id>.<spool id>` values) | set by the script from the selection |
| 6 | (none) | fileid | hidden | – | empty | |
Buttons: "Confirm" (green, submit, `name="confirmServiceRequest"`), "Cancel" (dismiss). The "Confirm" was not clicked.

### Move to laydown (`#laydownTransport`) — opened by the "Move to laydown" button
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | laydown | select (select2) | not marked | empty | 0 options in the sandbox |
| 2 | (none) | selectedIDS (`#sids`) | hidden, read-only | – | `1.52` with one spool ticked | set by the script from the selection |
| 3 | (none) | fileid | hidden | – | empty | |
Buttons: "Confirm" (`btn-primary btn-hideInsert`, submit, `name="confirmMoveToLaydown"`), "Cancel" (dismiss). Not clicked.

### Spool history (`#showServiceHistory`) — opened by a "Currently on" link
Form without inputs. Body is loaded by GET `/core/ajax/showServiceHistory.php?id=<project>.<iso id>.<spool id>&action=showroom` (example id `1.1.52`) into `#contentShowServiceHistory`. Table `#c_b` (class `datatableExecNo`), columns Date (30% width), Type (15%), Location (55%). Sample rows (newest first, all Type "Laydown"): see Sample data. Footer: "Close" (dismiss). No input fields.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, releaseRequestModal, releaseRequestModalField, showCustomHydro, showCustomHydroAgain, hydrotestRequest, transferLagerRequest, moveToLaydownDashboard, filterReleases, filterSpoolTransport (a "Filter" dialog with the same eight fields as the inline filter panel and a "Go" button `filterSpools`; the page's Filter button does not open it), importHydrotestResultsSingle, showHydrotestResultsSingle, filterSpoolTransportMaterials, importHydrotestResults, filterPendingMaterials, pdfSpoolLocation, pdfSpoolLocationTabs, pdfPendingMaterials, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.

## Rules found in the page's JavaScript
Inline script for this page (selection handling and table setup):
- `__spoolTransportSelection` (a Map keyed by checkbox value, storing its `data-id`) holds the ticked spools across pages. `__spoolTransportSyncCheckboxes` re-ticks the visible checkboxes from it after each table draw and sets "Check all" only when every visible row is ticked.
- `__spoolTransportOnCheck(cb)`: adds or removes the checkbox value; then writes the comma-joined values into the hidden `#t` (Service request dialog) and `#sids` (Move to laydown dialog), and the numbered list "n. <data-id>" (one per line) into `#myList`. It then sets both top buttons (`#spoolTransportID`, `#laydownTransportID`) to opacity 1 and removes class `disabled` when the selection is non-empty; otherwise opacity 0.5 and class `disabled` (the exact condition line is not in the capture; the browser-pass notes confirm buttons go grey again after unticking).
- On load both buttons are set to opacity 0.5 and `disabled`.
- Table init (once, if not already a DataTable): paging true, pageLength 100, dom `t` + footer (`ip`), draw callback runs the sync function.
- Row checkbox change calls `__spoolTransportOnCheck` and updates "Check all". "Check all" change ticks / unticks every row checkbox on the current page that differs. A click handler is attached to both top buttons (its body is not in the capture).
- Search input: on each input event `dt.search(value).draw()` and a class `has-value` toggled on the search box; the clear button empties it, redraws, and focuses the input.
- Filter button: toggles class `open` on `#spoolFilterPanel`; on first opening (or if open on load) the `.ft-select2` selects are initialised as select2 (`minimumResultsForSearch: 8`, width 100%).
- Requests made by the page's own script: none. XHR seen: `/core/ajax/ajax-notifications.php?action=count_unread` (GET, on load, response `{"count":0}`); after a "Currently on" click: `/core/ajax/showServiceHistory.php?id=<id>&action=showroom` (GET). The shared large script also defines requests to getListOfMaterials.php (param `id`), searchProject.php, saveAddCalculationModalState.php (k, v), searchUnitRates.php, searchTarrifs.php, searchFactors.php (param `id`); they belong to other dialogs, none were made on this page. No validation messages found for these two dialogs.

## Sample data
Sandbox, project 20240101. Both captures (All and Hide finished) show the same 3 rows ("Showing 1 to 3 of 3 entries"); the Hide finished capture's Show select reads "Hide finished".
| Project | ISO | Spool | Diameter | Paint spec. | PWHT | Chemical clean | Currently on | Last request |
|---|---|---|---|---|---|---|---|---|
| 20240101 | 00032 | Spool J | 48 | - | cross (fa-times) | - | (empty) | - |
| 20240101 | 0001 | SP01 | 0,5 | A10 | tick (fa-check) | N/A | Farbara osnovi premaz | - |
| 20240101 | 0003 | Spool J | 48 | - | cross (fa-times) | - | Transport | 00002 |

Row checkbox values: `6191.34`, `1.52`, `895.34`; ISO link ids 6191, 1, 895.
Spool history of SP01 (id 1.1.52):
| Date | Type | Location |
|---|---|---|
| 28.06.2024. 12:11 | Laydown | Farbara osnovi premaz |
| 28.06.2024. 12:02 | Laydown | Transportovano |
| 28.06.2024. 12:02 | Laydown | Farbara osnovi premaz |
| 28.06.2024. 12:02 | Laydown | Stara Hala |

## Not in the capture
- The result of "Confirm" in Service request or Move to laydown (not clicked); where the request number (e.g. 00001, 00002) comes from; the Company and Laydown option lists (empty in the sandbox, so what an option shows is unknown).
- The file `export-spools.php` (Export button): columns not captured.
- What the filter returns for other values (only "Hide finished" was captured and it left all 3 rows).
- The body of the click handler on the two top buttons and the exact line that enables them (omitted in the capture's script diff).
- The "Currently on" link for the row with an empty location shows no text (empty link); what it shows when history is empty is not captured.
