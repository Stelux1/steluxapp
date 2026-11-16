# MTO Pilot → Order / Take in → Materials list

Source: `mto__order__materials-list.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=material-list`.
State of the page for the observing account: normal.

## Page
- Browser title as captured: "- MTOPilot®".
- Breadcrumb: none in the capture. The top bar shows two links, "Zandbak" and "Materials list", both to `index.php?page=material-list`.
- Tabs: none.
- Panel title: "Materials list". Under the title: "Last refresh: 26.10.2026. 09:37" (plain text, not a control).
- Top bar, form `index.php?page=material-list` (method post): one icon-only submit button, `name="refreshIsoList"`, title "Refresh" (fa-refresh icon), class btn-sm btn-primary. The capture has no handler for it in the page's scripts; it submits the form back to the same page.
- Buttons in the panel heading (above the list), in order:
  - Icon-only primary button (`glyphicon glyphicon-plus`, no text, no title in the capture) → opens dialog `#addMaterial` ("Add material"), `data-toggle="modal"`. See Dialogs.
  - Icon-only default button (`glyphicon glyphicon-import`, no text) → link to `index.php?page=material-database-import`.
- Search box (above the table, see List).
- "Filter" (text "Filter", icon fa-sliders, class ft-btn) → opens dialog `#filterMaterialList` ("Filter materials"), `data-toggle="modal"`.
- "Excel" (class buttons-excel, href "#") and an icon-only print button (class buttons-print, fa-print, href "#"). The capture has no handler for either; they are DataTables Buttons elements.
- Page-wide floating button (class wsapps-handheld-fab-btn, title and aria-label "Scan QR", fa-qrcode) with two menu items: "Scan material" (`data-action="material-qr-scan"`) and "Scan service request" (`data-action="service-request-scan"`). The capture shows only these attributes; it does not show which dialog each one opens.

## List
- Table id `#datatableMaterialList`, class table table-striped table-bordered table-hover table-responsive, server-side (DataTables). Container `#datatableMaterialList_wrapper`.
- Columns in order (DT `cols` and header row "Project | Iso number | Ch.clean | Group | Mat.no. | Description | Qty. | Ord.? | Inv. | Picked"):
  1. Project (data 0)
  2. Iso number (data 1)
  3. Ch.clean (data 2)
  4. Group (data 3)
  5. Mat.no. (data 4)
  6. Description (data 5)
  7. Qty. (data 6)
  8. Ord.? (data 7)
  9. Inv. (data 8)
  10. Picked (data 9)
- Hidden columns: none (all ten have `vis: true`).
- All ten columns are sortable (`sort: true`).
- Default sort: `[[9, "asc"]]` = Picked, ascending.
- Page length options: 10, 20, 50, 100, 500 (select `name="datatableMaterialList_length"`, label "Show" … "entries"). Default: 20 (`cur="20"`).
- Per-column search inputs: none. One global search input: `#materialListSearch`, placeholder "Search", inside label `.wsapps-dt-search`, with a clear button `#materialListSearchClear` (aria-label "Clear", fa-times).
- Filters: the "Filter" dialog (see Dialogs): Project and Ordered.
- Row options: none. The rows have no action controls in the capture and there is no Options column.
- Bulk actions (Options menu): none. No row checkboxes and no select-all in the capture.
- Export / print buttons: "Excel" and print (see Page). No PDF or CSV button appears in the capture.
- Info text: "Showing 1 to 9 of 9 entries (filtered from 111,144 total entries)".
- Empty text: "No data available in table". Zero-match text in the DataTables config: "No matching records found".
- Server-side table request: `/core/ajax/ajax-table-materials.php?id=1&project=&ordered=&ndt=&pwht=&prio=&mto=&est=&weld=` (the DT `ajax` url). The XHR log shows the request with DataTables parameters appended: `draw`, `columns[i][data|name|searchable|orderable|search][value|regex]`; the rest of each URL is cut off in the capture.
- Config values from the DT object: `pageLength` 20, `total` 111144, `shown` 9.

## Dialogs

### Filter materials (`#filterMaterialList`) — opened by the "Filter" button (`.ft-btn`, href `#filterMaterialList`, data-toggle modal)
Form `#filterMaterialListForm`, action `index.php`, method get. Present in the page DOM (not opened in the capture).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | page | hidden, value `material-list` | – | `material-list` | – |
| 2 | Project | project | select (select2-single, data-control select2) | not flagged | "All" (shown as current value; value empty) | 2 options: (empty) → All ; 1 → 20240101 |
| 3 | Ordered | ordered | select (select2-single, data-control select2) | not flagged | "------" (shown as current value; value empty) | 3 options: (empty) → ------ ; no → No ; yes → Yes |

