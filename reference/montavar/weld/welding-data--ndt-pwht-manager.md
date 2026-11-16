# Weld Pilot → Welding data → NDT/PWHT Manager

Source: `weld__welding__ndt-pwht-manager.txt` (tab NDT Pre), `weld__ndt-manager__ndt.txt` (tab NDT), `weld__ndt-manager__ndt-archive-pre.txt` (tab NDT archive PRE), `weld__ndt-manager__ndt-archive.txt` and `weld__ndt-manager__ndt-archive__view-1.txt`, `__view-2.txt`, `__view-3.txt` (tab NDT archive and its three views), `weld__ndt-manager__ndt-request-archive.txt` (tab NDT request archive), `weld__ndt-manager__ndt-request-162.txt` (one request opened from that archive), `weld__ndt-manager__pwht-request-manager.txt` (tab PWHT request manager), `weld__ndt-manager__pwht-archive.txt` (tab PWHT archive), `weld__ndt-manager__pwht-request-archive.txt` (tab PWHT request archive) — captured 2026-11-16 on the sandbox project site, read-only. Notes of the browser passes (`_interactive/I2c-releases-punch-flanges.md`, `_interactive/I1-weld-isometric.md`) are used where marked "from the browser-pass notes".

The menu item opens the tab "NDT Pre": URL `/weldpilot/index.php?page=ndt-requests-pre`. The other tabs have their own URLs (table in "Page").

State of the page for the observing account: normal (all eight tabs open and show data or an empty table).

## Page

One page group ("NDT requests manager" / "PWHT request manager") with a row of eight tabs (`UL.nav.nav-tabs.wsapps-ndt-tabs`) that is the same on every tab; the active tab is marked.

| # | Tab label | Link (href) | URL seen in capture | HTML title | Panel heading |
|---|---|---|---|---|---|
| 1 | NDT Pre | `index.php?page=ndt-requests-pre` | `?page=ndt-requests-pre` | NDT requests manager - WeldPilot® | NDT requests manager |
| 2 | NDT | `index.php?page=ndt-requests` | `?page=ndt-requests` | NDT requests manager - WeldPilot® | NDT requests manager |
| 3 | NDT archive PRE | `index.php?page=open-ndt-pre-welds&openresults=no` | same | - WeldPilot® (empty title before the dash) | Finished NDT + "Last refresh: 16.11.2026. 12:40" |
| 4 | NDT archive | `index.php?page=open-ndt-welds&openresults=no` | same | Open NDT welds - WeldPilot® | Finished NDT + "Last refresh: 16.11.2026. 12:40" (13:53 on the later view captures) |
| 5 | NDT request archive | `index.php?page=ndt-requests&type=archive&view=archive&from=01.11.2026&to=30.11.2026` (from/to = the current month) | captured with `from=01.01.2020&to=31.12.2026` | NDT requests manager - WeldPilot® | NDT request archive |
| 6 | PWHT request manager | `index.php?page=pwht-requests` | same | PWHT request manager - WeldPilot® | Welds |
| 7 | PWHT archive | `index.php?page=open-pwht-welds&openresults=no` | same | - WeldPilot® | Finished PWHT + "Last refresh: 21.03.2024. 11:41" |
| 8 | PWHT request archive | `index.php?page=pwht-requests&type=archive&view=archive&from=01.11.2026&to=30.11.2026` | captured with `from=01.01.2020&to=31.12.2026` | PWHT request manager - WeldPilot® | PWHT request archive |

Breadcrumb (top bar): "Zandbak" (project site name, link `index.php?page=ndt-requests&project=`; on the PWHT tabs `index.php?page=pwht-requests&project=`) → "NDT requests manager" (or "PWHT request manager") → last entry per tab:
- NDT Pre: "NDT PRE" (element `#titleNDT`, link `#`). NDT: "NDT" (same element). The scripts of the PWHT page set `#titleNDT` to "NDT PRE" on a click of `.t1` and to "NDT" on `.t2`; no element with those classes is in the captures.
- NDT archive PRE: "Finished NDT - Pre". NDT archive: "Finished NDT" (view 2: "Open NDT results", view 3: "Open NDT welds"). PWHT archive: "Finished PWHT".
- NDT request archive: "NDT request archive" (link `index.php?page=ndt-requests&project=&type=archive`). One request opened from it: "R00162" (link `index.php?page=ndt-requests&project=&type=archive&report=162&from=&to=`). PWHT request archive: "PWHT request archive".

Buttons above the list / in the top bar, per tab:

| Tab | Button (label → target) |
|---|---|
| NDT Pre | "Filter" (icon fa-sliders, `btn-sm btn-primary btn-block`) → opens `#filterNdtWelds`; **hidden** in the capture (`HID`). In the panel heading (title "NDT requests manager"): a printer-icon button, label "Generate Mass NDT request PRE" (`#laydownTransportID2`, class `open-pdfNdtRequestLanguagePreMass`, tooltip "Generate Mass NDT request", `data-id="10"`) → opens `#pdfNdtRequestLanguagePreMass`; **hidden** until at least one row checkbox is ticked (script). Also a hidden GET form (`action=/weldpilot/index.php`) with hidden inputs `page`=ndt-requests, `type`, `from`, `to` (no visible control). |
| NDT | Same pattern. "Generate Mass NDT request" (`#laydownTransportID`, class `open-pdfNdtRequestLanguageMass`, tooltip "Generate Mass NDT request", `data-id="10"`) → opens `#pdfNdtRequestLanguageMass`; hidden until a row is ticked. Hidden GET form with `page`=ndt-requests, `type`, `from`, `to`. The "Filter" button of this tab is not written out in the NDT capture (it was elided as already captured); its dialog `#filterNdtWelds` is in the NDT capture with hidden `page`=ndt-requests. |
| NDT archive PRE, NDT archive, PWHT archive | Top bar: "Switch view" (dropdown, `btn-sm btn-primary btn-block`, `data-toggle="dropdown"`) with three links (below); "Refresh" (fa-refresh) → `index.php?page=open-ndt-pre-welds&refresh=ok&openresults=no` (NDT archive: `open-ndt-welds`, PWHT archive: `open-pwht-welds`); "Print" (fa-print, `target=_blank`, **hidden**) → `../core/pdf/openNdtWelds.php?project=&weldType=&openresults=no&projectsite=1` (PWHT archive: `../core/pdf/openPwhtWelds.php?…`; NDT archive PRE also uses `openNdtWelds.php`); "Export" (fa-file-excel-o, `target=_blank`) → `../mtopilot/export-ndt-pre.php?&openresults=no&projectsite=1` (NDT archive: `../mtopilot/export-ndt.php?&openresults=no&projectsite=1`; PWHT archive: `../mtopilot/export-pwht.php?&openresults=no&projectsite=1`); "Filter" (fa-sliders) → opens `#filterIsoList`. (The "Filter" line of the NDT archive and PWHT archive captures was elided as already captured; the NDT archive PRE capture has it with `href="#filterIsoList" data-toggle="modal"`.) Order in the bar: Switch view, Refresh, Print (hidden), Export, Filter. |
| NDT request archive, PWHT request archive | No toolbar button. A filter form inside the panel body (see List). |
| PWHT request manager | No top-bar button. Panel heading "Welds": a printer-icon button, label "Generate Mass Pre-HT/PWHT request" (class `open-pdfPwhtRequestLanguage`, tooltip "Generate Mass Pre-HT/PWHT request", `data-id="38843"`) → opens `#pdfPwhtRequestLanguage`; **visible** in the capture (it has no id, so the hide/show script does not touch it). In the same heading a project select `name="project"` (see List) that submits the form on change. |
| NDT request 162 (detail) | No toolbar. A button "Restart NDT process" (hidden until a row checkbox is ticked). |

