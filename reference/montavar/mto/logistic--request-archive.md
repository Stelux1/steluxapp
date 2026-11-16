# MTOPilot → Logistic → Request archive

Source: `mto__logistic__request-archive.txt`, `mto__logistic__request-archive-servicematerials.txt`, `mto__logistic__request-archive__upload-signed.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=requests-archive&from=01.01.2020&to=31.12.2026`.
State of the page for the observing account: normal.

Browser-pass notes used for controls that were seen but not captured: `reference/montavar/raw/_interactive/I3-mto.md`, section "Request archive".

## Page

- Title (browser tab): "Request archive - MTOPilot®".
- Breadcrumb: none in the capture.
- Tabs: none. The request type is switched with the "From Date" select in the filter form (see List).
- Panel heading: icon (list glyph) + "Archive".
- Buttons above the list:
  - "Order by date desc." (dark dropdown toggle, `btn-dark dropdown-toggle`) → menu with two links:
    - "Order by date desc." → `index.php?page=requests-archive&type=&project=&from=01.01.2020&to=31.12.2026` (on the servicematerials capture the `type=` value is `servicematerials`)
    - "Order by date asc." → same URL plus `&sort=asc`
  - "Filter" (dark, submit button `name="search"`, icon: search) → submits the filter form with GET (see List).
  - Top bar: icon button "Scan QR" (`title="Scan QR"`, class `open-srArchiveScan`, icon `fa-qrcode`) → opens dialog "Scan QR" (`#srArchiveScanModal`). The top bar is the same markup as in the capture `weld__releases__request-archive.txt`, which contains this button.
  - Floating button (class `wsapps-handheld-fab-btn`, `aria-label="Scan QR"`, icon `fa-qrcode`) with a menu of two items:
    - "Scan material" (`data-action="material-qr-scan"`) → dialog "Scan material" (`#materialQrScanModal`).
    - "Scan service request" (`data-action="service-request-scan"`) → opens dialog "Scan QR" (`#srArchiveScanModal`).
- Row controls and links that are not buttons above the list are described under List.

## List

- Table: `#datatable3paginate`, classes `table table-striped table-bordered table-hover`.
- Columns in order (header row): **Date**, **Report No.**, **Company**, **Added by**, **Options**.
- Hidden columns: none shown in the capture.
- Default sort: the capture shows no DataTables configuration (no `DT` line). The rows are drawn as plain table rows. The order shown is 00002 then 00001 (both dated 28.06.2024. 09:16). The sort dropdown label reads "Order by date desc.", and the URL without `sort=` is the default.
- Page length options: not in the capture.
- Per-column search inputs: none in the capture.
- Filters: a GET form above the table (no script or action attribute shown in the capture; the form is submitted by "Filter" to the same page):
  - hidden `page` = `requests-archive`
  - hidden `type` (empty in the base URL; `servicematerials` when that type is selected)
  - hidden `project` (empty)
  - select `type` (label above it reads "From Date"; see Dialogs for the options)
  - text `from` (placeholder "From date", value `01.01.2020`, class `dpicker`)
  - text `to` (placeholder "To date", value `31.12.2026`, class `dpicker`)
  - button "Filter"
- Row options (column "Options", in this order, per row; all icon-only, no text):
  1. Print icon → opens (new tab, `target="_blank"`) `../core/export/down.php?file=servicerequests/<date>_S1_R000xx-ServiceRequest.pdf` (the existing PDF of the service request). Example: `20240628_S1_R00002-ServiceRequest.pdf`.
  2. Print icon → opens (new tab) `../core/export/down.php?file=servicerequests/<date>_S1_R000xx-CoatingRelease.pdf`. Example: `20240628_S1_R00002-CoatingRelease.pdf`.
  3. Pencil icon, `title="Sign online"` → inline `onclick`: `window.open('/core/ajax/render-service-request-completion.php?request_id=<id>&mode=edit', 'srCompletion_<id>'); return false;` (opens a new window; not opened in the capture).
  4. Upload icon, `title="Upload"`, class `open-editServiceRequest`, `href="#editServiceRequest"`, `data-toggle="modal"`, `data-id="<id>"` → opens dialog "Upload signed doc" (`#editServiceRequest`).
