# MTO Pilot → Order / Take in → Material inventory

Source: `mto__order__material-inventory.txt`, `mto__order__material-inventory-all.txt`, `mto__order__material-inventory-import.txt`, `mto__order__material-inventory__log-7662782601.txt`, `mto__order__material-inventory__log-8138268881.txt`, `mto__order__material-inventory__transfer-request.txt`, `mto__order__material-inventory__new-transfer-order.txt`, `mto__order__material-inventory__transfer-type-1.txt`, `mto__order__material-inventory__transfer-type-2.txt`, `mto__order__material-inventory__remove.txt`; storehouse dialogs from `weld__start__dashboard.txt` (and `mto__start__dashboard.txt` for `#transferLagerRequest`) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-inventory` (all materials: `…&show=yes`; import: `/mtopilot/index.php?page=material-inventory-import`).
State of the page for the observing account: normal.

## Page
- Browser title: "Material inventory - MTOPilot®" (all three pages).
- Top bar / breadcrumb: one link "Material inventory" → `index.php?page=material-inventory`. On the import page the breadcrumb has two items: "Material inventory" → `index.php?page=material-inventory`, then "Import" (`href="#"`, active).
- Tabs: none.
- Panel heading: "Materials in inventory" (dark panel).
- Buttons in the top bar, in order:
  1. "New Transfer Order (0)" — id `#btnNewStoFromInventory`, clipboard icon, `btn btn-primary btn-sm`, `href="javascript:void(0)"`. It carries the class `is-inactive` while no row is ticked (the number in brackets is the count of ticked rows, element `#invStoCount`). With one or more ticked rows it opens `#createTransferOrder` pre-filled with the ticked rows (see Dialogs). From the browser-pass notes: it is grey while inactive and turns dark with "(1)" after one row is ticked.
  2. "Add" (plus icon, dropdown, `btn btn-primary btn-sm`) with two entries:
     - "Add material from DB" → `href="#addMaterialIso"`, `data-toggle="modal"` (dialog `#addMaterialIso`).
     - "Import" → link `index.php?page=material-inventory-import` (the import page, section "Import page" below).
- Controls inside the panel, above the table:
  - Instant search: input `#invInstantSearch` (placeholder "Instant search...") with a magnifier icon and a clear button `#invInstantSearchClear` (aria-label "Clear").
  - Filter dropdown button, label "Show: Only with quantity" (on the default URL) or "Show: All materials" (on `&show=yes`); its menu has two links: "Only with quantity" → `index.php?page=material-inventory`, "All materials" → `index.php?page=material-inventory&show=yes`.
  - Export buttons (DataTables HTML5 buttons): "CSV", "Excel" and a print button with only a printer icon (no text). All three have `href="#"`. The page script also lists a "PDF" button (`pdfHtml5`) but the DOM of the capture shows no PDF button.

## List
- Table id `#datatableMaterialInventory`, classes `table table-striped table-bordered table-hover c_b dataTable`.
- Columns in order (title → data index): Material group (0), Article No (1), Material No (2), DIA (3), LBS/SCH (4), Description (5), Quantity (6; the header cell reads "Quantity #": the word "Quantity" has the class `hidden-xs`, followed by a second span visible only on narrow screens), UOM (7), Options (8, not sortable), a select-all checkbox `#checkAll` (9, not sortable). Hidden columns: none.
- Server-side: no (`serverSide:false`, `ajax:null`). The whole list is in the page. Which rows are in it depends on the filter (see below).
- Sorting / paging, two configurations are visible and the capture does not show which one wins:
  - the table configuration read from the page: default order column 7 (UOM) ascending, page length 10, length menu 10 / 25 / 50 / 100;
  - the page's own inline script (`$('#datatableMaterialInventory').DataTable({...})`): `ordering:true`, `order:[[0,'asc']]`, `paging:false`, `lengthChange:false`, `info:true`, `searching:true`, `stateSave:false`, `dom:'Brt<"dt-panelfooter clearfix"ip>'`, `columnDefs` makes columns 8 and 9 not orderable.
  - What the rendered page shows: no length selector and no pager; one footer line "Showing 1 to 7 of 7 entries" (default URL) / "Showing … of 9 entries" (all). The rows appear in this order (default URL): group "-" (2 rows), BOLTS A320-L43, FITTING CS FLG, FITTING 304 REE, FITTING 316 ELB, PIPE CS.
- Per-column search inputs: none. The instant search (above) filters all columns.
- Filter: "Show: Only with quantity" (default; rows with quantity 0 are not listed) / "Show: All materials" (`&show=yes`; adds the rows with quantity 0). A page reload with the other URL, not an in-page filter.
- Row options (column "Options"), four stacked block buttons in this order:
  1. List icon (warning/yellow, class `open-showMaterialInventoryLog`, `href="#showMaterialInventoryLog"`, `data-toggle="modal"`, `data-id` = the Material No) → dialog "Material log" (`#showMaterialInventoryLog`), body loaded by request.
  2. QR icon (`fa-qrcode`, default style), title "Print QR label" → link `../core/pdf/material-label.php?materialno=<Material No>`, `target="_blank"` (a PDF in a new tab; not opened in the capture).
  3. Right-arrow icon (dark, class `btn-sto-inv-row`), title "Request transfer to storehouse (Transfer Order)", with `data-materialno`, `data-balance`, `data-description`, `data-uom` → opens `#createTransferOrder` pre-filled (see Dialogs).
  4. Trash icon (red, classes `buttonDelete open-removeMaterialFromInventory`, `href="#removeMaterialFromInventory"`, `data-toggle="modal"`, `data-id` = the inventory row id, not the Material No) → dialog "Remove material from inventory" (`#removeMaterialFromInventory`).