"Switch view" links, per tab:

| Tab | Link label → href |
|---|---|
| NDT archive PRE | "Finished NDT Pre" → `index.php?page=open-ndt-pre-welds&project=&weldType=&openresults=no`; "Open NDT results Pre" → `…&openresults=ok`; "Open NDT welds Pre" → `index.php?page=open-ndt-pre-welds&project=&weldType=` |
| NDT archive | "Finished NDT" → `index.php?page=open-ndt-welds&project=&weldType=&openresults=no`; "Open NDT results" → `…&openresults=ok`; "Open NDT welds" → `index.php?page=open-ndt-welds&project=&weldType=` |
| PWHT archive | "Finished PWHT" → `index.php?page=open-pwht-welds&project=&weldType=&openresults=no`; "Open PWHT results" → `…&openresults=ok`; "Open PWHT welds" → `index.php?page=open-pwht-welds&project=&weldType=` |

Below the table of the tabs NDT Pre, NDT, NDT request archive and the request detail there is a collapsed blue panel `#aiNdtPanel` with heading "AI NDT Suggestions" (collapse toggle `#aiNdtBody`): text "AI-powered recommendations based on weld properties and history.", a button "Analyze selected welds" (`#aiNdtAnalyze`, fa-bolt), hidden alert "Select one or more welds to get AI suggestions.", hidden "Analyzing..." and an empty hidden results area. (See rules.)

## List

### Tab NDT Pre (`#datatable3`) and tab NDT (`#datatable3z`)

Client-side table (DT: `serverSide:false`, `ajax:null`), no per-column search inputs, no export/print buttons. A search box above the table (placeholder "Search", magnifier icon, clear button with aria-label "Clear"). DT configuration line: `pageLength` 10, `lengthMenu` [10,25,50,100], `order` [[13,"asc"]] (column "Proces"); the page script then re-initialises both tables with `ordering:true, order:[], info:false, lengthChange:false, dom:'frt', columnDefs:[{orderable:false, targets:-1}]` (the last column is not sortable). The DOM shows only the search box and the table (no length menu, no info line, no pager): the NDT tab draws all 16 rows. Empty text: "No data available in table"; no-match text: "No matching records found"; info format (DT config): "Showing _START_ to _END_ of _TOTAL_ entries" (not drawn, `info:false`).

Columns (16, all visible, all sortable except the last):

| # | NDT Pre tab | NDT tab |
|---|---|---|
| 0 | Project | Project |
| 1 | ISO | ISO |
| 2 | Weld no. | Weld no. |
| 3 | Type | Type |
| 4 | Welder | Welder |
| 5 | NDT Pre | NDT |
| 6 | NDT R/Nr. | NDT R/Nr. |
| 7 | Idx. No. | Idx. No. |
| 8 | Chg.No. | Chg.No. |
| 9 | Material 1 (grey badge "1") | Material 1 (badge "1") |
| 10 | Ind.No. | Ind.No. |
| 11 | Chg.No. | Chg.No. |
| 12 | Material 2 (badge "2") | Material 2 (badge "2") |
| 13 | Proces | Proces |
| 14 | WPS | WPS |
| 15 | header checkbox `#checkAll` (Pre) / `#checkAll2` (NDT) | same |

Cell contents (from the NDT tab rows; the NDT Pre tab has no rows in the capture):
- Type: a link-like text "WS" or "FW" with a tooltip giving the weld type name ("Shop weld", "Butt Weld - Shop", "Butt Weld - Field", "Branch welds- Field"); "-" when the weld has no type.
- Welder: the welder code (e.g. "ML396") with a tooltip showing a small picture and the welder's name.
- NDT cell: a link "Yes" (class `open-showNDO`, `href="#showNDO"`, `data-id` = weld id, `data-toggle="modal"`). Its tooltip is "Create/Update NDT Request" when the weld has no request number yet and "Enter NDT Request results" when it has one. Extra icons in the same cell, in this order: a printer icon (class `open-pdfNdtRequestLanguage`, tooltip "Generate & Print NDT Request", `href="#pdfNdtRequestLanguage"`, `data-id` = weld id) on welds without a request; or, on welds with a request, an ellipsis icon (tooltip "In progress"), then a file icon: either a direct link `/core/pdf/ndt-request-regenerate.php?reportId=<id>&kind=ndt` (new tab, tooltip "Open archived NDT Request") or a dialog opener (class `open-showWeldNdtArchive`, `href="#showWeldNdtArchive"`, tooltip "Show NDT archive"); and, on one weld, a further printer icon (class `open-pdfNdtRequestLanguageAdditional`, tooltip "Generate & Print NDT Request", `href="#pdfNdtRequestLanguageAdditional"`). The capture does not show which rule decides between the direct file link and the dialog opener (row 006 has one request number and the dialog opener, row 013 has one request number and the direct link).
- NDT R/Nr.: request number(s) like "R00011" or "R00161, R00162", or "-".
- Material 1 / Material 2 cells contain two text parts (material grade and item type, e.g. "A106 Gr B" and "Pipe"; "A105" and "WN OR Fl"; "A106 Gr B" and "Cap"). Proces and WPS show "-" when empty.
- Last column: a checkbox (`name="ids[]"`, class `checkbox11x`, value = weld id) on only some rows (rows with weld ids 42, 4 and 41 in the sample); "-" on the others.
- The NDT Pre tab, by its scripts, uses class `checkbox11` for the row checkboxes and the handlers `open-showNDOPre` (dialog `#showNDOPre`), `open-pdfNdtRequestLanguagePre` (`#pdfNdtRequestLanguagePre`), `open-pdfNdtPreRequestLanguageAdditional` (`#pdfNdtPreRequestLanguageAdditional`) and `open-showWeldNdtPreArchive` (`#showWeldNdtPreArchive`); the capture has no rows, so the icons and their order on the Pre tab are not shown.

Bulk action: tick checkboxes (header checkbox ticks all rows that match the current search) → the printer-icon "Generate Mass NDT request (PRE)" button appears in the panel heading.

Filter: button "Filter" → `#filterNdtWelds` (see Dialogs); marked hidden (`HID`) in the NDT Pre capture.

### Tabs NDT archive PRE, NDT archive, PWHT archive (`#datatableOpenNdtPreList`, `#datatableOpenNdtList`, `#datatableOpenPwhtList`)

Server-side tables. `ajax` URLs (as in the DT line; parameters empty unless a filter is set):
- NDT archive PRE: `/core/ajax/ajax-table-open-welds-ndt-pre.php?projectsite=1&openresults=no&project=&ndt=&pwht=&weldType=&mto=&est=&weld=&result=`
- NDT archive (all three views): `/core/ajax/ajax-table-open-welds-ndt.php?projectsite=1&openresults=<no|ok|empty>&project=&ndt=&pwht=&weldType=&mto=&est=&weld=&result=` (view 1 `no`, view 2 `ok`, view 3 empty)
- PWHT archive: `/core/ajax/ajax-table-open-welds-pwht.php?projectsite=1&openresults=no&project=&ndt=&pwht=&weldType=&mto=&est=&weld=&result=`

