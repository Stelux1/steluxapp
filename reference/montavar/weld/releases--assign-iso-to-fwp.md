# Weld Pilot → Releases → Assign Iso to FWP

Source: `weld__releases__assign-fwp.txt`, `weld__releases__fwp-packages.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=assign-fwp&tab=assign-iso` (tab "Assign Iso to FWP") and `/weldpilot/index.php?page=assign-fwp&tab=field-packages` (tab "Field Work Packages"). Both tabs are one page; this note covers both.

State of the page for the observing account: normal (both tabs show their lists).

## Page

- Title: the capture's TITLE line is "- WeldPilot®". The capture has no page heading element.
- Breadcrumb: "Assign Iso to FWP" (`.breadcrumb.visible-xs`, shown on extra-small screens only).
- Tabs (`.nav-tabs.wsapps-fwp-tabs`, in this order):
  1. "Field Work Packages" → `index.php?page=assign-fwp&tab=field-packages` (the active tab in the field-packages capture)
  2. "Assign Iso to FWP" → `index.php?page=assign-fwp&tab=assign-iso` (the active tab in the assign-iso capture)
- Buttons above the list, tab "Assign Iso to FWP" (top bar):
  - "Assign Iso to FWP" (`#laydownTransportID`, classes btn-dark btn-sm, icon fa-arrow-right) → opens dialog `#hydrotestMoveTestSystem`. Hidden on load; shown when at least one row is checked (see Rules).
  - "Set phase (Mass)" (`#laydownTransportID2`, btn-dark btn-sm) → opens dialog `#editIsometricPhaseMass`. Hidden on load; shown when at least one row is checked.
  - "Filter" (btn-dark btn-sm, icon fa-sliders) → opens dialog `#filterFWP`.
  - "Export" (btn-dark btn-sm, icon class "fa fa-export") → link `../mtopilot/export-fwp.php`, target _blank. Not clicked.
- Buttons above the list, tab "Field Work Packages" (top bar and panel header):
  - "Add FWP" (top bar, btn-sm btn-primary btn-block, icon glyphicon-plus) → opens dialog `#addFieldPackage`.
  - Panel header: an icon-only button with the same link, class and icon (`#addFieldPackage`).
  - The field-packages capture writes only the top-bar lines that the earlier capture did not contain. It marks 7 lines as already captured, so the other top-bar entries of this tab (Assign, Set phase, Filter, Export) are not shown explicitly in this capture. "Add FWP" is the only top-bar entry written for this tab.
- Panel heading on the "Assign Iso to FWP" tab: "Zandbak" (the project site). Panel heading on the "Field Work Packages" tab: "Field Work Packages" (with a tasks icon).
- Site-wide, on every page: a floating handheld menu button (`.wsapps-handheld-fab-btn`, title "Handheld") with the items "Scan weld" (data-action weld-scan), "Scan flange QR label" (flange-scan) and "Add punch" (punchlist). Their handlers are not in this capture.

## List

### Tab "Assign Iso to FWP" (table `#c_b`)

- Columns in order: Project | ISO | Diameter | Paint spec. | Asset tag | Test pressure | Test medium | Test system | FWP | Check. None hidden. The "Check" column is not sortable.
- Default sort: "Test system" (8th column), ascending.
- Page length: 25 by default. The table configuration lists 10, 25, 50, 100, but the capture draws no length selector for this table.
- Search: one global search box (label "Search", placeholder "Search", with a clear button). No per-column search inputs.
- Filters on the table: none. Filtering is done in the "Filter" dialog in the top bar (Project, FWP, Show).
- Row options: no icon buttons. The ISO cell is a link to `index.php?page=isometrics&id=<id>&project=1`. The Check column holds one row checkbox per isometric (`name="ccid_<id>"`, value = the isometric id). Checking a row shows the top-bar buttons "Assign Iso to FWP" and "Set phase (Mass)" (see Rules).
- Bulk actions: none inside the table. The two top-bar buttons act on the checked rows. No Options menu in the capture.
- Export / print: the "Export" top-bar link only.
- Info and empty texts: "Showing 1 to 7 of 7 entries" (info pattern "Showing _START_ to _END_ of _TOTAL_ entries"); a text line under the table reads "Showed 7 isometrics"; empty text "No data available in table"; no-match text "No matching records found".
- Server-side request: none. The table is client-side (`serverSide: false`, `ajax: null`).

