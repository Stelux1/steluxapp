# MTOPilot → Materials → Material part

Source: `mto__materials__material-part.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/material-part/`.
Dialog markup: `weld__material__material-part.txt` (the three dialogs of this page are written there in full; the MTO capture lists them as SAME-AS). Edit dialog body: `weld__material__material-part__edit.txt` (click capture on the WeldPilot page of the same dialog; not captured on this MTOPilot page).
State of the page for the observing account: normal.

## Page

- Window title: "Material part - MTOPilot®".
- Breadcrumb: one active crumb "Material part" (link `/mtopilot/material-part/`).
- Panel heading: list icon and the text "Material part".
- Tabs: none in the capture.
- Buttons above the list:
  - "Add material part" — top bar, class `buttonInsert`, `href="#addMaterialPart"`, `data-toggle="modal"`, plus icon → opens `#addMaterialPart`.
  - Plus icon button with no text — in the panel heading, same attributes (`href="#addMaterialPart"`, `data-toggle="modal"`) → opens `#addMaterialPart`.
- Site-wide floating "Scan QR" button (`title="Scan QR"`, QR icon) with two menu items, "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`). Its handlers are not in this page's captured code (see Not in the capture).

## List

- Table id `datatableWarehouse`, client-side (`serverSide: false`, `ajax: null`). All rows are in the page; no table request.
- Columns in order:
  1. "Part" — data key 0, visible, sortable.
  2. "Custom" — data key 1, visible, sortable.
  3. "Options" — data key 2, visible, sortable; the cell holds the row buttons (see below).
- Hidden columns: none.
- Default sort: `order [[1,"asc"]]` = the Custom column, ascending. The rows as drawn in the capture are in Part-name order.
- Page length: 20 by default. Length menu: 5, 20, 50, 100, 500.
- Per-column search inputs: none in the capture.
- Filters: none in the capture.
- One global search: input `type="search"`, class `form-control input-sm`, placeholder "Search", inside a label with a search icon; clear button (aria-label "Clear", times icon). Search label text: empty.
- Row options, in order:
  1. Pencil icon (`glyphicon-pencil`, class `buttonEdit open-editMaterialPart btn btn-xs btn-warning`, `href="#editMaterialPart"`, `data-id` = row id) → opens `#editMaterialPart`.
  2. Trash icon (`glyphicon-trash`, class `buttonDelete open-deleteMaterialPart btn btn-xs btn-danger`, `href="#deleteMaterialPart"`, `data-id` = row id) → opens `#deleteMaterialPart`.
- Bulk actions (Options menu): none in the capture; there is no selection column.
- Export / print buttons (footer above the table): "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), and a print icon button (`buttons-print`, fa-print). All three are `href="#"`. The capture does not show what they do beyond these classes.
- Info text: template "Showing _START_ to _END_ of _TOTAL_ entries"; rendered footer text "Showing 1 to 68 of 68 entries".
- Empty text: "No data available in table".
- Zero-match text: "No matching records found".
- Server-side table request: none (`ajax` is null).
- Stray table: before the list, a second table element with the same DataTables classes and no id has a header cell "PartCustomOptions" and no rows. Its DataTables configuration reports the error "TypeError: Cannot read properties of undefined (reading 'ajax')". The capture does not show whether this table is visible.
- Row count: 68 total, 68 shown. The capture writes 40 body rows and then "(+28 more rows of 68)". The DataTables configuration sets 20 rows per page; the capture does not show how many rows the browser displays on the first page.

## Dialogs

### Add material part (`#addMaterialPart`) — opened by "Add material part" (top bar) and the plus icon button (panel heading)

Static markup, written in `weld__material__material-part.txt`. Header: close (×) button, title "Add material part". Body: a form with `method="post"`; the capture shows no `action` attribute.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Part | part | text | yes (HTML `required`) | empty | — |
| 2 | Custom | custom | text | no | empty | — |

No hidden inputs. No tabs in this dialog.

Buttons: "Add" (type submit, `name="addMaterialPart"`, btn-primary); "Cancel" (dismiss, btn default).
Text rules in the dialog: none.

### Edit material part (`#editMaterialPart`) — opened by the pencil icon in each row (`data-id` = row id)

The static markup has no body fields; the body is loaded when the pencil is clicked (see Rules). The fields below are the ones the click capture shows for row id 47 on the WeldPilot page (the same dialog; example values "Lateral-Bellow" / "Bellow"). Header: close (×) button, title "Edit material part".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Part | part (id `exampleInputEmail1`) | text | yes (HTML `required`) | the clicked row's Part (example: "Lateral-Bellow") | filled from the row by the server response |
| 2 | Custom | custom | text | no | the clicked row's Custom (example: "Bellow") | filled from the row by the server response |
| 3 | (hidden) editID | editID | hidden | — | the clicked row id (example: 47) | in the body, from the server response |
| 4 | (hidden) secureCode | secureCode (id `bookIdEditMaterialPartSecure`) | hidden | — | set by the pencil click handler; value not copied here | in the footer, in the static markup |

