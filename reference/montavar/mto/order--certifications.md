# MTOPilot → Order / Take in → Certifications

Source: `mto__order__certifications.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=certifications`. Also cited for the dialog bodies and scripts that this capture marks `SAME-AS` or "already captured": `weld__material__certifications.txt` (footer and body of `#editCertification`, `#deleteCertification`, and two inline scripts), `weld__start__dashboard.txt` (table and bulk-selection code, lines 8671–9000). No browser-pass notes (`_interactive/*.md`) exist for this page; the browser-pass notes for the same dialogs on the WeldPilot page are cited where they say something useful.
State of the page for the observing account: normal.

## Page
- Page title: `Certifications - MTOPilot®`.
- Breadcrumb: none in the capture. Tabs: none.
- Side menu: not written in this capture (the "Order / Take in" group is in the full menu of `mto__start__dashboard`).
- Top bar, link "Certifications" → `index.php?page=certifications` (rendered as the top bar item for this page).
- Panel heading (inside `#content`, class `cert-page-content`): icon (list) and the text "Certifications".
- Controls on the panel heading and above the list:
  - `+` (no text, icon `glyphicon glyphicon-plus`, class `buttonInsert btn btn-sm btn-primary`, `title` not shown) → `href="#addCertification"` with `data-toggle="modal"`: opens dialog `#addCertification` ("Add certification").
  - Search field `#certSearch` (see List).
  - Page length select `#certPageLength` (see List).
  - Project filter `#certFilterProject` (see List).
  - DataTables buttons `CSV` (`buttons-csv`, `href="#"`), `Excel` (`buttons-excel`, `href="#"`), print icon (`buttons-print`, `href="#"`). Their handlers are in Rules.
  - Bulk bar `#certBulkBar` (hidden at load; see List).
- Top bar buttons:
  - `Import certifications` (class `buttonInsert btn btn-sm btn-primary btn-block`, icon `glyphicon glyphicon-import`) → `href="/mtopilot/index.php?page=certifications-import"`. It is a plain link, not a dialog opener.
  - `Refresh` (class `btn btn-dark btn-sm`, icon `fa fa-refresh`) → `href="/mtopilot/index.php?page=certifications&refresh=ok&project="`.
- Header language links: Nederlands (`lang=nl`), English (`lang=en`), Deutsch (`lang=de`), Français (`lang=fr`), each keeping `page=certifications`.
- Floating action button on every page (in the DOM of this page): `Scan QR` (`wsapps-handheld-fab-btn`, icon `fa fa-qrcode`), menu items `Scan material` (`data-action="material-qr-scan"`) and `Scan service request` (`data-action="service-request-scan"`).

## List
- Table id `#datatableCerts` inside wrapper `#datatableCerts_wrapper`. Server-side (`serverSide: true`). Request URL (DataTables `ajax`): `/core/ajax/certifications.php?id=1&project=`.
- Columns in order (title, data index, sortable, class):
  1. Index number (0), sortable, class `cert-col-index`
  2. Charge number (1), sortable, `hide-on-small`
  3. Certificate-type (2), sortable, `hide-on-small`
  4. Attest number (3), sortable, `hide-on-small cert-col-priority-min`
  5. Material No (4), sortable, `hide-on-small cert-col-priority-min`
  6. Type of material (5), sortable, `hide-on-small cert-col-priority-med`
  7. Material part (6), sortable, `hide-on-small cert-col-priority-med`
  8. Basic material (7), sortable, `hide-on-small cert-col-priority-low`
  9. Dia. (8), sortable, `hide-on-small`
  10. Schedule (9), sortable, `hide-on-small cert-col-priority-low`
  11. Wall thickness (10), sortable, `hide-on-small cert-col-priority-low`
  12. Supplier (11), sortable, `hide-on-small cert-col-priority-med`
  13. Ctrl. (12), sortable, `dt-center hide-on-small`
  14. Accp. (13), sortable, `dt-center hide-on-small`
  15. Options (no data key), not sortable, class `cert-col-options`. Header text "Options".
  16. Row selection column (no data key), not sortable, class `cert-col-select dt-center`. Header is a checkbox `#certSelectAll` (title "Select all", aria-label "Select all", value "on", not checked).