### Tab "Field Work Packages" (table `#datatableFieldPackages`)

- Columns in order: Name | Description | Options. None hidden. "Options" is not sortable.
- Default sort: "Name", ascending.
- Page length: 25 by default, with a visible length selector "Show [25] entries" (options 10, 25, 50, 100).
- Search: one global search box (placeholder "Search", with a clear button). No per-column search inputs.
- Filters on the table: none on this tab.
- Row options (Options column, in order):
  1. Pencil (btn-xs btn-warning, class `buttonEdit open-editFieldPackage`, glyphicon-pencil, data-id) → opens dialog `#editFieldPackage` (Edit FWP).
  2. Trash (btn-xs btn-danger, class `buttonDelete open-deleteFieldPackage`, glyphicon-trash, data-id) → opens dialog `#deleteFieldPackage` (Delete FWP).
  - The Name cell is a text link to `/weldpilot/index.php?fwp=1&page=assign-fwp&tab=assign-iso`.
- Bulk actions: none. Export / print: none in the capture.
- Info and empty texts: "Showing 1 to 1 of 1 entries"; empty text "No data available in table"; no-match text "No matching records found".
- Server-side request: none (`serverSide: false`, `ajax: null`).

## Dialogs

### Assign Iso to FWP (`#hydrotestMoveTestSystem`) — opened by "Assign Iso to FWP" (`#laydownTransportID`, tab "Assign Iso to FWP")

Form: method post. No action attribute in the capture.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | FWP | fwp | select (select2) | no flag in capture | "----" (shown as current) | 2 options: 0 → "----"; 1 → "Uitvoerder 01". No option is marked as selected by default in the capture. |
| 2 | (none) | selectedIDS | hidden input, id `t99`, class form-control, READONLY | — | empty at load | Filled by the page script with the checked isometric ids, comma-separated (see Rules). |
| 3 | (none) | fileid | hidden input | — | empty at load | Nothing shown in the capture. |

- Buttons: "Confirm" (type submit, btn-success, name `confirmMoveToFWP`); "Cancel" (btn default, closes the dialog).
- Rule text in the dialog: none. The dialog has only the title "Assign Iso to FWP" and the fields above.

### Set phase (Mass) (`#editIsometricPhaseMass`) — opened by "Set phase (Mass)" (`#laydownTransportID2`, tab "Assign Iso to FWP")

Form: method post, enctype multipart/form-data.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | deleteID | hidden input, id `checkedBoxesMassPhase` | — | "," in the capture | Set by the page script to "," followed by the checked isometric ids (see Rules). Same name as the hidden field in Delete FWP. |
| 2 | Materials (MTOP) | prefab_materials | checkbox, value "ok" | no | unchecked | — |
| 3 | Estimate (ESTP) | prefab_est | checkbox, value "ok" | no | unchecked | — |
| 4 | Welds defined (WP) | prefab_welds | checkbox, value "ok" | no | unchecked | — |
| 5 | Isometric formatted | prefab_doc | checkbox, value "ok" | no | unchecked | — |
| 6 | Field documentation | field_doc | checkbox, value "ok" | no | unchecked | — |
| 7 | Test documentation | field_test | checkbox, value "ok" | no | unchecked | — |
| 8 | Release documentation | field_release | checkbox, value "ok" | no | unchecked | — |
| 9 | Work preparation 100% | prep_finished | checkbox, value "ok" | no | unchecked | — |

- The label text is written after each checkbox; the LABEL elements carry no `for` attribute in the capture.
- Depends on: nothing shown for the checkboxes. The hidden field depends on the row selection on the Assign tab.
- Buttons: "Update" (btn-primary, class btn-hideEdit, name `editIsometricPhaseMass`, type submit); "Cancel" (btn default).
- Rule text in the dialog: none.

