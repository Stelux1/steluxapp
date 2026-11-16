# MTO Pilot → System → User accounts, Profiles

Source: `mto__system__user-accounts.txt`, `mto__system__profiles.txt` — captured 2026-11-16 on the sandbox project site, read-only. URLs: `/mtopilot/users/` (title "User accounts - MTOPilot®") and `/mtopilot/profiles/` (title "Profiles - MTOPilot®"). No capture whose name starts with `mto__system__user-accounts__` or `mto__system__profiles__` exists (no dialog was opened by a click on the MTO pages).
State of the page for the observing account: normal (both pages show their full content).

Both pages are the same screens as in the Weld Pilot (`weld__system__user-accounts.txt`, `weld__system__profiles.txt`). The people, the profiles, the columns, the dialogs and the page scripts are identical; the list of differences is at the end of each part ("Differences from the Weld Pilot"). The user list and the profile list are shared by all applications (the Weld Pilot list shows the same 116 accounts and the same 6 profiles).

---

# Part 1 — User accounts

## Page
- Title: "User accounts" (panel heading; browser title "User accounts - MTOPilot®"). Heading panel is dark, no icon before the title.
- Breadcrumb / top bar: "User accounts" → `/mtopilot/index.php?page=users`. A status switch in the top bar: "Active" → `/mtopilot/index.php?page=users`, "[ Show inactive ]" → `/mtopilot/index.php?page=users&inactive=ok`. Language links: Nederlands, English, Deutsch, Français (`?lang=nl|en|de|fr&page=users&id=&project=&projectSite=`).
- No tabs.
- Buttons in the panel heading:
  - "Show deleted" → link `/mtopilot/index.php?page=users&showdeleted=ok` (also repeated in the top bar as a block button).
  - Plus icon (`glyphicon glyphicon-plus`, no text) → opens dialog `#addUser` (`href="#addUser" data-toggle="modal"`, no click handler, no request). The Weld capture also has an "Add user" block button in the top bar with the same target; in the MTO capture that line is not written out (the capture only lists top-bar lines that earlier captures did not contain).

## List
- Table `#datatableWarehouse`, client-side (`serverSide: false`, `ajax: null`): all rows are in the page; 116 accounts in total, 20 shown per page.
- Columns in order (all visible, all sortable): Username, Name, Title, Email address, Company, Phone, MTOPilot, ESTPilot, CivilPilot, WeldPilot, TeamPilot, ToolPilot, Options. (There is no ManagementHub column.)
  - Username cell: a small filled-circle icon (`fa fa-circle`) before the username.
  - Title and Company/Phone show "-" when empty.
  - The six application columns show a check icon plus a link "On" (tooltip "Enabled") or a cross icon plus a link "Off" (tooltip "Not enabled"); the link is `href="#"`, no other action in the capture.
  - Options: two block buttons — pencil (`.open-editUser`, `href="#editUser"`, `data-id` = user id, `data-toggle="modal"`) opens "Edit user"; trash (`.open-deleteUser`, `href="#deleteUser"`, `data-id`) opens "Delete user".
- Default sort: `order: [[11, "asc"]]` (the ToolPilot column, ascending).
- Page length: select named `datatableWarehouse_length`, options 5, 20, 50, 100, 500; default 20. Label "Show … entries".
- Search: one global search input (placeholder "Search", magnifier icon, a clear button with a cross). No per-column search inputs, no other filters except the "Active / [ Show inactive ] / Show deleted" links.
- Export / print buttons above the table: "CSV", "Excel", and a printer icon (no text).
- No bulk-action (Options) menu, no row checkboxes.
- Texts: info "Showing 1 to 20 of 116 entries" (template "Showing _START_ to _END_ of _TOTAL_ entries"); empty "No data available in table"; no match "No matching records found".

## Dialogs

### Add user (`#addUser`) — opened by the plus button in the panel heading (and the top-bar "Add user" button on the Weld page)
Large modal (`bs-example-modal-lg`). One form, `method="post"`. Left part: personal data; below it a panel with seven pill tabs (MTOPilot, ESTPilot, CivilPilot, ManagementHub, WeldPilot, TeamPilot, ToolPilot) — in that order, the first (MTOPilot) active. Tab panes: `#tab18_4` MTOPilot, `#tab18_5` ESTPilot, `#tab18_6` CivilPilot, `#tab18_7` ManagementHub, `#tab18_1` WeldPilot, `#tab18_3` TeamPilot, `#tab18_2` ToolPilot.