- Hidden columns: none (every column has `vis: true`). The `hide-on-small` and `cert-col-priority-*` classes are responsive classes only; the capture does not show their breakpoints.
- Default sort: `order: [[13,"asc"]]` (Accp., ascending).
- Page length: default 25 (`pageLength: 25`). Length options `25, 50, 100, 500` (`lengthMenu`). The separate select `#certPageLength` (`.ft-select`, `aria-label="Show entries"`) shows current value 25 and options 25, 50, 100, 500.
- Per-column search inputs: none.
- Global search: `IN #certSearch type="text" placeholder="Search"` inside `LABEL for="certSearch"` `.wsapps-dt-search` (magnifier icon `fa fa-search`). Clear button `BTN #certSearchClear` (`aria-label="Clear"`, icon `fa fa-times`, class `.wsapps-dt-search-clear`).
- Filters above the table:
  - `SEL #certFilterProject` (class `cert-filter-select2 ft-select2`), no `name` in the capture. Current value "All projects". Options (2): `0` → All projects; `1` → 20240101.
  - No status, supplier or date filter in the capture.
- Bulk bar `DIV #certBulkBar` (class `cert-bulk-bar`) is hidden (HID) at load. Its content:
  - Text "0 selected" (count element is updated by script).
  - `SEL #certBulkControlled`, label "Controlled". Options (3): blank → "Don't change" (selected); `1` → Yes; `0` → No.
  - `SEL #certBulkAccepted`, label "Accepted". Options (3): blank → "Don't change" (selected); `1` → Yes; `0` → No.
  - `BTN "Apply" #certBulkApply` (class `btn btn-xs btn-primary`).
- Row options, in order:
  - In the Index number cell, only on rows that have a certificate PDF: a file icon link (`fa fa-file`, `target="_blank"`) → `../core/export/down.php?file=certifications/1.<index>.pdf`. Captured for index 0001, 0002 and 0003 only.
  - Edit: pencil icon, title "Edit", class `buttonEdit open-editCertification btn btn-xs btn-warning btn-block`, `href="#editCertification"`, `data-toggle="modal"` → opens `#editCertification`.
  - Show: list icon, title "Show", class `open-findCertification btn btn-xs btn-dark btn-block`, `href="#findCertification"`, `data-toggle="modal"` → opens `#findCertification`.
  - Delete: trash icon, title "Delete", class `buttonDelete open-deleteCertification btn btn-xs btn-danger btn-block`, `href="#deleteCertification"`, `data-toggle="modal"` → opens `#deleteCertification`.
  - Row checkbox (class `cert-row-check`, `aria-label="Select all"`, `data-id` = the row id).
- Bulk actions: the "Apply" button of the bulk bar (see above) and the header checkbox "Select all". No "Options" bulk menu is in the capture.
- Export / print buttons (above the table, DataTables buttons): `CSV`, `Excel`, print icon. The DOM in this capture has no PDF button. The DataTables definition in the shared script (see Rules) also lists a `PDF` button; it is not in this page's DOM.
- Export to ZIP: not in this page's DOM (the WeldPilot certifications page has it; see Rules).
- Info and empty texts:
  - info: "Showing _START_ to _END_ of _TOTAL_ entries". Rendered in this capture as: "Showing 1 to 5 of 5 entries (filtered from 3,665 total entries)".
  - empty: "No data available in table".
  - zero (no search match): "No matching records found".
  - search label: empty.
  - processing indicator `#datatableCerts_processing` (hidden at load).
- Server-side table request: `/core/ajax/certifications.php?id=1&project=` with the usual DataTables parameters (`draw`, `columns[i][data|name|searchable|orderable|search][value|regex]`, and `order`, `start`, `length`, `search` in the same request — the capture truncates the URLs after `columns[1]`, so only `draw`, `id` and `project` are visible). The capture shows 29 requests with `draw` 1 to 29 (see Rules and Not in the capture).

## Dialogs

Four dialogs are opened by controls on this page: `#addCertification`, `#editCertification`, `#findCertification`, `#deleteCertification`.

