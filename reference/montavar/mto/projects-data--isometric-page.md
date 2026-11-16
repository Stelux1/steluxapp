# MTO Pilot → Projects data → an isometric in the MTO view (Materials panel, all dialogs)

Source: `mto__iso__0001.txt`, `mto__iso__0003.txt`, `mto__iso__00022.txt`, `mto__iso__00032.txt`, `mto__iso__0005.txt`, `mto__iso__0007.txt`, `mto__iso__wf-73031.txt`, and the dialog captures `mto__iso__0001__add-from-db.txt`, `…__add-custom.txt`, `…__add-custom-autofill.txt`, `…__edit-material.txt`, `…__options-menu.txt`, `…__quantity-log.txt`, `…__set-type.txt`, `…__status-per-revision.txt`, `…__stock-7662782601.txt`, `…__stock-8138678259.txt`, `mto__iso__00022__set-phase.txt`, `mto__iso__00022__status-card.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=isometrics&id=1&project=1` (the same page for every isometric; only `id` changes: 1, 6, 895, 6191, 6598, 15767, 15424).
State of the page for the observing account: normal.

The header cards (ISO No, ITPS, Compliance, Technical, Progress, Status) are shared with the Weld view and are described in the Weld isometric note. This note covers what the MTO view adds or changes. Where a statement comes from the browser-pass notes (`_interactive/I3-mto.md`) and not from a raw capture, it says "from the browser-pass notes".

## Page

- Browser title: `Iso overview - MTOPilot®`.
- Breadcrumb: not present in the raw DOM capture. From the browser-pass notes (isometric 00022): "Zandbak / 20240101 Template project / Iso / 00022 / Materials", followed by a grey tag "▶ Started".
- Tab / link: the capture's only new top-bar link is `Materials` → `index.php?page=isometrics&project=1&id=1` (the other tabs were captured on earlier pages).
- Top bar buttons (right side), in order, from the capture plus the browser-pass notes:
  - `Options` menu (dark). Entries (capture `…__options-menu`): `Attachments` → dialog `#isoAttachmentsModal`; `Audit trail` (class `open-isometricAuditTrail`, `href="#"`, `data-iso-id="1"`) → dialog `#showIsometricAuditTrail`; `Set phase` → dialog `#editIsometricPhase`. The menu does not change when rows are ticked.
  - `Set type` (`#setCheckedMaterialsType`, icon fa-tags, classes `btn btn-dark btn-sm disabled`) → `#setCheckedMaterialsTypeModal`. Disabled until at least one row checkbox is ticked.
  - `Delete selected` (`#deleteCheckedMaterials`, trash icon, `btn btn-dark btn-sm disabled`, `type="submit"`, empty `data-id` and `data-type`) → `#deleteCheckedMaterialsModal`. Disabled until at least one row checkbox is ticked.
  - `Add` menu (labelled "+ Add" in the browser-pass notes) with exactly two entries: `Add material from DB` → `#addMaterialIso`; `Add custom material` → `#addMaterialIsoCustom`. There is no Import entry in this menu and no Reports menu on this page (from the browser-pass notes; the dialog `#importMaterialInISO` exists in the DOM but no visible control of this page opens it).
- Panel "Materials" (`.panel.panel-dark`, glyph list icon). Controls in its heading, in order:
  1. Button group `MTOPilot®` (warning button, dropdown): `WeldPilot®` → `/weldpilot/index.php?page=isometrics&project=1&id=1`; `ESTPilot®` → `/estpilot/index.php?page=isometrics&project=1&id=1`.
  2. `Print` (icon fa-print, inside a `.buttonPrint` group) → `#pdfMTOReportLanguageList`.
  3. Type filter dropdown, button label `All types` (the label of the active filter). Entries and links (all `index.php?page=isometrics&project=1&id=1` plus `&type=N`): All types (no `type`), Shop `type=1`, Field `2`, Hydrotest field `3`, Support Field `4`, Valves `5`, Bernecker `7`, Support Shop `8`, Support WS `9`, Support FW `10`, Rilco `11`, Shop missing `14`, Revision mat `15`, Shop IYM `16`, Field IYM `17`. (The filter is a page reload with a URL parameter; the table itself is not server-side.)
  4. History button (icon fa-history, class `open-materialStatusByRevision`, `title="Material status per revision"`, `data-id="1"`) → `#materialStatusByRevision`.
  5. Pencil button (class `open-editIsometric`, `data-id="1"`) → `#editIsometric` (header dialog, see "Dialogs opened from the header cards").
- Panel body, top to bottom: the header cards (shared with Weld view), then the Status card, then the materials table.
- What the Status card (`#datatableWarehouse1`, `.wsapps-iso-header-col--status`) shows in the MTO view (capture `…00022__status-card`):
  - `Status` — percentage; on some isometrics followed by a small tooltip text "Breakdown from the ISO progress engine (same source as BBE)." and `Quality NN%`.
  - `Hydrotest completed` — a link with text `No` (`type="button" data-toggle="modal"`; the capture shows no `href` or `data-target`, so it does not name the dialog it opens). Dialogs `#setAsCompleted` ("Set as completed?") and `#setAsNotCompleted` ("Set as not completed?"), both titled "Hydrotest", are in the page (see below).
  - `Material status` — a percentage or the word `Empty`, then a hidden input `iso` (value = the isometric id) and a full-width primary submit button (icon fa-refresh) named `recalculateMaterialStatusForIso`. This row exists in the MTO view only (the Weld view of the same isometric has no such row). The refresh button was not clicked (it recalculates a cached value).
