# Weld Pilot → System → Profiles

Source: `weld__system__profiles.txt`, `weld__system__profiles__edit-1.txt` … `weld__system__profiles__edit-6.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/profiles/` (menu link `/weldpilot/index.php?page=profiles`).
State of the page for the observing account: normal (the list and all dialogs are shown).

## Page
- Browser title: "Profiles - WeldPilot®". Breadcrumb: one active crumb "Profiles" (`/weldpilot/index.php?page=profiles`). No tabs.
- Panel title: "Profiles" (icon glyphicon-tasks).
- Buttons above the list (two, same target): "Add profile" in the top bar (plus icon, `href="#addProfile" data-toggle="modal"`) and a plus-icon button without text in the panel heading (same `href="#addProfile"`). Both open the dialog Add profile (`#addProfile`).
- Dialogs this page opens: `#addProfile` (static in the page), `#editProfile` (body loaded by a request after the click), `#deleteProfile` (static in the page).

## List
- Table id `datatableWarehouse` (classes table-striped, table-bordered, table-hover). Client-side table: `serverSide:false`, `ajax:null`; all 6 rows are in the page.
- Columns in order (all visible, all sortable): "Name", "Description", "Options".
- Default sort: `[[1,"asc"]]`, i.e. column index 1, "Description", ascending.
- Page length options: 5, 20, 50, 100, 500; default 20. Label "Show [select] entries".
- Search: one global search box with a magnifier icon, placeholder "Search", and a clear (×) button. No per-column search inputs, no other filters.
- Export / print buttons (top left, in this order): "CSV", "Excel", and a print icon button without text.
- Row options (column "Options"), in order:
  1. Pencil button (`.buttonEdit.open-editProfile`, warning/orange, `href="#editProfile"`, `data-id=<profile id>`, `data-toggle="modal"`) → opens Edit profile.
  2. Trash button (`.buttonDelete.open-deleteProfile`, danger/red, `href="#deleteProfile"`, `data-id=<profile id>`, `data-toggle="modal"`) → opens Delete profile.
- No bulk actions / Options menu, no row checkboxes.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (displayed: "Showing 1 to 6 of 6 entries"). Empty text: "No data available in table". No-match text: "No matching records found".
- Language links in the top bar (Nederlands, English, Deutsch, Français) reload this page as `/weldpilot/index.php?lang=<nl|en|de|fr>&page=profiles&id=&project=&projectSite=`.

## Dialogs

### Add profile (`#addProfile`) — opened by "Add profile" (top bar) and the plus button in the panel heading
Large dialog (`modal bs-modal-lg`), a `form method="post"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Profile | `name` | text | yes | empty | — |
| 2 | Description | `description` | text | yes | empty | — |
| 3 | Filter app | (no name; class `profile-app-filter`) | select | no | "Alle apps" (empty value) | 9 options: (empty) → Alle apps; mtopilot → MTOPilot; estpilot → ESTPilot; weldpilot → WeldPilot; civilpilot → CivilPilot; teampilot → TeamPilot; toolpilot → ToolPilot; dashboardhub → ManagementHub; training → Training. Only filters which rows of the rights table are shown (see JavaScript rules); it is not submitted. |
| 4 | Select / deselect all, column Show | (no name; `#selectAllShow`, `data-target="checkboxShow"`) | checkbox | no | unchecked | Sets all visible rows' Show boxes. |
| 5 | Select / deselect all, column Insert | (no name; `#selectAllInsert`, `data-target="checkboxInsert"`) | checkbox | no | unchecked | same, Insert |
| 6 | Select / deselect all, column Edit | (no name; `#selectAllEdit`, `data-target="checkboxEdit"`) | checkbox | no | unchecked | same, Edit |
| 7 | Select / deselect all, column Delete | (no name; `#selectAllDelete`, `data-target="checkboxDelete"`) | checkbox | no | unchecked | same, Delete |
| 8 | Select / deselect all, column Export | (no name; `#selectAllExport`, `data-target="checkboxExport"`) | checkbox | no | unchecked | same, Export |
| 9 | Select / deselect all, column Import | (no name; `#selectAllImport`, `data-target="checkboxImport"`) | checkbox | no | unchecked | same, Import |
| 10 | Select / deselect all, column Print | (no name; `#selectAllPrint`, `data-target="checkboxPrint"`) | checkbox | no | unchecked | same, Print |
| 11 | Rights matrix | `show_<id>`, `insert_<id>`, `edit_<id>`, `delete_<id>`, `export_<id>`, `import_<id>`, `print_<id>` (536 checkboxes in all, `val="<id>"`) | checkbox | no | all unchecked | One row per area (124 rows, listed in full below); each cell is either a checkbox or a grey × (right not offered). |

