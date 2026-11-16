# WeldPilot → NDT data → PWHT process

Source: `weld__ndt__pwht-process.txt`, `weld__ndt__pwht-process__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/pwht-process/`. The menu group "NDT data" is taken from the browser-pass notes (`_interactive/I2a-welders-catalogs.md`); the capture itself does not show it.
State of the page for the observing account: normal.

## Page
- Page title: "PWHT process - WeldPilot®".
- Breadcrumb: none in the capture. The top bar contains one link "PWHT process" (href `/weldpilot/pwht-process/`).
- Tabs: none.
- Panel heading (icon list, `glyphicon-list`): "PWHT process".
- Buttons above the list:
  - "Add PWHT process" in the top bar (class `buttonInsert btn-sm btn-primary btn-block`, `href="#addPwhtProcess"`, `data-toggle="modal"`, icon plus) → opens dialog `#addPwhtProcess`.
  - "Add PWHT process" in the panel heading (same markup and same target) → opens dialog `#addPwhtProcess`.
  - "CSV" (`dt-button buttons-csv`, `href="#"`) → DataTables CSV export.
  - "Excel" (`dt-button buttons-excel`, `href="#"`) → DataTables Excel export.
  - Print icon (`dt-button buttons-print`, `href="#"`, icon `fa-print`) → DataTables print.
  - "Options ▾": named in the browser-pass notes for this page (from the browser-pass notes). It does not appear in the captured DOM, and its menu items are not recorded for this page.

## List
- Table id: `#datatableWarehouse` (client-side DataTables; `serverSide: false`, `ajax: null`).
- The capture also shows a first table element with the same header and no id, whose DataTables configuration failed (`TypeError: Cannot read properties of undefined (reading 'ajax')`). It has no body rows. The data is in `#datatableWarehouse`.
- Columns in order:
  1. "PWHT process Nr." (data 0)
  2. "Description" (data 1)
  3. "Enabled on this site" (data 2)
  4. "Options" (data 3)
  5. Header checkbox `#checkAll` (data 4, no title text; the column title is an input checkbox)
- Hidden columns: none (all five visible).
- Default sort: `order: [[3, "asc"]]` (column index 3, "Options"); all five columns are marked sortable.
- Page length options: 5, 20, 50, 100, 500. Default page length: 20.
- Per-column search inputs: none in the capture.
- Filters: none in the capture.
- Search: one global search box, `type="search"`, placeholder "Search", with a clear button (`aria-label="Clear"`). Label text in DataTables search: empty.
- Row options (column "Options"), in order:
  1. Pencil (`glyphicon-pencil`, class `buttonEdit open-editPwhtProcess btn btn-xs btn-warning btn-block`, `href="#editPwhtProcess"`, `data-id="1"`, `data-toggle="modal"`) → opens dialog `#editPwhtProcess` for that row.
  2. Trash (`glyphicon-trash`, class `buttonDelete open-deletePwhtProcess btn btn-xs btn-danger btn-block`, `href="#deletePwhtProcess"`, `data-id="1"`, `data-toggle="modal"`) → opens dialog `#deletePwhtProcess` for that row.
- Row checkbox (last column): `name="ccid_1"`, `id="id_1"`, `value="s1"`, class `checkbox11`.
- Bulk actions: the captured page script reads the checked row boxes and writes them into `#activationIds`, `#deactivationIds` and un-hides `#showWPSgroupOptions`. These three elements are not in the captured DOM, so the bulk menu's contents are not shown for this page. The browser-pass notes say the bulk "Options" menu on the NDT locations page holds "Activate selected" and "Deactivate selected"; that is not shown for this page.
- Export / print: CSV, Excel and print buttons, as above.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (rendered as "Showing 1 to 1 of 1 entries").
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Server-side table request: none. The table is filled from the page HTML (`serverSide: false`, `ajax: null`).

## Dialogs

### Add PWHT process (`#addPwhtProcess`) — opened by "Add PWHT process" (top bar and panel heading)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | PWHT process Nr. | process | text (`.form-control`) | yes | empty | none |
| 2 | Description | description | text (`.form-control`) | yes | empty | none |

No hidden inputs. No tabs. Both labels use `for="input00"` in the capture.

Buttons (footer, left to right): "Add" (`btn btn-primary`, name `addPwhtProcess`, type submit); "Cancel" (`btn default`, closes the dialog).

Text rules in the dialog: none. The only rule is the HTML `required` attribute on both fields.