- The Progress card has Shop prefab / Field / Site groups. In the MTO view the tooltips say where the numbers come from: "Ceiling: Shop issued / Shop MTO" for the shop rows, "Budget (MTO)" for the field rows, and, when a row has no budget, "No Shop-typed material on this ISO." (shop rows) or "No MTO budget — add materials with this component code in MTOPilot. (CC 1)" / "(CC 2)" / "(CC 3)" for Pipe (m) / Supports (pcs) / Appendages (pcs). The component codes 1, 2, 3 are the codes set per material in the Edit material dialog. On all seven sampled isometrics every phase shows 0% and every budget/issued value is 0.

## List

Table `#datatableIsoMaterials` (inside `#datatableIsoMaterials_wrapper`), client-side DataTables (`serverSide: false`, `ajax: null`), no export or print buttons in the table.

Columns in order (title in bold in the header):

| # | Title | Visible | Sortable | Content |
|---|---|---|---|---|
| 0 | Group | yes | yes | material group |
| 1 | Mat.no. | yes | yes | material number |
| 2 | DIA | yes | yes | `-` when empty |
| 3 | LBS/SCH | yes | yes | `-` when empty |
| 4 | Description | yes | yes | |
| 5 | Type | yes | yes | one of the 14 material types |
| 6 | Qty. | yes | yes | link (class `open-showQuantityLog`, `data-id` = material line id) → `#showQuantityLog` |
| 7 | UOM | yes | yes | |
| 8 | Ord.? | yes | yes | `Yes` as a link to `index.php?page=material-order-archive&fileid=N` (new tab) with tooltip `Ord. No.: NNNNN`; or plain `No` |
| 9 | Inv. | yes | yes | a truck icon link (class `open-showOrderDetails`, `data-id`) → `#showOrderDetails`; the tooltip text is `Ord. N | Inv. M` for an ordered line and `Need N | Have 0` for a not-ordered line |
| 10 | Picked | yes | yes | number |
| 11 | Options | yes | no | pencil button and trash button, see below |
| 12 | (select-all checkbox `#checkAllMaterials`, title "Select all") | yes | no | one checkbox per row, `name="ccid_<line id>"`, value = line id |

- Default sort: column 10 (Picked), ascending (`order: [[10,"asc"]]`).
- Page length: 25; options 10, 25, 50, 100 ("Show … entries", select named `datatableIsoMaterials_length`).
- Search: one global search box (type `search`, placeholder `Search`, with a clear button, icon fa-times). No per-column search inputs.
- Row options, in order: pencil (class `buttonEdit open-editMaterialISOimport`, `href="#editMaterialISOimport"`, `data-id`) → `#editMaterialISOimport`; trash (class `buttonDelete`). The trash button is rendered `DISABLED` (no link) on every line that is ordered (`Ord.?` = Yes); on a not-ordered line it is a link (class `open-deleteMaterialISOimport`, `href="#deleteMaterialISOimport"`, `data-id`) → `#deleteMaterialISOimport`. Visible examples: isometric 0001 line 8138678259 and isometrics 0003 and 00032 have the active trash; all `Yes` lines have the disabled one.
- Bulk actions: tick row checkboxes, then `Set type` or `Delete selected` in the top bar (not an Options-menu item).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (example "Showing 1 to 9 of 9 entries", "Showing 0 to 0 of 0 entries"); empty text "No data available in table"; no-match text "No matching records found".
- Row count and "shown" in the DataTables config: `total` and `shown` equal the number of lines (9, 2, 1, 3, 0, 0, 0 — see Sample data).
- Truck colours (from the browser-pass notes, isometrics 0001 and 00022): green = ordered and fully in inventory; orange = partly in inventory; red = nothing in inventory or not ordered. The Trash is grey on ordered lines and red on the not-ordered line.

## Dialogs

Dialogs whose body is loaded by a request when opened say so; the body shown is what the capture recorded after the click.

### Add material (`#addMaterialIso`) — opened by Add → Add material from DB
Form `method="post" enctype="multipart/form-data"`. A "Selected" box at the top (`#addMaterialIsoSelectionSummary`) shows chips: "Nothing selected yet" or "Material Group: …", "Material: …", "Type: …".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Quantity | `quantity` | number, `min="0.01"`, `step="0.01"` | yes | empty | |
| 2 | Revision | `rev` (`#revMX`) | select | yes | "Revision 2.00 Studs wijziging" | 2 options: `2` Revision 2.00 Studs wijziging; `1` Revision 1.00 RFC |
| 3 | Type (search box) | none (`.js-ac-search`, placeholder "Search type", `data-panel="#mtoTypePanel"`) | text | no | empty | filters the type button grid |
| 4 | Type | `type` (`#typeMX`) | select (hidden behind a grid of buttons `#mtoTypePanel`, empty text "No types found.") | no | "Shop" (`1`) | 14 options: `1` Shop; `2` Field; `3` Hydrotest field; `4` Support Field; `5` Valves; `7` Bernecker; `8` Support Shop; `9` Support WS; `10` Support FW; `11` Rilco; `14` Shop missing; `15` Revision mat; `16` Shop IYM; `17` Field IYM |
| 5 | Material group (search box) | none (placeholder "Search material group", `data-panel="#mtoMatGroupPanel"`) | text | no | empty | filters the group button grid |
| 6 | Material group | `materialGroup` (`#markMX`) | select (button grid `#mtoMatGroupPanel`, empty text "No material groups found.") | no | "Choose group" (`0`) | 258 options. First 10: `0` Choose group; BOLTS A320-L43; BOLTS A320-L7; BOLTS B16; BOLTS B7; BOLTS B7M; FITTING 304 BRF; FITTING 304 BRFF; FITTING 304 BRFN; FITTING 304 BRN. Option value = option text = the group name |
| 7 | Material (search box) | none (placeholder "Search material", `data-panel="#mtoMaterialPanel"`) | text | no | empty | filters the material button grid |
| 8 | Material | `material` (`#seriesMX`) | select (button grid `#mtoMaterialPanel`, empty text "Choose a material group first.") | no | empty list until a group is chosen | options filled from the request `getListOfMaterials.php` (see JavaScript); each option value is a numeric id, text "<material no> <description>" (example for group BOLTS A320-L43: 39 options, the first is `1` = "8138268881 BLT/N A320-L43 CTD 8UN 1000MM 4IN") |
| 9 | (hidden) | `spool` | hidden | – | `0` | |