The requests also carry the standard DataTables server-side parameters (`draw`, `columns[i][data|name|searchable|orderable|search…]`, …). `pageLength` 20; `lengthMenu` 10, 20, 50, 100, 500 (a "Show [20] entries" select, name `datatableOpenNdtPreList_length` / `datatableOpenNdtList_length` / `datatableOpenPwhtList_length`, default 20); default order column 18 ascending (the last, header-less column); a processing indicator (`…_processing`, hidden); a search box (placeholder "Search" with clear button); a "Print" link at the top of the table (`#ToolTables_…_4`, title "View print view", `DTTT_button_print`). No per-column search inputs. Info text: "Showing _START_ to _END_ of _TOTAL_ entries", with "(filtered from N total entries)" when filtered. Empty text "No data available in table"; no-match text "No matching records found".

Columns (19, all visible and sortable):

| # | NDT archive PRE / NDT archive | PWHT archive |
|---|---|---|
| 0 | Project | Project |
| 1 | ISO No | ISO No |
| 2 | WN | WN |
| 3 | Type | Type |
| 4 | Welder | Welder |
| 5 | Dia.(inch) | Dia.(inch) |
| 6 | Date | Date |
| 7 | NDT process | PWHT process |
| 8 | Result | Result |
| 9 | Idx 1 | Idx 1 |
| 10 | Chg.No. 1 | Chg.No. 1 |
| 11 | Material 1 | Material 1 |
| 12 | Idx 2 | Idx 2 |
| 13 | Chg.No. 2 | Chg.No. 2 |
| 14 | Material 2 | Material 2 |
| 15 | WPS | WPS |
| 16 | Doc. | Doc. |
| 17 | Rep. No | Rep. No |
| 18 | (empty header, `&nbsp;`) — an "Open" link | same |

Columns 2 to 17 have header tooltips (the header HTML is cut off in the capture, the tooltip texts are not readable). Row option: link "Open" → `index.php?page=isometrics&id=<iso id>&project=1` (opens in a new tab). No row checkboxes, no bulk actions, no Options menu.

The three views of "NDT archive" differ in what the server returns, with the same columns: view 1 "Finished NDT" (Result "Accepted" / "NA"), view 2 "Open NDT results" (Result "---", i.e. no result yet), view 3 "Open NDT welds" (no rows in the sandbox).

### Tab NDT request archive and tab PWHT request archive

Plain (non-DataTables) table with no search box, no pager, no sort controls, no per-column search; all rows are in the page. Above the table a GET form (page controls, not a dialog):

| # | Label | name | Type | Default (NDT request archive / PWHT request archive) | Options |
|---|---|---|---|---|---|
| 1 | (none) | `page` | hidden | `ndt-requests` / `pwht-requests` | |
| 2 | (none) | `type` | hidden | `archive` | |
| 3 | (none) | `project` | hidden | empty | |
| 4 | Project | `project` | select (select2) | "All projects" | 2 options: `0` → All projects; `1` → 20240101 |
| 5 | NDT (NDT request archive only) | `pre` | select (select2) | "NDT" | 2 options: empty value → NDT; `pre` → NDT Pre |
| 6 | From Date | `from` | text, class `dpicker`, placeholder "From date" | 01.01.2020 in the capture (01.11.2026 in the request-162 view) | format dd.mm.yyyy |
| 7 | To Date | `to` | text, class `dpicker`, placeholder "To date" | 31.12.2026 (30.11.2026 in the request-162 view) | |
| 8 | (icon button, no label) | `search` | submit, class `btn-default`, icon glyphicons-search | | |

(The visible text on the submit button is empty; the aria/tooltip text is not in the capture. The earlier browser-pass notes call it the "Filter" button.)

Columns: "Date" | "Request number" | "Welds" | "Options" (the capture has these four header texts only as one concatenated header line, "Date Request number Welds Options").
- NDT request archive cells: Date (format `dd.mm.yyyy. hh:mm`); Request number = link to `index.php?page=ndt-requests&type=archive&report=<id>&project=&from=<from>&to=<to>`; Welds = a count; Options = a printer-icon button (orange `btn-warning btn-xs`, new tab) → `/core/pdf/ndt-request-regenerate.php?reportId=<id>&kind=ndt`, and a button "Undo" (`btn-default btn-xs`) → the same URL as the request-number link.
- PWHT request archive cells: Date; Request number (plain text, no link, 5 digits); Welds count; Options = a printer-icon button (orange, new tab) → `../core/export/down.php?file=<yyyymmdd>_R<number>-PWHT-Request.pdf`. No "Undo".

### Request detail (NDT request archive, one request: `…&type=archive&report=162`)

Same filter form as above (defaults From 01.11.2026, To 30.11.2026), then a plain table with header "ISO | Weld no. | NDT | [checkbox, title "Check all", class `wsapps-ndt-undo-all"]". One row per weld and NDT process of the request; each row has a checkbox (class `wsapps-ndt-undo-pick`, no `name`, attributes `data-weld`, `data-report`, `data-process`, `data-pre`, `data-result`). Below the table: the button "Restart NDT process" (class `wsapps-ndt-undo-selected`, hidden until at least one box is ticked).

### Tab PWHT request manager (`#datatable3`)

Plain table (no DataTables line, no search box, no pager in the DOM). Panel heading "Welds", project select (see Page). Columns (15): Project | Isometric | Weld no. | Type | Welder | PWHT | Ind.No. | Chg.No. | Material 1 | Ind.No. | Chg.No. | Material 2 | Proces | WPS | header checkbox `#checkAll2`.
Cells: Isometric = link to `index.php?page=isometrics&id=<iso id>&project=1` (new tab); Type = "WS"/"FW" with tooltip, "-" if none; Welder = code with tooltip (name and picture); PWHT cell = link "Yes" (class `open-showPWHT`, `href="#showPWHT"`, `data-id` = weld id, `data-toggle="modal"`) plus either a printer icon (class `open-pdfPwhtRequestLanguage`, tooltip "Generate & Print PWHT Request", `href="#pdfPwhtRequestLanguage"`) or a file icon (tooltip "Open archived PWHT Request", link `../core/export/down.php?file=_R-PWHT-Request.pdf`, new tab); last column = checkbox (`name="ids[]"`, class `checkbox11x`, value = weld id).

## Dialogs

Only dialogs that a control of these tabs opens. All are Bootstrap modals (`data-toggle="modal"`). The body of most is not in the capture: it is requested when the link is clicked (the endpoint is named in "Rules").

### Filter (`#filterNdtWelds`) — opened by "Filter" in the top bar of tab NDT Pre / NDT

Form `action="index.php"`, `method="get"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | `project` | select (select2) | no | "---Any---" (empty value) | 2 options: (empty) → ---Any---; 1 → 20240101 |
| 2 | Welder | `welder` | select (select2) | no | "---Any---" | 3 options: (empty) → ---Any---; 2 → [W01]; 28 → [ML396] person A |
| 3 | Type | `weldType` | select (select2) | no | "---Any---" | 18 options: (empty) → ---Any---; 4 → [FW] Butt Weld - Field; 17 → [FW] Branch welds- Field; 18 → [WS] Socked welds -Shop; 19 → [WS] Butt Weld - Shop; 20 → [WS] Reinforcment Pad GW -Shop; 21 → [WS] Branch welds- Shop; 23 → [FW] Socked welds -Field; 24 → [FW] Reinforcment Pad GW -Field; 25 → [WS] Longitudinal Welds - Shop; 26 → [WS] Longitudinal Welds - Field; 27 → [WS] Reinforcment Pad FW - Shop; 28 → [WS] Fillet Weld - Shop; 29 → [FW] Fillet Weld - Field; 30 → [YTI] HOOK-UP; 31 → [WS] Victaulic Joint-Shop; 32 → [FW] Victaulic Joint-Field; 33 → [FW] Reinforcment Pad FW - Field |
| 4 | (none) | `page` | hidden | | `ndt-requests-pre` (NDT Pre tab) / `ndt-requests` (NDT tab) | |

Buttons: "Go" (`btn-primary`, `name="filterSpools"`, submit), "Cancel" (`btn-default`, `data-dismiss="modal"`). Title "Filter", close icon in the header.

### Filter welds by project (`#filterIsoList`) — opened by "Filter" in the top bar of NDT archive PRE / NDT archive / PWHT archive

