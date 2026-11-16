# Weld Pilot → Start → Dashboard

Source: `weld__start__dashboard.txt`, `weld__start__dashboard-weldpilot.txt`, `weld__start__dashboard-all-dates.txt`, `weld__start__dashboard-itp-111111.txt`, `weld__start__dashboard-itp-222222.txt`, `weld__start__dashboard-oct-nov.txt`, and the click captures `weld__start__dashboard__view-menu`, `__reports-menu`, `__report-1` … `__report-10`, `__compliance-all`, `__tracer-proposal` (also `__bell`, `__user-menu`, `__app-switcher`, `__change-password`, `__change-theme`, which belong to the shared top bar, not to this page) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/` (the sidebar link). The same page also opens as `/weldpilot/index.php?page=dashboard-weldpilot` with optional filter parameters (`from`, `to`, `itp`, …).
State of the page for the observing account: normal.

## Page

**Title / breadcrumb / tabs.** The capture has no page title, no breadcrumb and no tabs inside the page content. The browser title is "WeldPilot®" (with a "- " prefix when the page is opened as `index.php?page=dashboard-weldpilot`). The sidebar group "Start" holds "Dashboard" (`/weldpilot/`, the active entry) and "Daily reporting" (`/weldpilot/daily-reporting/`).

The page content is `#content` with classes `animated fadeIn weld-dashboard light-mode`. From top to bottom:

1. Heading line: project site name + weekday and date, here "Zandbak Monday 16 November 2026"; below it a small line "Site ID #1".
2. Round button `#modeToggle` (title "Dark Mode", aria-label "Switch to dark mode", moon icon), `onclick="toggleDarkMode()"`. Switches the dashboard between light and dark (see JavaScript rules).
3. Stat cards grid (`.weld-stat-grid.hide-on-small`, i.e. hidden on small screens).
4. Filter panel (dark panel with a GET form).
5. A "visual summary" line under the form (`.weld-visual-summary`).
6. Buttons: "Manage ITP/KNR", "View: Number of welds" (dropdown), "Reports" (dropdown).
7. Card "Inspection compliance" (title, one-line description, overview tiles, toolbar, list of group cards).
8. Dialog "Tracer proposal" (`#weldTracerProposalModal`), present in the page, opened from a group card.

The line `#weldDashboardMeta` that the script writes a snapshot text into does not exist in the page (the script looks it up and does nothing when it is missing).

### Stat cards (in this order)

Card labels, value ids set by the script, and the small texts shown with them:

| Card | Value element id | Small text (default state) |
|---|---|---|
| Projects | `weldDashboardProjectsValue` | "Projects inside the current filter scope." |
| Isometrics | `weldDashboardIsometricsValue` | "Unique isometrics inside the current filter scope." |
| Total welds | `weldDashboardTotalValue` | weld-type breakdown, e.g. "UNK 42, WS 22, FW 13"; when there is none: "Total filtered weld workload." (`weldDashboardTotalMeta`) |
| Welded | `weldDashboardWeldedValue` | weld-type breakdown, e.g. "UNK 26, WS 20, FW 13"; when there is none: "No welded joints per type in current filter." (`weldDashboardWeldedMeta`) |
| Examined % | `weldDashboardExaminedValue` | "Welds with an NDT result and a welder, as a share of the current scope." |
| Repaired | `weldDashboardRepairsValue` | "Measured repair impact within the same dataset." |
| Repair rate | `weldDashboardRepairRateValue` | "Repaired divided by welded welds. Welds without a welder are excluded." |
| Repair performance | `weldDashboardRepairPerformanceActual` | three sub-values: "Limit" (`…Limit`), "Scope" (`…Scope`), and a status word (`…Status`): "Above limit" or "Within limit" |

Values: counts are shown with thousands separators (en-US, no decimals); percentages with one decimal and " %" ("11.7 %"). In the "Welds length" view the Total welds and Repaired values would carry the suffix " mm" (see JavaScript rules); the capture only shows the "welds" view.

### Filter panel (GET form to the same page)

Fields in document order (all labels have `for="input00"`; no field is marked required; every select is a select2 widget with a search box):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `page` | hidden | no | `dashboard-weldpilot` | |
| 2 | From Date | `from` | text, class `dpicker` (date picker, format dd.mm.yyyy), placeholder "From Date" | no | empty | |
| 3 | To Date | `to` | text, class `dpicker`, placeholder "To Date" | no | today (16.11.2026) | |
| 4 | Company | `company` | select | no | 0 "All" | 3 options: 0→All*, 7→MONTAVAR METALNA LOLA, 8→Websonik Applicaties BV |
| 5 | Weld type | `weldType` | select | no | "All" | 3 options: 0→All*, 1→Shop, 2→Field |
| 6 | Intern prj. no. | `project[]` | multi-select, placeholder "All projects" | no | none selected | 1 option: 1→20240101 |
| 7 | Welder | `welder[]` | multi-select, placeholder "All welders" | no | none selected | 90 options, text "code \| name". First 10 (codes): 1→W01/W02, 2→W01, 3→W02, 4→(empty code), 5→W02/W03, 6→W04, 28→ML396, 109→ML690, 110→MV180, 111→MV942 |
| 8 | ITP/KNR | `itp` | select | no | "All" | 4 options: (empty)→All*, 1→"1 \| 10%", 111111→"111111 \| 14%", 222222→"222222 \| 14%" |
| 9 | Piping class | `pipingClass` | select | no | "All" | 3 options: (empty)→All*, A11011→A11011, CS02→CS02 |
| 10 | IRN | `irn` (id `weldDashboardIrn`) | select, loaded by request | no | "All" | 1 option in the page: (empty)→All*. More values are fetched while typing (see JavaScript rules) |
| 11 | PED Cat.-Mod | `ped` | select | no | "All" | 2 options: (empty)→All*, 1→1 |
| 12 | Material | `material` | select | no | "All" | 3 options: (empty)→All*, CS→CS, P235GH→P235GH |
| 13 | NDT process group | `ndtgroup[]` | multi-select, placeholder "All NDT Groups" | no | none selected | 11 options: 1→RT, 2→PT, 3→MT, 4→UT-ToFD, 5→VT, 6→PA, 7→MT-b, 8→PT-b, 10→UT, 12→PMI, 13→FERRITE |
| 14 | NDT process | `ndt` | select | no | 0 "All NDT processes" | 5 options: 0→All NDT processes*, 1→RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1, 4→MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x, 5→PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x, 13→TOFD - Execution: NEN-EN-ISO 10863 / Acceptance NEN-EN-ISO 15626 L1 |
| 15 | WPS method | `wps[]` | multi-select, placeholder "All wps methods" | no | none selected | 3 options: 1→11111, 5→23.008, 6→22.028BR |
| 16 | Tracer (control group hidden, `HID`) | `tracer` | select | no | 0 "All" | 3 options: 0→All, 1→Yes, 2→No |
| 17 | Chart type (control group hidden, `HID`) | `type` | select | no | 0 "Pie chart" | 3 options: 0→Pie chart*, 1→Pie chart 3D, 2→Donut chart |

