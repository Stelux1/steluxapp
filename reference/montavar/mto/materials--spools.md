# MTO Pilot → Materials → Spools

Source: `mto__materials__spools.txt`, `mto__materials__spools__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. The Add and Delete dialogs and the page's shared script are written in full in `weld__welddata__spools.txt` (the MTO capture marks them `SAME-AS` that file). Browser-pass notes: `_interactive/I3-mto.md` (section "Edit dialogs of the small catalogs"). URL: `/mtopilot/material-spools/`.
State of the page for the observing account: normal.

## Page
- Document title: "Spools - MTOPilot®". Top bar app tile "MTOPilot®" (`/mtopilot/`). Top bar link "Spools" → `/mtopilot/index.php?page=material-spools`.
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Panel heading (dark): icon `glyphicon-tasks`, title "Spools".
- Buttons above the list:
  - Blue button with a plus icon only (no text; `.buttonInsert.btn-primary`, `href="#addSpool"`, `data-toggle="modal"`) → opens the "Add spool" dialog (`#addSpool`).
  - `⚙ Options ▾` (blue-grey): seen in the browser-pass notes only (`I3-mto.md`, Spools entry); not in the captured DOM. Its menu entries are not recorded in the capture or the notes.
- Search box above the table (see List).

## List
- Columns in order (from the DataTables `cols` and the header row):
  1. "Spool name" (data key 0, sortable, visible)
  2. "Enabled on this site" (data key 1, sortable, visible)
  3. "Options" (data key 2, sortable, visible)
  4. Unnamed column whose header holds a select-all checkbox `#checkAll` (data key 3, sortable, visible)
- Hidden columns: none.
- Default sort: configuration `order: [[2,"asc"]]` (column index 2, "Options", ascending).
- Page length options: 5, 20, 50, 100, 500. Default page length: 20.
- Per-column search inputs: none. Global search: input type="search", placeholder "Search", with a clear button (×).
- Filters: none in the capture.
- Row options, in order:
  1. Pencil icon (`glyphicon-pencil`, button "buttonEdit open-editSpool", btn-warning, `href="#editSpool"`, `data-id` = spool id) → opens "Edit spool".
  2. Trash icon (`glyphicon-trash`, button "buttonDelete open-deleteSpool", btn-danger, `href="#deleteSpool"`, `data-id` = spool id) → opens "Delete spool".
  3. Row checkbox (`#id_<id>`, class `checkbox11`, `name="cbList[]"`, value `s<id>`) → selects the row (see Rules).
- Bulk actions: the `⚙ Options ▾` menu (browser-pass notes only; contents not recorded). No bulk action is visible in the captured DOM.
- Export / print buttons: none in the captured DOM.
- Info and empty texts (DataTables language):
  - info: "Showing _START_ to _END_ of _TOTAL_ entries"
  - empty: "No data available in table"
  - zero match: "No matching records found"
  - Footer as captured: "Showing 1 to 53 of 53 entries"
- Server-side table request: none. The table is client-side (`serverSide: false`, `ajax: null`); all 53 rows are in the page.
- Note on the capture: a second, header-only `<table>` (no id) directly above the list holds the same header row and reports `DT {"err":"TypeError: Cannot read properties of undefined (reading 'ajax')"}`. The data table is the one with id `datatableWarehouse`.

## Dialogs

### Add spool (`#addSpool`) — opened by the blue plus button in the panel heading
Static dialog, identical to the one in `weld__welddata__spools.txt`. No request is made to load it.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Spool name | name | text | yes | empty | — |
| 2 | Abbreviation | abbr | text | yes | empty | — |
| 3 | Enable on this site (Zandbak) | site | checkbox (id `checkboxPSXcv1`, value `ok`) | no | unticked | — |

Hidden inputs: none. Tabs: none.
Buttons: "Add" (btn-primary, submit, name `addSpool`, class `btn-hideInsert`); "Cancel" (default, dismisses).
Text rules: Spool name and Abbreviation are required (HTML `required`). The checkbox states that the spool is enabled on the current site (named "Zandbak" in the capture).

