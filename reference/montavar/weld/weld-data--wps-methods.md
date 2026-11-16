# Weld Pilot → Weld data → WPS methods

Source: `weld__welddata__wps-methods.txt`, `weld__welddata__wps-methods__edit.txt`, `weld__welddata__wps-methods__copy.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/wps/` (the page's own links use `/weldpilot/index.php?page=wps`).
State of the page for the observing account: normal.

## Page
- Browser title: "WPS methods - WeldPilot®". Panel heading: "WPS methods" (list icon) with a small "+" button at its right (same dialog as the top button).
- Breadcrumb: a single entry "WPS methods" → `/weldpilot/index.php?page=wps`. No tabs.
- Status filter buttons above the list (links, reload the page): "Active 77" (selected, `?page=wps`), "Inactive 102" (`?page=wps&inactive=ok`), "Deleted 13" (`?page=wps&show=deleted`).
- Text line: "Home location: Zandbak View: Originals". Note line (shown in Dutch in the capture): "Status en tellingen worden berekend voor de huidige variant en site-context."
- View toggle buttons: "Originals" (selected, `?page=wps`) and "Copies" (`?page=wps&viewweld=copies`).
- Top bar buttons:
  - "Add WPS method" (plus icon) → dialog `#addWps` (`href="#addWps"`, `data-toggle="modal"`). The panel-heading "+" button opens the same dialog.
  - "Options" (cog icon, dropdown, in group `#showWPSgroupOptions`, hidden in the capture — see "Not in the capture") with four items: "Activate selected" → `#optsActivate`; "Deactivate selected" → `#optsDeactivate`; "Mass copy WPS" → `#optsWpsCopy`; "Global deactivate" (globe icon) → `#optsGlobalDeactivateWps`.

## List
- Table `#datatableWarehouse`, server-side. Request: `/core/ajax/wps-methods.php` (DataTables parameters `draw`, `columns[i][...]`, etc.); the page adds two parameters: `status` = "active" and `variant` = "originals" (for the selected buttons above).
- Columns in order: 1 "WPS number" (sortable), 2 "Weld process" (sortable), 3 "WPS definition" (sortable), 4 "Joint type" (sortable), 5 "Enabled on this site" (sortable), 6 "Options" (not sortable, class `wsapps-col-wps-options`). No hidden columns. No per-column search inputs.
- Default sort: column index 4 ("Enabled on this site"), ascending. Page length 25; length menu 10 / 25 / 50 / 100 (select labelled "Show … entries").
- Global search: one input, placeholder "Search", with a clear (x) button.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries" (displayed: "Showing 1 to 25 of 77 entries"); empty "No data available in table"; no match "No matching records found"; "Processing..." indicator.
- WPS number cell: plain text, or a link (opens in a new tab) to the uploaded PDF `/core/assets/docs/down.php?file=<stored file name>` when the method has a document.
- Row options (cell 6), in order:
  1. Copy (copy icon, warning button, `title="Copy"`, `data-id` = row id) → `#copyWps`.
  2. Edit (pencil icon, `title="Edit"`, `data-id`) → `#editWps`.
  3. Open in Designer (magic-wand icon, info button, `title="Open in Designer"`, class `js-open-legacy-designer`, `href="#"`, `data-legacy-id` = row id). No handler for it is in this capture.
  4. Two hidden inputs `wpsID` (row id) and `targetSiteActive` (value "0" on every row shown).
  5. Deactivate (pause icon, submit button `name="setWpsActive"`, `title="Deactivate"`) — submits the row's form with `wpsID` / `targetSiteActive`.
  6. Delete (trash icon, danger button, `title="Delete"`, `data-id`) → `#deleteWps`.
  7. Row checkbox (class `wsapps-wps-select`, `data-id` = row id, value "s<id>") — selection for the Options menu.
- Bulk actions: the Options menu above (Activate selected, Deactivate selected, Mass copy WPS, Global deactivate).
- No export / print buttons and no column-visibility control in the capture.

## Dialogs

### Add WPS method (`#addWps`) — opened by "Add WPS method" button (top bar and panel heading)
Form: `method="post"`, `enctype="multipart/form-data"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | WPS number | `wpsNumber` | text | yes | empty | |
| 2 | Weld process | `wpsNumberShort` | text | yes | empty | placeholder "141-2 GTAW" |
| 3 | WPS definition | `definition` | text | yes | empty | |
| 4 | (none) | `matGroupFields` | hidden | — | `1` | |
| 5 | ISO groups on this WPS | `isoGroups[]` | multi-select (select2, tags allowed, placeholder "Choose or type") | no | none selected | 32 options (value = text): 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 11.1 |
| 6 | Allowed dissimilar pairs (ISO) | `isoPairs[]` | multi-select (select2, tags allowed) | no | none | 5 options: 1.1+5.1, 1.1+8.1, 1.2+8.1, 5.1+8.1, 8.1+10.1 |
| 7 | ASME P-Numbers on this WPS | `asmePNumbers[]` | multi-select (select2, tags allowed) | no | none | 16 options: P-1, P-3, P-4, P-5A, P-5B, P-5C, P-6, P-7, P-8, P-9A, P-9B, P-10A, P-10H, P-10I, P-15E, P-34 |
| 8 | Allowed dissimilar pairs (ASME) | `asmePairs[]` | multi-select (select2, tags allowed) | no | none | 4 options: P-1+P-4, P-1+P-8, P-4+P-8, P-8+P-10H |
| 9 | Joint type | `jointType` | text | no | empty | |
| 10 | Project | `project[]` | multi-select (select2) | no | none | 3 options: `0` → "--------"; `ALL` → "ALL"; `1` → "20240101" (list of the account's projects) |
| 11 | PQR | `pqr[]` | multi-select (select2) | no | none | 1 option: `0` → "--------" (no PQR records exist in the sandbox) |
| 12 | Document | `file` | file, `accept=".pdf"` | no | none | button "Choose file" plus a read-only-looking text box (placeholder "Nothing selected", id `uploader7vba11`) that shows the chosen file name via the input's `onchange` |
| 13 | Enable on this site (Zandbak) | `site` | checkbox, value `ok` | no | unchecked | label includes the home location's name |

Help text above the ISO/ASME group fields: the group fields are optional; pick a value or type one that is not in the list.
Buttons: "Add" (submit, `name="addWps"`, primary), "Cancel" (dismiss). A close (x) button in the header.

### Edit WPS method (`#editWps`) — opened by the pencil icon in a row
Body is loaded after the click (see Rules). Captured for row id 156 (WPS number "P91-T2"). Same form type as Add (`post`, `multipart/form-data`). Fields in document order:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | WPS number | `wpsNumber` | text | yes | row value ("P91-T2") | |
| 2 | Weld process | `wpsNumberShort` | text | no (no `required` here, unlike Add) | row value ("141 (GTAW)") | |
| 3 | WPS definition | `definition` | text | yes | row value ("# (3-20,3) mm / D (24,15-9999) mm") | |
| 4 | (none) | `matGroupFields` | hidden | — | `1` | |
| 5 | ISO groups on this WPS | `isoGroups[]` | multi-select | no | none selected for this row | same 32 options as Add |
| 6 | Allowed dissimilar pairs (ISO) | `isoPairs[]` | multi-select | no | none for this row | same 5 options |
| 7 | ASME P-Numbers on this WPS | `asmePNumbers[]` | multi-select | no | none for this row | same 16 options |
| 8 | Allowed dissimilar pairs (ASME) | `asmePairs[]` | multi-select | no | none for this row | same 4 options |
| 9 | Joint type | `jointType` | text | no | row value ("BW / BR") | |
| 10 | Project | `project[]` | multi-select | no | none selected for this row | same 3 options as Add |
| 11 | PQR | `pqr[]` | multi-select | no | none | 1 option `0` → "--------" |
| 12 | Document | `file` | file, `.pdf` | no | none | "Nothing selected" box id `uploader7vbn156` (contains the row id) |
| 13 | Enable on this site (Zandbak) | `sites[]` | checkbox, value `1` | no | unchecked for this row | one checkbox per project site |
| 14 | 10420-2530 Ineos Project ONE | `sites[]` | checkbox, value `2` | no | unchecked | inside a block under the label "Enable on this site" that is hidden (`display:none`) |
| 15 | IPO - Carry Over | `sites[]` | checkbox, value `10` | no | unchecked | same hidden block |
| 16 | (none) | `editID` | hidden | — | row id (`156`) | |
| 17 | (none) | `secureCode` | hidden (in the dialog footer, id `bookIdEditWpsSecure`) | — | a 32-character hex code set by the page | see Rules |

The same help text as in Add appears above the group fields. Buttons: "Update" (submit, `name="editWps"`, warning), "Cancel" (dismiss), close (x).
The static (unopened) `#editWps` has only header, footer (`secureCode`, Update, Cancel) and no body fields.

### Delete WPS method (`#deleteWps`) — opened by the trash icon in a row
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text "Are you sure?") | — | text only | — | — | |
| 2 | (none) | `deleteID` | hidden (id `bookIdDeleteWps`) | — | set by the page to the row id | |
| 3 | (none) | `secureCode` | hidden (id `bookIdDeleteWpsSecure`) | — | set by the page | see Rules |