- Dialog buttons: "Filter" (btn-primary, type submit); "Cancel" (btn default, data-dismiss modal). Close icon button in the header (data-dismiss modal).
- Dialog title (H4): "Filter materials".
- Text rules in the dialog: none.
- Depends on: the capture shows no conditions for these fields.

### Add material (`#addMaterial`) — opened by the icon-only primary button in the panel heading (href `#addMaterial`, data-toggle modal)
Not in the capture of this page: the DOM of this page has no `#addMaterial` element. The body below is the one the capture of the Material database page holds for the same id (`mto__materials__material-database.txt`, lines 137–170). The capture of this page does not show whether it is the same on this page.

Form `#addMaterialDbForm`, method post (no action shown).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | projectSite | hidden, value `1` | – | `1` | – |
| 2 | Component code (ISO progress) (1=pipe, 2=supports, 3=appendages) | componentCode | text, placeholder "1=pipe, 2=supports, 3=appendages" | not flagged | empty | – |
| 3 | Material group | materialGroup | text | REQUIRED | empty | – |
| 4 | Article No | articleNo | text | not flagged | empty | – |
| 5 | Legacy No | legacyNo | text | not flagged | empty | – |
| 6 | Material No | materialNo | text (id `materialNo`) | not flagged | empty | – |
| 7 | DIA | dia | text | not flagged | empty | – |
| 8 | LBS/SCH | lbs | text | not flagged | empty | – |
| 9 | UOM | uom | select (select2-single, data-control select2) | not flagged | EA | 20 options: 1 EA ; 2 BX ; 3 M ; 4 SET ; 5 L ; 6 PAA ; 7 KG ; 8 DR ; 9 PAC ; 10 KIT ; 11 TON ; 12 M2 ; 13 H ; 14 P ; 15 EUR ; 17 STK ; 18 MTR ; 19 - ; 20 PC ; 21 pcs (value → text). EA is the current value. |
| 10 | Material part | materialPart | select (select2-single, data-control select2) | not flagged | Pipe | 68 options; first 10: 2 Pipe ; 3 Elbow 45 ; 4 Elbow 90 ; 5 Flange ; 6 Valve ; 7 Cap ; 8 Reducer ; 9 Nipolet ; 13 Outlet ; 14 Plug ; the remaining 58 are not listed here. Pipe is the current value. |
| 11 | Type of material | typeMaterial | select (select2-single, data-control select2) | not flagged | A234 Gr WPB / CS / Fitting / C-Si | 131 options; first 10: 3 A234 Gr WPB / CS / Fitting / C-Si ; 9 A106 Gr B / CS / Pipe / C-Si ; 10 A105 / CS / Flange / C-Si ; 11 A216 Gr WCB / CS / Valve / C-Si ; 12 A335 Gr P1 / HTCS / Pipe / 9Cr-1 Mo-V ; 13 A234 Gr WP1 / HTCS / Fitting / 9Cr-1 Mo-V ; 14 A182 Gr F1 / HTCS / Flange / 13CrMo4 4 ; 15 A217 Gr WC1 / HTCS / Valve / C-½ Mo ; 18 A312 RVS316L / SS / Pipe / 316L ; 19 A403 WP316L / SS / Fitting / SS ; the remaining 121 are not listed here. |
| 12 | Material description | description | text | not flagged | empty | – |

- Dialog buttons: "Add" (btn-primary, type submit, name `addMaterialDB`, class btn-hideInsert); "Cancel" (btn default, data-dismiss modal). Close icon button in the header.
- Dialog title (H4): "Add material".
- Text rules in the dialog: none beyond the REQUIRED flag on Material group.
- Depends on: the capture shows no conditions.

## Rules found in the page's JavaScript
Source: the page's own inline script (`SCRIPT-INLINE h=1tgqf90x1by`).