Buttons: `Add` (`name="addMaterialISO"`, `type="submit"`, class `btn-hideInsert`), `Cancel` (closes). Rule shown: the Material list depends on the chosen group; before a group is chosen the grid shows the empty text. After a group is chosen (browser-pass notes) the first material is selected automatically.

### Add material (`#addMaterialIsoCustom`) — opened by Add → Add custom material
Same title as the previous dialog. Form `method="post" enctype="multipart/form-data"`; labels point to `for="input00"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material group | `materialGroup` | text | yes | empty | |
| 2 | Article No | `articleNo` | text | no | empty | |
| 3 | Legacy No | `legacyNo` | text | no | empty | |
| 4 | Material No | `materialNo` (`#materialNoIso`) | text | yes | empty | |
| 5 | DIA | `dia` | text | no | empty | |
| 6 | LBS/SCH | `lbs` | text | no | empty | |
| 7 | Type | `type` | select (select2) | no | "Shop" (`1`) | 14 options, same list as above |
| 8 | Price | `price` | text | no | empty | |
| 9 | (hidden) | `spool` | hidden | – | `0` | |
| 10 | Quantity | `quantity` | number, `step="0.01"` (no `min`) | yes | empty | |
| 11 | UOM | `uom` | select (select2) | no | "EA" (`1`) | 20 options: `1` EA; `2` BX; `3` M; `4` SET; `5` L; `6` PAA; `7` KG; `8` DR; `9` PAC; `10` KIT; `11` TON; `12` M2; `13` H; `14` P; `15` EUR; `17` STK; `18` MTR; `19` -; `20` PC; `21` pcs |
| 12 | Revision | `rev` | select (select2) | yes | "Revision 2.00 Studs wijziging" | 2 options: `2` Revision 2.00 Studs wijziging; `1` Revision 1.00 RFC |
| 13 | Charge number | `chargeNo` (`#singleIso`) | select (select2) | no | "-----------------------------" (`0`) | 6 options: `0` -----------------------------; `1` 11111; `5` 1212; `3` 564321; `4` 98784987; `2` ada. Next to it a button `Auto fill` (`#buttonMatIso`, `data-target="#singleIso"`) |
| 14 | Material description | `description` | text | yes | empty | |
| 15 | Also add material to Material DB | `addToDB` (`#checkboxAddCustom`) | checkbox, value `ok` | no | unticked | |

Buttons: `Add` (`name="addMaterialISOCustom"`, submit), `Cancel`. Rule: `Auto fill` only opens the Charge number dropdown and types the Material No into its search box; it makes no request (see JavaScript).

### Set type (`#setCheckedMaterialsTypeModal`) — opened by the top-bar `Set type` button
Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type | `type` (`#setCheckedMaterialsTypeSelect`) | select (select2) | yes | placeholder "Type" (empty value) | 15 options: (empty) Type; `7` Bernecker; `2` Field; `17` Field IYM; `3` Hydrotest field; `15` Revision mat; `11` Rilco; `1` Shop; `16` Shop IYM; `14` Shop missing; `4` Support Field; `10` Support FW; `8` Support Shop; `9` Support WS; `5` Valves (alphabetical, unlike the Add dialogs) |
| 2 | (hidden) | `selectedIDS` (`#setTypeMaterialsList`) | hidden | – | comma-separated ids of the ticked lines (example `2`) | filled by the page script from the ticked checkboxes |

Buttons: `Update` (`name="setSelectedMaterialsType"`, submit, icon fa-tags), `Cancel`.

### Delete selected (`#deleteCheckedMaterialsModal`) — opened by the top-bar `Delete selected` button
Body text: "Are you sure?". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, class `form-control`, read-only) | `selectedIDS` (`#deletedMaterialsList`) | hidden | – | comma-separated ids of the ticked lines | filled by the page script |

Buttons: `Delete` (`name="deleteSelectedMaterials"`, submit, `btn-danger`, trash icon), `Cancel`.

### Remove material from Isometric (`#deleteMaterialISOimport`) — opened by the trash button of a not-ordered line
Body text: "Are you sure?". Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | `deleteID` (`#bookIdDeleteMaterialISOimport`) | hidden | – | empty in the capture | receives the line id (`data-id`) of the clicked trash button |

Buttons: `Delete` (`name="deleteMaterialISOimport"`, submit, `btn-danger`, trash icon; class `btn-hideDelete`), `Cancel`.