Buttons: "Delete" (submit, `name="deleteWps"`, danger), "Cancel", close (x).

### Copy WPS to another Project site (`#copyWps`) — opened by the copy icon in a row
Title "Copy WPS to another Project site". Form `post`, `multipart/form-data`. Body is loaded after the click (captured for row id 156).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | `projectSite` | select (select2, single) | no | first option, "Zandbak" | 3 options: `1` → "Zandbak"; `2` → "10420-2530 Ineos Project ONE " (trailing space); `10` → "IPO - Carry Over" |
| 2 | (none) | `editID` | hidden | — | row id (`156`) | |
| 3 | (none) | `secureCode` | hidden (footer, id `bookIdCopyWpsSecure`) | — | set by the page | see Rules |

Buttons: "Copy" (submit, `name="copyWps"`, success), "Cancel", close (x). The static `#copyWps` has only the header and the footer.

### Copy WPS to another Project site (`#copyWps2`) — present in the page; no control of this page was seen pointing to it
Listed because it is in the page next to the copy dialog and has fields. Form `post`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | `projectSite` | select (select2) | no | "10420-2530 Ineos Project ONE" | 2 options: `2` → "10420-2530 Ineos Project ONE"; `10` → "IPO - Carry Over" |
| 2 | (none) | `deleteID` | text (id `bookIdCopyWps`) | no | empty | |
| 3 | (none) | `secureCode` | hidden (id `bookIdCopyWpsSecure`) | — | empty | |

