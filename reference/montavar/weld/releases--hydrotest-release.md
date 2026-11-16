# Weld Pilot → Releases → Hydrotest release

Source: `weld__releases__hydrotest-release.txt` (Test systems tab), `weld__releases__hydrotest-spools.txt` (Spools tab, unfiltered), `weld__releases__hydrotest-spools-ptc01.txt` (Spools tab filtered to one test system), and the dialog captures `weld__releases__hydrotest-release__edit-ts.txt`, `…__documents.txt`, `…__results.txt`, `…__request-form.txt` — captured 2026-11-16 on the sandbox project site, read-only. URLs: `/weldpilot/index.php?page=hydrotest-request&tab=test-systems` (Test systems), `/weldpilot/index.php?page=hydrotest-request&tab=hydrotest` (Spools), `/weldpilot/index.php?testSystem=1&project=&page=hydrotest-request&tab=hydrotest&filterSpools=` (Spools filtered to test system 1).
State of the page for the observing account: normal.

## Page

- Browser title: "Hydrotest release - WeldPilot®". Breadcrumb (mobile, `visible-xs`) and top-bar link: "Hydrotest release" → `index.php?page=hydrotest-request&tab=test-systems`.
- Two tabs (`ul.nav-tabs.wsapps-hydro-tabs`):
  - "Test systems" → `index.php?page=hydrotest-request&tab=test-systems` (script variables `__wsappsHydrotestTab = "test-systems"`, `__wsappsIsTestSystems = true`, `__wsappsIsTestSystemsOverview = true`).
  - "Spools" → `index.php?page=hydrotest-request&tab=hydrotest` (`__wsappsHydrotestTab = "hydrotest"`).
- Top-bar buttons per tab:

| Tab | Button (label) | Look | Opens / does |
|---|---|---|---|
| Test systems | "Add test system" (plus icon; the same plus button is also in the panel heading next to the title "Test systems") | primary | dialog `#addTestSystem` |
| Spools (any state) | "Move to test system" (arrow icon, `#hydrotestMoveToSystemBtn`, class `open-hydrotestMoveTestSystem`) | dark; DISABLED in the capture | dialog `#hydrotestMoveTestSystem` |
| Spools (any state) | "Results" (check icon, dropdown) | dark | menu with "Enter results" → `#importHydrotestResults`, and "Results history" → `#showHydrotestResultsSingle` |
| Spools (any state) | "Filter" (sliders icon) | dark | dialog `#filterSpoolTransport` |
| Spools, only in the capture filtered to one test system | "Hydrotest release" (play icon, `#hydrotestReleaseBtn`, class `open-hydrotestRequest`, `data-id="1"`) | dark | dialog `#hydrotestRequest` |

The "Hydrotest release" button is present in the filtered capture (`testSystem=1`) and absent in the unfiltered Spools capture. The script variable `__wsappsHasTestSystemFilter` is `false` on the unfiltered page and `true` on the filtered page.

- Spools tab panel heading: unfiltered capture shows the text "Zandbak" (the project site name) with no buttons; the filtered capture shows the title "PTC 01" and a button "Attachments" (paperclip icon, class `open-showCustomHydro`, `data-id="1"`) → dialog `#showCustomHydro`.
- Test systems tab panel heading: icon + "Test systems" + the plus button (opens `#addTestSystem`).

## List

