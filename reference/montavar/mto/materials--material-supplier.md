# MTO Pilot → Materials → Material supplier

Source: `mto__materials__material-supplier.txt` (page); dialog bodies from `weld__material__material-supplier.txt` (the three dialogs are marked `SAME-AS` there, the add/edit/delete markup is written in full) and `weld__material__material-supplier__edit.txt` (the edit dialog body as the server returned it for row id 1) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/material-supplier/`.
State of the page for the observing account: normal.

No `mto__materials__material-supplier__…` click captures exist. The browser-pass notes (`_interactive/`) have no entry for this page in MTO Pilot; the Material supplier entries in `_interactive/I2a-welders-catalogs.md` concern the WeldPilot page.

## Page
- Browser title: "Material supplier - MTOPilot®".
- Breadcrumb: none. Top bar (`#topbar`) carries the menu link "Material supplier" → `/mtopilot/material-supplier/`.
- Tabs: none.
- Panel heading: icon (list, `glyphicon-list`) + title "Material supplier", followed by a blue button with no text, `glyphicon-plus`, `href="#addMaterialSupplier"`, `data-toggle="modal"` → opens the Add material supplier dialog.
- Buttons above the list:
  - "Add material supplier" (blue, full width, plus icon, `href="#addMaterialSupplier"`, `data-toggle="modal"`) → opens the Add dialog. This button is in the top bar. The capture does not write this top-bar line again (the line-diff omits lines an earlier capture contained); the same line is written in `weld__material__material-supplier.txt` with the same `href`. Recorded here on that basis.
  - Panel-heading "+" button (see above) → opens the Add dialog.
  - "CSV" → DataTables HTML5 CSV export (`href="#"`).
  - "Excel" → DataTables HTML5 Excel export (`href="#"`).
  - Print icon (no text, `fa fa-print`) → DataTables print (`href="#"`).
  - Search box: placeholder "Search", search icon, clear button (aria-label "Clear") → global search of the table.
- No "Options" menu and no other bulk-action button appear in this page's DOM.

## List
- Visible table: `#datatableWarehouse`, classes `table table-striped table-bordered table-hover dataTable no-footer`, `role="grid"`.
- A first table without an id sits above it and holds only a header row (same titles). Its DataTables configuration failed with the text `TypeError: Cannot read properties of undefined (reading 'ajax')`. Nothing in the visible list depends on it.
- Columns in order (header row and `cols` of the DataTables configuration):
  1. Name (`d` 0)
  2. Address (`d` 1)
  3. Email address (`d` 2)
  4. Phone (`d` 3)
  5. Enabled on this site (`d` 4)
  6. Options (`d` 5)
  7. Unnamed checkbox column (`d` 6), header is the checkbox `#checkAll`
- Hidden columns: none (all seven `vis: true`).
- Sortable: all seven columns are marked `sort: true`.
- Default sort: column 5 (Options), ascending (`order: [[5,"asc"]]`). The Options cells of all rows contain the same two icons, so the visible order is the order the rows arrive in (as listed under Sample data).
- Page length: default 20; length options 5 / 20 / 50 / 100 / 500 (`lengthMenu`).
- Per-column search inputs: none. Filters: none.
- Row options (Options cell, in order):
  1. Pencil icon (`glyphicon-pencil`, class `open-editMaterialSupplier`, btn-warning, `href="#editMaterialSupplier"`, `data-id` = row id) → opens the Edit material supplier dialog for that row.
  2. Trash icon (`glyphicon-trash`, class `open-deleteMaterialSupplier`, btn-danger, `href="#deleteMaterialSupplier"`, `data-id` = row id) → opens the Delete material supplier dialog for that row.