Buttons: "Copy" (submit, `name="copyWps"`), "Cancel". The page script has the handler that fills `bookIdCopyWps` inside a commented-out block, so this dialog looks unused; the capture does not say more.

Dialogs opened from the Options menu (`#optsActivate` "Activate selected", `#optsDeactivate` "Deactivate selected", `#optsWpsCopy` "Mass Copy WPS", `#optsGlobalDeactivateWps` "Global deactivate WPS") are written in the dashboard capture, not in this one (`SAME-AS weld__start__dashboard`); their fields are listed below (read from the dashboard capture; all four forms are `method="post"`).

| Dialog | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| `#optsActivate` | (text "By clicking 'Confirm,' you will activate the selected options.") | selectedIDS (id `activationIds`) | hidden | READONLY | set by script | the ticked row values |
| `#optsActivate` | (none) | fileid | hidden | no | no value in the capture | none |
| `#optsDeactivate` | (text "By clicking 'Confirm,' you will deactivate the selected options.") | selectedIDS (id `deactivationIds`) | hidden | READONLY | set by script | the ticked row values |
| `#optsGlobalDeactivateWps` | (warning text: deactivates the selected WPS methods on all sites, not just the current one) | selectedIDS (id `globalDeactivationIds`) | hidden | READONLY | set by script | the ticked row values |
| `#optsWpsCopy` | (text "Are you sure?") | projectSite | select (select2) | no | Zandbak | 1 Zandbak; 2 10420-2530 Ineos Project ONE; 10 IPO - Carry Over |
| `#optsWpsCopy` | (none) | selectedIDS (id `massCopyWPS`) | hidden | READONLY | set by script | the ticked row values |

Buttons: `#optsActivate` / `#optsDeactivate` "Confirm" (`btn-success`, submit, name `optsActivate` / `optsDeactivate`); `#optsGlobalDeactivateWps` "Confirm" (`btn-danger`, submit, name `optsGlobalDeactivateWps`); `#optsWpsCopy` "Copy" (`btn-success`, submit, name `massCopyWPS`); each with "Cancel".