Buttons: "Filter" (`btn btn-default wsapps-filter-apply`, `name="search"`, `type="submit"`, search glyph icon); "Reset" (link `index.php?page=dashboard-weldpilot`, class `wsapps-filter-reset`).

After the form: `.weld-visual-summary`, three short items "From Date", "Project", "Welder", each with the current value: "All" when nothing is chosen, a date range such as "01.01.2000 - 31.12.2099" for From Date when `from` is set.

### Buttons above the compliance card

- "Manage ITP/KNR" — `btn btn-dark`, plain link to `index.php?…&viewweld=welds&itp_manager=1` (all current filter parameters, plus `redirect=`, `logout=` with empty values, and `itp_manager=1`; the capture cuts the URL at "…[438]"). From the browser-pass notes: it reloads the dashboard in ITP-manager mode; it was not opened, so that mode is not captured.
- "View: Number of welds" — dropdown button (`data-toggle="dropdown"`; label shows the current view). Menu (pull-right), two links that reload the page with the current filter and `viewweld=`:
  - "Welds length" → `index.php?to=16.11.2026&company=0&weldType=0&ndt=0&tracer=0&type=0&viewweld=length`
  - "Number of welds" → `index.php?to=16.11.2026&company=0&weldType=0&ndt=0&tracer=0&type=0&viewweld=welds`
  (When `itp` / `from` are set they are carried in these links, e.g. `…&itp=111111&…`.) Neither link was clicked; the "Welds length" page is not captured.
- "Reports" — dropdown button; 10 entries, each `data-toggle="modal"` with `type="button"`: see the table below.

| # | Menu entry | Opens dialog |
|---|---|---|
| 1 | Welder report | `#pdfWelderReportLanguage` |
| 2 | Welder report - All sites | `#pdfWelderReportLanguageFull` |
| 3 | Welder tracking | `#pdfWelderReportLanguageTracking` |
| 4 | WDI tracking | `#pdfWelderReportLanguageTrackingAdvancedWDI` |
| 5 | WDI tracking V2 | `#pdfStatsReportLanguage` |
| 6 | Welder tracking - With tracer | `#pdfWelderTracer` |
| 7 | Welder tracking - NDT tracking | `#pdfWelderNDTtracking` |
| 8 | Open welds | `#pdfOpenWeldsLanguage` |
| 9 | Revisions report | `#pdfRevsLanguage` |
| 10 | Tracer report | `#pdfTracerReportLanguage` |

## List

The page has no data table. Its list is the "Inspection compliance" card.

**Card title** "Inspection compliance". **Description line:** "Grouped by welder, WPS and ITP/KNR. Required examination uses the central ITP/KNR NDT % with a 10% fallback. Tracers are excluded."

**Overview tiles** (`#weldInspectionProgress`, `.weld-compliance-overview`), six tiles in this order, each with label, value, small text:

| Tile | Small text |
|---|---|
| Total welds | weld-type breakdown ("UNK 27, WS 20, FW 12"); without one: "Across active welder / WPS / ITP-KNR groups." |
| Required examination | "Central ITP/KNR % with 10% fallback for N groups." |
| Examined welds | "Fully completed NDT only." |
| Selected for examination | "Marked with NDT Req. and not yet completed." |
| Remaining required | "Extra inspections still needed." |
| Compliance status | value "NOT COMPLIANT" or "COMPLIANT" (tile class `is-bad` / `is-ok`); small text "N of M groups compliant." |

Above the tiles a note "Data quality" (with lines) appears only when the response reports unmapped isometrics ("N isometrics still miss a central ITP/KNR link."), groups with a missing central percentage ("Missing central percentage for: <codes>."), or legacy percentage conflicts ("Legacy percentage conflicts detected for: <codes>."). No such note is shown in the sandbox.

**Toolbar** (re-rendered with every refresh):
- `#weldComplianceSearch` — search input, placeholder "Search welder, WPS or ITP/KNR" (value kept across refreshes).
- `#weldComplianceStatus` — select, 3 options: `bad`→"Not compliant" (default), `ok`→"Compliant", `all`→"All groups".
- "Previous" and "Next" — small buttons (`data-compliance-nav="prev"` / `"next"`); disabled when there is no previous / next page. Both are disabled in all captures.
- Range text, template "%s–%s of %s", e.g. "1–3 of 3" ("0–0 of 0" when there are no rows).
- Page size: 50 groups (`compliance_limit=50`). No control changes it.

