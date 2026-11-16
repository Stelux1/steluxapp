# MTO Pilot → Order / Take in → Material take in

Source: `mto__order__material-take-in.txt`, `mto__order__material-take-in-order-15.txt`, `mto__order__material-take-in__receive.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-receive` (step 2: `/mtopilot/index.php?page=material-receive&fileid=15&supplier=1&bt=`).
State of the page for the observing account: normal.

The screen has two steps: (1) a list of all receipts ("take in" history), and (2) a per-order entry form reached through the "Receive materials" dialog.

## Page

### Step 1 — list (`page=material-receive`)
- Browser title: "Material take in - MTOPilot®".
- Breadcrumb (top bar): "Material take in" → `index.php?page=material-receive`.
- Tabs: none.
- Panel (class `panel-dark`) with a heading area that contains only an icon button (no text, arrow-down glyph) pointing to `#addReceivedMaterial`.
- Buttons above the list:
  - Top bar: "Receive materials" (arrow-down icon, `btn-primary`, class `buttonInsert`) → opens dialog `#addReceivedMaterial` (`data-toggle="modal"`).
  - Panel heading: the same dialog via an icon-only button (no label).
  - Search box `#materialReceiveSearch` (placeholder "Search") with a clear button `#materialReceiveSearchClear`.
  - Export buttons: "CSV", "Excel", and an icon-only print button (links `href="#"`).

### Step 2 — one order (`page=material-receive&fileid=15&supplier=1&bt=`)
- Breadcrumb: "00007" (the order number) → `index.php?page=material-receive&fileid=15`. (The breadcrumb link carries only `fileid`, not `supplier`.)
- Panel heading text: "Material take in". Tabs: none.
- Buttons above the list:
  - Search box `#materialReceiveDetailSearch` (placeholder "Search") with clear button `#materialReceiveDetailSearchClear`.
  - "Receive all materials" (check icon, classes `btn-xs btn-default js-receive-all-materials`) → fills the quantity inputs (see JavaScript rules).
  - "CSV", "Excel", icon-only print.
- Below the table: "Receive materials" (`btn-primary`, `name="receiveMaterial"`, `type="submit"`, arrow-down icon) submitting the surrounding `<form method="post">` (no `action`, so it posts to the same URL).

## List

### Step 1 table `#datatableMaterialReceive`
Columns in order (all visible, all sortable): Date | Order No. | Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Supplier.
- Client-side table (`serverSide:false`, no `ajax`); no per-column search inputs; no filters; no row options or row links; no checkboxes; no bulk actions / Options menu.
- Page length: the captured DT configuration says `pageLength` 10 with `lengthMenu` [10, 25, 50, 100], but the page script initialises the table with `paging:false` and `lengthChange:false` and all 13 rows are shown. No page-length selector is in the DOM.
- Default sort: the captured DT state shows `order [[10,"asc"]]` (column Supplier ascending); the script requests `[[0,'desc']]` (Date descending). The 13 rows in the capture are in ascending order of Quantity (-10 first, 13 last), which matches neither setting. Which one is active is not decidable from the capture.
- Table layout (`dom` in script): buttons, table, then a footer with info text.
- Info text: "Showing 1 to 13 of 13 entries". Empty text: "No data available in table". No-match text: "No matching records found". Search label: empty.
- Export buttons in the script: PDF, CSV, Excel, print, exporting visible columns. Only CSV, Excel and print are in the DOM of the capture (the script also defines a "PDF" button; it is not drawn).
- Search: live (on `keyup input`) filter of the whole table; the clear button empties it and refocuses.