### Test systems tab (`#datatableHydroTestSystems`)
- Columns in order (all visible): "Name" (sortable), "TS accepted by client" (sortable), "Options" (not sortable).
- Client-side table (`serverSide: false`, `ajax: null`). Default sort: column 0 ascending. Page length 25; length menu 10 / 25 / 50 / 100 ("Show … entries"). Single global search input (placeholder "Search", with a clear button); no per-column search inputs; no export/print buttons; no bulk actions; no row checkboxes.
- Info text "Showing _START_ to _END_ of _TOTAL_ entries"; empty text "No data available in table"; no-match text "No matching records found". Capture shows "Showing 1 to 2 of 2 entries".
- Name cell: a coloured square (`label label-success` or `label label-danger`) followed by the name as a link to `/weldpilot/index.php?testSystem=<id>&project=&page=hydrotest-request&tab=hydrotest&filterSpools=` (the Spools tab filtered to that test system). From the browser-pass notes: green square = "Approved"; the PTC 02 square carries class `label-danger` but was seen rendered blue, with the value "Testing not applicable".
- Row options, in order (three small full-width buttons):
  1. Folder-open icon (warning button) → same link as the name (Spools tab filtered to the test system).
  2. Pencil icon (`buttonEdit open-editTestSystem`, `data-id=<id>`) → dialog `#editTestSystem`, body loaded by `GET /core/ajax/editTestSystem.php?id=<id>&action=showroom`.
  3. Trash icon (`buttonDelete open-deleteTestSystem`, `data-id=<id>`) → dialog `#deleteTestSystem`.
- From the browser-pass notes: the row has no documents or results control; those are reached on the filtered Spools page.

### Spools tab (`#c_b`)
- Columns in order (all visible): "Project", "ISO", "Spool", "Diameter", "Paint spec.", "Asset tag", "Test pressure", "Test system", "Check" (not sortable; the others sortable).
- Client-side (`serverSide: false`, `ajax: null`). Default sort: column 6 ("Test pressure") ascending. Page length 25; length menu 10 / 25 / 50 / 100. Global search "Search"; no per-column search; no export/print buttons.
- Info/empty/no-match texts as above. Captures show "Showing 1 to 4 of 4 entries" (unfiltered) and 2 rows when filtered to PTC 01.
- ISO cell: coloured square (`label-success` or `label-danger`) + link to `index.php?page=isometrics&id=<iso id>&project=<project id>` (opens in a new tab). The meaning of the two colours is not stated in the capture.
- "Test system" cell: a link (`open-showCustomHydro`, `href="#showCustomHydro"`, `data-id=<test system id>`) with the test system name, or "--" with `data-id="0"` when the spool has none; click opens dialog `#showCustomHydro` (Attachments).
- "Check" cell: a checkbox, `name="ccid_<iso id>"`, value `<iso id>.<number>` (for example `895.34`, `3.1`, `1.52`). Whether the number after the dot is a spool id is not stated in the capture.
- No row options column and no Options (bulk) menu. The checked checkboxes drive the top-bar buttons (see Rules).

## Dialogs

### Add test system (`#addTestSystem`) — opened by "Add test system" (top bar, and plus button in the panel heading)
Form: `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Test system | `name` | text | yes | empty | |
| 2 | Description | `description` | textarea (replaced by a rich-text editor; toolbar: bold, italic, two list buttons, four alignment buttons, clear) | no | empty | `wsapps-quill-source` |
| 3 | Test system accepted by client | `goodresult` | select | no | "-- Not set --" | 3 options: 0 → "-- Not set --" (selected); 1 → "Testing not applicable"; 2 → "Approved" |

Buttons: "Add" (`name="addTestSystem"`, submit, primary), "Cancel" (closes), close cross.

### Edit test system (`#editTestSystem`) — opened by the pencil icon in a Test systems row
Body is loaded by `GET /core/ajax/editTestSystem.php?id=<id>&action=showroom` into `#contentTestSystem`. Form: `method="post"`. Shown for test system 1 ("PTC 01").

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Test system | `name` | text | yes | the test system's name ("PTC 01") | |
| 2 | Description | `description` | textarea | no | empty in the capture | |
| 3 | Test system accepted by client | `goodresult` | select | no | the stored value ("Approved" for PTC 01) | same 3 options as in Add: 0 "-- Not set --", 1 "Testing not applicable", 2 "Approved" |
| 4 | (none) | `editID` | hidden | — | the test system id (1) | |

Buttons: "Update" (`name="editTestSystem"`, submit, warning), "Cancel". The static (not yet loaded) dialog shows only the header and these two buttons.

### Delete test system (`#deleteTestSystem`) — opened by the trash icon in a Test systems row
Form `method="post"`; text "Are you sure?".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `deleteID` | hidden (`#bookIdDeleteTestSystem`) | — | empty; filled with the row's `data-id` when the trash icon is clicked | |