**Group cards** (`.weld-compliance-item`, one per welder + WPS + ITP/KNR group). Class `is-bad` when the group is not compliant; plus `has-defect-bad` (red) or `has-defect-warn`. Each card contains, in order:
1. Head: welder label ("<welder code> - <welder name>", or just the code when there is no name; "Unknown welder" when missing) and a status badge "COMPLIANT" / "NOT COMPLIANT".
2. Context line: "WPS: <wps number> | ITP/KNR: <itp code> | NDT %: <value>". WPS shows "No WPS" when the group has none (or "#<id>" when the number is empty). ITP shows "Unassigned" when empty. NDT % shows "14.0 %" or "Fallback 10%". When the row has an ITP issue, an inline note follows: "No central ITP/KNR linked for this weld." or "Central ITP/KNR percentage missing. Using 10% fallback."
3. Five metrics: Total welds, Required examination, Examined welds, Selected for examination, Remaining required.
4. Three progress rows, each label + bar + "n / required": "Tested", "Selected", "Remaining" (fill classes `--success`, `--primary`, `--danger`; width is the row's tested / selected / remaining percent clamped to 0–100).
5. Block "Weld defect % per welder / WPS" with a flag (the upper-cased `defectFlag`: WARN and BAD are seen, "OK" is the script's default; hover title is the reason, sample reason "Not examined"), then seven metric cells: Welds, Examined, Exam %, Rejected, Reject %, Tracers, Tracer status.
   - "Tracers" cell is a button (`data-tracer-action="open"` with `data-welder-id`, `data-wps-id`, `data-itp-code`) when the group has missing tracers or rejected welds; its value is the number of existing tracers and its small text is "Missing N" (or "Open details" when none are missing). Otherwise it is a plain cell showing only the number. Clicking the button opens "Tracer proposal".
   - "Tracer status" cell: value and small text computed from counts (see JavaScript rules): "Not needed" / "No tracer action required for this group."; "Rejected" / "A accepted / R rejected" (+ " | N additional tracer(s) still required."); "Missing" / "N of E tracer(s) still required."; "Selected" / "N of E tracer(s) selected."; "Open" / "Tracer workflow is open for this group."

**Empty state.** When there are no groups at all in the current selection the whole card body is replaced by "No compliance groups found inside the current selection." (the toolbar is not shown; the oct-nov capture shows this). When the filtered page has no rows but groups exist: note "No groups in this view."

**Server request.** The page loads its numbers by `GET /core/ajax/ajax-weld-dashboard-summary.php` (see JavaScript rules); there is no table `ajax` configuration. Export / print buttons: none on the page itself (the report dialogs produce PDFs).

## Dialogs

Common to the ten report dialogs (`.modal`, `role="basic"`): header with a close button (×) and an h4 title; a body containing one GET form with `target="_blank"` (the PDF opens in a new tab); footer buttons **"Go"** (`btn btn-primary btn-hidePrint`, `name="go"`, `type="submit"`) and **"Cancel"** (`btn default`, `data-dismiss="modal"`). The `Language` select (`name="lang"`, label "Language", 4 options: en→English* (default), nl→Nederlands, de→Deutsch, fr→Français) is in every one. Hidden inputs are present with empty value unless a default is stated. The capture does not show any script that copies the dashboard filter values into these hidden inputs (see "Not in the capture"); only the default values below are visible. No field is marked required in the markup; rules enforced by script are noted per dialog.

### Welder report (`#pdfWelderReportLanguage`) — opened by Reports → "Welder report"
Form action `../core/pdf/welderReport.php`, class `js-welder-report-requires-welder`, `data-welder-required-msg="Please select a welder in the dashboard filter before generating this report."`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | see above |
| 2 | | `project` | hidden | no | empty | |
| 3 | | `ndt` | hidden | no | empty | |
| 4 | | `wps` | hidden | no | empty | |
| 5 | | `welder` | hidden | no | empty | must be non-empty and not "0" to submit |
| 6 | | `from` | hidden | no | empty | |
| 7 | | `to` | hidden | no | 16.11.2026 | |
| 8 | | `testSystemFilter` | hidden | no | empty | |
| 9 | | `pipingClass` | hidden | no | empty | |
| 10 | | `itp` | hidden | no | empty | |
| 11 | | `irn` | hidden | no | empty | |
| 12 | | `material` | hidden | no | empty | |
| 13 | | `ped` | hidden | no | empty | |

### Welder report - All sites (`#pdfWelderReportLanguageFull`, title "Welder report") — opened by Reports → "Welder report - All sites"
Form action `../core/pdf/welderReportFull.php`, classes `js-welder-report-requires-welder js-welder-report-full-max-range`, `data-max-months="6"`, `data-max-range-msg="The date range for Welder report – All sites may not exceed 6 months."`, plus the welder-required message of the first dialog.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | Include N/A NDT results | `na` | checkbox, value `ok` | no | unchecked | |
| 3 | Include without NDT result | `includeWithoutNdt` | checkbox, value `ok` | no | unchecked | |
| 4 | | `ndt` | hidden | no | empty | |
| 5 | | `from` | hidden | no | empty | date range check uses it |
| 6 | | `to` | hidden | no | 16.11.2026 | |
| 7 | | `testSystemFilter` | hidden | no | empty | |
| 8 | | `pipingClass` | hidden | no | empty | |
| 9 | | `itp` | hidden | no | empty | |
| 10 | | `irn` | hidden | no | empty | |
| 11 | | `material` | hidden | no | empty | |
| 12 | | `ped` | hidden | no | empty | |
| 13 | | `company` | hidden | no | empty | |
| 14 | | `weldType` | hidden | no | empty | |

### Welder tracking (`#pdfWelderReportLanguageTracking`) — opened by Reports → "Welder tracking"
Form action `../core/pdf/welderReportGroupAdvanced.php`, classes `js-welder-report-requires-welder js-welder-tracking-requires-ndt`, `data-welder-required-msg` (as above), `data-ndt-required-msg="Select an NDT process before generating this report."`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | Report type | `single` | select | no | no "Show grouped NDT (by NDT method)" | 2 options: no→Show grouped NDT (by NDT method)*, yes→Show single NDT process |
| 3 | NDT process | `ndt` | select | no | 0 "All NDT processes" | 5 options: 0→All NDT processes*, 4→MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x, 5→PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x, 1→RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1, 13→TOFD - Execution: NEN-EN-ISO 10863 / Acceptance NEN-EN-ISO 15626 L1. Must not be "All" / 0 when Report type is "yes" |
| 4 | | `project` | hidden | no | empty | |
| 5 | | `wps` | hidden | no | empty | |
| 6 | | `welder` | hidden | no | empty | must be non-empty and not "0" |
| 7 | | `from` | hidden | no | empty | |
| 8 | | `to` | hidden | no | 16.11.2026 | |
| 9 | | `company` | hidden | no | empty | |
| 10 | | `weldType` | hidden | no | empty | |
| 11 | | `itp` | hidden | no | empty | |
| 12 | | `pipingClass` | hidden | no | empty | |
| 13 | | `testSystemFilter` | hidden | no | empty | |
| 14 | | `irn` | hidden | no | empty | |
| 15 | | `material` | hidden | no | empty | |
| 16 | | `ped` | hidden | no | empty | |

### WDI Tracking (`#pdfWelderReportLanguageTrackingAdvancedWDI`) — opened by Reports → "WDI tracking"
Form action `../core/pdf/welderReportSum.php`. No client-side checks.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `single` | hidden | no | `no` | |
| 3 | | `project` | hidden | no | empty | |
| 4 | | `ndt` | hidden | no | empty | |
| 5 | | `wps` | hidden | no | empty | |
| 6 | | `welder` | hidden | no | empty | |
| 7 | | `from` | hidden | no | empty | |
| 8 | | `to` | hidden | no | empty | |
| 9 | | `pipingClass` | hidden | no | empty | |
| 10 | | `testSystemFilter` | hidden | no | empty | |
| 11 | | `company` | hidden | no | empty | |
| 12 | | `weldType` | hidden | no | empty | |
| 13 | | `itp` | hidden | no | empty | |
| 14 | | `irn` | hidden | no | empty | |
| 15 | | `material` | hidden | no | empty | |
| 16 | | `ped` | hidden | no | empty | |

### WDI tracking V2 (`#pdfStatsReportLanguage`) — opened by Reports → "WDI tracking V2"
Form action `../core/pdf/statsReport.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `from` | hidden | no | empty | |
| 3 | | `to` | hidden | no | 16.11.2026 | |
| 4 | | `company` | hidden | no | empty | |
| 5 | | `weldType` | hidden | no | empty | |
| 6 | | `ndt` | hidden | no | empty | |
| 7 | | `itp` | hidden | no | empty | |
| 8 | | `pipingClass` | hidden | no | empty | |
| 9 | | `irn` | hidden | no | empty | |
| 10 | | `ped` | hidden | no | empty | |
| 11 | | `material` | hidden | no | empty | |
| 12 | | `tracer` | hidden | no | empty | |
| 13 | | `testSystemFilter` | hidden | no | empty | |
| 14 | | `viewweld` | hidden | no | `welds` | |

### Welder tracking - With tracer (`#pdfWelderTracer`) — opened by Reports → "Welder tracking - With tracer"
Form action `/core/pdf/welderReportTracer.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `single` | hidden | no | `no` | |
| 3 | | `project` | hidden | no | empty | |
| 4 | | `ndt` | hidden | no | empty | |
| 5 | | `wps` | hidden | no | empty | |
| 6 | | `welder` | hidden | no | empty | |
| 7 | | `from` | hidden | no | empty | |
| 8 | | `to` | hidden | no | empty | |
| 9 | | `testSystemFilter` | hidden | no | empty | |
| 10 | | `company` | hidden | no | empty | |
| 11 | | `weldType` | hidden | no | empty | |
| 12 | | `pipingClass` | hidden | no | empty | |
| 13 | | `itp` | hidden | no | empty | |
| 14 | | `irn` | hidden | no | empty | |
| 15 | | `material` | hidden | no | empty | |
| 16 | | `ped` | hidden | no | empty | |

### Welder tracking - NDT tracking (`#pdfWelderNDTtracking`, title "Welder tracking - NDT tracking") — opened by Reports → "Welder tracking - NDT tracking"
Form action `/core/pdf/welderReportTracerV2.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `single` | hidden | no | `no` | |
| 3 | Percentage? | `percent` | number (`form-control`) | no | 10 | |
| 4 | Include examined welds | `examinedWelds` | checkbox, value `ok` | no | unchecked | |
| 5 | Show test pressured welds | `tsShow` | checkbox, value `ok` | no | unchecked | |
| 6 | | `project` | hidden | no | empty | |
| 7 | | `ndt` | hidden | no | empty | |
| 8 | | `wps` | hidden | no | empty | |
| 9 | | `welder` | hidden | no | empty | |
| 10 | | `from` | hidden | no | empty | |
| 11 | | `to` | hidden | no | empty | |
| 12 | | `testSystemFilter` | hidden | no | empty | |
| 13 | | `company` | hidden | no | empty | |
| 14 | | `weldType` | hidden | no | empty | |
| 15 | | `pipingClass` | hidden | no | empty | |
| 16 | | `itp` | hidden | no | empty | |
| 17 | | `irn` | hidden | no | empty | |
| 18 | | `material` | hidden | no | empty | |
| 19 | | `ped` | hidden | no | empty | |

### Open welds (`#pdfOpenWeldsLanguage`) — opened by Reports → "Open welds"
Form action `/core/pdf/openWelds.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | Weld type | `weldType` | select | no | 0 "All weld types" | 18 options: 0→All weld types*, 4→Butt Weld - Field, 17→Branch welds- Field, 18→Socked welds -Shop, 19→Butt Weld - Shop, 20→Reinforcment Pad GW -Shop, 21→Branch welds- Shop, 23→Socked welds -Field, 24→Reinforcment Pad GW -Field, 25→Longitudinal Welds - Shop, 26→Longitudinal Welds - Field, 27→Reinforcment Pad FW - Shop, 28→Fillet Weld - Shop, 29→Fillet Weld - Field, 30→HOOK-UP, 31→Victaulic Joint-Shop, 32→Victaulic Joint-Field, 33→Reinforcment Pad FW - Field |
| 3 | | `project` | hidden | no | empty | |
| 4 | | `welder` | hidden | no | `0` | |
| 5 | | `from` | hidden | no | empty | |
| 6 | | `to` | hidden | no | empty | |
| 7 | | `projectSite` | hidden | no | `1` | |

### Revisions report (`#pdfRevsLanguage`) — opened by Reports → "Revisions report"
Form action `../core/pdf/revsReport.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `project` | hidden | no | empty | |
| 3 | | `welder` | hidden | no | `0` | |
| 4 | | `from` | hidden | no | empty | |
| 5 | | `to` | hidden | no | empty | |
| 6 | | `projectSite` | hidden | no | `1` | |

### Tracer report (`#pdfTracerReportLanguage`) — opened by Reports → "Tracer report"
Form action `/core/pdf/tracerReport.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Language | `lang` | select | no | en | |
| 2 | | `project` | hidden | no | empty | |
| 3 | | `ndt` | hidden | no | empty | |
| 4 | | `wps` | hidden | no | empty | |
| 5 | | `welder` | hidden | no | empty | |
| 6 | | `from` | hidden | no | empty | |
| 7 | | `to` | hidden | no | empty | |
| 8 | | `testSystemFilter` | hidden | no | empty | |
| 9 | | `company` | hidden | no | empty | |
| 10 | | `weldType` | hidden | no | empty | |
| 11 | | `pipingClass` | hidden | no | empty | |
| 12 | | `itp` | hidden | no | empty | |
| 13 | | `irn` | hidden | no | empty | |
| 14 | | `material` | hidden | no | empty | |
| 15 | | `ped` | hidden | no | empty | |
| 16 | | `projectSite` | hidden | no | `1` | |

### Tracer proposal (`#weldTracerProposalModal`) — opened by the "Tracers" button of a compliance group card
Dialog `.modal.fade.weld-tracer-modal`, `role="dialog"`. It contains no static input; everything inside the body is built by the script after the request.

- Header: close button "×" (`aria-label="Close"`), h4 `#weldTracerProposalTitle` "Tracer proposal", paragraph `#weldTracerProposalMeta`, filled with "Welder: <welder label> | WPS: <wps number> | ITP/KNR: <itp code>" (sandbox example: "Welder: ML396 - <name> | WPS: 22.028BR | ITP/KNR: Unassigned"; "No WPS" and "Unassigned" are the fallbacks, "Unknown welder" for a missing welder).
- Body: shows "Loading..." until the list request returns (the body element has no id in the capture although the script addresses `#weldTracerProposalBody`). Rendered content, top to bottom:
  1. Four tiles: "Rejected welds", "Expected tracers", "Existing tracers", "Missing tracers" (sandbox: 1, 2, 0, 2).
  2. One orange warning line per warning in the response (sandbox: "No eligible tracer candidates found inside this welder / WPS / ITP-KNR group.").
  3. One section per rejected source weld: title "Rejected weld <weld no>" (or "Rejected weld #<id>"), note "ISO <iso no> | N linked of M required." (sandbox: "ISO 0005 | 0 linked of 2 required."; M defaults to 2).
     - If the source already has tracers: note "N locked, M removable." and a list of its current tracers as checked checkboxes; a tracer that is locked (a request or result exists) is disabled.
     - If there are candidates: note "Select up to 2 tracers for this rejected weld." and a list of candidate checkboxes (unchecked).
  4. When there are no sources: "No candidate welds are currently available for this group."
  - Each candidate row is a label with a checkbox (class `weld-tracer-candidate__checkbox`, value = weld id, `data-source-id` = source weld id; no `name`), a title "Weld <no>" (or "Weld #<id>"), a line "Project: <no> | ISO: <iso> | Type: <weld type> | Date: <dd.mm.yyyy>" ("-" when empty), a status text (response `statusLabel`, "Open" if empty) and, for current tracers, a hint: "Current tracer. You can deselect it because no request/result exists yet." or "Current tracer is locked because a request or result already exists."
- Footer: "Close" (`btn btn-default`, dismiss) and a primary button `#weldTracerProposalSave`. The markup says "Save as tracer"; the script sets its text to "Save tracer selection" and to "Saving..." (disabled) while saving. In the sandbox capture (one source, no candidates) the button is enabled, as the browser-pass notes also report; the script enables it whenever the proposal has at least one source.

Response shape seen for the list request (sandbox, group welder id 28 / WPS id 6 / ITP "Unassigned"): `success`, `proposal.group` {welderId, welderLabel, wpsId, wpsNumber, itpCode, ndtPercent 10}, `proposal.status` {defectFlag "bad", defectFlagReason "Rejected but tracers missing", rejectedWelds 1, expectedTracers 2, existingTracers 0, missingTracers 2, lockedTracers 0, removableTracers 0, candidateCount 0, availableCandidateCount 0}, `proposal.sources[]` {source {id, weldNo "003", projectNo "20240101", isometricId, isometricNo "0005", weldTypeLabel "Shop", dateRaw 2025-01-05, dateLabel "05.01.2025", statusLabel "Rejected weld", isSelected false, isTested true, isRejected true, isCurrentTracer false, removable true, priority 3}, current_tracers [], candidates [], expected_tracers 2, linked_tracers 0, missing_tracers 2, locked_tracers 0, removable_tracers 0}, `proposal.warnings[]`.

## Rules found in the page's JavaScript

Main inline script (the one containing `summaryEndpoint`; function names in brackets).

**Requests**
- `GET ../core/ajax/ajax-weld-dashboard-summary.php?<current page query string>&force=0|1&compliance_offset=<n>&compliance_limit=50&compliance_status=bad|ok|all&compliance_q=<search text>` [`summaryUrl`, `refreshSummary`]. `force=1` only after saving tracers. Fired once when the page is ready, again on every compliance search / filter / paging change, after a tracer save, and every 180000 ms (3 minutes) [`scheduleRefresh`]. On failure the meta line text (if the element existed) would be "Dashboardgegevens konden niet worden geladen.".
- `GET ../core/ajax/ajax-weld-dashboard-tracers.php` with `action=list`, `welderId`, `wpsId`, `itpCode` plus all current page query parameters [`openTracerProposal`, `buildTracerRequestData`]. The parameters `weldId`, `pendingRejection` and `welderNA` get special treatment in that copy loop (the line that follows the test is not in the capture); repeated keys become arrays.
- `POST ../core/ajax/ajax-weld-dashboard-tracers.php` (JSON response) with the same data, `action=save`, and `sourceAssignments` = JSON text of `{ "<source weld id>": [<tracer weld ids>] }` built from all checked candidate boxes [`saveTracerProposal`, `selectedTracerAssignments`]. The success response may carry `message` (shown as a success toast) and `proposal` (re-rendered); then the summary is reloaded with `force=1`.
- `GET ../core/ajax/ajax-weld-dashboard-irn.php?q=<typed text>` for the IRN select; response `{results:[…]}`; 200 ms delay, `minimumInputLength 0`, placeholder "All", clearable [`initIrnSelect`].
- `GET /core/ajax/ajax-notifications.php?action=count_unread` (shared top bar, fired on load).
- When the sandbox page loaded, the capture lists exactly: the summary request and the notification count request.

**Filling the page from the summary response** [`updateStats`, `renderInspectionProgress`]
- Projects = `total_projects`; Isometrics = `total_isometrics`; Total welds = `total_weld_value` (+ " mm" when the view is not "welds"); small text = `total_weld_type_breakdown` as "ABBR count" joined by ", " (types with count 0 left out); Welded = `total_welded_count`, small text from `welded_type_breakdown`; Examined % = `examined_percent`; Repaired = `total_repairs`; Repair rate = `repairs_examined_percent`; Repair performance: actual = `repairs_examined_percent` (clamped 0–100), Limit = `repair_limit_percent` (clamped), Scope = `repairs_total_percent`; status "Within limit" when actual ≤ limit, otherwise "Above limit" with class `is-alert`.
- Number format: en-US, integers without decimals; percentages one decimal followed by " %".
- Compliance tiles from `inspection_compliance_summary`: total_welds, required_inspections, tested_welds (shown as "Examined welds"), selected_for_testing, remaining_required, fallback_groups, compliant_groups / total_groups, compliance_status (tile `is-ok` only when "COMPLIANT").
- Card list from `inspection_compliance_rows`; paging from `inspection_compliance_page` {total, offset, limit, status, q}. Warning note from `inspection_compliance_warnings`.
- Card rules: card is `is-bad` when `complianceClass` is not "ok". Defect block is red when the card is not compliant or `defectFlag` is "bad", amber when "warn", else neutral; the flag text is the upper-cased `defectFlag`, the title attribute `defectFlagReason`. NDT % shows "Fallback 10%" when `usesFallbackPercent` is true, else the percentage with one decimal; value defaults to 10 when missing.
- Tracer status [`buildTracerStatus`]: expected = `defectExpectedTracers`, existing = `defectTracerWelds`, examined = `defectTracerExamined`, rejected = `defectTracerRejected`, missing = `defectMissingTracers`, accepted = max(0, examined − rejected). Order of tests: expected ≤ 0 → "Not needed"; else rejected > 0 → "Rejected" with hint "accepted / rejected" (plus " | N additional tracer(s) still required." when missing > 0); else missing > 0 → "Missing"; else existing > 0 → "Selected"; else "Open".
- The Tracers cell is a button when missing > 0 or `defectRejected` > 0.
- Label translations for status text, ITP issue texts and "Unassigned" are looked up in the `wdc` / `labels` tables (English here).

**Compliance toolbar** [document handlers]
- Typing in `#weldComplianceSearch`: stores the text, resets offset to 0, reloads after 300 ms; the input keeps focus and caret after re-render.
- Changing `#weldComplianceStatus`: stores status, offset 0, reloads at once.
- "Previous" / "Next": offset − limit (not below 0) / offset + limit (only while less than total), reload; a disabled button does nothing.
- Initial state: offset 0, query empty, status "bad", limit 50.

**Tracer dialog** [handlers on `tracerModalBody`, `tracerModalSave`, `tracerModal`]
- Click on any `[data-tracer-action="open"]` opens the dialog and starts the list request. List failure or `success:false` shows a toast with the server error or "Tracer proposal could not be loaded." and disables Save.
- More than 2 checked candidate boxes for the same source weld: the last one is unchecked again and a warning toast says (in Dutch) that at most 2 tracers per rejected weld can be selected ("Je kunt maximaal 2 tracers per afgekeurde las selecteren.").
- Save click: ignored while a save is running; otherwise POST as above. Save errors show a toast with the server error or (Dutch) "Tracer(s) konden niet worden opgeslagen.".
- When the dialog is hidden: context and proposal are cleared and the body emptied.

**Filters** [`initFilterSelects`]
- Every `.select2-single` inside `.wsapps-filters` is turned into a select2 box: full width, search box always shown, placeholder from `data-placeholder`, clear button and stay-open-on-select only for multiple selects; the search box placeholder is "Zoek <label in lower case>..." (Dutch). Date inputs `.dpicker` use the date picker with format dd.mm.yyyy (`$('.dpicker').datepicker({format:'dd.mm.yyyy'})`).

**Dark mode** [`toggleDarkMode`, `setWeldMode`, shared theme script `applyAppTheme` / `syncDashboardTheme`]
- `#modeToggle` click: if the header theme button `#wsappsAppThemeToggle` exists it is clicked (the lines that follow are not in the capture), then the dashboard switches class `light-mode` ↔ `dark-mode`, icon moon ↔ sun, tooltip "Dark Mode" ↔ "Light Mode", aria-label "Switch to dark mode" ↔ "Switch to light mode"; the compliance list is re-rendered.
- The shared header toggle stores the theme in cookie `wsapps_ui_theme` (one year), in `localStorage` key `wsapps_ui_theme`, and calls `index.php?ui_theme=<light|dark>&ajax=1`; it also sets `dark-mode` / `light-mode` on `#content` and calls `setWeldMode`.

**Report forms** [submit handler on `form.js-welder-report-requires-welder` in the large shared script]
- Welder required: the first non-empty value that is not "0" among inputs named `welder` or `welder[]` inside the form; if none, a warning toast (or an alert when no toast library) shows the form's `data-welder-required-msg` ("Please select a welder in the dashboard filter before generating this report."). The lines that would then stop the submit are among those left out of this capture.
- `js-welder-tracking-requires-ndt` (Welder tracking dialog): when field `single` has value "yes" and field `ndt` is empty or "0": warning "Select an NDT process before generating this report.".
- `js-welder-report-full-max-range` (Welder report - All sites): only when `from` is not empty. Both `from` and `to` are parsed as dd.mm.yyyy; if either cannot be parsed, or `to` is later than `from` plus `data-max-months` (6) months, the warning "The date range for Welder report – All sites may not exceed 6 months." is shown.
- The other report forms have no client-side check in the capture.

Other: select2 is applied to every select in a modal with the modal as dropdown parent (shared code).

## Sample data

Sandbox project site "Zandbak", Site ID #1, date line "Zandbak Monday 16 November 2026". Welder identities below are given by welder code only.

### Figures per capture (side by side)

Captures: A = `/weldpilot/` (default; `to`=16.11.2026, `from` empty; the `?page=dashboard-weldpilot` capture shows identical figures), B = all dates `from=01.01.2000&to=31.12.2099`, C = `itp=111111`, D = `itp=222222`, E = `from=01.10.2026&to=16.11.2026`.

| Item | A default | B all dates | C ITP 111111 | D ITP 222222 | E Oct–Nov |
|---|---|---|---|---|---|
| Visual summary: From Date / Project / Welder | All / All / All | 01.01.2000 - 31.12.2099 / All / All | All / All / All | All / All / All | 01.10.2026 - 16.11.2026 / All / All |
| ITP select shows | All | All | 111111 \| 14% | 222222 \| 14% | All |
| Projects | 1 | 1 | 1 | 1 | 1 |
| Isometrics | 7 | 7 | 1 | 1 | 7 |
| Total welds | 77 (UNK 42, WS 22, FW 13) | 31 (WS 20, FW 9, UNK 2) | 18 (FW 10, UNK 5, WS 3) | 18 (FW 10, UNK 5, WS 3) | 0 ("Total filtered weld workload.") |
| Welded | 59 (UNK 26, WS 20, FW 13) | 31 (WS 20, FW 9, UNK 2) | 17 (FW 10, UNK 4, WS 3) | 17 (FW 10, UNK 4, WS 3) | 0 ("No welded joints per type in current filter.") |
| Examined % | 11.7 % | 29.0 % | 16.7 % | 16.7 % | 0.0 % |
| Repaired | 7 | 7 | 2 | 2 | 0 |
| Repair rate | 11.9 % | 22.6 % | 11.8 % | 11.8 % | 0.0 % |
| Repair performance (actual) | 11.9 % | 22.6 % | 11.8 % | 11.8 % | 0.0 % |
| Limit | 5.0 % | 5.0 % | 5.0 % | 5.0 % | 5.0 % |
| Scope | 9.1 % | 22.6 % | 11.1 % | 11.1 % | 0.0 % |
| Status word | Above limit | Above limit | Above limit | Above limit | Within limit |
| Compliance: Total welds | 59 (UNK 27, WS 20, FW 12) | 31 (WS 20, FW 8, UNK 3) | 18 (FW 8, UNK 5, WS 5) | 18 (FW 8, UNK 5, WS 5) | (card shows the empty state) |
| Required examination | 12 (fallback for 5 groups) | 9 (fallback for 4 groups) | 4 (fallback for 0 groups) | 4 (fallback for 0 groups) | – |
| Examined welds | 11 | 11 | 5 | 5 | – |
| Selected for examination | 14 | 11 | 8 | 8 | – |
| Remaining required | 5 | 2 | 1 | 1 | – |
| Compliance status | NOT COMPLIANT, "6 of 9 groups compliant." | NOT COMPLIANT, "6 of 8 groups compliant." | NOT COMPLIANT, "3 of 4 groups compliant." | NOT COMPLIANT, "3 of 4 groups compliant." | – |
| Toolbar range (filter "Not compliant") | 1–3 of 3 | 1–2 of 2 | 1–1 of 1 | 1–1 of 1 | – |
| Cards in the list | ML396 / No WPS / Unassigned; W01 / 11111 / 222222; W01 / 11111 / Unassigned | W01 / 11111 / 222222; W01 / 11111 / Unassigned | W01 / 11111 / 222222 | W01 / 11111 / 222222 | "No compliance groups found inside the current selection." |

Things the captures show that may look odd: in B the stat cards say "FW 9, UNK 2" while the compliance tile says "FW 8, UNK 3" for the same 31 welds; in C and D (different ITP) the figures and the one card are identical, and the card shown is a group with ITP 222222 in both; in E the Isometrics card still shows 7 while Total welds is 0. These are reported as displayed.

### Default capture: compliance list, filter "Not compliant" (3 cards)

| Welder | Status | WPS | ITP/KNR | NDT % | Total welds | Required | Examined | Selected | Remaining | Tested | Selected | Remaining | Defect flag | Welds | Examined | Exam % | Rejected | Reject % | Tracers | Tracer status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ML396 | NOT COMPLIANT | No WPS | Unassigned | Fallback 10% ("No central ITP/KNR linked for this weld.") | 22 | 3 | 0 | 0 | 3 | 0 / 3 | 0 / 3 | 3 / 3 | WARN | 22 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| W01 | NOT COMPLIANT | 11111 | 222222 | 14.0 % | 1 | 1 | 0 | 0 | 1 | 0 / 1 | 0 / 1 | 1 / 1 | WARN | 1 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| W01 | NOT COMPLIANT | 11111 | Unassigned | Fallback 10% ("No central ITP/KNR linked for this weld.") | 1 | 1 | 0 | 0 | 1 | 0 / 1 | 0 / 1 | 1 / 1 | WARN | 1 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |

Tracer status hint for "Not needed": "No tracer action required for this group."

### Default capture with filter "All groups" (browser pass, 9 cards)

| # | Welder | Status | WPS | ITP/KNR | NDT % | Total welds | Required | Examined | Selected | Remaining | Tested / Selected / Remaining | Flag | Welds | Examined | Exam % | Rejected | Reject % | Tracers cell | Tracer status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ML396 | NOT COMPLIANT | No WPS | Unassigned | Fallback 10% | 22 | 3 | 0 | 0 | 3 | 0/3, 0/3, 3/3 | WARN | 22 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| 2 | ML396 | COMPLIANT | 22.028BR | Unassigned | Fallback 10% | 2 | 1 | 2 | 0 | 0 | 2/1, 0/1, 0/1 | BAD | 2 | 2 | 100.0 % | 1 | 50.0 % | 0, button "Missing 2" | Missing — "2 of 2 tracer(s) still required." |
| 3 | ML396 | COMPLIANT | 11111 | 111111 | 14.0 % | 7 | 1 | 3 | 3 | 0 | 3/1, 3/1, 0/1 | BAD | 7 | 3 | 42.9 % | 2 | 66.7 % | 0, button "Missing 4" | Missing — "4 of 4 tracer(s) still required." |
| 4 | ML396 | COMPLIANT | 11111 | 222222 | 14.0 % | 7 | 1 | 0 | 4 | 0 | 0/1, 4/1, 0/1 | WARN | 7 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| 5 | ML396 | COMPLIANT | 11111 | Unassigned | Fallback 10% | 15 | 2 | 4 | 5 | 0 | 4/2, 5/2, 0/2 | BAD | 15 | 4 | 26.7 % | 3 | 75.0 % | 0, button "Missing 6" | Missing — "6 of 6 tracer(s) still required." |
| 6 | ML670 | COMPLIANT | 11111 | 111111 | 14.0 % | 3 | 1 | 2 | 1 | 0 | 2/1, 1/1, 0/1 | BAD | 3 | 2 | 66.7 % | 1 | 50.0 % | 0, button "Missing 2" | Missing — "2 of 2 tracer(s) still required." |
| 7 | W01 | NOT COMPLIANT | 11111 | 222222 | 14.0 % | 1 | 1 | 0 | 0 | 1 | 0/1, 0/1, 1/1 | WARN | 1 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| 8 | W01 | NOT COMPLIANT | 11111 | Unassigned | Fallback 10% | 1 | 1 | 0 | 0 | 1 | 0/1, 0/1, 1/1 | WARN | 1 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |
| 9 | W04 | COMPLIANT | 11111 | Unassigned | Fallback 10% | 1 | 1 | 0 | 1 | 0 | 0/1, 1/1, 0/1 | WARN | 1 | 0 | 0.0 % | 0 | 0.0 % | 0 | Not needed |

Range text "1–9 of 9"; 3 cards NOT COMPLIANT, 6 COMPLIANT. Cards 2, 3, 5, 6 show a "Tracers" button (blue link text), with `data-welder-id` / `data-wps-id` / `data-itp-code`: card 2 = 28 / 6 / Unassigned, card 3 = 28 / 1 / 111111, card 5 = 28 / 1 / Unassigned, card 6 = 163 / 1 / 111111.

### Other values from the summary response (default capture)

`built_at` "2026-11-16T13:31:21+01:00", `generated_ms` 6, `total_examined` 9, `examined_percent` 11.69, `not_examined_percent` 88.31, `total_repairs` 7, `repairs_total_percent` 9.09, `repairs_examined_percent` 11.86, `repair_limit_percent` 5; compliance summary: total_welds 59, required_inspections 12, tested_welds 11, selected_for_testing 14, remaining_required 5, fallback_groups 5, total_groups 9, compliant_groups 6, not_compliant_groups 3; `inspection_compliance_page` {total 3, offset 0, limit 50, status "bad", q ""}; warnings all empty and `unmapped_isometrics` 0; `metrics` {weld_rows 77, ndt_processes 4, weld_types 5, filtered_rows 77}; `filters` echoes the query (`to` "16.11.2026", `to_sql` "2026-11-16", `viewweld` "welds", others empty/0).

The response also holds data the dashboard script in the capture does not draw (no chart is in the page): `weld_type_chart_rows` / `weld_type_legend_rows` (Branch welds- Field 2, Butt Weld - Field 11, Butt Weld - Shop 14, Shop weld 7, Victaulic Joint-Shop 1), `examined_chart_rows` (examined 11.69 / not_examined 88.31), `repairs_total_chart_rows` (repaired 9.09 / total 90.91), `repairs_examined_chart_rows` (repaired 11.86 / examined 88.14), `inspection_trend_rows` (Week 29: 1, Week 12: 2, Week 13: 1, Week 01: 2, Week 28: 3), `repair_hotspot_rows` (20240101: 4, "--": 2, PTC 01: 1).

### Tracer proposal sample (group ML396 / WPS 22.028BR / ITP Unassigned)
Meta "Welder: ML396 - <name> | WPS: 22.028BR | ITP/KNR: Unassigned"; tiles Rejected welds 1, Expected tracers 2, Existing tracers 0, Missing tracers 2; warning "No eligible tracer candidates found inside this welder / WPS / ITP-KNR group."; source "Rejected weld 003" with "ISO 0005 | 0 linked of 2 required." (project 20240101, type Shop, date 05.01.2025, status "Rejected weld").

## Not in the capture

- The page in "Welds length" view (View → "Welds length"): not opened; the unit suffix " mm" and the label "Total weld length" are only seen in the script.
- ITP-manager mode (button "Manage ITP/KNR", `itp_manager=1`): not opened (browser-pass notes).
- The dashboard in dark mode (`#modeToggle` or the header sun icon): not clicked; the header theme toggle stores a per-user setting.
- How the hidden inputs of the report dialogs (`project`, `welder`, `wps`, `from`, `ndt`, …) receive the dashboard filter values: no script doing this is in the capture; the fields are empty in the captured DOM except the defaults listed. The PDFs themselves (the "Go" results) were never requested.
- The IRN options (`ajax-weld-dashboard-irn.php` results) and whether the filter panel narrows other selects: not captured.
- The Tracers button flow with real candidates (candidate lists, locked tracers), and the save response: the sandbox group had no candidates; Save was never pressed.
- Filtering the compliance list to "Compliant" (`ok`) and searching by text: only the "Not compliant" (default) and "All groups" states were captured; "Previous" / "Next" with more than 50 groups: never enabled in the sandbox.
- The line `#weldDashboardMeta` text ("Dashboard: snapshot … | … ms | … welds in filter") is written by the script only when that element exists; it does not exist in the captured page.
- Hidden filter controls "Tracer" and "Chart type": present but hidden; what shows them is not in the capture.

Also present in the page, opened from elsewhere (top bar, sidebar or other pages): `#fillIRN`, `#deleteSelectedProjects`, `#editProjectsMass`, `#importCalculationsFromIso`, `#importCalculationsFromIsoProject`, `#removeLastCalculations`, `#pdfMainReportLanguageForProjects`, `#pdfMainReportLanguageForProjectsMultiple`, `#pdfMainReportLanguage`, `#pdfWelderReportLanguageTrackingAdvanced` (a "Welder tracking" dialog with action `/core/pdf/welderReportGroupAdvanced.php`, fields `lang`, hidden `single`=no and the usual hidden filter fields; no Reports-menu entry points to it), `#pdfCalculationStatuses`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`, `#deleteCheckedMaterialsModal`, `#setCheckedMaterialsTypeModal`, `#markPunchAsRemoved`, `#materialStatusByRevision`, `#punchlist`, `#punchlistEdit`, `#setStatus`, `#showIsometric`, `#showQuantityLog`, `#statusLog`.