Profile options used by every "Profile" select (except ToolPilot): 6 options — 5 → Full rights (selected); 12 → QAQC 01; 15 → Workpreparator 01; 17 → WPM; 18 → profile 18 (this profile's name is a person's name; the profile list below describes it as "Admin"); 19 → External.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Username | `username` | text | yes | empty | — |
| 2 | Password | `password` | password | yes (and read-only in the capture) | empty | `minlength="8"`, pattern needs a lower-case letter, an upper-case letter and a digit, at least 8 characters; title and help text say the same ("At least 8 characters, with an uppercase letter, a lowercase letter and a number"). The input is marked read-only in the DOM; the capture does not show what makes it editable. |
| 3 | Name | `name` | text | no | empty | — |
| 4 | Title | `job_title` | text | no | empty | `maxlength="255"` |
| 5 | Address | `address` | text | no | empty | — |
| 6 | Email address | `email` | text | no | empty | — |
| 7 | Phone | `phone` | text | no | empty | — |
| 8 | Company | `company` | select (select2) | no | 0 "---- Without company ----" | 3 options: 0 → ---- Without company ---- ; 7 → MONTAVAR METALNA LOLA ; 8 → Websonik Applicaties BV |
| 9 | Deactivate user | `deactivated` | checkbox (`#checkboxDeactivated`, value `ok`) | no | unchecked | — |
| 10 | Enabled (tab MTOPilot) | `mtopilot` | checkbox (`#checkboxMTOPilot`, value `ok`) | no | unchecked | Shows the Access / Profile controls of this tab when checked. |
| 11 | Access (tab MTOPilot) | `mtopilotrole` | select (`#roleMTOPilot`) | no | 2 All project sites | 2 options: 2 → All project sites ; 3 → Specific project site(s). Hidden until "Enabled" is checked. |
| 12 | Profile (tab MTOPilot) | `mtopilotprofile` | select | no | 5 Full rights | the 6 profile options; row `#hideOnMTOPilot`, hidden until Enabled; hidden again when Access = Specific project site(s). |
| 13 | Home location checkbox, Zandbak (tab MTOPilot) | `sitesCHKMTO1` | checkbox (`#checkboxMTO1`, value `ok`) | no | unchecked | table `#showOnMTOPilot`, shown only when Access = Specific project site(s) |
| 14 | Profile for Zandbak | `typeMTO1` | select | no | 5 Full rights | the 6 profile options |
| 15 | Home location checkbox, 10420-2530 Ineos Project ONE | `sitesCHKMTO2` | checkbox (`#checkboxMTO2`) | no | unchecked | same table |
| 16 | Profile for 10420-2530 Ineos Project ONE | `typeMTO2` | select | no | 5 Full rights | the 6 profile options |
| 17 | Home location checkbox, IPO - Carry Over | `sitesCHKMTO10` | checkbox (`#checkboxMTO10`) | no | unchecked | same table |
| 18 | Profile for IPO - Carry Over | `typeMTO10` | select | no | 5 Full rights | the 6 profile options |
| 19 | Enabled (tab ESTPilot) | `estpilot` | checkbox (`#checkboxESTPilot`, value `ok`) | no | unchecked | as 10 |
| 20 | Access (tab ESTPilot) | `estpilotrole` | select (`#roleESTPilot`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s) |
| 21 | Profile (tab ESTPilot) | `estpilotprofile` | select | no | 5 Full rights | the 6 profile options; row `#hideOnESTPilot` |
| 22 | Home location checkbox, Zandbak (ESTPilot) | `sitesCHKEST1` | checkbox (`#checkboxEST1`) | no | unchecked | table `#showOnESTPilot` |
| 23 | Profile for Zandbak (ESTPilot) | `typeEST1` | select | no | 5 Full rights | the 6 profile options |
| 24 | Home location checkbox, 10420-2530 Ineos Project ONE (ESTPilot) | `sitesCHKEST2` | checkbox (`#checkboxEST2`) | no | unchecked | same table |
| 25 | Profile for 10420-2530 Ineos Project ONE (ESTPilot) | `typeEST2` | select | no | 5 Full rights | the 6 profile options |
| 26 | Home location checkbox, IPO - Carry Over (ESTPilot) | `sitesCHKEST10` | checkbox (`#checkboxEST10`) | no | unchecked | same table |
| 27 | Profile for IPO - Carry Over (ESTPilot) | `typeEST10` | select | no | 5 Full rights | the 6 profile options |
| 28 | Enabled (tab CivilPilot) | `civilpilot` | checkbox (`#checkboxCivilPilot`, value `ok`) | no | unchecked | as 10 |
| 29 | Access (tab CivilPilot) | `civilpilotrole` | select (`#roleCivilPilot`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s) |
| 30 | Profile (tab CivilPilot) | `civilpilotprofile` | select | no | 5 Full rights | the 6 profile options; row `#hideOnCivilPilot` |
| 31 | Home location checkbox, Zandbak (CivilPilot) | `sitesCHKCIVIL1` | checkbox (`#checkboxCIVIL1`) | no | unchecked | table `#showOnCivilPilot` |
| 32 | Profile for Zandbak (CivilPilot) | `typeCIVIL1` | select | no | 5 Full rights | the 6 profile options |
| 33 | Home location checkbox, 10420-2530 Ineos Project ONE (CivilPilot) | `sitesCHKCIVIL2` | checkbox (`#checkboxCIVIL2`) | no | unchecked | same table |
| 34 | Profile for 10420-2530 Ineos Project ONE (CivilPilot) | `typeCIVIL2` | select | no | 5 Full rights | the 6 profile options |
| 35 | Home location checkbox, IPO - Carry Over (CivilPilot) | `sitesCHKCIVIL10` | checkbox (`#checkboxCIVIL10`) | no | unchecked | same table |
| 36 | Profile for IPO - Carry Over (CivilPilot) | `typeCIVIL10` | select | no | 5 Full rights | the 6 profile options |
| 37 | Enabled (tab ManagementHub) | `dashboardhub` | checkbox (`#checkboxDashboardHub`, value `ok`) | no | unchecked | as 10 |
| 38 | Access (tab ManagementHub) | `dashboardhubrole` | select (`#roleDashboardHub`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s). No home-location table in this tab. |
| 39 | Profile (tab ManagementHub) | `dashboardhubprofile` | select | no | 5 Full rights | the 6 profile options; followed by a pencil button (link `?page=profiles`, `target="_blank"`, title "Profiles") |
| 40 | Enabled (tab WeldPilot) | `weldpilot` | checkbox (`#checkboxWeldPilot`, value `ok`) | no | unchecked | as 10 |
| 41 | Access (tab WeldPilot) | `weldpilotrole` | select (`#role`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s) |
| 42 | Profile (tab WeldPilot) | `weldpilotprofile` | select | no | 5 Full rights | the 6 profile options; row `#hideOnWarehouse` |
| 43 | Home location checkbox, Zandbak (WeldPilot) | `sitesCHK1` | checkbox (`#checkbox1`) | no | unchecked | table `#showOnWarehouse` |
| 44 | Profile for Zandbak (WeldPilot) | `type1` | select | no | 5 Full rights | the 6 profile options |
| 45 | Home location checkbox, 10420-2530 Ineos Project ONE (WeldPilot) | `sitesCHK2` | checkbox (`#checkbox2`) | no | unchecked | same table |
| 46 | Profile for 10420-2530 Ineos Project ONE (WeldPilot) | `type2` | select | no | 5 Full rights | the 6 profile options |
| 47 | Home location checkbox, IPO - Carry Over (WeldPilot) | `sitesCHK10` | checkbox (`#checkbox10`) | no | unchecked | same table |
| 48 | Profile for IPO - Carry Over (WeldPilot) | `type10` | select | no | 5 Full rights | the 6 profile options |
| 49 | Enabled (tab TeamPilot) | `teampilot` | checkbox (`#checkboxTeamPilot`, value `ok`) | no | unchecked | as 10 |
| 50 | Access (tab TeamPilot) | `teampilotrole` | select (`#roleTeamPilot`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s) |
| 51 | Profile (tab TeamPilot) | `teampilotprofile` | select | no | 5 Full rights | the 6 profile options; row `#hideOnTeamPilot` |
| 52 | Home location checkbox, Zandbak (TeamPilot) | `sitesCHKTeam1` | checkbox (`#checkboxTeam1`) | no | unchecked | table `#showOnTeamPilot` |
| 53 | Profile for Zandbak (TeamPilot) | `typeTeam1` | select | no | 5 Full rights | the 6 profile options |
| 54 | Home location checkbox, 10420-2530 Ineos Project ONE (TeamPilot) | `sitesCHKTeam2` | checkbox (`#checkboxTeam2`) | no | unchecked | same table |
| 55 | Profile for 10420-2530 Ineos Project ONE (TeamPilot) | `typeTeam2` | select | no | 5 Full rights | the 6 profile options |
| 56 | Home location checkbox, IPO - Carry Over (TeamPilot) | `sitesCHKTeam10` | checkbox (`#checkboxTeam10`) | no | unchecked | same table |
| 57 | Profile for IPO - Carry Over (TeamPilot) | `typeTeam10` | select | no | 5 Full rights | the 6 profile options |
| 58 | Enabled (tab ToolPilot) | `toolpilot` | checkbox (`#checkboxToolPilot`, value `ok`) | no | unchecked | as 10 |
| 59 | Access (tab ToolPilot) | `toolpilotrole` | select (`#roleToolPilot`) | no | 2 All project sites | 2 → All project sites ; 3 → Specific project site(s) |
| 60 | Profile (tab ToolPilot) | `toolpilotprofile` | select | no | 1 Company manager | 2 options only: 1 → Company manager (selected) ; 2 → Warehouse manager; row `#hideOnToolPilot` |