### Edit material (`#editMaterialISOimport`) — opened by the pencil of a line
Title "Edit material". The body is loaded by `GET /core/ajax/editMaterialISOimport.php?id=<line id>&action=showroom` and put in `#contentEditMaterialISOimport`. Values below are those of line id 2 (material 7662782601). Form `method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Material group | `materialGroup` (`#exampleInputEmail1`) | text, read-only | yes | "FITTING CS FLG" | |
| 2 | Article No | `articleNo` | text, read-only | no | "100001312" | |
| 3 | Legacy No | `legacyNo` | text, read-only | no | "10033640" | |
| 4 | Material No | `materialNo` (`#materialNo`) | text, read-only | no | "7662782601" | |
| 5 | DIA | `dia` | text, read-only | no | empty | |
| 6 | LBS/SCH | `lbs` | text, read-only | no | empty | |
| 7 | Type | `type` | select (select2) | no | the line's current type ("Shop") | 14 options as in the Add dialog |
| 8 | Component code (ISO progress) (1=pipe, 2=supports, 3=appendages) | `componentCode` | select (select2), `title="Invalid component code. Use 1=pipe, 2=supports, 3=appendages."` | no | "----------" (empty) | 4 options: (empty) ----------; `1` 1; `2` 2; `3` 3 |
| 9 | (hidden) | `spool` | hidden | – | `0` | |
| 10 | Quantity | `quantity` | text, read-only | no | "6" | |
| 11 | UOM | `uom` | select (select2, marked `readonly`) | no | the line's UOM ("EA") | 20 options as in the custom dialog |
| 12 | Material category | `material_category` | select (select2) | no | "----------" (`0`) | 1 option: `0` ----------  (no other categories in this sandbox) |
| 13 | Charge number | `chargeNo` (`#single`) | select (select2) | no | "-----------------------------" (`0`) | 6 options as in the custom dialog; button `Auto fill` (`data-target="#single"`) beside it |
| 14 | Material description | `description` | text, read-only | no | "FLG PIPE WN A105 CL150 30 DN250" | |
| 15 | (hidden) | `editID` | hidden | – | `2` (the line id) | |

Buttons: `Update` (`name="editMaterialISOimport"`, submit, class `btn-hideEdit`), `Cancel`. Rule shown: only Type, Component code, Material category and Charge number are editable; group, numbers, DIA, LBS/SCH, quantity and description are read-only (quantity is changed through the Quantity log dialog).

### Quantity log (`#showQuantityLog`) — opened by the Qty. link of a line
Body loaded by `GET /core/ajax/showQuantityLog.php?id=<line id>&action=showroom` into `#contentShowQuantityLog`. Footer button `Close`. Content (line id 2):
- Table with 4 columns and 2 rows: "Beginning | (empty) | 6.00 | (empty)" and "Now | (empty) | 6.00 | (empty)".
- A grey box with heading "Remove quantity by revision" and a form `method="post"`:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Revision | `rev` | select (select2) | yes | first option "1.00 RFC" | 2 options: `1` 1.00 RFC; `2` 2.00 Studs wijziging |
| 2 | Quantity to remove? | `quantity` | number, `min="0.01"`, `max="6"` (the line's current quantity), `step="0.01"` | yes | empty | |
| 3 | (hidden) | `editID` | hidden | – | `2` (the line id) | |

Button `Remove quantity` (`name="changeQuantityByRevision"`, submit, full width, dark). A stand-alone dialog `#changeQuantityByRevision` ("Remove quantity by revision") also exists in the page but no visible control of this page opens it.

### Details (`#showOrderDetails`) — opened by the truck icon of a line
Large dialog; body loaded by `GET /core/ajax/showOrderDetails.php?id=<line id>&action=showroom` into `#contentShowOrderDetails`. No inputs. Footer button `Close`. Left summary card, labels in order: `Material No` (with the description under it), `Ord. No.`, `Date`, `Ordered on this ISO`, then (only when the line is not ordered, capture of 8138678259) `Ordered in this order`, then `Received in this order`, `Inventory on site`. Right card "Audit trail": table with columns Date, Order No., Quantity, Supplier, Actie, Gebruiker (labels as shown, mixed English/Dutch).
- Line 7662782601 (id 2): Material No 7662782601 / FLG PIPE WN A105 CL150 30 DN250; Ord. No. 00001; Date 20.03.2024.; Ordered on this ISO 6.00; Received in this order 4.00; Inventory on site 4.00. Audit rows: `04.07.2024 10:23 | 00001 | 1.00 | PFF BV | Ontvangst | person A`; `21.03.2024 13:45 | 00001 | 3.00 | PFF BV | Ontvangst | Administrator` (a user account named Administrator).
- Line 8138678259 (id 108180, not ordered): Ord. No. `-`; Date `-`; Ordered on this ISO 16.00; Ordered in this order 0.00; Received in this order 0.00; Inventory on site 0.00; audit table has only the header row.

### Material status per revision (`#materialStatusByRevision`) — opened by the history button in the panel heading
Body loaded by `GET /core/ajax/materialStatusByRevision.php?id=<iso id>&action=showroom` into `#contentMaterialStatusByRevision`. No inputs. For isometric 0001 the text is "No revision-linked material changes yet." Footer button `Close`.

### Print MTO (`#pdfMTOReportLanguageList`) — opened by the `Print` button
Form `action="/core/pdf/mtoReport.php" method="get" target="_blank"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | `iso` | hidden | – | `1` (the isometric id) | |
| 2 | (hidden) | `project` | hidden | – | `1` | |
| 3 | (hidden) | `type` | hidden | – | empty | |
| 4 | Language | `lang` | select (select2) | no | "English" (`en`) | 4 options: `en` English; `nl` Nederlands; `de` Deutsch; `fr` Français |

Buttons: `Go` (`name="go"`, submit, class `btn-hidePrint`), `Cancel`.

### Attachments (`#isoAttachmentsModal`) — opened by Options → Attachments
Two forms in the body.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, upload form `#isoAttachmentsUploadForm`, `data-upload-url="/core/ajax/uploadIsoAttachments.php"`) | `iso` | hidden | – | `1` | |
| 2 | Report type | `reportNo` (`#isoAttachmentsReportNo`) | select (select2) | no | "2-200-AS PREFABRICATED" (`73`) | 21 options: `73` 2-200-AS PREFABRICATED; `72` 108 - Isometric pre-fab; `71` 107 - Blank LISL rev; `70` 106 - CUT LISt rev; `69` 103 - MTO SUPPORT rev; `68` 105 - 3D rev; `67` 104 - Support rev; `66` 102 - MTO rev; `65` 101 - Isometric rev; `64` Ready for work; `45` Support SHOP; `46` Support FIELD; `5` Support index; `22` Info Documents; `44` CUT LIST; `9` Piping layout; `6` 3D snippet; `2` Flange tightening; `7` Supports; `11` Prefab signed off; `16` Field signed off |
| 3 | Choose file | `files[]` (`#isoAttachmentsFileInput`) | file, `accept=".pdf,application/pdf"`, multiple | no | none | the text under the field says to hold CTRL for several files and that only PDFs are allowed |
| 4 | (file name display, `#isoAttachmentsFileLabel`) | none | text, read-only | – | placeholder "Nothing selected" | |
| 5 | (hidden, archive form `#isoAttachmentsArchiveForm`, `data-delete-url="/core/ajax/deleteIsoAttachments.php"`) | `iso` | hidden | – | `1` | |