Buttons: "Delete" (`name="deleteTestSystem"`, submit, danger, trash icon), "Cancel".

### Move to test system (`#hydrotestMoveTestSystem`) — opened by "Move to test system" (Spools tab)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Test system | `testSystem` | select (select2) | no | "----" (value 0) on the unfiltered page; "PTC 01" preselected on the page filtered to PTC 01 | 3 options: 0 → "----"; 1 → "PTC 01"; 33 → "PTC 02" |
| 2 | (none) | `selectedIDS` (`#hydrotestSelectedIDS`) | hidden, readonly | — | comma-separated values of the checked spool checkboxes | filled by script on show and on submit |
| 3 | (none) | `fileid` | hidden | — | empty | |

Buttons: "Confirm" (`name="confirmMoveToTestSystem"`, submit, success), "Cancel".

### Hydrotest release (`#hydrotestRequest`) — opened by "Hydrotest release" (Spools tab filtered to one test system)
Large dialog. Form `#hydrotestRequestForm`, `action="/core/pdf/hydrotest-book.php"`, `method="post"`, `target="_blank"` (the result opens in a new browser tab). In the filled capture a heading shows the test system name ("PTC 01"). All fields are optional (none marked required).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `testSystem` | hidden, readonly | — | test system id (1 in the filtered capture; empty in the unfiltered one) | |
| 2 | (none) | `ts` | hidden, readonly | — | test system name ("PTC 01"; empty in the unfiltered one) | |
| 3 | QA/QC engineer | `company` | select (select2) | no | first option selected | 19 options, value → person: 1, 3 to 19, and 23 (person names, not copied here); no empty option |
| 4 | Test record no. | `testNo` | text | no | empty | |
| 5 | Pump type | `pumpType` | text | no | empty | |
| 6 | Hose type | `hoseType` | text | no | empty | |
| 7 | Manifold | `manifold` | text | no | empty | |
| 8 | Pressure gauge no. | `manometer` | text | no | empty | |
| 9 | Recorder No | `recorderno` | text | no | empty | |
| 10 | Calibration cert | `calibrationcert` | text | no | empty | |
| 11 | Piping class | `pipingclass` | text | no | empty | |
| 12 | Design code | `designcode` | text | no | empty | |
| 13 | Test medium | `testmedium` | text | no | empty | |
| 14 | Required Test pressure | `testpressurereq` | text | no | empty | |
| 15 | Actual Test pressure | `testpressure` | text | no | empty | |
| 16 | Date | `date` | text with date picker (class `dpicker`) | no | empty | |
| 17 | Test start | `teststart` | text | no | empty | |
| 18 | Test end | `testend` | text | no | empty | |
| 19 | Area temp | `areatemp` | text | no | empty | |
| 20 | Test duration | `testduration` | text | no | empty | |
| 21 | Required Leak Test Pressure | `requiredleak` | text | no | empty | |
| 22 | Leak Test duration | `leakduration` | text | no | empty | |
| 23 | (none) | `name` | hidden, readonly | — | the signed-in user's name (person A; not copied) | |
| 24 | Note | `note` | textarea (rich-text editor, toolbar as in Add test system) | no | empty | |
| 25 | Include isometric(s) (under the heading "Include files in hydrotest release") | `isoshow` | checkbox, value `ok` | no | unchecked | |
| 26 | (none) | `selectedIDS` (`#t2vv`) | hidden, readonly | — | in the filtered capture "895.34,3.1" (the values of the checked spool checkboxes; both rows were checked in that capture); empty otherwise | |
| 27 | (none) | `fileid` | hidden | — | empty | |

Buttons: "Confirm" (`name="confirmHydrotestRequest"`, submit, success), "Cancel".