### Add certification (`#addCertification`) — opened by the `+` button in the panel heading
Modal with `modal-lg`. Header "Add certification". Body: one form (`method="post" enctype="multipart/form-data"`, no `action` shown). No tabs. Footer buttons are listed after the table.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Charge number | chargeNo (`#fChargeNo`) | text | not marked in the capture | empty | none shown |
| 2 | Attest number | attestNo | text | not marked | empty | none shown |
| 3 | Material | materialDB (class `testxx select2-hidden-accessible`) | text input used as a search field (type not written in the capture) | not marked | empty; placeholder "Choose Material from DB" | Options come from a search; the capture does not show the search request for this field. `/core/ajax/getAllMaterials.php` is loaded as a script on the page, its content is not in the capture. |
| 4 | Diameter | diameter (`#fDiameter`) | select (select2, `data-control="select2"`) | not marked | `1/2"` (current value; no option has the default marker) | 500 options. First 10 (value → text): 1 → 1/2"; 2 → 3/4"; 3 → 1"; 4 → 1.1/4"; 5 → 1.1/2"; 6 → 2"; 7 → 2.1/2"; 8 → 3"; 9 → 3.1/2"; 10 → 4". The rest are sizes up to 48" and reducer sizes such as `3/4"x1/2"`; the capture lists 80 of them and writes "…+420". |
| 5 | Material part | materialPart (`#fMaterialPart`) | select (select2, class `materialPart`) | not marked | `Pipe` (current value; no option has the default marker) | 68 options. First 10 (value → text): 2 → Pipe; 3 → Elbow 45; 4 → Elbow 90; 5 → Flange; 6 → Valve; 7 → Cap; 8 → Reducer; 9 → Nipolet; 13 → Outlet; 14 → Plug. Others include Pipe Support, Weldolet, Blind flange, WN OR Fl, Sweepolet, ECC Y-PIECE, Reducing Slip-on Flange (the capture lists 68). |
| 6 | Type of material | typeMaterial | select (select2) | not marked | `A234 Gr WPB/CS/Fitting/` (current value) | 131 options. First 10 (value → text): 3 → A234 Gr WPB/CS/Fitting/; 9 → A106 Gr B/CS/Pipe/; 10 → A105/CS/Flange/; 11 → A216 Gr WCB/CS/Valve/; 12 → A335 Gr P1/HTCS/Pipe/; 13 → A234 Gr WP1/HTCS/Fitting/; 14 → A182 Gr F1/HTCS/Flange/; 15 → A217 Gr WC1/HTCS/Valve/; 18 → A312 RVS316L/SS/Pipe/; 19 → A403 WP316L/SS/Fitting/. The capture lists 80 and writes "…+51". |
| 7 | Schedule | schedule (`#fSchedule`) | text | not marked | empty | none |
| 8 | Wall thickness | wallThickness (`#fWwallThickness`) | text | not marked | empty | none |
| 9 | Hot yield | hotyield | text | not marked | empty | none |
| 10 | Impact strength | impact | text | not marked | empty | none |
| 11 | Certificate-type | certificateType (`#fCertType`) | text | not marked | empty | none |
| 12 | Supplier | supplier | select (select2) | not marked | `PFF BV Klundert` (current value) | 8 options (all): 1 → PFF BV Klundert; 2 → VAN LEEUVEN JR BUIZENHANDEL BV NL; 3 → ELIMP D.O.O. RS; 4 → HONEX D.O.O. RS; 5 → Bus Industrial Tools Roosendaal; 6 → Montavar Metalna Lola D.O.O.; 7 → Technip Energies; 8 → Tecnicas Reunidas S.A. |
| 13 | Project | project[] | select, multiple (select2) | not marked | none selected | 3 options: 0 → "--------"; ALL → ALL; 1 → 20240101 |
| 14 | Controlled | controlled (`#checkboxControl`) | checkbox, value `1` | not marked | unchecked (no CHECKED flag) | none |
| 15 | Accepted | accepted (`#checkboxAcc`) | checkbox, value `1` | not marked | unchecked (no CHECKED flag) | none |
| 16 | Note | note (`#wsapps-quill-x1iu3u9o`, class `wsapps-quill-source`) | textarea, hidden (HID); rich-text editor (Quill) is shown in its place | not marked | empty (not shown) | Quill toolbar (no labels in the capture): bold, italic, two list buttons, four align buttons, clean. Preview link (`.ql-preview`, `href="about:blank"`, `target="_blank"`), and the Quill link/formula/video tooltip controls (`.ql-action`, `.ql-remove`). |
| 17 | File | file (class `gui-file`) | file input, label "Choose file" (span button) | not marked | none | On change, the file name is copied into the text field in row 18. |
| 18 | (no label; text box) | no name (`#uploader4AA`, class `gui-input`) | text, placeholder "Nothing selected" | — | empty | Shows the chosen file name. |
| 19 | (Quill formula tooltip input) | no name | text, `data-formula="e=mc^2"` | — | empty | Part of the Note editor. |
| 20 | (Quill link tooltip input) | no name | text, `data-link="https://quilljs.com"` | — | empty | Part of the Note editor. |
| 21 | (Quill video tooltip input) | no name | text, `data-video="Embed URL"` | — | empty | Part of the Note editor. |