Form `method="get"` (no action). Title "Filter welds by project". Three variants.

Variant A — NDT archive PRE, NDT archive view 1 (`openresults=no`), PWHT archive:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `page` | hidden | | `open-ndt-pre-welds` / `open-ndt-welds` / `open-pwht-welds` | |
| 2 | Project | `project` | select (select2) | no | "All" (empty value) | 2 options: (empty) → All; 1 → 20240101 |
| 3 | NDT process | `ndt` | select (select2) | no | "All" | 5 options: (empty) → All; 1 → RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1; 4 → MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x; 5 → PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x; 13 → TOFD - Execution: NEN-EN-ISO 10863 / Acceptance NEN-EN-ISO 15626 L1 (the PWHT archive dialog carries this same "NDT process" field with the same options) |
| 4 | Result | `result` | select (select2) | no | "All" (the `*` marks the empty option) | 3 options: (empty) → All*; 1 → Accepted; 2 → NA |
| 5 | Tracer (inside a hidden `div.control-group`) | `tracer` | select (select2) | no | "All" | 3 options: (empty) → All*; 1 → Yes; 2 → No. The whole group is hidden (`HID`); the capture shows no rule that reveals it. |
| 6 | (none) | `openresults` | hidden | | `no` | |

Variant B — NDT archive view 2 (`openresults=ok`) and view 3 (no `openresults`): only fields `page` (hidden, `open-ndt-welds`), `project` (same select as above) and `openresults` (hidden; value `ok` in view 2, empty in view 3).

Buttons in all variants: "Filter" (`btn-primary`, `name="filterOpenNDTWelds"`, submit), "Cancel" (`data-dismiss="modal"`).

### NDT (`#showNDO`) — opened by the "Yes" link in the NDT column of tab NDT (`.open-showNDO`)

Shell: header "NDT" with close icon; footer buttons "Save" (`btn-warning btn-hideEdit`, `name="editNdtRequest"`, submit) and "Cancel". The body (`#contentShowNDO`) shows "Loading..." and is filled from `/core/ajax/showNDO.php?id=<weld id>`; if no weld id: warning "Missing weld id". The body is **not in these captures**.

From the browser-pass notes (the same dialog opened from an isometric page, body "NDT <project> / <iso> / <weld>"): Welder and Welder 2 shown read-only; NDT location (greyed); Request number (disabled); five columns "NDT process" (processes required by the request are ticked, others empty), each with Film Nr., NDT Rp/Nr., NDT date and NDT res. (----/NA/Accepted); under column 1 (greyed until result NA) NA length (mm), Defect type, Welder for error; under column 2 "ReWeld?"; a hidden tracer panel ("Enable tracers", up to 2 tracer welds per rejected weld, "Save tracers") that appears only on result NA; NDT documents upload with "Check for delete"; a "Restart NDT process" toggle with per-process checkboxes and "Are you sure?"; Save / Cancel. A weld with result NA and ReWeld ticked and an accepted weld were seen with the same layout.

### NDT Pre (`#showNDOPre`) — opened by the "NDT Pre" cell link (`.open-showNDOPre`) of tab NDT Pre

Shell: header "NDT Pre"; footer "Save" (`btn-warning btn-hideEdit`, `name="editNdtRequestPre"`, submit), "Cancel". Body `#contentShowNDOPre` ("Loading..."), filled from `/core/ajax/showNDOPre.php?id=<weld id>`; "Missing weld id" if none. Body **not in the captures**. From the browser-pass notes: titled "NDT Pre <project> / <iso> / <weld>", fields Welder (select), NDT location (greyed), Request number, columns of processes with Accepted results, NA length greyed, documents, "Restart NDT process".

### NDT archive (`#showWeldNdtArchive`) — opened by the file icon "Show NDT archive" in the NDT column (tab NDT)

Shell: header "NDT archive", footer "Close". Body `#contentShowWeldNdtArchive`, from `/core/ajax/showWeldNdtArchive.php?id=<weld id>`. Not in the captures. From the browser-pass notes: a table "Document | Date | Details" with a document name like `<yyyymmdd>_R<number>-NDT-Request.pdf`, a date, and a "Details" link to `index.php?page=ndt-requests&type=archive&report=<id>`.

### NDT Pre archive (`#showWeldNdtPreArchive`) — opened by `.open-showWeldNdtPreArchive` (tab NDT Pre; no row in capture)

Shell: header "NDT Pre archive", footer "Close". Body from `/core/ajax/showWeldNdtPreArchive.php?id=<weld id>` into `#contentShowWeldNdtPreArchive`. Not in the captures. From the browser-pass notes: one row per request with Details links `…&pre=pre&report=<id>`.

### PWHT request (`#showPWHT`) — opened by the "Yes" link in the PWHT column of tab PWHT request manager (`.open-showPWHT`)

Shell: header "PWHT request"; footer "Save" (`btn-warning`, `name="editPwhtRequest"`, submit), "Cancel". Body `#contentShowPWHT` ("Loading..."), from `/core/ajax/showPWHT.php?id=<weld id>`; "Missing weld id" if none. Not in the captures. From the browser-pass notes: titled "PWHT request <project> / <iso> / <weld>", section "PWHT" with PWHT location (select, 3 locations), PWHT process (e.g. "PWHT (Procedure 001)"), PWHT Rq/Nr. (select), PWHT Date, PWHT Rp/Nr., checkbox "PWHT 100%", Document (one PDF), Save / Cancel.

### NDT Request (`#pdfNdtRequestLanguage`) — printer icon "Generate & Print NDT Request" in the NDT column (tab NDT; `.open-pdfNdtRequestLanguage`)

Form `action="../core/pdf/ndt-request.php"`, `method="get"`, `target="_blank"`. Title "NDT Request". Body: an info alert (text: when the request is generated its data can no longer be changed, check the data first), then the hidden inputs, then `#contentPdfNdtRequestLanguage` (filled from `/core/ajax/pdfNdtPwhtRequestLanguage.php?id=<weld id>`; the filled body is not in the captures). Footer: "Go" (`btn-primary`, `name="go"`, submit, `onclick="refreshIt()"`), "Cancel".

Hidden inputs, document order (identical in the five single/mass NDT request dialogs below, except where noted):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `selectedIDS` (only in the two Mass dialogs; `id="tck"` NDT mass, `id="tck22"` Pre mass) | hidden | | empty; filled by the script with the comma-separated ids of the ticked rows | |
| 2 | (none) | `sourcePage` | hidden | | `ndt-requests-pre` (captured on NDT Pre), `ndt-requests` (NDT tab) | |
| 3 | (none) | `sourceProject` | hidden | | empty | |
| 4 | (none) | `weldType` | hidden | | empty | |
| 5 | (none) | `welder` | hidden | | empty | |
| 6 | (none) | `sourceSite` | hidden | | `1` | |