Buttons: `Upload` (`#isoAttachmentsUploadBtn`, submit), `Delete` (`#isoAttachmentsDeleteBtn`, `btn-danger`, hidden until files are selected in the archive), `Cancel`. The archive area `#isoAttachmentsArchiveWrap` shows the heading "Attachments" and the text "Nothing selected" in the capture.

### Set phase (`#editIsometricPhase`) — opened by Options → Set phase
Capture `mto__iso__00022__set-phase` (isometric id 6). Form `method="post" enctype="multipart/form-data"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | `deleteID` | hidden | – | `6` (the isometric id; the field is named "deleteID" although the dialog sets a phase) | |
| 2 | Materials (MTOP) | `prefab_materials` | checkbox, value `ok` | no | unticked | |
| 3 | Estimate (ESTP) | `prefab_est` | checkbox, value `ok` | no | unticked | |
| 4 | Isometric formatted | `prefab_doc` | checkbox, value `ok` | no | unticked | |
| 5 | Welds defined (WP) | `prefab_welds` | checkbox, value `ok` | no | unticked | |
| 6 | Field documentation | `field_doc` | checkbox, value `ok` | no | unticked | |
| 7 | Test documentation | `field_test` | checkbox, value `ok` | no | unticked | |
| 8 | Release documentation | `field_release` | checkbox, value `ok` | no | unticked | |
| 9 | Work preparation 100% | `prep_finished` | checkbox, value `ok` | no | unticked | |

Buttons: `Update` (`name="editIsometricPhase"`, submit, class `btn-hideEdit`), `Cancel`. None of the boxes was ticked for isometric 00022, although the isometric shows the "Started" tag (browser-pass notes).

### Audit trail (`#showIsometricAuditTrail`) — opened by Options → Audit trail
Large dialog, title "Audit trail" (lower-case t), body text "Loading..." in the capture. The control carries `data-iso-id="1"`. The request that fills it was not captured (see "Not in the capture").

### Dialogs opened from the header cards (shared with the Weld view)
Only listed here; the Weld isometric note describes them.
- `#editIsometric` ("Edit isometric") — pencil in the panel heading. In the MTO view the page script loads it with `GET /core/ajax/editIsometric.php?rand=…&id=<iso id>` and the parameters `action: "showroom"`, `type: "mto"`; the MTO body was not captured.
  Footer of the shell (from the Weld capture of the same dialog): buttons "Add new" (name `addIsometricNew`, hidden `secureCode`), checkboxes `copyWelds` ("Copy Welds"), `copyMats` ("Copy Materials"), `copyCalcs` ("Copy Calculations") (all type checkbox, value `ok`, unchecked, not required), "Update" (name `editIsometric`), "Cancel".
- `#addRev` ("Add rev") — the blue `+` next to the revision link in the ISO No row. Fields in the capture (from the Weld capture of the same page): file `fileiso`, text `revNo` (default "3" on isometric 0001), text `comment`; buttons `Add`, `Cancel`.
- `#showRev` ("Current revisions") — the `Rev 2.00` link; lists each revision file with a delete button (`deleteRev`, hidden `revid`); button `Close`.
- `#setAsCompleted` / `#setAsNotCompleted` (both titled "Hydrotest"; texts "Set as completed?" / "Set as not completed?"; hidden `id` and `secureCode`; button `Set` name `setAsCompleted` / `setAsNotCompleted`, `Cancel`) — they belong to the `Hydrotest completed` link, which names no target in the capture.
- `#punchlist` ("Punch lists"), `#setStatus`, `#statusLog`, `#showIsometric` ("Iso overview"): present, empty shells, no control of this page was captured opening them.