- Row checkbox (last column): `class="inv-bulk-check"`, `name="ccid_<inventory row id>"`, `value` = Material No, with `data-materialno`, `data-balance`, `data-description`, `data-uom`. The header checkbox `#checkAll` ticks / unticks all row checkboxes.
- Bulk action: the only one is the "New Transfer Order (n)" button in the top bar. There is no "Options" menu of bulk actions on this page.
- Export / print: CSV, Excel, print buttons; the page script limits the exported columns to the first eight (Material group … UOM), i.e. no Options and no checkbox column.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries". Empty text: "No data available in table". Text for a search without result: "No matching records found". The search box's own label is empty (placeholder text is "Instant search...").

## Dialogs

### Add material (`#addMaterialIso`) — opened by Top bar → Add → "Add material from DB"
Form: `method="post"`, `enctype="multipart/form-data"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material group | `materialGroup` | select (select2, id `#markMX`) | no | "Choose group" (value 0) | 258 options. First 10: `0` → Choose group; `BOLTS A320-L43`; `BOLTS A320-L7`; `BOLTS B16`; `BOLTS B7`; `BOLTS B7M`; `FITTING 304 BRF`; `FITTING 304 BRFF`; `FITTING 304 BRFN`; `FITTING 304 BRN` (value = text for every group). |
| 2 | Material | `material` | select (select2, id `#seriesMX`) | no | empty (0 options at load) | Filled after a group is chosen: the page requests `/core/ajax/getListOfMaterials.php` with the chosen group (see Rules). The option list is not in this capture. |
| 3 | (no label) | `spool` | hidden | – | `0` | – |
| 4 | (no label) | `type` | hidden | – | `0` | – |
| 5 | Quantity | `quantity` | number | yes | empty | `min="0.01"`, `step="0.01"`. |
Buttons: "Add" (submit, `name="addMaterialInventory"`, primary), "Cancel" (dismiss).

### Material log (`#showMaterialInventoryLog`) — opened by the list icon in a row's Options
- The dialog is empty at load (header "Material log", footer button "Close", primary, dismiss). On click the page requests `GET /core/ajax/showMaterialInventoryLog.php?id=<Material No>&action=showroom` and puts the answer into `#contentShowMaterialInventoryLog`. No input fields.
- Shown content: two headings, left "Material No:<number>", right "Quantity:<current balance>"; then a table with columns "Date", "Action", (an unnamed third column, header "-" in the capture, holds the reference), "User", "Quantity".
- Rows are coloured: green background (`#70ca63`) with a plus icon for receipts, red background (`#e9573f`) with a minus icon for issues. Date format `DD.MM.YYYY. HH:MM`; quantities with two decimals.
- Captured content for 7662782601 (Quantity:2): 
  | Date | Action | ref | User | Quantity |
  |---|---|---|---|---|
  | 21.03.2024. 13:45 | Received from PFF BV | Ord. No. 00001 | Administrator | + 3.00 |
  | 04.07.2024. 10:14 | Sent to storehouse AP LFF | (empty) | person A | − 1.00 |
  | 04.07.2024. 10:23 | Received from PFF BV | Ord. No. 00001 | person A | + 1.00 |
  | 13.09.2024. 08:40 | Sent to storehouse AP LFF | (empty) | person A | − 1.00 |
- Captured content for 8138268881 (Quantity:0):
  | Date | Action | ref | User | Quantity |
  |---|---|---|---|---|
  | 06.11.2025. 07:42 | Received from PFF BV | Ord. No. 00007 | Administrator | + 10.00 |
  | 06.11.2025. 07:42 | Received from PFF BV | Ord. No. 00007 | Administrator | + 10.00 |
  | 06.11.2025. 07:43 | Received from PFF BV | Ord. No. 00007 | Administrator | + (−10.00) (green row, plus icon, value shown as "-10.00") |
  | 06.11.2025. 07:44 | Isometric execution 00022 | Pick List 00001 | (empty) | − 10.00 |

### Remove material from inventory (`#removeMaterialFromInventory`) — opened by the trash icon in a row's Options
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | `deleteID` (id `#bookIdRemoveMaterialFromInventory`) | hidden | – | empty at load; set by the click to the row's `data-id` (inventory row id; captured value "10" for Material No 7662782601) | filled by `.open-removeMaterialFromInventory` handler |
| 2 | Quantity | `quantity` | number | yes | empty | `min="0"`, `step="0.01"` |
| 3 | Comment | `comment` | text | yes | empty | (`min="0"` is written on the input but has no effect on text) |
Buttons: "Remove" (submit, `name="removeMaterialFromInventory"`, red), "Cancel". The captured pass cancelled it.

