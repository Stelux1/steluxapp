# WeldPilot → NDT data → NDT process

Source: `weld__ndt__process.txt`, `weld__ndt__process__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/ndt-process/`.
State of the page for the observing account: normal.

## Page
- Title (browser tab): "NDT process - WeldPilot®".
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Panel heading: list icon (glyphicon-list) + "NDT process", followed by a small "Add NDT process" button.
- Top bar: "Add NDT process" button (btn-primary, block, plus icon) → opens `#addNdtProcess` (dialog "Add NDT process"). The same button also appears in the panel heading and opens the same dialog.
- Menu item in the WeldPilot top-bar/side menu: "NDT process" → `/weldpilot/ndt-process/`.
- "Options ▾" button: named in the browser-pass notes (`_interactive/I2a-welders-catalogs.md`, "NDT data → NDT process": "Options ▾, + Add NDT process"). It is not in the capture DOM. Its menu items are not recorded in the notes. The page script makes it active only when at least one row is ticked (see Rules).
- Export/print buttons are in the list section (see List).

## List
- Table: `#datatableWarehouse` (client-side, not server-side). Columns in order:
  1. NDT process (data 0)
  2. Description (data 1)
  3. Group (data 2)
  4. WPR (data 3)
  5. Enabled on this site (data 4)
  6. Options (data 5) — pencil (Edit) and trash (Delete) icons
  7. (no title) — row checkbox, name `ccid_<id>`, value `s<id>`
- Header row text: "NDT process | Description | Group | WPR | Enabled on this site | Options" (the header of the seventh column is empty).
- Hidden columns: none.
- Default sort: DataTables `order` `[[5,"asc"]]` (column index 5, "Options"), as the configuration shows.
- Page length: default 20. Length menu options: 5, 20, 50, 100, 500.
- Per-column search inputs: none in the capture. One global search input (`#datatableWarehouse_filter`, type search, placeholder "Search", with a clear button labelled "Clear").
- Filters: none in the capture.
- Row options, in order:
  - pencil icon (glyphicon-pencil, btn-warning, `href="#editNdtProcess"`, `data-id` = row id) → opens the "Edit NDT process" dialog for that row.
  - trash icon (glyphicon-trash, btn-danger, `href="#deleteNdtProcess"`, `data-id` = row id) → opens the "Delete NDT process" dialog for that row.
  - checkbox → selects the row for bulk actions (see Rules).