Also present in the page, opened from elsewhere: `weldTracerDetailModal`, `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `editStamp`, `changeIsoInProject`, `addProject`, `editProject`, `pdfCertificateIndexLanguage`, `deleteProject`, `backProject`, `importProjects`, `importFull`, `searchProject`, `deleteAllIso`, `deleteSelectedIso`, `pdfESTReportLanguageList`, `returnMaterialByRevision`, `changeQuantityByRevision`, `pdfIsoBook`, `pdfIsoBookMultiple`, `pdfIsoBookMultipleGroup`, `pdfIsoBookEst`, `importMaterialInISO`, `importIsometrics`, `deleteMaterialISO`, `editMaterialISO`, `addReceivedMaterial`, `setCalculationAsFinished`, `setCalculationAsNotFinished`, `setPunch`, `uploadNDTonMultipleWelds`, `uploadNDTonMultipleWeldsPre`, `viHubModal`, `generateLabelsOnMultipleWelds`, `generateLabelsOnMultipleWelds2`, `generateLabelsOnMultipleWeldsProject`, `generateLabelsOnMultipleWelds2Project`, `uploadPWHTonMultipleWelds`, `pdfLISLLanguage`, `pdfLISLFullLanguage`, `pdfLISLFullLanguageWQ`, `pdfLISLFullLanguageWQNEW`, `pdfLISLFullLanguageGUrev2`, `pdfLISLFullLanguageGUrev3`, `pdfLISLFullLanguageA3`, `showOrderAuditTrail`, `pdfNdtRequestLanguage`, `pdfNdtRequestLanguageAdditional`, `pdfNdtPreRequestLanguageAdditional`, `pdfNdtRequestLanguageMass`, `pdfNdtRequestLanguagePre`, `pdfNdtRequestLanguagePreMass`, `pdfPwhtRequestLanguage`, `pdfNdtRequestLanguageISO`, `pdfNdtPreRequestLanguageISO`, `pdfPwhtRequestLanguageISO`, `addIsometric`, `editIsometricMass`, `confirmPrefabComplete`, `confirmFieldComplete`, `confirmReopenField`, `confirmInlineReleaseField`, `addRevItp`, `addRevItp2`, `showRevItp`, `backIsometric`, `deleteIsometric`, `editWeld`, `deleteWeld`, `deleteSelectedWelds`, `backWeld`, `showNDO`, `showWeldNdtArchive`, `showWeldNdtPreArchive`, `showWeldPwhtArchive`, `showNDOPre`, `showPWHT`, `addCalculation`, `addCalculationCustom`, `editCalculation`, `deleteCalculation`, `importCalculationsFromIso`, `importCalculationsFromIsoProject`, `removeLastCalculations`, `markPunchAsRemoved`, `punchlistEdit`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `copyIsometrics`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`, `weldpilotItpUnlinkModal`, `weldpilotItpPickerModal`.

## Rules found in the page's JavaScript
Only the page-specific lines of the inline script were written into `mto__iso__0001.txt` (the rest is "already captured on earlier pages"); body lines of some handlers are therefore missing and are not described.

- Page variables `__mtoSavedGroup`, `__mtoSavedType`, `__mtoSavedQty` start as empty strings. When `#addMaterialIso` has been shown (`shown.bs.modal`), non-empty saved values are written back into `quantity`, `#typeMX` and `#markMX` (the group change is triggered), then the three button panels are rebuilt (`__mtoMatInitPanels`).
- `__mtoMatInitPanels` renders each of `#markMX`, `#seriesMX`, `#typeMX` as a grid of choice buttons in `#mtoMatGroupPanel`, `#mtoMaterialPanel`, `#mtoTypePanel` (`__acRenderSelectPanel`, option "empty" entries not included). The material panel's empty text is "No materials found for this group." when a group other than `0` is selected, otherwise "Choose a material group first."
- `__mtoMatUpdateSummary` builds the "Selected" chips: "Material Group: <text>" when the group value is not `0`; "Material: <text>" when the material value is neither empty nor `0`; "Type: <text>" when the type value is not `0`; when no chip applies, the single chip "Nothing selected yet".
- Clicking a button in `#mtoMatGroupPanel .wsapps-ac-choice` sets `#markMX`, triggers its change, re-renders the panel, clears the search box of the material panel, and updates the summary. Clicking a material button sets `#seriesMX`; clicking a type button sets `#typeMX`; each re-renders its panel and updates the summary. Changing any of the three selects (`change.mtoBadge`) does the same.
- Request when a group is chosen: `GET /core/ajax/getListOfMaterials.php` with parameters `id` (the group name), `timer` (a timestamp) and `ajax=true`; the answer is a JSON array of `{optionValue, optionDisplay}` where `optionDisplay` is "<material no> <description>" (39 entries for BOLTS A320-L43). The callback body is not in the capture; the effect (list fills `#seriesMX`, first entry selected) is from the browser-pass notes.
- `Auto fill` (`#buttonMatIso`): calls `select2_search($('#singleIso'), $('#materialNoIso').val())`, which opens the Charge number select2 and types the Material No into its search field. No request; with material no 8138265581 the dropdown showed "No results found" (browser-pass notes). The same handler exists in the Edit material dialog body for `button[data-target="#single"]` and `#materialNo`.
- Materials table: DataTables on `#datatableIsoMaterials` with `info: true`, `lengthChange: true`, `dom: "<\"dt-panelmenu clearfix\"lfr>t<\"dt-panelfooter clearfix\"ip>"` (length menu, filter, processing on top; table; info and pagination below). The last two columns (Options and checkbox) are neither orderable nor searchable. It is only initialised when the table is not already a DataTable.
- Row selection: every change of a checkbox named `ccid_*` (and every table redraw) recomputes the list of ticked ids among the rows that match the current search; the ids joined by commas are written into `#deletedMaterialsList` and `#setTypeMaterialsList`; `Delete selected` and `Set type` get the class `disabled` and `aria-disabled="true"` when nothing is ticked. The select-all checkbox ticks or unticks every row that matches the current search, and it is shown ticked only when all matching rows are ticked; a redraw unticks it.
- `Set type` dialog: select2 is attached to `#setCheckedMaterialsTypeSelect` when the dialog is shown (`dropdownParent` = the dialog). On submit the script reads the chosen type and the id list and stops when either is empty (the message or action it takes is not in the captured lines).
- Requests the page script names for the header: `/core/ajax/editIsometric.php?rand=…&id=<id>` with `{action: "showroom", type: "mto"}` (two places), `/core/ajax/pdfIsoBook.php?id=…&app=mtopilot&time=…`, `/core/ajax/pdfCertificateIndexAndLISL.php?id=…&time=…`, `/core/ajax/pdfCertificateIndexLanguage.php?time=…&id=…&iso=isometrics`, `/core/ajax/searchProject.php?time=…`. Requests made when dialog bodies open (from the XHR lists of the dialog captures, all GET): `showOrderDetails.php?id=<line id>&action=showroom`, `showQuantityLog.php?id=<line id>&action=showroom`, `editMaterialISOimport.php?id=<line id>&action=showroom`, `materialStatusByRevision.php?id=<iso id>&action=showroom`. In the capture the bodies of `showOrderDetails` for lines 2 and 108180 and of `showQuantityLog` for line 2 were already requested before any click was captured. Page load: `/core/ajax/ajax-notifications.php?action=count_unread` (answer `{"count":0}`).
- Edit material body script: `$(".select2-single").select2()` and the Auto fill handler described above.
- No JavaScript for the `recalculateMaterialStatusForIso` button, the Hydrotest link, the type-filter dropdown or the Attachments upload/delete was found in the capture (the attachments form carries only the upload and delete URLs `/core/ajax/uploadIsoAttachments.php` and `/core/ajax/deleteIsoAttachments.php` in its attributes).