### Attachments (`#showCustomHydro`) — opened by the "Attachments" button in the panel heading, or by a "Test system" cell link in a spool row
Body loaded by `GET /core/ajax/showCustomHydro.php?id=<test system id>&action=showroom` into `#contentShowCustomHydro`. Form `method="post"`, `enctype="multipart/form-data"`. Shown for test system 1.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Custom document type | `type` | select | no | "Punchlist" | 6 options: 4 → "Punchlist" (selected); 15 → "Pressure test ITP"; 8 → "Blind list"; 14 → "Pressure gauge/recorder calibration cert."; 10 → "Piping and instrumentation diagram (P&ID)"; 6 → "3D snippet" |
| 2 | Document (Hold CTRL for multiple files upload) Only PDFs are allowed | `files[]` | file, multiple, `accept=".pdf"` (with a read-only-looking text box "Nothing selected" and a "Choose file" button) | no | none | |
| 3 | (none) | `editID` | hidden | — | test system id (1) | |
| 4 | (none) | `ndtpdf` | hidden | — | 1 in the capture | |

Below the file field there is an empty table (no documents were stored for PTC 01) and the text "Check for delete" (the delete checkboxes of stored files would sit here; none shown). Buttons: "Save" (`name="customHydro"`, submit, warning), "Cancel". When the test system id is 0 ("--" link) the dialog is requested with `data-id="0"`; that response was not captured.

### Enter results (`#importHydrotestResults`) — opened by "Results" → "Enter results" (Spools tab)
Form `method="post"`, `enctype="multipart/form-data"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Test system | `request` (`#requestNo`) | select (select2) | no | "PTC 01" (first) | 2 options: 1 → "PTC 01"; 33 → "PTC 02" |
| 2 | Document (Only PDFs are allowed) | `file` | file, multiple, `accept=".pdf"` | no | none | |
| 3 | Accepted? | `status` | checkbox, value `ok` | no | unchecked | |
| 4 | (none) | `page` | hidden | — | `hydrotest-request` | |

Buttons: "Add" (`name="resultsHydrotest"`, submit, primary), "Cancel".

### Results (`#showHydrotestResultsSingle`) — opened by "Results" → "Results history" (Spools tab)
Static dialog (no request). Table `#datatableWarehouseDP1x`, client-side: columns "Test system", "File", "Result", "Options" (all sortable); default sort column 2 ascending; page length 20, menu 5 / 20 / 50 / 100; buttons CSV, Excel, print; global search. Info text "Showing 1 to 1 of 1 entries". Form `method="post"`.
Row in the capture: Test system "PTC 01"; File link "no.png |" → `../core/export/down.php?file=hydrotests/no.png` (new tab); Result: a check icon; Options: hidden input `name="id"` (value 1) and a danger trash button `name="deletePTC"` (submit). Footer: "Cancel" only.

### Filter (`#filterSpoolTransport`) — opened by "Filter" (Spools tab)
Form `action="index.php"`, `method="get"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Test system | `testSystem` | select (select2) | no | "All" (empty value); on the filtered page "PTC 01" | 3 options: "" → "All"; 1 → "PTC 01"; 33 → "PTC 02" |
| 2 | Project | `project` | select (select2) | no | "All" | 2 options: "" → "All"; 1 → "20240101" |
| 3 | (none) | `page` | hidden | — | `hydrotest-request` | |

Buttons: "Go" (`name="filterSpools"`, submit, primary), "Cancel". The filtered URL is `index.php?testSystem=…&project=…&page=hydrotest-request&tab=hydrotest&filterSpools=`.

## Rules found in the page's JavaScript
Only what the captures contain (the large shared script is mostly "already captured on earlier pages"; only differing lines are listed).

- Inline script on the Spools tab (`updateTextArea`, `__wsappsCollectCheckedSpoolIds`): collects the values of all checked checkboxes inside `#c_b`, joins them with commas, and writes the result into `#t2`, `#sids` and `#hydrotestSelectedIDS`. It runs on checkbox `change` and `click`, once on load, and every 250 ms (an interval poll). When at least one box is checked the "Move to test system" button (`#hydrotestMoveToSystemBtn`) is enabled; otherwise it is disabled.
- The same function enables `#hydrotestReleaseBtn` when `__wsappsHasTestSystemFilter` is true (the page is filtered to a test system); `setHydrotestReleaseEnabled` is defined for it. Whether the button is disabled before that is not shown (the button is absent from the unfiltered page).
- Before the Move dialog is shown (`show.bs.modal` on `#hydrotestMoveTestSystem`) and on its form submit, `#hydrotestSelectedIDS` is refilled with the checked values.
- Test systems tab: click on `.open-editTestSystem` shows `#editTestSystem` and loads `GET /core/ajax/editTestSystem.php?id=<data-id>` into `#contentTestSystem`; click on `.open-deleteTestSystem` copies the `data-id` into the hidden `#bookIdDeleteTestSystem` (name `deleteID`).
- Click on `.open-showCustomHydro` shows `#showCustomHydro` and loads `GET /core/ajax/showCustomHydro.php?id=<data-id>` into `#contentShowCustomHydro` (the log shows `&action=showroom` added).
- The "Hydrotest release" dialog form posts to `/core/pdf/hydrotest-book.php` in a new tab; the capture contains no validation script for it.
- Requests made while loading these pages: `/core/ajax/ajax-notifications.php?action=count_unread` (returns `{"count":0}`). Other requests in the shared script (`getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`) are part of other screens.
- No validation messages are visible in the capture beyond the HTML `required` attribute on the "Test system" name field (Add and Edit).