### Edit spool (`#editSpool`) — opened by the pencil icon of a row (`data-id` = spool id)
Shell is static (title, footer); the body is loaded when the dialog opens: `GET /core/ajax/editSpool.php?id=<spool id>&action=showroom` (captured for id 54, status 200, one request). Body and shell are shown below in the order of the response.

| # | Label | name | Type | Required | Default (captured, spool id 54) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Spool name | name | text, autocomplete off | yes | `SP01A` | loaded by the request above |
| 2 | Abbreviation | abbr | text, autocomplete off | yes | `SP01A` | loaded by the request above |
| 3 | Enable on this site (Zandbak) | sites[] (value `1`, id `checkboxPSX1`) | checkbox | no | unticked | visible in the body; label is the text next to the box |
| 4 | Enable on this site (in a hidden block) | sites[] (value `2`, id `checkboxPSX2`) | checkbox | no | ticked (`CHECKED`); label "10420-2530 Ineos Project ONE" | inside a block with `display:none` (captured as hidden); the capture does not show when the block is shown |
| 5 | (same hidden block) | sites[] (value `10`, id `checkboxPSX10`) | checkbox | no | unticked; label "IPO - Carry Over" | same hidden block as field 4 |
| — | (hidden) | editID | hidden | — | `54` | — |
| — | (hidden) | secureCode | hidden | — | a per-load token (value not recorded in this note) | — |

Notes on the body:
- Fields 4 and 5 sit under a hidden label "Enable on this site" (`for="input00"`), which is the list of the other sites.
- The number of sites in the list is 3 in this capture (value 1 visible, values 2 and 10 hidden).
- Field 1 and field 2 share the element id `exampleInputEmail1` in the response (duplicate id).

Buttons: "Update" (btn-warning, submit, name `editSpool`, class `btn-hideEdit`); "Cancel" (default, dismisses).
Text rules: Spool name and Abbreviation are required (HTML `required`).

### Delete spool (`#deleteSpool`) — opened by the trash icon of a row (`data-id` = spool id)
Static dialog, identical to the one in `weld__welddata__spools.txt`. No request is made to load it in the capture.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| — | (hidden) | deleteID | hidden (id `bookIdDeleteSpool`) | — | not recorded in the capture | filled when the dialog is opened (value not captured) |
| — | (hidden) | secureCode | hidden (id `bookIdDeleteSpoolSecure`) | — | not recorded in the capture | filled when the dialog is opened (value not captured) |

Text in the dialog: "Are you sure?" (no field for the user to type).
Buttons: "Delete" (btn-danger, submit, name `deleteSpool`, class `btn-hideDelete`, trash icon); "Cancel" (default, dismisses).

Also present in the page, opened from elsewhere (no control on this page points to them): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal. The floating scan button has two menu entries with `data-action` "material-qr-scan" ("Scan material") and "service-request-scan" ("Scan service request"); the capture does not name the dialog each one opens.

