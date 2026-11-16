# MTO Pilot → Projects data → Isometric execution

Source: `mto__projects__isometric-execution.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=iso-execution&redirect=&logout=&id=&project=&type=1`.
State of the page for the observing account: normal.

## Page
- Title: "Isometric execution - MTOPilot®". Menu link: "Isometric execution" → `index.php?page=iso-execution`.
- **State change on open:** this page recalculates cached material status when it is opened. It was opened once, on purpose, on 2026-11-16 at 14:10 local time (14:10:15; about 36 seconds on the page, no reload). On load it called `ajax-iso-status-refresh.php?type=1` and showed the toast "7 ISO's status bijgewerkt (0.0s)" (from the browser-pass notes). The row tooltip reads "Last calculated: 2026-11-16 14:10:15".
- The capture shows no breadcrumb and no tabs.
- Buttons in the top bar above the panel:
  - "Reserved materials" (icon fa-print) → opens dialog `#pdfReservedMaterials` (`data-toggle="modal"`).
  - "Refresh all" (icon fa-refresh), submit button `name="recalculateMaterialStatusForSite"` in a POST form with a hidden input `iso` = 0. Not clicked (browser-pass notes).
- Panel header (blue): "1 isometric(s) found 14:10:15" (count and time of the last status update), "Type: Shop", "Percent range: 70 - 100%", a clock icon, the auto-refresh select, and the paging toggle button.
  - Auto-refresh select `#isoAutoRefreshInterval` (title "Auto-refresh interval"), 4 options: 0 → "Auto-refresh: Off"; 60 → "1 min"; 300 → "5 min" (selected by default); 600 → "10 min".
  - Paging toggle `#isoPagingToggle` (title "Wisselaar paginering"), label "All" (all rows on one page) or "50/page"; the choice is kept in the browser's localStorage under `isoExecutionPagingMode`.
- Toolbar chips (each reloads the table data; no page reload):
  - Label "Type": "Shop" (type 1, active), "Field" (2), "Valves" (5).
  - Label "%": "All" (0–100, active), "100%" (100–100), "80 – 99%" (80–99, orange), "70 – 79%" (70–79, orange), "< 70%" (0–69, red).
  - Label "Priority": "Prio-1", "Prio-2", "Prio-3" (each toggles on/off; only one active at a time).
  - Export buttons "CSV", "Excel", "Print" (fa-print), which trigger the table's own export buttons.
  - Search input `#isoChipSearch` (placeholder "Search") with a clear button (`#isoChipSearchClear`, aria-label "Clear search").
- Observed mismatch: the header text says "Percent range: 70 - 100%" (server default percentFrom=70) while the "All" percent chip is the active one (from the browser-pass notes).

## List
- Table `#datatableIsoExecution`, DataTables with `serverSide: false` (all rows are fetched at once and filtered in the browser).
- Request: GET `/core/ajax/ajax-iso-execution-data.php` with parameters `type`, `percentFrom`, `percentTo`, `prio` (the captured load used `type=1&percentFrom=70&percentTo=100&prio=`). The response is read as `json.data`; `json.isoFound` fills `#isoFoundCount`.
- Columns in order (title, data index, sortable):
  1. Project (0, sortable)
  2. ISO (1, sortable)
  3. Piping class (2, sortable)
  4. Priority (3, sortable)
  5. Drawing no. 1 (4, sortable, class `hidden-xs`)
  6. Chemical clean (5, sortable, class `hidden-xs`)
  7. Mat.status (6, sortable, width 150px, sorts by hidden column 9)
  8. Options (7, not sortable, width 155px)
  9. (no title, hidden, not searchable, numeric; data index 8) hidden numeric sort column for Mat.status.
