# WeldPilot → Releases → Request archive

Source: `weld__releases__request-archive.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=requests-archive&from=01.01.2020&to=31.12.2026`.
State of the page for the observing account: normal (the archive list is shown).

No dialog captures exist for this page (`weld__releases__request-archive__*` is not in `raw/`). The dialog that the row "Upload" buttons open is described below from the body captured on the MTOPilot request archive (`mto__logistic__request-archive__upload-signed.txt`), because the WeldPilot capture holds only the empty dialog shell.

## Page

- Browser title: `Request archive - WeldPilot®`.
- Panel heading (page title in the content area): "Archive", with a sort dropdown to its right.
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Top bar menu link for this page: "Request archive" → `index.php?page=requests-archive&from=01.11.2026&to=30.11.2026` (the page is also reached with this current-month range).
- Top bar button: icon button, class `open-srArchiveScan`, title "Scan QR" (icon `fa fa-qrcode`). Its target is not in this capture; the browser-pass notes do not cover it. On the MTOPilot pages the captures contain a modal `#srArchiveScanModal` titled "Scan QR", but the capture does not show that this button opens it.
- Buttons above the list:
  - Sort dropdown button "Order by date desc." (toggle) → menu with two links:
    - "Order by date desc." → `index.php?page=requests-archive&type=&project=&from=01.01.2020&to=31.12.2026`
    - "Order by date asc." → `index.php?page=requests-archive&type=&project=&from=01.01.2020&to=31.12.2026&sort=asc`
  - "Filter" (submit, `name="search"`, class `btn-dark`, icon `glyphicons glyphicons-search`) → submits the GET filter form to the same page (see List).
- Site-wide controls in the page DOM (not specific to this page): language links (Nederlands, English, Deutsch, Français), app tiles (MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®), and the handheld floating button (title/aria-label "Handheld") with items "Scan weld" (`data-action="weld-scan"`), "Scan flange QR label" (`data-action="flange-scan"`), "Add punch" (`data-action="punchlist"`).

## List

- Filter form: `method="get"`.
  - Hidden inputs: `page` = `requests-archive`; `type` (no value); `project` (no value).
  - Select, class `form-control`, `name="type"`, label "From Date" (see the note below). The capture shows no options (`opts(0)`) and no current value (`cur=""`).
  - Text input, class `form-control dpicker`, `name="from"`, placeholder "From date", value `01.01.2020`.
  - Text input, class `form-control dpicker`, `name="to"`, placeholder "To date", value `31.12.2026`.
  - Button "Filter" (see Page).
- Label note: the label above the select reads "From Date" in the capture, and the input labelled "From Date" is the `from` field. The MTOPilot browser-pass notes (`I3-mto.md`, Part D) say the select on the same page is the request type ("Service request" on that page). The WeldPilot capture has no options, so its type values are not shown.
- Table: id `datatable3paginate`, classes `table table-striped table-bordered table-hover`.
- Columns in order (THEAD): "Date", "Report No.", "Company", "Added by", "Options".
- Hidden columns: none in the capture.
- Default sort: the sort dropdown shows "Order by date desc." (the rows are listed date descending). The table has no DataTables configuration line (`DT`) in the capture, so the client-side sort settings are not shown.
- Page length options: not shown in the capture.
- Per-column search inputs: none in the capture.
- Filters: the filter form above (type, project hidden, from, to).
- Row options (Options column), in this order per row:
  1. Print icon (`glyphicon-print`, class `btn-warning btn-xs`, target `_blank`) → `../core/export/down.php?file=servicerequests/<date>_S1_R<report no.>-ServiceRequest.pdf` (the Service Request PDF).
  2. Print icon (second) → `../core/export/down.php?file=servicerequests/<date>_S1_R<report no.>-CoatingRelease.pdf` (the Coating Release PDF).
  3. Pencil icon (`glyphicon-pencil`, title "Sign online", `href="#"`) → `onclick` opens a new window `/core/ajax/render-service-request-completion.php?request_id=<id>&mode=edit` named `srCompletion_<id>`. This is a new window, not a dialog.
  4. Upload icon (`glyphicon-upload`, title "Upload", class `open-editServiceRequest`, `href="#editServiceRequest"`, `data-toggle="modal"`, `data-id="<id>"`) → opens the dialog "Upload signed doc" (`#editServiceRequest`).
- Bulk actions (Options menu): none in the capture.
- Export / print buttons above or below the table: none in the capture.
- Info text ("Showing … entries"): not in the capture.
- Empty text ("No data available in table"): not in the capture.
- Server-side table request (`ajax` url): none. The table is static HTML in the capture; the only request made on load is `/core/ajax/ajax-notifications.php?action=count_unread` (the XHR list shows no table request).

## Dialogs