### Edit PWHT process (`#editPwhtProcess`) — opened by the pencil on a row (`data-id` = row id)
The static DOM has an empty body. The body is loaded when the row's pencil is clicked (see Rules). The values below come from the captured response for row 1 (`id=1`).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | PWHT process Nr. | process | text (`.form-control`, `id="exampleInputEmail1"`) | yes | "PWHT" | Filled from the row. Both text inputs carry the same id `exampleInputEmail1` in the capture. |
| 2 | Description | description | text (`.form-control`, `id="exampleInputEmail1"`) | yes | "Procedure 001" | Filled from the row. |
| 3 | (hidden, in form body) | editID | hidden | — | "1" | Row id; sent with the form. |
| 4 | (hidden, in modal footer) | secureCode | hidden (`id="bookIdEditPwhtProcessSecure"`) | — | a form token; value not copied into this note | Set by the pencil click handler from the row. |

Buttons (footer): "Update" (`btn btn-warning btn-hideEdit`, name `editPwhtProcess`, type submit); "Cancel" (`btn default`, closes the dialog).

Text rules in the dialog: none.

### Delete PWHT process (`#deletePwhtProcess`) — opened by the trash icon on a row (`data-id` = row id)
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text "Are you sure?") | — | text | — | — | Shown in the body. |
| 2 | (hidden) | deleteID | hidden (`id="bookIdDeletePwhtProcess"`) | — | empty in the static DOM | Set by the trash click handler to the row id (row 1 → "1"). |
| 3 | (hidden) | secureCode | hidden (`id="bookIdDeletePwhtProcessSecure"`) | — | empty in the static DOM | Set by the trash click handler from the row. Value not copied into this note. |

Buttons (footer): "Delete" (`btn btn-danger btn-hideDelete`, name `deletePwhtProcess`, type submit); "Cancel" (`btn default`, closes the dialog).

Text rules in the dialog: the body text is "Are you sure?".

## Rules found in the page's JavaScript
- **Header and row checkboxes (bulk selection), inline script at `#1fegriixki`:** a function `__wsappsSyncPwhtProcessBulkOptions` collects the values of every checked box in `#datatableWarehouse` except `#checkAll`, writes them comma-joined into `#activationIds` and `#deactivationIds`, and removes the class `is-inactive` from `#showWPSgroupOptions` when at least one box is checked (adds it back when none is checked).
  - A `change` on a row checkbox (`#datatableWarehouse input.checkbox11`) runs that function.
  - A `change` on `#checkAll` sets every row checkbox to the header's state, then runs the function.
- **Edit (pencil) click, `.open-editPwhtProcess`:** sets `#bookIdEditPwhtProcessSecure` to the row's secure value; requests the dialog body from `/core/ajax/editPwhtProcess.php?id=<row id>` (the captured XHR shows the request as `GET /core/ajax/editPwhtProcess.php?id=1&action=showroom`, status 200, 695 bytes; the `action=showroom` parameter is shown in the XHR log, the script excerpt shows only `id`); writes the response HTML into `#contentEditPwhtProcess`.
- **Delete (trash) click, `.open-deletePwhtProcess`:** sets `#bookIdDeletePwhtProcess` (inside `.modal-body`) to the row id and `#bookIdDeletePwhtProcessSecure` to the row's secure value. No request in this handler.
- **Validation:** only the HTML `required` attribute on `process` and `description` (edit and add). No custom validation found in the capture.
- **Button classes `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete`:** present on the Add, Update and Delete buttons. The capture does not show what they do.
- **Requests made by the page while loading:** `GET /core/ajax/ajax-notifications.php?action=count_unread` (shared by all pages, not specific to this one).
- **Form submits (Add, Update, Delete):** the forms have `method="post"`. The capture shows no `action` for them, so their endpoints are not in the capture.
- The large shared script also contains requests for other screens (for example `getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`). They are not part of this page's dialogs.

## Sample data
- Row counts: 1 total, 1 shown ("Showing 1 to 1 of 1 entries"). Page length 20.
- The only row:

| PWHT process Nr. | Description | Enabled on this site | Options | Checkbox (name / value) |
|---|---|---|---|---|
| PWHT | Procedure 001 | No | pencil (edit) and trash (delete) | `ccid_1` / `s1` |

- No key figures, percentages or totals on this page.

## Not in the capture
- Result of Add, Update and Delete (no submit was sent).
- The "Options ▾" menu on this page and its items (named in the browser-pass notes; not in the captured DOM).
- The bulk-action targets `#showWPSgroupOptions`, `#activationIds` and `#deactivationIds` (referenced by the script, not in the DOM).
- The "Enable on this site (Zandbak)" checkbox: the browser-pass notes say the dialogs on pages of this kind carry it. The captured PWHT process dialogs (Add, Edit) do not contain one. The Enabled column shows "No" for row 1.
- Rows beyond the first page: none (only 1 row exists).
- The export outputs (CSV, Excel, print) and the page's response to them.
- The contents of the first table element with the failed DataTables configuration (it shows only the header in the capture).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