- Default sort: the script sets `order: [[6, 'desc']]` (Mat.status descending via the hidden column); the `DT` line of the capture shows `[[5,"asc"]]`. The two differ in the capture.
- Page length: `lengthMenu` [[50, -1], [50, "All"]]; start is -1 (All) unless the stored paging mode is "paged" (then 50). No length select is drawn (dom `<"dt-panelmenu clearfix"Bf>t<"dt-panelfooter clearfix"ip>`).
- Per-column search inputs: none. Global search: the DataTables search box (placeholder "Search", clear button) and the chip search `#isoChipSearch`, which calls `search(...)` on the table.
- Filters: the type, percent and priority chips above. A "Filter isometrics" dialog exists in the page (see Dialogs) but no visible control opens it.
- Row options (column Options), in order:
  - "Start" (green, icon fa-play, class `open-pdfIsoExecution`) → dialog `#pdfIsoExecution`, with `data-id` (iso id), `data-percent`, `data-type`.
  - "Reserve" (dark button, submit `name="isoReserveMaterial"`, tooltip "Reserve materials for this isometric.") with a hidden input `iso` holding the iso id. Not clicked.
  - In column Mat.status: the percentage, a tooltip "Last calculated: <date time>", a hidden input `iso` and a small refresh button `name="recalculateMaterialStatus"` (tooltip "Recalculate material status"). Not clicked.
- Links in a row: Project → `index.php?page=isometrics&project=1`; ISO → `index.php?page=isometrics&project=1&id=6`.
- Bulk actions: none. Row selection checkboxes: none.
- Export: CSV, Excel, Print (icon only) — exported columns 0–6 (Project to Mat.status; Options and the hidden column are left out).
- Texts: empty table and no match: "There are no isometrics ready for execution". Info: "Showing _START_ to _END_ of _TOTAL_ entries" (displayed "Showing 1 to 1 of 1 entries"). Processing: "Loading...". Footer line: "Page init: 0s".
- On load failure the script shows "Data load failed" in `#isoRefreshBadge` and the row "Error loading data. Please refresh the page."

## Dialogs

### Print (`#pdfReservedMaterials`) — opened by the "Reserved materials" button
Form: GET to `/core/pdf/reserved-materials.php`, opens in a new tab (`target="_blank"`).
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | lang | select (select2) | no | English | 4 options: en → English (selected); nl → Nederlands; de → Deutsch; fr → Français |
| 2 | Group by materials | grouped | checkbox (`#checkboxRMx`) | no | unchecked | value "ok" when ticked |
Buttons: "Go" (submit, `name="go"`), "Cancel" (dismiss). No rule text in the dialog.

### Isometric execution (`#pdfIsoExecution`) — opened by the row button "Start"
- In the page the dialog has only a header with the title "Isometric execution" and the close button; there is no body or footer in the capture. The body is loaded by the page's script into `#contentPdfIsoExecution`.
- The script sets the value of `.modal-body #bookId` to the iso id of the row, then requests GET `/core/ajax/pdfIsoExecution.php?id=<iso id>&type=<current type>&rand=<number>&percent=<row percent>` and puts the response into the dialog.
- Fields: none in the capture (the `bookId` input belongs to the loaded body, which is not captured).

### Filter isometrics (`#filterIsoExecution`) — no control on this page opens it
It is in the page, but no visible control opens it; the type, percent and priority chips replaced it (browser-pass notes). Form: method GET.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | page | hidden | no | iso-execution | |
| 2 | Type | type | select (select2) | no | Shop | 15 options: "" → All types; 1 → Shop (selected); 2 → Field; 3 → Hydrotest field; 4 → Support Field; 5 → Valves; 7 → Bernecker; 8 → Support Shop; 9 → Support WS; 10 → Support FW; 11 → Rilco; 14 → Shop missing; 15 → Revision mat; 16 → Shop IYM; 17 → Field IYM |
| 3 | Percent From | percentFrom | number (min 0, max 100) | no | 70 | |
| 4 | Percent To | percentTo | number (min 0, max 100) | no | 100 | |
| 5 | N.S. (group label "Priority") | prio[] | checkbox (`#checkboxPrioNot`) | no | unchecked | value 0 |
| 6 | 1 | prio[] | checkbox (`#checkboxPrio1`) | no | unchecked | value 1 |
| 7 | 2 | prio[] | checkbox (`#checkboxPrio2`) | no | unchecked | value 2 |
| 8 | 3 | prio[] | checkbox (`#checkboxPrio3`) | no | unchecked | value 3 |
| 9 | 4 | prio[] | checkbox (`#checkboxPrio4`) | no | unchecked | value 4 |
| 10 | 5 | prio[] | checkbox (`#checkboxPrio5`) | no | unchecked | value 5 |
Buttons: "Filter" (submit, `name="filterIsoExecution"`), "Cancel" (dismiss).

