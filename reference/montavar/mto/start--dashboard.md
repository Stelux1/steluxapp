# MTO Pilot → Start → Dashboard

Source: `mto__start__dashboard.txt`, `mto__start__dashboard__phase.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?redirect=&logout=&page=&id=&project=&type=1` (the sidebar link is `/mtopilot/`; the same page is also `index.php?page=dashboard-mtopilot&type=<phase id>`; the second capture is `/mtopilot/index.php?page=dashboard-mtopilot&type=2`).
State of the page for the observing account: normal.

The first capture is the page with the default Operation phase "Shop" (`type=1`). The second capture is the same page with the phase set to "Field" (`type=2`). Per the browser-pass notes (`_interactive/I3-mto.md`, Part E) opening `/mtopilot/` always lands on "Shop"; after choosing "Field" through the selector, opening `/mtopilot/` again showed "Shop" again, so the choice is not remembered. "All operation phases" was not opened.

## Page

- Browser tab title: `MTOPilot®` (the Field capture shows `- MTOPilot®`).
- No breadcrumb and no tabs. The content area (`#content`, classes `mto-dashboard`, `light-mode`) holds, top to bottom:
  1. Header line: project site name "Zandbak" and the date "Monday 16 November 2026"; at the right `.mto-site-id` "Site ID #1".
  2. Dark-mode button `#modeToggle` (moon icon `fa fa-moon-o`, title "Dark Mode", aria-label "Switch to dark mode", `onclick="toggleDarkMode()"`).
  3. Operation phase form (`.mto-phase-filter`, method GET): hidden input `page` = `dashboard-mtopilot`; label "Operation phase"; select `type` (`onchange="this.form.submit()"`); chip "Current" + phase name (Shop: "CurrentShop"; Field: "CurrentField"); button (link, primary, history icon) "Material revisions report" → `/core/pdf/material-revisions-report.php?projectSite=1&project=0`, `target="_blank"` (a PDF; not opened).
  4. Six KPI cards (`#mtoKpiGrid`), each a link `href="#"` with class `mto-kpi-filter`, a `data-filter` and an empty `data-search`: click applies that quick filter to the Operations board (see Rules).
  5. Panel "Visual management" with the sub-heading "Free pool, open ordered, blocker-backorder and logistics stay visible without falling back into spool-first assumptions.": chip row `#mtoVisualSummary` and two charts `#mtoLocationChart` and `#mtoProjectBacklogChart`.
  6. Panel "Readiness focus" with the sub-heading "Immediate planner view of startable isometrics, blocked isometrics and the hottest blocker materials." and the block `#mtoAttentionWrap`.
  7. Panel "Operations board" with the sub-heading "Primary control table for isometric readiness, blocker-backorder details per material item and separate logistics signals.", a hint line, nine quick-filter buttons, a chip, a link and the table `#mtoOperationsTable`.
- Select `type` (Operation phase), 15 options, value → text: 0 → All operation phases; 7 → Bernecker; 2 → Field; 17 → Field IYM; 3 → Hydrotest field; 15 → Revision mat; 11 → Rilco; 1 → Shop; 16 → Shop IYM; 14 → Shop missing; 4 → Support Field; 10 → Support FW; 8 → Support Shop; 9 → Support WS; 5 → Valves. Selected in the first capture: 1 (Shop); in the second: 2 (Field). The options come in alphabetical order of the text, "All operation phases" first.
- KPI cards, in order (label; `data-filter`; explanation text with the sandbox figures for each phase):

| # | Label | data-filter | Text shown (Shop, type=1) | Text shown (Field, type=2) |
|---|---|---|---|---|
| 1 | Theoretical startable | `startable` | big number 0; "3 isometrics in scope. Started 1." | big number 1; "2 isometrics in scope. Started 1." |
| 2 | Partially covered | `partial` | 1; "Some stock available, but not enough to start fully." | 0; same sentence |
| 3 | Blocked isometrics | `blocked` | 2; "Shortage in free pool. Reserved: 0." | 0; "Shortage in free pool. Reserved: 0." |
| 4 | Blocking backorder qty | `backorder` | 17; "1 isometrics wait on ordered material. Open ordered total 17." | 0; "0 isometrics wait on ordered material. Open ordered total 3." |
| 5 | Not ordered materials | `not-ordered` | 5; "2 isometrics still miss an order. Unique materials in current scope." | 0; "0 isometrics still miss an order. Unique materials in current scope." |
| 6 | Free pool materials | `all` | 5; "Unique materials in scope with positive free pool after take-ins, issues and reservations." | 1; same sentence |