- Bulk actions (Options menu): none in the capture.
- Export / print buttons above or below the table: none in the capture (only the per-row print icons above).
- Info text: not in the capture (no "Showing … entries" text in the captured DOM).
- Empty text: no "No data available in table" text is in the captured DOM for the servicematerials type (the table has a header and no rows). The capture does not show the text itself.
- Server-side table request (`ajax` url): none in the capture; the table is not configured as server-side in the captured DOM.
- Type select options (the "From Date" labelled select, `name="type"`): `service` → "Service request" (default); `servicematerials` → "Service request - Materials". The servicematerials capture shows the second one selected.
- Service request (default type) rows shown: 2. Service request - Materials rows shown: 0 (header only).

## Dialogs

### Upload signed doc (`#editServiceRequest`) — opened by the Upload icon of each row (`.open-editServiceRequest`, `data-id` = the row's request number)

The dialog markup in the page has a header and a footer only. The body is loaded on the click (`GET /core/ajax/editServiceRequest.php?id=<row id>&action=showroom`, status 200) and placed into `#contentEditServiceRequest`. The capture `mto__logistic__request-archive__upload-signed.txt` shows the body after a click on row 00002.

Form: `method="post"`, `enctype="multipart/form-data"`. No `action` attribute appears in the captured markup.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | File | `file` (id `file1`, class `gui-file`) | file | not shown in the capture | no file (the visible text field shows "Nothing selected") | The label "File" is above the field. The file input is visually a "Choose file" button (span, class `button btn-dark`). Its `onchange` copies the chosen file name into field 2. |
| 2 | (no label) | none (id `uploader2xc2`, class `gui-input`) | text | not shown | empty; placeholder "Nothing selected" | Display only: filled by the `onchange` of field 1. It has no `name`, so it is not sent. The capture shows no READONLY flag. Has a decorative upload icon (`fa-upload`) beside it. |
| 3 | (no label) | `editID` | hidden | — | `2` for row 00002 (the row's request number; for another row the value is that row's number) | Filled from the row that was clicked. |

Only one input is named and sent with the form in the captured markup: `file`, and `editID` as hidden.

Buttons:
- "Upload" — type submit, `name="editServiceRequest"`, class `btn btn-primary`, footer.
- Close icon "×" (`fa-times`, class `close`, `data-dismiss="modal"`) in the header.
- No Cancel button. The browser-pass notes say the dialog is closed with Escape or the ×, and that nothing was uploaded.

Text in the dialog: the title "Upload signed doc", the label "File". No rule text.

### Scan QR (`#srArchiveScanModal`) — opened by the top bar "Scan QR" button (`.open-srArchiveScan`) and by the floating menu item "Scan service request"

Fields: none (no input, select, textarea or checkbox).

Buttons:
- "Start scanner" — type button, class `btn btn-primary btn-sm sr-archive-scan-start`, camera icon.
- "Stop" — class `btn btn-default btn-sm sr-archive-scan-stop`, stop icon; hidden when the dialog opens (`HID`).
- "Cancel" — class `btn btn-default`, `data-dismiss="modal"`, footer.
- Close icon "×" in the header (`data-dismiss="modal"`).

Text in the dialog: title "Scan QR"; help text "Point the camera at the QR code on the printed document."

