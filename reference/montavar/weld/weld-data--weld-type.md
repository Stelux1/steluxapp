# WeldPilot → Weld data → Weld type

Source: `weld__welddata__weld-type.txt`, `weld__welddata__weld-type__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/weld-type/`.
State of the page for the observing account: normal.

## Page
- Title: "Weld type - WeldPilot®" (page title). Heading in the panel: "Weld type" (list icon).
- Breadcrumb: none in the capture. Tabs: none.
- Top bar link to this page: "Weld type" → `/weldpilot/weld-type/`.
- Buttons above the list:
  - "Options ▾" (cog icon; bulk-options menu, `#showWPSgroupOptions`, rendered inactive until at least one row is ticked) → menu, see List.
  - "+ Add weld type" (btn-primary, `href="#addWeldType"`, `data-toggle="modal"`) → opens the Add weld type dialog. The same button also sits in the top bar (`.buttonInsert`), with the same target.
- Language links in the header (not page-specific): Nederlands, English, Deutsch, Français (`lang=nl|en|de|fr&page=weld-type`).

## List
- Table: `#datatableWarehouse` (DataTables, client-side: `serverSide: false`, `ajax: null`). No server-side request is made for the rows; all 17 rows are in the page.
- A first table without id (class `table … dataTable`, header row only) is also in the capture. Its DataTables configuration reports an error in the capture: "TypeError: Cannot read properties of undefined (reading 'ajax')".
- Controls above the table, in document order:
  - Export buttons: "CSV", "Excel", print (icon only, `fa-print`). All three are `href="#"`. Print/CSV/Excel were not clicked.
  - Search: input type "search", placeholder "Search", with a clear button. No per-column search inputs, no filters.
- Columns in order (header titles exactly as shown):
  1. Weld type (sortable)
  2. Shop/Field (sortable)
  3. Abbreviation (sortable)
  4. Joint type (sortable)
  5. Groove type (sortable)
  6. Enabled on this site (sortable)
  7. Options (not sortable)
  8. header checkbox `#checkAll` (not sortable); each row has a checkbox `name="cbList[]"`, value `s<id>`, id `id_<id>`.
- Hidden columns: none (all 8 `vis: true`).
- Default sort: column index 4 ("Groove type"), ascending (`order: [[4,"asc"]]`).
- Page length options: 5, 20, 50, 100, 500. Default page length: 20.
- Row options (column 7, in order):
  - Pencil icon (btn-warning, `.buttonEdit.open-editWeldType`, `href="#editWeldType"`, `data-id="<id>"`) → "Edit weld type" dialog.
  - Trash icon (btn-danger, `.buttonDelete.open-deleteWeldType`, `href="#deleteWeldType"`, `data-id="<id>"`) → "Delete weld type" dialog.
- Bulk actions: "Options ▾" menu. Its items are not in this capture (the DOM lines are elided as already captured on earlier pages). The browser-pass notes say the menu holds "Activate selected" (`#optsActivate`) and "Deactivate selected" (`#optsDeactivate`), and that the menu is on every page (`I2a-welders-catalogs.md`). Ticking rows enables the menu (see Rules).
- Export / print: CSV, Excel, print (see above).
- Info and empty texts:
  - Info: "Showing _START_ to _END_ of _TOTAL_ entries" (shown on this page as "Showing 1 to 17 of 17 entries").
  - Empty: "No data available in table".
  - Zero matches: "No matching records found".
  - Search label text: empty (placeholder "Search" only).
- Server-side table request: none (client-side table).

## Dialogs

### Add weld type (`#addWeldType`) — opened by "+ Add weld type" (panel heading and top bar)
Present in the DOM; form `method="post"`, no `action` attribute in the capture. Submit button name `addWeldType`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Weld type | weldType | text | yes | empty | — |
| 2 | Shop/Field | type | select | yes | "Shop" shown (cur="Shop"); no option marked as selected by default in the markup | 1 → Shop ; 2 → Field |
| 3 | Abbreviation | abbr | text | yes | empty | — |
| 4 | Joint type | jointType | text | no | empty | — |
| 5 | Groove type | groove | text | no | empty | — |

