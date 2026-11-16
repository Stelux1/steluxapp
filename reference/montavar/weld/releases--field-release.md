# Weld Pilot → Releases → Field release

Source: `weld__releases__field-release.txt`, `weld__releases__field-release-released.txt`, `weld__releases__field-release__options-menu.txt`, `weld__releases__field-release__release-archive.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=isometrics-finished-field&show=hideReleased` (second capture: `…&show=showReleased`).
State of the page for the observing account: normal.

## Page
- Browser title: "- WeldPilot®". Panel heading (with list glyph): "Field release". Next to the heading is a small square search-icon button (`.open-searchProject`, `href="#searchProject"`, opens the dialog "Project search").
- Breadcrumb: last item is "Field release" → `index.php?page=isometrics-finished-field`. The earlier breadcrumb items are not in this capture's own lines (they are marked "already captured on earlier pages"). The Prefab release page shows a project-site breadcrumb item "Zandbak" → `index.php?page=project-sites&id=1`.
- Tabs: none.
- Buttons in the top bar, in order:
  | Label | Control | What it does |
  |---|---|---|
  | "Release selected" (play icon `fa-play`) | `a#releaseRequestField.btn.btn-dark.btn-sm.open-releaseRequestModalField`, `href="#releaseRequestModalField"`, `data-id="1"`, `data-toggle="modal"` | Opens dialog `#releaseRequestModalField`. **Hidden on load**: the inline script `$('#releaseRequestField').hide();` runs. From the browser-pass notes (prefab page, same toolbar): it stays hidden until rows are ticked. |
  | "Options" (chevron-down, dropdown) | dropdown with two items, see List → Options menu | Opens the menu. |
  | "Filter" (sliders icon `fa-sliders`) | `href="#filterReleases"`, `data-toggle="modal"` | Opens dialog `#filterReleases`. This button is not among the lines written for this capture (elided as already captured); it is read from the identical top bar of the Prefab release capture (`weld__releases__prefab-release.txt`) and the dialog `#filterReleases` of this page has the hidden input `page=isometrics-finished-field`. The browser-pass notes say the toolbar is the same as on Prefab release (Options, Filter, refresh). |
  | refresh icon (`fa-refresh`, no text) | `a.btn.btn-dark.btn-sm type=submit href="index.php?page=isometrics-finished-field&show=hideReleased&refresh=ok&itp=&project=0"` | Reloads the page with `refresh=ok`. |
- Language links in the header (Nederlands, English, Deutsch, Français) point to `index.php?lang=<nl|en|de|fr>&page=isometrics-finished-field&id=&project=&projectSite=`.

## List
- Table `#datatableField`, server-side (`serverSide: true`). Table request: `GET /core/ajax/ajax-table-field.php?id=1&itp=&show=hideReleased&project=0` plus the usual DataTables parameters (`draw`, `columns[i][data|name|searchable|orderable|search]`, …). With "Show released" the `show` value is `showReleased`. `id=1` is the project-site id; `itp` empty and `project=0` mean no ITP / project filter. The page fires draw=1, 2, 3, … repeatedly while loading (the capture lists many consecutive draws).
- Columns in order (all visible, all sortable): 1 Options, 2 Project, 3 ISO, 4 IRN, 5 Rev. no., 6 ITP No, 7 ITP No 2, 8 Spools, 9 Piping class, 10 Drawing no. 1, 11 NoBo, 12 X Ray %, 13 PWHT, 14 Priority. No hidden columns.
- Default sort: column index 13 (Priority), ascending.
- Page length: 1000 (the default). Length menu "Show [n] entries": 10, 20, 50, 100, 500, ALL (value -1). 1000 is not one of the menu entries.
- Global search box (magnifier, placeholder "Search", with a clear "x" button). No per-column search inputs.
- Export buttons above the table: "CSV", "Excel", print icon (`fa-print`).
- Processing indicator `#datatableField_processing` (hidden until a request).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries"; empty text "No data available in table"; no-match text "No matching records found". With the filter active the info reads "Showing 1 to 2 of 2 entries (filtered from 39 total entries)".
- Filter dialog (`#filterReleases`) and the refresh button are the page's filters; see Dialogs.
- Row cells: the Options cell shows the plain text "Choose ITP" (no link, button or icon appears inside the cell in the capture). The ISO cell is a link: `index.php?page=isometrics&project=<project id>&id=<iso id>&view=weldpilot` (opens the isometric page). No row checkboxes are shown in the captured row cells. Row options beyond "Choose ITP" are not in the capture.
- Options menu (dropdown "Options", file `…__options-menu`):
  - "Release archive 0" (class `buttonImport`) → dialog `#releaseArchiveField`. The "0" is part of the link text; the capture does not say what it counts (the Prefab page notes show it as a blue badge).
  - "Upload signed docs" (class `buttonImport`) → dialog `#uploadReleaseResultsField`.
