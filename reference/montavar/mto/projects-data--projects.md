# MTO Pilot → Projects data → Projects

Source: `mto__projects__projects.txt`, `mto__projects__project-isometrics.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/mtopilot/index.php?page=project-sites&id=1&view=projects`.
Dialog bodies and handler code that this page shares with other captures were read in `weld__welding__projects.txt` (same dialogs, marked SAME-AS in the MTO capture) and `weld__start__dashboard.txt` (Project book body, row-button handlers, WeldPilot copy of the same table code). Those are named where used.
State of the page for the observing account: normal (the table and the Projects panel are shown; no rights message).

## Page
- Title (`TITLE`): `Project sites - MTOPilot®`. Panel heading: "Projects" (icon glyphicon-tasks, dark panel).
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Side menu: the item "Projects data" is open (accordion, icon glyphicon-stats). Its submenu items are not in this capture; the full menu is in the first MTO capture (`mto__start__dashboard`).
- Top bar: language links Nederlands, English, Deutsch, Français (`?lang=nl|en|de|fr&page=project-sites&id=1&project=&projectSite=`) and app tiles MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®. No top-bar buttons on this page.
- Buttons above the list (both icon-only, no text in the capture):
  - `+` (glyphicon-plus, class `buttonInsert`, btn-primary) → opens dialog `#addProject` ("Add project") via `href="#addProject" data-toggle="modal"`.
  - Import (glyphicon-import, class `buttonImport`, btn-default) → opens dialog `#importProjects` ("Import projects") via `href="#importProjects" data-toggle="modal"`.
- No export or print buttons are rendered (the DOM has no DataTables button bar on this table).

## List
- Table: `#datatableProjects` (class `display responsive nowrap`), server-side (`"serverSide": true`).
- Server-side table request (`ajax`): `/core/ajax/projects.php?deleted=0&id=1`. The XHR log shows it as a GET with DataTables parameters `draw`, `columns[n][data|name|searchable|orderable|search[value|regex]]`, and the rest (order, start, length, search) cut off in the capture. The page sent 13 such requests while loading (draw 1 to 13).
- Columns in order (DT `cols`, index: title → row value):
  - 0: **Intern prj. no.** (header is `<strong>`) → `20240101`
  - 1: Extern prj. no. → `-`
  - 2: Project description → `Template project`
  - 3: Contact name → `NN`
  - 4: Authority (header class `hidden-xs`) → `Lloyds`
  - 5: Status (header class `hidden-xs`) → `69.6%`
  - 6: Options (header class `hidden-xs`, cell class `wsapps-col-project-options`; not sortable). Row buttons are listed below.
  - 7: header checkbox `#checkAll` (type checkbox, no label; not sortable). Each row has a checkbox `.checkbox` with value `1` (the project id).
- Hidden columns: none (every column has `vis: true`). Responsive classes only (`responsive`; `hidden-xs` on three headers).
- Default sort: column 5 (Status), ascending (`"order": [[5,"asc"]]`). Sortable: columns 0 to 5.
- Page length: 20 (default). Length options: `Show [10 | 20 | 50 | 100 | 500] entries` (select name `datatableProjects_length`, shows 20). Label text "Show" and "entries".
- Search: one box, `type="search"`, placeholder `Search`, with a clear button (aria-label "Clear"). No per-column search inputs.
- Filters: none on this page.
- Row options, left to right:
  1. Folder button (`.buttonOpen`, class `hidden-xs`, glyphicon-folder-open, btn-warning, no text) → opens the isometrics overview of the project: `index.php?page=isometrics&project=<project id>` (see the last section). Handler: WeldPilot dashboard capture, `$('#datatableProjects tbody').on('click', '.buttonOpen', …)`.
  2. Print dropdown (glyphicon-print, btn-warning, `dropdown-toggle`), menu titled "Choose report:" with a divider and two items:
     - "Certification index" → `#pdfCertificateIndexLanguage` (link title "Certification index").
     - "Project book" → `#pdfMainReportLanguageForProjects` (link title attribute also reads "Certification index" in the capture; written as captured).
  3. Punch button (glyphicon-book, class `open-punchlist`, btn-warning) → `#punchlist` ("Punch lists").
  4. Edit (glyphicon-pencil, class `open-editProject`, btn-warning) → `#editProject` ("Edit project").
  5. Delete (glyphicon-trash, class `open-deleteProject`, btn-danger) → `#deleteProject` ("Delete project").
  The Options cell of the row does not carry a "Bring back" button; that button belongs to the deleted-projects table (`deleted=1`, not on this page).
