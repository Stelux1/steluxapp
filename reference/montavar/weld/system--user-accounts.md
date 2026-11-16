# Weld Pilot → System → User accounts

Source: `weld__system__user-accounts.txt`, `weld__system__user-accounts-inactive.txt`, `weld__system__user-accounts-deleted.txt`, `weld__system__user-accounts__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=users` (inactive view: `/weldpilot/index.php?page=users&inactive=ok`; deleted view: `/weldpilot/index.php?page=users&showdeleted=ok`).
State of the page for the observing account: normal.

Browser tab title: "User accounts - WeldPilot®". The side menu shows the "System" group open.

## Page

- Panel title: "User accounts". In the deleted view the panel title is "User accounts (Deleted)".
- Breadcrumb (top bar): "User accounts" (`/weldpilot/index.php?page=users`) → state label. The state label is "Active" (active view, link `?page=users`), "Inactive" (inactive view, link `?page=users`) or "Deleted" (deleted view, link `?page=users&showdeleted=ok`).
- Top bar also holds, in the active view: "[ Show inactive ]" → `?page=users&inactive=ok`. In the inactive view this link reads "[ Show active ]" → `?page=users`. The deleted view has no such link in the top bar.
- No tabs.
- Buttons in the top bar and again in the panel heading (same targets):
  - "Show deleted" → `?page=users&showdeleted=ok` (top bar: `btn-sm btn-default btn-block`). In the deleted view it is replaced by "Show active" → `?page=users`.
  - "Add user" (top bar, with a plus icon) → opens dialog `#addUser` (`data-toggle="modal"`). In the panel heading the same button is icon-only (plus), same target. Present in all three views.
- The three views (active, inactive, deleted) are separate URLs that render the same table layout.

## List

- Table id `datatableWarehouse`, client-side DataTables (`serverSide: false`, no `ajax` URL); the rows are written into the page.
- Columns in order (all visible, all sortable): Username, Name, Title, Email address, Company, Phone, MTOPilot, ESTPilot, CivilPilot, WeldPilot, TeamPilot, ToolPilot, Options. Note the application columns are in this order (WeldPilot comes after CivilPilot).
- Cell content:
  - Username: a small circle icon (`fa fa-circle`) followed by the username.
  - Title, Company, Phone: "-" when empty.
  - Each application column: a check icon plus a link "On" (tooltip "Enabled") when the user has that application enabled, or a cross icon plus a link "Off" (tooltip "Not enabled"). The links go to `#` and do nothing visible.
  - Options (active and inactive views): two full-width buttons, a yellow pencil (`.open-editUser`, `href="#editUser"`, `data-id` = user id, opens dialog `#editUser`) and a red trash icon (`.open-deleteUser`, `href="#deleteUser"`, `data-id` = user id, opens dialog `#deleteUser`).
  - Options (deleted view): a hidden input `deleteID` (value = user id) and one yellow submit button `name="restoreUser"` with an undo icon (`fa fa-undo`), tooltip/title "Bring back". There is no pencil and no trash in this view.
- Default sort: column index 11 (ToolPilot), ascending.
- Page length: select `datatableWarehouse_length`, options 5, 20, 50, 100, 500; default 20. Label text "Show … entries".
- Search: one global search box with placeholder "Search" and a clear (x) button. No per-column search inputs, no other filters.
- Export / print buttons above the table: "CSV", "Excel", and a printer icon (no text).
- No bulk actions, no Options menu, no row-selection checkboxes.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries"; empty text "No data available in table"; no-match text "No matching records found".
- Pagination: the active and deleted views show "Showing 1 to 20 of …" so they paginate at 20; the pager controls themselves are not part of the capture.

## Dialogs

### Add user (`#addUser`) — opened by "Add user"
Large modal (`bs-example-modal-lg`). One `<form method="post">`. A caption in the form states a password rule (see below). Fields in document order:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Username | `username` | text | yes | empty | — |
| 2 | Password | `password` | password | yes (and read-only attribute present in the capture) | empty | `minlength=8`, pattern: at least one lowercase letter, one uppercase letter, one digit, 8 or more characters. Title and help text: "At least 8 characters, with an uppercase letter, a lowercase letter and a number" |
| 3 | Name | `name` | text | no | empty | — |
| 4 | Title | `job_title` | text | no | empty | `maxlength=255` |
| 5 | Address | `address` | text | no | empty | — |
| 6 | Email address | `email` | text | no | empty | not an email-type input |
| 7 | Phone | `phone` | text | no | empty | — |
| 8 | Company | `company` | select (select2) | no | "---- Without company ----" (value 0) | 3 options: 0 → "---- Without company ----"; 7 → "MONTAVAR METALNA LOLA"; 8 → "Websonik Applicaties BV" |
| 9 | Deactivate user | `deactivated` | checkbox (id `checkboxDeactivated`) | no | unchecked | value `ok` |