Buttons (footer): `Add` (`#addCerts`, class `btn btn-primary btn-hideInsert`, type submit, name `addCertification`); `Cancel` (`data-dismiss="modal"`). The modal header has a close (×) button.

Rule text in the dialog: none apart from the placeholders "Choose Material from DB" and "Nothing selected", and the Quill example values.

### Edit certification (`#editCertification`) — opened by the pencil icon on each row
The capture has only the footer of this dialog; its body is loaded after a click and is not in the capture (see Not in the capture). The footer is identical in the WeldPilot page's capture (`SAME-AS weld__material__certifications`):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Copy file | myfile | checkbox, value `ok` (label "Copy file") | not marked | unchecked | none |

Buttons (footer): `Duplicate certificate` (class `btn btn-success btn-hideInsert`, type submit, name `addCertification`); `Update` (class `btn btn-primary btn-hideEdit`, type submit, name `editCertification`); `Cancel` (`data-dismiss="modal"`). The browser-pass notes of the WeldPilot page say that the "Duplicate certificate" submit creates a copy on submit and that no separate duplicate dialog exists (from the browser-pass notes, `_interactive/I2a-welders-catalogs.md`; not clicked there).

### Show certification (`#findCertification`) — opened by the list icon on each row
Header "Show certification". Footer: `Cancel` (`data-dismiss="modal"`). No body in the capture (see Not in the capture). No fields.

### Delete certification (`#deleteCertification`) — opened by the trash icon on each row
Modal, identical in the WeldPilot page's capture (`SAME-AS weld__material__certifications`, lines 142–154 of that file). Header "Delete certification". Body: form `method="post"` (no `action` shown), text "Are you sure?", then:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label; hidden) | deleteID (`#bookIdDeleteCertification`) | hidden, no value shown | — | empty in the capture | The row's id is written into this field by the row's delete button (see Rules). |

Buttons (footer): `Delete` (class `btn btn-danger btn-hideDelete`, type submit, name `deleteCertification`, trash icon); `Cancel` (`data-dismiss="modal"`).

### Also present in the page, not opened by a control on this page
`#filterCertificates` (title "Filter": form `method="get"` with hidden `page=certifications`, select `project` with options All and 20240101, buttons Filter and Cancel). `#importCertification` (title "Import certifications": one info text in Dutch telling the user to use the Excel import wizard, and a link "Open Excel import" → `index.php?page=certifications-import`, plus Cancel). No control in this capture opens either one; the top bar "Import certifications" is a plain link.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.

## Rules found in the page's JavaScript
Sources: the inline scripts `h=ggllqgx1jx` and `h=17a0cxcx1w5` (both marked `SAME-AS weld__material__certifications` in this capture, so their text is in that capture), and the shared DataTables code, which this capture shows only as "already captured" lines. The table and bulk-selection code is written out in `weld__start__dashboard.txt`, lines 8671–9000, and the MTO page's DataTables definition line matches it (same columns, `ajax`, `pageLength` 25, `order` 13 asc, length menu). The shared script copy in this capture has a different length from the copy in `weld__start__dashboard.txt` (363800 vs 374734 characters), so the MTO copy is not confirmed to be identical.