There are no hidden inputs in the Add dialog as captured (the browser adds `profileRightsJson` on submit, see JavaScript rules).

Rights table layout: first row "Select / deselect all" (App cell shows "-"), then a header row with "App" | "Name" | seven icon columns, then the area rows. The header row is repeated before every 10th area row (before rows 1, 11, 21 … 121). Header icons and their tooltips, in order: eye = "Show", plus = "Insert", pencil = "Edit", trash = "Delete", download = "Export", upload = "Import", printer = "Print". The App cell holds one round badge per application with the application letter (M, E, W, T, T, C, …) and a tooltip with the full name ("MTOPilot®", "ESTPilot®", "WeldPilot®", "TeamPilot®", "ToolPilot®", "CivilPilot®", "ManagementHub", "Training"). Rows are sorted by Name (as numbered below, "ITPs" appears twice, once for CivilPilot and once for WeldPilot, and "Hydrotest request" twice, with different right ids).

Buttons: "Add" (`name="addProfile"`, submit, class btn-primary btn-hideInsert), "Cancel" (closes the dialog). Both Profile and Description are required.

### Edit profile (`#editProfile`) — opened by the pencil in a row
Large dialog. Click handler `.open-editProfile` fills a hidden field, then loads the body with `GET /core/ajax/editProfile.php?id=<id>&action=showroom` (the capture shows this request for ids 18, 12, 19, 15, 5, 17) and puts the response into `#contentEditProfile`. The form is `method="post" enctype="multipart/form-data"`. Body fields:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Profile | `name` | text | yes | the profile's name | — |
| 2 | Description | `description` | text | yes | the profile's description | — |
| 3 | Filter app | (no name; `profile-app-filter`) | select | no | "Alle apps" | same 9 options as in Add profile |
| 4–10 | Select / deselect all (Show, Insert, Edit, Delete, Export, Import, Print) | (no name; ids `#selectAllShowEdit`, `#selectAllInsertEdit`, `#selectAllEditEdit`, `#selectAllDeleteEdit`, `#selectAllExportEdit`, `#selectAllImportEdit`, `#selectAllPrintEdit`) | checkbox | no | unchecked | same behaviour as in Add |
| 11 | Rights matrix | `show_<id>` … `print_<id>`, ids carry the profile id as suffix (e.g. `checkboxAppShow54_c18`) | checkbox | no | checked where the profile has the right (see the matrix below) | Same 124 area rows and same order as in Add profile; the only differences are listed below. |
| 12 | (hidden) | `editID` | hidden | — | the profile id (e.g. 18) | set by the loaded body |

Footer fields and buttons:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 13 | placeholder "New profile name" | `duplicateName` | text, maxlength 255 | no | empty | used with the "Duplicate profile" button |
| 14 | (hidden) | `secureCode` (`#bookIdEditProfileSecure`) | hidden | — | filled by script on click (a 32-character hex value in the capture) | how it is computed is not visible in the capture |

Buttons: "Duplicate profile" (`name="duplicateProfile"`, submit, btn-primary), "Update" (`name="editProfile"`, submit, btn-warning, class btn-hideEdit), "Cancel" (closes).

Differences of the Edit dialog's rows against the Add dialog's rows:
- Row 44 "Management Dashoard" (right id 93): Add shows no application badge (just "-", `data-apps="dashboard"`); Edit shows a badge with tooltip "Management Dashboard".
- Rows 45 "ManagementHub" (id 123) and 58 "Narrowcast settings" (id 124): Add shows one badge "ManagementHub"; Edit shows two badges, "ManagementHub" and "Management Dashboard".
- Row 122 "WPS Designer" (id 114): Edit shows an info icon with the text "Import = Approve" (tooltip in Dutch, paraphrased: the Import column is used as the Approve right of WPS Designer); Add shows no icon.