- Row checkbox: `.checkbox`, value = project id.
- Bulk actions (Options menu): none in the capture. The DOM has no bulk-action control on this page; the header checkbox `#checkAll` is the only select-all.
- Info text (`#datatableProjects_info`): "Showing 1 to 1 of 1 entries (filtered from 76 total entries)".
- Empty text: "No data available in table". Zero-match text (DT language): "No matching records found". Search label text: empty.

## Dialogs
Seven dialogs are opened by controls on this page. Dialogs that are in the DOM but are not opened from this page are listed at the end.

### Add project (`#addProject`) — opened by the `+` button (`buttonInsert`)
Title "Add project". Body identical to the `addProject` dialog in `weld__welding__projects.txt` (SAME-AS). Form `method="post"` (no action attribute).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Intern prj. no. | internnumber | text | yes | empty | none shown |
| 2 | Extern prj. no. | externnumber | text | no | empty | none shown |
| 3 | Contact name | contact | text | no | empty | none shown |
| 4 | Phone | phone | text | no | empty | none shown |
| 5 | Authority | authority | text | no | empty | none shown |
| 6 | Project description | description | text | no | empty | none shown |
| 7 | CivilPilot (under the label "Application Visibility") | enable_civilpilot | checkbox, value `1` | no | unchecked | none shown |
| 8 | WeldPilot | enable_weldpilot | checkbox, value `1` | no | checked | none shown |
| 9 | MTOPilot | enable_mtopilot | checkbox, value `1` | no | checked | none shown |
| 10 | ESTPilot | enable_estpilot | checkbox, value `1` | no | checked | none shown |

- Help text under the checkboxes: "Select which applications this project should be visible in."
- Label above the checkboxes: "Application Visibility".
- No hidden inputs. No select.
- Buttons: "Add" (btn-primary, name `addProject`, type submit, class btn-hideInsert); "Cancel" (btn default, closes the dialog; no type attribute shown).
- Rule in the text: the four application checkboxes say in which applications the project is visible; WeldPilot, MTOPilot and ESTPilot are pre-checked, CivilPilot is not.

### Import projects (`#importProjects`) — opened by the Import button (`buttonImport`)
Title "Import projects". Body identical to `importProjects` in `weld__welding__projects.txt` (SAME-AS). Form `id="projectsOnlyImportForm"`, `enctype="multipart/form-data"`, no action attribute in the capture.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | CSV file (label; the button inside it reads "Choose file") | file | file, `accept=".xlsx"` | no | nothing selected | On change, the chosen file name is copied into field 2 |
| 2 | (no label; placeholder "Nothing selected") | (no name attribute; id `uploader3dd`) | text | no | empty | Shows the chosen file name; not submitted by name |
| 3 | Check if you want clean import (Current list will be deleted) | clean | checkbox, value `ok` | no | unchecked | none shown |

- Note from the capture: the label says "CSV file" but the file input accepts `.xlsx` only.
- Well "Templates": link "Download Excel template" → `/core/export/templates/projects_import_template_xlsx.php`.
- Hidden blocks (`HID` in the capture, shown after an upload): status alert `#projectsOnlyImportStatus` (alert-warning), summary alert `#projectsOnlyImportSummary` (alert-info), and a table `#projectsOnlyImportTable` (striped, bordered) with the header row "# Actie InternalNo ExternalNo Description Customer Contact Phone Fax Authority". What the summary and table contain after an upload is not in the capture.
- Buttons: "Import" (btn-success, id `projectsOnlyImportCommitBtn`, hidden in the capture); "Upload" (btn-primary, id `projectsOnlyImportUploadBtn`, type submit); "Cancel" (btn default, closes the dialog).
- Depends on: the "Import" button is hidden in the captured state; the capture does not show what makes it appear.