Buttons: "Add" (btn-primary, type submit, name `addWeldType`); "Cancel" (default, closes the dialog).
Text in the dialog that states a rule: none. Only the HTML `required` attributes (fields 1–3) are in the markup.

### Edit weld type (`#editWeldType`) — opened by the pencil icon of a row
The dialog shell is in the DOM. Its body is loaded by the page when the pencil is clicked (see Rules). The capture shows the body for one row only: the row with id 21, "Branch welds- Shop". The values below are for that row. For other rows the values are those of the row, not captured.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Weld type | weldType | text | yes | "Branch welds- Shop" (row 21) | — |
| 2 | Shop/Field | type | select | yes | Shop (selected) | 1 → Shop ; 2 → Field |
| 3 | Abbreviation | abbr | text | yes | "WS" (row 21) | — |
| 4 | Joint type | jointType | text | yes | "BR" (row 21) | — |
| 5 | Groove shape | groove | text | no | empty (row 21) | — |
| 6 | Enable on this site (Zandbak) — checkbox (no label element; text follows the input) | sites[] (value 1) | checkbox | no | checked | visible; site "Zandbak" (site 1) |
| 7 | Enable on this site — checkbox, label "10420-2530 Ineos Project ONE" | sites[] (value 2) | checkbox | no | checked | inside a block with `display:none` (label "Enable on this site"); the capture shows no control that makes it visible |
| 8 | Enable on this site — checkbox, label "IPO - Carry Over" | sites[] (value 10) | checkbox | no | checked | same hidden block as 7 |
| 9 | (hidden) | editID | hidden | — | "21" (row id) | set from the row id |
| 10 | (hidden, dialog footer, `#bookIdEditWeldTypeSecure`) | secureCode | hidden | — | set by the page script on click (value is a computed secure value, not shown here) | see Rules |

Notes on the body markup: every field in the loaded body carries the same id `exampleInputEmail1`. Field 5's label is "Groove shape" here, while the list column and the Add dialog say "Groove type".

Buttons: "Update" (btn-warning, type submit, name `editWeldType`); "Cancel" (default, closes the dialog).
Text in the dialog that states a rule: none.

### Delete weld type (`#deleteWeldType`) — opened by the trash icon of a row
Form `method="post"`, no `action` attribute in the capture. Body text: "Are you sure?".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, `#bookIdDeleteWeldType`) | deleteID | hidden | — | empty in the markup; set by the page script on click to the row's id | see Rules |
| 2 | (hidden, `#bookIdDeleteWeldTypeSecure`) | secureCode | hidden | — | empty in the markup; set by the page script on click to a computed secure value | see Rules |

Buttons: "Delete" (btn-danger, type submit, name `deleteWeldType`); "Cancel" (default, closes the dialog).
Text in the dialog that states a rule: "Are you sure?" only.

## Rules found in the page's JavaScript
Source: the page's inline script (`SCRIPT-INLINE h=1eodj1uxn4`, the only script block written in full for this page) and the click handlers of the shared script (lines already captured on earlier pages; their bodies are partly elided in this capture).

- Bulk-options sync (`__wsappsSyncWeldTypeBulkOptions`):
  - Collects the values of all ticked row checkboxes (`#datatableWarehouse .checkbox11:checked`) and writes that list into `#activationIds` and into `#deactivationIds`.
  - If at least one row is ticked, removes the class `is-inactive` from `#showWPSgroupOptions` (menu enabled); if none, adds it back (menu disabled).
  - Runs on change of any row checkbox, on change of the header checkbox `#checkAll` (deferred by one timer tick), and once on page load.
