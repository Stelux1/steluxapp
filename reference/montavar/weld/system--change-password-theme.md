# Weld Pilot → System → Change password, Change theme (and the top bar / side menu)

Source: `weld__start__dashboard.txt`, `weld__start__dashboard__change-password.txt`, `weld__start__dashboard__change-theme.txt`, `weld__start__dashboard__user-menu.txt`, `weld__start__dashboard__bell.txt`, `weld__start__dashboard__app-switcher.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/` (the dashboard; both menu items are dialogs that open on top of whichever page is showing, the capture was taken on the dashboard).
State of the page for the observing account: normal. Nothing was typed, clicked-to-submit or saved.

## Page
Both menu items live in the side menu group **System** and are not pages: each is a link with `data-toggle="modal"` that opens a dialog already present in the page.

| Side menu item | Link | Opens |
|---|---|---|
| Change password | `href="#passwordChange"` (icon `glyphicons glyphicons-lock`) | dialog `#passwordChange` |
| Change theme | `href="#themeChange"` (icon `glyphicons glyphicons-magic`) | dialog `#themeChange` |

### Top bar (header), left to right
The capture lists only the header lines that no earlier capture contained (84 of 91 lines), so purely structural wrapper lines may be missing; every control below is shown.

1. Side-menu toggle: a `glyphicons-show_lines` icon (`#toggle_sidemenu_l`) and a hidden list item (`UL .nav.navbar-nav.pull-right.hidden`) holding an empty link `.sidebar-menu-toggle` (`href="#"`).
2. App switcher: empty link `.topbar-menu-toggle` (`href="#"`, icon `fa fa-th-large`).
3. Brand link "WeldPilot®" (`.navbar-brandS`) → `/weldpilot/`.
4. Text item (hidden on extra-small screens): "Zandbak" (the current project site).
5. Language dropdown (`.hide-on-small`): empty-text toggle link (`data-toggle="dropdown"`), menu with links (class `fw600`): "Nederlands" → `/weldpilot/index.php?lang=nl&page=&id=&project=&projectSite=`; "English" → `…?lang=en&page=&id=&project=&projectSite=`; "Deutsch" → `…?lang=de&…`; "Français" → `…?lang=fr&…`. From the browser-pass notes: shown as a language flag.
6. Expire warnings dropdown (`#expireWarnDropdown`): toggle link with warning-triangle icon (`fa fa-warning`) and text "37"; menu header "Expire warnings 37"; list `#expireWarnList` of 37 links, each `href="/weldpilot/index.php?page=personnel&type=1&view=welders"` with a red-cross icon and class `expire-warn-item--expired`. Item text pattern: `<welder code> <qualification name> · <dd.mm.yyyy> Expired`. All 37 read "Expired". Examples: "W01 Custom - 141|FM1-FM2|ISO9606-1/NEN3650 · 04.04.2024 Expired", "W02 Custom - GTAW|FM1-FM2|ISO9606-1 · 03.05.2024 Expired", "#4 Custom - GTAW|FM4|ASME · 15.06.2024 Expired", "W04 Custom - 121|FM1-FM2|ISO14732 · 18.12.2024 Expired", "W01 Summary list · 07.01.2026 Expired", "W01 Custom - 141|FM1-FM2|ISO9606-1/NEN3650 · 24.04.2026 Expired" (the last, newest). The menu is a persistent dropdown (`dropdown-persist`), a plain Bootstrap dropdown from the browser-pass notes (no request).
7. Notifications bell (`#notifDropdown`): toggle link with bell icon (`fa fa-bell`) and badge text "0"; menu header "Notifications" with link "Mark all read" (`#markAllNotifRead`, `href="#"`, icon `fa fa-check-double`); body text "No notifications" (with a bell-slash icon, from the browser-pass notes). Opened capture (`…__bell`): the list request returned `{"success":true,"notifications":[]}`.
8. Theme toggle, desktop (`.wsapps-header-theme-li.hide-on-small`): link `#wsappsAppThemeToggle` (`.wsapps-header-theme-toggle`, `href="#"`), `title="Dark theme"`, `aria-label="Switch to dark theme"`, `data-wsapps-ui-theme="light"`, sun icon (`fa fa-sun-o`, classes `wsapps-header-theme-icon…`; the capture cuts the class list).
9. Theme toggle, small screens (`.show-header-on-small.wsapps-header-theme-li--mobile`): same link without id, class `…--mobile`, same title/aria-label/data attribute.
10. User menu: toggle link with the signed-in person's name (person A; class `fw600 p15`), menu (`.header-user-menu`, persistent dropdown) containing, in order:
    - a form `.header-site-form` (`action="/weldpilot/index.php"`, `method="get"`) with a select `#headerSiteSelector` (name `redirect`, select2, `onchange="this.form.submit();"`), 3 options, current "Zandbak": `[Change project site] 1|Zandbak` (selected), `[Change project site] 2|10420-2530 Ineos Project ONE`, `[Change project site] 10|IPO - Carry Over` (the option text in the capture carries the prefix "[Change project site]" shown here as written);
    - four language links "Nederlands", "English", "Deutsch", "Français" (same hrefs as item 5; only shown on small screens, class `show-header-on-small`);
    - "User Manuals" → `/weldpilot/index.php?page=user-manuals` (icon `fa fa-book`);
    - "Logout" → `/weldpilot/index.php?logout=ok` (icon `fa fa-power-off`).