(The capture stores each card as one text string, for example "Theoretical startable03 isometrics in scope. Started 1."; it was split here as number + sentence, consistent with the 3 and 2 rows of the board.)

- "Visual management" chip row (label, value), in order:

| Chip | Shop | Field |
|---|---|---|
| Max startable | 1 | 2 |
| Free pool materials | 5 | 1 |
| Ordered | 62 | 16 |
| Received | 45 | 13 |
| Open ordered | 17 | 3 |
| Blocking backorder | 17 | 0 |
| Not ordered | 66 | 0 |
| 0-7 days | 0 | 0 |
| 8-14 days | 0 | 0 |
| 15+ days | 1 | 1 |
| No logistics update | 2 | 1 |

(Also stored as one string per capture, e.g. Shop "Max startable1Free pool materials5Ordered62Received45Open ordered17Blocking backorder17Not ordered660-7 days08-14 days015+ days1No logistics update2".)

- Chart 1 `#mtoLocationChart`, title "Isometrics by logistics signal" (Google ColumnChart, no legend; data table "Logistics" / "ISOs" with a per-row colour):
  - Shop: Farbara o. = 1 (colour #2f6fb7); Not sent = 1 (#b7791f); Materials. = 1 (#5b6fb8).
  - Field: Farbara o. = 1 (#2f6fb7); Materials. = 1 (#5b6fb8).
- Chart 2 `#mtoProjectBacklogChart`, title "Backlog by site" (Google ColumnChart; legend at the bottom when the window is 1400 px or wider, at the top when narrower; series colours #94a3b8, #f48f19, #2f6fb7). Columns "Scope", "Open ordered", "Blocking backorder", "Not ordered":
  - Shop: Site = 17, 17, 66.
  - Field: Site = 3, 0, 0.
- "Readiness focus" content:
  - Shop capture: a column block `.col-md-4.mto-layout-left` containing the heading text "Top startable isometrics" and "No items in this category." (in the Field capture the block is already the filled version, below).
  - Field capture: group title "Top startable isometrics"; one item: title "20240101 / 0001"; meta "Pool covers 3 qty fully. Logistics: Farbara osnovi premaz."; link "Open in operations board" (`class mto-drilldown`, `href="#"`, `data-filter="startable"`, `data-search="20240101 0001"`).
- "Operations board": hint line "Use KPI cards, quick filters and attention links to move between startable, partial, blocked and backlog situations."; quick-filter buttons (links, class `mto-filter-btn`, `href="#"`), label → `data-filter`: All → all (active by default); Startable → startable; Partial → partial; Blocked → blocked; Open ordered → backorder; Not ordered → not-ordered; At service → service; At laydown → laydown; Aging → aging. Chip "Operation phase" + phase name ("Operation phaseShop" / "Operation phaseField"). Link "Clear server-side filters" (`class mto-drilldown`, `href="index.php"`, no `data-filter`, so it reloads the page without parameters, which is the default phase Shop). Footnote `#mtoTableNote`: "The board loads server-side from the MTOPilot snapshot and keeps isometric readiness separate from logistics signals."
- Dialogs opened from this page: none (no control of the page has `data-target` or a modal `href`).

## List

Table `#mtoOperationsTable` (classes `table table-striped table-bordered table-hover mto-operations-table`), DataTables, server side.

- Request: `ajax` url `/core/ajax/ajax-mto-dashboard-board.php?type=<phase id>` (the standard DataTables parameters `draw`, `columns[i][data|name|searchable|orderable|search]`, … are added; the page's XHR list shows the board request repeated with `draw=1,2,3,4,5…`, i.e. the table is drawn repeatedly while the page loads). Response key for rows: `data`.
- Columns in order (index, title, orderable): 0 "Project / ISO" yes; 1 "Readiness" yes; 2 "Shortage" yes; 3 "Blocking backorder" yes; 4 "Not ordered" yes; 5 "Logistics / aging" yes; 6 "Action" no; 7 "Exception score" hidden, orderable, searchable; 8 "Filter tags" hidden, orderable, searchable. Visible header row: Project / ISO, Readiness, Shortage, Blocking backorder, Not ordered, Logistics / aging, Action.
- Default sort in the captured DataTables configuration: column 5 ascending (`order:[[5,"asc"]]`). The page script initialises the table with `order: [[7, 'desc']]` (Exception score descending); the capture does not show how the applied order differs, so both are recorded.
- Page length 4; length menu 4 / 25 / 50 / 100 (select `mtoOperationsTable_length`, label "Show … entries"; default 4).
- Search: one free-text box (placeholder "Search", with a clear button, aria-label "Clear"); no per-column inputs.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries" (shown: "Showing 1 to 3 of 3 entries" for Shop, "Showing 1 to 2 of 2 entries" for Field); empty "No data available in table"; no match "No matching records found"; processing "Processing...".
- Cells: Project / ISO = project number + space + ISO number; Readiness = status word + "Covered x / y"; Shortage = number + "No blockers" or material numbers with quantity in brackets; Blocking backorder = number + "No ordered blockers" or material numbers (qty); Not ordered = number + "Still not ordered" or nothing else; Logistics / aging = signal + text; Action = blue link "ISO" (class `mto-action-btn`) → `index.php?page=isometrics&project=1&id=<iso id>&view=mtopilot`.
- Row options / bulk actions / export / print buttons: none on this table.
- Backorder mode: when the quick filter "Open ordered" (data-filter `backorder`) is active the headers change (see Rules).
- Auto-reload: the table reloads its data every 45 seconds without resetting the page.

## Dialogs

None. No control of this page opens a dialog; the page's links either apply a client-side filter (`href="#"`), reload the page, or open a PDF. The dialogs that exist in the page are listed at the end of this note.

## Rules found in the page's JavaScript

Inline script of the dashboard (the capture holds only the lines that no earlier capture had; the lines it marks as "already captured" are not visible, so some statements are incomplete).

- Variables: `initialQuickFilter = "all"`; `locationChartRows`, `projectChartRows` (the chart data above, filled into the page); `dashboardSummaryUrl = ../core/ajax/ajax-mto-dashboard-summary.php`; `dashboardBoardUrl = ../core/ajax/ajax-mto-dashboard-board.php`; `serverFilters = {project: 0, spool: 0, supplier: 0, type: <phase id>}`.
- `buildAjaxUrl(base)`: adds the query parameters `project`, `spool`, `supplier`, `type` to the URL, each only when its value in `serverFilters` is greater than 0 (so `type=0`, "All operation phases", sends no `type`).
- Summary refresh: `GET ajax-mto-dashboard-summary.php` (built with `buildAjaxUrl`; `&force=1` appended when a forced refresh is requested; `$.getJSON`). If the response is empty or has an `error` the page keeps what it has. Otherwise it replaces: `#mtoKpiGrid` with `kpis_html`, `#mtoAttentionWrap` with `attention_html`, `#mtoVisualSummary` with `visual_html`; takes `location_chart_rows` and `project_chart_rows` as new chart data; when `generated_ms` is present sets the footnote to "The board loads server-side from the MTOPilot snapshot. Latest snapshot build: <generated_ms> ms."; then re-applies the board layout and redraws the charts. The capture's XHR list shows `ajax-mto-dashboard-summary.php?type=1` called once during load. Which event triggers the call is in lines that the capture does not show.
- Board: DataTable with `serverSide` data from `buildAjaxUrl(dashboardBoardUrl)`, `dataSrc: 'data'`, `pageLength: 4`, `lengthMenu [[4,25,50,100],[4,25,50,100]]`, `order [[7,'desc']]`, columns data 0 to 8; columns 7 and 8 are not visible but searchable; column 6 is not orderable. After each draw `syncBoardLayout` is run.
- `applyBoardFilter(api, filter, searchText)`: stores the filter and search text; marks the quick-filter button whose `data-filter` equals the filter as `active` (and removes it from the others); for filter `all` clears the search of hidden column 8 ("Filter tags"), otherwise sets that column's search to the filter name; runs `syncBoardLayout`; sets the table's global search to `searchText` and redraws. Called at start with ("all", ""), on a click of `.mto-filter-btn` (search text empty), of `.mto-kpi-filter` and of `.mto-drilldown` (filter from `data-filter`, default "all"; search text from `data-search`, default empty). The default action of these clicks is presumably prevented (lines not shown).
- `syncBoardLayout(filter)`: when the filter is `backorder` the table headers are renamed: col 0 "Material number", col 1 "Description", col 2 "Shortage", col 3 "Open ordered", col 4 "Not ordered", col 5 "Logistics / aging", col 6 "Action"; the footnote becomes "Open ordered view shows material items instead of isometrics for the current server-side scope."; columns 5 and 6 are hidden. For every other filter the headers are the normal ones (Project / ISO, Readiness, Shortage, Blocking backorder, Not ordered, Logistics / aging, Action), the footnote is the standard one and columns 5 and 6 are shown. Columns are re-adjusted afterwards.
- Reload timer: every 45 000 ms `boardApi.ajax.reload(null, false)` (keeps the current page).
- Dark mode: `toggleDarkMode()` calls `setMtoMode(!isDarkMode)`; `setMtoMode(dark)` sets `isDarkMode`, toggles classes `dark-mode` / `light-mode` on the dashboard container, swaps the button icon `fa-moon-o` ↔ `fa-sun-o`, sets the button title "Light Mode" / "Dark Mode" and aria-label "Switch to light mode" / "Switch to dark mode", and redraws the charts. The weld dashboard note records that the same function there first clicks the shared header theme toggle; for MTO the lines that would show this are marked "already captured" and are not visible.
- Chart palette: light mode background #ffffff, text #475569, grid #e2e8f0; dark mode background #152235, text #e2e8f0, grid #334155.
- Charts: loaded from `https://www.gstatic.com/charts/loader.js` with packages `corechart` and `bar`. Both are `google.visualization.ColumnChart`. Redrawn on window resize after 120 ms; "compact" layout when `window.innerWidth < 1400`. Location chart: title "Isometrics by logistics signal", no legend, horizontal labels slanted 25 degrees, v-axis minimum 0. Backlog chart: title "Backlog by site", colours `#94a3b8`, `#f48f19`, `#2f6fb7`; x labels slanted 22 degrees only in compact layout. A fallback polls up to 100 times at 50 ms when the Google loader's callback does not fire.
- Other inline scripts in the page (not the dashboard's own): `select2_search($el, term)` and a click handler on `#buttonMatIso` that opens the select2 given by the button's `data-target` and types the value of `#materialNoIso` into its search (belongs to the add-material dialogs). A large further script (6963 characters, 143 new lines) and several `SAME-AS weld__start__dashboard` scripts are shared code for the dialogs; they were not read as part of this page's logic.
- Requests the page made while loading (XHR list): `GET /core/ajax/ajax-mto-dashboard-board.php?type=1&draw=…` (several draws), `GET /core/ajax/ajax-mto-dashboard-summary.php?type=1`, `GET /core/ajax/ajax-notifications.php?action=count_unread` (shared top bar). The Field capture lists the same board request with `type=2`.

## Sample data

Shop (`type=1`) board, 3 of 3 rows:

| Project / ISO | Readiness | Shortage | Blocking backorder | Not ordered | Logistics / aging | Action |
|---|---|---|---|---|---|---|
| 20240101 00032 | Blocked — Covered 0 / 48 | 48 — 7436330731 (16), 8138268881 (16) | 0 — No ordered blockers | 48 — Still not ordered | Not-sent — Not sent / No log | ISO → `id=6191` |
| 20240101 00022 | Started — Covered 2 / 2 | 0 — No blockers | 0 — No ordered blockers | 0 — Still not ordered | Started — Materials issued / No log | ISO → `id=6` |
| 20240101 0001 | Partial — Covered 31 / 66 | 35 — 8138678259 (16), 7430052832 (12) | 17 — 7430052832 (12), 7662782601 (2), 8138268881 (3) | 18 — Still not ordered | Laydown — Ordered 20-03-2024 / 971 days | ISO → `id=1` |

Field (`type=2`) board, 2 of 2 rows:

| Project / ISO | Readiness | Shortage | Blocking backorder | Not ordered | Logistics / aging | Action |
|---|---|---|---|---|---|---|
| 20240101 00022 | Started — Covered 10 / 10 | 0 — No blockers | 0 — No ordered blockers | 0 — Still not ordered | Started — Materials issued / No log | ISO → `id=6` |
| 20240101 0001 | Startable — Covered 3 / 3 | 0 — No blockers | 0 — No ordered blockers | 0 — Still not ordered | Laydown — Farbara osnovi premaz / 871 days | ISO → `id=1` |

Readiness words seen: Blocked, Started, Partial, Startable. Logistics signals seen: Not-sent, Started, Laydown. Per the browser-pass notes the Readiness cell is a coloured badge (STARTED blue, STARTABLE green). The other figures (KPI cards, chips, charts) are in the Page section. The ISO links point to `index.php?page=isometrics&project=1&id=<id>&view=mtopilot`.

From the browser-pass notes: the board and the KPI cards react client-side to the quick filters; the dark-mode button and "Material revisions report" were not used.

## Not in the capture

- The content of the quick-filter results (STARTABLE, PARTIAL, BLOCKED, OPEN ORDERED, NOT ORDERED, AT SERVICE, AT LAYDOWN, AGING): the capture shows only the default "All" view; the filtering is done by the hidden "Filter tags" column and the board request (clicking the buttons or KPI cards).
- The "Open ordered" material-items layout rows (click "Open ordered" or the "Blocking backorder qty" card).
- The output of `ajax-mto-dashboard-board.php` and `ajax-mto-dashboard-summary.php` as raw JSON (only their URLs are in the XHR list).
- The page with "All operation phases" or any phase other than Shop and Field.
- The "Material revisions report" PDF (button).
- The dark-mode display (button `#modeToggle`).
- How exactly the summary refresh is triggered and the lines of the dashboard script that the capture marks as "already captured on earlier pages".
- The Readiness focus lists for "blocked isometrics" and "hottest blocker materials": the sub-heading names them, but the capture shows only the group "Top startable isometrics".

## MTO side menu and top bar

### Side menu (`#sidebar_left`)

The capture of this page prints only the lines no earlier capture had (34 new lines, the other lines are marked "already captured on earlier pages", also in every other MTO capture). So the group headings "General data", "Start" and "System" and the two System items "Change password" and "Change theme" are not shown as lines in any MTO capture. They exist in the WeldPilot capture with the same sidebar code; the two dialogs `#passwordChange` and `#themeChange` are in this page. Entries marked (weld capture) come from there; their links in MTO are not shown in the MTO capture.

Format: label → link (icon). The links are as written in the page.

1. General data (group heading; line not in the MTO capture)
   - Project sites → `/mtopilot/index.php?page=project-sites` (glyphicon glyphicon-home)
   - Storehouses → `/mtopilot/index.php?page=lagers` (glyphicon glyphicon-home)
2. Start (group heading; line not in the MTO capture; shown open and with the active item on this page)
   - Dashboard → `/mtopilot/` (glyphicon glyphicon-flash)
3. Materials (group; glyphicons glyphicons-cargo)
   - Material database → `/mtopilot/index.php?page=material-database&projectSite=1` (fa fa-database)
   - Material part → `/mtopilot/material-part/`
   - Type of material → `/mtopilot/type-material/`
   - UOMs → `/mtopilot/material-uoms/`
   - Spools → `/mtopilot/material-spools/`
   - Operation Phases → `/mtopilot/material-types/`
   - Material supplier → `/mtopilot/material-supplier/`
   (the last six: glyphicon glyphicon-list)
4. Order / Take in (group; glyphicon glyphicon-shopping-cart)
   - Order materials → `/mtopilot/index.php?page=material-order` (glyphicon glyphicon-shopping-cart)
   - Pending order → `/mtopilot/index.php?page=material-not-receive` (glyphicon glyphicon-remove)
   - Material take in → `/mtopilot/index.php?page=material-receive` (glyphicon glyphicon-arrow-down)
   - Material inventory → `/mtopilot/index.php?page=material-inventory` (glyphicon glyphicon-list)
   - Materials list → `/mtopilot/index.php?page=material-list` (glyphicon glyphicon-list)
   - Order archive → `/mtopilot/index.php?page=material-order-archive&from=17.10.2026&to=30.11.2026` (glyphicon glyphicon-list)
   - Certifications → `/mtopilot/index.php?page=certifications` (glyphicon glyphicon-list)
5. Projects data (group; glyphicons glyphicons-stats)
   - Projects → `/mtopilot/index.php?page=project-sites&id=1&view=projects` (glyphicon glyphicon-tasks)
   - Isometrics list → `/mtopilot/index.php?page=isometrics-list` (glyphicon glyphicon-list)
   - Isometric execution → `/mtopilot/index.php?page=iso-execution` (glyphicon glyphicon-play)
   - Pick List archive → `/mtopilot/index.php?page=picklist-archive&from=17.10.2026&to=30.11.2026` (glyphicon glyphicon-list)
6. Logistic (group; glyphicons glyphicons-road)
   - Service companies → `/mtopilot/service-companies/` (fa fa-users)
   - Service request → `/mtopilot/index.php?page=spools-transport` (fa fa-car)
   - Service req. - Materials → `/mtopilot/index.php?page=spools-transport-materials` (fa fa-car)
   - Request archive → `/mtopilot/index.php?page=requests-archive&from=17.10.2026&to=30.11.2026` (glyphicon glyphicon-list)
   - Laydown areas → `/mtopilot/index.php?page=material-laydowns` (glyphicon glyphicon-list)
   - Laydown materials → `/mtopilot/index.php?page=material-laydowns-material` (glyphicon glyphicon-list)
7. System (group heading; line not in the MTO capture; icon in the weld capture: glyphicons glyphicons-settings)
   - Change password → `#passwordChange` (modal; weld capture)
   - Change theme → `#themeChange` (modal; weld capture)
   - User accounts → `/mtopilot/users/` (glyphicons glyphicons-group)
   - Profiles → `/mtopilot/profiles/` (glyphicons glyphicons-group)

Remarks from the capture: the group headings have class `accordion-toggle` and `href="#"`; the open group and the active item are set by the current page (other MTO captures show the heading of the current group with the extra class `menu-open`). The Material database link carries the site (`projectSite=1`); the archive links carry a date range `from=17.10.2026&to=30.11.2026`. One line before "Logistic" and the line after "Pick List archive" are marked as already captured and are not shown; the capture does not say what they are. The sidebar of this capture has no "Handheld", "Daily reporting" or "Reports" group lines among its shown lines.

### Top bar (`header`)

Shown lines of the MTO capture (the rest is marked "already captured"; the full header is in the WeldPilot capture, with `/weldpilot/` links, and has the same structure):

- App-switcher tiles (`#topbar-dropmenu`), each a metro tile: MTOPilot® → `/mtopilot/` (fa fa-cube); ESTPilot® → `/estpilot/` (fa fa-calculator); WeldPilot® → `/weldpilot/` (fa fa-fire); TeamPilot® → `/teampilot/` (fa fa-users); ToolPilot® → `/toolpilot/` (fa fa-wrench).
- Brand link "MTOPilot®" (`navbar-brandS`) → `/mtopilot/`.
- Language links, in two places (a dropdown and the user menu), each keeping the current page: Nederlands → `/mtopilot/index.php?lang=nl&page=<current page>&id=&project=&projectSite=`; English → `lang=en`; Deutsch → `lang=de`; Français → `lang=fr` (on this page `page=` is empty; on the Field capture it is `dashboard-mtopilot`).
- Notifications dropdown: title "Notifications", link "Mark all read" (`#markAllNotifRead`, check icon). On load the page requests `ajax-notifications.php?action=count_unread`.
- User menu: a form `.header-site-form` (`action="/mtopilot/index.php"`, method GET) with the project-site select (name `redirect`, `onchange="this.form.submit();"`; options not shown in the MTO capture; in the weld capture it has 3 entries: a "[Change project site]" prefix with the site names, "Zandbak" selected by default), then "User Manuals" → `/mtopilot/index.php?page=user-manuals` (fa fa-book) and "Logout" → `/mtopilot/index.php?logout=ok` (fa fa-power-off).
- Other header parts from the weld capture (not shown in the MTO capture): the side-menu toggle button, the app-switcher toggle (fa-th-large), the site name "Zandbak" (hidden on small screens), the expiry-warning dropdown (weld-specific text), the dark-theme toggle (`#wsappsAppThemeToggle`, title "Dark theme"), and the user name button.
- The person's name in the user-menu button is not copied here.

## Dialogs present in the page, opened from elsewhere

Also present in the page, opened from elsewhere (other MTO pages, the sidebar or the top bar): `#fillIRN`, `#deleteSelectedProjects`, `#editProjectsMass`, `#pdfMainReportLanguageForProjects`, `#pdfMainReportLanguageForProjectsMultiple`, `#pdfMainReportLanguage`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#deleteAllIso`, `#deleteSelectedIso`, `#pdfMTOReportLanguageList`, `#pdfESTReportLanguageList`, `#returnMaterialByRevision`, `#changeQuantityByRevision`, `#pdfIsoBook`, `#pdfIsoBookMultiple`, `#pdfIsoBookMultipleGroup`, `#pdfIsoBookEst`, `#importMaterialInISO`, `#importIsometrics`, `#deleteMaterialISOimport`, `#deleteMaterialISO`, `#editMaterialISO`, `#editMaterialISOimport`, `#addReceivedMaterial`, `#addMaterialIso`, `#addMaterialIsoCustom`, `#setCalculationAsFinished`, `#setCalculationAsNotFinished`, `#setAsCompleted`, `#setAsNotCompleted`, `#setPunch`, `#uploadNDTonMultipleWelds`, `#uploadNDTonMultipleWeldsPre`, `#generateLabelsOnMultipleWelds`, `#generateLabelsOnMultipleWelds2`, `#generateLabelsOnMultipleWeldsProject`, `#generateLabelsOnMultipleWelds2Project`, `#uploadPWHTonMultipleWelds`, `#pdfLISLLanguage`, `#pdfLISLFullLanguage`, `#pdfLISLFullLanguageWQ`, `#pdfLISLFullLanguageWQNEW`, `#pdfLISLFullLanguageGUrev2`, `#pdfLISLFullLanguageGUrev3`, `#pdfLISLFullLanguageA3`, `#showOrderDetails`, `#showOrderAuditTrail`, `#showIsometricAuditTrail`, `#pdfNdtRequestLanguage`, `#pdfNdtRequestLanguageAdditional`, `#pdfNdtPreRequestLanguageAdditional`, `#pdfNdtRequestLanguageMass`, `#pdfNdtRequestLanguagePre`, `#pdfNdtRequestLanguagePreMass`, `#pdfPwhtRequestLanguage`, `#pdfNdtRequestLanguageISO`, `#pdfNdtPreRequestLanguageISO`, `#pdfPwhtRequestLanguageISO`, `#addIsometric`, `#editIsometricMass`, `#editIsometricPhase`, `#addRev`, `#addRevItp`, `#addRevItp2`, `#showRev`, `#showRevItp`, `#showRevItp2`, `#editIsometric`, `#backIsometric`, `#deleteIsometric`, `#editWeld`, `#deleteWeld`, `#deleteSelectedWelds`, `#backWeld`, `#showNDO`, `#showWeldNdtArchive`, `#showWeldNdtPreArchive`, `#showWeldPwhtArchive`, `#showNDOPre`, `#showPWHT`, `#editCalculation`, `#deleteCalculation`, `#pdfWelderReportLanguage`, `#pdfWelderReportLanguageFull`, `#pdfWelderReportLanguageTracking`, `#pdfWelderNDTtracking`, `#pdfWelderTracer`, `#pdfWelderReportLanguageTrackingAdvanced`, `#pdfWelderReportLanguageTrackingAdvancedWDI`, `#pdfStatsReportLanguage`, `#pdfOpenWeldsLanguage`, `#pdfRevsLanguage`, `#pdfTracerReportLanguage`, `#releaseRequestModal`, `#releaseRequestModalField`, `#showCustomHydro`, `#showCustomHydroAgain`, `#hydrotestRequest`, `#transferLagerRequest`, `#moveToLaydownDashboard`, `#filterReleases`, `#filterSpoolTransport`, `#importHydrotestResultsSingle`, `#showHydrotestResultsSingle`, `#filterSpoolTransportMaterials`, `#importHydrotestResults`, `#filterPendingMaterials`, `#showServiceHistory`, `#pdfSpoolLocation`, `#pdfSpoolLocationTabs`, `#pdfPendingMaterials`, `#importCalculationsFromIso`, `#importCalculationsFromIsoProject`, `#removeLastCalculations`, `#markPunchAsRemoved`, `#setCheckedMaterialsTypeModal`, `#deleteCheckedMaterialsModal`, `#setStatus`, `#statusLog`, `#showIsometric`, `#punchlist`, `#punchlistEdit`, `#showQuantityLog`, `#materialStatusByRevision`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addCustomField`, `#editCustomField`, `#filterDashboard`, `#editCustomName`, `#editFieldName`, `#deleteCustomField`, `#addDashboardView`, `#deleteDashboardView`, `#editDashboardView`, `#editDashboardMass`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#srArchiveScanModal`, `#materialQrScanModal`.