- Bulk action: "Release selected" (see Page).

## Dialogs

### Release selected (`#releaseRequestModalField`) — opened by the top-bar "Release selected" button
The dialog is written as the same dialog as on the Prefab release capture; the body below is read there. Form: `GET ../core/pdf/releaseDocField.php`, `target="_blank"` (opens a PDF in a new tab).
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `selectedIDS` (`#releaseIDSfield`, class form-control) | hidden, read-only | no | empty | Meant to hold the ids of the rows ticked in the list; how it is filled is not in the capture. |
| 2 | (none) | `itp` | hidden, read-only | no | empty | Not filled in the capture. |
| 3 | (none) | `fileid` | hidden | no | empty | Outside the inner `.modal-body`. |
Text in the dialog (Dutch, untranslated in the English UI): a question asking whether the user is sure they want to generate a release document ("Weet u zeker dat u een release document wilt genereren?"). Buttons: "Confirm" (`name="confirmReleaseField"`, `type="submit"`, green `btn-success btn-hideInsert`), "Cancel" (closes). Title "Release selected".

### Filter (`#filterReleases`) — opened by the top-bar "Filter" button
Form `GET index.php`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | `project` | select (select2) | no | "All" (value empty) | 2 options: `""` → All*; `1` → 20240101 |
| 2 | ITP No | `itp` | select (select2) | no | "All" (value empty) | 1 option: `""` → All* (no ITP numbers listed) |
| 3 | Show | `show` | select (select2) | no | "Hide released" | 2 options: `hideReleased` → Hide released*; `showReleased` → Show released |
| 4 | (none) | `page` | hidden | no | `isometrics-finished-field` | — |
Buttons: "Go" (`name="filter"`, submit, primary), "Cancel". The ITP No list is empty apart from "All" in this sandbox (no dependency on Project is shown in the capture).

### Release archive (`#releaseArchiveField`) — opened by Options → "Release archive 0"
Title "Release archive". Form `method=post`. No inputs. A small table `#datatableWarehouseDP1`: one column "File"; client-side (`serverSide: false`, no ajax), page length 20, length menu 5/20/50/100, sorted by column 0 ascending; buttons "CSV", "Excel", print icon; search box (placeholder "Search"); empty text "No data available in table"; footer "Showing 0 to 0 of 0 entries". Below the table the text "Check for delete" (no checkbox is shown, there are no rows). Buttons: "Delete" (`name="deleteReleaseReportField"`, `type="submit"`, primary), "Cancel". The archive is empty in the sandbox, so no file names or link patterns are shown. (The capture of the opened dialog also shows a second, header-only copy of the table with "File", the usual DataTables header clone.)