App switcher panel (`#topbar-dropmenu`, opened by the grid icon; five tiles, class `metro-tile`, in order):

| Tile | Link | Icon |
|---|---|---|
| MTOPilot® | `/mtopilot/` | `fa fa-cube` |
| ESTPilot® | `/estpilot/` | `fa fa-calculator` |
| WeldPilot® | `/weldpilot/` | `fa fa-fire` |
| TeamPilot® | `/teampilot/` | `fa fa-users` |
| ToolPilot® | `/toolpilot/` | `fa fa-wrench` |

From the browser-pass notes: the tiles slide down with coloured top bars (MTOPilot orange, ESTPilot yellow, WeldPilot green, TeamPilot purple, ToolPilot blue), the page is dimmed, and a second click on the icon closes it; no request.

### Side menu (`ASIDE #sidebar_left`), every group and item in order
Groups are accordion headers (`.accordion-toggle`, `href="#"`); the group "Start" is open (`menu-open`) and its item "Dashboard" is the active one. The capture lists 71 of 131 lines of this block (the rest were already in earlier captures); all groups and items below are shown in order. Items marked HID are hidden in the page.

| Group (icon) | Item | Link |
|---|---|---|
| General data (`glyphicon-home`) | Project sites | `/weldpilot/index.php?page=project-sites` |
| | Companies | `/weldpilot/companies/` |
| | Attachment names | `/weldpilot/iso-docs/` |
| Start (`glyphicon-flash`) | Dashboard (active) | `/weldpilot/` |
| | Daily reporting | `/weldpilot/daily-reporting/` |
| Handheld (`glyphicon-phone`; list item class `wsapps-handheld-menu-group`) | Scan weld (title "Weld card, weld label or ISO book cover") | `javascript:void(0)`, class `wp-handheld-open-weld-scan`, `role="button"`; opens `#wpWeldScanModal` ("Scan weld") |
| | Scan flange QR label | `javascript:void(0)`, class `wp-handheld-open-flange-scan`, `role="button"`; opens `#wpFlangeScanModal` |
| | Add punch | `#punchlist`, `data-toggle="modal"`, `data-id="0"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"` |
| Welder data (`glyphicon-user`) | Welders | `/weldpilot/index.php?page=personnel&type=1&view=welders` |
| | Roles | `/weldpilot/roles/` |
| | Certificates | `/weldpilot/certificates/` |
| | Customs | `/weldpilot/customs/` |
| Weld data (`glyphicons-vector_path_all`) | PQR | `/weldpilot/pqr/` |
| | WPS Designer | `/weldpilot/index.php?page=wps-designer` |
| | WPS methods | `/weldpilot/wps/` |
| | Weld process (HID) | `/weldpilot/welding-process/` |
| | Weld type | `/weldpilot/weld-type/` |
| | Coating | `/weldpilot/coating/` |
| | Spools | `/weldpilot/material-spools/` |
| Report generator (`glyphicon-th-list`) | Form designer | `/weldpilot/index.php?page=drag-drop-forms-vue3` |
| | My templates | `/weldpilot/index.php?page=form-templates` |
| Material data (`glyphicons-cargo`) | Weld diameters | `/weldpilot/weld-diameters/` |
| | Material part | `/weldpilot/material-part/` |
| | Type of material | `/weldpilot/type-material/` |
| | Material supplier | `/weldpilot/material-supplier/` |
| | Welding wire | `/weldpilot/index.php?page=welding-wires` |
| | Certifications | `/weldpilot/index.php?page=certifications` |
| NDT data (`glyphicons-list`) | NDT process groups | `/weldpilot/ndt-process-groups/` |
| | NDT process | `/weldpilot/ndt-process/` |
| | Defect codes | `/weldpilot/ndt-defects/` |
| | NDT locations | `/weldpilot/ndt-location/` |
| | PWHT process | `/weldpilot/pwht-process/` |
| | PWHT locations | `/weldpilot/pwht-location/` |
| Welding data (`glyphicons-stats`) | Projects | `/weldpilot/index.php?page=project-sites&id=1&view=projects` |
| | Isometrics list | `/weldpilot/index.php?page=isometrics-list` |
| | ITPs | `/weldpilot/index.php?page=weldpilot-itps` |
| | Iso overview | `#searchProject`, `data-toggle="modal"` (class `open-searchProject`) |
| | NDT/PWHT Manager | `/weldpilot/index.php?page=ndt-requests-pre` |
| | NDT Batch Import | `/weldpilot/index.php?page=ndt-batch-import` |
| | ISO PDF Import (HID) | `/weldpilot/index.php?page=iso-pdf-import` |
| | QA/QC engineers | `/weldpilot/test-engineers/` |
| | Export weld data | `/weldpilot/export-welds/` |
| Releases (`glyphicons-file`) | Prefab release | `/weldpilot/index.php?page=isometrics-finished&show=hideReleased` |
| | Field release | `/weldpilot/index.php?page=isometrics-finished-field&show=hideReleased` |
| | Assign Iso to FWP | `/weldpilot/index.php?page=assign-fwp&tab=assign-iso` |
| | Hydrotest release | `/weldpilot/index.php?page=hydrotest-request&tab=test-systems` |
| | Request archive (HID) | `/weldpilot/index.php?page=requests-archive&from=17.10.2026&to=30.11.2026` |
| | Punch lists | `/weldpilot/index.php?page=punchlists` |
| | Flange Management | `/weldpilot/index.php?page=flanges` |
| System (`glyphicons-settings`) | Change password | `#passwordChange`, `data-toggle="modal"` |
| | Change theme | `#themeChange`, `data-toggle="modal"` |
| | User accounts | `/weldpilot/index.php?page=users` |
| | Profiles | `/weldpilot/profiles/` |
| | Signatures | `/weldpilot/index.php?page=signatures` |

