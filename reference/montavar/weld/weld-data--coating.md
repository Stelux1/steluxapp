# WeldPilot → Weld data → Coating

Source: `weld__welddata__coating.txt`, `weld__welddata__coating__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/coating/`.
State of the page for the observing account: normal.

Browser-pass notes used: `_interactive/I2a-welders-catalogs.md` (section "Weld data → Coating", and the table of list pages). Items from those notes are marked "from the browser-pass notes".

## Page
- Title: "Coating - WeldPilot®". Panel title: "Coating" (list icon `glyphicon-list`). No breadcrumb and no tabs in the capture.
- Topbar link "Coating" → `/weldpilot/coating/` (the page's own link).
- Buttons above the list:
  - "Add coating" (topbar, class `buttonInsert`, btn-primary, full width, plus icon) → opens dialog `#addCoating`.
  - Plus icon button in the panel heading (class `buttonInsert`, same `href="#addCoating"`, `data-toggle="modal"`) → opens dialog `#addCoating`.
  - Above the table, DataTables buttons: "CSV" (`buttons-csv`, href `#`), "Excel" (`buttons-excel`, href `#`), print icon (`buttons-print`, href `#`, icon `fa-print`). The handlers of these buttons are not in the capture.
- Search box above the table: placeholder "Search", with a clear (×) button (`wsapps-dt-search-clear`).

## List
- Table id `#datatableWarehouse`, class `table table-striped table-bordered table-hover dataTable`.
- Columns in order (the `DT` line; `vis` true for all, `sort` true for all):
  1. "Coating" (data 0)
  2. "Abbreviation" (data 1)
  3. "Enabled on this site" (data 2)
  4. "Options" (data 3) — holds the row icons
  5. Header checkbox `#checkAll` (data 4), row checkbox per row (`name="ccid_<id>"`, value `s<id>`)
- Hidden columns: none.
- Default sort: `[[3,"asc"]]` (column index 3, "Options", ascending).
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Client-side table: `serverSide: false`, `ajax: null`. No server-side table request.
- Per-column search inputs: none. Filters: none.
- Row options, in order:
  1. Pencil icon (`glyphicon-pencil`, classes `buttonEdit open-editCoating btn-warning`, `href="#editCoating"`, `data-id`) → opens dialog `#editCoating`.
  2. Trash icon (`glyphicon-trash`, classes `buttonDelete open-deleteCoating btn-danger`, `href="#deleteCoating"`, `data-id`) → opens dialog `#deleteCoating`.
- Bulk actions: header checkbox selects all rows. The "Options ▾" dropdown is in the page (classes and capture show it only as the column title "Options"); from the browser-pass notes, "Options ▾" appears on this page. Its menu was not captured here. On the NDT locations page the same menu holds "Activate selected" and "Deactivate selected" (see "Not in the capture").
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing 1 to 1 of 1 entries" (static in the footer `.dt-panelfooter`; DataTables info template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none (client-side table; no `ajax` url).
- Note on the capture: a first table element (no id, same classes, header row only) precedes `#datatableWarehouse`; its DataTables configuration in the capture reads `{"err":"TypeError: Cannot read properties of undefined (reading 'ajax')"}`. The data table is `#datatableWarehouse`.

## Dialogs

### Add coating (`#addCoating`) — opened by the "Add coating" topbar button or the panel plus button
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Coating | `coating` | text (`.form-control`) | yes | empty | — |
| 2 | Abbreviation | `abbr` | text (`.form-control`) | yes | empty | — |
| 3 | Enable on this site (Zandbak) | `site` (checkbox, `#checkboxPSXcv1`, value `ok`) | checkbox | no | unchecked (no CHECKED flag in capture) | — |

- Form: `method="post"`.
- Labels are "Coating" and "Abbreviation" (`control-label`). The checkbox label is "Enable on this site (Zandbak)".
- Buttons (footer): "Add" (`btn-primary btn-hideInsert`, type submit, name `addCoating`); "Cancel" (`btn default`, closes the dialog).
- Rules stated in the dialog: none beyond the required marks on Coating and Abbreviation.
- Only one site (Zandbak) is in this add form; no hidden site checkboxes.

### Edit coating (`#editCoating`) — opened by the row pencil (`data-id`)
The dialog shell is in the page. Its body is loaded by a GET request when the pencil is clicked. The capture holds the body for the one row (id 15).

| # | Label | name | Type | Required | Default (row id 15 in capture) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Coating | `coating` | text (`.form-control`, id `exampleInputEmail1`) | yes | `UNCOATED` | — |
| 2 | Abbreviation | `abbr` | text (`.form-control`, id `exampleInputEmail1`) | yes | `UNCOATED` | — |
| 3 | Enable on this site (Zandbak) | `sites[]` (`#checkboxPSX1`, value `1`) | checkbox | no | checked | — |
| 4 | Enable on this site (hidden block label) | `sites[]` (`#checkboxPSX2`, value `2`, label "10420-2530 Ineos Project ONE") | checkbox, inside a hidden `div` (display none) | no | unchecked | Shown only inside the hidden block; the block's label is "Enable on this site" |
| 5 | (same hidden block) | `sites[]` (`#checkboxPSX10`, value `10`, label "IPO - Carry Over") | checkbox, inside the same hidden `div` | no | unchecked | Same hidden block as item 4 |
| 6 | (hidden) | `editID` | hidden | — | `15` | Set from the row's `data-id` in the response |
| 7 | (hidden) | `secureCode` (`#bookIdEditCoatingSecure`) | hidden | — | `d7d16084ff535d413f4e9e0df7b8ca37` (value set by the page's script on click) | Computed in the browser on click (see Rules) |

- Form: `method="post"`.
- Body is inside `#contentEditCoating`.
- Note: the capture shows the hidden block (items 4 and 5) with the heading-like label "Enable on this site", but it is `display:none` in the response; the visible checkbox is item 3 (Zandbak).
- Buttons (footer): "Update" (`btn-warning btn-hideEdit`, type submit, name `editCoating`); "Cancel" (`btn default`).

### Delete coating (`#deleteCoating`) — opened by the row trash (`data-id`)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | `deleteID` (`#bookIdDeleteCoating`) | hidden | — | empty in capture; set on click from the row's `data-id` | Set by the page's script on click |
| 2 | (hidden) | `secureCode` (`#bookIdDeleteCoatingSecure`) | hidden | — | empty in capture; set on click | Computed in the browser on click (see Rules) |

- Form: `method="post"`.
- Text in the body: "Are you sure?".
- Buttons (footer): "Delete" (`btn-danger btn-hideDelete`, type submit, name `deleteCoating`); "Cancel" (`btn default`).
- No other input.

## Rules found in the page's JavaScript
- Edit click (`jQuery(document).on("click", ".open-editCoating")`): reads the row's `data-id`; builds the value of `#bookIdEditCoatingSecure` in the browser from a fixed text, the id and a second fixed text (the edit suffix differs from the delete suffix). Then loads the dialog body with a request to `/core/ajax/editCoating.php?id=<id>` and places the response in `#contentEditCoating`. The capture's request carried `action=showroom` (see Requests).
- Delete click (`jQuery(document).on("click", ".open-deleteCoating")`): sets `#bookIdDeleteCoating` (in `.modal-body`) to the row's `data-id`. Builds `#bookIdDeleteCoatingSecure` in the browser the same way as the edit secure code, with a different fixed suffix. No request.
- Page-level visibility (the script block of the page): the buttons with classes `buttonInsert`, `buttonEdit`, `buttonDelete`, `buttonImport` and `buttonPrint` are set to visible; `btn-hideImport` is set to hidden; `btn-hidePrint` is set to visible.
- Submit buttons carry `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete`. The capture's script lines do not show what those classes do on this page.
- Coating-specific validation or computed values in the script: none found in the capture (the only constraints are the HTML `required` attributes on Coating and Abbreviation).
- Other request lines in the same script capture (`getListOfMaterials.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `searchProject.php`, `saveAddCalculationModalState.php`) belong to other screens' controls in the shared script; the capture does not tie them to this page's controls, so they are not listed as rules of this page.

## Requests
- On load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (the page's periodic notification count).
- On pencil click: `GET /core/ajax/editCoating.php?id=<id>&action=showroom` (captured for id 15; status 200).
- Submits: the three forms are `method="post"`; the submit names are `addCoating`, `editCoating`, `deleteCoating`. No submit was made in the capture or in the browser pass.

## Sample data
- Row count: 1 total, 1 shown (`total: 1`, `shown: 1`). Footer: "Showing 1 to 1 of 1 entries".
- Row (all columns):

| Coating | Abbreviation | Enabled on this site | Options | checkbox |
|---|---|---|---|---|
| UNCOATED | UNCOATED | Yes | edit (pencil, `data-id` 15), delete (trash, `data-id` 15) | `ccid_15` (value `s15`) |

- Edit dialog for row 15 (values from the capture): Coating `UNCOATED`; Abbreviation `UNCOATED`; Enable on this site (Zandbak) checked; the other sites are "10420-2530 Ineos Project ONE" (value 2, unchecked) and "IPO - Carry Over" (value 10, unchecked), in the hidden block.
- From the browser-pass notes: the list has this one visible row; no other site-specific data is noted.

## Not in the capture
- Options ▾ menu on this page: from the browser-pass notes the button exists on this page; its menu was not captured here. On the NDT locations page the menu items are "Activate selected" (`#optsActivate`) and "Deactivate selected" (`#optsDeactivate`); both open confirmation dialogs that are in the page's shared dialogs. From the browser-pass notes, these two items are the menu on the other pages; whether this page's menu lists the same items is not shown.
- CSV, Excel and print outputs: their handlers are `href="#"` in the capture; no output was captured.
- Add dialog submission result (Add not pressed in the browser pass).
- Edit dialog body is captured only for id 15. Another row would load its own body on pencil click.
- Delete dialog body: no request in the capture; the body is in the page at load. Delete was not pressed.
- Dialogs `optsActivate` and `optsDeactivate` (from the Options ▾ menu, see above).

Also present in the page, opened from elsewhere (not opened by a control on this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