- Row checkbox: `name="ccid_<id>"`, `value="s<id>"`, class `checkbox11`. Header checkbox `#checkAll` selects all rows.
- Bulk actions: none shown in this capture beyond the row checkboxes.
- Info text: "Showing 1 to 8 of 8 entries" (`info`: "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table: no (`serverSide: false`, `ajax: null`). No table request URL is in the capture; the list is filled from the page HTML.
- Load request on page open (XHR): `/core/ajax/ajax-notifications.php?action=count_unread` (not part of this table).

Rows as listed (8 of 8; the "Enabled on this site" value is "No" on every row):

| Row id | Name | Address | Email address | Phone | Enabled on this site |
|---|---|---|---|---|---|
| 7 | Technip Energies | - | - | - | No |
| 8 | Tecnicas Reunidas S.A. | - | - | - | No |
| 3 | ELIMP D.O.O. | 13. OKTOBRA , UMKA | [person e-mail, not copied] | - | No |
| 4 | HONEX D.O.O. | Mije Kovacevica 9/3, Beograd | [e-mail A] | - | No |
| 6 | Montavar Metalna Lola D.O.O. | Jugoslovenska 2 | [e-mail B] | - | No |
| 1 | PFF BV | Wielewaalweg 4 | [e-mail C] | [phone C] | No |
| 2 | VAN LEEUVEN JR BUIZENHANDEL BV | Lindtsedijk 120 3336 LE Zwijndrecht | [e-mail D] | [phone D] | No |
| 5 | Bus Industrial Tools | Belder 7 | [e-mail E] | [phone E] | No |

Note on the Address column: for PFF BV the list shows only "Wielewaalweg 4", while the Edit dialog for the same row holds zip "4791 PD" and residence "Klundert". The capture does not show how the column text is built.

## Dialogs

### Add material supplier (`#addMaterialSupplier`) — opened by "Add material supplier" (top bar) and the panel-heading "+"
Form `method="post"`, `enctype="multipart/form-data"`, no `action` in the capture. Header title "Add material supplier".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | empty | none |
| 2 | Address | address | text | no | empty | none |
| 3 | Zip code | zip | text | no | empty | none |
| 4 | Residence | residence | text | no | empty | none |
| 5 | Mailbox number | mailbox | text | no | empty | none |
| 6 | MN-Zip code | mnzip | text | no | empty | none |
| 7 | MN-Residence | mnresidence | text | no | empty | none |
| 8 | Phone | phone | text | no | empty | none |
| 9 | Fax | fax | text | no | empty | none |
| 10 | Email address | email | email | no | empty | none |

No hidden inputs. Ten fields, all in one body block, in the order above.

Buttons: "Add" (`btn-primary`, `btn-hideInsert`, type submit, `name="addMaterialSupplier"`); "Cancel" (`btn default`, closes the dialog).
Text rules in the dialog: only the Name field is marked required. No other rule text appears.

### Edit material supplier (`#editMaterialSupplier`) — opened by the pencil icon in a row (`data-id` = row id)
The dialog is an empty shell in the page. Its body is loaded per row by a GET request to `/core/ajax/editMaterialSupplier.php?id=<row id>` (the request logged in the capture carries `&action=showroom` too) and placed into `#contentEditMaterialSupplier`. Header title "Edit material supplier". The example below is the response for row id 1 (PFF BV); the field set is the same for every row.

| # | Label | name | Type | Required | Default (row 1, PFF BV) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | "PFF BV" | loaded per row |
| 2 | Address | address | text | no | "Wielewaalweg 4" | loaded per row |
| 3 | Zip code | zip | text | no | "4791 PD" | loaded per row |
| 4 | Residence | residence | text | no | "Klundert" | loaded per row |
| 5 | Mailbox number | mailbox | text | no | empty | loaded per row |
| 6 | MN-Zip code | mnzip | text | no | empty | loaded per row |
| 7 | MN-Residence | mnresidence | text | no | empty | loaded per row |
| 8 | Phone | phone | text | no | "[phone, not copied]" | loaded per row |
| 9 | Fax | fax | text | no | empty | loaded per row |
| 10 | Email address | email | email | no | "[e-mail, not copied]" | loaded per row |
| 11 | (none) | editID | hidden | — | "1" (the row id) | set by the response |
| 12 | (none) | secureCode | hidden | — | set by the page script on click (token; value not copied) | `#bookIdEditMaterialSupplierSecure` |

Field 1 has the element id `exampleInputEmail1` (as written in the response). The Fax label is written with a trailing space in the response; the label text is "Fax".

Buttons: "Update" (`btn-warning`, `btn-hideEdit`, type submit, `name="editMaterialSupplier"`); "Cancel" (`btn default`, closes the dialog).
Text rules in the dialog: only the Name field is marked required.
The secure code is set in the browser on each click; see Rules.

### Delete material supplier (`#deleteMaterialSupplier`) — opened by the trash icon in a row (`data-id` = row id)
Header title "Delete material supplier". Body text: "Are you sure?" (in a form `method="post"`, no `action` in the capture).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | deleteID | hidden | — | empty in the page; set to the row id on click | `#bookIdDeleteMaterialSupplier` |
| 2 | (none) | secureCode | hidden | — | empty in the page; set on click (token; value not copied) | `#bookIdDeleteMaterialSupplierSecure` |

Buttons: "Delete" (`btn-danger`, `btn-hideDelete`, glyphicon trash, type submit, `name="deleteMaterialSupplier"`); "Cancel" (`btn default`, closes the dialog).
Text rules: the body states only "Are you sure?". The request the Delete button sends is not in the capture.

Also present in the page, opened from elsewhere (not opened by a control on this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal, and the handheld scan entries "Scan material" / "Scan service request".

## Rules found in the page's JavaScript
- Edit click (`.open-editMaterialSupplier`): reads the row id from the clicked control, sets the hidden `secureCode` of the edit dialog to a fixed prefix + the row id + the suffix "mspE" (the prefix and suffix are in the page script; the literal prefix is not copied here), then GETs `/core/ajax/editMaterialSupplier.php?id=<row id>` and places the returned HTML in `#contentEditMaterialSupplier`.
- Delete click (`.open-deleteMaterialSupplier`): sets the dialog's `deleteID` to the row id and its `secureCode` to the same fixed prefix + row id + the suffix "msp".
- Row selection sync (`__wsappsSyncMaterialSupplierBulkOptions`, bound to clicks and changes on `#datatableWarehouse input.checkbox11`): collects the values of the checked row checkboxes, writes them comma-joined into `#activationIds` and `#deactivationIds`, and removes the class `is-inactive` from `#showWPSgroupOptions` when at least one row is checked, adds it when none is. The elements `#activationIds`, `#deactivationIds` and `#showWPSgroupOptions` are not in this page's DOM capture.
- Dropdown guard: a click on `#showWPSgroupOptions .dropdown-toggle` is stopped while that element has `is-inactive`.
- Check-all (`#checkAll`, click or change): sets every `checkbox11` row checkbox to the same state and runs the sync above.
- Page marker: the shared script sets `__wsappsDebugPage = "material-supplier"`.
- Client-side validation: none in the capture beyond the `required` attribute on the Name fields of the Add and Edit dialogs. No function that validates these forms appears in the lines the capture holds.
- Requests the page makes: on load, `/core/ajax/ajax-notifications.php?action=count_unread` (GET). On Edit click, `/core/ajax/editMaterialSupplier.php?id=<row id>` (GET; the logged request also carries `action=showroom`). The save requests for Add (form button `addMaterialSupplier`), Edit (`editMaterialSupplier`) and Delete (`deleteMaterialSupplier`) are submit buttons of forms with no `action` in the capture; their endpoints are not in the capture.

## Sample data
- Row count: 8 of 8 entries (`Showing 1 to 8 of 8 entries`), page length 20, so all rows on one page.
- Key figures: none on this page apart from the row count and the "Enabled on this site" column, which reads "No" on all 8 rows.
- Rows: see the table in List. Full values:

| Name | Address | Email address | Phone | Enabled on this site | Row id |
|---|---|---|---|---|---|
| Technip Energies | - | - | - | No | 7 |
| Tecnicas Reunidas S.A. | - | - | - | No | 8 |
| ELIMP D.O.O. | 13. OKTOBRA , UMKA | [person e-mail, not copied] | - | No | 3 |
| HONEX D.O.O. | Mije Kovacevica 9/3, Beograd | [e-mail A] | - | No | 4 |
| Montavar Metalna Lola D.O.O. | Jugoslovenska 2 | [e-mail B] | - | No | 6 |
| PFF BV | Wielewaalweg 4 | [e-mail C] | [phone C] | No | 1 |
| VAN LEEUVEN JR BUIZENHANDEL BV | Lindtsedijk 120 3336 LE Zwijndrecht | [e-mail D] | [phone D] | No | 2 |
| Bus Industrial Tools | Belder 7 | [e-mail E] | [phone E] | No | 5 |

The ELIMP row's e-mail address names a person and is not copied here.

## Not in the capture
- The Options menu, bulk "activate / deactivate" controls and their dropdown (`#showWPSgroupOptions`) are not in this page's DOM. The WeldPilot page of the same name has an "Options ▾" menu (see `_interactive/I2a-welders-catalogs.md`); the MTO capture does not show one.
- The Edit dialog body as it appears on this MTO page: the capture holds the response for row 1 from the WeldPilot page (`weld__material__material-supplier__edit.txt`). Not captured on this page: the response for any other row. Control: the pencil icon of each row.
- The Delete request and the save responses of Add / Edit / Delete: not captured. Control: the Add / Update / Delete buttons (not clicked).
- Sidebar (side menu): not written here; it is in the first capture of the MTO Pilot (`mto__start__dashboard`).
- Rows beyond the first page: none (8 of 8 shown).