### Certification index (`#pdfCertificateIndexLanguage`) — opened by row print menu → "Certification index"
Title "Certification index". Body in the capture: empty (no fields in the static markup). Body is loaded by a request on click (see Rules), into `#contentPdfCertificateIndexLanguage`, which is not in the static markup.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| — | none in the static markup | — | — | — | — | Fields come from the request (not in the capture) |

- Buttons: "Go" (btn-primary, class btn-hidePrint, name `go`, type submit); "Cancel" (btn default, closes the dialog).
- Body text: none in the capture.

### Project book (`#pdfMainReportLanguageForProjects`) — opened by row print menu → "Project book" (link carries `data-id="1"`)
Title "Project book". Body identical to `pdfMainReportLanguageForProjects` in `weld__start__dashboard.txt` (SAME-AS). Form `action="/core/pdf/iso-book.php"`, `method="get"`, `target="_blank"`. The container `#contentPdfProjectBook` is empty in the static markup; the request on click fills it (see Rules). No hidden inputs and no select in the static markup. All checkboxes are unchecked by default and have value `ok` unless stated.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Include Task sheet | task | checkbox | no | unchecked | none shown |
| 2 | Include ITP documents | itp | checkbox | no | unchecked | none shown |
| 3 | Include ITP 2 documents | itp2 | checkbox | no | unchecked | none shown |
| 4 | Include Isometric | isometric | checkbox | no | unchecked | none shown |
| 5 | Include NDT Pre | ndtPre | checkbox | no | unchecked | none shown |
| 6 | Include NDT | ndt | checkbox | no | unchecked | none shown |
| 7 | Include PWHT | pwht | checkbox | no | unchecked | none shown |
| 8 | Include LISL | lislold | checkbox | no | unchecked | none shown |
| 9 | Include LISL V2 | lisloldSignature | checkbox | no | unchecked | none shown |
| 10 | Include LISL (A3) | lisla3 | checkbox | no | unchecked | none shown |
| 11 | Weld record | lisloldV2 | checkbox | no | unchecked | none shown |
| 12 | Include LISL [GU] | lislnew | checkbox | no | unchecked | none shown |
| 13 | Include LISL [MV] | lislmv | checkbox | no | unchecked | none shown |
| 14 | Include LISL [ISS] | lisliss | checkbox | no | unchecked | none shown |
| 15 | Include blank LISL | lisl | checkbox | no | unchecked | none shown |
| 16 | Include Pick Lists | picklist | checkbox | no | unchecked | none shown |
| 17 | Include Punch list | punchlist | checkbox | no | unchecked | none shown |
| 18 | Include Punch list (blank) | punchlistblank | checkbox | no | unchecked | none shown |
| 19 | Include Flange report | flangereport | checkbox | no | unchecked | none shown |
| 20 | Include Flange labels | flangelabels | checkbox | no | unchecked | none shown |
| 21 | Include Certificate Index | certificateindex | checkbox | no | unchecked | none shown |
| 22 | Include PQR | pqr | checkbox | no | unchecked | none shown |
| 23 | Include WPS | wps | checkbox | no | unchecked | none shown |
| 24 | Include NDT Process documents | ndtprocess | checkbox | no | unchecked | none shown |
| 25 | Include welder's summary lists | summary | checkbox | no | unchecked | none shown |
| 26 | Include welder's certificates | weldercerts | checkbox | no | unchecked | none shown |
| 27 | Include Visual reports | vt | checkbox | no | unchecked | none shown |
| 28 | Include Prefab release document | releaseshop | checkbox | no | unchecked | none shown |
| 29 | Include Field release document | releasefield | checkbox | no | unchecked | none shown |
| 30 | Include material certificates | certificates | checkbox | no | unchecked | Inside a block marked hidden (`.col-md-12 HID`) in the static markup |
| 31 | MTO Report (Shop) | mto[] | checkbox, value `1` | no | unchecked | none shown |
| 32 | MTO Report (Field) | mto[] | checkbox, value `2` | no | unchecked | none shown |
| 33 | MTO Report (Hydrotest field) | mto[] | checkbox, value `3` | no | unchecked | none shown |
| 34 | MTO Report (Support Field) | mto[] | checkbox, value `4` | no | unchecked | none shown |
| 35 | MTO Report (Valves) | mto[] | checkbox, value `5` | no | unchecked | none shown |
| 36 | MTO Report (Bernecker) | mto[] | checkbox, value `7` | no | unchecked | none shown |
| 37 | MTO Report (Support Shop) | mto[] | checkbox, value `8` | no | unchecked | none shown |
| 38 | MTO Report (Support WS) | mto[] | checkbox, value `9` | no | unchecked | none shown |
| 39 | MTO Report (Support FW) | mto[] | checkbox, value `10` | no | unchecked | none shown |
| 40 | MTO Report (Rilco) | mto[] | checkbox, value `11` | no | unchecked | none shown |
| 41 | MTO Report (Shop missing) | mto[] | checkbox, value `14` | no | unchecked | none shown |
| 42 | MTO Report (Revision mat) | mto[] | checkbox, value `15` | no | unchecked | none shown |
| 43 | MTO Report (Shop IYM) | mto[] | checkbox, value `16` | no | unchecked | none shown |
| 44 | MTO Report (Field IYM) | mto[] | checkbox, value `17` | no | unchecked | none shown |
| 45 | Flange tightening | custom[] | checkbox, value `2` | no | unchecked | under the heading "Custom docs" |
| 46 | Support index | custom[] | checkbox, value `5` | no | unchecked | under "Custom docs" |
| 47 | 3D snippet | custom[] | checkbox, value `6` | no | unchecked | under "Custom docs" |
| 48 | Supports | custom[] | checkbox, value `7` | no | unchecked | under "Custom docs" |
| 49 | Piping layout | custom[] | checkbox, value `9` | no | unchecked | under "Custom docs" |
| 50 | Prefab signed off | custom[] | checkbox, value `11` | no | unchecked | under "Custom docs" |
| 51 | Field signed off | custom[] | checkbox, value `16` | no | unchecked | under "Custom docs" |
| 52 | Info Documents | custom[] | checkbox, value `22` | no | unchecked | under "Custom docs" |
| 53 | CUT LIST | custom[] | checkbox, value `44` | no | unchecked | under "Custom docs" |
| 54 | Support SHOP | custom[] | checkbox, value `45` | no | unchecked | under "Custom docs" |
| 55 | Support FIELD | custom[] | checkbox, value `46` | no | unchecked | under "Custom docs" |
| 56 | Ready for work | custom[] | checkbox, value `64` | no | unchecked | under "Custom docs" |
| 57 | 101 - Isometric rev | custom[] | checkbox, value `65` | no | unchecked | under "Custom docs" |
| 58 | 102 - MTO rev | custom[] | checkbox, value `66` | no | unchecked | under "Custom docs" |
| 59 | 104 - Support rev | custom[] | checkbox, value `67` | no | unchecked | under "Custom docs" |
| 60 | 105 - 3D rev | custom[] | checkbox, value `68` | no | unchecked | under "Custom docs" |
| 61 | 103 - MTO SUPPORT rev | custom[] | checkbox, value `69` | no | unchecked | under "Custom docs" |
| 62 | 106 - CUT LISt rev | custom[] | checkbox, value `70` | no | unchecked | under "Custom docs" |
| 63 | 107 - Blank LISL rev | custom[] | checkbox, value `71` | no | unchecked | under "Custom docs" |
| 64 | 108 - Isometric pre-fab | custom[] | checkbox, value `72` | no | unchecked | under "Custom docs" |
| 65 | 2-200-AS PREFABRICATED | custom[] | checkbox, value `73` | no | unchecked | under "Custom docs" |

