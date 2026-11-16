# Weld Pilot → Releases → Prefab release

Source: `weld__releases__prefab-release.txt`, `weld__releases__prefab-release-released.txt`, `weld__releases__prefab-release__options-menu.txt`, `weld__releases__prefab-release__release-archive.txt`, `weld__releases__prefab-release__upload-signed.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=isometrics-finished&show=hideReleased` (the "released" capture: `/weldpilot/index.php?page=isometrics-finished&show=showReleased`).
State of the page for the observing account: normal.

## Page
- Browser title: "- WeldPilot®". Panel title: "Prefab release" (list icon). Side menu: group "Releases" is open; the item is "Prefab release" with link `index.php?page=isometrics-finished&show=hideReleased`.
- Breadcrumb in the top bar: a project-site link "Zandbak" (`index.php?page=project-sites&id=1`), then "Prefab release". No tabs.
- Search icon button in the panel heading (class `open-searchProject`) → dialog `#searchProject` "Project search" (`href="#searchProject"`, data-toggle modal).
- Buttons in the top bar, in order:
  1. "Release selected" — `#releaseRequest`, dark small button with a play icon, `href="#releaseRequestModal"`, `data-id="1"`, `data-type=""`, opens dialog `#releaseRequestModal`. It is hidden on load (script `$('#releaseRequest').hide();`) and shown while at least one row checkbox is ticked.
  2. "Options" (primary small button with chevron, dropdown) with two items: "Release archive 0" → `#releaseArchive`; "Upload signed docs" → `#uploadReleaseResults`. The "0" in the first item is the archive count (shown as a badge per the browser-pass notes; the capture holds it as part of the link text).
  3. "Filter" (dark small button, sliders icon) → `#filterReleases` (`data-id="1"`, `data-type=""`).
  4. Refresh icon button → link `index.php?page=isometrics-finished&show=hideReleased&refresh=ok&itp=&project=0` (from the browser-pass notes: not clicked; the `refresh=ok` parameter is the only thing known).
- Capture of the dropdown ("options-menu") shows exactly the two items above, no divider or other entry.

## List
Table `#datatablePrefab`, server-side (`serverSide: true`, `processing` indicator).
- Ajax url: `/core/ajax/ajax-table-prefab.php?id=1&itp=&show=hideReleased&project=0` (in the released view `show=showReleased`). DataTables adds the usual `draw`, `columns[i][...]`, `order`, `start`, `length`, `search` parameters (the XHR line shows `draw=1…8` on load).
- Columns in order (all visible, all sortable): 0 Options · 1 Project · 2 ISO · 3 IRN · 4 Rev. no. · 5 ITP No · 6 ITP No 2 · 7 Spools · 8 Piping class · 9 Drawing no. 1 · 10 NoBo · 11 X Ray % · 12 PWHT · 13 Priority.
- Hidden columns: none. Default sort: column 13 (Priority) ascending. Page length: 1000 rows by default; length menu 10, 20, 50, 100, 500, ALL (select name `datatablePrefab_length`, label "Show … entries"; the select in the capture has no pre-selected option listed).
- Pagination type: simple (from the page script). DOM layout: export buttons, then length + search + processing, then table, then info + pagination.
- Per-column search inputs: none. One global search input (placeholder "Search", with a clear "x" button).
- Export / print buttons shown in the page: "CSV", "Excel", print icon. (The page script also declares a "PDF" button, but it is not drawn in the capture.) Exports use visible columns except the last one.
- Row selection: the page script handles a change on a `.checkbox` inside the table body: ticking appends the row's value (taken from data column 15 of the row, which is not one of the 14 shown columns) to the hidden input `#releaseIDS` (comma separated, `name="selectedIDS"` in the release dialog) and shows "Release selected"; unticking removes it; with no ids left the button is hidden again. No checkbox is visible in the one captured row, so where the checkbox sits is not shown in the capture.
- Row option for the sample row: the Options cell shows the text "Choose ITP" (no link or control is recorded in the capture for it).
- ISO cell is a link to `index.php?page=isometrics&project=<project id>&id=<iso id>&view=` (sample: `index.php?page=isometrics&project=1&id=895&view=`).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries"; with a filter in effect the page shows "(filtered from 235 total entries)". Empty text: "No data available in table"; no-match text: "No matching records found".
- "Show" filter semantics as shown by the two captures: "Hide released" (default) returns 1 row; "Show released" returns 0 rows for this sandbox.