ToolPilot tab, below the profile row: a hidden block `#showOnToolPilot` with the label "Warehouse" and an empty table (no rows and no inputs in the capture).
The home-location tables have two column labels: "Home location" and "Profile". The rows are the three project sites of the sandbox (Zandbak; 10420-2530 Ineos Project ONE; IPO - Carry Over). Their input names carry the project-site id (1, 2, 10) — the number of rows follows the number of project sites.
There are no hidden inputs in this dialog.

Buttons: "Add" (primary, `type="submit"`, `name="addUser"`, class `btn-hideInsert`); "Cancel" (`data-dismiss="modal"`); a close cross in the header.

### Edit user (`#editUser`) — opened by the pencil in the Options column
Capture shows only the shell (header "Edit user", close cross, an empty body container `#contentEditUser`, footer). Footer: hidden input `secureCode` (`#bookIdEditUserSecure`, empty), button "Update" (warning, `type="submit"`, `name="editUser"`, class `btn-hideEdit`), button "Cancel". The body is loaded when the pencil is clicked (see "Rules found in the page's JavaScript"). Not captured on the MTO page; see "Not in the capture".

### Delete user (`#deleteUser`) — opened by the trash button in the Options column
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden (`#bookIdDeleteUser`) | — | empty; filled with the row's `data-id` when the button is clicked | — |
| 2 | — | `secureCode` | hidden (`#bookIdDeleteUserSecure`) | — | empty; filled by the script on click | — |

Text: "Are you sure?". Buttons: "Delete" (danger, trash icon, `type="submit"`, `name="deleteUser"`, class `btn-hideDelete`), "Cancel".