- 65 checkboxes in total: 30 named fields (rows 1 to 30), 14 `mto[]` (rows 31 to 44), 21 `custom[]` (rows 45 to 65).
- Buttons: "Go" (btn-primary, name `go`, type submit); "Cancel" (btn default, closes the dialog).
- Rule in the text: none beyond the labels. Output is generated by the form's `iso-book.php` request (see Rules).

### Punch lists (`#punchlist`) — opened by the punch button (`open-punchlist`)
Title "Punch lists" (heading id `wpPunchModalTitle`); dialog class `wp-punch-enterprise-modal`. Static markup has no fields and no body; the body is loaded on click (see Rules).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| — | none in the static markup | — | — | — | — | Content comes from the punch list request (not in the capture) |

- Buttons: "Close" (btn default, closes the dialog). The header has an X close button.

### Edit project (`#editProject`) — opened by the pencil button (`open-editProject`)
Title "Edit project" (dialog class `bs-modal-lg`). Body identical to `editProject` in `weld__welding__projects.txt` (SAME-AS): the static markup has no body fields.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, no label) | secureCode (id `bookIdEditProjectSecure`) | hidden | no | no value in the capture | Set by script (value not shown in the captured lines) |

- The fields of the form are not in the static markup; the body is loaded by the request `editProject.php?id=<project id>` (see Rules).
- Buttons: "Update" (btn-warning, class btn-hideEdit, name `editProject`, type submit); "Cancel" (btn default, closes the dialog).

