# WeldPilot → Material data → Welding wire

Source: `weld__material__welding-wire.txt`, `weld__material__welding-wire__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=welding-wires`.
State of the page for the observing account: normal.

Browser-pass notes used (`reference/montavar/raw/_interactive/I2a-welders-catalogs.md`): they cover the Edit dialog and the controls seen but not captured. Where a fact comes only from those notes it is marked "from the browser-pass notes".

## Page
- Page title as captured: "- WeldPilot®".
- Breadcrumb: none in the capture. The only navigation text in the top bar is the link "Welding wire" (`/weldpilot/index.php?page=welding-wires`).
- Panel title: "Welding wire" (list icon, `glyphicon-list`). The panel heading also holds a "+" button (same action as "Add welding wire").
- Tabs: none in the capture.
- Buttons above the list:
  - "Add welding wire" (top bar, `btn-sm btn-primary btn-block`, icon `glyphicon-plus`, `href="#addWeldingWire"`, `data-toggle="modal"`) → opens the Add dialog `#addWeldingWire`.
  - "+" in the panel heading (same href and handler) → opens `#addWeldingWire`.
  - "Refresh" (top bar, `btn-dark btn-sm`, icon `fa-refresh`, `href="/weldpilot/index.php?page=welding-wires&refresh=ok"`) → plain link that reloads this page.
- The header, sidebar and app switcher are the shared shell; they are not described here.

## List
- Table id `#datatableWires`, DataTables server-side (`serverSide: true`), table role "grid".
- Columns in order (from the DT line and the header row):

| # | Title | Data index | Sortable | Visible | Cell class |
|---|---|---|---|---|---|
| 1 | Index number | 0 | yes | yes | `cert-col-index` |
| 2 | Charge number | 1 | yes | yes | `hide-on-small` |
| 3 | Rod type | 2 | yes | yes | `hide-on-small` |
| 4 | Type of material | 3 | yes | yes | `hide-on-small` |
| 5 | mm | 4 | yes | yes | `hide-on-small` |
| 6 | Certificate-type | 5 | yes | yes | `hide-on-small` |
| 7 | Attest number | 6 | yes | yes | `hide-on-small` |
| 8 | Supplier | 7 | yes | yes | `hide-on-small` |
| 9 | Ctrl. | 8 | yes | yes | `dt-center hide-on-small` |
| 10 | Accp. | 9 | yes | yes | `dt-center hide-on-small` |
| 11 | Options | none | no | yes | `cert-col-options` |
| 12 | select-all checkbox (header, `#wireSelectAll`, title "Select all") | none | no | yes | `cert-col-select dt-center` |

- Hidden columns: none (all `vis: true`). The `hide-on-small` class on columns 2 to 10 is a responsive class; the capture does not show the breakpoint.
- Default sort: column data index 9 ("Accp.") ascending (`order: [[9, "asc"]]`).
- Page length: default 25. Length options: 25, 50, 100, 500. The length select is `#wirePageLength` (aria-label "Show entries").
- Per-column search inputs: none in the capture. There is one global search box `#wireSearch` (placeholder "Search", with a clear button `#wireSearchClear`, aria-label "Clear").
- Filters: select `#wireFilterProject` (class `ft-select2`), options "All projects" (value 0) and "20240101" (value 1). Default "All projects".
- Row options (Options column), in order:
  - Edit: icon button, `btn-xs btn-warning`, title "Edit", icon `glyphicon-pencil`, `href="#editWeldingWire"`, `data-toggle="modal"`. Opens the Edit dialog `#editWeldingWire`.
  - Delete: icon button, `btn-xs btn-danger`, title "Delete", icon `glyphicon-trash`, `href="#deleteWeldingWire"`, `data-toggle="modal"`. Opens the Delete dialog `#deleteWeldingWire`.
- Row select: last column, checkbox class `cert-row-check wire-row-check`, `aria-label="Select all"` (as captured), `data-id` = row id (27 in the sample row).
- Bulk actions: a bar `#wireBulkBar` (hidden in the capture; text "0 selected") with:
  - label "Controlled" and select `#wireBulkControlled`: "Don't change" (empty value), "Yes" (1), "No" (0). Default "Don't change".
  - label "Accepted" and select `#wireBulkAccepted`: same three options, default "Don't change".
  - button "Apply" (`#wireBulkApply`, `btn-xs btn-primary`).
  - The capture does not show what "Apply" submits or which request it sends.
- Export / print buttons (DataTables Buttons, all `btn-xs btn-default`, all `href="#"`):
  - "CSV" (`buttons-csv`)
  - "Excel" (`buttons-excel`)
  - print button (`buttons-print`, icon `fa-print`, no text)