1. Search binding (`ggllqgx1jx`): on `keyup` and `input` of `#certSearch`, the table runs `search(value)` and redraws; the `has-value` class is set on `.wsapps-dt-search` when the trimmed value is not empty. The binding is retried every 100 ms up to 50 times while the table variable `tableCerts` is not yet defined.
2. Search clear (`ggllqgx1jx`): a click on `#certSearchClear` empties `#certSearch`, triggers `keyup`, and focuses the field.
3. Toolbar placement (`ggllqgx1jx`): the DataTables button container (`#datatableCerts_wrapper > .dt-buttons`) is moved into `.cert-filter-toolbar .ft-filters .ft-export-slot` (or `.ft-filters`). Retried every 100 ms, up to 50 times.
4. Control height (`ggllqgx1jx`): the height of select2 containers, the filter toolbar and the DataTables buttons is set to 34 px when `<html>` has class `wsapps-prosuite-horizontal-enabled`, otherwise 26 px. Re-applied on window load.
5. DataTable construction (`weld__start__dashboard.txt` 8672–8815): server-side processing, simple paging, search delay 250 ms, `ajax` `/core/ajax/certifications.php?id=1&project=`, page length 25 with menu 25/50/100/500, DOM `Brt` plus footer `ip`. Column classes and widths as in the List section. Buttons defined: PDF (pdfHtml5), CSV, Excel and print, all `btn btn-xs btn-default buttonPrint`, exporting only visible columns that are not the Options or selection column. The MTO page's DOM has CSV, Excel and print only.
6. Ctrl. and Accp. cells (`weld__start__dashboard.txt`): the value renders as a green check badge (`iso-badge iso-badge-success`) when the value is `yes`, `1` or `true`; otherwise as a red times badge (`iso-badge iso-badge-danger`). Sorting and filtering use the raw value.
7. Options cell (`weld__start__dashboard.txt`): renders three links in this order — edit (`#editCertification`), show (`#findCertification`), delete (`#deleteCertification`), each with the classes shown in the List section.
8. Row selection cell (`weld__start__dashboard.txt`): renders a checkbox with class `cert-row-check` and `data-id` set to the last value of the row (the row id). Not sortable and not searchable.
9. Row action clicks (`weld__start__dashboard.txt`): a click on the edit, show or delete link sets that link's `data-id` attribute to the row id, before the modal opens.
10. Cell tooltips (`weld__start__dashboard.txt`): after each draw, a cell whose text is wider than the cell gets the full text as `title`; the attribute is removed when it fits.
11. Page length select (`weld__start__dashboard.txt`): on init it is set to the table's current length; on change the table sets the length to the chosen value and redraws.
12. Project filter (`weld__start__dashboard.txt`): `#certFilterProject` is a select2 with a minimum of 10 results for search and width 180 px. On change, the browser navigates to `index.php?page=certifications`, adding `&project=<id>` when the id is above 0. This is a full page load, not a table reload.
13. Row selection state (`weld__start__dashboard.txt`): a selected row id is kept in a list in the browser. Changing a row checkbox adds or removes its id. The bulk bar (`#certBulkBar`) is shown while at least one id is selected, and `#certBulkCount` shows the number. The header checkbox (`#certSelectAll`) is set checked, unchecked or indeterminate to match the selection.
14. Header checkbox (`weld__start__dashboard.txt`): when unchecked, the selection is cleared. When checked, the header is disabled and a request is sent to `certifications-bulk-flags.php` with `action=ids`, `project` (the project filter value, or 0) and `q` (the search text). The returned ids become the selection. If the response is not ok with error `too_many`, an alert says "Too many certificates. Narrow the search or project filter first."; any other failure shows "The certificates could not be updated.". The header is enabled again when the request ends. A later request cancels an earlier one.
15. Apply (`weld__start__dashboard.txt`, `#certBulkApply`): with no selection, nothing is sent. If neither Controlled nor Accepted is Yes or No, an alert says "Choose Yes or No for Controlled, Accepted, or both.". Otherwise the button is disabled and a request is sent to `certifications-bulk-flags.php` with `action=apply`, `ids` (the selected ids), `controlled` and `accepted` (each `1`, `0` or empty for "Don't change"). On success the selection is cleared, both selects are reset to "Don't change", and the table reloads and keeps its current page. On failure an alert says "The certificates could not be updated.". The request method is not in the captured lines.
16. Export ZIP (`17a0cxcx1w5`, `SAME-AS weld__material__certifications`): binds to an element `#certExportZip` that shows a spinner and toast messages while a ZIP is generated, using a hidden frame and a cookie named `certzip_done_<token>`. This page's DOM has no `#certExportZip`, so the script does nothing here.
17. Note editor: the hidden `note` textarea is marked `data-wsapps-quill-bound="1"`, which shows the Quill editor is attached by the script `/core/assets/js/wsapps-quill-editor.js` (the content of that script is not in the capture).
18. Validation on the Add form: none found in the capture.
19. Requests the page makes (in the capture): `GET /core/ajax/certifications.php?id=1&project=…` (DataTables; see List; 29 requests with `draw` 1 to 29 are recorded while the page was open, and the capture does not say what triggers them); `GET /core/ajax/ajax-notifications.php?action=count_unread` (page-wide, not specific to this page); `certifications-bulk-flags.php` with `action=ids` and `action=apply` (see rules 14–15); the row file link `../core/export/down.php?file=certifications/1.<index>.pdf` (new window); the `Refresh` link (page reload with `refresh=ok`). The forms in the dialogs have no `action` in the capture, so their target is not known.
20. Requests in the shared script's unseen-in-this-capture lines (not specific to this page): `getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`.