### Step 2 table `#datatableMaterialReceiveDetail`
Columns in order: Material group | Article No | Material No | Description | Quantity | UOM | Alr. rec. | Today rec. | Audit.
- "Audit" is not sortable (last column, `orderable:false` for this table).
- Default sort: DT state `order [[7,"asc"]]`; script requests `[[0,'asc']]`. Same ambiguity as above (only one row).
- No paging, no page-length selector. Info text: "Showing 1 to 1 of 1 entries". Same empty / no-match texts as step 1.
- Export (CSV, Excel, print) uses visible columns except the last (Audit).
- Cells:
  - "Alr. rec." — number already received for this order and material.
  - "Today rec." — a hidden input `name="materialno[]"` (value = the Material No) plus a number input `name="noReceived[]"` (class `form-control js-receive-qty`, `step="0.01"`, placeholder "+/-", `data-remaining` = remaining quantity, title text in Dutch: "Gebruik een negatieve waarde voor een ontvangstcorrectie", i.e. use a negative value for a receipt correction).
  - "Audit" — a truck-icon link (title "Toon details en audit trail") → opens a per-row dialog `#showOrderDetailsByOrder-<32-hex hash>` (`data-toggle="modal"`). The dialog body is present in the DOM inside the cell (see Dialogs).
- No row checkboxes, no bulk actions.

## Dialogs

### Receive materials (`#addReceivedMaterial`) — opened by "Receive materials" (top bar or panel heading icon button)
Form: `action="index.php"`, `method="get"`. Captured on both the list page and the order page and identical in structure; in the list page the first option of each select is the default (marked here).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | page | hidden | — | `material-receive` | — |
| 2 | Order No. | fileid (`#js-receive-order-fileid`) | select (select2) | not marked | 15 → "00007 \| 06.11.2025. 07:42" (newest) | 7 options, value → text: 15 → 00007 \| 06.11.2025. 07:42 (default); 14 → 00006 \| 06.11.2025. 07:41; 7 → 00005 \| 04.07.2024. 11:23; 6 → 00004 \| 04.07.2024. 11:14; 5 → 00003 \| 04.07.2024. 10:22; 2 → 00002 \| 21.03.2024. 13:44; 1 → 00001 \| 20.03.2024. 11:16 |
| 3 | Supplier | supplier (`#js-receive-order-supplier`) | select (select2) | not marked | 1 → "PFF BV" | 8 options: 1 → PFF BV (default); 2 → VAN LEEUVEN JR BUIZENHANDEL BV; 3 → ELIMP D.O.O.; 4 → HONEX D.O.O.; 5 → Bus Industrial Tools; 6 → Montavar Metalna Lola D.O.O.; 7 → Technip Energies; 8 → Tecnicas Reunidas S.A. |

Buttons: "Add" (`btn-primary`, `type="submit"`, `name="bt"`), "Cancel" (`btn default`, dismisses). Header close (×).
Behaviour (from the capture and the browser-pass notes): submitting is a plain GET that reloads the page as `index.php?page=material-receive&fileid=<id>&supplier=<id>&bt=` (step 2); nothing is saved at this step. The capture does not show whether the supplier list depends on the chosen order, or whether the supplier select changes when the order changes (no script for the two ids is present on this page). The order list shows 7 orders and all 8 suppliers regardless of selection in the capture.

### Audit / details dialog (`#showOrderDetailsByOrder-<hash>`) — opened by the truck icon in the "Audit" cell of step 2
Not a form: no inputs. Content as shown for the single row (order 00007, material 8138268881):
- Heading lines: "Audit"; "Material No 8138268881"; the description "BLT/N A320-L43 CTD 8UN 1000MM 4IN"; "Ord. No. 00007"; "Date 06.11.2025."
- Figures: "Ordered 10.00", "Received in this order 10.00", "Inventory on site 0.00".
- "Audit trail" table, columns: Date | Order No. | Quantity | Supplier | Actie | Gebruiker (the last two headers are Dutch: action, user). Rows as displayed:
  1. 06.11.2025 07:43 | 00007 | -10.00 | PFF BV | Correctie | user A
  2. 06.11.2025 07:42 | 00007 | 10.00 | PFF BV | Ontvangst | user A
  3. 06.11.2025 07:42 | 00007 | 10.00 | PFF BV | Ontvangst | user A
- Button: "Close" (`btn-primary`, dismisses). Header close (×).
- Order: the audit trail lists newest first in the capture.

Also in the page DOM as empty shells (no body): `#showOrderDetails` ("Details", Close), `#showOrderAuditTrail` ("Audit Trail", Close), `#showIsometricAuditTrail` ("Audit trail", body "Loading...", Close). No control of this page points to them in the capture.

