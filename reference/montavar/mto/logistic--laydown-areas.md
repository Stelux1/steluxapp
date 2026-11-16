# MTOPilot → Logistic → Laydown areas

Source: `mto__logistic__laydown-areas.txt`, `mto__logistic__laydown-areas__edit.txt`, `mto__logistic__laydown-areas__history.txt`, `mto__logistic__laydown-area-127.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-laydowns`.
State of the page for the observing account: normal.

Detail pages reached from this list (described in the List section): `/mtopilot/index.php?page=material-laydowns&id=<id>` (captured for id 127) and `…&id=127&type=history`.

## Page

- Browser title: "Laydown areas - MTOPilot®".
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Top bar (above the list):
  - Link "Laydown areas" → `index.php?page=material-laydowns` (the current page).
  - Button "Add laydown" (dark-blue primary, `btn-sm btn-primary btn-block`, icon `glyphicon-plus`) → opens dialog `#addLaydown` (`href="#addLaydown" data-toggle="modal"`).
- Panel heading: icon `glyphicon-tasks` + text "Laydown areas", followed by an icon-only button (`glyphicon-plus`) → opens `#addLaydown`, the same as the top bar button.
- Export and print buttons above the table (DataTables buttons, `href="#"`, so they do no navigation in the capture): "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), and an icon-only print button (`buttons-print`, icon `fa-print`).
- Search box above the table: label icon `fa-search`, input placeholder "Search", clear button (icon `fa-times`, aria-label "Clear").
- Shared chrome on every page (not specific to this page): top app tiles MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®; language links Nederlands, English, Deutsch, Français; a floating "Scan QR" button (icon `fa-qrcode`) with the items "Scan material" and "Scan service request".

## List

- Table id `datatableWarehouse` (client-side, DataTables).
- Columns, in order:
  1. "Laydown" (data 0, sortable, visible)
  2. "Enabled on this site" (data 1, sortable, visible)
  3. "Options" (data 2, sortable, visible)
  4. checkbox column with a select-all checkbox in the header (`#checkAll`, the column title is the raw HTML `<input type="checkbox" id="checkAll">`; data 3, sortable, visible)
- Hidden columns: none.
- Default sort: column index 2 ("Options"), ascending (`order: [[2, "asc"]]`).
- Page length: default 20. Length options: 5, 20, 50, 100, 500.
- Per-column search inputs: none. Filters: none in the capture (only the global search box above).
- Row content:
  - "Laydown": the laydown name as a blue link to `index.php?page=material-laydowns&id=<id>`.
  - "Enabled on this site": the text "No" (all 8 rows in the capture).
  - "Options": two icon buttons:
    - pencil (`glyphicon-pencil`, `btn-xs btn-warning btn-block`, class `buttonEdit open-editLaydown`, `href="#editLaydown"`, `data-id="<id>"`, `data-toggle="modal"`) → opens dialog `#editLaydown` ("Edit laydown").
    - trash (`glyphicon-trash`, `btn-xs btn-danger btn-block`, class `buttonDelete open-deleteLaydown`, `href="#deleteLaydown"`, `data-id="<id>"`, `data-toggle="modal"`) → opens dialog `#deleteLaydown` ("Delete laydown").
  - Checkbox column: `name="ccid_<id>"`, `value="s<id>"`, id `id_<id>`, class `checkbox11`.