### Delete profile (`#deleteProfile`) — opened by the trash button in a row
Small dialog, title "Delete profile". Body text: "Are you sure?". Form `method="post"` with two hidden inputs.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | `deleteID` (`#bookIdDeleteProfile`) | hidden | — | set by the click handler `.open-deleteProfile` to the row's `data-id` | — |
| 2 | (hidden) | `secureCode` (`#bookIdDeleteProfileSecure`) | hidden | — | set by the same handler from a computed value | how it is computed is not visible in the capture |

Buttons: "Delete" (`name="deleteProfile"`, submit, btn-danger, class btn-hideDelete), "Cancel".

### The area rows of the rights matrix (Add profile and Edit profile)
The table below is the whole matrix in the order shown. Columns: running number in the dialog; area name exactly as written (including spelling mistakes of the reference); right id (the number in the input names `show_<id>` …); the application badge(s) in the App cell; the `data-apps` attribute that the Filter app select compares against; "Actions offered" as seven positions in the order Show, Insert, Edit, Delete, Export, Import, Print with the letters S I E D X M P (a letter = a checkbox is offered; "." = grey × shown). The last six columns repeat the same seven positions for the profiles that the browser pass opened in Edit (letter = box checked for that profile).

| # | Area (as shown) | Right id | Application badge(s) shown | `data-apps` | Actions offered | id 18 (person A) | id 12 (QAQC 01) | id 19 (External) | id 15 (Workpreparator 01) | id 5 (Full rights) | id 17 (WPM) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Absence reasons | 54 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 2 | Articles | 61 | ToolPilot® | `toolpilot` | `SI...M.` | `SI...M.` | `.......` | `S......` | `.......` | `.......` | `SI...M.` |
| 3 | Assets | 119 | CivilPilot® | `civilpilot` | `SIED...` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIED...` |
| 4 | Assign ISO to FWP | 91 | WeldPilot® | `weldpilot` | `SIE.XMP` | `SIE.XMP` | `.......` | `S......` | `.......` | `SIE.XMP` | `SIE.XMP` |
| 5 | Calculation statuses | 34 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIE.X..` | `SIEDX..` |
| 6 | Calculations | 71 | ESTPilot® | `estpilot` | `SIEDXMP` | `SIEDXMP` | `.......` | `S......` | `.......` | `SIEDXMP` | `SIEDXMP` |
| 7 | Certificates | 40 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIE.X..` | `SIEDX..` |
| 8 | Certifications | 18 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDXM.` | `SIEDXM.` | `SIE....` | `S......` | `SIE.XM.` | `SIE.XM.` | `SIEDXM.` |
| 9 | Change theme | 52 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot® | `mtopilot estpilot teampilot weldpilot toolpilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 10 | Civil Activities | 102 | CivilPilot® | `civilpilot` | `SIEDX.P` | `.......` | `.......` | `.......` | `.......` | `.......` | `SIEDX.P` |
| 11 | Civil Element Detail | 103 | CivilPilot® | `civilpilot` | `S.E.X.P` | `.......` | `.......` | `.......` | `.......` | `S.E....` | `S.E.X.P` |
| 12 | Civil Elements | 104 | CivilPilot® | `civilpilot` | `SIEDX.P` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIEDX.P` |
| 13 | Coating | 84 | WeldPilot® | `weldpilot` | `SIEDX.P` | `SIEDX.P` | `SIE.X.P` | `S......` | `SIE.X.P` | `SIEDX.P` | `SIEDX.P` |
| 14 | Companies | 37 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `SIE.X..` | `SIE.X..` | `SIEDX..` |
| 15 | Construction Databook Detail | 105 | CivilPilot® | `civilpilot` | `SIE.X..` | `.......` | `.......` | `.......` | `.......` | `SIE....` | `SIE.X..` |
| 16 | Construction Databooks | 106 | CivilPilot® | `civilpilot` | `S......` | `.......` | `.......` | `.......` | `.......` | `S......` | `S......` |
| 17 | Custom Attachment Names | 85 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `S.....P` | `S...XMP` | `SIEDXMP` |
| 18 | Customs | 41 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S......` | `SIE.X..` | `SIEDX..` |
| 19 | Dahsboard - WeldPilot | 35 | WeldPilot® | `weldpilot` | `S.....P` | `S.....P` | `S.....P` | `S......` | `S.....P` | `S.....P` | `S.....P` |
| 20 | Daily reports | 82 | WeldPilot® | `weldpilot` | `SI.DX..` | `SI.DX..` | `S...X..` | `S......` | `S...X..` | `SI.DX..` | `SI.DX..` |
| 21 | Dashboard | 107 | CivilPilot® | `civilpilot` | `S......` | `.......` | `.......` | `.......` | `.......` | `S......` | `S......` |
| 22 | Dashboard - EST Pilot | 27 | ESTPilot® | `estpilot` | `S.....P` | `S.....P` | `.......` | `S......` | `.......` | `S.....P` | `S.....P` |
| 23 | Dashboard - Pending materials | 2 | MTOPilot® | `mtopilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 24 | Dashboard - Pending orders | 3 | MTOPilot® | `mtopilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 25 | Dashboard - Spools locations | 1 | MTOPilot® | `mtopilot` | `S.E...P` | `S.E...P` | `S......` | `S......` | `S.E...P` | `S.E...P` | `S.E...P` |
| 26 | Export welds | 81 | WeldPilot® | `weldpilot` | `SI..X.P` | `SI..X.P` | `SI..X.P` | `S......` | `SI..X.P` | `SI..X.P` | `SI..X.P` |
| 27 | Factors | 32 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIE.X..` | `SIEDX..` |
| 28 | Field Work Packages | 90 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `......P` | `S......` | `SIE.XMP` | `SIE.XMP` | `SIEDXMP` |
| 29 | Flanges | 100 | WeldPilot® | `weldpilot` | `SIED.M.` | `SIED.M.` | `SIED.M.` | `.......` | `.......` | `SIED.M.` | `SIED.M.` |
| 30 | FMLA absence | 55 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 31 | Form Designer | 117 | CivilPilot® | `civilpilot` | `S.E....` | `.......` | `.......` | `.......` | `.......` | `S.E....` | `S.E....` |
| 32 | Hydrotest request | 72 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIE.XMP` | `S......` | `SIE.XMP` | `SIE.XMP` | `SIEDXMP` |
| 33 | Hydrotest request | 74 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIE.XMP` | `S......` | `SIE.XMP` | `SIE.XMP` | `SIEDXMP` |
| 34 | Inspector Dashboard | 108 | CivilPilot® | `civilpilot` | `S......` | `.......` | `.......` | `.......` | `.......` | `S......` | `S......` |
| 35 | Inspectors | 109 | CivilPilot® | `civilpilot` | `SIEDX.P` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIEDX.P` |
| 36 | ISO execution | 20 | MTOPilot® | `mtopilot` | `SI.....` | `SI.....` | `.......` | `S......` | `SI.....` | `SI.....` | `SI.....` |
| 37 | Iso Overview | 92 | WeldPilot® | `weldpilot` | `SI.....` | `SI.....` | `.......` | `S......` | `SI.....` | `SI.....` | `SI.....` |
| 38 | Isometrics | 64 | MTOPilot®, ESTPilot®, WeldPilot® | `weldpilot estpilot mtopilot` | `SIEDXMP` | `SIEDXMP` | `SI....P` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 39 | Isometrics list | 19 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot® | `mtopilot estpilot teampilot weldpilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 40 | ITP templates | 126 | WeldPilot® | `weldpilot` | `SIED...` | `.......` | `.......` | `.......` | `.......` | `.......` | `.......` |
| 41 | ITPs | 101 | CivilPilot® | `civilpilot` | `SIED...` | `.......` | `.......` | `.......` | `.......` | `.......` | `SIED...` |
| 42 | ITPs | 120 | WeldPilot® | `weldpilot` | `SIED...` | `.......` | `SIED...` | `.......` | `.......` | `.......` | `SIED...` |
| 43 | Laydowns materials | 88 | MTOPilot® | `mtopilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `SIE.X..` | `SIEDX..` | `SIEDX..` |
| 44 | Management Dashoard | 93 | (Add dialog: none, shows "-"; Edit dialog: "Management Dashboard", letter D) | `dashboard` | `SIED...` | `SIED...` | `.......` | `S......` | `SIED...` | `SIED...` | `SIED...` |
| 45 | ManagementHub | 123 | ManagementHub (Add dialog); ManagementHub + "Management Dashboard" (Edit dialog) | `dashboardhub` | `SIED...` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIED...` |
| 46 | Manpower overview | 58 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 47 | Material database | 6 | MTOPilot® | `mtopilot` | `SIED.M.` | `SIED.M.` | `S......` | `S......` | `SIE..M.` | `SIE..M.` | `SIED.M.` |
| 48 | Material inventory | 16 | MTOPilot® | `mtopilot` | `SI.DXM.` | `SI.DXM.` | `S......` | `S......` | `SI.DXM.` | `SI.DXM.` | `SI.DXM.` |
| 49 | Material laydowns | 25 | MTOPilot® | `mtopilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `S...X..` | `SIE.X..` | `SIEDX..` |
| 50 | Material list | 78 | MTOPilot® | `mtopilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 51 | Material order | 13 | MTOPilot® | `mtopilot` | `S.....P` | `S.....P` | `S......` | `S......` | `S.....P` | `S.....P` | `S.....P` |
| 52 | Material order archive | 17 | MTOPilot® | `mtopilot` | `S.....P` | `S.....P` | `S......` | `S......` | `S......` | `S.....P` | `S.....P` |
| 53 | Material part | 7 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `S...X..` | `SIE.X..` | `SIEDX..` |
| 54 | Material receive | 15 | MTOPilot® | `mtopilot` | `SI..X..` | `SI..X..` | `S......` | `S......` | `SI..X..` | `SI..X..` | `SI..X..` |
| 55 | Material Supplier | 12 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `SIE.X..` | `SIEDX..` | `SIEDX..` |
| 56 | Materials in Isometric | 70 | MTOPilot® | `mtopilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 57 | My templates | 118 | CivilPilot® | `civilpilot` | `S......` | `.......` | `.......` | `.......` | `.......` | `S......` | `S......` |
| 58 | Narrowcast settings | 124 | ManagementHub (Add dialog); ManagementHub + "Management Dashboard" (Edit dialog) | `dashboardhub` | `SIED...` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIED...` |
| 59 | NDT Archive | 76 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIE.X.P` | `S......` | `SIE.XMP` | `SIEDXMP` | `SIEDXMP` |
| 60 | NDT Archive - Pre | 94 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `.......` | `S......` | `SIE.XMP` | `SIEDXMP` | `SIEDXMP` |
| 61 | NDT Batch Import (+ info icon: Import = Upload/Commit) | 121 | WeldPilot® | `weldpilot` | `S....M.` | `.......` | `S....M.` | `.......` | `.......` | `.......` | `S....M.` |
| 62 | NDT locations | 47 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 63 | NDT process | 46 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 64 | NDT Process Groups | 79 | WeldPilot® | `weldpilot` | `SIEDXM.` | `SIEDXM.` | `SIE.XM.` | `S......` | `S...XM.` | `S......` | `SIEDXM.` |
| 65 | NDT Request Archive | 66 | WeldPilot® | `weldpilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 66 | NDT requests manager | 50 | WeldPilot® | `weldpilot` | `S.E...P` | `S.E...P` | `S.....P` | `S......` | `S.....P` | `S.....P` | `S.E...P` |
| 67 | Operation phases | 11 | MTOPilot® | `mtopilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 68 | Overview | 36 | WeldPilot® | `weldpilot` | `S.E....` | `S.E....` | `S.E....` | `S......` | `S.E....` | `S.E....` | `S.E....` |
| 69 | Pending order | 14 | MTOPilot® | `mtopilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 70 | Personnel | 69 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 71 | Pick list archive | 21 | MTOPilot® | `mtopilot` | `S...X.P` | `S...X.P` | `S......` | `S......` | `S...X.P` | `S...X.P` | `S...X.P` |
| 72 | Pick list Export | 83 | MTOPilot® | `mtopilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 73 | Plan overview | 57 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 74 | PQR | 98 | (none, shows "-") | `weldpilo` | `SIEDXMP` | `.......` | `.......` | `S......` | `.......` | `SIEDXMP` | `SIEDXMP` |
| 75 | Prefab/Field release (+ info icon: Show = view. Insert = invite. Edit = compose. Delete = remove or withdraw. Print = PDF. Signing uses Show.) | 125 | WeldPilot® | `weldpilot` | `SIED..P` | `SIED..P` | `SIED..P` | `SIED..P` | `SIED..P` | `SIED..P` | `SIED..P` |
| 76 | Profiles | 53 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot® | `mtopilot weldpilot estpilot teampilot toolpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIE.X..` | `SIEDX..` |
| 77 | Project site Factors | 31 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIEDX..` | `SIEDX..` |
| 78 | Project sites | 4 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot® | `mtopilot estpilot teampilot weldpilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `S...XMP` | `SIEDXMP` | `SIEDXMP` |
| 79 | Projects | 5 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot® | `mtopilot mtopilot estpilot teampilot weldpilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 80 | Punch List Management | 110 | CivilPilot® | `civilpilot` | `SIEDX..` | `.......` | `.......` | `.......` | `.......` | `SIED...` | `SIEDX..` |
| 81 | Punchlists | 77 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIEDX.P` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 82 | PWHT archive | 97 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `.......` | `S......` | `.......` | `SIE.XMP` | `SIEDXMP` |
| 83 | PWHT locations | 49 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `SIEDX..` | `SIEDX..` | `SIEDX..` |
| 84 | PWHT process | 48 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 85 | PWHT requests | 65 | WeldPilot® | `weldpilot` | `S.....P` | `S.....P` | `S.....P` | `S......` | `S.....P` | `S.....P` | `S.....P` |
| 86 | PWHT Requests Archive | 67 | WeldPilot® | `weldpilot` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` | `S......` |
| 87 | QA/QC engineers | 73 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIE.X.P` | `S......` | `S...XMP` | `SIEDXMP` | `SIEDXMP` |
| 88 | Release field | 89 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SI..XMP` | `SI..XMP` | `SI..XMP` | `S......` | `S...XMP` | `SI..XMP` | `SI..XMP` |
| 89 | Release prefab | 86 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SI..XMP` | `SI..XMP` | `SI..XMP` | `S......` | `S...XMP` | `SI..XMP` | `SI..XMP` |
| 90 | Rented articles | 62 | ToolPilot® | `toolpilot` | `S...X..` | `S...X..` | `.......` | `S......` | `.......` | `.......` | `S...X..` |
| 91 | Roles | 39 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `S...X..` | `SIE.X..` | `SIEDX..` |
| 92 | Service companies | 22 | MTOPilot® | `mtopilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `SI..X..` | `SIEDX..` | `SIEDX..` |
| 93 | Service request | 23 | MTOPilot® | `mtopilot` | `SI.....` | `SI.....` | `S......` | `S......` | `SI.....` | `SI.....` | `SI.....` |
| 94 | Service request - Materials | 80 | MTOPilot® | `mtopilot` | `SI.....` | `SI.....` | `S......` | `S......` | `SI.....` | `SI.....` | `SI.....` |
| 95 | Service requests - Archive | 24 | MTOPilot® | `mtopilot` | `S.....P` | `S.....P` | `S......` | `S......` | `S.....P` | `S.....P` | `S.....P` |
| 96 | Signatures | 96 | WeldPilot®, CivilPilot® | `weldpilot,civilpilot` | `SI.....` | `SI.....` | `.......` | `S......` | `.......` | `SI.....` | `SI.....` |
| 97 | Spools | 10 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `S...X..` | `S.E....` | `SIEDX..` |
| 98 | Storehouse order detail | 111 | MTOPilot® | `mtopilot` | `S.E...P` | `S.E...P` | `.......` | `.......` | `.......` | `.......` | `S.E...P` |
| 99 | Storehouse orders | 112 | MTOPilot® | `mtopilot` | `SIED..P` | `SIED..P` | `.......` | `.......` | `.......` | `.......` | `SIED..P` |
| 100 | Storehouse transactions | 113 | MTOPilot® | `mtopilot` | `S.....P` | `S.....P` | `.......` | `.......` | `.......` | `.......` | `S.....P` |
| 101 | Storehouses | 75 | MTOPilot®, ESTPilot®, WeldPilot® | `weldpilot mtopilot estpilot` | `SIEDXMP` | `SIEDXMP` | `S......` | `S......` | `.......` | `.......` | `SIEDXMP` |
| 102 | Tariffs | 33 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIEDX..` | `SIEDX..` |
| 103 | Tasks | 56 | TeamPilot® | `teampilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 104 | Test systems | 87 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `.......` | `S......` | `SIEDXMP` | `SIE.XMP` | `SIEDXMP` |
| 105 | Training (+ info icon: Show = follow guided training) | 122 | Training | `training` | `S......` | `.......` | `.......` | `.......` | `.......` | `.......` | `S......` |
| 106 | Transfer list | 60 | ToolPilot® | `toolpilot` | `S...X..` | `S...X..` | `.......` | `S......` | `.......` | `....X..` | `S...X..` |
| 107 | Type of material | 8 | MTOPilot®, WeldPilot® | `mtopilot weldpilot` | `SIEDX..` | `SIEDX..` | `SI.....` | `S......` | `S...X..` | `SIE.X..` | `SIEDX..` |
| 108 | Unit Rates | 28 | ESTPilot® | `estpilot` | `SIED...` | `SIED...` | `.......` | `S......` | `.......` | `SIE....` | `SIED...` |
| 109 | Unit Rates Groups | 29 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIE.X..` | `SIEDX..` |
| 110 | Unit Rates Subgroups | 30 | ESTPilot® | `estpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIE.X..` | `SIEDX..` |
| 111 | UOMs | 9 | MTOPilot®, ESTPilot® | `mtopilot estpilot` | `SIEDX..` | `SIEDX..` | `S......` | `S......` | `.......` | `S...X..` | `SIEDX..` |
| 112 | Users accounts | 26 | MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot® | `mtopilot estpilot teampilot weldpilot toolpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `SIEDX..` | `SIEDX..` |
| 113 | Visual inspection | 116 | WeldPilot® | `weldpilot` | `SIED..P` | `SIED..P` | `SIED..P` | `.......` | `SIED..P` | `SIED..P` | `SIED..P` |
| 114 | Warehouses list | 59 | ToolPilot® | `toolpilot` | `SIEDX..` | `SIEDX..` | `.......` | `S......` | `.......` | `.......` | `SIEDX..` |
| 115 | Weld diameters | 45 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `S......` | `SIEDX..` |
| 116 | Weld type | 44 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 117 | Welder card settings | 95 | WeldPilot® | `weldpilot` | `SIED...` | `SIED...` | `.......` | `S......` | `.......` | `SIED...` | `SIED...` |
| 118 | Welders | 68 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIE.X..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 119 | Welding process | 43 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIEDX..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 120 | Welding wires | 99 | MTOPilot®, WeldPilot® | `weldpilot mtopilot` | `SIED...` | `.......` | `SIED...` | `.......` | `.......` | `SIED...` | `SIED...` |
| 121 | Welds | 63 | WeldPilot® | `weldpilot` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` | `S......` | `SIEDXMP` | `SIEDXMP` | `SIEDXMP` |
| 122 | WPS Designer (info icon only in the Edit dialog: Import = Approve) | 114 | WeldPilot® | `weldpilot` | `SIEDXM.` | `SIEDXM.` | `SIEDXM.` | `.......` | `.......` | `SIEDXM.` | `SIEDXM.` |
| 123 | WPS methods | 42 | WeldPilot® | `weldpilot` | `SIEDX..` | `SIEDX..` | `SIEDX..` | `S......` | `S...X..` | `SIEDX..` | `SIEDX..` |
| 124 | WPS Source Data | 115 | WeldPilot® | `weldpilot` | `SIED...` | `SIED...` | `SIED...` | `.......` | `.......` | `SIED...` | `SIED...` |

Totals: 124 area rows, 536 checkboxes offered in all. Checked boxes per profile (from the six Edit captures): id 18 (person A) 461; id 12 QAQC 01 194; id 19 External 101; id 15 Workpreparator 01 228; id 5 Full rights 410; id 17 WPM 532. Checked per action column (Show, Insert, Edit, Delete, Export, Import, Print): id 18: 103, 81, 73, 70, 69, 28, 37; id 12: 70, 33, 29, 11, 25, 9, 17; id 19: 97, 1, 1, 1, 0, 0, 1; id 15: 70, 30, 24, 12, 44, 20, 28; id 5: 104, 75, 69, 44, 58, 26, 34; id 17: 123, 93, 87, 81, 76, 30, 42.

Odd values in the reference's markup (copied as they are): row 74 "PQR" has `data-apps="weldpilo"` (no final "t") and no badge, so it is hidden for every Filter app value except "Alle apps"; row 96 "Signatures" has `data-apps="weldpilot,civilpilot"` (one attribute, comma-separated); row 79 "Projects" lists `mtopilot` twice in `data-apps`. Row 44 "Management Dashoard" has `data-apps="dashboard"`, which no Filter app option matches. Info icons next to names: row 61 "NDT Batch Import" (text "Import = Upload/Commit"), row 75 "Prefab/Field release" (text: Show = view, Insert = invite, Edit = compose, Delete = remove or withdraw, Print = PDF, signing uses Show), row 105 "Training" (text: Show = follow guided training).

## Rules found in the page's JavaScript
All from the shared page script (the profile handlers are in the large inline script, which is complete in `weld__start__dashboard.txt`; this capture adds only the lines named in the first and last bullets).
- `.open-editProfile` click (this capture): reads the row's `data-id`, writes the secure value into `#bookIdEditProfileSecure`, then requests `/core/ajax/editProfile.php?id=<id>` (the capture of the request shows the extra parameter `action=showroom`) and puts the answer in `#contentEditProfile`. Method not visible in the script; the request log shows GET.
- `.open-deleteProfile` click (this capture): writes the row's id into `#bookIdDeleteProfile` and the secure value into `#bookIdDeleteProfileSecure`.
- `.profileSelectAll` change: the box's `data-target` names a column class (`checkboxShow`, `checkboxInsert`, `checkboxEdit`, `checkboxDelete`, `checkboxExport`, `checkboxImport`, `checkboxPrint`); every checkbox of that class in the currently visible rows (`tr[data-apps]:visible`) is set to the same checked state as the select-all box. Rows hidden by the filter are not touched.
- `.profile-app-filter` change: for each row with `data-apps`, the row is shown when the select value is empty or when `data-apps` contains the value as a substring; otherwise it is hidden. With an app chosen, all header rows are hidden except the first; with "Alle apps" each header row is shown only if at least one visible row follows it before the next header. After every change all select-all checkboxes are unchecked.
- Form submit (any `form` containing `.profile-rights-table`): the checkboxes named `<action>_<id>` are collected; for each checked box the pair is stored as `rights[<id>][<action>] = 1`; the `name` attribute is removed from all those checkboxes; a hidden input `profileRightsJson` with the JSON of `rights` is appended; the submit button's own name (e.g. `addProfile`, `editProfile`, `duplicateProfile`) is added as a hidden input when missing; then the form is submitted once (a flag prevents a loop). So the server receives the rights as one JSON field, not as 536 separate fields.
- Validation: only the HTML `required` attributes on Profile and Description; no script messages found.
- Requests of the page itself: `GET /core/ajax/ajax-notifications.php?action=count_unread` on load; `GET /core/ajax/editProfile.php?id=<id>&action=showroom` per Edit click. The list needs no request (client-side table).