## List
None. Neither menu item has a table, filter or export.

## Dialogs

### Change password (`#passwordChange`) — opened by side menu System → Change password
Bootstrap dialog (`role="dialog"`); header: close button (×, `data-dismiss="modal"`) and title "Change password". One form, `method="post"`, `enctype="multipart/form-data"`, no `action` (posts to the current page). All three labels are written with `for="input00"` (not tied to a field).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Current password | `currentPassword` | password | yes | empty | — |
| 2 | New password | `newPassword` (id `wsapps_newPassword`) | password | yes | empty | `minlength="8"`; drives the strength display and the Update button (see rules) |
| 3 | Repeat new password | `newPasswordRepeat` | password | yes | empty | `minlength="8"` |

Between fields 2 and 3 the form shows a block "Password strength" (`.control-group`) that holds the strength bar and message (ids `wsapps_pwStrengthBar`, `wsapps_pwStrengthText`; their markup is not in the capture beyond the text "Password strength"). No hidden inputs.

Buttons (footer): "Update" (`#wsapps_pwSubmitBtn`, `.btn.btn-warning`, `name="passwordChange"`, `type="submit"`, DISABLED on load); "Cancel" (`.btn.default`, `data-dismiss="modal"`).

Rule text in the dialog: the strength message says a password is too weak unless it has at least 8 characters with upper-case, lower-case, numbers and special characters.