- Bulk actions (Options menu): not in the capture. The browser-pass notes say an "Options ▾" menu exists on the laydown list (from the browser-pass notes; its items were not captured).
- Export / print: CSV, Excel and print buttons as in Page above.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (footer rendered as "Showing 1 to 8 of 8 entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none. `serverSide: false`, `ajax: null`; the rows are in the HTML. The only request the list page makes on load is `/core/ajax/ajax-notifications.php?action=count_unread` (page-wide notifications).
- Note on the markup: the capture shows a second table without an id, holding only the header row (same four titles), whose DataTables configuration reports `TypeError: Cannot read properties of undefined (reading 'ajax')`. The data table is the one with id `datatableWarehouse`.

## Dialogs

### Add laydown (`#addLaydown`) — opened by the "Add laydown" top-bar button or the "+" icon in the panel heading

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | name | text | yes (`required`) | empty | none |

Body is in the page (not loaded on click). Label `for="input00"`; the input has no id in the capture. This is the only input in the dialog.

Buttons:
- "Add" — `btn btn-primary btn-hideInsert`, type submit, name `addLaydown`.
- "Cancel" — `btn default`, closes the dialog (`data-dismiss="modal"`).

Text rules in the dialog: none beyond the required field.

### Edit laydown (`#editLaydown`) — opened by the pencil button of a row (`.open-editLaydown`, `data-id` = row id)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Laydown | name | text | yes (`required`) | the row's laydown name (captured for id 127: "Farbara osnovi premaz") | body is empty in the list page and is loaded on click from `/core/ajax/editLaydown.php?id=<row id>` (see the XHR in the Edit capture; the body is then placed into `#contentLaydown`) |
| 2 | (no label) | editID | hidden | — | the row id (captured: 127) | written by the loaded body |

Notes on field 1 as returned by the server for id 127: the input has `id="exampleInputEmail1"` (the label still points to `input00`), `autocomplete="off"`, and the response carries `value` twice (the laydown name, then an empty value).

Buttons:
- "Update" — `btn btn-warning btn-hideEdit`, type submit, name `editLaydown`.
- "Cancel" — `btn default`, closes the dialog.

Text rules in the dialog: none.

### Delete laydown (`#deleteLaydown`) — opened by the trash button of a row (`.open-deleteLaydown`)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | deleteID | hidden (`id="bookIdDeleteLaydown"`) | — | empty in the page; the click handler sets it to the row id | filled from the clicked row's `data-id` |

Body text: "Are you sure?" (the only text in the dialog, in the form before the hidden field).

Buttons:
- "Delete" — `btn btn-danger btn-hideDelete`, type submit, name `deleteLaydown`, icon `glyphicon-trash`.
- "Cancel" — `btn default`, closes the dialog.

Count: 3 dialogs described, 4 fields (Add 1, Edit 2, Delete 1).

Also present in the page, opened from elsewhere (no control on this page points to them): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, showServiceHistory, pdfSpoolLocation, pdfSpoolLocationTabs, pdfPendingMaterials, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal, scan-menu items.

## Rules found in the page's JavaScript

- Edit button click (`jQuery(document).on("click", ".open-editLaydown", …)`): reads the row id (`myBookId`) and requests `/core/ajax/editLaydown.php?id=<myBookId>`; the response HTML is written into `#contentLaydown`. The XHR in the Edit capture also carries `action=showroom` (GET, status 200). The rest of this handler is in an earlier capture of the sweep and is not in this capture.
- Delete button click (`jQuery(document).on("click", ".open-deleteLaydown", …)`): sets the value of `.modal-body #bookIdDeleteLaydown` to `myBookId`.
- Required name field: `required` attribute only (add and edit); no custom validation rule in the capture.
- Select-all checkbox (`#checkAll`): no handler in the capture.
- Requests made by this page in the capture: `ajax-notifications.php?action=count_unread` (on load); `editLaydown.php?id=<id>&action=showroom` (when Edit is opened). The submit endpoints of Add, Update and Delete are not in the capture.
- Shared scripts on every page (DataTables, dialogs, notifications) are not described here.

## Sample data

Rows in the table: 8 of 8 (one page, 20 per page). Enabled on this site: "No" for all rows. Rows in the order the capture renders them:

| Laydown | Enabled on this site | Options (row id) |
|---|---|---|
| Farbara osnovi premaz | No | edit / delete (127) |
| Farbara završni premaz | No | edit / delete (128) |
| INEOS Lilo | No | edit / delete (89) |
| Marshalling Yard | No | edit / delete (101) |
| Nova Hala | No | edit / delete (126) |
| Prostor izmedju stare i nove hale | No | edit / delete (14) |
| Stara Hala | No | edit / delete (125) |
| Transportovano | No | edit / delete (129) |

Detail page of laydown 127 (`index.php?page=material-laydowns&id=127`): panel heading "Farbara osnovi premaz"; table with 6 columns (Project | ISO | Spool | PWHT | Chemical clean | No of services), total 1, "Showing 1 to 1 of 1 entries". One row, with 7 text cells: `20240101 | Template project | 0001 | SP01 | Yes | N/A | 0` (the first two cells read as the Project column). Default sort column 4 ascending. Plain text "0" (no link).

History page of laydown 127 (`…&id=127&type=history`): same panel heading and columns, total 3, "Showing 1 to 3 of 3 entries":

| Project | ISO | Spool | PWHT | Chemical clean | No of services |
|---|---|---|---|---|---|
| 20240101 \| Template project | 0003 | Spool J | No | - | 2 (link) |
| 20240101 \| Template project | 0001 | SP01 | Yes | N/A | 0 |
| 20240101 \| Template project | 0001 | SP01 | Yes | N/A | 0 |

The "2" link carries `data-id="1.895.34"`, `data-toggle="modal"`, `href="#showServiceHistory"`, `target="_blank"`. Browser-pass notes: PWHT shows green "Yes" and red "No" badges (from the browser-pass notes; the capture holds the text only).

## Not in the capture

- Options ▾ menu of the list (bulk actions): the browser-pass notes say it exists on this page; its items were not captured.
- Submit results of Add laydown (`addLaydown`), Update (`editLaydown`) and Delete (`deleteLaydown`): endpoints and responses not in the capture.
- Spool history dialog `#showServiceHistory` ("Spool history"): opened from the "No of services" link on the history page (`…&id=<id>&type=history`) when the count is not 0; its body is loaded on click and was not captured. Dialog id is listed above as present but not opened from the list.
- Laydown detail pages for ids other than 127: not captured.
- Rows beyond the first page: none (8 rows, page length 20).