### Delete project (`#deleteProject`) — opened by the trash button (`open-deleteProject`)
Title "Delete project". Body identical to `deleteProject` in `weld__welding__projects.txt` (SAME-AS). Form `method="post"` (no action attribute).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden, no label) | deleteID (id `bookIdEdit`) | hidden | no | no value in the capture | Set by a script; the capture does not show which handler sets it for this page |
| 2 | (hidden, no label) | secureCode (id `bookIdDeleteProjectSecure`) | hidden | no | no value in the capture | Set on click by the row's script (see Rules) |

- Text in the dialog: "Are you sure?"
- Buttons: "Delete" (btn-danger, class btn-hideDelete, name `deleteProject`, type submit, glyphicon-trash); "Cancel" (btn default, closes the dialog).
- Rule in the text: a confirmation question before deleting the project.

## Rules found in the page's JavaScript
Scripts are from `mto__projects__projects.txt` (only its new lines are in the capture; the rest of the big shared script is in earlier captures) and from the same table code in `weld__welding__projects.txt` and `weld__start__dashboard.txt`. Where a rule comes from WeldPilot code, it is marked.

1. **Server-side table:** `#datatableProjects` loads `/core/ajax/projects.php?deleted=0&id=1`, page length 20, default order Status ascending. Each row sets its checkbox value to the project id (`createdRow`, WeldPilot dashboard code). The table also calls a sync routine `wsappsSyncIsoProgress(…)` once it is set up; its request is `/core/ajax/iso-progress-sync.php`.
2. **Row buttons and PDF links store the row's project id:** on a click on any button of the row, and on any `.buttonPDF` link of the row, the element gets `data-id` = the row's project id (WeldPilot dashboard code). This is why the punch button and the PDF links carry no `data-id` in the static markup.
3. **Folder button:** on click, navigates to `index.php?page=isometrics&project=<project id>` (WeldPilot dashboard code).
4. **Row checkbox:** when ticked, the project id is appended to the comma-separated hidden fields `checkedBoxes`, `checkedBoxesM`, `checkedBoxesMass`, `checkedBoxesProjects` and `tck2`; when unticked, it is removed from them. None of these fields is in this page's DOM, so the script skips them here (WeldPilot dashboard code).
5. **Certification index:** on click of `.open-pdfCertificateIndexLanguage`, a GET request to `/core/ajax/pdfCertificateIndexLanguage.php` with parameters `time`, `id` (project id) and `iso=project-sites`; the response is written into `#contentPdfCertificateIndexLanguage` (`weld__welding__projects.txt`).
6. **Project book:** on click of `.open-pdfMainReportLanguageForProjects`, a request to `/core/ajax/pdfCertificateIndexAndLISL.php` with parameters `id` (project id) and `time`; the response is written into `#contentPdfProjectBook` (`weld__welding__projects.txt`). The form then submits to `/core/pdf/iso-book.php` (GET, new window) (`weld__start__dashboard.txt`).
7. **Edit project:** the script requests `/core/ajax/editProject.php?id=<project id>`. The lines in the capture show the request, then the delete secure value being set in the same block; the handler's selector and the target element of the response are in lines the capture does not contain (`weld__welding__projects.txt`).
8. **Delete project:** on click, the script sets `.modal-body #bookIdDeleteProjectSecure` to a value the browser builds from a fixed text, the project id and the suffix `prj` (the fixed text is not repeated here). The `deleteID` field is not set in the captured lines.
9. **Punch lists (WeldPilot dashboard code):** on click of `.open-punchlist`, the script sets `.modal-body #bookId` to the button's `data-id`, then requests `punchlist.php?id=<id>&type=<data-wp-type or empty>` with `action=showroom` (GET) and passes the response to `__wsappsLoadPunchlistContent`. The MTO page's punch button has no `data-wp-type` in the capture.
10. **Row menus and dropdown:** the print menu opens as a Bootstrap dropdown (`dropdown-toggle`, `data-toggle="dropdown"`).
11. **Shared table code that is not rendered here:** the WeldPilot dashboard script defines TableTools buttons for this table (`csv`, `xls`, `pdf`); the MTO page renders no such buttons in the capture. The "Bring back" handler (`.open-backProject`) and the table `deleted=1` belong to the deleted-projects page, not this one.
12. **Forms without an action attribute:** Add project (POST), Delete project (POST), Import projects (multipart). The capture does not show the endpoint of the Import upload.
13. **Page-load requests:** `/core/ajax/ajax-notifications.php?action=count_unread` (GET) and `/core/ajax/iso-progress-sync.php` (no parameters shown); the table request as in item 1.
14. **Other script in the capture, not on this page's controls:** the shared script also contains `searchProject.php` (for the "Project search" dialog, which this page does not open).