- Info text (`lang.info`): "Showing _START_ to _END_ of _TOTAL_ entries". The capture shows the rendered text "Showing 1 to 1 of 1 entries (filtered from 191 total entries)".
- Empty text (`lang.empty`): "No data available in table".
- Zero-match text (`lang.zero`): "No matching records found".
- Search label (`lang.search`): empty string.
- Server-side table request: `/core/ajax/welding-wires.php?id=1&project=` (the `ajax` url). The HTTP method is not shown in the capture. The XHR list shows these parameters: `id`, `project`, `draw`, `columns[n][data]`, `columns[n][name]`, `columns[n][searchable]`, `columns[n][orderable]`, `columns[n][search][value]`, `columns[n][search][regex]`. The URLs are cut off in the capture, so `order`, `start`, `length` and the global `search` parameters are not visible.

## Dialogs

### Add welding wire (`#addWeldingWire`) — opened by "Add welding wire" (top bar) and the "+" in the panel heading
Header: close button (×), title "Add welding wire". Form `method="post"`, `enctype="multipart/form-data"`. One body, no tabs.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Charge number | chargeNo | text (id `fChargeNo`) | not marked in capture | empty | none |
| 2 | Attest number | attestNo | text | not marked in capture | empty | none |
| 3 | mm | diameter | number, step 0.1 | not marked in capture | empty | none |
| 4 | Rod type | rodType | text, no type attribute (id `weldingWireRodType`) | not marked in capture | empty | none |
| 5 | Type of material | typeMaterial | text, no type attribute | not marked in capture | empty | none |
| 6 | Norm | norm | text | not marked in capture | empty | none |
| 7 | Project | project[] | select, multiple (select2) | not marked in capture | nothing selected | 3 options: "--------" (value 0), "ALL" (value ALL), "20240101" (value 1) |
| 8 | Supplier | supplier | select (select2) | not marked in capture | first option selected | 8 options, value → text: 1 → "PFF BV Klundert" (default), 2 → "VAN LEEUVEN JR BUIZENHANDEL BV NL", 3 → "ELIMP D.O.O. RS", 4 → "HONEX D.O.O. RS", 5 → "Bus Industrial Tools Roosendaal", 6 → "Montavar Metalna Lola D.O.O.", 7 → "Technip Energies", 8 → "Tecnicas Reunidas S.A." |
| 9 | Certificate-type | certificateType | text (id `fCertType`) | not marked in capture | empty | none |
| 10 | Controlled | controlled | checkbox, value 1 | not marked in capture | unchecked | label "Controlled" |
| 11 | Accepted | accepted | checkbox, value 1 | not marked in capture | unchecked | label "Accepted" |
| 12 | Note | note | textarea (rich text editor, Quill; the source textarea is hidden in the capture, class `wsapps-quill-source`) | not marked in capture | empty | Quill toolbar: bold, italic, list (2 buttons), align (4 buttons), clean; plus preview, and a link/formula/video tooltip |
| 13 | File | file | file input (button "Choose file", class `gui-file`) | not marked in capture | nothing selected | file name shown in the unnamed text box next to it, placeholder "Nothing selected" |

Unnamed inputs in this dialog: the file-name display text box (`#uploader4CCA`, placeholder "Nothing selected") and the Quill tooltip input (`type="text"`, `data-formula="e=mc^2"`, `data-link="https://quilljs.com"`, `data-video="Embed URL"`). Both have no name.

Hidden inputs: none. (The Note textarea is hidden by the editor, not by a type attribute.)

Buttons:
- "Add" — `btn-primary btn-hideInsert`, id `addWeldingWireBtn`, name `addWeldingWire`, type submit.
- "Cancel" — `btn default`, closes the dialog.

Text in the dialog that states a rule: none. The capture shows labels only.

### Edit (`#editWeldingWire`) — opened by the Edit (pencil) icon in a row
Header: close button (×), title "Edit". The body is loaded by the page after the click (see Rules). The capture holds the loaded body for the sample row (id 27). Form `method="post"`, `enctype="multipart/form-data"`.

| # | Label | name | Type | Required | Default (sample row 27) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Charge number | chargeNo | text | not marked in capture | "110" | none |
| 2 | Attest number | attestNo | text | not marked in capture | empty | none |
| 3 | mm | diameter | number, step 0.1 | not marked in capture | "225.0" | none |
| 4 | Rod type | rodType | text, no type attribute | not marked in capture | "ad" | none |
| 5 | Type of material | typeMaterial | text, no type attribute | not marked in capture | "sddfs" | none |
| 6 | Norm | norm | text, no type attribute | not marked in capture | "AS" | none |
| 7 | Project | project[] | select, multiple (select2) | not marked in capture | nothing selected | 3 options: "--------" (value 0), "ALL" (value ALL), "20240101" (value 1) |
| 8 | Supplier | supplier | select (select2) | not marked in capture | "PFF BV Klundert" (value 1, selected) | same 8 options as in Add |
| 9 | Certificate-type | certificateType | text (id `fCertType`) | not marked in capture | "3.1" | none |
| 10 | Accepted | accepted | checkbox, value 1 | not marked in capture | checked | label "Accepted" |
| 11 | Controlled | controlled | checkbox, value 1 | not marked in capture | checked | label "Controlled" |
| 12 | Note | note | textarea (rich text editor, Quill, class `wsapps-quill-source`) | not marked in capture | empty | same Quill toolbar as in Add |
| 13 | File | file | file input (button "Choose file") | not marked in capture | nothing selected | unnamed display box, placeholder "Nothing selected" |
| 14 | (hidden) | editID | hidden | — | "27" | — |

