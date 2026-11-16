# MTO Pilot → Projects data → Pick List archive

Source: `mto__projects__pick-list-archive.txt`, `mto__projects__pick-list-archive-4880.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=picklist-archive&from=01.01.2020&to=31.12.2026` (list view, as opened with the defaults of the capture); detail view: `/mtopilot/index.php?page=picklist-archive&fileid=4880` (pick list R00001, reached from the "Issue" button of the list).

State of the page for the observing account: normal (the list and the detail view both render their content; no "You do not have rights" message).

Both views belong to this menu item. The capture of the list view shows one pick list row; the detail view of that row (`fileid=4880`) is captured separately.

## Page

Title: "Pick List archive" (list view, panel title). Detail view panel title: "Pick List R00001".

Breadcrumb (top bar, `#topbar`):
- List view: "Pick List archive" → `index.php?page=picklist-archive&from=01.11.2026&to=30.11.2026` (the top bar link uses a current-month range, not the range of the filter).
- Detail view: "Pick List archive" (same link as above), then "R00001" → `index.php?page=picklist-archive&fileid=4880`.

Tabs: none on this page.

Buttons above the list (list view):
- "Pick list archive export" (btn-dark, btn-block, in the top bar) → `index.php?page=picklist-archive-export&project=&from=01.01.2020&to=31.12.2026` (export page; not captured).
- "Filter" (btn-dark, submit, icon fa-filter) → submits the filter form (GET to this page, see List).
- "CSV" (DataTables button, class buttons-csv, btn-xs btn-dark) → CSV export of the table (href="#" in the capture; export handler is the DataTables Buttons plugin, columns 0–4, see Rules).
- "Excel" (DataTables button, buttons-excel, btn-xs btn-dark) → Excel export of the table (href="#"; columns 0–4).
- Print icon button (buttons-print, btn-xs btn-dark, icon fa-print) → print of the table (href="#"; columns 0–4).

Buttons above the detail table (detail view, `.pla-info-banner` and the action row):
- "Confirm material take" (btn-sm btn-success, icon fa-check) → opens dialog `#confirmMaterialTake` (href="#confirmMaterialTake", data-toggle="modal").
- "Undo execution" (btn-sm btn-warning, icon fa-undo) → opens dialog `#undoIsoExecutionPickList` (href="#undoIsoExecutionPickList", data-toggle="modal").
- "PDF" (btn-sm btn-dark, icon fa-print) → `../core/export/down.php?file=picklists/20251106_R00001-PickList.pdf`, target _blank (opens the stored pick list PDF in a new tab; the PDF is not captured).
- "Pick List archive" (btn-sm btn-default, icon fa-arrow-left) → `index.php?page=picklist-archive&from=01.11.2026&to=30.11.2026` (back to the list).
- Detail view CSV / Excel / print buttons: same three DataTables buttons as the list, in the detail table panel title (href="#"; export columns 0–8).

Site-wide controls on every page (not specific to this menu item, shown in the capture): a floating "Scan QR" button (`.wsapps-handheld-fab-btn`, aria-label "Scan QR") with the menu items "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`); these open dialogs "Scan material" and "Scan QR" that are present on the page but opened from elsewhere.

## List

Filter form (above the table, GET, `name="page"` hidden with value `picklist-archive`):

| Label | name | Type | Default | Options / notes |
|---|---|---|---|---|
| Project | project | select (select2, single) | "All projects" (value 0) | 2 options: `0` → "All projects" (selected), `1` → "20240101" |
| From Date | from | text (datepicker, class dpicker) | "01.01.2020" | placeholder "From" |
| To Date | to | text (datepicker, class dpicker) | "31.12.2026" | placeholder "To" |

The Filter button is a submit button on this form. The filter does not change the sidebar link (see Page).

Table `#datatablePicklistArchive` (client-side table: `serverSide: false`, `ajax: null`; all rows are in the HTML page):

Columns in order (from the DT line and the header row):
1. Date
2. Report No.
3. Project
4. ISO No
5. Taken?
6. Options

Hidden columns: none (all six have `vis: true`).

Default sort: DT configuration read from the page says `order: [[3,"asc"]]` (ISO No, ascending). The page script block (see Rules) says `order: [[0,'desc']]` (Date, descending). The capture does not show which of the two is in effect after load.

Sortable: columns 1–5 (Options is not sortable: `sort: false`).

Page length: default 25; length menu options 10, 25, 50, 100 (DT `lengthMenu`). The page length selector itself is not in the captured DOM (no `dataTables_length` element was captured).