## Dialogs

### Release selected (`#releaseRequestModal`) — opened by top-bar button "Release selected" (`#releaseRequest`)
Form: `action="../core/pdf/releaseDoc.php"`, `method="get"`, `target="_blank"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `selectedIDS` (`#releaseIDS`) | hidden, readonly | no | empty | filled by the page script with the ticked rows' ids (comma separated) |
| 2 | (none) | `itp` | hidden, readonly | no | empty | no script filling it is shown in the capture |
| 3 | (none) | `fileid` | hidden | no | empty | — |

Text in the dialog (Dutch in the reference): asks "Weet u zeker dat u een release document wilt genereren?" (are you sure you want to generate a release document).
Buttons: "Confirm" (`name="confirmRelease"`, type submit, green), "Cancel" (dismiss). Header close "x".
Same-page related dialog `#releaseRequestModalField` ("Release selected", action `../core/pdf/releaseDocField.php`, fields `selectedIDS` `#releaseIDSfield`, `itp`, `fileid`, button `confirmReleaseField`) is present but belongs to Field release; no control of this page opens it.

### Filter (`#filterReleases`) — opened by top-bar button "Filter"
Form: `action="index.php"`, `method="get"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | `project` | select (select2) | no | All (empty value) | 2 options: "" → All ; 1 → 20240101 |
| 2 | ITP No | `itp` | select (select2) | no | All | 1 option: "" → All |
| 3 | Show | `show` | select (select2) | no | Hide released | 2 options: hideReleased → Hide released (default in the normal capture) ; showReleased → Show released (default in the "released" capture, i.e. it reflects the current URL) |
| 4 | (none) | `page` | hidden | no | `isometrics-finished` | — |

Buttons: "Go" (`name="filter"`, submit, primary), "Cancel". Submitting is a GET to `index.php` with `project`, `itp`, `show`, `page`.

### Release archive (`#releaseArchive`) — opened by Options → "Release archive 0"
Form `method="post"`. Title "Release archive". Content: DataTables with export buttons "CSV", "Excel", print icon and a search input (placeholder "Search"). Table `#datatableWarehouseDP1`, client-side, page length 20 (menu 5, 20, 50, 100), default sort column 0 ascending. Columns: "File" (sortable) and one column with an empty title (`&nbsp;`, sortable). Empty text "No data available in table"; info "Showing 0 to 0 of 0 entries". Below the table the text "Check for delete" (a delete checkbox per file is implied by the text; no row exists in the capture, so no checkbox is shown).
No `input`, `select` or `textarea` is present in the dialog besides the search box (no `name`).
Buttons: "Delete" (`name="deleteReleaseReport"`, submit, primary), "Cancel".

### Upload signed docs (`#uploadReleaseResults`) — opened by Options → "Upload signed docs"
Form `method="post"`, `enctype="multipart/form-data"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Select report: | `reportNo` (`#reportNoSS`) | select (select2, form-control) | not marked | none (empty) | 0 options in the sandbox (the archive is empty); presumably lists the release reports, but the capture does not show where its options come from |
| 2 | Document Only PDFs are allowed | `files[]` | file, multiple, `accept=".pdf"` | not marked | none | a "Choose file" button plus a read-only text box `#uploader1ndvv8` (placeholder "Nothing selected", no name) that the `onchange` of the file input fills with the chosen file value |