## Sample data

Test systems tab ("Showing 1 to 2 of 2 entries"):

| Name | TS accepted by client | Square colour class | Options |
|---|---|---|---|
| PTC 01 (id 1) | Approved | label-success | folder, pencil, trash |
| PTC 02 (id 33) | Testing not applicable | label-danger | folder, pencil, trash |

Spools tab unfiltered ("Showing 1 to 4 of 4 entries"), band title "Zandbak":

| Project | ISO | Spool | Diameter | Paint spec. | Asset tag | Test pressure | Test system | Check value |
|---|---|---|---|---|---|---|---|---|
| 20240101 | 0003 (success) | Spool J | - | - | - | - | PTC 01 | 895.34 |
| 20240101 | 00032 (danger) | Spool J | - | - | - | - | -- | 6191.34 |
| PR001 | 001 (success) | SP02 | 2.5 | 1 | - | 5.7 | PTC 01 | 3.1 |
| 20240101 | 0001 (danger) | SP01 | ND250 | A10 | N011-HV10001-0001 | 29 | -- | 1.52 |

Filtered to PTC 01 (2 rows): the rows with ISO 0003 (Spool J) and ISO 001 (SP02) above, same values; panel title "PTC 01".

Selects: Test system select options 1 → PTC 01, 33 → PTC 02; Project options 1 → 20240101. Results history: 1 row (PTC 01, file "no.png |", accepted check). Attachments for PTC 01: no stored documents.

## Not in the capture

- Body of the Attachments dialog for a spool with no test system (`data-id="0"`, link "--").
- Server behaviour and result of every submit (Add / Update / Delete test system, Move, Enter results, Save attachments, Confirm hydrotest release PDF), and the contents of the generated PDF from `/core/pdf/hydrotest-book.php`.
- Meaning of the green and red ISO squares on the Spools tab.
- The Enter results dialog body in the "Enter results" copy `#importHydrotestResultsSingle` (a second dialog of the same name; its static copy shows only header, "Add" with `name="resultsHydrotest"` and "Cancel"; it is not linked from this page's visible controls).
- Delete of a result (`deletePTC` trash button) and delete of attachments (the "Check for delete" list), both not opened.
- The `showCustomHydroAgain` dialog and the "Release selected" dialogs (`releaseRequestModal`, `releaseRequestModalField`), present in the page but not linked from any visible control of this page.
- Effect of the "Project" filter on the Spools list (only the `project` select with one project is shown).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, releaseRequestModal, releaseRequestModalField, showCustomHydroAgain, transferLagerRequest, moveToLaydownDashboard, filterReleases (fields project, itp, show, page), filterSpoolTransportMaterials (fields project, group, keywordCC, keyword, currently, page), filterPendingMaterials (fields project, supplier, page, view), chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