## Rules found in the page's JavaScript
- Row selection (handler `updateSpoolSelection`, script `h=1mf9pb8xo0`, which the MTO capture marks SAME-AS the weld spools page): on click or change of any `input.checkbox11`, the values of all ticked row checkboxes are joined with commas into `#activationIds` and `#deactivationIds`. If at least one row is ticked, `#showWPSgroupOptions` loses class `is-inactive`; otherwise it gains it. While it is inactive, clicks on its `.dropdown-toggle` are stopped. The elements `#activationIds`, `#deactivationIds` and `#showWPSgroupOptions` are not in this page's captured DOM; the handler is part of the shared script that the page loads.
- Client-side table: `serverSide: false` and `ajax: null` in the table configuration; the rows are drawn from the page itself. No request is made for the rows.
- Edit request: opening the edit dialog makes `GET /core/ajax/editSpool.php` with parameters `id` (the row's spool id) and `action=showroom`. The click handler (class `open-editSpool`) is not in the captured script lines.
- Header request on load (not specific to this page): `GET /core/ajax/ajax-notifications.php?action=count_unread`.
- Required fields: Spool name and Abbreviation carry the HTML `required` attribute. No script validation rule for them is in the captured lines.
- Button classes `btn-hideInsert`, `btn-hideEdit` and `btn-hideDelete` are on Add, Update and Delete. The captured lines do not show the script that acts on them.
- Other requests in the captured part of the large shared script (`n69mmax7ql3`, 361047 bytes; only about 40 lines of it are in the capture, the rest is marked as captured on earlier pages). They are not named as used by this page: `/core/ajax/getListOfMaterials.php` (params `id`, `timer`, `ajax`), `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php` (params `k`, `v`), `/core/ajax/searchUnitRates.php` (param `id`), `/core/ajax/searchTarrifs.php` (param `id`), `/core/ajax/searchFactors.php` (param `id`).

## Sample data
- Total rows: 53 (`total` 53, `shown` 53).
- Rows drawn in the capture: 40 (the capture writes at most 40 body rows and then "(+13 more rows of 53)").
- Among the 40 drawn rows: "Enabled on this site" = Yes for 5 rows (SP01, SP11, SP12, SP13, SP14), No for 35 rows. The browser-pass notes describe the No values as orange badges.
- Duplicate names in the drawn rows: "SP22" appears three times (ids 68, 76, 77).
- First 15 drawn rows (all columns):

| Spool name | Enabled on this site | Options (edit / delete `data-id`) | Row checkbox (id / value) |
|---|---|---|---|
| SP01A | No | edit 54 / delete 54 | `id_54` / `s54` |
| SP01B | No | edit 60 / delete 60 | `id_60` / `s60` |
| SP02 | No | edit 1 / delete 1 | `id_1` / `s1` |
| SP02A | No | edit 59 / delete 59 | `id_59` / `s59` |
| SP03 | No | edit 2 / delete 2 | `id_2` / `s2` |
| SP03A | No | edit 58 / delete 58 | `id_58` / `s58` |
| SP04 | No | edit 4 / delete 4 | `id_4` / `s4` |
| SP04A | No | edit 57 / delete 57 | `id_57` / `s57` |
| SP05 | No | edit 28 / delete 28 | `id_28` / `s28` |
| SP05A | No | edit 61 / delete 61 | `id_61` / `s61` |
| SP06 | No | edit 29 / delete 29 | `id_29` / `s29` |
| SP06A | No | edit 56 / delete 56 | `id_56` / `s56` |
| SP07 | No | edit 30 / delete 30 | `id_30` / `s30` |
| SP07A | No | edit 55 / delete 55 | `id_55` / `s55` |
| SP08 | No | edit 31 / delete 31 | `id_31` / `s31` |

The five drawn rows with Enabled = Yes, same columns: SP01 (edit 52 / delete 52, `id_52` / `s52`), SP11 (edit 50 / delete 50, `id_50` / `s50`), SP12 (edit 49 / delete 49, `id_49` / `s49`), SP13 (edit 48 / delete 48, `id_48` / `s48`), SP14 (edit 47 / delete 47, `id_47` / `s47`). The 13 rows beyond the drawn 40 are not in the capture.

## Not in the capture
- The `⚙ Options ▾` menu: its entries are not in the captured DOM or in the browser-pass notes. It is opened by a click.
- The 13 rows beyond the first 40 drawn (the capture stops at 40; the table holds 53).
- The Edit dialog body for any spool other than id 54 (loaded per row on click).
- The values of the hidden `deleteID` and `secureCode` fields of the Delete dialog (not recorded).
- Any result of Add, Update, Delete or the checkbox bulk selection (none was submitted; the capture is read-only).
- The script handlers for `open-editSpool`, `open-deleteSpool` and the table's `#checkAll` select-all: not in the captured lines.