- Options menu guard: a click on the menu's toggle (`#showWPSgroupOptions .dropdown-toggle`) while the menu is `is-inactive` is stopped (default prevented, propagation stopped).
- Edit (click on `.open-editWeldType`): sets the hidden `secureCode` of the edit dialog to a value computed in the browser from a fixed string, the row id and a second fixed string. Then the page requests the dialog body (see the request list below) and puts the returned HTML into the dialog's body container (`#contentEditWeldType`) on success. The rest of this handler is in the shared script and is not shown in this capture.
- Delete (click on `.open-deleteWeldType`): sets the hidden `deleteID` to the row id (`myBookId`) and sets the hidden `secureCode` to a value computed the same way as for edit, with a different fixed suffix than the edit handler.
- Validation: none found in the capture except the HTML `required` attributes listed in the dialog tables (Add: weldType, type, abbr; Edit: weldType, type, abbr, jointType).
- Fields shown or hidden on a condition: none in the page's own script. The Edit dialog's second and third site checkboxes are in a `display:none` block in the server response; the capture shows no code that shows them.
- Values computed in the browser: `secureCode` (edit and delete), `deleteID` (delete), the row checkbox values used for the bulk options (`s<id>`).
- Requests made by this page's controls:
  - On load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (page-level, not specific to this list).
  - On the pencil click: `GET /core/ajax/editWeldType.php?id=<row id>&action=showroom` (captured for id 21: status 200, the dialog body HTML).
  - Add, Update, Delete submissions: the target of the form submissions is not in the capture (no `action`; not clicked).
- Other requests in the shared script, not tied to a control of this page in the capture: `/core/ajax/getListOfMaterials.php`, `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`.
- Page flags set in the shared script: `__wsappsDebugPage = "weld-type"` and `__wsappsIsWeldType = true`.

## Sample data
What the sandbox shows: 17 rows in total ("Showing 1 to 17 of 17 entries"). All 17 are on the first page (page length 20). Enabled on this site: "Yes" for all 17 rows.

Rows in displayed order (first 15; the list then continues with Butt Weld - Shop (id 19, Shop, WS, BW, L, Yes) and Butt Weld - Field (id 4, Field, FW, BW, V, Yes)):

| Weld type | Shop/Field | Abbreviation | Joint type | Groove type | Enabled on this site | row id |
|---|---|---|---|---|---|---|
| Branch welds- Shop | Shop | WS | BR | - | Yes | 21 |
| HOOK-UP | Field | YTI | BW | - | Yes | 30 |
| Fillet Weld - Field | Field | FW | FL | - | Yes | 29 |
| Fillet Weld - Shop | Shop | WS | FL | - | Yes | 28 |
| Longitudinal Welds - Field | Field | WS | LG | - | Yes | 26 |
| Longitudinal Welds - Shop | Shop | WS | LG | - | Yes | 25 |
| Reinforcment Pad FW - Field | Field | FW | RP | - | Yes | 33 |
| Reinforcment Pad FW - Shop | Shop | WS | RP | - | Yes | 27 |
| Reinforcment Pad GW -Field | Shop | FW | RP-GW | - | Yes | 24 |
| Reinforcment Pad GW -Shop | Shop | WS | RP-GW | - | Yes | 20 |
| Socked welds -Field | Field | FW | SW | - | Yes | 23 |
| Socked welds -Shop | Shop | WS | SW | - | Yes | 18 |
| Victaulic Joint-Field | Field | FW | VJ | - | Yes | 32 |
| Victaulic Joint-Shop | Shop | WS | VJ | - | Yes | 31 |
| Branch welds- Field | Field | FW | BR | 1 | Yes | 17 |

Other sample figures: the default sort is by "Groove type" ascending; the Groove type values in the list are "-", "1", "L", "V" (only the rows above and the two last rows).

## Not in the capture
- Options menu items (bulk "Activate selected" / "Deactivate selected" and any others): the DOM lines are elided ("already captured on earlier pages"); the browser-pass notes name the items from another page (`I2a-welders-catalogs.md`). Control: "Options ▾" (enabled after ticking a row).
- Result of Add, Update, Delete, and the bulk actions: not submitted in the capture.
- Edit dialog body for any row other than id 21: the request exists for every row (`editWeldType.php?id=<row id>&action=showroom`), but only the id 21 response is captured. Control: pencil icon of the row.
- Delete dialog values after a click (`deleteID`, `secureCode`): filled only by the click, so not in the markup. Control: trash icon of a row.
- Rows of the first table without id (DataTables error): not explained by the capture.
- Search, paging, sorting and column header behaviour: not exercised. Control: the search input, length menu (5/20/50/100/500) and sortable headers.
- Export output (CSV, Excel, print): not exercised. Control: CSV / Excel / print buttons.
- Check-all behaviour beyond the script: not exercised. Control: header checkbox.
- Other dialogs present in the page but not opened from this page (listed for reference only): admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, editCompanyData, passwordChange, themeChange, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