Buttons: "Upload" (`name="uploadReleaseResults"`, submit, primary), "Cancel".

### Project search (`#searchProject`) — opened by the search icon in the panel heading
Shell only in the capture: title "Project search", footer buttons "Search" (`name="search"`, submit) and "Cancel". The body is loaded when the icon is clicked (see next section) and is not in the capture.

## Rules found in the page's JavaScript
- Table init (`$('#datatablePrefab').DataTable`): server-side, processing on, `deferRender`, simple paging, page length 1000, length menu 10/20/50/100/500/ALL, buttons CSV, Excel, print (PDF declared too), export of visible columns except the last. Request: GET `/core/ajax/ajax-table-prefab.php?id=1&itp=&show=<hideReleased|showReleased>&project=0` plus DataTables parameters. The page passes `id`, `itp`, `show`, `project` from the URL/filter.
- Row ticking (`#datatablePrefab tbody` change on `.checkbox`): described under List; the value stored per row comes from data column 15 of the server row. Keeps `#releaseIDS` in step; also writes the same id into other shared hidden lists (`#sidsMass`, `#checkedBoxesMass`, `#checkedBoxesMassPhase`, `#checkedBoxesMassCopy`) that belong to dialogs of other screens.
- `$('#releaseRequest').hide();` runs on load, so "Release selected" is invisible until a row is ticked.
- A click handler on `.open-editCertification` in the table sets `data-id` from data column 12; no such control is in the captured row.
- Project search (`.open-searchProject` click): GET `/core/ajax/searchProject.php` with `action=showroom`; the response is put into `#contentSearchProject` and then `__wsappsInitSearchProjectContent` runs. The `data-id` of the clicked element is copied to `#bookId`.
- Page-level styling script makes `.buttonImport` (the two Options items) visible and hides `.btn-hideInsert`/`.btn-hideEdit` buttons (the Confirm button of the release dialog has class `btn-hideInsert`; the Upload button has `btn-hideImport`).
- Validation messages: none found in the capture. Two further requests exist in the shared script (`ajax-table-field.php` for the Field release table, `getListOfMaterials.php`) but are not used by this page's visible controls.

## Sample data
Normal view (Hide released): "Showing 1 to 1 of 1 entries (filtered from 235 total entries)". Released view (Show released): "Showing 0 to 0 of 0 entries (filtered from 235 total entries)", row "No matching records found". Release archive: 0 files (count 0, empty table). Upload signed docs: 0 report options. Project filter has one project: 20240101. ITP No filter has no options besides All.

| Options | Project | ISO | IRN | Rev. no. | ITP No | ITP No 2 | Spools | Piping class | Drawing no. 1 | NoBo | X Ray % | PWHT | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Choose ITP | 20240101 | 0003 (link, iso id 895) | - | - | - | - | J | - | - | No | - | No | Prio not set |

## Not in the capture
- Body of `#searchProject` (loaded by `searchProject.php?action=showroom` when the search icon is clicked): fields not shown.
- What "Choose ITP" in the Options cell does (not a recorded control), and the row checkbox position/markup (not visible in the single row).
- What Confirm in "Release selected" returns (a PDF in a new tab from `releaseDoc.php`); not clicked per the browser-pass notes ("Not opened: Release selected, Go, Choose ITP, refresh … Delete in archives").
- Result of the refresh button (`refresh=ok`).
- Release archive rows and the delete checkbox markup (archive empty); options of "Select report:" (empty).
- Rows beyond the first page: none exist for the normal view (1 row).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, releaseRequestModalField, showCustomHydro, showCustomHydroAgain, hydrotestRequest, transferLagerRequest, moveToLaydownDashboard, filterSpoolTransport, importHydrotestResultsSingle, showHydrotestResultsSingle, filterSpoolTransportMaterials, importHydrotestResults, filterPendingMaterials, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