### Filter (`#filterFWP`) — opened by "Filter" (top bar, tab "Assign Iso to FWP")

Form: method get, action `index.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | project | select (select2) | no | "All" | 2 options: (empty value) → "All"; 1 → "20240101". |
| 2 | FWP | fwp | select (select2) | no | "All" | 2 options: (empty value) → "All"; 1 → "Uitvoerder 01". |
| 3 | Show | show | select (select2) | no | "All" | 3 options: all → "All"; onlyOn → "With FWP"; onlyOff → "Without FWP". |
| 4 | (none) | page | hidden input, value `assign-fwp` | — | `assign-fwp` | — |
| 5 | (none) | tab | hidden input | — | `assign-iso` in the assign-iso capture; `field-packages` in the field-packages capture | — |

- Buttons: "Go" (btn-primary, name `filterFWP`, type submit); "Cancel" (btn default).
- Rule text in the dialog: none.
- The field-packages capture contains this dialog too (with tab `field-packages`). The capture shows no visible control on that tab that opens it.

### Add FWP (`#addFieldPackage`) — opened by "Add FWP" (top bar) and by the icon-only button in the panel header, tab "Field Work Packages"

Form: method post.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text, class form-control | yes (REQUIRED) | empty | The LABEL has `for="input00"`; no element with that id is in the capture. |
| 2 | Description | description | textarea, id `exampleInputEmail1cc`, class wsapps-quill-source, hidden | no | empty | The visible field is a rich-text editor (Quill) that replaces this textarea. Toolbar buttons have no text in the capture: bold, italic, two list buttons (the capture does not say whether ordered or bullet), four align buttons, clean (remove formatting), and a preview link (`about:blank`, target _blank). |
| – | (none) | (no name) | text input inside the Quill toolbar | — | — | Editor tooltip input with data-formula "e=mc^2", data-link "https://quilljs.com", data-video "Embed URL". Not a form field. |

- Buttons: "Add" (btn-primary, class btn-hideInsert, name `addFieldPackage`, type submit); "Cancel" (btn default).
- Rule text in the dialog: none.

### Edit FWP (`#editFieldPackage`) — opened by the pencil in the Options column (`.open-editFieldPackage`, data-id)

- The page holds only the header "Edit FWP" and the footer. The body is loaded on click into `#contentFieldPackage` (see Rules). The body is not in the capture, so its fields are not described here.
- Buttons: "Update" (btn-warning, class btn-hideEdit, name `editFieldPackage`, type submit); "Cancel" (btn default).

### Delete FWP (`#deleteFieldPackage`) — opened by the trash icon (`.open-deleteFieldPackage`, data-id)

Form: method post. Body text: "Are you sure?"

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | deleteID | hidden input, id `bookIdDeleteFieldPackage` | — | empty in the capture | Set on open to the row's data-id (see Rules). |

- Buttons: "Delete" (btn-danger, class btn-hideDelete, glyphicon-trash icon, name `deleteFieldPackage`, type submit); "Cancel" (btn default).
- Rule text in the dialog: only "Are you sure?".

Also present in the page, opened from elsewhere (not described): admin (System settings), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, editCompanyData, passwordChange, themeChange, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal (the last two are reached from the site-wide handheld menu).

## Rules found in the page's JavaScript

Inline script on the "Assign Iso to FWP" tab (written in full in the assign-iso capture):

1. On load: `#hydrotestRequestID` is shown; `#laydownTransportID` and `#laydownTransportID2` are hidden. `#hydrotestRequestID` is not in the DOM capture.
2. `updateTextArea()` is bound to every click on an input inside `#c_b` (the isometric table), on document ready:
   - Collects the values of checked inputs in `#c_b` into one list (the checked isometric ids). Collects the values of checked inputs in `.cb2` into a second list. No `.cb2` element is in the capture.
   - Writes the first list into the Assign dialog's `selectedIDS` (`#t99`), into `#sids`, and into the Set phase dialog's `deleteID` (`#checkedBoxesMassPhase`, as ",", then the list). Writes the second list into `#t2`.
   - If the first list is not empty, shows `#laydownTransportID` and `#laydownTransportID2`. Otherwise hides them.
   - If the second list is not empty, shows `#hydrotestRequestID` and `#hydrotestRequestID2`. Otherwise hides them. Neither element is in the capture.
   - No validation and no message in this function.