### New Transfer Order (`#createTransferOrder`) — opened by the right-arrow button of a row, and by the top-bar button "New Transfer Order (n)" when rows are ticked
Same dialog as in "Storehouse dialogs" below, but on this page it is switched to the "inventory" context (the dialog gets the class `sto-from-inventory`). Differences seen in the captures of this page (`…__transfer-request`, `…__new-transfer-order`, `…__transfer-type-1`, `…__transfer-type-2`):
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type | `sto_type` (id `#stoType`) | select (select2) | yes | "Inventory - Project" (value 5) | 2 options only on this page: `5` → Inventory - Project (selected); `1` → Inventory - Storehouse. |
| 2 | Priority | `sto_priority` (`#stoPriority`) | select (select2) | no | "Normal" | 2 options: `normal` → Normal (selected); `urgent` → Urgent. |
| 3 | From storehouse | `sto_from_lager` (`#stoFromLager`, in `#stoFromLagerGroup`) | select (select2, clearable) | no | "- Select -" (0) | Hidden in both types of this page. 6 options: `0` → - Select - ; `1` → AP LFF; `2`, `3`, `4`, `5` → each shown as "MAGACIN BELGIJA". |
| 4 | To project site | `sto_to_projectsite` (`#stoToProject`, in `#stoToProjectGroup`) | select (select2, clearable) | no | "- Select -" (0) | Shown when Type = 5, hidden when Type = 1. 4 options: `0` → - Select - ; `2` → 10420-2530 Ineos Project ONE; `10` → IPO - Carry Over; `1` → Zandbak. |
| 5 | To storehouse | `sto_to_lager` (`#stoToLager`, in `#stoToLagerGroup`) | select (select2, clearable) | no | "- Select -" (0) | Shown when Type = 1, hidden when Type = 5. 6 options as in row 3. |
| 6 | Notes (optional) | `sto_notes` | textarea (class `no-tinymce`, 2 rows, placeholder "Notes & actions") | no | empty (cleared on open) | – |
| 7 | (heading "Order items") — Material No | `sto_items[0][materialno]` | text, placeholder "Material No" | yes | the row's Material No (captured "7662782601") | read-only; one such group per ticked row, index 0, 1, 2 … |
| 8 | Description | `sto_items[0][description]` | text, placeholder "Description" | no | the row's Description (captured "FLG PIPE WN A105 CL150 30 DN250") | editable |
| 9 | Qty | `sto_items[0][quantity]` | number, placeholder "Qty" | yes | the row's balance (captured 2) | `min="0.01"`, `max` = the row's balance, `step="0.01"` |
| 10 | UOM | `sto_items[0][uom]` | text, placeholder "UOM" | no | the row's UOM (captured "EA") | editable |
Also in each order-item line: a red trash button `.sto-remove-row` (removes the line; the script keeps at least one line), and a line for certificates (`.sto-certs-row`) that is filled after the dialog opens (checkboxes `sto_items[n][cert_ids][]`, one per certificate, all ticked; empty in the capture because the answer was `{"certs":[]}`).
Buttons: "New Transfer Order" (submit, `name="createStorehouseOrder"`, clipboard icon, primary), "Cancel". Not submitted in the capture.
Behaviour: opened from the row arrow, the dialog has exactly one order-item line and Type 5; opened from the top-bar button, one line per ticked row (all read-only Material No), Type 5. Priority is reset to Normal, the three selects of storehouses / project site to "- Select -" (0) and the notes to empty on every open.

### Transfer from inventory to storehouse (`#transferFromInventoryToLager`) — no control seen
- Dialog in the page with header "Transfer from inventory to storehouse", footer "Close" and no body at load. A handler `.open-transferFromInventoryToLager` loads its body from `/core/ajax/transferFromInventoryToLager.php?id=<id>` into `#contentTransferFromInventoryToLager`. No control with that class exists in the captured list (the row buttons are the four described above), so nothing opens it on this page as captured. The handler's behaviour is in "Rules".

### Import page (`page=material-inventory-import`)
Not a dialog; a page opened by Add → "Import".
- Panel heading: "Import". Top bar: breadcrumb (see Page) and a button "Cancel" → `index.php?page=material-inventory`.
- Info alert (paraphrased): the Excel columns match the inventory import and are MaterialGroup, ArticleNo, MaterialNo, Diameter, LBS, Description, UOM, Quantity, ReceivedFrom; the template is prefilled with materials of this site's library; only rows where Quantity is filled are added (to the free pool); rows with empty Quantity are skipped; ReceivedFrom is optional and must equal the name (or id) of a Material supplier; the materials must already exist in the material database.
- "Templates:" with a link "Download Excel template" → `/core/export/templates/material_inventory_import_template_xlsx.php`.
- Form `#invImportUploadForm`, `enctype="multipart/form-data"`:
  | # | Label | name | Type | Required | Default | Options / depends on |
  |---|---|---|---|---|---|---|
  | 1 | Excel bestand (.xlsx) | `file` | file, `accept=".xlsx"` | yes | none | – |
  Button "Upload" (primary, submit).
- Hidden until an upload has been previewed: alert `#invImportStatus` (warning), button "Commit import" `#invImportCommitBtn` (green), table `#invImportTable` (striped, bordered; head row `#invImportHeadRow`, summary line `#invImportSummary`).
- No other dialogs belong to the import page.