Per-column search inputs: none. One global search box: `IN .form-control.input-sm type="search" placeholder="Search"` with a clear button (`aria-label="Clear"`, icon fa-times), in the table's filter wrapper.

Row options (column 6 "Options", in order):
1. Print button (btn-warning btn-xs, icon glyphicon-print, no label) → `../core/export/down.php?file=picklists/20251106_R00001-PickList.pdf`, opens in a new tab (target _blank).
2. "Issue" (btn-warning btn-xs, icon glyphicon-log-out) → `index.php?page=picklist-archive&fileid=4880` (detail view of the pick list).

Bulk actions (Options menu): none seen on this page. No row checkboxes are in the captured table.

Export and print: "CSV", "Excel" and the print icon button (see Page). Export columns (script `exportOptions`): 0–4, Date to Taken?, so the Options column is not exported.

Info and empty texts:
- Info (DT `lang.info`): "Showing _START_ to _END_ of _TOTAL_ entries". The captured text: "Showing 1 to 1 of 1 entries".
- Empty (DT `lang.empty`): "No data available in table".
- Zero matches (DT `lang.zero`): "No matching records found".
- Search placeholder: "Search".

Server-side request: none. The table is not server-side (`serverSide: false`, `ajax: null`).

Detail table `#datatablePicklistDetail` (detail view, `fileid=4880`, client-side, `ajax: null`):

Columns in order (DT line and header row "Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Type"):
1. Material group
2. Article No
3. Material No
4. DIA
5. LBS/SCH
6. Description
7. Quantity
8. UOM
9. Type

Hidden columns: none.

Default sort: DT configuration says `order: [[7,"asc"]]` (UOM, ascending). The page script block says `order: [[0,'asc']]` (Material group, ascending). Not resolved by the capture.

Paging: DT configuration says page length 10, length menu 10, 25, 50, 100. The page script block says `paging: false` (no paging). Not resolved by the capture; the captured view shows no rows, so no pager is visible.

Search: one global search box (same markup as the list), `searching: true`.

Row options: none (the detail table has no options column).

Export and print: CSV, Excel and print (see Page); export columns 0–8, Material group to Type (script `exportOptions`).

Info and empty texts:
- Empty row (single body cell, colspan 9): "No data available in table".
- Footer (`.dt-panelfooter`): "Showing 0 to 0 of 0 entries".
- DT `lang.info`: "Showing _START_ to _END_ of _TOTAL_ entries"; `lang.zero`: "No matching records found".

Detail info banner (`.pla-info-banner`, shown above the buttons, as captured): "Project: 20240101 Template project Iso number: 00022 Date: 06.11.2025 07:44 Type: — Status: Open 0 materials, 0 total qty"

## Dialogs

Two dialogs are opened by controls on the detail view. Both are in the page, and the list view has no control that opens them.

### Confirm material take (`#confirmMaterialTake`) — opened by "Confirm material take" (btn-sm btn-success, `href="#confirmMaterialTake"`, `data-toggle="modal"`), detail view only

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Note | comment | textarea (rich-text editor, Quill; the textarea itself is hidden, the editor shown in its place) | not marked in the capture | empty | none |
| 2 | (none, hidden) | fileid | hidden | — | 4880 | the pick list shown on the detail view (the value is the pick list id) |

Fields in the Quill toolbar with no `name` attribute: a text input for the formula / link / video entry (`data-formula="e=mc^2"`, `data-link="https://quilljs.com"`, `data-video="Embed URL"`), and the toolbar buttons (`ql-bold`, `ql-italic`, two `ql-list`, four `ql-align`, `ql-clean`, `ql-preview` link to `about:blank`, `ql-action`, `ql-remove`). The capture does not show what the two list buttons or the four align buttons set.

Dialog text, in document order:
- Above the Note field, a line that is computed for the pick list on screen. On the captured pick list (0 materials) it reads, exactly: "0 materialen, totaal 0 items worden afgeboekt uit voorraad." (in Dutch; in English: 0 materials and 0 items in total will be deducted from stock). The number of materials and items in this line comes from the pick list's content.

Buttons:
- "Confirm" (btn-success, type submit, name `confirmMaterialTake`, icon fa-check)
- "Cancel" (btn default, closes the dialog)

Rule stated by the dialog: confirming takes the pick list's materials out of stock (the sentence above gives the count).