## Rules found in the page's JavaScript
These scripts are written out in the Weld capture (`weld__system__user-accounts.txt`); the MTO capture lists them as identical (`SAME-AS`).
- On load, the first pill (`.nav-pills li:first`) and the first tab pane (`.tab-content div:first`) get the class "active".
- Row pencil (`.open-editUser`): requests `GET /core/ajax/editUser.php?id=<data-id>` (the browser-pass notes show the final URL with `&action=showroom`) and puts the response HTML in `#contentEditUser`.
- Row trash (`.open-deleteUser`): copies `data-id` into `deleteID` and builds a secure code from a fixed string, the id and the suffix `usr`, which it writes to the hidden `secureCode`.
- At load every `.showOn<App>Enabled` block and every `#showOn<App>` home-location block is hidden (App = WeldPilot, ToolPilot, TeamPilot, MTOPilot, ESTPilot, CivilPilot, DashboardHub; `#showOnWarehouse` belongs to WeldPilot).
- Changing an "Enabled" checkbox shows (checked) or hides (unchecked) that application's Access/Profile block. When Weld/Tool unchecked the script hides `#showOnWarehouse` (not the ToolPilot block); MTO/EST/Civil/Team hide their own `#showOn<App>`. ManagementHub just toggles `.showOnDashboardHubEnabled`.
- Changing an Access select (`#role` for WeldPilot, `#roleToolPilot`, `#roleTeamPilot`, `#roleMTOPilot`, `#roleESTPilot`, `#roleCivilPilot`): value "3" (Specific project site(s)) shows the home-location table and hides the single Profile row; any other value does the reverse. `#roleDashboardHub` has no such handler in the capture.
- Page-wide: `__wsappsDebugPage = "users"`; on window load the script triggers a click on the table's sort headers.
- Requests made on load: `/core/ajax/ajax-notifications.php?action=count_unread` (notification counter, shared by all pages). Other requests in the shared scripts (material list, project search, unit rates, tariffs, factors) belong to other screens.
- No validation messages other than the HTML attributes listed in the Add user table (required Username and Password, password pattern, Title maxlength 255).

## Sample data
- 116 accounts in total; the page shows 20 (page length 20). "Showing 1 to 20 of 116 entries".
- Among the 20 rows in the capture: MTOPilot On for 20, WeldPilot On for 20, ESTPilot On for 4, TeamPilot On for 3, CivilPilot On for 2, ToolPilot On for 2.
- Company among the 20 rows: MONTAVAR METALNA LOLA 11, "-" 8, Websonik Applicaties BV 1. Title is "-" in all 20.
- No people rows are copied here (rule of this task).

## Not in the capture
- The body of "Edit user" (`#contentEditUser`), loaded by `/core/ajax/editUser.php` after a click on the pencil; no MTO capture of it exists. The Weld pass opened it once (`weld__system__user-accounts__edit.txt`): the same form with the same tabs, and in the MTOPilot tab an extra checkbox `storehouse_manager` labelled "Storehouse manager" (the Add dialog has no such checkbox). The MTO page uses the same shared script and the same request.
- The lists behind "Show deleted" (`?page=users&showdeleted=ok`) and "[ Show inactive ]" (`?page=users&inactive=ok`); the Weld Pilot ones were captured (`weld__system__user-accounts-deleted.txt`, `weld__system__user-accounts-inactive.txt`).
- Rows 21–116 (pages 2 onward).
- What the "On" / "Off" links do in the list (they are `href="#"`; the capture shows no handler).

## Differences from the Weld Pilot
- URL and title only: `/mtopilot/users/` vs `/weldpilot/index.php?page=users`; "User accounts - MTOPilot®" vs "User accounts - WeldPilot®"; the language, "Active", "[ Show inactive ]", "Show deleted" and breadcrumb links point at `/mtopilot/…` instead of `/weldpilot/…`.
- The Add user dialog is the same form field for field (same names, same options, same defaults). The only differences in the capture are presentation: in the Weld capture the select2 widgets carry an extra "select2-hidden-accessible" class.
- The list has the same 13 columns, the same sort, page lengths, buttons and the same 116 accounts with the same On/Off values.
- The Weld capture shows the top-bar "Add user" button as its own line; see Page.
- No other differences found in the capture.

---

# Part 2 — Profiles

## Page
- Title: "Profiles" with a "tasks" glyph icon before it (hidden on extra-small screens). Browser title "Profiles - MTOPilot®".
- Breadcrumb: "Profiles" → `/weldpilot/index.php?page=profiles` (as written in the MTO capture: the link in the top bar points to the Weld Pilot address). Language links as on the users page (`page=profiles`).
- No tabs.
- Buttons: "Add profile" block button in the top bar and a plus icon button in the panel heading, both → dialog `#addProfile` (`href="#addProfile" data-toggle="modal"`).

## List
- Table `#datatableWarehouse`, client-side; 6 rows ("Showing 1 to 6 of 6 entries").
- Columns in order (all visible, sortable): Name, Description, Options.
- Default sort: `order: [[1, "asc"]]` (Description ascending); rows in the capture appear in the order below.
- Page length select `datatableWarehouse_length`: 5, 20, 50, 100, 500; default 20.
- Global search ("Search", clear cross); no per-column search; no filters.
- Buttons above the table: "CSV", "Excel", printer icon.
- Row options: pencil (`.buttonEdit.open-editProfile`, `href="#editProfile"`, `data-id`) → "Edit profile"; trash (`.buttonDelete.open-deleteProfile`, `href="#deleteProfile"`, `data-id`) → "Delete profile". No bulk actions.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries"; empty "No data available in table"; no match "No matching records found".