1. Toolbar relocation (`moveMaterialListToolbarControls(tries)`): tries to move the length select (`#datatableMaterialList_wrapper .dt-panelmenu .dataTables_length`) into `.ml-filter-toolbar .ft-length`, and the `.dt-buttons` block (`#datatableMaterialList_wrapper > .dt-buttons`, removing class `pull-right`) into `.ml-filter-toolbar .ft-filters`. If a target is missing it retries every 100 ms, up to 50 tries. The capture shows no element with `.ml-filter-toolbar`, `.ft-length`, `.ft-filters` or `.dt-panelmenu`, and the length select and `.dt-buttons` are still in the panel in the captured DOM.
2. Global search (`bindMaterialListSearch()`): needs the variable `tableMats` (not defined in this capture's inline code). If `tableMats` is undefined it returns false and is retried every 100 ms, up to 50 tries. Once bound: keyup and input on `#materialListSearch` call `tableMats.search(value).draw()` and toggle class `has-value` on the closest `.wsapps-dt-search` when the trimmed value is not empty.
3. Clear button (`#materialListSearchClear`): sets the search input to empty, triggers keyup, and focuses the input.
4. Preset search: a variable `preset` is set to an empty string; when empty nothing is applied.
5. Requests made by the page (from the XHR log):
   - `GET /core/ajax/ajax-table-materials.php` (DataTables server-side; parameters id, project, ordered, ndt, pwht, prio, mto, est, weld, draw, columns…). The log lists 21 such requests with draw=1 to draw=21.
   - `GET /core/ajax/ajax-notifications.php?action=count_unread` (header, not this table).
6. Requests in the shared inline script (the site-wide script, also present on other pages, first seen in earlier captures): `getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`. They are not specific to this page and are not described further.

No validation rules and no browser-side computed values were found for this page's dialogs.

## Sample data
- The table shows 9 rows. Info text: "Showing 1 to 9 of 9 entries (filtered from 111,144 total entries)". DT config: `total` 111144, `shown` 9.
- Page length shown: 20.

| Project | Iso number | Ch.clean | Group | Mat.no. | Description | Qty. | Ord.? | Inv. | Picked |
|---|---|---|---|---|---|---|---|---|---|
| 20240101 | 0001 | N/A | BOLTS A320-L43 | 8138268881 | BLT/N A320L43 CTD 8UN 1000MM 4IN | 3 | Yes | 0 | 0 |
| 20240101 | 0001 | N/A | BOLTS A320-L43 | 8138265581 | BLT/N A320L43 CTD 8UN 530MM 2.3/4IN | 2 | No | 0 | 0 |
| 20240101 | 0002 | - | BOLTS A320-L7 | 8138678259 | BLT/N A320 GR.L7M 8UN 300MM 1 IN | 2 | No | 0 | 0 |
| 20240101 | 0001 | N/A | FITTING 304 REE | 7636669711 | REE BW 304 XS/30 DN600X450 | 8 | Yes | 8 | 0 |
| 20240101 | 0001 | N/A | FITTING 316 ELB | 7633384771 | ELB BW 316 45DEG LR 100 DN450 | 13 | No | 0 | 0 |
| 20240101 | 0001 | N/A | FITTING CS FLG | 7662782601 | FLG PIPE WN A105 CL150 30 DN250 | 6 | Yes | 2 | 0 |
| 20240101 | 0001 | N/A | PIPE CS | 7430052832 | PIPE MET GR.B 30 250MM | 12 | Yes | 0 | 0 |
| 20240101 | 0001 | N/A | PIPE CS | 7430050581 | PIPE MET GR.B 80 DN40 | 6 | Yes | 6 | 0 |
| 20240101 | 0001 | N/A | TEST | 1 | test | 3 | No | 0 | 0 |

## Not in the capture
- The body of the "Add material" dialog as opened on this page (the DOM has no `#addMaterial`); the fields above come from the Material database capture. Control: the icon-only primary button in the panel heading.
- Rows beyond the 9 shown (DT `total` 111,144). Control: the search box, the Filter dialog, or paging of the table.
- Results of the Filter dialog (the form submits GET to `index.php` with `page=material-list`, `project`, `ordered`; the capture did not submit it). Control: "Filter" dialog → "Filter".
- Results of the search box (not typed into in the capture). Control: `#materialListSearch`.
- Output of "Excel" and the print button (href "#"; not clicked). Control: the two buttons in the panel heading.
- Output of the "Refresh" top-bar submit (not clicked). Control: the icon button in the top bar.
- Content of the "Import" link target (`index.php?page=material-database-import`) and the targets of the "Scan material" and "Scan service request" menu items (only the attributes are in the capture). Control: the icon button in the panel heading; the "Scan QR" floating button.
- Browser-pass notes: none in `reference/montavar/raw/_interactive/` cover this page (`page=material-list`). The notes describe sibling pages such as `page=material-order` and `page=material-receive`, not this one, so nothing is added from them.

Also present in the page, opened from elsewhere (not opened by a control on this page): `editCompanyData`, `passwordChange`, `themeChange`, `admin` (System settings, a plain div in the DOM with a single Update / Cancel footer), `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `srArchiveScanModal`, `materialQrScanModal`.