### Change theme (`#themeChange`) — opened by side menu System → Change theme
Bootstrap dialog (`role="dialog"`); header: close button and title "Change theme". One form, `method="post"`, no `action`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Choose theme | `design` | select (`.form-control`) | no (flag not shown) | "System default" (value `0`) | 3 options: `0` → System default (selected); `2` → Pro Suite; `3` → Pro Suite Horizontal |

No hidden inputs. Buttons (footer): "Update" (`.btn.btn-warning`, `name="themeChange"`, `type="submit"`); "Cancel" (`.btn.default`, `data-dismiss="modal"`).

Related, separate control (not in this dialog): the sun-icon header toggle (top bar item 8/9) switches light/dark directly, see rules.

## Rules found in the page's JavaScript
- **Password strength (inline script bound to `#wsapps_newPassword`, shipped with the dialog).** On every input in the new-password field a score is computed: empty → 0; fewer than 4 characters → 1; otherwise start at 1 and add 1 each for length ≥ 6, ≥ 8, ≥ 10, ≥ 13, for containing both a lower-case and an upper-case letter, for containing a digit, and for containing a special character from the set `! @ # $ % ^ & * ? _ ~ - £ ( )`; the score is capped at 8. The bar width is score/8 as a percentage (rounded). Messages by score 0–8: scores 0–4 all read "Password too weak. Use at least 8 characters with uppercase, lowercase, numbers and special characters."; 5 "OK"; 6 "Good"; 7 "Strong"; 8 "Very strong". Colours by score 0–8: `#dc3545` (0–2), `#e67e22` (3–4), `#f1c40f` (5), `#27ae60` (6–7), `#2ecc71` (8); the message text takes the same colour. The Update button is disabled while the score is below 5 and is disabled on load.
- No script in the capture compares "New password" with "Repeat new password" or checks the current password in the browser; no request is made by the dialog script. Whatever the server does on submit (`name="passwordChange"`) is not in the capture.
- **Change theme dialog:** no script found for it in the capture; the form is a plain post (`name="themeChange"`, field `design`).
- **Header theme toggle (`.wsapps-header-theme-toggle`, document-level click handler).** Reads the current theme from the link's `data-wsapps-ui-theme` (default "light"), flips light↔dark, sets class `wsapps-ui-theme-light`/`wsapps-ui-theme-dark` and attribute `data-wsapps-ui-theme` on the root element, switches the dashboard container (`#content.weld-dashboard`, also mto/est variants) between `dark-mode` and `light-mode`, swaps the sun/moon icons, updates `aria-label` ("Switch to light theme" / "Switch to dark theme") and `title` ("Light theme" / "Dark theme"), and fires the event `wsapps-ui-theme-change`. It stores the choice in the cookie `wsapps_ui_theme` (path `/`, one year, SameSite=Lax), in `localStorage` key `wsapps_ui_theme`, and calls `GET index.php?ui_theme=<light|dark>&ajax=1` (same origin, errors ignored). The dashboard's own moon button (`#modeToggle`, `onclick="toggleDarkMode()"`) just clicks `#wsappsAppThemeToggle`. On load the root element gets class `wsapps-ui-theme-light` and `data-wsapps-ui-theme="light"` for this account.
- **Project-site select in the user menu:** `#headerSiteSelector` is turned into a select2 (search always shown, dropdown attached inside the user menu) when the page loads and again each time the dropdown opens; changing it submits its form (GET `redirect=<site id>` to `/weldpilot/index.php`).
- **Notifications (`core/ajax/ajax-notifications.php`).** `GET ?action=count_unread` → `{"count":n}`, called on load and every 30 seconds; the badge `#notifBadge` shows the count when above 0 (hidden at 0) and the bell shakes when the count rises. `GET ?action=list&limit=15` fills `#notifList`; empty list → "No notifications". Clicking an item: `POST action=mark_read&id=<id>`, removes the item, follows its link if it has one (PDF jobs, storehouse orders, civil punch, release books) and refreshes the badge. "Mark all read" (`#markAllNotifRead`): `POST action=mark_all_read`, removes all items, refreshes the badge.
- Handheld items: clicks on `.wp-handheld-open-weld-scan` / `.wp-handheld-open-flange-scan` open the scan dialogs `#wpWeldScanModal` / `#wpFlangeScanModal`.