## Storehouse dialogs
These nine dialogs are written once in `weld__start__dashboard.txt` and are identical on every MTO / Weld page (`SAME-AS`). They are also used by the Storehouses page. Of the nine, only `#createTransferOrder` is opened by a control of the Material inventory page. The captures contain no control that opens the other eight (they belong to the Storehouses screens, which are not part of this page's captures); the JavaScript that fills and shows them (class names of the buttons that open them) is described under each heading, "from the page script". Whether a control of the Material inventory page opens each is stated at the start of each entry.

### Transfer material from storehouse to project (`#transferFromLagerToProject`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-transfer-from-lager` or `open-transferFromLagerToProject` carrying `data-lager`, `data-materialno`, `data-balance`, `data-description`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (text line "Material:" and "Available:" with spans `#ltp_materialno`, `#ltp_balance`, `#ltp_desc`) | – | text only | – | filled on open | – |
| 2 | Quantity | `materials[0][quantity]` (`#ltp_quantity`) | number | yes | empty | `min="0.01"`, `step="0.01"`, `max` set on open to the available balance |
| 3 | Destination project site | `to_projectsite` (`#ltpProjectSite`) | select (select2, no clearing, placeholder "Select project site...") | yes | "10420-2530 Ineos Project ONE" (value 2) | 3 options: `2` → 10420-2530 Ineos Project ONE (selected); `10` → IPO - Carry Over; `1` → Zandbak |
| 4 | "Certificates to transfer (will be copied to destination project):" | `materials[0][cert_ids][]` | checkboxes (created on open, all ticked) | no | container `#ltp_certs_container` shows "Select a material first" at load, then "Loading certificates...", then one checkbox per certificate, or "No certificates found for this material", or "Error loading certificates" | filled by a request, see Rules |
| 5 | (no label) | `from_lager` (`#ltp_lager`) | hidden | – | set on open to the storehouse id | – |
| 6 | (no label) | `materials[0][materialno]` (`#ltp_materialno_hidden`) | hidden | – | set on open to the Material No | – |
Buttons: "Transfer" (submit, `name="transferFromLagerToProject"`, exchange icon, primary), "Cancel".
Rule in script: on submit, if the quantity is above the maximum (and the maximum > 0) the submit is stopped and the toast "Quantity exceeds available balance (<max>)" is shown.

### Bulk transfer materials to project (`#bulkTransferFromLagerToProject`)
Opened by a Material inventory control: no. From the page script: the buttons `#btnBulkTransferLager` / `#btnBulkTransferDetail` (counters `#bulkTransferCount`, `#bulkTransferDetailCount`) exist in the script; in the captured script of this page those two buttons open `#createTransferOrder` (type "Storehouse → Project"), not this dialog; the code that would fill `#bulkMaterialsList` is only a function `_renderBulkMaterials` that is defined and is not called in the captured lines.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Destination project site | `bulk_to_projectsite` (`#bulkToProjectSite`) | select | yes | "10420-2530 Ineos Project ONE" (2) | 3 options: `2` → 10420-2530 Ineos Project ONE (selected); `10` → IPO - Carry Over; `1` → Zandbak |
| 2 | "Selected materials:" | container `#bulkMaterialsList` | text "No materials selected" | – | – | `_renderBulkMaterials` writes into it, per material: a panel with the Material No, description, a storehouse label, "Available: <n>", hidden `bulk_materials[i][materialno]`, hidden `bulk_materials[i][lager]`, number `bulk_materials[i][quantity]` (label "Quantity", `step="0.01"`, `min="0.01"`, `max` = balance, required, default = balance), and certificate checkboxes `bulk_materials[i][cert_ids][]` (all ticked, or "No certificates") |
Buttons: "Transfer all" (submit, `name="bulkTransferFromLagerToProject"`, exchange icon, default style), "Cancel".

### Move to other storehouse (`#moveLagerToLager`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-move-lager` with `data-lager`, `data-materialno`, `data-balance`, `data-lagername`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Lines "Material:", "From:", "Available:" | – | text (spans `#ml2l_materialno`, `#ml2l_from_name`, `#ml2l_balance`) | – | set on open | – |
| 2 | Quantity | `quantity` (`#ml2l_qty`) | number | yes | empty | `min="0.01"`, `step=".01"`, `max` = available balance |
| 3 | Move all | (none; id `#ml2l_all`) | checkbox | no | unticked | ticking it puts the maximum in Quantity and makes it read-only; unticking clears it and makes it editable |
| 4 | Destination storehouse | `to_lager` (`#ml2l_toLager`) | select | yes | first option that is not the source storehouse ("AP LFF" in the capture) | 5 options: `1` → AP LFF (selected); `2`, `3`, `4`, `5` → each "MAGACIN BELGIJA". The option equal to the source storehouse is hidden and disabled on open. |
| 5 | (no label) | `from_lager` (`#ml2l_fromLager`) | hidden | – | source storehouse id | – |
| 6 | (no label) | `materialno` (`#ml2l_materialno_hidden`) | hidden | – | Material No | – |
Buttons: "Move" (submit, `name="moveToOtherLager"`, truck icon, primary), "Cancel". Script rule: quantity above the maximum on submit → stopped with the toast "Quantity exceeds available balance (<max>)".

### Return to inventory (`#returnFromLager`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-return-to-inv` with `data-lager`, `data-materialno`, `data-balance`, `data-lagername`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Lines "Material:", "Storehouse:", "Available:" | – | text (spans `#rfl_materialno`, `#rfl_lager_name`, `#rfl_balance`) | – | set on open | – |
| 2 | Quantity to return | `quantity` (`#rfl_qty`) | number | yes | empty | `min="0.01"`, `step=".01"`, `max` = balance |
| 3 | Return all | (none; `#rfl_all`) | checkbox | no | unticked | same behaviour as "Move all" |
| 4 | (no label) | `from_lager` (`#rfl_fromLager`) | hidden | – | storehouse id | – |
| 5 | (no label) | `materialno` (`#rfl_materialno_hidden`) | hidden | – | Material No | – |
Buttons: "Return" (submit, `name="returnFromLagerToInventory"`, undo icon, warning colour), "Cancel".

### Correction (`#correctLagerEntry`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-correct-lager` with `data-lager`, `data-materialno`, `data-balance`, `data-lagername`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Lines "Material:", "Storehouse:", "Available:" | – | text (`#cle_materialno`, `#cle_lager_name`, `#cle_balance`) | – | set on open | – |
| 2 | Quantity to remove | `quantity` (`#cle_qty`) | number | yes | empty | `min="0.01"`, `step=".01"`, `max` = balance |
| 3 | Reason | `reason` | text, placeholder "Reason for correction" | yes | empty | – |
| 4 | (no label) | `from_lager` (`#cle_fromLager`) | hidden | – | storehouse id | – |
| 5 | (no label) | `materialno` (`#cle_materialno_hidden`) | hidden | – | Material No | – |
Buttons: "Apply correction" (submit, `name="correctLagerEntry"`, eraser icon, red), "Cancel".

### Edit storehouse item (`#editLagerItem`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-edit-lager-item` with `data-materialno`, `data-lager`, `data-group`, `data-article`, `data-description`, `data-dia`, `data-lbs`, `data-uom`, `data-used`, `data-charges` (JSON list).
Form `method="post"`, `enctype="multipart/form-data"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | "Material No:" line | – | text (`#eli_materialno`) | – | Material No | a note says the number stays unchanged because it is the key for inventory, orders, certificates and transactions |
| 2 | Material group | `materialgroup` (`#eli_group`) | text, `maxlength="100"` | no | `data-group` | – |
| 3 | Article No | `articleno` (`#eli_article`) | text, `maxlength="100"` | no | `data-article` | – |
| 4 | UOM | `uom` (`#eli_uom`) | select | no | value of `data-uom`, else "—" (0) | 21 options: `0` → —; `19` → -; `2` → BX; `8` → DR; `1` → EA; `15` → EUR; `13` → H; `7` → KG; `10` → KIT; `5` → L; `3` → M; `12` → M2; `18` → MTR; `14` → P; `6` → PAA; `9` → PAC; `20` → PC; `21` → pcs; `4` → SET; `17` → STK; `11` → TON |
| 5 | Description | `description` (`#eli_description`) | text, `maxlength="2000"` | no | `data-description` | – |
| 6 | DIA | `dia` (`#eli_dia`) | text, `maxlength="20"` | no | `data-dia` | – |
| 7 | LBS/SCH | `lbs` (`#eli_lbs`) | text, `maxlength="20"` | no | `data-lbs` | – |
| 8 | Reason | `reason_code` (`#eli_reason`) | select | yes | "Import error" | 3 options: `IMPORT_ERROR` → Import error (selected); `NAME` → Name correction; `OTHER` → Other |
| 9 | Explanation | `reason_text` (`#eli_reason_text`) | text, `maxlength="500"` | required by script when Reason = Other | empty | see Rules |
| 10 | Certificate PDF (label), with a help text (paraphrased: the PDF is stored on the charge, it is not read even when the AI Assistant is on; certificate type and attest number stay empty until filled on the certifications list) | `cert_charge` (`#eli_cert_charge`) | select | no | empty | 0 options in the capture; filled on open from `data-charges`; shown and enabled when the item has charges, otherwise hidden and disabled |
| 11 | (placeholder "Charge number") | `cert_charge_new` (`#eli_cert_charge_new`) | text, `maxlength="255"` | no | empty | shown when the item has no charge (then the select above is hidden), disabled otherwise |
| 12 | (no label) | `certificate` (`#eli_certificate`) | file, `accept="application/pdf,.pdf"` | no | none | – |
| 13 | (no label) | `lager_id` (`#eli_lager`) | hidden | – | `data-lager` | – |
| 14 | (no label) | `materialno` (`#eli_materialno_hidden`) | hidden | – | Material No | – |
Also: a warning alert `#eli_used` (hidden by default), shown when `data-used` = 1, text in own words: the number is used elsewhere; those records keep their names; only this storehouse line is corrected.
Buttons: "Save" (submit, `name="editLagerMaterial"`, save icon, primary), "Cancel".

### Adjust quantity (`#adjustLagerQuantity`)
Opened by a Material inventory control: no. From the page script: a button with class `btn-adjust-lager-qty` with `data-materialno`, `data-lager`, `data-balance`, `data-reserved`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Lines "Material No:", "Current quantity:", "Reserved on open orders:" | – | text (`#alq_materialno`, `#alq_balance`, `#alq_reserved`; the last line `#alq_reserved_row` is shown only when reserved > 0) | – | set on open | – |
| 2 | New quantity | `quantity` (`#alq_qty`) | number | yes | the current balance | `min="0"` in the markup; set on open to the reserved quantity (so the new quantity cannot go below what is reserved); `step="0.01"` |
| 3 | Reason | `reason_code` | select | yes | "Loss" | 5 options: `LOSS` → Loss (selected); `DAMAGE` → Damage; `FOUND` → Found; `COUNT` → Count correction; `OTHER` → Other |
| 4 | Explanation | `reason_text` | text, `maxlength="500"` | no | empty | – |
| 5 | (no label) | `lager_id` (`#alq_lager`) | hidden | – | `data-lager` | – |
| 6 | (no label) | `materialno` (`#alq_materialno_hidden`) | hidden | – | Material No | – |
Buttons: "Save" (submit, `name="adjustLagerQuantity"`, save icon, primary), "Cancel".

### Remove material (`#removeLagerItem`)
Opened by a Material inventory control: no (the Material inventory page has its own, different dialog "Remove material from inventory", `#removeMaterialFromInventory`). From the page script: a button with class `btn-remove-lager-item` with `data-materialno`, `data-lager`.
Form `method="post"`.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | "Material No:" line, then a help text (paraphrased: the line disappears from this storehouse; the number, certificates and earlier movements stay in the history; an open transfer order blocks removal) | – | text (`#rli_materialno`) | – | set on open | – |
| 2 | Reason | `reason_code` | select | yes | "Imported by mistake" | 3 options: `WRONG_IMPORT` → Imported by mistake (selected); `NO_LONGER_HELD` → No longer held; `OTHER` → Other |
| 3 | Explanation | `reason_text` | text, `maxlength="500"` | no | empty | – |
| 4 | (no label) | `lager_id` (`#rli_lager`) | hidden | – | `data-lager` | – |
| 5 | (no label) | `materialno` (`#rli_materialno_hidden`) | hidden | – | Material No | – |
Buttons: "Remove material" (submit, `name="removeLagerMaterial"`, trash icon, red), "Cancel".

### New Transfer Order (`#createTransferOrder`) — general (storehouse) form
Opened by a Material inventory control: yes, in its "inventory" context (two Type options; full description under Dialogs above). The general form as written in the dashboard capture:
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type | `sto_type` (`#stoType`) | select | yes | "Inventory - Project" (5) | 5 options: `5` → Inventory - Project (selected); `1` → Inventory - Storehouse; `2` → Storehouse → Project; `3` → Storehouse → Storehouse; `4` → Return → Inventory. In the inventory context only 5 and 1 remain; in the storehouse context (labels from the store context) the options for 2, 3, 4 remain, per the script's `_setStoTypeContext`. |
| 2 | Priority | `sto_priority` (`#stoPriority`) | select | no | "Normal" | `normal` → Normal (selected); `urgent` → Urgent |
| 3 | From storehouse | `sto_from_lager` (`#stoFromLager`) | select | no | "- Select -" | hidden by default; 6 options (0 → - Select - ; 1 → AP LFF; 2–5 → MAGACIN BELGIJA) |
| 4 | To project site | `sto_to_projectsite` (`#stoToProject`) | select | no | "- Select -" | visible by default; 4 options (0 → - Select - ; 2 → 10420-2530 Ineos Project ONE; 10 → IPO - Carry Over; 1 → Zandbak) |
| 5 | To storehouse | `sto_to_lager` (`#stoToLager`) | select | no | "- Select -" | hidden by default; 6 options as row 3 |
| 6 | Notes (optional) | `sto_notes` | textarea | no | empty | placeholder "Notes & actions" |
| 7 | Material No | `sto_items[0][materialno]` | text | yes | empty (general form) | – |
| 8 | Description | `sto_items[0][description]` | text | no | empty | – |
| 9 | Qty | `sto_items[0][quantity]` | number | yes | empty | `min="0.01"`, `step="0.01"` |
| 10 | UOM | `sto_items[0][uom]` | text | no | empty | – |
Buttons: "New Transfer Order" (submit, `name="createStorehouseOrder"`), "Cancel"; trash button `.sto-remove-row` per line. Script rule on type: Type 1 → show "To storehouse"; Type 5 → show "To project site"; Type 2 → show "To project site" (and "From storehouse" unless in the inventory context or the lines already have a storehouse); Type 3 → show "To storehouse" (and "From storehouse" under the same condition); Type 4 → show only "From storehouse" (unless lines already have a storehouse). Script rule on submit: any number input with a `max` where the value exceeds `max` stops the submit with the toast "Quantity exceeds available balance". The selects use select2 with `dropdownParent` the dialog.

## Rules found in the page's JavaScript
Inline script of this page (hash `m9yhx1x1q5`, written in full in the capture):
- `updateInventorySelection()` — runs on every click in a checkbox inside `.c_b` (the table) and on `#checkAll`. It collects the `value` of every ticked `.inv-bulk-check` (the Material Nos), writes the list into the hidden fields `#t2lager` and `#sids` (the field `#t2lager` is `selectedIDS` of the dialog `#transferLagerRequest`; neither field belongs to a dialog that this page opens), shows the count in `#invStoCount` and removes (count > 0) or adds (count = 0) the class `is-inactive` on `#btnNewStoFromInventory`.
- `#checkAll` click — sets all row checkboxes (inside `.c_b`, except itself) to the state of the header checkbox, then updates the selection.
- DataTable set-up: buttons PDF / CSV / Excel / print, export of columns 0–7 only; columns 8 and 9 not orderable; export buttons are moved (up to 50 tries, every 100 ms) into `.mi-filter-toolbar .ft-filters` when that element exists.
- Instant search: on `keyup`/`input` of `#invInstantSearch` the table is searched with the typed text and redrawn, and the class `has-value` is toggled on the search label when the trimmed text is not empty; click on `#invInstantSearchClear` empties the field, triggers the search and gives it focus.
- `$('#laydownTransportID').hide()` runs at load (an element not present in the page).
- Large shared script of the page (only lines new to this capture are listed):
  - `.open-showMaterialInventoryLog` click → `GET /core/ajax/showMaterialInventoryLog.php?id=<data-id>` (the request seen has `&action=showroom`), response HTML put in `#contentShowMaterialInventoryLog`.
  - `.open-transferFromInventoryToLager` click → `GET /core/ajax/transferFromInventoryToLager.php?id=<id>` into `#contentTransferFromInventoryToLager`; then, in that content: checkbox `#transferAllCheckbox` ticked → `#transferQtyInput` is set to its `data-max-available` and made read-only, unticked → emptied and editable; on submit of the form in `#transferFromInventoryToLager`: a value that is not a number or ≤ 0 → toast "Quantity must be greater than 0"; a value above the maximum → toast "Quantity (<value>) exceeds available stock (<max>)" (both stop the submit; the submit stop itself is in lines not repeated in the capture).
  - `.open-removeMaterialFromInventory` click → writes the row's `data-id` into `#bookIdRemoveMaterialFromInventory`.
  - `$.getJSON("/core/ajax/getListOfMaterials.php", {id: <chosen material group>, timer, ajax:'true'})` → fills the "Material" select `#seriesMX` of `#addMaterialIso` (the answer's shape is not in this capture).
  - Other requests defined in the same script but not tied to this page's controls: `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`.
- Storehouse dialog script (from `weld__start__dashboard.txt`, runs on this page too):
  - `.btn-sto-inv-row` click (row arrow) → sets the dialog to the inventory context, replaces the order items with one read-only line from the button's `data-materialno`, `data-description`, `data-balance` (as quantity and as `max`), `data-uom`; Type = 5; Priority = normal; the three selects = 0; notes emptied; shows the dialog.
  - `#btnNewStoFromInventory` click → returns at once when it has the class `is-inactive`; otherwise builds one read-only line per ticked `.inv-bulk-check` (materialno, balance, description, uom) and opens the dialog as above. (A branch for "nothing ticked" that would open an empty line exists but cannot be reached while the button is inactive.)
  - `_setStoTypeContext('inventory')` → keeps only the Type options marked for the inventory context (5 and 1), uses their inventory labels and gives the dialog the class `sto-from-inventory`.
  - On `shown.bs.modal` of the dialog: select2 is attached to the five selects; `_loadStoCerts()` runs for every pre-filled line: `POST /core/ajax/ajax-search-storehouse-materials.php` with `action=get_certs`, `lager`, `materialno`, `source` (`inventory` in this context, otherwise `storehouse`); in the inventory context it also runs when the lager is 0. Answer `{"certs":[…]}`, each cert with `id`, `chargeNo`, `indexNo`, `hasFile`; one ticked checkbox `sto_items[<idx>][cert_ids][]` per certificate (label with charge number, `#` index number, a PDF icon if a file exists). The captured answer was `{"certs":[]}`.
  - `#stoType` change → shows/hides the three groups as listed in the New Transfer Order section; an empty value falls back to 5 (inventory context) or 2.
  - `#stoFromLager` change → lines without their own storehouse take its value, certificates are reloaded.
  - `.sto-remove-row` → removes the line only when more than one line remains.
  - `#createStoForm` submit → quantities above `max` stop the submit with the toast "Quantity exceeds available balance".
  - Hidden input generated per line when a storehouse is known: `sto_items[<idx>][from_lager]` (not present in the inventory context, where the lager is 0).
  - Storehouse dialog handlers (see the entries above): `.btn-transfer-from-lager`/`.open-transferFromLagerToProject` (certificate request `get_certs` with `lager`, `materialno`), `.btn-move-lager`, `.btn-return-to-inv`, `.btn-correct-lager`, `.btn-edit-lager-item`, `.btn-adjust-lager-qty`, `.btn-remove-lager-item`; submit checks for `#transferFromLagerToProject` and `#moveLagerToLager` (quantity ≤ available); on `#editLagerItem` submit, Reason = OTHER with an empty Explanation shows the toast "Explanation" (its submit stop is in lines not repeated in the capture).
  - Audit trail / certificate views of storehouses (`.open-storehouseAuditTrail` → `GET /core/ajax/ajax-storehouse-audit.php` with `lager`, `materialno`; `.btn-view-certs` → `POST …/ajax-search-storehouse-materials.php` with `action=get_certs`, `lager`, `materialno`, `source`, `site`, `charge`) are dialogs `#showStorehouseAuditTrail` and `#viewLagerCerts`, not opened from this page.
- Import page script (hash `1k2yyjrx7qd`; only 62 of its 280 lines are in the capture):
  - base path of the requests: `/core/ajax/materialInventoryImport/` (the file names after it are in the lines that are not captured).
  - Upload: submit of `#invImportUploadForm` sends the file; the answer (`header`, `rows`, `fieldKeys`, plus `totalRows`, `totalErrors`, `totalImportable`, `view`) is drawn by `render()`.
  - Preview columns are ordered as: materialGroup, articleNo, materialNo, dia, lbs, description, uom, quantity, receivedFrom, then any other columns.
  - In the preview, cells of the columns Quantity and ReceivedFrom are text inputs (classes `mi-edit-quantity`, `mi-edit-receivedfrom`) and the Material No cell becomes a text input only for a row with a material error (`mi-edit-materialno`). On `blur`, quantity and received-from edits are sent as a request with `rowId`, `field` (`quantityRaw` or `receivedFromRaw`), `colName`, `value`. Cells with an error get class `mi-error-cell`; an empty-quantity warning is shown as the cell's title text.
  - Summary line text (Dutch, as written): "Rijen: <total> | Errors: <errors> | Importeerbaar nu: <importable>", plus " | Getoond: <n>" when the view is "compact" and not all rows are shown. The table is shown only when there are rows; the "Commit import" button is shown only when the importable count is > 0; after a commit it is hidden again.
  - The commit request and the status texts are in lines not captured.
- Validations with messages on this page itself: none other than the ones above; the Add material dialog relies on `required` and `min`/`step` of the quantity input.

## Sample data
Default URL ("Only with quantity"): "Showing 1 to 7 of 7 entries". All materials (`&show=yes`): 9 entries (the same 7 plus two bolt rows with quantity 0). Columns shown below: Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM, then the inventory row id (the `data-id` of the trash button / the `ccid_` number). "-" is the value displayed for an empty cell.

| Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Row id |
|---|---|---|---|---|---|---|---|---|
| - | 1 | 1 | - | - | - | 3 | - | 26022 |
| - | - | P235GH | - | - | - | 7 | - | 6 |
| BOLTS A320-L7 | 100458921 | 8138678259 | - | - | BLT/N A320 GR.L7M 8UN 300MM 1 IN | 0 | EA | 26026 (only in "All materials") |
| BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 0 | EA | 26027 (only in "All materials") |
| BOLTS A320-L43 | 100518076 | 8138265581 | - | - | BLT/N A320-L43 CTD 8UN 530MM 2.3/4IN | 2 | EA | 26019 |
| FITTING CS FLG | 100001312 | 7662782601 | - | - | FLG PIPE WN A105 CL150 30 DN250 | 2 | EA | 10 |
| FITTING 304 REE | 100699891 | 7636669711 | - | - | REE BW 304 XS/30 DN600X450 | 8 | EA | 9 |
| FITTING 316 ELB | 100699850 | 7633384771 | - | - | ELB BW 316 45DEG LR 100 DN450 | 13 | EA | 26021 |
| PIPE CS | 100048618 | 7430050581 | - | - | PIPE MET GR.B 80 DN40 | 6 | M | 8 |

The material logs of two rows are in the Material log entry above. The Import page shows no rows (preview hidden). The Transfer Order dialog opened on 7662782601 showed 1 line: Material No 7662782601, Description FLG PIPE WN A105 CL150 30 DN250, Qty 2 (max 2), UOM EA, Type "Inventory - Project", Priority "Normal".

## Not in the capture
- The "Material" options of the Add material dialog for any chosen group (loaded by `getListOfMaterials.php` after the group is picked), and the result of "Add".
- The effect and server answers of the submit buttons "Add", "Remove" and "New Transfer Order" (none was submitted), and of "Upload" / "Commit import" on the import page; the import preview table (hidden before an upload), its status alert, its column headers, and the commit request.
- The Print QR label PDF (`../core/pdf/material-label.php?materialno=…`), the CSV / Excel / print outputs, and a PDF button (the script lists one, the DOM shows none).
- The dialog `#transferFromInventoryToLager` body (loaded by `transferFromInventoryToLager.php?id=…`); no control of the page opens it.
- Transfer Order types 2, 3, 4 (not offered in the inventory context; from the browser-pass notes, the capture slugs `…__transfer-type-3`, `-4`, `-5` were not produced).
- The controls that open the eight storehouse-only dialogs (they live on the Storehouses screens, which this page's captures do not include), and the contents loaded into `#showStorehouseAuditTrail` and `#viewLagerCerts`.
- Rows beyond those shown: the page lists everything in one table, so none are missing for the observed filters.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, deleteAllIso, deleteSelectedIso, pdfMTOReportLanguageList, pdfESTReportLanguageList, returnMaterialByRevision, changeQuantityByRevision, pdfIsoBookMultiple, pdfIsoBookMultipleGroup, pdfIsoBookEst, importMaterialInISO, importIsometrics, deleteMaterialISOimport, deleteMaterialISO, editMaterialISOimport, addReceivedMaterial, addMaterialIsoCustom, setCalculationAsFinished, setCalculationAsNotFinished, setAsCompleted, setAsNotCompleted, setPunch, uploadNDTonMultipleWelds, uploadNDTonMultipleWeldsPre, generateLabelsOnMultipleWelds, generateLabelsOnMultipleWelds2, generateLabelsOnMultipleWeldsProject, generateLabelsOnMultipleWelds2Project, uploadPWHTonMultipleWelds, pdfLISLLanguage, pdfLISLFullLanguage, pdfLISLFullLanguageWQ, pdfLISLFullLanguageWQNEW, pdfLISLFullLanguageGUrev2, pdfLISLFullLanguageGUrev3, pdfLISLFullLanguageA3, pdfNdtRequestLanguage, pdfNdtRequestLanguageAdditional, pdfNdtPreRequestLanguageAdditional, pdfNdtRequestLanguageMass, pdfNdtRequestLanguagePre, pdfNdtRequestLanguagePreMass, pdfPwhtRequestLanguage, pdfNdtRequestLanguageISO, pdfNdtPreRequestLanguageISO, pdfPwhtRequestLanguageISO, addIsometric, editIsometricMass, editIsometricPhase, addRev, addRevItp, addRevItp2, editIsometric, backIsometric, deleteIsometric, editWeld, deleteWeld, deleteSelectedWelds, backWeld, showNDOPre, editCalculation, deleteCalculation, releaseRequestModal, releaseRequestModalField, showCustomHydro, showCustomHydroAgain, hydrotestRequest, transferLagerRequest (title "Transfer to Storehouse"; field `lager` select with 5 storehouses, hidden `selectedIDS` = `#t2lager`, which this page's script fills with the ticked Material Nos, hidden `fileid`, hidden read-only `name` holding a person's name; button "Confirm" `transferFromInventoryToLagerMultiple`; no control on this page opens it), moveToLaydownDashboard, filterReleases, filterSpoolTransport, importHydrotestResultsSingle, showHydrotestResultsSingle, filterSpoolTransportMaterials, importHydrotestResults, filterPendingMaterials, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, addPqr, addFlange, deleteFlange, importFlanges, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, srArchiveScanModal, materialQrScanModal, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, pdfIsoBook, editMaterialISO, showOrderDetails, showOrderAuditTrail, showIsometricAuditTrail, showRev, showRevItp, showRevItp2, showNDO, showWeldNdtArchive, showWeldNdtPreArchive, showWeldPwhtArchive, showPWHT, editServiceRequest, editFlange, docsFlange, showStorehouseAuditTrail, viewLagerCerts.