### Upload signed docs (`#uploadReleaseResultsField`) — opened by Options → "Upload signed docs"
Form `method=post`, `enctype=multipart/form-data`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | "Select report:" | `reportNo` (`#reportNo22`) | select (select2) | not marked | empty | 0 options in the sandbox (to be filled from the release archive reports; the capture does not say how) |
| 2 | "Document" + hint "Only PDFs are allowed" | `files[]` | file (multiple, `accept=".pdf"`) | not marked | — | Button "Choose file"; companion text box (`.gui-input`, placeholder "Nothing selected") shows the chosen name, filled by an `onchange` handler on the file input. |
Buttons: "Upload" (`name="uploadReleaseResultsField"`, `type="submit"`, primary `btn-hideImport`), "Cancel". The browser-pass notes say the Field upload dialog was not opened separately (same shape as the prefab one).

### Project search (`#searchProject`) — opened by the search-icon button next to the panel heading
Present with title "Project search" and footer buttons "Search" (`name="search"`, submit, primary) and "Cancel". The dialog body is not in the capture (loaded by script; see below).

## Rules found in the page's JavaScript
- Inline script: `$('#releaseRequestField').hide();` — the "Release selected" top-bar button is hidden whenever the page loads.
- A commented-out block (inside `/* … */`) would have collected ticked checkboxes inside `#c_b` into `#checkedBoxes`; it is not active.
- `__wsappsDebugPage = "isometrics-finished-field"` identifies the page in the shared script.
- Requests visible in the page scripts for this page (the large shared script, mostly written in an earlier capture): the table request `GET /core/ajax/ajax-table-field.php` (parameters above); shared helpers `getListOfMaterials.php` (`id`, `timer`, `ajax`), `searchProject.php` (loads the Project search body), `saveAddCalculationModalState.php` (`k`, `v`), `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php` (`id`). None of them is tied to a control of this page in the capture except the table request and `searchProject.php`.
- Selecting rows and filling `selectedIDS` / `itp` of the release dialog: not in the capture.

## Sample data
Filter "Hide released" (default): info "Showing 1 to 2 of 2 entries (filtered from 39 total entries)". Table `total` 39, `shown` 2.

| Options | Project | ISO | IRN | Rev. no. | ITP No | ITP No 2 | Spools | Piping class | Drawing no. 1 | NoBo | X Ray % | PWHT | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Choose ITP | 20240101 | 0003 | - | - | - | - | J | - | - | No | - | No | Prio not set |
| Choose ITP | 20240101 | 0001 | 1000 | - | 111111 | 222222 | - | A11011 | N011-HV10001 | Nee | 10 | Nee | Prio-1 |

Note the mixed languages in the same column: "No" in the first row, "Nee" (Dutch) in the second.

Filter "Show released" (`weld__releases__field-release-released`): zero rows; the table shows "No matching records found" and the info "Showing 0 to 0 of 0 entries (filtered from 39 total entries)" (`total` 39, `shown` 0). The release archive count is 0 in both captures.

## Not in the capture
- What "Choose ITP" in the Options cell does (a control would be needed to see it; the cell has no inner markup in the capture).
- How rows are ticked, and when "Release selected" appears and what ids it submits (the capture has no row checkboxes; notes from the Prefab page say it shows when rows are ticked).
- The Project search dialog body (`searchProject.php`, loaded after a click of the search-icon button).
- The generated PDF (`/core/pdf/releaseDocField.php`) and what the server changes when a release is confirmed (the isometric page's text says the isometric is marked as released after generation, from the browser-pass notes of the isometric page).
- Release archive contents (empty), the options of the "Select report:" list (empty), and the options of "ITP No" in the filter (empty).
- Pagination (page length 1000, no rows beyond the first page).

Also present in the page, opened from elsewhere: `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `releaseRequestModal` (prefab), `showCustomHydro`, `showCustomHydroAgain`, `hydrotestRequest`, `transferLagerRequest`, `moveToLaydownDashboard`, `filterSpoolTransport`, `importHydrotestResultsSingle`, `showHydrotestResultsSingle`, `filterSpoolTransportMaterials`, `importHydrotestResults`, `filterPendingMaterials`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, plus the handheld scan menu ("Scan weld", "Scan flange QR label", "Add punch").