"Field Work Packages" tab (script in the field-packages capture):

3. Click on `.open-editFieldPackage`: requests `/core/ajax/editFieldPackage.php?id=` + the row's data-id and places the response in `#contentFieldPackage` (the Edit FWP dialog body). The HTTP method is not visible in the capture.
4. Click on `.open-deleteFieldPackage`: copies the row's data-id into the hidden field `#bookIdDeleteFieldPackage` inside `.modal-body`.

Visibility statements in the page's large shared script (lines written in the assign-iso capture, not tied to a single control):

5. Set visible: `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport`, `.buttonPrint`, `.btn-hidePrint`. Set hidden: `.btn-hideDelete`. On this page the Delete button of the Delete FWP dialog has class `btn-hideDelete`, so the script hides it. No rule for `btn-hideInsert` or `btn-hideEdit` appears in the capture.

Other requests in the shared script (the capture does not say which control on this page triggers them): `/core/ajax/getListOfMaterials.php`, `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php`.

Requests made on load (both tabs): `/core/ajax/ajax-notifications.php?action=count_unread`.

Validation: none found in the capture. The only rule is the REQUIRED attribute on the Name field of Add FWP.

## Sample data

Tab "Assign Iso to FWP": 7 isometrics in total, 7 shown ("Showing 1 to 7 of 7 entries"). Rows in the order shown (default sort Test system ascending):

| Project | ISO | Diameter | Paint spec. | Asset tag | Test pressure | Test medium | Test system | FWP |
|---|---|---|---|---|---|---|---|---|
| 20240101 | 00022 | - | - | - | - | - | - | Uitvoerder 01 |
| 20240101 | 00032 | - | - | - | - | - | - | - |
| 20240101 | 0005 | - | - | - | - | - | - | - |
| 20240101 | 0007 | - | - | - | - | - | - | - |
| 20240101 | WF-73031-ST_STB000-01 | 3 | - | - | - | - | - | - |
| 20240101 | 0001 | ND250 | A10 | N011-HV10001-0001 | 29 | - | - | Uitvoerder 01 |
| 20240101 | 0003 | - | - | - | - | - | PTC 01 | - |

The Check column holds the row checkboxes with values 6, 6191, 6598, 15767, 15424, 1 and 895, in the same row order. No row is checked in the capture.

Tab "Field Work Packages": 1 FWP in total, 1 shown ("Showing 1 to 1 of 1 entries").

| Name | Description | Options |
|---|---|---|
| Uitvoerder 01 | Heeft een deel van unit A onder zijn hoede | edit, delete (icon buttons, data-id 1) |

Filter dialog choices: Project "20240101", FWP "Uitvoerder 01".

## Not in the capture

- Edit FWP body (`/core/ajax/editFieldPackage.php?id=1`, opened by the pencil in the row "Uitvoerder 01"): not loaded in the capture.
- Hidden elements the script refers to but the DOM does not show: `#hydrotestRequestID`, `#hydrotestRequestID2`, `#t2`, `.cb2` inputs.
- Top-bar entries of the "Field Work Packages" tab other than "Add FWP" (see Page).
- Length selector of the "Assign Iso to FWP" table (configured, not drawn).
- Results of any submit: Confirm (Assign), Update (Set phase), Go (Filter), Add, Update, Delete (FWP). Nothing was submitted.
- Export file (`../mtopilot/export-fwp.php`): not opened.
- Handlers of the handheld menu items (weld-scan, flange-scan, punchlist): in `weldpilot-weld-scan.js` and the shared script, not in this capture.
- Browser-pass notes: no dialog captures named `weld__releases__assign-fwp__*` or `weld__releases__fwp-packages__*` exist, and no note in `raw/_interactive/` covers this page. Nothing was clicked for this page.