Below the user fields: a pill-tab strip `user-app-tabs` with seven tabs, in this order, each linking to a tab pane: MTOPilot (`#tab18_4`, active by default), ESTPilot (`#tab18_5`), CivilPilot (`#tab18_6`), ManagementHub (`#tab18_7`), WeldPilot (`#tab18_1`), TeamPilot (`#tab18_3`), ToolPilot (`#tab18_2`). Each pane has an "Enabled" checkbox; the other rows of a pane are hidden until "Enabled" is checked.

Profile options used in every "Profile" select and every site-row select below (6 options, value → text): 5 → Full rights (default); 12 → QAQC 01; 15 → Workpreparator 01; 17 → WPM; 18 → a profile named after a person (call it "profile 18"; its text is a person's name, so not copied here); 19 → External.

Site rows used in the "Home location" tables: 3 project sites, in this order: Zandbak (id 1); 10420-2530 Ineos Project ONE (id 2); IPO - Carry Over (id 10).

Tab MTOPilot (`#tab18_4`):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 10 | Enabled | `mtopilot` | checkbox (`#checkboxMTOPilot`) | no | unchecked | value `ok`; shows rows 11–12 |
| 11 | Access | `mtopilotrole` (`#roleMTOPilot`) | select | no | "All project sites" (value 2) | 2 → All project sites; 3 → Specific project site(s) |
| 12 | Profile | `mtopilotprofile` | select | no | Full rights (5) | profile options; this row is in `#hideOnMTOPilot`, hidden when Access = Specific project site(s) |
| 13 | Home location / Profile (table, per site) | `sitesCHKMTO1`, `sitesCHKMTO2`, `sitesCHKMTO10` (checkbox, value `ok`, ids `checkboxMTO1`, `checkboxMTO2`, `checkboxMTO10`) and `typeMTO1`, `typeMTO2`, `typeMTO10` (select, profile options, default Full rights) | checkbox + select per row | no | unchecked; Full rights | table `#showOnMTOPilot`, shown only when Access = Specific project site(s). Column labels "Home location" and "Profile" |

Tab ESTPilot (`#tab18_5`): same layout. Fields: `estpilot` (Enabled, `#checkboxESTPilot`), `estpilotrole` (Access, `#roleESTPilot`, same 2 options, default All project sites), `estpilotprofile` (Profile, default Full rights, row `#hideOnESTPilot`), site table `#showOnESTPilot` with `sitesCHKEST1`, `sitesCHKEST2`, `sitesCHKEST10` and `typeEST1`, `typeEST2`, `typeEST10`.

Tab CivilPilot (`#tab18_6`): same layout. Fields: `civilpilot` (Enabled, `#checkboxCivilPilot`), `civilpilotrole` (Access, `#roleCivilPilot`), `civilpilotprofile` (Profile, row `#hideOnCivilPilot`), site table `#showOnCivilPilot` with `sitesCHKCIVIL1`, `sitesCHKCIVIL2`, `sitesCHKCIVIL10` and `typeCIVIL1`, `typeCIVIL2`, `typeCIVIL10`.

Tab ManagementHub (`#tab18_7`): fields `dashboardhub` (Enabled, `#checkboxDashboardHub`, value `ok`), `dashboardhubrole` (Access, `#roleDashboardHub`, options All project sites / Specific project site(s), default All project sites), `dashboardhubprofile` (Profile, profile options, default Full rights). Next to the Profile select is a button with a pencil icon, title "Profiles", linking to `?page=profiles` in a new window (`target="_blank"`). This tab has no site table and no row-hiding container; the capture shows no script that reacts to its Access select.

Tab WeldPilot (`#tab18_1`): fields `weldpilot` (Enabled, `#checkboxWeldPilot`), `weldpilotrole` (Access, `#role`, same 2 options, default All project sites), `weldpilotprofile` (Profile, default Full rights, row `#hideOnWarehouse`), site table `#showOnWarehouse` with `sitesCHK1`, `sitesCHK2`, `sitesCHK10` (ids `checkbox1`, `checkbox2`, `checkbox10`) and `type1`, `type2`, `type10`.

Tab TeamPilot (`#tab18_3`): in the Add dialog the labels are the same as other tabs. Fields: `teampilot` (Enabled, `#checkboxTeamPilot`), `teampilotrole` (labelled "Access" in the Add dialog, `#roleTeamPilot`, options 2 → All project sites, 3 → Specific project site(s), default All project sites), `teampilotprofile` (Profile, profile options, default Full rights, row `#hideOnTeamPilot`), site table `#showOnTeamPilot` with `sitesCHKTeam1`, `sitesCHKTeam2`, `sitesCHKTeam10` and `typeTeam1`, `typeTeam2`, `typeTeam10`.

Tab ToolPilot (`#tab18_2`): fields `toolpilot` (Enabled, `#checkboxToolPilot`), `toolpilotrole` (labelled "Access" in the Add dialog, `#roleToolPilot`, options All project sites / Specific project site(s), default All project sites), `toolpilotprofile` (Profile, only 2 options: 1 → Company manager (default); 2 → Warehouse manager; row `#hideOnToolPilot`). Hidden block `#showOnToolPilot` has the label "Warehouse" and an empty table (no warehouse rows in the capture).

Buttons: "Add" (primary, `type=submit`, `name="addUser"`, class `btn-hideInsert`); "Cancel" (closes). Close icon in the header.

### Edit user (`#editUser`) — opened by the pencil in Options
Large modal. The page contains an empty shell: header "Edit user", empty body, footer with a hidden input `secureCode` (id `bookIdEditUserSecure`, empty in the page), "Update" (warning colour, `type=submit`, `name="editUser"`, class `btn-hideEdit`) and "Cancel". The body is filled when the pencil is clicked: `GET /core/ajax/editUser.php?id=<user id>` (the capture of the click shows the request as `/core/ajax/editUser.php?id=248&action=showroom`), and the response HTML is put into `#contentEditUser`. The body loaded for one user (browser capture `weld__system__user-accounts__edit`) has the same fields as "Add user", with these differences:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Username | `username` | text | yes | the user's username | read-only |
| 2 | Password | `password` | password | no | empty | placeholder "Leave blank to keep current password"; `autocomplete="new-password"`; same pattern and `minlength=8` as Add; not required |
| 3–8 | Name / Title / Address / Email address / Phone / Company | `name`, `job_title`, `address`, `email`, `phone`, `company` | as in Add | no | the stored values | `name` input has id `exampleInputEmail1`; Company select has the same 3 options as Add |
| 9 | Deactivate user | `deactivated` (id `checkboxDeactivated<id>`) | checkbox | no | stored state | value `ok` |
| 10 | Enabled (MTOPilot) | `mtopilot` | checkbox | no | stored | value `ok` |
| 11 | Access (MTOPilot) | `mtopilotrole` | select | no | stored | 2 → All project sites; 3 → Specific project site(s) |
| 12 | Profile (MTOPilot) | `mtopilotprofile` | select | no | stored | profile options (6); in `#hideOnMTOPilot<id>` |
| 13 | Storehouse manager | `storehouse_manager` | checkbox (`#chkStorehouseMgr<id>`) | no | stored | value `1`; only in the MTOPilot tab; help text beside it, in Dutch: "Ontvangt meldingen bij transfer orders" (receives notices on transfer orders) |
| 14 | Home location / Profile (MTOPilot) | `sitesCHKMTO1`, `sitesCHKMTO2`, `sitesCHKMTO10` + `typeMTO1`, `typeMTO2`, `typeMTO10` | checkbox + select per site | no | stored | table `#showOnMTOPilot<id>`; rows ids `checkboxMTOedit1/2/10` |
| 15 | Enabled / Access / Profile / site table (ESTPilot) | `estpilot`, `estpilotrole`, `estpilotprofile`, `sitesCHKEST1/2/10`, `typeEST1/2/10` | as MTOPilot | no | stored | no Storehouse manager checkbox; site checkbox ids `checkboxESTedit1/2/10` |
| 16 | Enabled / Access / Profile / site table (CivilPilot) | `civilpilot`, `civilpilotrole`, `civilpilotprofile`, `sitesCHKCIVIL1/2/10`, `typeCIVIL1/2/10` | as MTOPilot | no | stored | site checkbox ids `checkboxCivil1/2/10` |
| 17 | Enabled / Access / Profile (ManagementHub) | `dashboardhub`, `dashboardhubrole`, `dashboardhubprofile` | as in Add | no | stored | pencil button to `?page=profiles` as in Add; no site table |
| 18 | Enabled / Access / Profile / site table (WeldPilot) | `weldpilot`, `weldpilotrole`, `weldpilotprofile`, `sitesCHK1/2/10`, `type1/2/10` | as MTOPilot | no | stored | site checkbox ids `checkboxWP1/2/10`; access select id `role<id>` |
| 19 | Enabled / Role / Profile / site table (TeamPilot) | `teampilot`, `teampilotrole`, `teampilotprofile`, `sitesCHKTeam1/2/10`, `typeTeam1/2/10` | as MTOPilot, but the select label is "Role" and its options are 2 → Company manager; 3 → Project site manager | no | stored | site checkbox ids `checkboxTeamTP1/2/10`; the Profile select is still a 6-option profile select |
| 20 | Enabled / Role / Profile / Warehouse table (ToolPilot) | `toolpilot`, `toolpilotrole`, `toolpilotprofile` | as MTOPilot, but label "Role" with options 2 → Company manager; 3 → Warehouse manager | no | stored | the Profile select here has the 6 profile options (not the 2 of the Add dialog); hidden block `#showOnToolPilot<id>` with label "Warehouse" and a table that is empty in the capture |
| 21 | (hidden) | `editID` | hidden | — | the user id | — |

In the capture the pill-tab strip is `nav-pillsx<id>`, tab ids are `tab18_4x<id>`, `tab18_5x<id>`, `tab18_6x<id>`, `tab18_7x<id>`, `tab18_1x<id>`, `tab18_3x<id>`, `tab18_2x<id>` (same order of tabs as Add). The footer's hidden `secureCode` has a 32-character hex value generated by the server (not the same as the page's empty one).

