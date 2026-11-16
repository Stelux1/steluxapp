# Weld Pilot → Welding data → Projects

Source: `weld__welding__projects.txt`, `weld__welding__projects-deleted.txt`, `weld__welding__projects-import.txt`, `weld__welding__project-isometrics.txt` (dialogs that the first capture points to with `SAME-AS` were read in `weld__start__dashboard.txt`, `weld__welding__ndt-pwht-manager.txt` and `weld__iso__0001.txt`) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=project-sites&id=1&view=projects` (deleted list: `/weldpilot/index.php?page=project-sites&id=1&view=projects&showdeleted=ok`; import page: `/weldpilot/index.php?page=projects-import&mode=full&id=1&view=projects`; isometric list of one project: `/weldpilot/index.php?page=isometrics&project=1`).
State of the page for the observing account: normal (all four screens open and show data).

The side menu entry is "Projects" (group "Welding data"), link `/weldpilot/index.php?page=project-sites&id=1&view=projects`. The screens captured for this menu item are: (A) the project list, (B) the list of deleted projects, (C) the "Import all project data" page, (D) the "Iso overview" of one project, reached by the open-folder button of a project row. There is no capture made after a click for this page (`ls raw | grep '^weld__welding__projects__'` is empty), and the browser-pass notes in `raw/_interactive/*.md` do not mention this page. So every dialog body that the server fills after a click is listed under "Not in the capture".

---

# A. Project list

## Page

- Browser title: "Project sites - WeldPilot®".
- Top bar breadcrumb: one crumb "Projects" → `index.php?page=project-sites&id=1`. No tabs.
- Buttons in the top bar, in order:
  - "Export" (dark, Excel icon) → link `../mtopilot/export-projects-iso.php?id=1`.
  - "Options" (blue, chevron; dropdown, class `buttonDelete`) with four entries: "Delete selected projects" → dialog `#deleteSelectedProjects` (the link carries `data-id="10"`); "Edit projects (Mass edit)" → dialog `#editProjectsMass`; "Generate multiple WP books" → dialog `#pdfMainReportLanguageForProjectsMultiple`; "Show deleted work packages" → link `index.php?page=project-sites&id=1&view=projects&showdeleted=ok` (screen B).
  - "Import" (blue, import icon; dropdown): the capture shows one entry, "Import all WP data" (class `buttonImport`) → link `index.php?page=projects-import&mode=full&id=1&view=projects` (screen C). Other entries of this menu are not in the capture (the capture compresses repeated lines).
  - "Add project" (plus icon, class `buttonInsert`, full-width block button) → dialog `#addProject`.
- Panel heading: list icon + "Projects", followed by two small icon-only buttons: a "+" → `#addProject` and an import icon (class `buttonImport`) → dialog `#importProjects`.
- Header language links (Nederlands, English, Deutsch, Français) append `lang=xx&page=project-sites&id=1&project=&projectSite=`.

## List

Table `#datatableProjects`, server side (DataTables `serverSide: true`, `processing`), ajax `/core/ajax/projects.php?deleted=0&id=1` (the capture's request list shows draws 1 to 8, each with the standard DataTables parameters `draw`, `columns[i][data|name|searchable|orderable|search]`, plus `order`, `start`, `length`, `search`).

- Columns in order (all visible): "Intern prj. no." (bold, sortable), "Extern prj. no." (sortable), "Project description" (sortable), "Contact name" (sortable), "Authority" (sortable), "Status" (sortable), "Options" (not sortable, class `wsapps-col-project-options`), and a last column that holds the select-all checkbox `#checkAll` (not sortable). The Authority, Status and Options headers carry class `hidden-xs`. The table is `responsive`.
- Data keys: columns 0 to 5 map to the data indexes 0 to 5; the project id is data index 6 (used by the row buttons and checkboxes; it is not a visible column).
- Default sort: column index 5 (Status) ascending. Page length options 10, 20, 50, 100, 500; default 20 ("Show … entries").
- Search: one global box, placeholder "Search", with a clear (x) button. No per-column search inputs, no other filters.
- Export / print buttons above the table: none drawn (the dashboard script that the page shares configures TableTools csv, xls, pdf, but the capture shows no buttons). The "Export" link in the top bar is the export.
- Texts: empty "No data available in table"; info "Showing _START_ to _END_ of _TOTAL_ entries"; no match "No matching records found". The capture shows "Showing 1 to 1 of 1 entries (filtered from 76 total entries)".
- Row options (column "Options"), in order:
  1. folder-open button (hidden on extra-small screens, class `buttonOpen`) → goes to `index.php?page=isometrics&project=<project id>` (screen D).
  2. print icon with dropdown, heading "Choose report:" then two entries: "Certification index" → dialog `#pdfCertificateIndexLanguage`; "Project book" → dialog `#pdfMainReportLanguageForProjects` (both entries have `title="Certification index"` in the markup).
  3. book icon (class `open-punchlist`) → dialog `#punchlist`.
  4. pencil (class `open-editProject`) → dialog `#editProject`.
  5. trash (red, class `open-deleteProject`) → dialog `#deleteProject`.
- Row checkbox (last column, class `checkbox`; its value is set to the project id). Header checkbox `#checkAll` ticks or unticks every row checkbox of the table on the current page.
- Bulk actions: the "Options" menu in the top bar (see Page) works on the ticked rows.

## Dialogs

### Add project (`#addProject`) — opened by the "Add project" button, or the "+" in the panel heading

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Intern prj. no. | `internnumber` | text | yes |  |  |
| 2 | Extern prj. no. | `externnumber` | text | no |  |  |
| 3 | Contact name | `contact` | text | no |  |  |
| 4 | Phone | `phone` | text | no |  |  |
| 5 | Authority | `authority` | text | no |  |  |
| 6 | Project description | `description` | text | no |  |  |
| 7 | CivilPilot | `enable_civilpilot` | checkbox | no | unchecked | value `1` |
| 8 | WeldPilot | `enable_weldpilot` | checkbox | no | checked | value `1` |
| 9 | MTOPilot | `enable_mtopilot` | checkbox | no | checked | value `1` |
| 10 | ESTPilot | `enable_estpilot` | checkbox | no | checked | value `1` |

Buttons: "Add" (`name=addProject`, submit), "Cancel". Help text under the visibility boxes: choose in which applications the project is visible. Form method post, large dialog.

### Edit project (`#editProject`) — opened by the pencil in a row

The dialog frame is in the page; the form body is loaded after the click (see "Not in the capture"). What the capture shows:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `secureCode` | hidden | no | (empty; filled by the page script) | id `bookIdEditProjectSecure`, in the footer |

Buttons: "Update" (`name=editProject`, submit, warning), "Cancel".

### Delete project (`#deleteProject`) — opened by the trash icon in a row

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | — | `secureCode` | hidden | no |  |  |

Body text: "Are you sure?". Buttons: "Delete" (`name=deleteProject`, submit, trash icon), "Cancel". The two hidden fields are filled by the page script when the trash icon is clicked (see Rules).

### Delete selected projects (`#deleteSelectedProjects`) — opened by "Options" → "Delete selected projects"

(Dialog body read in `weld__start__dashboard.txt`, same dialog.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |

Body text: you are going to delete the selected projects from this project; "Are you sure?"; a note that only unused (blank) projects can be deleted. Buttons: "Delete" (`name=deleteSelectedProjects`), "Cancel". The hidden `deleteID` is a comma-separated list of the ticked project ids (see Rules).

### Edit project (Mass edit) (`#editProjectsMass`) — opened by "Options" → "Edit projects (Mass edit)"

(Read in `weld__start__dashboard.txt`.) Form is multipart.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | Intern prj. no. | `internnumber` | text | no |  |  |
| 3 | Extern prj. no. | `externnumber` | text | no |  |  |
| 4 | Contact name | `contact` | text | no |  |  |
| 5 | Phone | `phone` | text | no |  |  |
| 6 | Authority | `authority` | text | no |  |  |
| 7 | Project description | `description` | text | no |  |  |
| 8 | CivilPilot | `enable_civilpilot` | checkbox | no | checked | value `1` |
| 9 | WeldPilot | `enable_weldpilot` | checkbox | no | checked | value `1` |
| 10 | MTOPilot | `enable_mtopilot` | checkbox | no | checked | value `1` |
| 11 | ESTPilot | `enable_estpilot` | checkbox | no | checked | value `1` |

Help text: checked applications make the project visible, unchecked ones hide it in that application. Buttons: "Update" (`name=editProjectMass`, submit), "Cancel". The capture shows no "leave unchanged" option for the four text fields or for the visibility boxes; all four boxes are checked by default.

### Project book (`#pdfMainReportLanguageForProjects`) — opened by "Choose report:" → "Project book" in a row

(Read in `weld__start__dashboard.txt`.) Form: `GET /core/pdf/iso-book.php`, opens in a new tab (`target=_blank`). A container `#contentPdfProjectBook` sits at the top of the form and is filled after the click by `pdfCertificateIndexAndLISL.php` (its content is not in the capture). The checkboxes below are in the static dialog.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Include Task sheet | `task` | checkbox | no | unchecked | value `ok` |
| 2 | Include ITP documents | `itp` | checkbox | no | unchecked | value `ok` |
| 3 | Include ITP 2 documents | `itp2` | checkbox | no | unchecked | value `ok` |
| 4 | Include Isometric | `isometric` | checkbox | no | unchecked | value `ok` |
| 5 | Include NDT Pre | `ndtPre` | checkbox | no | unchecked | value `ok` |
| 6 | Include NDT | `ndt` | checkbox | no | unchecked | value `ok` |
| 7 | Include PWHT | `pwht` | checkbox | no | unchecked | value `ok` |
| 8 | Include LISL | `lislold` | checkbox | no | unchecked | value `ok` |
| 9 | Include LISL V2 | `lisloldSignature` | checkbox | no | unchecked | value `ok` |
| 10 | Include LISL (A3) | `lisla3` | checkbox | no | unchecked | value `ok` |
| 11 | Weld record | `lisloldV2` | checkbox | no | unchecked | value `ok` |
| 12 | Include LISL [GU] | `lislnew` | checkbox | no | unchecked | value `ok` |
| 13 | Include LISL [MV] | `lislmv` | checkbox | no | unchecked | value `ok` |
| 14 | Include LISL [ISS] | `lisliss` | checkbox | no | unchecked | value `ok` |
| 15 | Include blank LISL | `lisl` | checkbox | no | unchecked | value `ok` |
| 16 | Include Pick Lists | `picklist` | checkbox | no | unchecked | value `ok` |
| 17 | Include Punch list | `punchlist` | checkbox | no | unchecked | value `ok` |
| 18 | Include Punch list (blank) | `punchlistblank` | checkbox | no | unchecked | value `ok` |
| 19 | Include Flange report | `flangereport` | checkbox | no | unchecked | value `ok` |
| 20 | Include Flange labels | `flangelabels` | checkbox | no | unchecked | value `ok` |
| 21 | Include Certificate Index | `certificateindex` | checkbox | no | unchecked | value `ok` |
| 22 | Include PQR | `pqr` | checkbox | no | unchecked | value `ok` |
| 23 | Include WPS | `wps` | checkbox | no | unchecked | value `ok` |
| 24 | Include NDT Process documents | `ndtprocess` | checkbox | no | unchecked | value `ok` |
| 25 | Include welder's summary lists | `summary` | checkbox | no | unchecked | value `ok` |
| 26 | Include welder's certificates | `weldercerts` | checkbox | no | unchecked | value `ok` |
| 27 | Include Visual reports | `vt` | checkbox | no | unchecked | value `ok` |
| 28 | Include Prefab release document | `releaseshop` | checkbox | no | unchecked | value `ok` |
| 29 | Include Field release document | `releasefield` | checkbox | no | unchecked | value `ok` |
| 30 | Include material certificates | `certificates` | checkbox | no | unchecked | value `ok`; hidden in the page |
| 31 | MTO Report (Shop) | `mto[]` | checkbox | no | unchecked | value `1` |
| 32 | MTO Report (Field) | `mto[]` | checkbox | no | unchecked | value `2` |
| 33 | MTO Report (Hydrotest field) | `mto[]` | checkbox | no | unchecked | value `3` |
| 34 | MTO Report (Support Field) | `mto[]` | checkbox | no | unchecked | value `4` |
| 35 | MTO Report (Valves) | `mto[]` | checkbox | no | unchecked | value `5` |
| 36 | MTO Report (Bernecker) | `mto[]` | checkbox | no | unchecked | value `7` |
| 37 | MTO Report (Support Shop) | `mto[]` | checkbox | no | unchecked | value `8` |
| 38 | MTO Report (Support WS) | `mto[]` | checkbox | no | unchecked | value `9` |
| 39 | MTO Report (Support FW) | `mto[]` | checkbox | no | unchecked | value `10` |
| 40 | MTO Report (Rilco) | `mto[]` | checkbox | no | unchecked | value `11` |
| 41 | MTO Report (Shop missing) | `mto[]` | checkbox | no | unchecked | value `14` |
| 42 | MTO Report (Revision mat) | `mto[]` | checkbox | no | unchecked | value `15` |
| 43 | MTO Report (Shop IYM) | `mto[]` | checkbox | no | unchecked | value `16` |
| 44 | MTO Report (Field IYM) | `mto[]` | checkbox | no | unchecked | value `17` |
| 45 | Flange tightening | `custom[]` | checkbox | no | unchecked | value `2` |
| 46 | Support index | `custom[]` | checkbox | no | unchecked | value `5` |
| 47 | 3D snippet | `custom[]` | checkbox | no | unchecked | value `6` |
| 48 | Supports | `custom[]` | checkbox | no | unchecked | value `7` |
| 49 | Piping layout | `custom[]` | checkbox | no | unchecked | value `9` |
| 50 | Prefab signed off | `custom[]` | checkbox | no | unchecked | value `11` |
| 51 | Field signed off | `custom[]` | checkbox | no | unchecked | value `16` |
| 52 | Info Documents | `custom[]` | checkbox | no | unchecked | value `22` |
| 53 | CUT LIST | `custom[]` | checkbox | no | unchecked | value `44` |
| 54 | Support SHOP | `custom[]` | checkbox | no | unchecked | value `45` |
| 55 | Support FIELD | `custom[]` | checkbox | no | unchecked | value `46` |
| 56 | Ready for work | `custom[]` | checkbox | no | unchecked | value `64` |
| 57 | 101 - Isometric rev | `custom[]` | checkbox | no | unchecked | value `65` |
| 58 | 102 - MTO rev | `custom[]` | checkbox | no | unchecked | value `66` |
| 59 | 104 - Support rev | `custom[]` | checkbox | no | unchecked | value `67` |
| 60 | 105 - 3D rev | `custom[]` | checkbox | no | unchecked | value `68` |
| 61 | 103 - MTO SUPPORT rev | `custom[]` | checkbox | no | unchecked | value `69` |
| 62 | 106 - CUT LISt rev | `custom[]` | checkbox | no | unchecked | value `70` |
| 63 | 107 - Blank LISL rev | `custom[]` | checkbox | no | unchecked | value `71` |
| 64 | 108 - Isometric pre-fab | `custom[]` | checkbox | no | unchecked | value `72` |
| 65 | 2-200-AS PREFABRICATED | `custom[]` | checkbox | no | unchecked | value `73` |

A sub-heading "Custom docs" sits before the `custom[]` boxes. Buttons: "Go" (`name=go`, submit), "Cancel". The box "Include material certificates" is inside a hidden container (`col-md-12`, hidden).

### Project book (several projects) (`#pdfMainReportLanguageForProjectsMultiple`) — opened by "Options" → "Generate multiple WP books"

(Read in `weld__start__dashboard.txt`.) Same form target `GET /core/pdf/iso-book.php`, `target=_blank`. Same container `#contentPdfProjectBook` at the top.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `project` | hidden | no |  |  |
| 2 | — | `multiProject` | hidden | no | ok |  |
| 3 | Include Task sheet | `task` | checkbox | no | unchecked | value `ok` |
| 4 | Include ITP documents | `itp` | checkbox | no | unchecked | value `ok` |
| 5 | Include Isometric | `isometric` | checkbox | no | unchecked | value `ok` |
| 6 | Include NDT | `ndt` | checkbox | no | unchecked | value `ok` |
| 7 | Include PWHT | `pwht` | checkbox | no | unchecked | value `ok` |
| 8 | Include LISL | `lislold` | checkbox | no | unchecked | value `ok` |
| 9 | Weld record | `lisloldV2` | checkbox | no | unchecked | value `ok` |
| 10 | Include LISL (A3) | `lisla3` | checkbox | no | unchecked | value `ok` |
| 11 | Include LISL [GU] | `lislnew` | checkbox | no | unchecked | value `ok` |
| 12 | Include LISL [MV] | `lislmv` | checkbox | no | unchecked | value `ok` |
| 13 | Include LISL [ISS] | `lisliss` | checkbox | no | unchecked | value `ok` |
| 14 | Include blank LISL | `lisl` | checkbox | no | unchecked | value `ok` |
| 15 | Include Pick Lists | `picklist` | checkbox | no | unchecked | value `ok` |
| 16 | Include Punch list | `punchlist` | checkbox | no | unchecked | value `ok` |
| 17 | Include Punch list (blank) | `punchlistblank` | checkbox | no | unchecked | value `ok` |
| 18 | Include Flange report | `flangereport` | checkbox | no | unchecked | value `ok` |
| 19 | Include Flange labels | `flangelabels` | checkbox | no | unchecked | value `ok` |
| 20 | Include Certificate Index | `certificateindex` | checkbox | no | unchecked | value `ok` |
| 21 | Include PQR | `pqr` | checkbox | no | unchecked | value `ok` |
| 22 | Include WPS | `wps` | checkbox | no | unchecked | value `ok` |
| 23 | Include NDT Process documents | `ndtprocess` | checkbox | no | unchecked | value `ok` |
| 24 | Include welder's summary lists | `summary` | checkbox | no | unchecked | value `ok` |
| 25 | Include Visual reports | `vt` | checkbox | no | unchecked | value `ok` |
| 26 | Include Prefab release document | `releaseshop` | checkbox | no | unchecked | value `ok` |
| 27 | Include Field release document | `releasefield` | checkbox | no | unchecked | value `ok` |
| 28 | MTO Report (Shop) | `mto[]` | checkbox | no | unchecked | value `1` |
| 29 | MTO Report (Field) | `mto[]` | checkbox | no | unchecked | value `2` |
| 30 | MTO Report (Hydrotest field) | `mto[]` | checkbox | no | unchecked | value `3` |
| 31 | MTO Report (Support Field) | `mto[]` | checkbox | no | unchecked | value `4` |
| 32 | MTO Report (Valves) | `mto[]` | checkbox | no | unchecked | value `5` |
| 33 | MTO Report (Bernecker) | `mto[]` | checkbox | no | unchecked | value `7` |
| 34 | MTO Report (Support Shop) | `mto[]` | checkbox | no | unchecked | value `8` |
| 35 | MTO Report (Support WS) | `mto[]` | checkbox | no | unchecked | value `9` |
| 36 | MTO Report (Support FW) | `mto[]` | checkbox | no | unchecked | value `10` |
| 37 | MTO Report (Rilco) | `mto[]` | checkbox | no | unchecked | value `11` |
| 38 | MTO Report (Shop missing) | `mto[]` | checkbox | no | unchecked | value `14` |
| 39 | MTO Report (Revision mat) | `mto[]` | checkbox | no | unchecked | value `15` |
| 40 | MTO Report (Shop IYM) | `mto[]` | checkbox | no | unchecked | value `16` |
| 41 | MTO Report (Field IYM) | `mto[]` | checkbox | no | unchecked | value `17` |
| 42 | Flange tightening | `custom[]` | checkbox | no | unchecked | value `2` |
| 43 | Support index | `custom[]` | checkbox | no | unchecked | value `5` |
| 44 | 3D snippet | `custom[]` | checkbox | no | unchecked | value `6` |
| 45 | Supports | `custom[]` | checkbox | no | unchecked | value `7` |
| 46 | Piping layout | `custom[]` | checkbox | no | unchecked | value `9` |
| 47 | Prefab signed off | `custom[]` | checkbox | no | unchecked | value `11` |
| 48 | Field signed off | `custom[]` | checkbox | no | unchecked | value `16` |
| 49 | Info Documents | `custom[]` | checkbox | no | unchecked | value `22` |
| 50 | CUT LIST | `custom[]` | checkbox | no | unchecked | value `44` |
| 51 | Support SHOP | `custom[]` | checkbox | no | unchecked | value `45` |
| 52 | Support FIELD | `custom[]` | checkbox | no | unchecked | value `46` |
| 53 | Ready for work | `custom[]` | checkbox | no | unchecked | value `64` |
| 54 | 101 - Isometric rev | `custom[]` | checkbox | no | unchecked | value `65` |
| 55 | 102 - MTO rev | `custom[]` | checkbox | no | unchecked | value `66` |
| 56 | 104 - Support rev | `custom[]` | checkbox | no | unchecked | value `67` |
| 57 | 105 - 3D rev | `custom[]` | checkbox | no | unchecked | value `68` |
| 58 | 103 - MTO SUPPORT rev | `custom[]` | checkbox | no | unchecked | value `69` |
| 59 | 106 - CUT LISt rev | `custom[]` | checkbox | no | unchecked | value `70` |
| 60 | 107 - Blank LISL rev | `custom[]` | checkbox | no | unchecked | value `71` |
| 61 | 108 - Isometric pre-fab | `custom[]` | checkbox | no | unchecked | value `72` |
| 62 | 2-200-AS PREFABRICATED | `custom[]` | checkbox | no | unchecked | value `73` |

The hidden `project` field is `#checkedBoxesProjects` (comma-separated ids of the ticked projects). Compared with the single-project dialog this one has no boxes `itp2`, `ndtPre`, `lisloldSignature`, `weldercerts`, `certificates`. Buttons: "Go", "Cancel".

### Certification index (`#pdfCertificateIndexLanguage`) — opened by "Choose report:" → "Certification index" in a row

Frame only in the capture; the body is loaded after the click from `pdfCertificateIndexLanguage.php?time=…&id=<project id>&iso=project-sites` into `#contentPdfCertificateIndexLanguage`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| — | none in the static frame | | | | | |

Buttons: "Go" (`name=go`, submit), "Cancel".

### Punch lists (`#punchlist`) — opened by the book icon in a row

Frame only: title "Punch lists" (`#wpPunchModalTitle`), footer button "Close". The content is loaded after the click with `GET punchlist.php?id=<project id>&type=` and `action=showroom` (see "Not in the capture").

### Import projects (`#importProjects`) — opened by the import icon in the panel heading

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | CSV file | `file` | file | no |  | accepts `.xlsx` |
| 2 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 3 | Check if you want clean import (Current list will be deleted) | `clean` | checkbox | no | unchecked | value `ok` |

Other content: a "Templates" box with the link "Download Excel template" → `/core/export/templates/projects_import_template_xlsx.php`; hidden status alert `#projectsOnlyImportStatus`, hidden summary alert `#projectsOnlyImportSummary`, hidden preview table `#projectsOnlyImportTable` with header columns "#", "Actie", "InternalNo", "ExternalNo", "Description", "Customer", "Contact", "Phone", "Fax", "Authority". Buttons: "Import" (`#projectsOnlyImportCommitBtn`, green, hidden until a preview has importable rows), "Upload" (`#projectsOnlyImportUploadBtn`, submit), "Cancel". The file label says "CSV file" but the input accepts `.xlsx`. The visible text of the checkbox says that a clean import deletes the current list.

### Import all project data (`#importFull`) — opened by no visible control of the list (the top-bar entry "Import all WP data" is a link to screen C instead); the dialog exists in the page and has an "Open als pagina" link to screen C

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | CSV file | `file` | file | no |  | accepts `.xlsx` |
| 2 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 3 | With welds | `withWelds` | checkbox | no | unchecked | value `1` |
| 4 | Show all rows | (no name) | checkbox | no | unchecked | value `1` |

Other content: an info alert with notes (import can take long; about 2 minutes for 10.000 rows; do not stop the process). A "Templates" box with links: "Download Excel template (full)" → `/core/export/templates/projects_full_import_template_xlsx.php`; "Download Excel template (full + welds)" → `/core/export/templates/projects_full_import_with_welds_template_xlsx.php`; "Excel (current data)" → `/core/export/templates/projects_import_existing_xlsx.php?id=1`; "Example ZIP (2 isometrics)" → `/core/export/templates/projects_iso_pdf_training_zip.php`. Hidden: status alert `#projectsFullImportStatus`, summary alert `#projectsFullImportSummary`, tools `#piFullPreviewTools` (checkbox `#piFullShowAllRows` "Show all rows", text "Default: all errors plus 100 importable rows."), preview table `#projectsFullImportTable` with columns "#", "Actie", "ProjectNo", "Iso", "Rev", "Welds", "Dia", "MaterialNo", "UOM", "Qty". Footer: "Open als pagina" (link, left) → `index.php?page=projects-import&mode=full&id=1&view=projects`; "Import" (`#projectsFullImportCommitBtn`, hidden until importable rows exist); "Upload" (`#projectsFullImportUploadBtn`, submit); "Cancel".

### Automatically add IRN numbers (`#fillIRN`) — opened by no control of this list was found in the capture (the dialog is in the page)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `id` | hidden | no | 1 |  |

Body text "Are you sure?". Buttons: "Add IRN" (`name=fillIRN`, submit), "Cancel".

## Rules found in the page's JavaScript

Sources: the inline script of this page (project import), and the large shared page script (first complete in `weld__start__dashboard.txt`, repeated with `LINEDIFF` in this capture).

- Project table: DataTables with `serverSide`, `deferRender`, `pagingType: simple`, empty `sProcessing`, responsive; page length 20; lengthMenu 10/20/50/100/500. After creation it calls `wsappsSyncIsoProgress(1, 0, <table>)` (the function body is not in this capture).
- Row buttons: when a button in a row is clicked, the page sets its `data-id` to the project id taken from data index 6 of that row. The same is done for the print-menu links.
- Open folder: sets the window location to `index.php?page=isometrics&project=<id>`.
- Row checkbox change: the project id is written into the checkbox value, and the id is appended to (when ticked) or removed from (when unticked) the comma-separated value of the hidden fields `#checkedBoxes`, `#checkedBoxesM`, `#checkedBoxesMass`, `#checkedBoxesProjects`, `#tck2`. The select-all checkbox `#checkAll` ticks every row checkbox of the project table (`tbody input.checkbox`) and triggers the same change handling; it is handled so that clicking it does not sort or reload the table.
- Edit: click on `.open-editProject` → `GET /core/ajax/editProject.php?id=<project id>` and the response fills the dialog; the hidden `secureCode` of the edit and delete dialogs is set to a fixed prefix + project id + the suffix `prj` (the prefix is a constant string in the script).
- Delete: click on `.open-deleteProject` → `#bookIdEdit` (`deleteID`) = project id; `#bookIdDeleteProjectSecure` (`secureCode`) = prefix + id + `prj`.
- Bring back: click on `.open-backProject` → `#bookIdBackProject` = id; `#bookIdBackProjectSecure` = prefix + id + `prj`.
- Project book: click on `.open-pdfMainReportLanguageForProjects` → `GET /core/ajax/pdfCertificateIndexAndLISL.php?id=<id>&time=<timestamp>`; the response goes into `#contentPdfProjectBook`.
- Certification index: click on `.open-pdfCertificateIndexLanguage` → `GET /core/ajax/pdfCertificateIndexLanguage.php?time=<timestamp>&id=<id>&iso=project-sites`; response into `#contentPdfCertificateIndexLanguage`.
- Punch list: click on `.open-punchlist` → `GET punchlist.php?id=<data-id>&type=<data-wp-type or empty>` with `action=showroom`; the response is loaded into the punch-list dialog.
- Project import (inline script of this page). Base URL for all requests: `/core/ajax/projectsImport/`.
  - On submit of `#projectsOnlyImportForm`: status "Uploaden en valideren..."; `upload.php` with the form data plus `mode=projectsOnly`; on success the returned `batchId` is kept, status "Upload klaar. Preview geladen.", and the preview is loaded.
  - On submit of `#projectsFullImportForm`: first `lookups.php` (GET, loaded once, gives the diameter list; error text "Kon lookups niet laden"), then `upload.php` with the form data plus `mode=full` (the `withWelds` box is part of the form data).
  - Preview loading: without "Show all rows" (full import only) `list.php` GET with `batchId`, `view=compact`, `okLimit=100`; with "Show all rows" (and always for the projects-only import) `list.php` GET with `batchId`, `limit=500`, `offset`, repeated page by page until all rows are loaded. Errors: "Kon batch niet laden".
  - Preview table of the projects-only import: per row the columns row number, an action select (options `import`, `skip`; a skipped row gets a faded style), then InternalNo (cell marked as error when the row has an `internalNo` error), ExternalNo, Description, Customer, Contact, Phone, Fax, Authority. The summary line reads "Rijen: <total> | Errors: <errors> | Importeerbaar nu: <importable>". The "Import" button is shown only when at least one row is importable.
  - Preview table of the full import: row number, action select (`import` / `skip`), ProjectNo, Iso (error cell with the error text as tooltip), Rev, Welds (start, plus " - end" when there is an end), Dia (a select from the lookups, first option value 0 "-- kies --", marked error or ok), MaterialNo, UOM, Qty. The summary adds " | Shown: <n> (all errors + <ok> importable)" in compact view or " | Shown: all <n> rows".
  - Changing the action select → `toggleRow.php` (POST) with `rowId`, `action`. Changing the Dia select → `updateCell.php` with `rowId`, `field=diameterIdOverride`, `value`. The Dia select turns into a select2 when focused.
  - "Import" click: needs a batch id (else "Geen batchId (upload eerst opnieuw)"); status "Commit import..."; `commit.php` with `batchId`; on success "Import voltooid.", toast "Projects imported" (projects-only) or "Projects data imported" (full), the dialog closes and the page reloads after 200 ms; on error the error text from the response (or "Commit faalde") is shown.
  - Upload error text: the response error, else the response text, else "Upload faalde".
- Other handlers present in the shared script and not specific to this screen are not repeated here.

## Sample data

- Rows returned: 1 of 76 ("Showing 1 to 1 of 1 entries (filtered from 76 total entries)"). The server reports 76 as the total and 1 as the shown count.

| Intern prj. no. | Extern prj. no. | Project description | Contact name | Authority | Status | Options | Checkbox |
|---|---|---|---|---|---|---|---|
| 20240101 | - | Template project | NN | Lloyds | 69.6% | folder-open, print menu (Certification index, Project book), punch list, edit, delete | unticked |

## Not in the capture

- Body of "Edit project" (loaded by `editProject.php?id=<id>` after the pencil click): its fields are not shown.
- Body of "Certification index" (`pdfCertificateIndexLanguage.php`) and the top of "Project book" (`pdfCertificateIndexAndLISL.php`), loaded after the print-menu clicks.
- Content of "Punch lists" (`punchlist.php`), opened by the book icon.
- The other entries of the "Import" dropdown, and the exact action of the "Options" menu items on submit (the post targets are only the submit button names).
- Rows beyond the first row; the project search dialog's body (`#searchProject`, filled by `searchProject.php`).
- Contents of the Excel templates and export files; what the "Status" percentage is computed from (the page calls `wsappsSyncIsoProgress` but the function is not in the capture).

---

# B. Deleted projects ("Projects (Deleted)")

Source: `weld__welding__projects-deleted.txt`. URL `/weldpilot/index.php?page=project-sites&id=1&view=projects&showdeleted=ok`. State: normal.

## Page

- Same browser title "Project sites - WeldPilot®". Breadcrumb crumb: "Projects (Deleted)" → `index.php?page=project-sites&id=1`.
- Top bar button: "Back to work packages" → `index.php?page=project-sites&id=1&view=projects`. The Export, Options, Import and Add buttons of the active list are not in this top bar.
- The panel heading still shows the title "Projects" with the "+" (→ `#addProject`) and import icon (→ `#importProjects`) buttons; the dialogs `#addProject`, `#editProject`, `#deleteProject`, `#backProject`, `#importProjects`, `#importFull`, `#pdfCertificateIndexLanguage` are present as in screen A (same content).

## List

Table `#datatableProjectsDel`, server side, ajax `/core/ajax/projects.php?deleted=1&id=1` (capture shows draws 1 to 8).

- Columns in order: "Intern prj. no.", "Extern prj. no.", "Project description", "Contact name", "Authority", "Status", "Options", and a last column with a select-all checkbox `#checkAll`. All are marked sortable in this table.
- Default sort: column index 7 ascending. Page length options 10, 20, 50, 100, 500; default 20. Global search "Search" with clear button. Texts as in screen A. The capture shows "Showing 1 to 2 of 2 entries (filtered from 76 total entries)".
- The "Options" column of the captured rows shows a plain number (2 and 3), and the last column holds one button: undo icon (class `open-backProject`) → dialog `#backProject`. No row checkbox is drawn in this table.
- Row action: undo → dialog "Bring back" (below).

## Dialogs

### Bring back (`#backProject`) — opened by the undo icon in a row

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | — | `secureCode` | hidden | no |  |  |

Body text "Are you sure?". Buttons: "Bring back" (`name=backProject`, submit, undo icon), "Cancel". On click of `.open-backProject` the page sets `#bookIdBackProject` (`deleteID`) to the project id and `#bookIdBackProjectSecure` (`secureCode`) to the fixed prefix + id + `prj`. The deleted table sets `data-id` of any clicked row button to the project id (data index 6).

## Rules found in the page's JavaScript

Table configuration: server side, simple paging, responsive, page length 20 (script `tableProjectsDel`, ajax `/core/ajax/projects.php?deleted=1&id=1`). The last column default content is the undo button. Everything else is the shared script described in screen A.

## Sample data

Rows returned: 2 of 76 ("Showing 1 to 2 of 2 entries (filtered from 76 total entries)").

| Intern prj. no. | Extern prj. no. | Project description | Contact name | Authority | Status | Options | last column |
|---|---|---|---|---|---|---|---|
| PR001 | - | Test project (person A) | - | - | 13.1% | 2 | undo button |
| SO0324000165 | - | WMD Assen-Lonerstraat | person A | - | 0.0% | 3 | undo button |

## Not in the capture

Nothing else on this screen; the row-level behaviour of the undo dialog on submit is not shown.

---

# C. Import all project data (page)

Source: `weld__welding__projects-import.txt`. URL `/weldpilot/index.php?page=projects-import&mode=full&id=1&view=projects`. Browser title "- WeldPilot®". State: normal.

## Page

- Breadcrumb: "Project" → `/weldpilot/index.php?page=project-sites&id=1&view=projects`, then "Import all project data" (`#`).
- Two panels: panel 1 "1 Import all project data" and panel 2 "2 ISO PDF Import 7 isometrics" (the "7 isometrics" text is a badge in the heading, shown as in the capture).
- Panel 1 has a collapsible help block "How to use Project Data Import" (collapsed by default) with five numbered steps. In short: download a template or the current data; fill one row per isometric from row 3 (row 1 explains the columns, row 2 repeats the labels of Edit project / Edit isometric; "Intern prj. no." and "Iso number" are required; ITP Shop / ITP Field use catalog ITP numbers; NoBo and PWHT are Yes or No; Type is Shop, Field or another name from the Type table; Component code (ISO progress) is 1 = pipe, 2 = supports, 3 = appendages; Test system, X Ray %, Price and the isometric memo are not imported); upload the file (tick "With welds" if weld ranges are included) and the system validates every row; review the preview (errors in red, by default all error rows plus 100 importable rows, "Show all rows" for the full list; the import still processes every row); then click "Import" (new projects and isometrics are created; existing isometrics keep their header values when the Excel cells are empty; existing welds are never updated; weld numbers are added only when Wt.Start / Wt.End are filled). A warning says not to close the browser during a long import (10.000+ rows).
- Panel 2 has a collapsible help block "How to use Isometric PDF Import" (collapsed): put the isometric PDFs in one ZIP, each file named like the isometric number; upload; the preview colours are green (matched), yellow (already has a PDF), red (not matched); click "Commit import" to link the matched PDFs.

## Forms

### Form `#projectsFullImportFormPage` (panel 1, multipart)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `withWelds` | hidden | no | 1 | always sent with value 1 on this page |
| 2 | Excel file * | `file` | file | yes | | accepts `.xlsx` |

Buttons: "Upload" (`#piPageUploadBtn`, submit, upload icon), "Import" (`#piPageCommitBtn`, green, check icon, hidden until a preview has importable rows), "Cancel" (link back to the project list `/weldpilot/index.php?page=project-sites&id=1&view=projects`).

Templates box ("Templates:"): links "Excel (full + welds)" → `/core/export/templates/projects_full_import_with_welds_template_xlsx.php`; "Example ZIP (2 isometrics)" → `/core/export/templates/projects_iso_pdf_training_zip.php`; then a block "Excel (current data)" with the controls below and the button "Excel (current data)" (`#piExportExistingBtn`, primary, download icon) → `/core/export/templates/projects_import_existing_xlsx.php?id=1&project=0&materials=0` (the href is rewritten, see Rules). Help text under it: downloads the current projects and isometrics with the import columns filled; weld columns stay empty so existing welds are not recreated; add material rows; leave existing header values as they are.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 3 | — | (none; id `piExportProject`) | select | no | All projects on this site | 2 options: `0` → All projects on this site* ; `1` → 20240101 Template project |
| 4 | Include existing materials | (none; id `piExportMaterials`) | checkbox | no | unchecked | value `1` |
| 5 | Show all rows | (none; id `piShowAllRows`) | checkbox | no | unchecked | value `1`; inside hidden tools `#piPagePreviewTools` with text "Default: all errors plus 100 importable rows." |

Hidden result elements: status alert `#piPageStatus`, summary alert `#piPageSummary`, preview table `#piPageTable` with columns "#", "Actie", "ProjectNo", "Iso", "Rev", "Welds", "Dia", "MaterialNo", "Description", "LBS", "Dia1", "Dia2", "UOM", "Qty".

### Form `#isoPdfUploadForm` (panel 2, multipart)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | ZIP file with PDFs * | `zipfile` | file | yes | | accepts `.zip`; help text "Max upload size: 1024M" |
| 2 | Overwrite existing PDFs | `overwrite` | checkbox | no | unchecked | value `1`; id `isoPdfOverwrite` |

Buttons: "Upload" (submit, upload icon). Hidden: status alert `#isoPdfStatus`, button "Commit import" (`#isoPdfCommitBtn`, green, check icon), preview table `#isoPdfTable` with columns "#", "Status", "PDF Filename", "IsoNo", "Project", "Current PDF", summary `#isoPdfSummary`, block `#isoPdfUnmatched` titled "Unmatched files". A "Download" link "Example ZIP (2 isometrics)" → `/core/export/templates/projects_iso_pdf_training_zip.php` with the text "Matches the Excel template (PROJECT 001 / 002)." above the form.

## List

No data table on this page; two preview tables appear after an upload (see above).

## Rules found in the page's JavaScript

Inline script of this page; base URLs `/core/ajax/projectsImport/` (panel 1) and `/core/ajax/` (panel 2).

- Export link: on change of `#piExportProject` or `#piExportMaterials` the href of `#piExportExistingBtn` is rebuilt as `/core/export/templates/projects_import_existing_xlsx.php?id=1&project=<selected value or 0>&materials=<1 or 0>`; it also runs once on load.
- Upload (panel 1): on submit, only if a file is chosen, it loads the lookups (`lookups.php`; error "Could not load lookups"), hides the table, the Import button and the summary, shows "Uploading and parsing...", then posts the form data to `upload.php`; a response with `error` shows that text; on success it keeps `batchId`, shows "Upload klaar. Preview geladen." and loads the preview (same compact / all-rows logic as in screen A: `list.php` GET with `batchId`, `view=compact`, `okLimit=100`, or `limit=500` and `offset` pages; while loading pages it shows "Preview <loaded> / <filteredTotal>"). Error text "Could not load batch data" / "Upload failed".
- Preview rows: row number; action select (`import` / `skip`, change → `toggleRow.php` POST `rowId`, `action`); ProjectNo; Iso (error cell + tooltip when the row has an iso error); Rev; Welds (start, " - " end); Dia select from the lookups (change → `updateCell.php`, `rowId`, `field=diameterIdOverride`, `value`); MaterialNo; Description; LBS; Dia1; Dia2; UOM; Qty. Summary text "Rijen: <total> | Errors: <errors> | Importeerbaar: <importable>" plus the shown-rows part. "Import" shows only when importable > 0. Ticking "Show all rows" reloads the preview.
- Commit (panel 1): needs a batch ("Geen batch (upload eerst opnieuw)"); disables the button with "Importing...", status "Commit import...", `commit.php` with `batchId`; on `error` shows it and re-enables the button ("Import"); on success status "Import completed. Reloading page...", hides the button, toast "Projects data imported", reloads the page after 1500 ms; failure text "Commit failed".
- Upload (panel 2): on submit with a chosen ZIP: status "Uploading and extracting ZIP..."; hides table, commit button, unmatched list; sends `zipfile` and `overwrite` (`1` or `0`) to `ajax-iso-pdf-upload.php`; success status "ZIP extracted: <n> PDFs found, <m> matched to isometrics." and the table is drawn.
- Panel 2 table rows: number, status label, PDF file name, iso number, project (number plus " — " plus name when there is one), current PDF file name or a dash. Status labels: "Matched" (green), "Already has PDF (skip)" (yellow; when overwrite is off), "Will overwrite" (blue; when overwrite is on and the iso already has a PDF). Summary: "<b>n</b> ready to import, <b>m</b> skipped" plus ", <b>k</b> unmatched" when there are unmatched files; unmatched names are listed as red labels. "Commit import" shows only when at least one file is ready.
- Commit (panel 2): disables the button with "Committing...", sends JSON `{ overwrite: true|false }` to `ajax-iso-pdf-commit.php`; success "<n> isometric PDFs linked successfully." and toast "<n> isometric PDFs linked."; errors show the response error or "Commit failed".

## Sample data

No rows on load. The select `piExportProject` lists "All projects on this site" and "20240101 Template project". The heading of panel 2 shows "7 isometrics".

## Not in the capture

Preview rows and error texts (no file was uploaded); the content of the Excel templates and of the example ZIP; the response bodies of the import requests; the exact meaning of the badge "7 isometrics" (the capture shows only the number).

---

# D. Iso overview of one project

Source: `weld__welding__project-isometrics.txt`. URL `/weldpilot/index.php?page=isometrics&project=1`. Browser title "Iso overview - WeldPilot®". State: normal. Reached by the folder-open button of a project row.

## Page

- Panel title: list icon + "Iso overview", followed by two small buttons: "+" → dialog `#addIsometric`, and a search icon (class `open-searchProject`) → dialog `#searchProject` ("Project search").
- The breadcrumb text of this page is not in the capture (only the header lines that no earlier capture had are written).
- Top bar buttons (the capture shows these; lines of the menus that were already captured on earlier pages are compressed):
  - "Reports" (dropdown, class `buttonPrint`): entries "Weld card" → `#generateLabelsOnMultipleWeldsProject`; "Weld labels" → `#generateLabelsOnMultipleWelds2Project`; other entries are not in the capture.
  - A second dropdown whose button label is not in the capture; its entries in order: "Delete all isometrics" → `#deleteAllIso` (`data-id="1"`); "Delete selected isometrics" → `#deleteSelectedIso` (`data-id="1"`); "Edit isometrics (Mass edit)" → `#editIsometricMass`; "Set ITP" (hidden item `#wsappsIsoMassSetItpItem`) → `#wsappsIsoMassSetItpModal`; "Set phase (Mass)" → `#editIsometricPhaseMass`; "Generate Iso book" → `#pdfIsoBookMultiple`; "Generate grouped Iso book" → `#pdfIsoBookMultipleGroup`; "Show deleted ISO's" → link `index.php?page=isometrics&showdeleted=ok&projectSite=&project=1`; "Copy selected isometrics" → `#copyIsometrics`.
  - "Add" (dropdown, class `buttonInsert`): "Add isometric" → `#addIsometric`; "Import calculations from Isometric" → `#importCalculationsFromIsoProject`; "Undo last calculation's import" → `#removeLastCalculations`.
- A hidden label "Select All" with checkbox `#selectItAllx`.

## List

Table `#datatableIsoListSingle`, server side, ajax `/core/ajax/ajax-table-isometrics-single.php?id=1&project=1&ndt=&pwht=&prio=&mto=&est=&weld=&calcstatus=` (the empty parameters `ndt`, `pwht`, `prio`, `mto`, `est`, `weld`, `calcstatus` are filters, all empty here; the capture shows draws 1 to n with the standard DataTables parameters).

- Columns in order (all visible): "ISO", "IRN", "Rev. no.", "ITP No", "Asset tag", "Piping class", "Drawing no. 1", "NoBo", "X Ray %", "QA" (not sortable; class `wsapps-col-iso-qa hidden-xs`), "PWHT", "Priority", "Status", "Started", "Options" (not sortable, class `wsapps-col-iso-options`), and a last column with the select-all checkbox `#selectItAll` (not sortable). All others are sortable.
- Default sort: column index 13 ("Started") ascending. Page length options 10, 20, 50, 100, 500; default 20. The capture draws no "Show … entries" selector for this table; it has a global search "Search" with a clear button. No per-column search.
- Texts: empty "No data available in table"; info text "Showing _START_ to _END_ of _TOTAL_ entries"; no match "No matching records found". The capture shows "Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)".
- Cell contents: NoBo and PWHT show a tick icon or a cross icon; "QA" shows four small badges "VI", "Pre", "NDT", "PWHT", each a link to `index.php?page=isometrics&project=1&id=<iso id>` with a tooltip such as "VI: 1 open", "Pre: ok", "NDT: 8 open" or "VI: n.v.t."; "Started" shows three letter links "M" → `/mtopilot/index.php?page=isometrics&project=1&id=<iso id>&view=mtopilot` (tooltip "ISO has been started" / "ISO has not been started"), "E" → `/estpilot/index.php?page=isometrics&project=1&id=<iso id>&view=estpilot` (tooltip "ISO has calculations" / "ISO has not calculations"), "W" → `/weldpilot/index.php?page=isometrics&project=1&id=<iso id>&view=weldpilot` (tooltip "ISO has welds").
- Row options in order: folder-open (class `buttonOpen`); print icon with dropdown "Choose report:" → "Certification index" (`#pdfCertificateIndexLanguage`) and "ISO Book" (`#pdfIsoBook`, `data-id`); eye icon (`.open-showIsometric`) → `#showIsometric` ("Iso overview" dialog); book icon → `#punchlist`; pencil → `#editIsometric`; trash → `#deleteIsometric`. Row checkbox in the last column.

## Dialogs

### Add isometric (`#addIsometric`) — opened by the "+" in the panel heading or "Add" → "Add isometric"

Large dialog, form method post, multipart. The form is checked by the page for allowed characters in the ISO number.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Iso number | `isoNo` | text | yes | 0008 |  |
| 2 | IRN | `irn` | text | no |  |  |
| 3 | Revision number | `revNo` | text | no |  |  |
| 4 | ITP No | `weldpilot_itp_id` | hidden | no | 0 |  |
| 5 | — | `itpNo` | hidden | no |  |  |
| 6 | — | (no name) | hidden | no |  |  |
| 7 | ITP Field | `weldpilot_itp_id2` | hidden | no | 0 |  |
| 8 | — | `itpNo2` | hidden | no |  |  |
| 9 | — | (no name) | hidden | no |  |  |
| 10 | Asset tag | `assetTag` | text | no |  |  |
| 11 | Drawing no. 1 | `drawingNo` | text | no |  |  |
| 12 | Date | `date` | text | no |  | read-only / disabled |
| 13 | NoBo Reg. no. | `noBoReg` | text | no |  |  |
| 14 | NoBo serial | `noBoSerial` | text | no |  |  |
| 15 | Piping class | `pipingClass` | text | no |  |  |
| 16 | Test pressure | `testPressure` | text | no |  |  |
| 17 | Test system | (no name) | text | no | — | read-only / disabled |
| 18 | Test medium | `testMedium` | text | no |  |  |
| 19 | X Ray % | (no name) | text | no | — | read-only / disabled |
| 20 | NDT norm | `ndtnorm` | text | no |  |  |
| 21 | PED Cat.-Mod | `ped` | text | no |  |  |
| 22 | Nom. diameter | `nomDiameter` | text | no |  |  |
| 23 | Material | `material` | text | no |  |  |
| 24 | Paint spec. | `paintSpec` | text | no |  |  |
| 25 | RAL | `ral` | text | no |  |  |
| 26 | Insulation | `insulation` | text | no |  |  |
| 27 | Elevation | `elevation` | text | no |  |  |
| 28 | X axis | `xaxis` | text | no |  |  |
| 29 | Y axis | `yaxis` | text | no |  |  |
| 30 | Zone / Area | `zone` | text | no |  |  |
| 31 | Priority | `priority` | select | no |  | 6 options: 0 → No priority ; 1 → Prio 1 ; 2 → Prio 2 ; 3 → Prio 3 ; 4 → Prio 4 ; 5 → Prio 5 |
| 32 | Chemical clean | `chemicalClean` | text | no |  |  |
| 33 | Tracing Spec | `tracing` | text | no |  |  |
| 34 | Norm No. | `asme2` | text | no |  |  |
| 35 | Norm | `asme` | text | no |  |  |
| 36 | NoBo | `noBo` | checkbox | no | unchecked | value `ok` |
| 37 | PWHT | `pwht` | checkbox | no | unchecked | value `ok` |
| 38 | Isometric | `fileiso` | file | no |  | accepts `.pdf` |
| 39 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 40 | ITP document | `fileitp` | file | no |  | accepts `.pdf` |
| 41 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 42 | ITP document Field | `fileitp2` | file | no |  | accepts `.pdf` |
| 43 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 44 | Memo: | `description` | textarea | no |  | hidden in the page |
| 45 | — | (no name) | text | no |  |  |

Notes: `isoNo` is pre-filled with a suggested next number (`0008` in the capture), must match `[A-Za-z0-9._-]+`, has the tooltip "Special characters are not allowed in the ISO number. Only letters, numbers, dots, - and _ are allowed." and a hidden error line "Special characters are not allowed in the ISO number". The ITP fields are a display with the text "— no ITP selected —" and a small "+" button (title "Add ITP") that opens an ITP chooser; the hidden fields hold the chosen ITP id and number. The two unnamed fields "Test system" and "X Ray %" are read-only, disabled, and show "—". "Memo:" is a rich-text editor (Quill toolbar: bold, italic, two list types, four alignments, clean) that writes into the hidden textarea `description`. Checkbox labels: `noBo` = "NoBo", `pwht` = "PWHT". Buttons: "Add" (`name=addIsometric`, submit), "Cancel".

### Weld card (`#generateLabelsOnMultipleWeldsProject`) — opened by "Reports" → "Weld card"

Form: `GET ../core/pdf/weld-cards.php`, new tab.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `project` | hidden | no | 1 |  |
| 2 | — | `isoIds` | hidden | no |  |  |
| 3 | — | `filterType` | select | no |  | 2 options: 0 → Include all welds ; 3 → Select specific weld(s) |

Text: optionally select isometrics in the list first; otherwise all welds of the project are included. "Filter:" select as above. When "Select specific weld(s)" is chosen a table (hidden container `.chideAllLabelProject`) with the columns "C" (checkbox `cb[]`), "ISO", "WN" (tooltip "Weld no."), "Type" (tooltip "Weld type"), "Wdr" (tooltip "Welder") lists the welds of the project: 88 rows in the capture (checkbox value = weld id), over the isos 0001 (19 rows), 00022 (15), 0003 (19), 00032 (19), 0005 (6), 0007 (9) and WF-73031-ST_STB000-01 (1); the Wdr cell shows the welder code (for example "ML396" or "W01") or "------". Examples: ISO 0001, WN 001, Type "Shop weld"; ISO 0001, WN 004, Type "Butt Weld - Field"; ISO 0003, WN 004, Type "Branch welds- Field"; ISO 0005, WN 001, Type "Butt Weld - Shop"; ISO WF-73031-ST_STB000-01, WN 01, Type "Victaulic Joint-Shop". Buttons: "Go" (submit, `onclick=refreshIt()`), "Cancel". The checkbox `cb[]` is a field of the dialog (88 instances, value = weld id, unchecked).

### Weld labels (`#generateLabelsOnMultipleWelds2Project`) — opened by "Reports" → "Weld labels"

Form: `GET ../core/pdf/weld-labels.php`, new tab. Same fields and the same weld table (88 rows, hidden container `.chideAllLabel2Project`) as "Weld card"; filter select id `filterTypeLabel2Project`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `project` | hidden | no | 1 |  |
| 2 | — | `isoIds` | hidden | no |  |  |
| 3 | — | `filterType` | select | no |  | 2 options: 0 → Include all welds ; 3 → Select specific weld(s) |

Buttons: "Go" (submit, `onclick=refreshIt()`), "Cancel".

### Set ITP (`#wsappsIsoMassSetItpModal`) — opened by the hidden menu item "Set ITP" (item `#wsappsIsoMassSetItpItem` is hidden in the capture)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | (none; id `wsappsIsoMassSetItpProjectId`) | hidden | no | 1 | the project id |

Text: "Selected isometrics: 0" (count of ticked isometrics); help text: shop ITPs link to slot 1, field-only ITPs to slot 2, shop+field ITPs cover both, order does not matter; a placeholder line "—". Buttons: "Choose ITP" (primary, plus icon, class `wsapps-wp-itp-mass-choose`), footer "Cancel".

### Edit isometric (Mass edit) (`#editIsometricMass`) — opened by "Edit isometrics (Mass edit)"

(Read in `weld__welding__ndt-pwht-manager.txt`, same dialog.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | IRN | `irn` | text | no |  |  |
| 3 | Revision number | `revNo` | text | no |  |  |
| 4 | ITP No | `itpNo` | text | no |  |  |
| 5 | ITP No 2 | `itpNo2` | text | no |  |  |
| 6 | Asset tag | `assetTag` | text | no |  |  |
| 7 | Drawing no. 1 | `drawingNo` | text | no |  |  |
| 8 | Date | `date` | text | no |  |  |
| 9 | NoBo Reg. no. | `noBoReg` | text | no |  |  |
| 10 | NoBo serial | `noBoSerial` | text | no |  |  |
| 11 | Piping class | `pipingClass` | text | no |  |  |
| 12 | Test pressure | `testPressure` | text | no |  |  |
| 13 | Test system | (no name) | text | no | — | read-only / disabled |
| 14 | Test medium | `testMedium` | text | no |  |  |
| 15 | X Ray % | (no name) | text | no | — | read-only / disabled |
| 16 | NDT norm | `ndtnorm` | text | no |  |  |
| 17 | PED Cat.-Mod | `ped` | text | no |  |  |
| 18 | Nom. diameter | `nomDiameter` | text | no |  |  |
| 19 | Material | `material` | text | no |  |  |
| 20 | Paint spec. | `paintSpec` | text | no |  |  |
| 21 | RAL | `ral` | text | no |  |  |
| 22 | Insulation | `insulation` | text | no |  |  |
| 23 | Elevation | `elevation` | text | no |  |  |
| 24 | X axis | `xaxis` | text | no |  |  |
| 25 | Y axis | `yaxis` | text | no |  |  |
| 26 | Zone / Area | `zone` | text | no |  |  |
| 27 | Priority | `priority` | select | no |  | 7 options: → Not changed ; 0 → No priority ; 1 → Prio 1 ; 2 → Prio 2 ; 3 → Prio 3 ; 4 → Prio 4 ; 5 → Prio 5 |
| 28 | Chemical clean | `chemicalClean` | text | no |  |  |
| 29 | Tracing Spec | `tracing` | text | no |  |  |
| 30 | NoBo | `noBo` | select | no |  | 3 options: 0 → --- ; ok → Yes ; no → No |
| 31 | PWHT | `pwht` | select | no |  | 3 options: 0 → --- ; ok → Yes ; no → No |
| 32 | Norm No. | `asme2` | text | no |  |  |
| 33 | Norm | `asme` | text | no |  |  |
| 34 | Isometric | `file` | file | no |  |  |
| 35 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 36 | ITP document | `fileitp` | file | no |  |  |
| 37 | — | (no name) | text | no |  | placeholder "Nothing selected" |
| 38 | ITP document 2 | `fileitp2` | file | no |  |  |
| 39 | — | (no name) | text | no |  | placeholder "Nothing selected" |

Buttons: "Update" (`name=editIsometricMass`, submit), "Cancel". The hidden `deleteID` carries the ticked iso ids.

### Copy selected isometrics (`#copyIsometrics`) — opened by "Copy selected isometrics"

(Read in `weld__iso__0001.txt`; the project select has no options in that capture.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | Project | `project` | select | no |  |  |
| 3 | Copy welds | `copyWelds` | checkbox | no | unchecked | value `ok` |
| 4 | Copy materials | `copyMats` | checkbox | no | unchecked | value `ok` |
| 5 | Copy calculations | `copyCalcs` | checkbox | no | unchecked | value `ok` |

Buttons: "Copy" (`name=copyIsometrics`, submit), "Cancel".

### Delete all isometrics (`#deleteAllIso`) — opened by "Delete all isometrics"

(Read in `weld__welding__ndt-pwht-manager.txt`.)

No input fields. Body text: you are going to delete all isometrics from this project; "Are you sure?"; only unused (blank) isometrics can be deleted. Buttons: "Delete" (`name=deleteAllIso`, submit), "Cancel".

### Delete selected isometrics (`#deleteSelectedIso`) — opened by "Delete selected isometrics"

(Read in `weld__welding__ndt-pwht-manager.txt`.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |

Body text: you are going to delete the selected isometrics from this project; "Are you sure?"; only unused (blank) isometrics can be deleted. Buttons: "Delete" (`#btnDeleteSelectedIso`, `name=deleteSelectedIso`, submit), "Cancel".

### Set phase (Mass) (`#editIsometricPhaseMass`) — opened by "Set phase (Mass)"

(Read in `weld__start__dashboard.txt`.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | Materials (MTOP) | `prefab_materials` | checkbox | no | unchecked | value `ok` |
| 3 | Estimate (ESTP) | `prefab_est` | checkbox | no | unchecked | value `ok` |
| 4 | Welds defined (WP) | `prefab_welds` | checkbox | no | unchecked | value `ok` |
| 5 | Isometric formatted | `prefab_doc` | checkbox | no | unchecked | value `ok` |
| 6 | Field documentation | `field_doc` | checkbox | no | unchecked | value `ok` |
| 7 | Test documentation | `field_test` | checkbox | no | unchecked | value `ok` |
| 8 | Release documentation | `field_release` | checkbox | no | unchecked | value `ok` |
| 9 | Work preparation 100% | `prep_finished` | checkbox | no | unchecked | value `ok` |

Buttons: "Update" (`name=editIsometricPhaseMass`, submit), "Cancel".

### ISO Book (`#pdfIsoBookMultiple`) — opened by "Generate Iso book"

(Read in `weld__welding__ndt-pwht-manager.txt`.) Form posts to the ISO book report in a new tab (action not shown in my extract of the dialog frame).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `iso` | hidden | no |  |  |
| 2 | Language | `lang` | select | no |  | 4 options: en → English* ; nl → Nederlands ; de → Deutsch ; fr → Français |
| 3 | Include Task sheet | `task` | checkbox | no | unchecked | value `ok` |
| 4 | Include ITP documents | `itp` | checkbox | no | unchecked | value `ok` |
| 5 | Include ITP 2 documents | `itp2` | checkbox | no | unchecked | value `ok` |
| 6 | Include Isometric | `isometric` | checkbox | no | unchecked | value `ok` |
| 7 | Include NDT Pre | `ndtPre` | checkbox | no | unchecked | value `ok` |
| 8 | Include NDT | `ndt` | checkbox | no | unchecked | value `ok` |
| 9 | Include PWHT | `pwht` | checkbox | no | unchecked | value `ok` |
| 10 | Include LISL | `lislold` | checkbox | no | unchecked | value `ok` |
| 11 | Include LISL V2 | `lisloldSignature` | checkbox | no | unchecked | value `ok` |
| 12 | Include LISL (A3) | `lisla3` | checkbox | no | unchecked | value `ok` |
| 13 | Weld record | `lisloldV2` | checkbox | no | unchecked | value `ok` |
| 14 | Include LISL [GU] | `lislnew` | checkbox | no | unchecked | value `ok` |
| 15 | Include LISL [MV] | `lislmv` | checkbox | no | unchecked | value `ok` |
| 16 | Include LISL [ISS] | `lisliss` | checkbox | no | unchecked | value `ok` |
| 17 | Include blank LISL | `lisl` | checkbox | no | unchecked | value `ok` |
| 18 | Include Pick Lists | `picklist` | checkbox | no | unchecked | value `ok` |
| 19 | Include Punch list | `punchlist` | checkbox | no | unchecked | value `ok` |
| 20 | Include Punch list (blank) | `punchlistblank` | checkbox | no | unchecked | value `ok` |
| 21 | Include Flange report | `flangereport` | checkbox | no | unchecked | value `ok` |
| 22 | Include Flange labels | `flangelabels` | checkbox | no | unchecked | value `ok` |
| 23 | Include Certificate Index | `certificateindex` | checkbox | no | unchecked | value `ok` |
| 24 | Include PQR | `pqr` | checkbox | no | unchecked | value `ok` |
| 25 | Include WPS | `wps` | checkbox | no | unchecked | value `ok` |
| 26 | Include NDT Process documents | `ndtprocess` | checkbox | no | unchecked | value `ok` |
| 27 | Include welder's summary lists | `summary` | checkbox | no | unchecked | value `ok` |
| 28 | Include Visual reports | `vt` | checkbox | no | unchecked | value `ok` |
| 29 | Include Prefab release document | `releaseshop` | checkbox | no | unchecked | value `ok` |
| 30 | Include Field release document | `releasefield` | checkbox | no | unchecked | value `ok` |
| 31 | Include material certificates | `certificates` | checkbox | no | unchecked | value `ok` |
| 32 | MTO Report (Shop) | `mto[]` | checkbox | no | unchecked | value `1` |
| 33 | MTO Report (Field) | `mto[]` | checkbox | no | unchecked | value `2` |
| 34 | MTO Report (Hydrotest field) | `mto[]` | checkbox | no | unchecked | value `3` |
| 35 | MTO Report (Support Field) | `mto[]` | checkbox | no | unchecked | value `4` |
| 36 | MTO Report (Valves) | `mto[]` | checkbox | no | unchecked | value `5` |
| 37 | MTO Report (Bernecker) | `mto[]` | checkbox | no | unchecked | value `7` |
| 38 | MTO Report (Support Shop) | `mto[]` | checkbox | no | unchecked | value `8` |
| 39 | MTO Report (Support WS) | `mto[]` | checkbox | no | unchecked | value `9` |
| 40 | MTO Report (Support FW) | `mto[]` | checkbox | no | unchecked | value `10` |
| 41 | MTO Report (Rilco) | `mto[]` | checkbox | no | unchecked | value `11` |
| 42 | MTO Report (Shop missing) | `mto[]` | checkbox | no | unchecked | value `14` |
| 43 | MTO Report (Revision mat) | `mto[]` | checkbox | no | unchecked | value `15` |
| 44 | MTO Report (Shop IYM) | `mto[]` | checkbox | no | unchecked | value `16` |
| 45 | MTO Report (Field IYM) | `mto[]` | checkbox | no | unchecked | value `17` |
| 46 | 2-200-AS PREFABRICATED | `custom[]` | checkbox | no | unchecked | value `73` |
| 47 | 108 - Isometric pre-fab | `custom[]` | checkbox | no | unchecked | value `72` |
| 48 | 107 - Blank LISL rev | `custom[]` | checkbox | no | unchecked | value `71` |
| 49 | 106 - CUT LISt rev | `custom[]` | checkbox | no | unchecked | value `70` |
| 50 | 103 - MTO SUPPORT rev | `custom[]` | checkbox | no | unchecked | value `69` |
| 51 | 105 - 3D rev | `custom[]` | checkbox | no | unchecked | value `68` |
| 52 | 104 - Support rev | `custom[]` | checkbox | no | unchecked | value `67` |
| 53 | 102 - MTO rev | `custom[]` | checkbox | no | unchecked | value `66` |
| 54 | 101 - Isometric rev | `custom[]` | checkbox | no | unchecked | value `65` |
| 55 | Ready for work | `custom[]` | checkbox | no | unchecked | value `64` |
| 56 | Support SHOP | `custom[]` | checkbox | no | unchecked | value `45` |
| 57 | Support FIELD | `custom[]` | checkbox | no | unchecked | value `46` |
| 58 | Support index | `custom[]` | checkbox | no | unchecked | value `5` |
| 59 | Info Documents | `custom[]` | checkbox | no | unchecked | value `22` |
| 60 | CUT LIST | `custom[]` | checkbox | no | unchecked | value `44` |
| 61 | Piping layout | `custom[]` | checkbox | no | unchecked | value `9` |
| 62 | 3D snippet | `custom[]` | checkbox | no | unchecked | value `6` |
| 63 | Flange tightening | `custom[]` | checkbox | no | unchecked | value `2` |
| 64 | Supports | `custom[]` | checkbox | no | unchecked | value `7` |
| 65 | Prefab signed off | `custom[]` | checkbox | no | unchecked | value `11` |
| 66 | Field signed off | `custom[]` | checkbox | no | unchecked | value `16` |

Sub-heading "Custom docs" before the `custom[]` boxes. Buttons: "Go" (`name=go`), "Cancel".

### ISO Book (grouped) (`#pdfIsoBookMultipleGroup`) — opened by "Generate grouped Iso book"

(Read in `weld__welding__ndt-pwht-manager.txt`.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `iso` | hidden | no |  |  |
| 2 | — | `grouped` | hidden | no | ok |  |
| 3 | Language | `lang` | select | no |  | 4 options: en → English* ; nl → Nederlands ; de → Deutsch ; fr → Français |
| 4 | Include Task sheet | `task` | checkbox | no | unchecked | value `ok` |
| 5 | Include ITP documents | `itp` | checkbox | no | unchecked | value `ok` |
| 6 | Include Isometric | `isometric` | checkbox | no | unchecked | value `ok` |
| 7 | Include NDT | `ndt` | checkbox | no | unchecked | value `ok` |
| 8 | Include PWHT | `pwht` | checkbox | no | unchecked | value `ok` |
| 9 | Include LISL | `lislold` | checkbox | no | unchecked | value `ok` |
| 10 | Weld record | `lisloldV2` | checkbox | no | unchecked | value `ok` |
| 11 | Include LISL (A3) | `lisla3` | checkbox | no | unchecked | value `ok` |
| 12 | Include LISL [GU] | `lislnew` | checkbox | no | unchecked | value `ok` |
| 13 | Include LISL [MV] | `lislmv` | checkbox | no | unchecked | value `ok` |
| 14 | Include LISL [ISS] | `lisliss` | checkbox | no | unchecked | value `ok` |
| 15 | Include blank LISL | `lisl` | checkbox | no | unchecked | value `ok` |
| 16 | Include Pick Lists | `picklist` | checkbox | no | unchecked | value `ok` |
| 17 | Include Punch list | `punchlist` | checkbox | no | unchecked | value `ok` |
| 18 | Include Punch list (blank) | `punchlistblank` | checkbox | no | unchecked | value `ok` |
| 19 | Include Flange report | `flangereport` | checkbox | no | unchecked | value `ok` |
| 20 | Include Flange labels | `flangelabels` | checkbox | no | unchecked | value `ok` |
| 21 | Include Certificate Index | `certificateindex` | checkbox | no | unchecked | value `ok` |
| 22 | Include PQR | `pqr` | checkbox | no | unchecked | value `ok` |
| 23 | Include WPS | `wps` | checkbox | no | unchecked | value `ok` |
| 24 | Include NDT Process documents | `ndtprocess` | checkbox | no | unchecked | value `ok` |
| 25 | Include welder's summary lists | `summary` | checkbox | no | unchecked | value `ok` |
| 26 | Include Visual reports | `vt` | checkbox | no | unchecked | value `ok` |
| 27 | Include Prefab release document | `releaseshop` | checkbox | no | unchecked | value `ok` |
| 28 | Include Field release document | `releasefield` | checkbox | no | unchecked | value `ok` |
| 29 | Include material certificates (Group) | `certificatesgroup` | checkbox | no | unchecked | value `ok` |
| 30 | MTO Report (Shop) | `mto[]` | checkbox | no | unchecked | value `1` |
| 31 | MTO Report (Field) | `mto[]` | checkbox | no | unchecked | value `2` |
| 32 | MTO Report (Hydrotest field) | `mto[]` | checkbox | no | unchecked | value `3` |
| 33 | MTO Report (Support Field) | `mto[]` | checkbox | no | unchecked | value `4` |
| 34 | MTO Report (Valves) | `mto[]` | checkbox | no | unchecked | value `5` |
| 35 | MTO Report (Bernecker) | `mto[]` | checkbox | no | unchecked | value `7` |
| 36 | MTO Report (Support Shop) | `mto[]` | checkbox | no | unchecked | value `8` |
| 37 | MTO Report (Support WS) | `mto[]` | checkbox | no | unchecked | value `9` |
| 38 | MTO Report (Support FW) | `mto[]` | checkbox | no | unchecked | value `10` |
| 39 | MTO Report (Rilco) | `mto[]` | checkbox | no | unchecked | value `11` |
| 40 | MTO Report (Shop missing) | `mto[]` | checkbox | no | unchecked | value `14` |
| 41 | MTO Report (Revision mat) | `mto[]` | checkbox | no | unchecked | value `15` |
| 42 | MTO Report (Shop IYM) | `mto[]` | checkbox | no | unchecked | value `16` |
| 43 | MTO Report (Field IYM) | `mto[]` | checkbox | no | unchecked | value `17` |
| 44 | 2-200-AS PREFABRICATED | `custom[]` | checkbox | no | unchecked | value `73` |
| 45 | 108 - Isometric pre-fab | `custom[]` | checkbox | no | unchecked | value `72` |
| 46 | 107 - Blank LISL rev | `custom[]` | checkbox | no | unchecked | value `71` |
| 47 | 106 - CUT LISt rev | `custom[]` | checkbox | no | unchecked | value `70` |
| 48 | 103 - MTO SUPPORT rev | `custom[]` | checkbox | no | unchecked | value `69` |
| 49 | 105 - 3D rev | `custom[]` | checkbox | no | unchecked | value `68` |
| 50 | 104 - Support rev | `custom[]` | checkbox | no | unchecked | value `67` |
| 51 | 102 - MTO rev | `custom[]` | checkbox | no | unchecked | value `66` |
| 52 | 101 - Isometric rev | `custom[]` | checkbox | no | unchecked | value `65` |
| 53 | Ready for work | `custom[]` | checkbox | no | unchecked | value `64` |
| 54 | Support SHOP | `custom[]` | checkbox | no | unchecked | value `45` |
| 55 | Support FIELD | `custom[]` | checkbox | no | unchecked | value `46` |
| 56 | Support index | `custom[]` | checkbox | no | unchecked | value `5` |
| 57 | Info Documents | `custom[]` | checkbox | no | unchecked | value `22` |
| 58 | CUT LIST | `custom[]` | checkbox | no | unchecked | value `44` |
| 59 | Piping layout | `custom[]` | checkbox | no | unchecked | value `9` |
| 60 | 3D snippet | `custom[]` | checkbox | no | unchecked | value `6` |
| 61 | Flange tightening | `custom[]` | checkbox | no | unchecked | value `2` |
| 62 | Supports | `custom[]` | checkbox | no | unchecked | value `7` |
| 63 | Prefab signed off | `custom[]` | checkbox | no | unchecked | value `11` |
| 64 | Field signed off | `custom[]` | checkbox | no | unchecked | value `16` |

Sub-heading "Custom docs" before the `custom[]` boxes. Buttons: "Go" (`name=go`), "Cancel".

### Import calculations from Isometrics to project (`#importCalculationsFromIsoProject`) — opened by "Add" → "Import calculations from Isometric"

(Read in `weld__start__dashboard.txt`.)

No input fields. Body text "Are you sure?". Buttons: "Yes" (`name=importCalculationsFromIsoProject`, submit), "Cancel".

### Undo last import (`#removeLastCalculations`) — opened by "Add" → "Undo last calculation's import"

(Read in `weld__start__dashboard.txt`.)

No input fields. Body text "Are you sure?". Buttons: "Yes" (`name=removeLastCalculations`, submit), "Cancel".

### Project search (`#searchProject`) — opened by the search icon in the panel heading

Frame only: title "Project search", footer buttons "Search" (`name=search`, submit, primary) and "Cancel". The body is loaded by `searchProject.php` after the click (not in the capture).

### Edit isometric (`#editIsometric`) — opened by the pencil in a row

Frame (read in `weld__welding__ndt-pwht-manager.txt`, large dialog). The form body is loaded after the click by `editIsometric.php?rand=…&id=<iso id>`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `secureCode` | hidden | no |  |  |
| 2 | Copy Welds | `copyWelds` | checkbox | no | unchecked | value `ok` |
| 3 | Copy Materials | `copyMats` | checkbox | no | unchecked | value `ok` |
| 4 | Copy Calculations | `copyCalcs` | checkbox | no | unchecked | value `ok` |

The checkbox labels are the plain texts that follow the boxes: `copyWelds` = "Copy Welds", `copyMats` = "Copy Materials", `copyCalcs` = "Copy Calculations". Buttons in the footer: "Add new" (`name=addIsometricNew`, submit, green), "Update" (`name=editIsometric`, submit, warning), "Cancel".

### Delete isometric (`#deleteIsometric`) — opened by the trash icon in a row

(Read in `weld__welding__ndt-pwht-manager.txt`.)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | — | `deleteID` | hidden | no |  |  |
| 2 | — | `secureCode` | hidden | no |  |  |

Body text "Are you sure?". Buttons: "Delete" (`#btnDeleteIsometric`, `name=deleteIsometric`, submit, trash icon), "Cancel".

### ISO Book (one isometric) (`#pdfIsoBook`) — opened by "Choose report:" → "ISO Book" in a row

Frame only in this capture (`DIV #pdfIsoBook`, title "ISO Book", footer "Go" and "Cancel"); the body is loaded by `pdfIsoBook.php?id=<iso id>&app=weldpilot&time=…` after the click.

### Certification index (`#pdfCertificateIndexLanguage`) — opened by "Choose report:" → "Certification index" in a row

Same dialog as in screen A; here the body request is `pdfCertificateIndexLanguage.php?time=…&id=<id>&iso=isometrics`.

### Iso overview (dialog) (`#showIsometric`) — opened by the eye icon in a row

Frame only: title "Iso overview", footer "Close"; the body is not in the capture.

### Punch lists (`#punchlist`) — opened by the book icon in a row

Frame only, as in screen A.

## Rules found in the page's JavaScript

- `updateTextArea()`: collects the values of all ticked checkboxes in `#datatableIsoListSingle` and writes them (comma separated) into the hidden field `#checkedBoxesMass`.
- When one of the dialogs `#generateLabelsOnMultipleWeldsProject` or `#generateLabelsOnMultipleWelds2Project` opens, the value of `#checkedBoxesMass` (or, if empty, `#checkedBoxesM`) is taken, leading and trailing commas are removed, and the result is written into every hidden field `isoIds` (class `weld-report-project-iso-ids`).
- Requests built from clicks in this page (shared script): `changeIsoInProject.php?id=<id>&iso=`; `pdfCertificateIndexAndLISL.php?id=<id>&time=…`; `pdfCertificateIndexLanguage.php?time=…&id=<id>&iso=isometrics`; `pdfIsoBook.php?id=<id>&app=weldpilot&time=…`; `editIsometric.php?rand=<number>&id=<id>` (two handlers); `searchProject.php?time=…`; also the calculation helper requests `getListOfMaterials.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php` (they belong to other dialogs of the shared script).
- Other scripts on this page (table rendering, ITP chooser) are not in the capture beyond what is listed above.

## Sample data

Isometrics of project 1: 7 rows returned of a total the server reports as 16,058 ("Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)").

| ISO | IRN | Rev. no. | ITP No | Asset tag | Piping class | Drawing no. 1 | NoBo | X Ray % | QA (VI / Pre / NDT / PWHT) | PWHT | Priority | Status | Started (M / E / W) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0001 | 1000 | 2 | 111111 | N011-HV10001-0001 | A11011 | N011-HV10001 | cross | 14 | 1 open / ok / 8 open / 3 open | tick | 1 | 0.0% | started / has calculations / has welds |
| 00022 | - | 0 | - | - | - | - | cross | - | n.v.t. ×4 | cross | 0 | 0.0% | started / not calculations / has welds |
| 00032 | - | 0 | - | - | - | - | cross | - | n.v.t. / n.v.t. / 5 open / n.v.t. | cross | 0 | 0.0% | started / not calculations / has welds |
| 0003 | - | 0 | - | - | - | - | cross | - | 17 open / n.v.t. / 1 open / n.v.t. | cross | 0 | 0.0% | started / not calculations / has welds |
| WF-73031-ST_STB000-01 | - | 0 | - | - | - | - | cross | - | n.v.t. ×4 | cross | 0 | 0.0% | not started / not calculations / has welds |
| 0007 | - | 0 | - | - | - | - | cross | - | n.v.t. / n.v.t. / 2 open / n.v.t. | cross | 0 | 0.0% | not started / not calculations / has welds |
| 0005 | - | 0 | - | - | - | - | cross | - | n.v.t. / n.v.t. / ok / n.v.t. | cross | 0 | 0.0% | not started / not calculations / has welds |

## Not in the capture

- Bodies loaded after a click: Edit isometric form (`editIsometric.php`), ISO Book body (`pdfIsoBook.php`), Certification index body, Iso overview dialog (eye icon), Punch lists, Project search body, Set ITP chooser list.
- The label of the second top-bar dropdown, the breadcrumb, the remaining entries of the "Reports" menu, and the project select options of "Copy selected isometrics" (empty in the capture that holds the dialog).
- The effect of the filter parameters `ndt`, `pwht`, `prio`, `mto`, `est`, `weld`, `calcstatus` (the page was captured with all of them empty).

---

Also present in the project list page (A), opened from elsewhere (shared dialogs of the whole application): `#pdfMainReportLanguage`, `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#editStamp`, `#changeIsoInProject`, `#searchProject`, `#importCalculationsFromIso`, `#importCalculationsFromIsoProject`, `#removeLastCalculations`, `#markPunchAsRemoved`, `#setCheckedMaterialsTypeModal`, `#deleteCheckedMaterialsModal`, `#setStatus`, `#statusLog`, `#showIsometric`, `#punchlistEdit`, `#showQuantityLog`, `#materialStatusByRevision`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.

Also present in the Iso overview page (D), opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#editStamp`, `#changeIsoInProject`, `#addProject`, `#editProject`, `#deleteProject`, `#backProject`, `#importProjects`, `#importFull`, `#pdfMTOReportLanguageList`, `#pdfESTReportLanguageList`, `#returnMaterialByRevision`, `#changeQuantityByRevision`, `#pdfIsoBookEst`, `#importMaterialInISO`, `#importIsometrics`, `#deleteMaterialISOimport`, `#deleteMaterialISO`, `#editMaterialISO`, `#editMaterialISOimport`, `#addReceivedMaterial`, `#setCalculationAsFinished`, `#setCalculationAsNotFinished`, `#setAsCompleted`, `#setAsNotCompleted`, `#setPunch`, `#uploadNDTonMultipleWelds`, `#uploadNDTonMultipleWeldsPre`, `#generateLabelsOnMultipleWelds`, `#generateLabelsOnMultipleWelds2`, `#uploadPWHTonMultipleWelds`, `#pdfLISLLanguage`, `#pdfLISLFullLanguage`, `#pdfLISLFullLanguageWQ`, `#pdfLISLFullLanguageWQNEW`, `#pdfLISLFullLanguageGUrev2`, `#pdfLISLFullLanguageGUrev3`, `#pdfLISLFullLanguageA3`, `#showOrderDetails`, `#showOrderAuditTrail`, `#showIsometricAuditTrail`, `#pdfNdtRequestLanguage`, `#pdfNdtRequestLanguageAdditional`, `#pdfNdtPreRequestLanguageAdditional`, `#pdfNdtRequestLanguageMass`, `#pdfNdtRequestLanguagePre`, `#pdfNdtRequestLanguagePreMass`, `#pdfPwhtRequestLanguage`, `#pdfNdtRequestLanguageISO`, `#pdfNdtPreRequestLanguageISO`, `#pdfPwhtRequestLanguageISO`, `#weldpilotItpPickerModal`, `#weldpilotItpUnlinkModal`, `#editIsometricPhase`, `#addRev`, `#addRevItp`, `#addRevItp2`, `#showRev`, `#showRevItp`, `#showRevItp2`, `#backIsometric`, `#editWeld`, `#deleteWeld`, `#deleteSelectedWelds`, `#backWeld`, `#showNDO`, `#showWeldNdtArchive`, `#showWeldNdtPreArchive`, `#showWeldPwhtArchive`, `#showNDOPre`, `#showPWHT`, `#editCalculation`, `#deleteCalculation`, `#importCalculationsFromIso`, `#markPunchAsRemoved`, `#setCheckedMaterialsTypeModal`, `#deleteCheckedMaterialsModal`, `#setStatus`, `#statusLog`, `#punchlistEdit`, `#showQuantityLog`, `#materialStatusByRevision`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
