# WeldPilot → Start → Daily reporting

Source: `weld__start__daily-reporting.txt` (page capture), with the two row-option dialogs taken from `weld__start__dashboard.txt` (shared dialogs, identical wherever they appear) and the page script from the same page capture. Captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/daily-reporting/`.
State of the page for the observing account: normal (the page opened; no "You do not have rights to open this page" message).

Deferred feature: the e-mail schedule for the daily reports. The page lists the e-mail recipients and when each one receives which report. The list shows no rows in the capture (see Sample data).

## Page
- Breadcrumb: "Zandbak" (link `index.php`) → "Daily reporting" (link `daily-reporting/`).
- Sidebar entry (Start menu, from the dashboard capture): "Daily reporting", link `/weldpilot/daily-reporting/`, envelope icon.
- Tabs: none in the capture.
- Panel heading above the form: "Add email address that will receive daily reports."
- Buttons above the list: none. The only page button is "Add" inside the add form (see Form below).
- Page title (`<title>`): "- WeldPilot®".

### Add form (on the page, not a dialog)
Form `method="post"` (no action attribute in the capture, so it posts back to the same URL). Fields in document order:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Report | report | select (class select2-single, select2 widget) | no | All reports (value 0) | 0 "All reports"; 1 "Daily weld report"; 2 "Welders expire warning report". No condition shown. |
| 2 | Email address | email | text | yes (HTML `required`) | empty | none |
| 3 | Time Hour | time_hr | select (id `pickupTime`) | no | 12 | 24 options, 00 to 23, shown as two digits (00, 01 … 23). Default selected: 12. |
| 4 | Time Min | time_min | select | no | 00 | 2 options: 00, 30 |
| 5 | Monday | mon | checkbox (value "ok") | no | checked | none |
| 6 | Tuesday | tue | checkbox (value "ok") | no | checked | none |
| 7 | Wednesday | wed | checkbox (value "ok") | no | checked | none |
| 8 | Thursday | thu | checkbox (value "ok") | no | checked | none |
| 9 | Friday | fri | checkbox (value "ok") | no | checked | none |
| 10 | Saturday | sat | checkbox (value "ok") | no | checked | none |
| 11 | Sunday | sun | checkbox (value "ok") | no | checked | none |

- Help text under the Report field (paraphrased): one row per e-mail address. "All reports" already covers both the daily weld report and the expire warning, so the same address must not get a separate expire row.
- Button: "Add" (class btn btn-default, `type="submit"`, name `addCronReport`).

### List
- Table class: `table table-striped table-bordered table-hover`.
- Header row, in order (11 columns): "Email address", "Report", "Time", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Options".
- Hidden columns, default sort, page length options, per-column search inputs, filters, row options, bulk actions, export / print buttons, info text ("Showing … entries") and empty text ("No data available in table"): not in the capture. The capture has no DataTables configuration line (`DT`) for this table and no body rows.
- Server-side request for the table (`ajax` url): not in the capture. The only request the page made while loading is `/core/ajax/ajax-notifications.php?action=count_unread` (the shared notification counter).

## Dialogs

Both dialogs below are opened from the row options in the Options column. The capture has no rows, so the controls that open them are not in the capture; the link comes from the page script (see Rules). Their markup is identical on every page where it appears.

### Edit time (`#editCronReport`) — opened by the row option "Edit time" (`.open-editCronReport`, row not in capture)
The dialog has a `form` with `method="post"` and `enctype="multipart/form-data"`. Its body is empty in the capture; the body is loaded by a request after the click (see Rules).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| — | none in the capture | — | — | — | — | The form body is filled after the click. |

- Header: close button (×, class close, `data-dismiss="modal"`), title "Edit time".
- Buttons: "Save" (class btn btn-primary, `type="submit"`, name `editCronReport`); "Close" (class btn default, `data-dismiss="modal"`).
- Rules in the dialog text: none in the capture.

### Remove from daily reporting (`#deleteCronReport`) — opened by the row option "Remove from daily reporting" (`.open-deleteCronReport`, row not in capture)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID (id `bookIdDeleteCronReport`) | hidden | no | set from the clicked row before the dialog opens | Filled by the page script with the row id. |

- Header: close button (×, class close, `data-dismiss="modal"`), title "Remove from daily reporting".
- Body text: "Are you sure?"
- Buttons: "Delete" (class btn btn-danger, `type="submit"`, name `deleteCronReport`); "Cancel" (class btn default, `data-dismiss="modal"`).
- Rules in the dialog text: a confirmation question only.

## Rules found in the page's JavaScript
- Remove row option: on click of an element with class `open-deleteCronReport`, the script puts the clicked row's id into the hidden field `#bookIdDeleteCronReport` inside the dialog's body (`.modal-body`). Source: the `jQuery(document).on("click", ".open-deleteCronReport", …)` handler.
- Edit row option: on click of an element with class `open-editCronReport`, the script builds a value from a fixed text, the clicked row's id and a second fixed text (a variable named `secure`). It then sends an AJAX request to `/core/ajax/editCronReport.php?id=<row id>` and writes the returned HTML into the element `#contentEditCronReport` (the Edit time dialog body). Whether that value is sent with the request is not visible in the capture (the request's data block is not shown). Source: the `jQuery(document).on("click", ".open-editCronReport", …)` handler.
- Add form: no validation handler and no script that targets `addCronReport`, the `report`, `email`, `time_hr`, `time_min` or day fields was found in the capture. The only validation visible is the HTML `required` attribute on the email field.
- Requests the page makes: on load, `GET /core/ajax/ajax-notifications.php?action=count_unread`. Requests after clicks: `GET /core/ajax/editCronReport.php?id=<row id>` (Edit time). The Add and Remove submits are ordinary form posts; no request URL is given for them in the capture.
- The other scripts on the page (date pickers, select2, DataTables loader, PDF/Excel helpers, `searchProject.php`, `searchUnitRates.php`, `getListOfMaterials.php`, and others) are shared with the whole site; they are not specific to this page. The capture does not show which of them run on this page.

## Sample data
- Row count: not shown. The table has a header and no body rows in the capture.
- Key figures and percentages: none on the page.
- Example rows: none in the capture.

## Not in the capture
- The rows of the recipients table (e-mail address, report, time, day flags) and the Options column content of each row, with the icons or labels of the row options. The two row options that open the dialogs above are known from the page script only.
- The body of the Edit time dialog, loaded after the row option "Edit time" is clicked from `/core/ajax/editCronReport.php?id=<row id>` (not captured: no rows to click).
- The DataTables configuration of the list (column definitions, paging, info and empty texts) and any table request, if the table is initialised by a script that the capture does not show.
- The result of the Add submit (success or error messages, the rows after saving). The capture does not show a submit.
- The browser-pass notes (`raw/_interactive/`) have no entry for this page.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, editServiceRequest, signServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal, editIsometricPhaseMass, fillIRN; plus the handheld menu items (Scan weld, Scan flange QR label, Add punch).