### NDT Request — additional (`#pdfNdtRequestLanguageAdditional`) — printer icon on a weld that already has a request (tab NDT; `.open-pdfNdtRequestLanguageAdditional`)

Form `action="../core/pdf/ndt-request-additional.php"`, GET, `target="_blank"`. Title "NDT Request". Hidden inputs as in the table above (rows 2 to 6). Body `#contentPdfNdtRequestLanguageAdditional` from `/core/ajax/pdfNdtPwhtRequestLanguageAdditional.php?id=<weld id>`. Footer "Go" (`onclick="refreshIt()"`), "Cancel".

### NDT Request Pre — additional (`#pdfNdtPreRequestLanguageAdditional`) — handler `.open-pdfNdtPreRequestLanguageAdditional` (tab NDT Pre; no row in capture)

Form `action="../core/pdf/ndt-request-pre-additional.php"`, GET, `target="_blank"`. Title "NDT Request Pre". Hidden inputs rows 2 to 6. Body `#contentPdfNdtPreRequestLanguageAdditional` from `/core/ajax/pdfNdtPwhtRequestLanguageAdditionalPre.php?id=<weld id>`. Footer "Go", "Cancel".

### NDT Request — mass (`#pdfNdtRequestLanguageMass`) — "Generate Mass NDT request" (tab NDT)

Form `action="../core/pdf/ndt-request-mass-site.php"`, GET, `target="_blank"`. Title "NDT Request". Hidden inputs rows 1 to 6 (`selectedIDS` has `id="tck"`). Body `#contentPdfNdtRequestLanguageMass` from `/core/ajax/pdfNdtPwhtRequestLanguage.php?id=<id>&mass=ok&ids=<ids>`. Footer "Go" is disabled while the body loads. "Cancel".

### NDT Request — Pre single (`#pdfNdtRequestLanguagePre`) — handler `.open-pdfNdtRequestLanguagePre` (tab NDT Pre; no row in capture)

Form `action="../core/pdf/ndt-request-pre.php"`, GET, `target="_blank"`. Title "NDT Request". Hidden inputs rows 2 to 6. Body `#contentPdfNdtRequestLanguagePre` from `/core/ajax/pdfNdtPwhtRequestLanguagePre.php?id=<weld id>`. Footer "Go", "Cancel".

### NDT Request — Pre mass (`#pdfNdtRequestLanguagePreMass`) — "Generate Mass NDT request PRE" (tab NDT Pre)

Form `action="../core/pdf/ndt-request-mass-site-pre.php"`, GET, `target="_blank"`. Title "NDT Request". Hidden inputs rows 1 to 6 (`selectedIDS` has `id="tck22"`). Body `#contentPdfNdtRequestLanguagePreMass` from `/core/ajax/pdfNdtPwhtRequestLanguagePre.php?id=<id>&mass=ok&ids=<ids>`. Footer "Go" (disabled while loading), "Cancel".

### PWHT request (`#pdfPwhtRequestLanguage`) — "Generate Mass Pre-HT/PWHT request" and the row printer icon "Generate & Print PWHT Request" (tab PWHT request manager)

Info alert (outside the form): when a PWHT request is generated its data can no longer be changed. Form `method="get"`, `target="_blank"`; `action="../core/pdf/pwht-request-mass-site.php"` on the PWHT request manager tab (`../core/pdf/pwht-request.php` in the copy of the dialog on the NDT Pre tab).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `selectedIDS` (`id="tck22z"`) | hidden | | empty; filled with the ids of the ticked rows | |
| 2 | (none) | `project` | hidden | | empty | |
| 3 | (none) | `sourceProject` | hidden | | empty | |
| 4 | (none) | `sourceSite` | hidden | | `1` | |

Then `#contentPdfPwhtRequestLanguage`, filled from `/core/ajax/pdfPwhtRequestLanguage.php?id=<weld id>&type=pwht-requests&project=` (on the NDT Pre tab `type=ndt-requests-pre`, on the NDT tab `type=ndt-requests`). The filled body is not in the captures. Footer: "Go" (`name="go"`, submit, `onclick="refreshIt()"`), "Cancel".

Dialog rule found in the shell texts: the "Go" button of every request dialog calls `refreshIt()`, which reloads the page 300 ms after the click (the request PDF opens in a new tab).

## Rules found in the page's JavaScript

Inline script of the NDT Pre / NDT tabs (`wsappsNdt…` functions):
- On load the two mass buttons (`#laydownTransportID`, `#laydownTransportID2`) are hidden. `updateTextArea2()` (Pre table `#datatable3`, row boxes `input.checkbox11`) and `updateTextArea()` (NDT table `#datatable3z`, row boxes `input.checkbox11x`) collect the ids of the ticked boxes among the rows that match the current search (hidden rows do not count), write them comma-separated into `#tck22` and `#tck` (Pre) or `#tck` (NDT), and show the mass button when at least one id is ticked, otherwise hide it. They run on a click on a row box.
- `#checkAll` / `#checkAll2` tick or untick all rows that match the current search and untick the boxes of rows hidden by the search. A search (`search.dt`) clears the header checkbox.
- `window.wsappsNdtPreSelectedIds()` / `window.wsappsNdtSelectedIds()` return the ticked ids as CSV; the mass buttons use them (fallback: the value of `#tck22` / `#tck`).
- Both tables are initialised as DataTables with `ordering:true, order:[], info:false, lengthChange:false, dom:'frt'`, last column not orderable.

Request dialogs (shared script):
- `.open-pdfNdtRequestLanguage`, `…Additional`, `.open-pdfNdtPreRequestLanguageAdditional`, `.open-pdfNdtRequestLanguagePre` load the body with a GET (AJAX) to `/core/ajax/pdfNdtPwhtRequestLanguage.php`, `…Additional.php`, `…AdditionalPre.php`, `…Pre.php` with `id` = the clicked element's `data-id`. `.open-pdfNdtRequestLanguageMass` / `.open-pdfNdtRequestLanguagePreMass` first disable "Go", then request `pdfNdtPwhtRequestLanguage.php` / `pdfNdtPwhtRequestLanguagePre.php` with `id`, `mass=ok`, `ids` (the ticked ids). `.open-pdfPwhtRequestLanguage` requests `/core/ajax/pdfPwhtRequestLanguage.php` with `id`, `type` (`ndt-requests-pre`, `ndt-requests` or `pwht-requests` according to the tab) and `project` (empty).
- After the body is loaded, `__wsappsInitNdtRequestLanguageModal`: if the body has checkboxes named `ndt1` to `ndt5`, or the dialog is one of the two "Additional" ones, "Go" is disabled until at least one such checkbox is ticked and the submit is blocked when none is ticked (the alert text is in lines elided from the capture). If the body has checkboxes `ndt[]`, "Go" is disabled when none is ticked or when the body contains the marker `.__ndt_request_all_done`; on submit with none ticked or "all done" the form is blocked and a message is shown: "All NDT requests have already been created for the selected welds." (marker case) or, otherwise, "Please select at least one NDT process before generating the request." (texts can be overridden by the dialog attributes `data-msg-all-done`, `data-msg-select-process`).
- The ISO dialogs (`#pdfNdtRequestLanguageISO`, `#pdfNdtPreRequestLanguageISO`, not opened from these tabs) are filtered by the same script to the selected welds and carry the messages "Select one or more welds in the table first." and "None of the selected welds has an open NDT process.".