## Sample data
- Row counts: 5 rows shown on the one page (`Showing 1 to 5 of 5 entries`), filtered from 3,665 total entries (DataTables `total` 3665, `shown` 5). The capture does not show which condition reduced 3,665 to 5; the project filter reads "All projects".
- Page length 25, so all 5 rows fit on one page.
- Rows as drawn, in the order captured (default sort Accp. ascending; the rendered order is 0005, 0003, 0004, 0002, 0001). The file icon column is shown as "PDF" where present. Ctrl. and Accp. are shown as "yes" (check icon) or "no" (times icon).

| Index number | Charge number | Certificate-type | Attest number | Material No | Type of material | Material part | Basic material | Dia. | Schedule | Wall thickness | Supplier | Ctrl. | Accp. | PDF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0005 | 1212 | 152516 | - | - | A106 Gr B | Pipe | 4 | 48" | 40 | 19 | PFF BV | no | no | no |
| 0003 | 564321 | 3.1 | 6544 | 7633186631 | - | Cap | - | 1" | 40 | 7.2 | PFF BV | yes | no | yes |
| 0004 | 98784987 | 3.1 | - | - | A234 Gr WPB | WN OR Fl | C-Si | 1/2" | NA | 2 | PFF BV | no | no | no |
| 0002 | ada | 5 | sdada | 8138259941 | A105 | WN OR Fl | C-Si | - | 1 | 2 | PFF BV | yes | no | yes |
| 0001 | 11111 | 3.1 | 22222 | 7633186631 | A106 Gr B | Pipe | C-Si | 1/2" | 40 | 7,2 | PFF BV | yes | yes | yes |

Row checkbox `data-id` values: 0005 → 5, 0003 → 3, 0004 → 4, 0002 → 2, 0001 → 1.

## Not in the capture
- The body of `#editCertification` (loaded after a click on the pencil icon of a row). Its footer is described above.
- The body of `#findCertification` ("Show certification"); only its header and Cancel button are in the DOM. Opened by the list icon of a row.
- The server response of the Add form, the Edit form, the Delete form and the bulk requests (`certifications-bulk-flags.php`), and their methods.
- Rows beyond the 5 shown, and the reason for the filter that reduced 3,665 to 5.
- The page `certifications-import` (opened by the "Import certifications" top-bar link) and the import dialog's Excel wizard.
- A PDF export button (the shared script defines one; the MTO DOM has none).
- Anything after the first load: the 29 table requests are recorded, but the capture does not show any click or change that triggered them.
- The filter dialog `#filterCertificates` and the import dialog `#importCertification` have no opener in this capture (see Dialogs).