Buttons: "Update" (`editUser`, submit), "Cancel".

### Delete user (`#deleteUser`) — opened by the trash icon in Options
Small modal, title "Delete user". Body text: "Are you sure?". Hidden inputs: `deleteID` (id `bookIdDeleteUser`, filled with the row's `data-id`) and `secureCode` (id `bookIdDeleteUserSecure`, filled by script, see below). Buttons: "Delete" (danger, trash icon, `type=submit`, `name="deleteUser"`, class `btn-hideDelete`) and "Cancel". The capture does not say what the delete does to the record; the deleted view (with its "Bring back" button) is a separate listing reached by URL.

### Restore (no dialog) — "Bring back" button in the deleted view
Not a dialog: the row's own submit button `restoreUser` posts the hidden `deleteID` of that row. No confirmation text appears in the capture.

## Rules found in the page's JavaScript

- `$(".nav-pills li:first").addClass("active"); $(".tab-content div:first").addClass("active");` (inline script on the page): the first tab of the Add dialog (MTOPilot) is active on load.
- On load, the Add dialog hides every site table (`#showOnWarehouse`, `#showOnToolPilot`, `#showOnTeamPilot`, `#showOnMTOPilot`, `#showOnESTPilot`, `#showOnCivilPilot`) and every row of the classes `.showOn<App>Enabled` (Access / Role and Profile rows for WeldPilot, ToolPilot, TeamPilot, MTOPilot, ESTPilot, CivilPilot and `.showOnDashboardHubEnabled`).
- Enabled checkbox change (`#checkboxWeldPilot`, `#checkboxToolPilot`, `#checkboxTeamPilot`, `#checkboxMTOPilot`, `#checkboxESTPilot`, `#checkboxCivilPilot`, `#checkboxDashboardHub`): when checked, shows that application's `.showOn<App>Enabled` rows; when unchecked, hides them and hides the site table of that application. Quirk in the code: unchecking WeldPilot or ToolPilot hides `#showOnWarehouse` (the WeldPilot site table), and unchecking TeamPilot / MTOPilot / ESTPilot / CivilPilot hides their own site table.
- Access / Role select change (`#role` for WeldPilot, `#roleToolPilot`, `#roleTeamPilot`, `#roleMTOPilot`, `#roleESTPilot`, `#roleCivilPilot`): if the value is "3" (Specific project site(s), or Warehouse manager / Project site manager in the Edit dialog), show the application's site table (`#showOn…`) and hide the single Profile row (`#hideOn…`); any other value does the reverse. There is no such handler for `#roleDashboardHub`.
- Edit dialog script (inside the response of `editUser.php`), same rules with `<id>` appended to every selector (`#role<id>`, `#roleToolPilot<id>`, `#roleTeamPilot<id>`, `#roleMTO<id>`, `#roleEST<id>`, `#roleCivil<id>`, `#checkbox<App><id>`, `#showOn…<id>`, `#hideOn…<id>`, `.showOn<App>Enabled<id>`); it also marks the first pill and the first tab pane active (`.nav-pillsx<id> li:first`, `.tab-contentx<id> div:first`), and on load hides all `.showOn…Enabled<id>` rows and site tables. The capture shows no code that re-shows them for an application that is already enabled; the browser-pass notes say the dialog showed the fields of the enabled applications, so the capture's initial state and this script disagree and the capture does not settle which one the user sees.
- Edit click handler (`jQuery(document).on("click", ".open-editUser", …)`): reads the row's `data-id` and calls `GET /core/ajax/editUser.php?id=<id>` (the capture of the click also shows `&action=showroom`); the HTML response goes into `#contentEditUser`.
- Delete click handler (`.open-deleteUser`): copies `data-id` into `#bookIdDeleteUser` and sets `#bookIdDeleteUserSecure` to a string built from a fixed 10-character literal in the page script, then the user id, then the text "usr".
- Password field rule (HTML attributes, not script): at least 8 characters with a lowercase letter, an uppercase letter and a digit.
- Other requests on the page come from page-wide scripts shared with every page and are not part of this screen: `/core/ajax/ajax-notifications.php?action=count_unread` (made on load), `/core/ajax/searchProject.php`, `/core/ajax/getListOfMaterials.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`.
- Form posts: the Add form submits with button name `addUser`; the Edit form with `editUser` (and `editID`, `secureCode`); the Delete form with `deleteUser` (and `deleteID`, `secureCode`); the deleted-view button posts `restoreUser` with `deleteID`. The endpoints for these posts are not shown (forms have `method="post"` and no action, so they post to the current URL).

## Sample data

Counts only; no rows are given.

- Active view: 116 accounts in total ("Showing 1 to 20 of 116 entries"). The capture holds only the first 20 rows; the other 96 are not in it. Among those first 20 rows: MTOPilot On = 20, ESTPilot On = 4, CivilPilot On = 2, WeldPilot On = 20, TeamPilot On = 3, ToolPilot On = 2. Company on these 20 rows: MONTAVAR METALNA LOLA = 11, Websonik Applicaties BV = 1, empty ("-") = 8. Title is "-" on every row.
- Inactive view: 1 account ("Showing 1 to 1 of 1 entries"). It has all applications On except CivilPilot (MTOPilot, ESTPilot, WeldPilot, TeamPilot, ToolPilot On = 1 each, CivilPilot Off); company MONTAVAR METALNA LOLA.
- Deleted view: 21 accounts ("Showing 1 to 20 of 21 entries"; the capture holds all 21 in memory). Application On counts across the 21: MTOPilot 17, ESTPilot 2, CivilPilot 0, WeldPilot 20, TeamPilot 0, ToolPilot 0. Company: MONTAVAR METALNA LOLA 19, empty ("-") 2.
- Company select: 3 options (without company, MONTAVAR METALNA LOLA, Websonik Applicaties BV). Profile select: 6 options. Project sites offered in the site tables: 3.
- User ids seen are in the range 69–254; the Options buttons carry the id in `data-id`.

## Not in the capture

- Active view rows 21–116 (next pages of the table, pager controls "Previous"/"Next").
- The Edit dialog body for any user other than the one captured (user id 248 only: MTOPilot and WeldPilot Enabled, Access "Specific project site(s)", site rows ticked for 10420-2530 Ineos Project ONE and IPO - Carry Over, Zandbak unticked, Full rights everywhere).
- The ToolPilot "Warehouse" table (empty in both the Add and Edit dialogs; no warehouse rows or fields shown) and what appears when ToolPilot Role is "Warehouse manager".
- The server's validation messages, the success or error message after Add / Update / Delete / Bring back, and where the posts go.
- Whether Deactivate user is what moves a user to the inactive view (the views are reached by URL; the capture does not state the rule).
- The rights behind each profile (opened from `?page=profiles`, a different page).
- What the "Storehouse manager" checkbox does beyond its help text.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin` (System settings), `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