## Rules found in the page's JavaScript
- Configuration from the server: `_isoType = 1`, `_isoPctFrom = 70`, `_isoPctTo = 100`, `_isoPrio = ""`.
- Type, percent and priority chips (`.iso-chip` click handler): a type chip sets the type; a priority chip toggles (clicking the active one clears the priority, otherwise it becomes the only active one); a percent chip sets the from/to values from `data-min` / `data-max`. Then the header text ("Type", "Percent range") is updated, the browser URL is rewritten with `page`, `type`, `percentFrom`, `percentTo` and `prio` (prio removed when empty) without reloading (`syncIsoUrl`), and the table reloads from `ajax-iso-execution-data.php` (`ajax.reload`).
- On page load `doAutoRefresh()` runs once: it calls `/core/ajax/ajax-iso-status-refresh.php` with `type`; if the answer has `updated > 0` the table is reloaded and a success toast "<n> ISO('s) status bijgewerkt (<seconds>s)" is shown; the badge `#isoRefreshBadge` then shows the answer's `last_updated` (or "—") and the title "Status bijgewerkt om <time>"; on error the badge is emptied.
- Auto-refresh select: on change, the timer is cleared and, when the value is above 0, `doAutoRefresh` repeats every that many seconds; the selected value at load (5 min) starts the timer when the page is ready.
- Paging toggle: switches between 50 per page and all rows, stores `paged` / `all` in localStorage, and changes the button label ("50/page" / "All").
- Search: input on `#isoChipSearch` searches the table and shows or hides the clear button; the clear button empties it.
- Export buttons: the toolbar buttons call the table's CSV, Excel and Print buttons.
- "Start" click (`.open-pdfIsoExecution`): sets `#bookId` and loads `pdfIsoExecution.php` into `#contentPdfIsoExecution` as described above.
- Other requests in the captured page loads (XHR list): `ajax-iso-execution-data.php` (twice), `ajax-iso-status-refresh.php?type=1`, `ajax-notifications.php?action=count_unread`. Shared scripts also contain `getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`; the capture shows no use of them on this page.
- Form posts on the page (no JavaScript involved): `recalculateMaterialStatusForSite` ("Refresh all"), `recalculateMaterialStatus` (row refresh icon), `isoReserveMaterial` ("Reserve"), each with hidden `iso`.

## Sample data
- Header: "1 isometric(s) found 14:10:15"; "Type: Shop"; "Percent range: 70 - 100%"; info "Showing 1 to 1 of 1 entries"; the DataTables config shows total 1, shown 1.
- Toast on load: "7 ISO's status bijgewerkt (0.0s)".

| Project | ISO | Piping class | Priority | Drawing no. 1 | Chemical clean | Mat.status | Options |
|---|---|---|---|---|---|---|---|
| 20240101 | 00022 | - | Prio not set | - | - | 100% (tooltip "Last calculated: 2026-11-16 14:10:15"; from the browser-pass notes: a green progress bar) | Start, Reserve |

## Not in the capture
- The body of the "Isometric execution" dialog (`#pdfIsoExecution`), loaded by the "Start" button from `pdfIsoExecution.php`. The browser pass tried to click Start once; the click was blocked before it reached the page, so it was not captured (browser-pass notes).
- The response data of `ajax-iso-execution-data.php` beyond the one row, and the rows for the other types (Field, Valves) and percent/priority ranges (chips).
- What the "Refresh all", row refresh and "Reserve" posts return or change; none were clicked.
- The PDF that "Go" in the Print dialog produces.
- The "Filter isometrics" dialog was not opened (no control for it); its fields are from the page capture.

Also present in the page, opened from elsewhere: `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.