Scanner messages written by the shared page script (the text is in `mto__start__dashboard.txt`; this page's capture only references it as already captured): "Scanner active — point at the QR code." / "Scanner active (compatibility mode)." / "No camera available on this device." / "Camera permission is blocked. Allow the camera for this site in the browser." / "This QR code is not a service request." / "Processing QR code…".

### Scan material (`#materialQrScanModal`) — opened by the floating menu item "Scan material" (`data-action="material-qr-scan"`)

Fields: none.

Buttons:
- "Start scanner" — class `btn btn-primary btn-sm material-qr-scan-start`, camera icon.
- "Stop" — class `btn btn-default btn-sm material-qr-scan-stop`, stop icon; hidden when the dialog opens (`HID`).
- "Cancel" — class `btn btn-default`, `data-dismiss="modal"`, footer.
- Close icon "×" in the header.

Text in the dialog (paraphrased): the code stays with the material number, and a scan shows every storehouse and every project inventory that still holds the material. Title: "Scan material".

The handler that opens this dialog from the floating menu item is not in the captured text.

Also present in the page, opened from elsewhere (not opened by a control of this page in the capture): editCompanyData, passwordChange, themeChange, admin ("System settings"), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder.

## Rules found in the page's JavaScript

- Validation: none found in the capture for the filter form or the upload dialog.
- Upload dialog (shared script, `jQuery(document).on("click", ".open-editServiceRequest", …)` in `weld__releases__request-archive.txt`, same page script): on click it reads `data-id` as the request id, sends a GET to `/core/ajax/editServiceRequest.php?id=<id>` (the logged request carries `action=showroom`), and writes the response into `#contentEditServiceRequest`. The submit handling of "Upload" is not in the capture.
- File chooser (inline `onchange` on `#file1`): copies the chosen file name into `#uploader2xc2`. No other field is computed.
- Sign online (inline `onclick` on the pencil icon): opens the completion page in a new window with `request_id` and `mode=edit`. Shared script also has a handler for the class `open-signServiceRequest` that opens `/core/ajax/render-service-request-completion.php?request_id=<data-id>&mode=edit`; no element of this page carries that class. It returns without action when `data-id` is empty.
- QR scanning (shared script `mto__start__dashboard.txt`, class `ArchiveQrScanner`, function `openScanModal`): clicking `.open-srArchiveScan` or the "Scan service request" item opens `#srArchiveScanModal` and starts the scanner. The scanner uses the browser's native QR detection when present; otherwise it loads the core asset `assets/js/jsqr.min.js` once. "Start scanner" / "Stop" buttons start and stop the camera. Closing the dialog (`hidden.bs.modal`) stops the scanner. Status texts are listed above. No request is made by the scanner in the capture other than the asset load.
- Date fields (class `dpicker`): when a container is shown, these are initialised as date pickers with format `dd.mm.yyyy` (shared script, function `initDeferredUiEnhancements`). Visible fields only; hidden modal fields are initialised when the modal is shown.
- Select (class `select2-single`): initialised as select2 when visible (same function).
- Requests the page makes: on load `GET /core/ajax/ajax-notifications.php?action=count_unread` (captured XHR); on Upload click `GET /core/ajax/editServiceRequest.php?id=<id>&action=showroom`; PDF links and Sign online are plain links or `window.open` calls (not requests the capture recorded). The filter form submits a GET to `index.php?page=requests-archive` with `type`, `project`, `from`, `to`, `search`.
- Page marker: `var __wsappsDebugPage = "requests-archive";` (shared script).

## Sample data

Sandbox state (as displayed):

- Filter values: From `01.01.2020`, To `31.12.2026`, type "Service request".
- Service request: 2 rows. Service request - Materials: 0 rows (header only). The capture shows no row counts, "Showing … entries" text or total.

Service request (default type):

| Date | Report No. | Company | Added by | Options |
|---|---|---|---|---|
| 28.06.2024. 09:16 | 00002 | Transport | user code A | print (ServiceRequest PDF), print (CoatingRelease PDF), pencil "Sign online", upload icon "Upload" |
| 28.06.2024. 09:16 | 00001 | Farbara | user code A | print (ServiceRequest PDF), print (CoatingRelease PDF), pencil "Sign online", upload icon "Upload" |

"user code A" stands for one user code (a login derived from a person's name, replaced here) shown in "Added by" (the browser-pass notes call these user codes).

Service request - Materials: no rows.

## Not in the capture

- The table's DataTables settings: hidden columns, sort, page length options, search inputs, info text, empty text and server-side request. The table has no `DT` line in the capture; the controls for these are not shown.
- Rows beyond the two shown for "Service request" (the capture shows all rows the page rendered; no paging controls are captured).
- The body of the Upload dialog for other rows (captured once, for row 00002; the body is loaded per row by the Upload icon's `data-id`).
- The submit handler and target of the "Upload" button in the Upload dialog (no `action` attribute in the captured markup; the upload itself was not performed).
- The "Sign online" completion page, opened only by the pencil icon in a new window (not opened).
- The two service request PDFs and the coating release PDF linked from the print icons (not opened).
- The body of "Scan material" handler for the floating menu item (the handler text is not captured; the dialog itself is in the static DOM).
- The Scan QR and Scan material dialogs were not opened in the capture; their states beyond the static markup are not captured.
- Rows of the "Service request - Materials" type (none shown on the reference sandbox).
- The page's Export button, if any, is not in the capture for this page.