## Sample data
- Signed-in user in the top bar: person A. Project site: "Zandbak" (Site ID #1). Date shown on the page: Monday 16 November 2026.
- Bell badge: 0; notifications list: empty. Expire warnings: 37 entries, all "Expired" (listed in Page → Top bar item 6 by pattern; oldest 04.04.2024, newest 24.04.2026; welder codes seen: W01, W02, W02/W03, W04, #4).
- Change theme current value: System default.
- Project sites available in the user-menu select: Zandbak, 10420-2530 Ineos Project ONE, IPO - Carry Over.

## Not in the capture
- What the server does after "Update" in either dialog (messages, validation of the current password or of the repeat field, how the chosen `design` value changes the layout): nothing was submitted.
- What "Pro Suite" and "Pro Suite Horizontal" look like.
- The markup of the strength bar (`wsapps_pwStrengthBar`, `wsapps_pwStrengthText`) beyond the label "Password strength"; its look comes only from the script's colours.
- The `index.php?ui_theme=…&ajax=1` response.
- Notification items with content (the sandbox list is empty), and where each notification type leads beyond what the script names.
- The side menu block was captured with a line diff (71 of 131 lines); the 60 omitted lines were already in earlier captures and are not shown here.

Also present in the page, opened from elsewhere (not described): `fillIRN`, `deleteSelectedProjects`, `editProjectsMass`, `pdfMainReportLanguageForProjects`, `pdfMainReportLanguageForProjectsMultiple`, `pdfMainReportLanguage`, `editCompanyData`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject` (Iso overview, only named as a menu link above), `pdfWelderReportLanguage`, `pdfWelderReportLanguageFull`, `pdfWelderReportLanguageTracking`, `pdfWelderNDTtracking`, `pdfWelderTracer`, `pdfWelderReportLanguageTrackingAdvanced`, `pdfWelderReportLanguageTrackingAdvancedWDI`, `pdfStatsReportLanguage`, `pdfOpenWeldsLanguage`, `pdfRevsLanguage`, `pdfTracerReportLanguage`, `importCalculationsFromIso`, `importCalculationsFromIsoProject`, `removeLastCalculations`, `markPunchAsRemoved`, `setCheckedMaterialsTypeModal`, `deleteCheckedMaterialsModal`, `punchlistEdit`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `addPqr`, `addFlange`, `deleteFlange`, `importFlanges`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `createTransferOrder`, `wpWeldScanModal`, `wpFlangeScanModal`, `weldTracerProposalModal`.