## Sample data

The seven isometrics of the capture (project 1, sandbox project "20240101 Template project"). Every one shows Hydrotest completed `No` (link) and Shop prefab 0%, Field 0%, Site 0%, Status 0%.

| URL `id` | ISO No (as displayed) | Rev | Status card: Status | Quality | Hydrotest completed | Material status | Started state | Lines |
|---|---|---|---|---|---|---|---|---|
| 1 | 0001 (IRN 1000), link to a PDF | Rev 2.00 | 0% | 72.7% | No | 49% (red, from the browser-pass notes) | not in the capture | 9 |
| 6 | 00022 (IRN ) | Rev 0 | 0% | none shown | No | 100% (green, from the browser-pass notes) | "▶ Started" tag after the breadcrumb (from the browser-pass notes); not in the raw DOM | 2 |
| 895 | 0003 (IRN ) | Rev 0 | 0% | 0% | No | 0% | not in the capture | 1 |
| 6191 | 00032 (IRN ) | Rev 0 | 0% | none shown | No | 0% | not in the capture | 3 |
| 6598 | 0005 (IRN ) | Rev 0 | 0% | 75% | No | Empty | not in the capture | 0 |
| 15767 | 0007 (IRN ) | Rev 0 | 0% | 0% | No | Empty | not in the capture | 0 |
| 15424 | WF-73031-ST_STB000-01 (IRN ), link to a PDF | Rev 0 | 0% | none shown | No | Empty | not in the capture | 0 |

Other header values that differ (shared cards): isometric 0001 has Asset tag N011-HV10001-0001, Drawing no. 1 N011-HV10001 (hidden row), NoBo `No`, NoBo Reg. no. / NoBo serial `N/A / N/A`, X Ray % 14, Piping class A11011, PWHT `Yes`, Test pressure 29, Paint specification A10, Insulation specification A15, ITPS count "0/2" with the text "No ITP linked" and ITP numbers 111111 and 222222 in a hidden form. The other six show Asset tag `-`, NoBo `No`, NoBo Reg. no. / NoBo serial `/`, PED Cat.-Mod `-`, X Ray % `-`, Piping class `-`, PWHT `No`, Test pressure `-`, Test system `-`, ITPS "0/2" and "No ITP linked". All seven: Paint, Tracing and Insulation selects are `N/A` (options Open `0`, Done `1`, N/A `2`).