## Dialogs

### Add profile (`#addProfile`) — opened by the "Add profile" button / plus icon
Large modal (`bs-modal-lg`), one form (`method="post"`).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Profile | `name` | text | yes | empty | — |
| 2 | Description | `description` | text | yes | empty | — |
| 3 | Filter app | (none; class `profile-app-filter`) | select | no | "Alle apps" (empty value) | 9 options: (empty) → Alle apps ; mtopilot → MTOPilot ; estpilot → ESTPilot ; weldpilot → WeldPilot ; civilpilot → CivilPilot ; teampilot → TeamPilot ; toolpilot → ToolPilot ; dashboardhub → ManagementHub ; training → Training. Not submitted (no name); it only filters the rights table in the browser. |
| 4 | Select / deselect all — Show | none (`#selectAllShow`, class `profileSelectAll`, `data-target="checkboxShow"`) | checkbox | no | shown as `cur="on"` in the capture | ticks/unticks the Show column of the visible rows |
| 5 | Select / deselect all — Insert | none (`#selectAllInsert`, `data-target="checkboxInsert"`) | checkbox | no | as 4 | Insert column |
| 6 | Select / deselect all — Edit | none (`#selectAllEdit`, `data-target="checkboxEdit"`) | checkbox | no | as 4 | Edit column |
| 7 | Select / deselect all — Delete | none (`#selectAllDelete`, `data-target="checkboxDelete"`) | checkbox | no | as 4 | Delete column |
| 8 | Select / deselect all — Export | none (`#selectAllExport`, `data-target="checkboxExport"`) | checkbox | no | as 4 | Export column |
| 9 | Select / deselect all — Import | none (`#selectAllImport`, `data-target="checkboxImport"`) | checkbox | no | as 4 | Import column |
| 10 | Select / deselect all — Print | none (`#selectAllPrint`, `data-target="checkboxPrint"`) | checkbox | no | as 4 | Print column |
| 11… | one row per right (124 rows, table below) | `show_<id>`, `insert_<id>`, `edit_<id>`, `delete_<id>`, `export_<id>`, `import_<id>`, `print_<id>` | checkbox (`val` = the right's id) | no | unchecked (no CHECKED flag in the capture) | only the cells shown as a checkbox exist; the other cells show a grey cross icon (`fa fa-times`) and have no input |

The rights table (`.profile-rights-table`): first row "Select / deselect all" (first cell "-"), then rows with the columns "App | Name | Show | Insert | Edit | Delete | Export | Import | Print". The seven right columns have header icons with tooltips: Show (eye), Insert (plus), Edit (pencil), Delete (trash), Export (download), Import (upload), Print (printer). The header row (App, Name and the icons) is repeated 13 times through the table (once per block of about 10 rows). The "App" cell holds one round badge per application with its first letter (M, E, W, C, T…) and the tooltip "MTOPilot®", "ESTPilot®", "WeldPilot®", "CivilPilot®", "TeamPilot®", "ToolPilot®"; rows are in alphabetical order by Name. Each row carries `data-apps="…"` with the application slugs it belongs to.

There are no hidden inputs in this dialog in the capture. (The script adds a hidden input `profileRightsJson` when the form is submitted, see below.)

Buttons: "Add" (primary, `type="submit"`, `name="addProfile"`, class `btn-hideInsert`); "Cancel"; header close cross.

Rights rows (document order; `id` is the number in the input names; letters: S=Show, I=Insert, E=Edit, D=Delete, X=Export, M=Import, P=Print; a dot means the cell is a grey cross):

| # | id | App badges | Name | Columns with a checkbox (S=Show, I=Insert, E=Edit, D=Delete, X=Export, M=Import, P=Print) |
|---|---|---|---|---|
| | | | *(header row 1 repeats here)* | |
| 1 | 54 | TeamPilot | Absence reasons | `SIEDX..` |
| 2 | 102 | CivilPilot | Activities | `SIED...` |
| 3 | 61 | ToolPilot | Articles | `SI...M.` |
| 4 | 103 | CivilPilot | Asset detail | `SIED...` |
| 5 | 104 | CivilPilot | Assets | `SIED...` |
| 6 | 119 | CivilPilot | Assets | `SIED...` |
| 7 | 91 | WeldPilot | Assign ISO to FWP | `SIE.XMP` |
| 8 | 34 | ESTPilot | Calculation statuses | `SIEDX..` |
| 9 | 71 | ESTPilot | Calculations | `SIEDXMP` |
| 10 | 40 | WeldPilot | Certificates | `SIEDX..` |
| | | | *(header row 2 repeats here)* | |
| 11 | 18 | MTOPilot WeldPilot | Certifications | `SIEDXM.` |
| 12 | 52 | MTOPilot ESTPilot WeldPilot TeamPilot ToolPilot | Change theme | `S......` |
| 13 | 84 | WeldPilot | Coating | `SIEDX.P` |
| 14 | 37 | WeldPilot | Companies | `SIEDX..` |
| 15 | 85 | MTOPilot WeldPilot | Custom Attachment Names | `SIEDXMP` |
| 16 | 41 | WeldPilot | Customs | `SIEDX..` |
| 17 | 35 | WeldPilot | Dahsboard - WeldPilot | `S.....P` |
| 18 | 82 | WeldPilot | Daily reports | `SI.DX..` |
| 19 | 107 | CivilPilot | Dashboard | `SIED...` |
| 20 | 27 | ESTPilot | Dashboard - EST Pilot | `S.....P` |
| | | | *(header row 3 repeats here)* | |
| 21 | 2 | MTOPilot | Dashboard - Pending materials | `S......` |
| 22 | 3 | MTOPilot | Dashboard - Pending orders | `S......` |
| 23 | 1 | MTOPilot | Dashboard - Spools locations | `S.E...P` |
| 24 | 105 | CivilPilot | Databook | `SIED...` |
| 25 | 106 | CivilPilot | Databooks | `SIED...` |
| 26 | 81 | WeldPilot | Export welds | `SI..X.P` |
| 27 | 32 | ESTPilot | Factors | `SIEDX..` |
| 28 | 90 | WeldPilot | Field Work Packages | `SIEDXMP` |
| 29 | 100 | WeldPilot | Flanges | `SIED.M.` |
| 30 | 55 | TeamPilot | FMLA absence | `SIEDX..` |
| | | | *(header row 4 repeats here)* | |
| 31 | 117 | CivilPilot | Form Designer | `S.E....` |
| 32 | 72 | WeldPilot | Hydrotest request | `SIEDXMP` |
| 33 | 74 | WeldPilot | Hydrotest request | `SIEDXMP` |
| 34 | 108 | CivilPilot | Inspection requests | `SIED...` |
| 35 | 109 | CivilPilot | Inspectors | `SIED...` |
| 36 | 20 | MTOPilot | ISO execution | `SI.....` |
| 37 | 92 | WeldPilot | Iso Overview | `SI.....` |
| 38 | 64 | MTOPilot ESTPilot WeldPilot | Isometrics | `SIEDXMP` |
| 39 | 19 | MTOPilot ESTPilot WeldPilot TeamPilot | Isometrics list | `S......` |
| 40 | 126 | WeldPilot | ITP templates | `SIED...` |
| | | | *(header row 5 repeats here)* | |
| 41 | 101 | CivilPilot | ITPs | `SIED...` |
| 42 | 120 | WeldPilot | ITPs | `SIED...` |
| 43 | 88 | MTOPilot | Laydowns materials | `SIEDX..` |
| 44 | 93 |  | Management Dashoard | `SIED...` |
| 45 | 123 | ManagementHub | ManagementHub | `SIED...` |
| 46 | 58 | TeamPilot | Manpower overview | `SIEDX..` |
| 47 | 6 | MTOPilot | Material database | `SIED.M.` |
| 48 | 16 | MTOPilot | Material inventory | `SI.DXM.` |
| 49 | 25 | MTOPilot | Material laydowns | `SIEDX..` |
| 50 | 78 | MTOPilot | Material list | `S......` |
| | | | *(header row 6 repeats here)* | |
| 51 | 13 | MTOPilot | Material order | `S.....P` |
| 52 | 17 | MTOPilot | Material order archive | `S.....P` |
| 53 | 7 | MTOPilot WeldPilot | Material part | `SIEDX..` |
| 54 | 15 | MTOPilot | Material receive | `SI..X..` |
| 55 | 12 | MTOPilot WeldPilot | Material Supplier | `SIEDX..` |
| 56 | 70 | MTOPilot | Materials in Isometric | `SIEDXMP` |
| 57 | 118 | CivilPilot | My templates | `S......` |
| 58 | 124 | ManagementHub | Narrowcast settings | `SIED...` |
| 59 | 76 | WeldPilot | NDT Archive | `SIEDXMP` |
| 60 | 94 | WeldPilot | NDT Archive - Pre | `SIEDXMP` |
| | | | *(header row 7 repeats here)* | |
| 61 | 121 | WeldPilot | NDT Batch Import (i) *(info icon, hint: "Import = Upload/Commit")* | `S....M.` |
| 62 | 47 | WeldPilot | NDT locations | `SIEDX..` |
| 63 | 46 | WeldPilot | NDT process | `SIEDX..` |
| 64 | 79 | WeldPilot | NDT Process Groups | `SIEDXM.` |
| 65 | 66 | WeldPilot | NDT Request Archive | `S......` |
| 66 | 50 | WeldPilot | NDT requests manager | `S.E...P` |
| 67 | 11 | MTOPilot | Operation phases | `SIEDX..` |
| 68 | 36 | WeldPilot | Overview | `S.E....` |
| 69 | 14 | MTOPilot | Pending order | `S......` |
| 70 | 69 | TeamPilot | Personnel | `SIEDX..` |
| | | | *(header row 8 repeats here)* | |
| 71 | 21 | MTOPilot | Pick list archive | `S...X.P` |
| 72 | 83 | MTOPilot | Pick list Export | `SIEDXMP` |
| 73 | 57 | TeamPilot | Plan overview | `SIEDX..` |
| 74 | 98 |  | PQR | `SIEDXMP` |
| 75 | 125 | WeldPilot | Prefab/Field release (i) *(info icon with a hint that maps each right to an action: view, invite, compose, remove/withdraw, PDF; signing uses Show)* | `SIED..P` |
| 76 | 53 | MTOPilot ESTPilot WeldPilot TeamPilot ToolPilot | Profiles | `SIEDX..` |
| 77 | 31 | ESTPilot | Project site Factors | `SIEDX..` |
| 78 | 4 | MTOPilot ESTPilot WeldPilot TeamPilot | Project sites | `SIEDXMP` |
| 79 | 5 | MTOPilot ESTPilot WeldPilot TeamPilot | Projects | `SIEDXMP` |
| 80 | 110 | CivilPilot | Punch lists | `SIED...` |
| | | | *(header row 9 repeats here)* | |
| 81 | 77 | WeldPilot | Punchlists | `SIEDXMP` |
| 82 | 97 | WeldPilot | PWHT archive | `SIEDXMP` |
| 83 | 49 | WeldPilot | PWHT locations | `SIEDX..` |
| 84 | 48 | WeldPilot | PWHT process | `SIEDX..` |
| 85 | 65 | WeldPilot | PWHT requests | `S.....P` |
| 86 | 67 | WeldPilot | PWHT Requests Archive | `S......` |
| 87 | 73 | WeldPilot | QA/QC engineers | `SIEDXMP` |
| 88 | 89 | MTOPilot WeldPilot | Release field | `SI..XMP` |
| 89 | 86 | MTOPilot WeldPilot | Release prefab | `SI..XMP` |
| 90 | 62 | ToolPilot | Rented articles | `S...X..` |
| | | | *(header row 10 repeats here)* | |
| 91 | 39 | WeldPilot | Roles | `SIEDX..` |
| 92 | 22 | MTOPilot | Service companies | `SIEDX..` |
| 93 | 23 | MTOPilot | Service request | `SI.....` |
| 94 | 80 | MTOPilot | Service request - Materials | `SI.....` |
| 95 | 24 | MTOPilot | Service requests - Archive | `S.....P` |
| 96 | 96 | WeldPilot CivilPilot | Signatures | `SI.....` |
| 97 | 10 | MTOPilot WeldPilot | Spools | `SIEDX..` |
| 98 | 111 | MTOPilot | Storehouse order detail | `S.E...P` |
| 99 | 112 | MTOPilot | Storehouse orders | `SIED..P` |
| 100 | 113 | MTOPilot | Storehouse transactions | `S.....P` |
| | | | *(header row 11 repeats here)* | |
| 101 | 75 | MTOPilot ESTPilot WeldPilot | Storehouses | `SIEDXMP` |
| 102 | 33 | ESTPilot | Tariffs | `SIEDX..` |
| 103 | 56 | TeamPilot | Tasks | `SIEDX..` |
| 104 | 87 | WeldPilot | Test systems | `SIEDXMP` |
| 105 | 122 | Training | Training (i) *(info icon, hint: "Show = follow guided training")* | `S......` |
| 106 | 60 | ToolPilot | Transfer list | `S...X..` |
| 107 | 8 | MTOPilot WeldPilot | Type of material | `SIEDX..` |
| 108 | 28 | ESTPilot | Unit Rates | `SIED...` |
| 109 | 29 | ESTPilot | Unit Rates Groups | `SIEDX..` |
| 110 | 30 | ESTPilot | Unit Rates Subgroups | `SIEDX..` |
| | | | *(header row 12 repeats here)* | |
| 111 | 9 | MTOPilot ESTPilot | UOMs | `SIEDX..` |
| 112 | 26 | MTOPilot ESTPilot WeldPilot TeamPilot ToolPilot | Users accounts | `SIEDX..` |
| 113 | 116 | WeldPilot | Visual inspection | `SIED..P` |
| 114 | 59 | ToolPilot | Warehouses list | `SIEDX..` |
| 115 | 45 | WeldPilot | Weld diameters | `SIEDX..` |
| 116 | 44 | WeldPilot | Weld type | `SIEDX..` |
| 117 | 95 | WeldPilot | Welder card settings | `SIED...` |
| 118 | 68 | WeldPilot | Welders | `SIEDX..` |
| 119 | 43 | WeldPilot | Welding process | `SIEDX..` |
| 120 | 99 | MTOPilot WeldPilot | Welding wires | `SIED...` |
| | | | *(header row 13 repeats here)* | |
| 121 | 63 | WeldPilot | Welds | `SIEDXMP` |
| 122 | 114 | WeldPilot | WPS Designer | `SIEDXM.` |
| 123 | 42 | WeldPilot | WPS methods | `SIEDX..` |
| 124 | 115 | WeldPilot | WPS Source Data | `SIED...` |


### Edit profile (`#editProfile`) — opened by the pencil in the Options column
Capture shows only the shell (written out in the Weld capture, the MTO capture says it is identical): header "Edit profile", close cross, an empty body container `#contentEditProfile`, footer. Footer: text input `duplicateName` (type text, placeholder "New profile name", `maxlength="255"`), button "Duplicate profile" (primary, `type="submit"`, `name="duplicateProfile"`), hidden input `secureCode` (`#bookIdEditProfileSecure`, empty), button "Update" (warning, `type="submit"`, `name="editProfile"`, class `btn-hideEdit`), button "Cancel". The body is loaded on click. Not captured on the MTO page.

### Delete profile (`#deleteProfile`) — opened by the trash button in the Options column
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden (`#bookIdDeleteProfile`) | — | empty; set to the row's `data-id` on click | — |
| 2 | — | `secureCode` | hidden (`#bookIdDeleteProfileSecure`) | — | empty; set by the script on click | — |

Text: "Are you sure?". Buttons: "Delete" (danger, `type="submit"`, `name="deleteProfile"`, class `btn-hideDelete`), "Cancel".

## Rules found in the page's JavaScript
- Row pencil (`.open-editProfile`): sets the hidden `secureCode`, requests `GET /core/ajax/editProfile.php?id=<data-id>` (the browser-pass notes show `&action=showroom`) and puts the response in `#contentEditProfile`.
- Row trash (`.open-deleteProfile`): copies `data-id` to `deleteID` and sets `secureCode`.
- "Select / deselect all" checkboxes (`.profileSelectAll`): on change, set every checkbox of the matching column class (`checkboxShow`, `checkboxInsert`, …) in the rights-table rows that are currently visible (rows hidden by the app filter are not changed).
- "Filter app" select (`.profile-app-filter`): on change, shows only the rows whose `data-apps` text contains the chosen value (empty value = all rows); with a filter set only the first header row stays visible, with no filter every header row is shown only if it has visible rows below it; the select-all checkboxes are unticked after every change.
- Submitting any form that contains a rights table: the script reads all checkboxes named `show|insert|edit|delete|import|export|print_<id>` that are ticked, removes their `name` attribute, and appends one hidden input `profileRightsJson` holding a JSON object `{ "<id>": { "show": 1, "edit": 1, … } }` for the ticked rights; it also adds a hidden input with the submit button's name/value, then submits the form. The individual checkboxes are therefore not posted under their own names.
- Requests on load: `/core/ajax/ajax-notifications.php?action=count_unread`.
- No validation messages besides `required` on Profile and Description.

## Sample data
List of profiles (6 of 6; "Showing 1 to 6 of 6 entries"). One profile is named after a person; it is shown as "profile 18".

| Name | Description | id |
|---|---|---|
| profile 18 (name is a person's name) | Admin | 18 |
| QAQC 01 | Highest rights for QAQC | 12 |
| External | Only review | 19 |
| Workpreparator 01 | Standard profile for workpreparator | 15 |
| Full rights | This profile has full rights (Almost as admin) | 5 |
| WPM | Work Preparation Manager | 17 |

Rights table in the Add profile dialog: 124 rows. Rows per app badge group as written in `data-apps`: weldpilot 44, mtopilot 24, civilpilot 13, estpilot 9, mtopilot+weldpilot 8, teampilot 6, toolpilot 4, dashboardhub 2, training 1, dashboard 1 ("Management Dashoard") plus several multi-app rows (Projects, Project sites, Users accounts, Profiles, Change theme, Isometrics list, Isometrics, Storehouses, UOMs, Welding wires, Signatures) and one `data-apps` value that reads "weldpilo" (row PQR). Names, including the spellings "Management Dashoard" and "Dahsboard - WeldPilot", are as in the table above.

## Not in the capture
- The body of "Edit profile" (the profile's own name, description and ticked rights), loaded by `/core/ajax/editProfile.php` after a click on the pencil. No MTO capture. The Weld pass opened six of them (`weld__system__profiles__edit-1` … `-6`): a form of the same layout as Add profile, with the saved rights ticked.
- Whether a deleted profile that is still assigned to users is refused: the capture only shows the confirmation text.

## Differences from the Weld Pilot
- URL and title only for the list page: `/mtopilot/profiles/` and "Profiles - MTOPilot®". The profiles table is the same 6 rows. (In the MTO capture the top-bar "Profiles" link still points to `/weldpilot/index.php?page=profiles`; the Weld capture is not different in this line apart from the pilot name.)
- Add profile dialog: same fields, same select, same 124 right ids, 7 right columns and the same button names. The only differences in the rights table are in the nine CivilPilot rows (ids 102–110); the other 115 rows are identical in name, id and checkbox cells:

| id | MTO capture: name, cells | Weld capture: name, cells |
|---|---|---|
| 102 | Activities, `SIED...` | Civil Activities, `SIEDX.P` |
| 103 | Asset detail, `SIED...` | Civil Element Detail, `S.E.X.P` |
| 104 | Assets, `SIED...` | Civil Elements, `SIEDX.P` |
| 105 | Databook, `SIED...` | Construction Databook Detail, `SIE.X..` |
| 106 | Databooks, `SIED...` | Construction Databooks, `S......` |
| 107 | Dashboard, `SIED...` | Dashboard, `S......` |
| 108 | Inspection requests, `SIED...` | Inspector Dashboard, `S......` |
| 109 | Inspectors, `SIED...` | Inspectors, `SIEDX.P` |
| 110 | Punch lists, `SIED...` | Punch List Management, `SIEDX..` |

  Because rows are sorted by name, these rows also sit at different places in the table in the two captures.
- The Weld capture writes the badge tooltip "WeldPilot®" as "WPilot®" in a few places (text rewritten by the capture tool, not a product difference).
- Edit profile and Delete profile dialogs: identical (the MTO capture marks them as the same as the Weld ones). Scripts: identical.

Also present in the pages, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#docsFlange`, `#importFlanges`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#createTransferOrder`, `#srArchiveScanModal`, `#materialQrScanModal`. The users page does not contain `#addProfile`, `#editProfile`, `#deleteProfile`; the profiles page does not contain `#addUser`.