### Undo execution (`#undoIsoExecutionPickList`) — opened by "Undo execution" (btn-sm btn-warning, `href="#undoIsoExecutionPickList"`, `data-toggle="modal"`), detail view only

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none, hidden) | fileid | hidden | — | 4880 | the pick list shown on the detail view |

Buttons:
- "Undo execution" (btn-warning, type submit, name `undoIsoExecutionPickList`, icon fa-undo)
- "Cancel" (btn default, closes the dialog)

Rule stated by the dialog (paraphrased): confirming reverses the pick list, releases its reservations, returns already issued materials to inventory, and puts the isometric back on the execution board. The dialog asks for confirmation before continuing.

Also present in the page, opened from elsewhere or not opened by any control in these captures: `#materialTakeEdit` (title "Confirm material take", Confirm button name `materialTakeEdit`, btn-primary; no opener seen on either view), `#optsActivate` ("Activate selected", with a hidden `selectedIDS` field and `fileid` hidden 4880; no opener seen on either view).

Also present in the page, opened from elsewhere (SAME-AS another capture): `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.

Browser-pass notes (`reference/montavar/raw/_interactive/*.md`): none for this page. No control that was seen but not captured is recorded for it.

## Rules found in the page's JavaScript

- Table setup for `#datatablePicklistArchive` (shared script block in `weld__start__dashboard.txt`, lines ~11760–11779; the page's inline script is that shared script, and the list capture writes only the 9 lines not seen before, including `__wsappsDebugPage`): state saving on; default order Date descending (column 0); page length 25; the last column is not orderable; export buttons CSV, Excel and print, each exporting columns 0–4; the button group is moved into the panel title. The DT configuration read from the page shows different values for order (see List) and does not show the state saving setting.
- Table setup for `#datatablePicklistDetail` (same block, lines ~11781–11800): state saving off; default order Material group ascending (column 0); paging off; searching on; export buttons CSV, Excel and print, each exporting columns 0–8; the button group is moved into the panel title. The DT configuration read from the page shows a page length of 10 and order UOM ascending instead (see List).
- The page's inline script sets `__wsappsDebugPage = "picklist-archive"`. The shared script uses this value only as the `page` field of its debug-log hook (`__wsappsSendDebugLog`), which posts only when a debug endpoint is set; no endpoint is named in these captures.
- Requests the page makes on load: only `/core/ajax/ajax-notifications.php?action=count_unread` (XHR list in the capture; notification count, not related to pick lists).
- Submit handlers for "Confirm material take", "Undo execution" and the other dialogs: none found in the captures. The forms have `method="post"`; the captures show no `action` attribute and no script that handles their submit.
- Fields shown or hidden on a condition: none found in the capture.
- Values computed in the browser: none found in the capture (the count line in the Confirm material take dialog is rendered by the server; the capture does not show a script that computes it).

## Sample data

List view (sandbox, date range 01.01.2020 – 31.12.2026, project "All projects"): 1 row (`total: 1`, `shown: 1`). Info text: "Showing 1 to 1 of 1 entries".

| Date | Report No. | Project | ISO No | Taken? | Options |
|---|---|---|---|---|---|
| 06.11.2025. 07:44 | 00001 | 20240101 Template project | 00022 | No | print icon, "Issue" |

Detail view (pick list R00001, id 4880): 0 materials, 0 total qty, Status "Open", Type "—". Table total 0 (`total: 0`, `shown: 0`). Empty text: "No data available in table". Footer: "Showing 0 to 0 of 0 entries".

Filter project options in the sandbox: "All projects" and "20240101".

## Not in the capture

- Rows of the detail table (materials of a pick list): the captured pick list has none. The column set is given above; the row content is not.
- Other pick lists and other date ranges: the list was captured only for 01.01.2020 – 31.12.2026 and the project "All projects". The top bar link (01.11.2026 – 30.11.2026) and the dashboard link (17.10.2026 – 30.11.2026) were not opened.
- The results of "Confirm material take" and "Undo execution": the dialogs were not submitted (the browser pass did not click them). The server response and any change to stock are not captured.
- The dialog `#materialTakeEdit` and the dialog `#optsActivate`: their opener control is not in these captures.
- The pick list PDF (`down.php?file=picklists/…`) and the export page `picklist-archive-export`: opened in new tabs or by export, not captured.
- The page length selector, the paging controls and the pagination footer of the list view: the DOM capture shows the info text only (no `dataTables_length` or `dataTables_paginate` elements).
- The Quill editor's content (the note text) and its saved value.