## Sample data
- Table: 76 projects in total (`total: 76`); the capture shows **1 row** (`shown: 1`), with the info text "Showing 1 to 1 of 1 entries (filtered from 76 total entries)". The capture does not show what filters the list to one row.
- Key figures as displayed: none beyond the row values below.

| Intern prj. no. | Extern prj. no. | Project description | Contact name | Authority | Status | Options | Checkbox value |
|---|---|---|---|---|---|---|---|
| 20240101 | - | Template project | NN | Lloyds | 69.6% | folder, print menu (Certification index, Project book), punch, edit, delete | 1 |

## Not in the capture
- **Rows 2 to 76:** the table has 76 projects; only the first row is drawn in the capture.
- **Edit project fields:** the body is loaded by `editProject.php?id=…` on the pencil button (`.open-editProject`).
- **Certification index fields:** loaded by `pdfCertificateIndexLanguage.php?…` on the "Certification index" menu item (`.open-pdfCertificateIndexLanguage`).
- **Project book response:** the `#contentPdfProjectBook` content (`pdfCertificateIndexAndLISL.php?…`) is loaded on the "Project book" menu item; the static checkbox list (65) is in the capture.
- **Punch list content:** loaded on the punch button (`open-punchlist`) by `punchlist.php?…` (see Rules, item 9).
- **Import upload result:** the status, summary and preview table of the Import projects dialog appear only after an upload.
- **Deleted projects:** the "Bring back" button and the table `deleted=1` are on the deleted-projects page (`weld__welding__projects-deleted.txt`), not here.
- **Row buttons' target dialogs for other pages:** the Iso overview (see the last section) and its dialogs are not described in this note.