## Rules found in the page's JavaScript
Source: the inline script on step 2 (the `.js-receive-qty` block) and the shared inline script that initialises both tables.
- Number parsing (`parseQty`): a comma is read as a decimal point; empty or non-numeric text counts as 0. Display (`formatQty`): whole numbers without decimals, otherwise rounded to 2 decimals.
- Keyboard: in a `.js-receive-qty` input, ArrowUp adds 1 and ArrowDown subtracts 1 (default behaviour prevented), then a `change` event fires.
- Native spinner: when an `input` event changes the value by exactly 0.01 (the field's step), it is replaced by a change of exactly 1 in the same direction.
- "Receive all materials" (`.js-receive-all-materials`): for every `.js-receive-qty` input, if `data-remaining` > 0 the value is set to that remaining quantity; otherwise the field is cleared. Then a toast (info) appears: "<n> materialen ingevuld voor volledige ontvangst" when n > 0, otherwise "Geen openstaande aantallen gevonden" (Dutch, hard-coded).
- Negative values are allowed (placeholder "+/-", title says negative = receipt correction); no minimum is set on the input, and no client-side validation or message beyond that is in the capture.
- Table setup (`initReceiveTable`): no paging, no length menu, info shown, search enabled, ordering enabled, state not saved; the last column of the detail table is not sortable; the search input filters on every key press and toggles a "has-value" style on its label.
- Export buttons are moved into an element `.mr-filter-toolbar .ft-filters` if that element exists (retries up to 50 times, every 100 ms); it is not in the DOM of the capture.
- Requests made by the page: only `/core/ajax/ajax-notifications.php?action=count_unread` (shared notification counter, loaded by every page). The receive step itself is a GET navigation (dialog) and a POST of the form (button "Receive materials", `name="receiveMaterial"`); the posted field names are `materialno[]` and `noReceived[]`, one pair per table row. No other endpoint is named in the capture.

## Sample data
Step 1 — 13 rows, "Showing 1 to 13 of 13 entries". One row has a negative quantity (-10, the correction). Rows in the order the capture shows them (UOM is "-" in every row, DIA and LBS/SCH are "-" unless shown):

| Date | Order No. | Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Supplier |
|---|---|---|---|---|---|---|---|---|---|---|
| 06.11.2025 07:43 | 00007 | BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | -10 | - | PFF BV |
| 04.07.2024 10:23 | 00001 | FITTING CS FLG | 100001312 | 7662782601 | - | - | FLG PIPE WN A105 CL150 30 DN250 | 1 | - | PFF BV |
| 04.07.2024 10:23 | 00001 | CS | - | P235GH | 65 | 2.9 | PIPE, EN 10216-2 (SEAMLESS) | 1 | - | PFF BV |
| 06.11.2025 07:41 | 00006 | BOLTS A320-L7 | 100458921 | 8138678259 | - | - | BLT/N A320 GR.L7M 8UN 300MM 1 IN | 2 | - | PFF BV |
| 06.11.2025 07:41 | 00006 | BOLTS A320-L43 | 100518076 | 8138265581 | - | - | BLT/N A320-L43 CTD 8UN 530MM 2.3/4IN | 2 | - | PFF BV |
| 21.03.2024 13:45 | 00001 | FITTING CS FLG | 100001312 | 7662782601 | - | - | FLG PIPE WN A105 CL150 30 DN250 | 3 | - | PFF BV |
| 06.11.2025 07:41 | 00006 | TEST | 1 | 1 | D1 | LBS1 | test | 3 | - | PFF BV |
| 04.07.2024 11:00 | 00002 | PIPE CS | 100048618 | 7430050581 | - | - | PIPE MET GR.B 80 DN40 | 6 | - | PFF BV |
| 21.03.2024 13:45 | 00001 | CS | - | P235GH | 65 | 2.9 | PIPE, EN 10216-2 (SEAMLESS) | 6 | - | PFF BV |
| 04.07.2024 11:24 | 00005 | FITTING 304 REE | 100699891 | 7636669711 | - | - | REE BW 304 XS/30 DN600X450 | 8 | - | PFF BV |
| 06.11.2025 07:42 | 00007 | BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 10 | - | PFF BV |
| 06.11.2025 07:42 | 00007 | BOLTS A320-L43 | 100518128 | 8138268881 | - | - | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 10 | - | PFF BV |
| 06.11.2025 07:41 | 00006 | FITTING 316 ELB | 100699850 | 7633384771 | - | - | ELB BW 316 45DEG LR 100 DN450 | 13 | - | PFF BV |

(The rows appear sorted by Quantity ascending in the capture, not by date or supplier; the cause is not visible.) Note: the dates in the list show 07:43 for the correction row and 07:42 for the two receipts of order 00007, in line with the audit trail below.

Step 2 (order 00007, supplier PFF BV) — 1 row, "Showing 1 to 1 of 1 entries":

| Material group | Article No | Material No | Description | Quantity | UOM | Alr. rec. | Today rec. | Audit |
|---|---|---|---|---|---|---|---|---|
| BOLTS A320-L43 | 100518128 | 8138268881 | BLT/N A320-L43 CTD 8UN 1000MM 4IN | 10 | EA | 10 | (empty number input, `data-remaining="0"`) | truck icon |

Audit trail for that row: see the Audit dialog above (ordered 10.00, received 10.00, inventory on site 0.00; receipts 10.00 + 10.00 and a correction -10.00).

## Not in the capture
- The result of submitting "Receive materials" on step 2 (the POST response, messages, and how the "Alr. rec." and inventory figures change): button "Receive materials" at the bottom of step 2. Not clicked (read-only).
- Step 2 for any order other than 00007 (only `fileid=15&supplier=1` was captured), so rows with a remaining quantity above 0 and the effect of "Receive all materials" on real values are not shown.
- Whether the "Supplier" choice filters the order list or the rows (the capture shows a supplier in the URL only).
- Any server-side validation message (for example over-receiving, or an empty submission).
- The PDF export button the script defines (not drawn in the DOM).
- Page-length options: configured in the DT state but not usable (paging is off).

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, deleteAllIso, deleteSelectedIso, pdfMTOReportLanguageList, pdfESTReportLanguageList, returnMaterialByRevision, changeQuantityByRevision, pdfIsoBook, pdfIsoBookMultiple, pdfIsoBookMultipleGroup, pdfIsoBookEst, importMaterialInISO, importIsometrics, deleteMaterialISOimport, deleteMaterialISO, editMaterialISO, editMaterialISOimport, addMaterialIso, addMaterialIsoCustom, setCalculationAsFinished, setCalculationAsNotFinished, setAsCompleted, setAsNotCompleted, setPunch, uploadNDTonMultipleWelds, uploadNDTonMultipleWeldsPre, generateLabelsOnMultipleWelds, generateLabelsOnMultipleWelds2, generateLabelsOnMultipleWeldsProject, generateLabelsOnMultipleWelds2Project, uploadPWHTonMultipleWelds, pdfLISLLanguage, pdfLISLFullLanguage, pdfLISLFullLanguageWQ, pdfLISLFullLanguageWQNEW, pdfLISLFullLanguageGUrev2, pdfLISLFullLanguageGUrev3, pdfLISLFullLanguageA3, pdfNdtRequestLanguage, pdfNdtRequestLanguageAdditional, pdfNdtPreRequestLanguageAdditional, pdfNdtRequestLanguageMass, pdfNdtRequestLanguagePre, pdfNdtRequestLanguagePreMass, pdfPwhtRequestLanguage, pdfNdtRequestLanguageISO, pdfNdtPreRequestLanguageISO, pdfPwhtRequestLanguageISO, addIsometric, editIsometricMass, editIsometricPhase, addRev, addRevItp, addRevItp2, showRev, showRevItp, showRevItp2, editIsometric, backIsometric, deleteIsometric, editWeld, deleteWeld, deleteSelectedWelds, backWeld, showNDO (and, on step 2 only: confirmMaterialTake, materialTakeEdit, undoIsoExecutionPickList, editServiceRequest, editFlange, docsFlange, showStorehouseAuditTrail, viewLagerCerts, showWeldNdtArchive, showWeldNdtPreArchive, showWeldPwhtArchive, showPWHT).