Materials table of every isometric (columns as on screen; "Inv." is the truck icon's tooltip; "Order file" is the order number from the Ord.? tooltip). Picked is 0 on every line.

**Isometric 0001 (id 1), "Showing 1 to 9 of 9 entries"** (rows in the order of the capture):

| Group | Mat.no. | DIA | LBS/SCH | Description | Type | Qty. | UOM | Ord.? | Inv. (tooltip) | Picked | Trash |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS A320-L43 | 8138265581 | - | - | BLT/N A320-L43 CTD 8UN 530MM 2.3/4IN | Shop | 2 | EA | Yes (Ord. No.: 00006, fileid 14) | Ord. 2 \| Inv. 2 | 0 | disabled |
| TEST | 1 | D1 | LBS1 | test | Field | 3 | EA | Yes (Ord. No.: 00006, fileid 14) | Ord. 3 \| Inv. 3 | 0 | disabled |
| BOLTS A320-L43 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | Shop | 3 | EA | Yes (Ord. No.: 00004, fileid 6) | Ord. 3 \| Inv. 0 | 0 | disabled |
| FITTING CS FLG | 7662782601 | - | - | FLG PIPE WN A105 CL150 30 DN250 | Shop | 6 | EA | Yes (Ord. No.: 00001, fileid 1) | Ord. 6 \| Inv. 2 | 0 | disabled |
| FITTING 304 REE | 7636669711 | - | - | REE BW 304 XS/30 DN600X450 | Shop | 8 | EA | Yes (Ord. No.: 00005, fileid 7) | Ord. 8 \| Inv. 8 | 0 | disabled |
| FITTING 316 ELB | 7633384771 | - | - | ELB BW 316 45DEG LR 100 DN450 | Shop | 13 | EA | Yes (Ord. No.: 00006, fileid 14) | Ord. 13 \| Inv. 13 | 0 | disabled |
| PIPE CS | 7430050581 | - | - | PIPE MET GR.B 80 DN40 | Shop | 6 | M | Yes (Ord. No.: 00002, fileid 2) | Ord. 6 \| Inv. 6 | 0 | disabled |
| PIPE CS | 7430052832 | - | - | PIPE MET GR.B - - - 30 250MM | Shop | 12 | M | Yes (Ord. No.: 00001, fileid 1) | Ord. 12 \| Inv. 0 | 0 | disabled |
| BOLTS A320-L7 | 8138678259 | - | - | BLT/N A320 GR.L7M 8UN 300MM 1 IN | Shop | 16 | EA | No | Need 16 \| Have 0 | 0 | active |

Line ids (`data-id` of Qty/truck/pencil) in the same order: 12595, 12596, 1939, 2, 1940, 1942, 5, 1, 108180.

**Isometric 00022 (id 6), "Showing 1 to 2 of 2 entries"**:

| Group | Mat.no. | DIA | LBS/SCH | Description | Type | Qty. | UOM | Ord.? | Inv. (tooltip) | Picked | Trash |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS A320-L7 | 8138678259 | - | - | BLT/N A320 GR.L7M 8UN 300MM 1 IN | Shop | 2 | EA | Yes (Ord. No.: 00006, fileid 14) | Ord. 2 \| Inv. 0 | 0 | disabled |
| BOLTS A320-L43 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | Field | 10 | EA | Yes (Ord. No.: 00007, fileid 15) | Ord. 10 \| Inv. 0 | 0 | disabled |

Line ids: 10970, 98463. In this isometric the Progress card's Tracing specification reads `no`; Paint and Insulation specifications `-`.

**Isometric 0003 (id 895), "Showing 1 to 1 of 1 entries"**:

| Group | Mat.no. | DIA | LBS/SCH | Description | Type | Qty. | UOM | Ord.? | Inv. (tooltip) | Picked | Trash |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS B16 | 8138965891 | - | - | BLT/N A193-B16 8UN 170MM 1.1/4IN | Valves | 2 | EA | No | Need 2 \| Have 0 | 0 | active |

Line id 98762.

**Isometric 00032 (id 6191), "Showing 1 to 3 of 3 entries"**:

| Group | Mat.no. | DIA | LBS/SCH | Description | Type | Qty. | UOM | Ord.? | Inv. (tooltip) | Picked | Trash |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BOLTS B7M | 8138664911 | - | - | BLT/N A193-B7M UNC 280MM 1IN | Shop | 16 | EA | No | Need 16 \| Have 0 | 0 | active |
| BOLTS A320-L43 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | Shop | 16 | EA | No | Need 16 \| Have 0 | 0 | active |
| PIPE 316 | 7436330731 | - | - | PIPE MET 316L 10S DN100 | Shop | 16 | M | No | Need 16 \| Have 0 | 0 | active |

Line ids: 108179, 108178, 108177.

**Isometrics 0005 (id 6598), 0007 (id 15767) and WF-73031-ST_STB000-01 (id 15424):** no material lines; the table shows "No data available in table" and the info text "Showing 0 to 0 of 0 entries".

Other values from the dialog captures: the Add dialogs' revision list for isometric 0001 is Revision 2.00 Studs wijziging and Revision 1.00 RFC; the Set phase dialog of isometric 00022 has all eight boxes unticked; the Quantity log of line 2 has Beginning 6.00 and Now 6.00.

## Not in the capture

- Breadcrumb and the "Started" tag: not in the raw DOM captures; the tag is known for isometric 00022 only, from the browser-pass notes. Whether the other six isometrics show it is not recorded.
- Body of `#editIsometric` in the MTO view (pencil in the panel heading): requested with `type: "mto"`; not captured. Likewise the full Options-menu and Add-menu markup (only the new lines were written; labels come from the dialog captures and the browser-pass notes).
- `#showIsometricAuditTrail` content (Options → Audit trail): shown as "Loading..." only; request not captured.
- What `Hydrotest completed` → `No` opens (the link has no `href` or `data-target`), and the result of the `Material status` refresh button (`recalculateMaterialStatusForIso`, not clicked).
- The message or action when `Set type` is submitted without a type or without ticked lines (lines elided as already captured).
- The result of submitting any dialog (Add, Update, Remove quantity, Delete, Set phase, Upload, Print): nothing was submitted.
- The Print dialog's PDF, the order archive page behind `Yes` (`index.php?page=material-order-archive&fileid=N`), and the inventory/orders data of lines other than ids 2 and 108180 (Details dialog, Quantity log and Edit material of the other lines).
- The Details, Quantity log and Edit material bodies of the lines of isometrics 00022, 0003 and 00032, and the ISO-level audit trail.
- Rows beyond the first page: none (largest table has 9 lines, page length 25).