Result dialogs:
- `.open-showNDO` opens `#showNDO`, shows "Loading...", GETs `/core/ajax/showNDO.php?id=<weld id>`, fills `#contentShowNDO`, initialises the fields (`__wsappsInitAjaxModalFields`), the tracer panel (`__wsappsInitNdoTracerPanel`) and the NA-dependent fields (`__ndoShowNAUpdate`). `.open-showNDOPre` does the same with `showNDOPre.php` and `#contentShowNDOPre`. `.open-showPWHT` GETs `showPWHT.php` into `#contentShowPWHT`. `.open-showWeldNdtArchive` / `.open-showWeldNdtPreArchive` / `.open-showWeldPwhtArchive` GET `showWeldNdtArchive.php` / `showWeldNdtPreArchive.php` / `showWeldPwhtArchive.php` with `id`.

Restart (undo) of NDT processes (on the request detail page and inside the weld dialogs), request `/core/ajax/ndt-request-undo.php` (the HTTP method is not visible in the capture):
- Header checkbox `.wsapps-ndt-undo-all` ticks/unticks all `.wsapps-ndt-undo-pick`; any tick shows "Restart NDT process" (`.wsapps-ndt-undo-selected`); the header box follows the row boxes.
- Click on "Restart NDT process": with no tick the alert "Select at least one process"; else a confirm text "You are about to restart the selected NDT process.", with the added line "The NDT result for the selected process will be removed." when a ticked row has `data-result` 1 or 2, and "Are you sure?". Ticked rows are grouped by weld + report + pre flag; one request per group, one after the other, parameters `weld`, `report`, `processes` (comma-separated process ids), `pre`, `remove_weld`=0. An error shows the server's `error` text or "Undo failed".
- `.wsapps-ndt-undo` (single process): confirm "Undo this process and remove this weld from the request?" when `data-remove-weld`=1, else "Undo this process on this request?"; parameters `weld`, `report`, `process`, `pre`, `remove_weld`.
- In a weld dialog (`.wsapps-ndt-weld-undo`): `.wsapps-ndt-undo-open` toggles the restart panel; ticking `.wsapps-ndt-weld-undo-pick` shows the confirm block, and a hint (`.wsapps-ndt-undo-msg-result`) when a ticked process already has a result (`data-result` 1 or 2); `.wsapps-ndt-weld-undo-go` sends `weld`, `report`=0, `processes`, `pre`, `remove_weld`=0, `scope`="weld"; with no tick it stops.

PWHT request manager inline script: `updateTextArea2()` writes the values of all checked boxes in `#datatable3` into `#tck22z` and `#tck`; `#checkAll2` ticks all `.checkbox11x`; a click on any input in `#datatable3` runs `updateTextArea2`; `.t1` / `.t2` set `#titleNDT` to "NDT PRE" / "NDT". `refreshIt()` / `refreshPage()` (NDT Pre page script): `window.location.reload()` after 300 ms.

AI NDT Suggestions panel (`#aiNdtAnalyze`): collects the selected weld ids from `input.checkbox11x:checked` and `input[name="weld_ids[]"]:checked` (fallback rows with class `selected`/`active`); with none it shows the "Select one or more welds to get AI suggestions." alert; otherwise shows "Analyzing..." and POSTs JSON `{weld_ids, site_id: 1}` to `ai-ndt-suggest.php` (headers `X-Requested-With: XMLHttpRequest`, `X-CSRF-Token`; timeout 30 s). On success it draws a table with columns Weld, Recommended method, NDT percentage, Risk level (High / Medium / Low), Confidence (percentage), Reasoning, and per row an accept button (green check) and a dismiss button (x). Accept POSTs JSON `{type: "ndt_suggest_accept", weld_id, method}` to `ai-feedback.php`, marks the row as done and shows a toast "Apply suggestion"; dismiss POSTs `{type: "ndt_suggest_dismiss", weld_id}` and fades the row out. When the server answers with an error text it is shown in a warning ("No suggestions available." if none); on failure the red message "AI sidecar niet beschikbaar." is shown.

Archive tabs: the server-side table scripts only set the `ajax` URLs listed in "List" (the DataTables init for the archive tables is not written out in the capture). Other scripts in these captures (receive-material supplier sync, label-type toggles `#filterTypeLabel*` showing `.chideAllLabel*` when value is 3, ITP picker texts, calculation modals) belong to dialogs of other screens. The request-archive tabs and the request detail have no page-specific script besides the shared ones.

## Sample data

### NDT Pre (`page=ndt-requests-pre`)
0 rows: "No data available in table" (DT `total` 0).

### NDT (`page=ndt-requests`)
16 rows (DT `total` 16, `shown` 16). All rows: Project 20240101, Welder ML396. "Mat." = the two text parts of the Material cell. Rows 1 to 15 (the 16th is ISO 0001 / weld 006, type FW "Butt Weld - Field", NDT "Yes" with "Show NDT archive" icon, request R00162, Idx 0001 / 11111 / A106 Gr B · Pipe on both materials, Proces "-", WPS 11111, no checkbox):

| ISO | Weld no. | Type | NDT cell | NDT R/Nr. | Idx. No. | Chg.No. | Material 1 | Ind.No. | Chg.No. | Material 2 | Proces | WPS | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 00032 | 001_1 | WS | Yes (id 38198, "Create/Update NDT Request") | - | 0005 | 1212 | A106 Gr B · Pipe | 0005 | 1212 | A106 Gr B · Pipe | - | 11111 | - |
| 00032 | 001_1R1 | WS | Yes (38216) | - | 0005 | 1212 | A106 Gr B · Pipe | 0005 | 1212 | A106 Gr B · Pipe | - | 11111 | - |
| 00032 | 001_2 | WS | Yes (38199) | - | 0005 | 1212 | A106 Gr B · Pipe | 0005 | 1212 | A106 Gr B · Pipe | - | 11111 | - |
| 00032 | 001_2 R1 | WS | Yes (38215) | - | 0005 | 1212 | A106 Gr B · Pipe | 0005 | 1212 | A106 Gr B · Pipe | - | 11111 | - |
| 0001 | 014 | WS | Yes (42) + print icon | - | 0002 | ada | A105 · WN OR Fl | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (42) |
| 00032 | 004 | FW | Yes (38201) | - | 0003 | 564321 | A106 Gr B · Cap | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0003 | 004 | FW | Yes (6907, "Enter NDT Request results") + In progress + archived file link (report 29) | R00029 | 0003 | 564321 | A106 Gr B · Cap | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0007 | 003.1 | WS | Yes (104928) | - | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0007 | 003.2 | WS | Yes (104931) | - | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0001 | 011 | - | Yes (11) + print icon | - | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0001 | 004 | FW | Yes (4) + print icon | - | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (4) |
| 0001 | 012 | FW | Yes (12) + print icon | - | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0001 | 001 | WS | Yes (1, "Enter NDT Request results") + In progress + archived file link (report 11) | R00011 | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |
| 0001 | 013 | FW | Yes (41, "Enter…") + In progress + archived file link (report 11) + additional print icon | R00011 | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (41) |
| 0001 | 010R1 | FW | Yes (16820, "Enter…") + In progress + "Show NDT archive" icon | R00161, R00162 | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | - |

Tooltip type names of the sample: 001 / 014 / 001_x = "Shop weld"; 004 (ISO 00032 and 0003) = "Branch welds- Field"; 003.1 / 003.2 = "Butt Weld - Shop"; 004 / 012 / 013 / 010R1 / 006 (ISO 0001) = "Butt Weld - Field".