## Sample data
Six rows in the sandbox ("Showing 1 to 6 of 6 entries"), in the default order (Description ascending). The name of profile 18 is a person's name and is shown here as "person A".

| Name | Description | Profile id (from the row buttons) | Options |
|---|---|---|---|
| person A | Admin | 18 | pencil, trash |
| QAQC 01 | Highest rights for QAQC | 12 | pencil, trash |
| External | Only review | 19 | pencil, trash |
| Workpreparator 01 | Standard profile for workpreparator | 15 | pencil, trash |
| Full rights | This profile has full rights (Almost as admin) | 5 | pencil, trash |
| WPM | Work Preparation Manager | 17 | pencil, trash |

The checked boxes of each profile are in the matrix above.

## Not in the capture
- Nothing was submitted: the result of Add, Update, Duplicate profile and Delete (messages, redirects, what the server does with `profileRightsJson`, `secureCode`, `duplicateName`) is not shown. Whether "Duplicate profile" with an empty "New profile name" is accepted is not shown.
- How the `secureCode` value is computed (the script lines were already in an earlier capture and are not repeated here).
- Whether the list can be sorted by clicking headers is implied by `sort:true` on all three columns; no sorted state other than the default was captured.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#addPqr`, `#addFlange`, `#deleteFlange`, `#importFlanges`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`, the unnamed dialogs for service-request and punch handling (Upload / Close buttons), and the handheld menu entries "Scan weld", "Scan flange QR label", "Add punch".