Buttons: "Update" (type submit, `name="editMaterialPart"`, btn-warning); "Cancel" (dismiss, btn default).
Text rules in the dialog: none.

### Delete material part (`#deleteMaterialPart`) — opened by the trash icon in each row (`data-id` = row id)

Header: close (×) button, title "Delete material part". Body: a form with `method="post"` and the text "Are you sure?".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) deleteID | deleteID (id `bookIdDeleteMaterialPart`) | hidden | — | set by the trash click handler to the row id | in the body |
| 2 | (hidden) secureCode | secureCode (id `bookIdDeleteMaterialPartSecure`) | hidden | — | set by the trash click handler; value not copied here | in the body |

Buttons: "Delete" (type submit, `name="deleteMaterialPart"`, btn-danger, trash icon); "Cancel" (dismiss, btn default).
Text rules in the dialog: "Are you sure?" (the only text in the body).

## Rules found in the page's JavaScript

Captured code: the shared page script in both captures (the page-specific handlers below are in it; the MTO capture shows them as already captured in the shared script).

- Edit click (`.open-editMaterialPart`): reads the row's `data-id`; builds a secure code from a fixed prefix, the row id and the suffix "mtpE"; writes it into `#bookIdEditMaterialPartSecure`; then requests the edit form for that id and writes the response into `#contentEditMaterialPart`. Request: GET `/core/ajax/editMaterialPart.php?id=<row id>` (the XHR log of the click capture shows the parameter `action=showroom` added). Response: the body with Part, Custom and hidden editID.
- Delete click (`.open-deleteMaterialPart`): reads the row's `data-id`; sets `.modal-body #bookIdDeleteMaterialPart` to the row id; builds a secure code from the same kind of prefix, the row id and the suffix "mtp", and sets `.modal-body #bookIdDeleteMaterialPartSecure` to it.
- Required: the Part input carries the HTML `required` attribute in both the Add and the Edit dialog. No custom validation or message for it is in the captured code.
- Page load: one request, GET `/core/ajax/ajax-notifications.php?action=count_unread` (notification count; from the shared script, not this page's controls).
- The shared script also contains requests to `/core/ajax/getListOfMaterials.php`, `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php` (parameters k, v), `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php` and `/core/ajax/searchFactors.php`. The capture does not show which controls trigger them; the handlers of this page's controls (add, edit, delete, search, export) do not call them in the captured code.
- Form submit targets (Add, Update, Delete) are not shown in the capture; no code for the submit handlers of these forms is in the captured lines.
- Button classes `btn-hideInsert`, `btn-hideEdit`, `btn-hideDelete` are on the submit buttons; the captured lines show no code that reads them.

## Sample data

- Total rows: 68. Rows shown in the footer: 68 ("Showing 1 to 68 of 68 entries").
- Custom: "-" in each of the 40 body rows the capture writes.
- Example rows (first 15 of the 40 written, in the order drawn; "row id" is the `data-id` of the row buttons, not a visible column):

| Part | Custom | Options | row id (data-id) |
|---|---|---|---|
| 22 1/2 Deg Elbow | - | edit, delete | 68 |
| Angular-Bellow | - | edit, delete | 45 |
| Ball Valve | - | edit, delete | 59 |
| Blind disk | - | edit, delete | 54 |
| Blind flange | - | edit, delete | 22 |
| Butterf. Valve | - | edit, delete | 56 |
| Cap | - | edit, delete | 7 |
| Conc. swage nipple | - | edit, delete | 17 |
| Conc.Reducer | - | edit, delete | 28 |
| Concentric Swage | - | edit, delete | 76 |
| Coupling | - | edit, delete | 19 |
| D. Plate Check V. | - | edit, delete | 73 |
| DP Check V. | - | edit, delete | 75 |
| ECC Swage | - | edit, delete | 79 |
| ECC Y-PIECE | - | edit, delete | 82 |

- From the browser-pass notes (`reference/montavar/raw/_interactive/I2a-welders-catalogs.md`, WeldPilot page, not seen in this MTOPilot capture): the row "Lateral-Bellow" with Custom "Bellow" exists (row id 47), and only 3 rows have Custom filled.

## Also present in the page, opened from elsewhere

`editCompanyData`, `passwordChange`, `themeChange`, `admin` ("System settings"), `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.

## Not in the capture

- Rows 41 to 68 of the 68 (the capture writes 40 body rows). Reached by paging or by the global search input; the footer in the capture shows only the info text, no paging links.
- Edit dialog body: loaded only after a pencil click; the example in this note comes from the WeldPilot click capture (`weld__material__material-part__edit`). Not captured on this MTOPilot page; open by clicking a row's pencil icon.
- Export outputs of "CSV", "Excel" and the print button: not captured.
- Scan QR floating button and its two menu items ("Scan material", "Scan service request"): the capture shows the markup only; the dialogs they open (`materialQrScanModal`, `srArchiveScanModal`) are listed above and not described.
- Result of the Add, Update and Delete submits: not captured (no submit was made).