## Dialogs in the page not opened from this page
Present in the DOM (SAME-AS or full), no control on this page points to them: fillIRN, deleteSelectedProjects, editProjectsMass, pdfMainReportLanguageForProjectsMultiple, pdfMainReportLanguage, importFull, backProject, searchProject, editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, editStamp, changeIsoInProject, importCalculationsFromIso, importCalculationsFromIsoProject, removeLastCalculations, markPunchAsRemoved, setCheckedMaterialsTypeModal, deleteCheckedMaterialsModal, setStatus, statusLog, showIsometric, punchlistEdit, showQuantityLog, materialStatusByRevision, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.

## Related page: folder button destination (Iso overview)
Source: `mto__projects__project-isometrics.txt`. URL: `/mtopilot/index.php?page=isometrics&project=1`. Title `Iso overview - MTOPilot®`. Reached from the folder button of this page (WeldPilot dashboard handler, item 3 above). The Iso overview's own dialogs are not described in this note.
- Panel heading: "Iso overview" (glyphicon-list). Buttons above the list (icon-only): `+` (`href="#addIsometric"`, btn-primary) and search (`.open-searchProject`, `href="#searchProject"`, btn-default).
- Table `#datatableIsoListSingle`, server-side, request `/core/ajax/ajax-table-isometrics-single.php?id=1&project=1&ndt=&pwht=&prio=&mto=&est=&weld=&calcstatus=` (plus DataTables parameters). Page length 20; default order column 13 (Started) ascending. Length options 10, 20, 50, 100, 500.
- Columns: ISO | IRN | Rev. no. | ITP No | Asset tag | Piping class | Drawing no. 1 | NoBo | X Ray % | QA | PWHT | Priority | Status | Started | Options (plus header checkbox `#selectItAll`).
- Row options: folder (`.buttonOpen`), print menu "Choose report:" with "Certification index" (`#pdfCertificateIndexLanguage`) and "ISO Book" (`#pdfIsoBook`), eye (`#showIsometric`), punch (`#punchlist`), pencil (`#editIsometric`), trash (`#deleteIsometric`).
- Info text: "Showing 1 to 7 of 7 entries (filtered from 16,058 total entries)". Empty text: "No data available in table".

Sample rows as displayed (7 of 16,058):

| ISO | IRN | Rev. no. | Asset tag | Piping class | Drawing no. 1 | NoBo | X Ray % | QA (VI / Pre / NDT / PWHT) | PWHT | Priority | Status | Started (M / E / W) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0001 | 1000 | 2 | N011-HV10001-0001 | A11011 | N011-HV10001 | no | 14 | 1 open / ok / 8 open / 3 open | yes | 1 | 0.0% | M started, E has calculations, W has welds |
| 00022 | - | 0 | - | - | - | no | - | n.v.t. all four | no | 0 | 0.0% | M started, E no calculations, W welds |
| 00032 | - | 0 | - | - | - | no | - | VI n.v.t. / Pre n.v.t. / 5 open / n.v.t. | no | 0 | 0.0% | M started, E no calculations, W welds |
| 0003 | - | 0 | - | - | - | no | - | 17 open / n.v.t. / 1 open / n.v.t. | no | 0 | 0.0% | M started, E no calculations, W welds |
| WF-73031-ST_STB000-01 | - | 0 | - | - | - | no | - | n.v.t. all four | no | 0 | 0.0% | M not started, E no calculations, W welds |
| 0007 | - | 0 | - | - | - | no | - | VI n.v.t. / Pre n.v.t. / 2 open / n.v.t. | no | 0 | 0.0% | M not started, E no calculations, W welds |
| 0005 | - | 0 | - | - | - | no | - | VI n.v.t. / Pre n.v.t. / ok / n.v.t. | no | 0 | 0.0% | M not started, E no calculations, W welds |

(The Started column shows three small badges M, E and W; their tooltips are as in the table above. "yes" / "no" stand for the NoBo and PWHT icons: check = yes, times = no.)