### Upload signed doc (`#editServiceRequest`) — opened by the row "Upload" button (`.open-editServiceRequest`, `data-id` = the report's id, e.g. 2 for report 00002 and 1 for report 00001)

The WeldPilot capture holds the dialog shell only: header (close button, title "Upload signed doc") and footer (button "Upload"). No form and no fields are in the WeldPilot DOM. The body is loaded on click (see Rules). The fields below come from the MTOPilot capture of the same dialog, opened from the same kind of row (`mto__logistic__request-archive__upload-signed.txt`, request id 2). The WeldPilot body was not captured and may differ.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | File | `file` (id `file1`, class `gui-file`) | file | not shown | none | "Choose file" button (`span.button.btn-dark`); on change, its `onchange` copies the chosen file name into field 2. |
| 2 | (no label; text display of the chosen file) | none (no name attribute) | text (id `uploader2xc2`, class `gui-input`) | not shown | empty; placeholder "Nothing selected" | Shows the chosen file name. It has no `name`, so it is not submitted. |
| 3 | (hidden) | `editID` | hidden | — | `2` (MTOPilot capture, row 2) | Set to the report id of the row whose Upload button was clicked. |

- Form (MTOPilot capture): `method="post"`, `enctype="multipart/form-data"`; body container id `contentEditServiceRequest`; the label "File" is above the file control (`label.control-label`, text "File").
- Dialog buttons (WeldPilot DOM): "Upload" (`btn btn-primary`, `name="editServiceRequest"`, type submit). No Cancel button; the dialog closes with the × button or Escape (per the MTOPilot browser-pass notes). The × button is `btn close`, `data-dismiss="modal"`.
- Rules stated in the dialog text: none.

## Rules found in the page's JavaScript

- Upload row button (`jQuery(document).on("click", ".open-editServiceRequest", …)`): on click it requests `/core/ajax/editServiceRequest.php?id=<myBookId>` and puts the returned HTML into `#contentEditServiceRequest`. The capture shows the `url` and the `.html(data)` call; the variable `myBookId` is not assigned in the captured lines, and the request method is not visible. (The MTOPilot capture shows the same dialog's request as `editServiceRequest.php?id=2&action=showroom`, so `action=showroom` is added somewhere in the elided lines.) The show-and-open part of this handler is not in the captured lines.
- Sign online (`.open-signServiceRequest` handler, separate from the row controls): on click reads `data-id`; if empty it returns; otherwise opens `/core/ajax/render-service-request-completion.php?request_id=<id>&mode=edit` in a window named `srCompletion_<id>`. On this page the Sign online row controls use an inline `onclick` with the same URL and no `open-signServiceRequest` class, so this handler is not triggered by them.
- Shared script on the page (large inline block, also used by other pages): contains requests to `getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php` and `searchFactors.php`. None of them is requested by this page's load (the XHR list shows only `ajax-notifications.php?action=count_unread`); they belong to other screens.
- Filter, sort and date fields: no validation or conditional display found in the captured lines. None found in the capture for the date inputs.
- Page variable: `var __wsappsDebugPage = "requests-archive";`.

## Sample data

- Rows shown: 2 (no pagination, info text or "more rows" marker in the capture). Date range in the filter: 01.01.2020 to 31.12.2026.

| Date | Report No. | Company | Added by | Options |
|---|---|---|---|---|
| 28.06.2024. 09:16 | 00002 | Transport | person A | print (ServiceRequest PDF `20240628_S1_R00002-ServiceRequest.pdf`), print (CoatingRelease PDF `20240628_S1_R00002-CoatingRelease.pdf`), Sign online (`request_id=2`), Upload (`data-id="2"`) |
| 28.06.2024. 09:16 | 00001 | Farbara | person A | print (ServiceRequest PDF `20240628_S1_R00001-ServiceRequest.pdf`), print (CoatingRelease PDF `20240628_S1_R00001-CoatingRelease.pdf`), Sign online (`request_id=1`), Upload (`data-id="1"`) |

"Added by" shows a user login; both rows show the same user, so it is written as person A.

## Not in the capture

- The body of "Upload signed doc" on this page: loaded by `/core/ajax/editServiceRequest.php?id=<id>` after the Upload button is clicked. The fields are described above from the MTOPilot capture only.
- The Sign online page: opens in a new window (`render-service-request-completion.php`); not captured.
- The "Scan QR" dialog or flow behind the top bar button `open-srArchiveScan`: not captured on this page.
- Rows beyond the two shown, and any other date range: not captured. The Date sort and any paging controls are not in the capture.
- The sort menu's effect when "Order by date asc." is chosen: not captured (the link is listed above only).
- The "Filter" result for other dates or the type select options: not captured (the select has no options in the capture).

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#addPqr`, `#editFlange`, `#addFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