## Rules found in the page's JavaScript
Only the lines of the page script that earlier captures did not contain are in this capture.
- `__wsappsIsWpsList = true` and debug page name "wps" are set for this page.
- `.open-editWps` click: reads the row id from `data-id`, sets the hidden `secureCode` (`#bookIdEditWpsSecure`) to a fixed prefix + id + the letters "wpsE", then requests `GET /core/ajax/editWps.php?id=<id>` (the capture's log shows `&action=showroom`) and puts the returned HTML into `#contentEditWps` of `#editWps`.
- `.open-deleteWps` click: writes the row id into `#bookIdDeleteWps` and sets `#bookIdDeleteWpsSecure` to the same kind of code, prefix + id + "wps".
- `.open-copyWps` click: writes the row id, sets `#bookIdCopyWpsSecure` to prefix + id + "wpsE", then requests `GET /core/ajax/copyWps.php?id=<id>` (log shows `&action=showroom`) and puts the HTML into `#contentCopyWps`. An older variant of this handler (filling `bookIdCopyWps`) is inside a comment.
- The table sends `status` = "active" and `variant` = "originals" with every request to `/core/ajax/wps-methods.php`; `draw` 1 to 8 were logged while the page loaded and after clicks.
- The returned copy body runs `$(".select2-single").select2()`; the group fields (`wsapps-group-select`) are select2 with free tags.
- `js-open-legacy-designer` ("Open in Designer"): no handler for it in this capture.
- Page-wide request seen: `GET /core/ajax/ajax-notifications.php?action=count_unread` (response `{"count":0}`).
- No client-side validation messages are in the capture beyond the HTML `required` attributes listed above.

## Sample data
Counts: Active 77, Inactive 102, Deleted 13; "Showing 1 to 25 of 77 entries"; 25 rows on the first page. Home location "Zandbak", view "Originals". Every row shown has "Enabled on this site" = "Global" and `targetSiteActive` = 0.

First 15 rows (columns 1–5; row id in brackets):

| WPS number | Weld process | WPS definition | Joint type | Enabled on this site |
|---|---|---|---|---|
| P91-123 [159] (no link) | 141 (GTAW) | # (3 - 20,3) mm / D (21, - 9999) mm | - | Global |
| P91-T2 [156] (PDF link) | 141 (GTAW) | # (3-20,3) mm / D (24,15-9999) mm | BW / BR | Global |
| P91-TR1 [151] (PDF link) | 141 (GTAW) / 111 (SMAW) | #(10 - 40) mm / D (57,15 - 9999) mm | BW / BR | Global |
| CSP-TF11b [134] (PDF link) | 141 (GTAW) / 136 (FCAW) | # (10-40) mm / D (107,32-9999) mm | BW / BR | Global |
| CS-M3 [110] | 135 (GMAW) | # (5 - 40) mm | FW | Global |
| CSP-R3 [109] | 111 (SMAW) | # (3 - 40) mm / D (108 - 9999) mm | FW (Plate + Pipe / Plate + Plate) | Global |
| CS-R3 [108] | 111 (SMAW) | # (3 - 20) mm / D (53,1 - 9999) mm | FW (Plate + Pipe / Plate + Plate) | Global |
| CSP-F3 [104] | 136 | 3mm - 40mm / Dmin(mm) =108 | FW. plate + pipe / plate | Global |
| 304-T3b [86] | 141 - GTAW | 1.43mm - 5.74mm D (mm) > 13.33 | FW - Socket Weld | Global |
| 304-T3b [85] | 141 - GTAW | 1.43mm - 5.74mm D (mm) > 13.33 | FW - Socket Weld | Global |
| CS-T3b [84] | 141 - GTAW | 3,0mm - 19,4mm D (mm) > 21.1 | SW - Socket Weld | Global |
| 19.008 rv.1 [71] (PDF link) | 135-VIP/136 | 19.008 rv.1 [2]\|CSW-01-N | V | Global |
| 14.008 [70] (PDF link) | 135-VIP/136 | 14.008 [2]\|CSW-01-N | V | Global |
| 19.009 [69] (PDF link) | 135-VIP/136 | 19.009 rv.2 [2]\|CSW-01-N | V | Global |
| 22.019 rv.2 [68] (PDF link) | 135/136 | 22.019 rv.2 [2]\|CSW-01-N | V | Global |

Rows 16–25 on the page have ids 67, 66, 65, 64, 63, 62, 61, 60, 59, 58 (WPS numbers 22.019BR, 22.006 rv.1, 22.005, 22.004FW, 22.004BR, 22.004, 22.003REP, 22.002BR, 22.002SW rv.2, 22.002).

Edit dialog sample (row 156): see the defaults in the Edit table. Copy dialog sample: site list Zandbak / 10420-2530 Ineos Project ONE / IPO - Carry Over. The "Project" select offers a project numbered 20240101.

## Not in the capture
- Rows 26–77 and the pagination controls (the page-number buttons are not in the capture; the info line says 77 entries, 25 per page).
- The "Inactive 102" and "Deleted 13" lists, and the "Copies" view (their own server requests with other parameters).
- The Options menu is hidden in the capture (`#showWPSgroupOptions` is marked hidden, probably shown when rows are ticked; the capture does not say). The bodies of `#optsActivate`, `#optsDeactivate`, `#optsWpsCopy`, `#optsGlobalDeactivateWps` are not in this capture.
- What "Open in Designer" does (control `.js-open-legacy-designer` in each row).
- What Deactivate (pause icon) returns, and what the Delete / Copy / Update submissions answer.
- The Edit dialog for a row that has ISO groups, project, PQR or site selections already set (only row 156, with none set, was captured). Browser-pass notes (`_interactive/I2a-welders-catalogs.md`) only repeat the same chips and counts and name the edit and copy captures.
- The shared page script (marked "already captured on earlier pages") is only partly in this capture.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#addPqr`, `#addFlange`, `#deleteFlange`, `#importFlanges`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