### Add isometric (`#addIsometric`) — opened by the `+` button of the Iso overview (added from the coverage check of `mto__projects__project-isometrics.txt`)
Title "Add isometric" (large dialog). Form `method="post"`, `enctype="multipart/form-data"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Iso number | isoNo (`#isoNoAdd`) | text, pattern `[A-Za-z0-9._-]+` | yes | "0008" (next number, captured) | tooltip: only letters, numbers, dots, - and _ are allowed |
| 2 | IRN | irn | text | no | empty | none shown |
| 3 | Revision number | revNo | text | no | empty | none shown |
| 4 | ITP No | itpNo | text | no | empty | none shown |
| 5 | ITP No Field | itpNo2 | text | no | empty | none shown |
| 6 | Asset tag | assetTag | text | no | empty | none shown |
| 7 | Drawing no. 1 | drawingNo | text | no | empty | none shown |
| 8 | Date | date | text, datepicker (`dpicker`), read-only | no | empty | none shown |
| 9 | NoBo Reg. no. | noBoReg | text | no | empty | none shown |
| 10 | NoBo serial | noBoSerial | text | no | empty | none shown |
| 11 | Piping class | pipingClass | text | no | empty | none shown |
| 12 | Test pressure | testPressure | text | no | empty | none shown |
| 13 | Test system | (no name) | text, read-only and disabled | no | "—" | display only |
| 14 | Test medium | testMedium | text | no | empty | none shown |
| 15 | X Ray % | (no name) | text, read-only and disabled | no | "—" | display only |
| 16 | NDT norm | ndtnorm | text | no | empty | none shown |
| 17 | PED Cat.-Mod | ped | text | no | empty | none shown |
| 18 | Nom. diameter | nomDiameter | text | no | empty | none shown |
| 19 | Material | material | text | no | empty | none shown |
| 20 | Paint spec. | paintSpec | text | no | empty | none shown |
| 21 | RAL | ral | text | no | empty | none shown |
| 22 | Insulation | insulation | text | no | empty | none shown |
| 23 | Elevation | elevation | text | no | empty | none shown |
| 24 | X axis | xaxis | text | no | empty | none shown |
| 25 | Y axis | yaxis | text | no | empty | none shown |
| 26 | Zone / Area | zone | text | no | empty | none shown |
| 27 | Priority | priority | select (select2) | no | "No priority" (0) | 6 options: 0 No priority; 1 Prio 1; 2 Prio 2; 3 Prio 3; 4 Prio 4; 5 Prio 5 |
| 28 | Chemical clean | chemicalClean | text | no | empty | none shown |
| 29 | Tracing Spec | tracing | text | no | empty | none shown |
| 30 | Norm No. | asme2 | text | no | empty | none shown |
| 31 | Norm | asme | text | no | empty | none shown |
| 32 | NoBo | noBo (`#checkboxExample4x`) | checkbox, value `ok` | no | unchecked | none shown |
| 33 | PWHT | pwht (`#checkboxExample4x1`) | checkbox, value `ok` | no | unchecked | none shown |
| 34 | Isometric | fileiso | file, accept `.pdf` | no | "Nothing selected" | none shown |
| 35 | ITP document | fileitp | file, accept `.pdf` | no | "Nothing selected" | none shown |
| 36 | ITP document Field | fileitp2 | file, accept `.pdf` | no | "Nothing selected" | none shown |
| 37 | Memo | description | textarea (hidden source of a Quill rich-text editor) | no | empty | none shown |

- Buttons: "Add" (btn-primary, name `addIsometric`, submit, class btn-hideInsert); "Cancel".
- Row pencil `#editIsometric` ("Edit isometric"): shell footer carries the buttons "Add new" (name `addIsometricNew`, btn-success), checkboxes `copyWelds` ("Copy Welds"), `copyMats` ("Copy Materials"), `copyCalcs` ("Copy Calculations") (all value `ok`, unchecked), "Update" (name `editIsometric`), "Cancel"; hidden `secureCode`. The body fields are loaded by a request and were not captured in this page's capture.