- Bulk actions: "Options ▾" (from the browser-pass notes only; see Page). The capture does not show its items.
- Export / print buttons (above the table, `dt-buttons`): "CSV" (`.buttons-csv`, href="#"), "Excel" (`.buttons-excel`, href="#"), print icon (`.buttons-print`, fa-print, href="#").
- Info text: "Showing 1 to 24 of 24 entries" (the pattern in the DataTables language config is "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Pagination control: none is shown in the capture, although the footer shows all 24 rows drawn and the page length is 20.
- Server-side table request: none. The table is `serverSide: false`, `ajax: null`; rows are in the HTML.
- Another table on the page: a header-only table (same header text) placed before the main table. Its DataTables setup failed in the capture with "TypeError: Cannot read properties of undefined (reading 'ajax')". The capture does not show what it is for.
- Rows in the capture: 24 (total 24, shown 24).

## Dialogs

### Add NDT process (`#addNdtProcess`) — opened by "Add NDT process" (top bar and panel heading)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT process | process | text | yes | empty | — |
| 2 | Description | description | text | yes | empty | — |
| 3 | Method | method | select (select2) | not marked | "-----------" (value 0) | 12 options: 0 "-----------"; 1 RT; 2 PT; 3 MT; 4 UT-ToFD; 5 VT; 6 PA; 7 MT-b; 8 PT-b; 10 UT; 12 PMI; 13 FERRITE. The capture shows no option as selected by default (cur="-----------"). |
| 4 | Welder Performance Raport (WPR) | wpr (checkbox, value "ok", id checkboxWPR) | checkbox | no | unchecked | — |
| 5 | Enable on this site (Zandbak) | site (checkbox, value "ok", id checkboxccPSXcv1) | checkbox | no | unchecked | Name is `site`, not an array. |

- Form: method="post" (no action attribute in the capture).
- Buttons: "Add" (btn-primary, name `addNdtProcess`, type submit); "Cancel" (dismisses the dialog).
- Dialog text: only field labels. No rule text in the dialog.
- Hidden inputs: none.

### Edit NDT process (`#editNdtProcess`) — opened by the pencil icon on each row
The body is loaded into `#contentEditNdtProcess` by a request for the row (`editNdtProcess.php?id=<id>&action=showroom`). The capture is for row id 24 (NDT process "DF").

| # | Label | name | Type | Required | Default (row 24) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | NDT process | process | text | yes | "DF" | — |
| 2 | Description | description | text | yes | "Delta Ferrite Test" | — |
| 3 | Method | method | select (select2) | not marked | "FERRITE" (value 13, selected) | Same 12 options as Add; 13 FERRITE is selected by default for row 24. |
| 4 | File | file (type file, id file1, class gui-file) | file | no | nothing selected | Button "Choose file". On change, the file name is copied into field 5. |
| 5 | (no name) | — (text, id uploader7x24, placeholder "Nothing selected") | text (display only) | no | "Nothing selected" | Shows the file name chosen in field 4. It has no `name` attribute. |
| 6 | Welder Performance Raport (WPR) | wpr (checkbox, value "ok", id checkboxWPR24) | checkbox | no | unchecked | — |
| 7 | Enable on this site (Zandbak) | sites[] (checkbox, value "1", id checkbo1xPSX1) | checkbox | no | unchecked | Visible. |
| 8 | Enable on this site (hidden block) | sites[] (checkbox, value "2", id checkboxPSX2), label "10420-2530 Ineos Project ONE" | checkbox | no | checked | In a block with `display:none` (marked HID in the capture). The capture does not show what makes this block visible. |
| 9 | Enable on this site (hidden block) | sites[] (checkbox, value "10", id checkboxPSX10), label "IPO - Carry Over" | checkbox | no | unchecked | Same hidden block as field 8. |
| 10 | (hidden) | editID (type hidden) | hidden | — | "24" | Row id. |
| 11 | (footer, hidden) | secureCode (type hidden, id bookIdEditNdtProcessSecure) | hidden | — | a session token set by the page's script (value not copied here) | Set by the open-edit click handler (see Rules). |

- Form: method="post", enctype="multipart/form-data".
- Buttons: "Update" (btn-warning, name `editNdtProcess`, type submit); "Cancel" (dismisses the dialog).
- Dialog text: only field labels and "Choose file" / "Nothing selected". No rule text in the dialog.
- Differences from Add: the edit dialog has a file field, the site checkboxes are an array `sites[]`, and it has a hidden `editID`.

### Delete NDT process (`#deleteNdtProcess`) — opened by the trash icon on each row
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | deleteID (id bookIdDeleteNdtProcess) | hidden | — | empty; filled with the row id on click | See Rules. |
| 2 | (hidden) | secureCode (id bookIdDeleteNdtProcessSecure) | hidden | — | empty; filled on click | See Rules. The value is computed in the browser; not copied here. |

- Text in the dialog: "Are you sure?".
- Form: method="post" (no action attribute in the capture).
- Buttons: "Delete" (btn-danger, name `deleteNdtProcess`, type submit); "Cancel" (dismisses the dialog).

## Rules found in the page's JavaScript
- Bulk selection: a click or change on any row checkbox (`#datatableWarehouse input[type=checkbox]`) collects the values of all checked row checkboxes, joins them with commas, and writes the string into `#activationIds` and `#deactivationIds`. If at least one is checked, `#showWPSgroupOptions` loses class `is-inactive`; if none is checked, it gets class `is-inactive`. (Function `__wsappsSyncNdtProcessBulkOptions`.) The capture does not show `#showWPSgroupOptions`, `#activationIds` or `#deactivationIds` in the page markup; they are probably in the shared dialogs listed at the end, but the capture does not confirm it.
- While `#showWPSgroupOptions` has class `is-inactive`, a click on its `.dropdown-toggle` is stopped (preventDefault and stopPropagation). So the Options menu cannot open with no row ticked.
- Edit click (`.open-editNdtProcess`): reads `data-id` as the row id, sets the hidden `#bookIdEditNdtProcessSecure` value from a variable `secure`, and requests the dialog body from `/core/ajax/editNdtProcess.php?id=<row id>` into `#contentEditNdtProcess`. The line that defines `secure` is not in this capture (captured on an earlier page). The XHR in the edit capture is `editNdtProcess.php?id=<id>&action=showroom`.
- Delete click (`.open-deleteNdtProcess`): sets `#bookIdDeleteNdtProcess` (deleteID) to the row id; sets `#bookIdDeleteNdtProcessSecure` (secureCode) to a fixed string + row id + a fixed suffix "ndt", both written in the script.
- Requests made by the page on load: `/core/ajax/ajax-notifications.php?action=count_unread`.
- Requests made by the dialogs: `/core/ajax/editNdtProcess.php?id=<id>&action=showroom` (edit dialog body, GET). Add, edit and delete are posted forms without a script submit handler in the capture; no endpoint for them is named in the capture.
- Validation: none found in the capture beyond the HTML `required` attribute on `process` and `description` (Add and Edit).
- Fields shown or hidden on a condition: none found in the capture (the reveal logic for the hidden site block is not in these captures).
- Values computed in the browser: deleteID, secureCode (delete dialog), the file name display in the edit dialog (inline onchange), and the bulk id lists (see the first rule).
- Other scripts on the page (periodic and material/tariff lookups, search, calculator, etc.) belong to the shared site script; they are not specific to this page and are not described.

## Sample data
- Rows: 24 (Showing 1 to 24 of 24 entries). The page shows no WPR or enabled totals; the counts below are taken from the rows.

First 15 rows (in the order the table lists them in the capture):

| # | NDT process | Description | Group | WPR | Enabled on this site | row id |
|---|---|---|---|---|---|---|
| 1 | DF | Delta Ferrite Test | FERRITE | No | No | 24 |
| 2 | MT - Execution: ASME V / Acceptance: ASME B31.3 | MT | MT | No | No | 10 |
| 3 | MT - Execution: RToD T-0203 / Acceptance: RToD T-0110 | MT | MT | No | No | 7 |
| 4 | MT-Execution:ASME V / Acceptance ASME VIII Div.1 | MT | MT | No | No | 16 |
| 5 | Phased Array UT / Acceptance EN-ISO 19285:2017 | PA | PA | No | No | 19 |
| 6 | PAUT | PAUT | PA | No | No | 27 |
| 7 | PMI | Positive Material Identification | PMI | No | No | 23 |
| 8 | PT - Execution: ASME V / Acceptance: ASME B31.3 | PT | PT | No | No | 11 |
| 9 | PT - Execution: RToD T-0203 / Acceptance: RToD T-0110 | PT | PT | No | No | 8 |
| 10 | PT-Execution:ASME V / Acceptance ASME VIII Div.1 | PT | PT | No | No | 15 |
| 11 | PT bevel - Execution: ASME V / Acceptance: ASME B31.3 | PT | PT-b | No | No | 29 |
| 12 | UT - Execution: ASME V / Acceptance: ASME B31.3 | UT | UT | No | No | 26 |
| 13 | UT - Execution: RToD T 0202 / Acceptance: RToD T 0117 | UT | UT | No | No | 22 |
| 14 | UT-Execution: RToD | UT | UT | No | No | 20 |
| 15 | HT | Hardness Test | UT-ToFD | No | No | 25 |

Remaining rows 16 to 24 (same columns, short form):

| # | NDT process | Description | Group | WPR | Enabled on this site | row id |
|---|---|---|---|---|---|---|
| 16 | VT root pass | VT root pass | VT | No | No | 28 |
| 17 | RT - Execution: ASME V / Acceptance ASME VIII Div.1 | RT | RT | Yes | No | 14 |
| 18 | RT - Execution: ASME V / Acceptance: ASME B31.3 | RT | RT | Yes | No | 9 |
| 19 | RT - Execution: EN ISO 17636-1 class B / Acceptance: EN ISO 10675 Lv2b | RT | RT | Yes | No | 12 |
| 20 | RT - Execution: RToD T-0201 / Acceptance: RToD T-0111 | RT | RT | Yes | No | 6 |
| 21 | MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | MT | MT | No | Yes | 4 |
| 22 | PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x | PT | PT | No | Yes | 5 |
| 23 | RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | RT | RT | Yes | Yes | 1 |
| 24 | TOFD - Execution: NEN-EN-ISO 10863 / Acceptance NEN-EN-ISO 15626 L1 | TOFD | UT-ToFD | Yes | Yes | 13 |

Counts from the table: WPR "Yes" on 6 rows (17, 18, 19, 20, 23, 24); "Enabled on this site" "Yes" on 4 rows (21, 22, 23, 24).

Row options on every row: pencil (edit), trash (delete), checkbox (`ccid_<id>`).

## Not in the capture
- "Options ▾" menu (bulk actions): the button is named in the browser-pass notes; its items and the dialogs they open are not in the capture. The capture also lacks `#showWPSgroupOptions` markup.
- Other pages' dialogs are not described (see the list below).
- Edit dialog bodies for rows other than id 24: each row's pencil loads the same form with that row's values (the capture shows only row 24).
- Delete dialog after a click: the capture holds only the static dialog (no `__edit` or `__delete` capture exists for this page).
- Pagination: none shown in the capture (see List).
- Results of Add, Update or Delete submissions: not captured (no submission was made).

Also present in the page, opened from elsewhere (not opened by a control captured on this page): editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy (the Options menu may open some of these; the capture does not show it), deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal. Handheld menu items (Scan weld, Scan flange QR label, Add punch) are shared on every page.