Order difference from Add: in Edit the checkbox "Accepted" comes before "Controlled". In Add it is the other way round.

Unnamed inputs: the file-name display box and the Quill tooltip input, as in Add.

Buttons:
- "Update" — `btn-warning btn-hideEdit`, name `editWeldingWire`, type submit.
- "Cancel" — `btn default`, closes the dialog.

Text in the dialog that states a rule: none.

### Delete welding wire (`#deleteWeldingWire`) — opened by the Delete (trash) icon in a row
Header: close button (×), title "Delete welding wire". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | deleteID | hidden (id `bookIdDeleteWeldingWire`) | — | empty in capture | set by the page's script on open (see Rules) |

Body text: "Are you sure?"

Buttons:
- "Delete" — `btn-danger btn-hideDelete`, name `deleteWeldingWire`, type submit, icon `glyphicon-trash`.
- "Cancel" — `btn default`, closes the dialog.

## Rules found in the page's JavaScript
- Edit open (click on `.open-editWeldingWire`): reads the row id (variable `myBookId`; its source line is not in the capture), then loads `/core/ajax/editWeldingWire.php?id=<row id>` into `#contentEditWeldingWire` inside the Edit dialog. After the load, if `window.__wsappsInitAjaxModalFields` is a function, it is called with the modal and that content wrapper. What that function does is not in the capture.
- Delete open (click on `.open-deleteWeldingWire`): sets the value of `.modal-body #bookIdDeleteWeldingWire` to `myBookId`.
- Page variable: `__wsappsDebugPage = "welding-wires"`.
- Table: DataTables server-side with the `ajax` url, page length, length menu, column list and `lang` strings listed in the List section. The table calls `/core/ajax/welding-wires.php` repeatedly by itself (the capture lists draw counters 1 to 21 with no click in between; the browser-pass notes say the same).
- Requests seen in the capture:
  - `/core/ajax/welding-wires.php?id=1&project=` with DataTables parameters (server-side list; repeated).
  - `/core/ajax/editWeldingWire.php?id=<row id>&action=showroom` (GET, status 200, on Edit open; captured as `id=27&action=showroom`).
  - `/core/ajax/ajax-notifications.php?action=count_unread` (header poll, shared with other pages).
  - In the shared script (new lines in this capture): `/core/ajax/getListOfMaterials.php` (params `id`, `timer`, `ajax`), `/core/ajax/searchProject.php?time=…`, `/core/ajax/saveAddCalculationModalState.php` (params `k`, `v`, `timer`, `ajax`), `/core/ajax/searchUnitRates.php` (`id`, `timer`, `ajax`), `/core/ajax/searchTarrifs.php` (`id`, `timer`, `ajax`), `/core/ajax/searchFactors.php` (`id`, `timer`, `ajax`). The capture does not show which control on this page triggers the last five.
- Validations for the Add, Edit or Delete forms: none found in the capture. The only browser-side constraint is the HTML `step="0.1"` on the mm field. The submit handlers for Add, Update and Delete are not in the captured lines.
- Fields shown or hidden on a condition: none found in the capture.
- Values computed in the browser: none found in the capture.

## Sample data
- Project site: id 1 (the browser-pass notes name it "Zandbak").
- Row count shown: 1 row. Info text as displayed: "Showing 1 to 1 of 1 entries (filtered from 191 total entries)". The capture's server response reports `total: 191` and `shown: 1`. The capture does not show why the table reports 1 row of 191, and the search box and the project filter are empty in the captured request.
- Page length: 25.

| Index number | Charge number | Rod type | Type of material | mm | Certificate-type | Attest number | Supplier | Ctrl. | Accp. | Options |
|---|---|---|---|---|---|---|---|---|---|---|
| 0002 | 110 | ad | sddfs | 225.0 | 3.1 | - | PFF BV | check icon | check icon | Edit, Delete |

The row checkbox has `data-id="27"`. The check icons are `fa-check` icons (both set in the sample row).

## Not in the capture
- The Filter dialog `#filterWeldingWires` (title "Filter") is in the page markup, but no control on the captured page points to it, so the capture does not show how it opens. Its markup holds: a hidden input `page` (value "welding-wires"), a select `project` (current "All", options "All" and "20240101"), and buttons "Filter" (submit, name `go`) and "Cancel".
- Rows beyond the single row shown. The total of 191 is given only in the info text and the server response.
- The Edit dialog body for any row other than 27; only row 27 exists in the capture.
- The results of "Apply" in the bulk bar, of the CSV, Excel and print buttons, and of the Add, Update and Delete submits.
- The Quill toolbar's state and the file currently attached to a row: the capture does not show an attached file for row 27.
- From the browser-pass notes: nothing in the Edit dialog was changed; the browser pass did not save, delete or upload anything.
- Also present in the page, opened from elsewhere (not opened by a control on this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal. The handheld menu items (Scan weld, Scan flange QR label, Add punch) are shared too.