### NDT archive PRE
0 rows (DT `total` 0): "No data available in table", info "Showing 0 to 0 of 0 entries". Heading "Finished NDT Last refresh: 16.11.2026. 12:40". Page length select shows 20.

### NDT archive — view 1 "Finished NDT"
Info: "Showing 1 to 20 of 25 entries (filtered from 18,472 total entries)". 20 rows are on the first page. In all rows: Project 20240101, Welder ML396, Dia.(inch) "0,5", Idx 1 / Idx 2 = 0001, Chg.No. 1 / 2 = 11111, Material 1 / 2 = `1/2"/7,2/40/A106 Gr B/Pipe`, link "Open". First 15 rows:

| ISO No | WN | Type | Date | NDT process | Result | WPS | Doc. | Rep. No |
|---|---|---|---|---|---|---|---|---|
| 0001 | 002 | Shop weld | 2024-03-21 | 2-MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | Accepted | 11111 | Yes | MT-001 |
| 0001 | 005A | Shop weld | 2024-03-26 | 3-PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x | Accepted | 11111 | No | - |
| 0001 | 005A | Shop weld | 2024-03-26 | 2-MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | Accepted | 11111 | No | - |
| 0001 | 005A | Shop weld | 2024-03-26 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | Accepted | 11111 | No | - |
| 0001 | 010 | Butt Weld - Field | 2024-04-25 | 3-RT - Execution: RToD T-0201 / Acceptance: RToD T-0111 | Accepted | 11111 | No | - |
| 0001 | 010 | Butt Weld - Field | 2024-04-25 | 2-MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | Accepted | 11111 | No | - |
| 0001 | 010 | Butt Weld - Field | 2024-04-25 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | NA | 11111 | No | 1223 |
| 0001 | 005 | - | 2024-03-26 | 2-MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | Accepted | 11111 | No | - |
| 0001 | 005 | - | 2024-03-26 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | NA | 11111 | No | - |
| 0001 | 003 | - | 2024-03-21 | 3-PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x | Accepted | 11111 | Yes | - |
| 0001 | 003 | - | 2024-03-21 | 2-MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | Accepted | 11111 | Yes | - |
| 0001 | 003 | - | 2024-03-21 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | Accepted | 11111 | Yes | - |
| 0001 | 002 | Shop weld | 2024-03-21 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | NA | 11111 | Yes | RT-001 |
| 0001 | 005 | - | 2024-03-26 | 3-PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x | Accepted | 11111 | No | - |
| 0007 | 003R2 | Butt Weld - Shop | 2026-07-06 | 1-RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | NA | 11111 | No | - |

Remaining rows 16 to 20: 0007 / 003R1 and 0007 / 003 (Butt Weld - Shop, 2026-07-06, 1-RT, NA), 0005 / 002t (Butt Weld - Shop, 2025-01-13, 1-RT, Accepted), 0005 / 003 (2025-01-05, 1-RT, NA), 0005 / 004 (2025-01-06, 1-RT, Accepted); the ISO 0007 / 0005 rows have WPS 11111 resp. 22.028BR. "Open" links go to isometric id 1 (ISO 0001), 15767 (0007), 6598 (0005).

### NDT archive — view 2 "Open NDT results"
Heading "Open NDT results Last refresh: 16.11.2026. 13:53"; info "Showing 1 to 15 of 15 entries (filtered from 1,274 total entries)". All 15 rows have Result "---", Project 20240101, Welder ML396, WPS 11111, Doc. "No", Rep. No "-":

| ISO No | WN | Type | Dia. | Date | NDT process | Idx 1 / Chg.No. 1 / Material 1 | Idx 2 / Chg.No. 2 / Material 2 |
|---|---|---|---|---|---|---|---|
| 0001 | 001 | Shop weld | 0,5 | 2024-03-21 | 1-RT (EN ISO 17636-1 class B) | 0001 / 11111 / `1/2"/7,2/40/A106 Gr B/Pipe` | same |
| 0001 | 001 | Shop weld | 0,5 | 2024-03-21 | 2-MT | same | same |
| 0001 | 001 | Shop weld | 0,5 | 2024-03-21 | 3-PT | same | same |
| 0001 | 006 | Butt Weld - Field | 0,5 | 2024-12-16 | 1-RT | same | same |
| 0001 | 013 | Butt Weld - Field | 0,5 | 2024-03-21 | 1-RT | same | same |
| 0001 | 013 | Butt Weld - Field | 0,5 | 2024-03-21 | 2-MT | same | same |
| 0001 | 013 | Butt Weld - Field | 0,5 | 2024-03-21 | 3-PT | same | same |
| 0001 | 013 | Butt Weld - Field | 0,5 | 2024-03-21 | 4-RT (RToD T-0201 / T-0111) | same | same |
| 0001 | 010R1 | Butt Weld - Field | 0,5 | 0000-00-00 | 1-RT | same | same |
| 0001 | 010R1 | Butt Weld - Field | 0,5 | 0000-00-00 | 2-MT | same | same |
| 0001 | 010R1 | Butt Weld - Field | 0,5 | 0000-00-00 | 3-PT | same | same |
| 0003 | 004 | Branch welds- Field | 1 | 2024-11-25 | 1-RT | 0003 / 564321 / `1"/7.2/40//Cap` | - / - / - |
| 0003 | 004 | Branch welds- Field | 1 | 2024-11-25 | 2-MT | same | same |
| 0003 | 004 | Branch welds- Field | 1 | 2024-11-25 | 3-PT (RToD T-0203 / T-0110) | same | same |
| 0003 | 004 | Branch welds- Field | 1 | 2024-11-25 | 4-TOFD (NEN-EN-ISO 10863 / NEN-EN-ISO 15626 L1) | same | same |

### NDT archive — view 3 "Open NDT welds"
Heading "Open NDT welds Last refresh: 16.11.2026. 13:53". 0 rows: "No matching records found"; info "Showing 0 to 0 of 0 entries (filtered from 120 total entries)".

### NDT request archive
17 requests (range 01.01.2020 to 31.12.2026), project "All projects", NDT. Each row has the print button and "Undo":

| Date | Request number | Welds |
|---|---|---|
| 17.07.2026. 09:08 | 20234 | 1 |
| 17.07.2026. 09:07 | 20233 | 1 |
| 17.07.2026. 09:06 | 20232 | 1 |
| 23.01.2025. 08:29 | 00440 | 1 |
| 23.01.2025. 08:29 | 00439 | 1 |
| 23.01.2025. 08:27 | 00438 | 1 |
| 23.01.2025. 08:27 | 00437 | 1 |
| 27.12.2024. 09:05 | 00162 | 2 |
| 27.12.2024. 09:03 | 00161 | 1 |
| 25.11.2024. 17:58 | 00029 | 1 |
| 05.11.2024. 13:09 | 00023 | 1 |
| 02.07.2024. 09:34 | 00016 | 1 |
| 02.07.2024. 09:32 | 00015 | 1 |
| 02.07.2024. 09:06 | 00014 | 1 |
| 24.06.2024. 09:54 | 00013 | 1 |

(Last two rows not shown above: 00011 on 21.03.2024. 15:33 with 2 welds; 00002 on 21.03.2024. 11:13 with 1 weld. Request numbers are shown zero-padded to 5 digits; the number equals the report id.)

### NDT request 162 (detail)
Heading "NDT request archive"; breadcrumb "R00162"; 4 rows:

| ISO | Weld no. | NDT | Row checkbox data |
|---|---|---|---|
| 0001 | 006 | RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | weld 6, report 162, process 1, pre 0, result 0 |
| 0001 | 010R1 | RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1 | weld 16820, report 162, process 1, pre 0, result 0 |
| 0001 | 010R1 | MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x | weld 16820, report 162, process 4, pre 0, result 0 |
| 0001 | 010R1 | PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x | weld 16820, report 162, process 5, pre 0, result 0 |

### PWHT request manager
5 rows (all Project 20240101; project select shows "All projects"):

| Isometric | Weld no. | Type | Welder | PWHT cell | Ind.No. | Chg.No. | Material 1 | Ind.No. | Chg.No. | Material 2 | Proces | WPS | Check |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 00022 (iso id 6) | 001darko | - | -------- | Yes (id 38843) + print icon | - | - | (empty) | - | - | (empty) | - | - | box (38843) |
| 0001 (iso id 1) | 002 | WS | ML396 | Yes (2) + archived file icon | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (2) |
| 0001 | 003 | - | ML396 | Yes (3) + archived file icon | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (3) |
| 0001 | 005 | - | ML396 | Yes (5) + archived file icon | 0001 | 11111 | A106 Gr B · Pipe | 0001 | 11111 | A106 Gr B · Pipe | - | 11111 | box (5) |
| 0001 | 007 | FW | ML396 | Yes (7) + archived file icon | 0001 | 11111 | A106 Gr B · Pipe | 0003 | 564321 | A106 Gr B · Cap | - | 11111 | box (7) |

### PWHT archive
Heading "Finished PWHT Last refresh: 21.03.2024. 11:41"; "Showing 1 to 2 of 2 entries" (DT `total` 2). Both rows: Project 20240101, ISO No 0001, Type Shop weld, Welder 1111, Dia. 0,5, Date 2024-03-21, PWHT process "PWHT", Result "--", Idx 1 / 2 = 0001, Chg.No. 1 / 2 = 11111, Material 1 `1/2"/7,2/40/A106 Gr B/Pipe`, Material 2 `1/2"/7,2/40/A106 Gr B / Pipe`, WPS 11111, Doc. No, Rep. No "-", link "Open" (isometric id 1). WN: 002 and 003.

### PWHT request archive
3 requests (range 01.01.2020 to 31.12.2026):

| Date | Request number | Welds | Option link target |
|---|---|---|---|
| 11.10.2024. 11:16 | 00007 | 2 | `../core/export/down.php?file=20241011_R00007-PWHT-Request.pdf` |
| 11.10.2024. 11:17 | 00008 | 1 | `…20241011_R00008-PWHT-Request.pdf` |
| 11.10.2024. 11:22 | 00010 | 1 | `…20241011_R00010-PWHT-Request.pdf` |

## Not in the capture

- Bodies of all dialogs that are filled by a request: `#showNDO`, `#showNDOPre`, `#showPWHT`, `#showWeldNdtArchive`, `#showWeldNdtPreArchive`, `#showWeldPwhtArchive`, and the bodies of the request dialogs (`#contentPdfNdtRequestLanguage`, `…Additional`, `…PreRequestLanguageAdditional`, `…Mass`, `…Pre`, `…PreMass`, `#contentPdfPwhtRequestLanguage`: the process checkboxes `ndt1` to `ndt5` / `ndt[]`, language and note fields they contain). Controls: the "Yes" links, the file/printer icons and the mass buttons. The browser-pass notes describe some of the result dialogs (marked above); the request-dialog bodies were not opened.
- Rows of the NDT Pre tab (the sandbox has none), so the icons in its "NDT Pre" cell and the Pre request / archive dialogs are known only from the scripts.
- The alert text shown when "Go" of an "Additional" dialog is submitted with nothing ticked (the line is elided in the capture).
- The mass buttons' appearance and the other buttons that appear when rows are ticked: not observed (the browser-pass notes say no row was ticked).
- The header tooltips of the 19 columns of the archive tables (the header HTML is cut off), the visible text of the filter submit button on the request-archive tabs, and the tooltip of the "Open" link.
- What the "Refresh" link does beyond its URL (`refresh=ok`); the browser-pass notes say the heading's "Last refresh" timestamp changed between two captures without a click on Refresh.
- Rows beyond the first page of the NDT archive tables (view 1: 5 more rows of the 25; the unfiltered total is 18,472), the confirmation behaviour of "Undo" in the request list (its link only opens the request detail), and the server's answer of `ndt-request-undo.php`.
- The hidden "Print" link of the archive tabs (`openNdtWelds.php` / `openPwhtWelds.php`) is hidden in the capture; what reveals it is not shown.
- The "Tracer" filter group in `#filterIsoList` is hidden in all captures; nothing reveals it.

Also present in the page, opened from elsewhere (other screens): addDefaultProjectSite, addFlange, addIsometric, addPqr, addReceivedMaterial, addRev, addRevItp, addRevItp2, adjustLagerQuantity, admin, backIsometric, backWeld, bulkTransferFromLagerToProject, calculator, calendarModal, cardPersonnel, cardPersonnelEdit, changeQuantityByRevision, chooseProjectSite, correctLagerEntry, createTransferOrder, deleteAllIso, deleteCalculation, deleteCronReport, deleteFlange, deleteIsometric, deleteMaterialISO, deleteMaterialISOimport, deleteSelectedIso, deleteSelectedWelds, deleteWeld, docPersonnel, docsFlange, editCalculation, editCompanyData, editCronReport, editFlange, editIsometric, editIsometricMass, editIsometricPhase, editIsometricPhaseMass, editLagerItem, editMaterialISO, editMaterialISOimport, editServiceRequest, editWeld, filterFlanges, generateLabelsOnMultipleWelds, generateLabelsOnMultipleWelds2, generateLabelsOnMultipleWelds2Project, generateLabelsOnMultipleWeldsProject, importFlanges, importIsometrics, importMaterialInISO, moveLagerToLager, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, passwordChange, pdfCalculationStatuses, pdfESTReportLanguageList, pdfFlangeReport, pdfIsoBook, pdfIsoBookEst, pdfIsoBookMultiple, pdfIsoBookMultipleGroup, pdfLISLFullLanguage, pdfLISLFullLanguageA3, pdfLISLFullLanguageGUrev2, pdfLISLFullLanguageGUrev3, pdfLISLFullLanguageWQ, pdfLISLFullLanguageWQNEW, pdfLISLLanguage, pdfMTOReportLanguageList, pdfNdtPreRequestLanguageISO, pdfNdtRequestLanguageISO, pdfPwhtRequestLanguageISO (the three ISO request dialogs are opened from the isometric page's Options menu), removeLagerItem, returnFromLager, returnMaterialByRevision, searchProject, setAsCompleted, setAsNotCompleted, setCalculationAsFinished, setCalculationAsNotFinished, setPunch, showIsometricAuditTrail, showOrderAuditTrail, showOrderDetails, showRev, showRevItp, showRevItp2, showStorehouseAuditTrail, signServiceRequest, themeChange, todo, transferFromLagerToProject, uploadNDTonMultipleWelds, uploadNDTonMultipleWeldsPre, uploadPWHTonMultipleWelds (opened from the isometric page's Options menu), viewLagerCerts, weldpilotItpPickerModal, weldpilotItpUnlinkModal, wpFlangeScanModal, wpWeldScanModal. `#showWeldPwhtArchive` is in the DOM of the NDT and PWHT tabs with its handler `.open-showWeldPwhtArchive`, but no control that opens it is in these captures.
