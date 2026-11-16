# Weld Pilot → Releases → Flange Management

Source: `weld__releases__flange-management.txt`, `weld__releases__flange-management__add-prefill.txt`, `weld__releases__flange-management__documents.txt`, `weld__releases__flange-management__edit.txt`, `weld__releases__flanges-import.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=flanges` (the Excel import page: `/weldpilot/index.php?page=flanges-import`).
State of the page for the observing account: normal for `page=flanges`; the Excel import page (`page=flanges-import`) shows "You do not have rights to open this page."

Dialogs described below: 7 (`#addFlange`, `#editFlange`, `#docsFlange`, `#deleteFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#importFlanges`), 111 named fields in total (45 + 47 + 10 + 1 + 3 + 5, see each table; `#importFlanges` has none).

## Page
- Browser title: "- WeldPilot®". Panel heading above the list: "Flanges".
- Breadcrumb (topbar): one link, "Flange Management" → `/weldpilot/index.php?page=flanges`.
- Tabs: none.
- Buttons above the list, in order (all small):

| Label | Style | Opens or does |
|---|---|---|
| Export (`#flangeExportSelected`, Excel icon) | blue, **disabled** until at least one row is ticked | Navigates to the URL in `data-export-url` (`/mtopilot/export-flange.php?project=0&finished=`) with `cb=<comma-separated ticked flange ids>` appended |
| Report (`#laydownTransportID`, print icon) | blue, **disabled** until a row is ticked | Opens dialog `#pdfFlangeReport` |
| Print labels (`#pdfFlangeLabelsID`, QR icon) | blue, **disabled** until a row is ticked | Opens a new browser tab at `../core/pdf/flange-labels.php?ids=<ticked ids>` |
| Filter | blue | Opens dialog `#filterFlanges` (`data-toggle="modal"`) |
| Excel import | green | Link to `/weldpilot/index.php?page=flanges-import` |
| Add | dark, plus icon | Opens dialog `#addFlange` |

- Also in the capture (not on the page itself): the handheld floating menu with "Scan weld", "Scan flange QR label" (dialog `#wpFlangeScanModal`) and "Add punch".

## List
- Table `#datatableDashboardList2`, client-side (`serverSide:false`, `ajax:null`), so no table request is made; all rows are in the page.
- Columns in order (DT data index → title; visible; sortable):
  0 Project (yes, yes) · 1 Iso number (yes, yes) · 2 Flange ID (yes, yes; css class `flange-id-col`) · 3 Asset tag (yes, yes) · 4 Flange Size (yes, yes) · 5 Gasket Type (yes, yes) · 6 Target Moment (Nm) (yes, yes) · 7 Criticality (**hidden**, sortable) · 8 Status (yes, yes) · 9 Options (yes, not sortable) · 10 select-all checkbox column (`#flangeCheckAll`, title "Select all"; yes, not sortable; class `flange-check-col`).
- The "Flange Size" cell shows size and rating joined as "size / rating" (the sample row shows "2 / 2" for Flange Size 2 and Flange Rating 2).
- Default sort: column index 6 (Target Moment (Nm)), ascending.
- Page length: 100 by default; options 10, 20, 50, 100, 500 ("Show … entries" select, name `datatableDashboardList2_length`).
- Search: one global search box (search icon, placeholder "Search", with a clear button, aria-label "Clear"). No per-column search inputs. No export or print buttons belong to the table itself (the toolbar above handles export).
- Filters: only the `#filterFlanges` dialog (Project, Finished?).
- Row options (cell "Options"), in order:
  1. blue eye → link `/weldpilot/index.php?page=flanges&flange_id=<id>` (the flange detail page; not part of this note).
  2. orange pencil (`.open-editFlange`, `data-id`) → dialog `#editFlange`; its body is loaded on click from `/core/ajax/editFlange.php?id=<id>&action=showroom`.
  3. file icon (`.open-docsFlange`, `data-id`) → dialog `#docsFlange`; body loaded from `/core/ajax/docsFlange.php?id=<id>&action=showroom`.
  4. red trash (`.open-deleteFlange`, `data-id`) → dialog `#deleteFlange` (the id goes into hidden input `deleteID`).
- Last column: a row checkbox (`id="id_<flange id>"`, value = flange id).
- Bulk actions: none in an Options menu; the ticked rows feed the Export, Report and Print labels buttons (see Rules).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (sample: "Showing 1 to 1 of 1 entries"). Empty text: "No data available in table". No-match text: "No matching records found".
- Status cell is shown as a grey badge in the browser pass (from the browser-pass notes); the capture shows the text "Planned".

## Dialogs

### Add Flange (`#addFlange`) — opened by the "Add" button
Large dialog, form `method="post"`, body class `flange-modal-body`. Sections have titles shown in capitals by CSS; the section names are given in the "Section" column. 45 fields.

| # | Section | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|---|
| 1 | – | (none) | `projectsite` | hidden | – | 1 | the current project site |
| 2 | Project / Isometric | Project | `project` | select (select2, `#mark`) | no | 20240101 | 1 option: 1 → 20240101 (selected) |
| 3 | Project / Isometric | Isometric | `isometric` | select (select2, `#series`) | **yes** | 0001 (first option) | 7 options: 1 → 0001 (selected); 6 → 00022; 895 → 0003; 6191 → 00032; 6598 → 0005; 15767 → 0007; 15424 → WF-73031-ST_STB000-01. In the Edit dialog the isometric select is chained to the project select (`$("#series1").chained("#mark1")`); the Add capture does not show this call |
| 4 | Flange ID / From Equipment | Flange ID | `flange_id` | text | no | empty | |
| 5 | Flange ID / From Equipment | From Equipment | `from_equipment` | text | no | empty | |
| 6 | Flange ID / From Equipment | To Equipment | `to_equipment` | text | no | empty | |
| 7 | Flange ID / From Equipment | EQ.con. | `eq_con` | text | no | empty | |
| 8 | Flange ID / From Equipment | IRN | `irnno` | text | no | empty | filled with the isometric's value after the Isometric select is changed and the field is empty (capture: "1000") |
| 9 | Flange ID / From Equipment | Criticality | `criticality` | text | no | empty | |
| 10 | Flange ID / From Equipment | High risk (checkbox text "Requires enhanced control") | `high_risk` | checkbox | no | unchecked | value 1 |
| 11 | Asset tag / Location | P&ID | `pid` | text | no | empty | isometric prefill (capture: "N011-HV10001") |
| 12 | Asset tag / Location | Asset tag | `line_number` | text | no | empty | isometric prefill (capture: "N011-HV10001-0001") |
| 13 | Asset tag / Location | Fluid Code | `fluid_code` | text | no | empty | |
| 14 | Asset tag / Location | Pipe Class | `pipe_class` | text | no | empty | isometric prefill (capture: "A11011") |
| 15 | Asset tag / Location | Area/Unit | `area_unit` | text | no | empty | isometric prefill (capture: "A1") |
| 16 | Asset tag / Location | Location | `location` | text | no | empty | isometric prefill key exists; null in the capture |
| 17 | Flange Type / Gasket Type | Flange Type | `flange_type` | text | no | empty | |
| 18 | Flange Type / Gasket Type | Flange Size | `flange_size` | text with datalist `#flangeCatalogSizes` | no | empty | suggestions from the site catalog (in the Edit dialog 20 values: 1/2", 3/4", 1", 1.1/2", 2", 3", 4", 6", 8", 10", 12", 14", 16", 18", 20", 24", 30", 36", 42", 48"); the Add capture lists the datalist without its entries |
| 19 | Flange Type / Gasket Type | Flange Rating | `flange_rating` | text with datalist `#flangeCatalogRatings` | no | empty | suggestions (in the Edit dialog 6 values: 150#, 300#, 600#, 900#, 1500#, 2500#) |
| 20 | Flange Type / Gasket Type | Flange Rate & Size | `flange_rate_size` | text | no | empty | one of the catalog fill fields |
| 21 | Flange Type / Gasket Type | Gasket Type | `gasket_type` | text | no | empty | catalog fill field |
| 22 | Flange Type / Gasket Type | Gasket Material | `gasket_material` | text | no | empty | catalog fill field |
| 23 | Studbolt Size / Material of Nut | Studbolt Size | `studbolt_afmeting` | text | no | empty | catalog fill field |
| 24 | Studbolt Size / Material of Nut | Studbolt Diameter | `stud_dia` | text | no | empty | catalog fill field |
| 25 | Studbolt Size / Material of Nut | No of Studbolts | `aantal_studbolts` | text | no | empty | catalog fill field |
| 26 | Studbolt Size / Material of Nut | Lubricant Used | `lubricant_used` | text | no | empty | catalog fill field |
| 27 | Studbolt Size / Material of Nut | Material of Studbolts | `matl_studbolts` | text | no | empty | catalog fill field |
| 28 | Studbolt Size / Material of Nut | Material of Nut | `materiaal_moer` | text | no | empty | catalog fill field |
| 29 | Torque Wrench Type / Target Moment (Nm) | Torque Wrench Type | `torque_wrench_type` | text | no | empty | catalog fill field |
| 30 | Torque Wrench Type / Target Moment (Nm) | Torque Wrench ID | `torque_wrench_id` | text | no | empty | |
| 31 | Torque Wrench Type / Target Moment (Nm) | 1st pass (Nm) | `first_pass_nm` | text | no | empty | catalog fill field |
| 32 | Torque Wrench Type / Target Moment (Nm) | 2nd pass (Nm) | `second_pass_nm` | text | no | empty | catalog fill field |
| 33 | Torque Wrench Type / Target Moment (Nm) | Target Moment (Nm) | `target_moment_nm` | text | no | empty | catalog fill field |
| 34 | Torque Wrench Type / Target Moment (Nm) | Target Stress | `target_stress` | text | no | empty | catalog fill field |
| 35 | Torque Wrench Type / Target Moment (Nm) | Max. Deviation | `max_dev` | text | no | empty | catalog fill field |
| 36 | Operator / Inspection Result | Tightning Date | `tightning_date` | text, read-only, date picker (class `dpicker`, format dd.mm.yyyy) | no | empty | |
| 37 | Operator / Inspection Result | Report Nr. | `report_nr` | text | no | empty | |
| 38 | Operator / Inspection Result | Operator | `operator` | text | no | empty | |
| 39 | Operator / Inspection Result | CQI | `cqi` | text | no | empty | |
| 40 | Operator / Inspection Result | Commisioning Date | `commisioning_date` | text, read-only, date picker (format dd.mm.yyyy) | no | empty | |
| 41 | Operator / Inspection Result | Rejection Type | `rejection_type` | text | no | empty | |
| 42 | Operator / Inspection Result | Inspection Result | `insp_result` | text | no | empty | |
| 43 | Operating Pressure / Operating Temperature | Operating Pressure | `operatingPressure` | text | no | empty | |
| 44 | Operating Pressure / Operating Temperature | Operating Temperature | `operatingTemp` | text | no | empty | |
| 45 | Operating Pressure / Operating Temperature | Test pressure | `testPressure` | text | no | empty | isometric prefill (capture: "29") |

Also in the dialog: a panel (`.js-flange-catalog-panel`, hidden when the dialog loads) with an info alert: text (paraphrased) says empty bolt, torque and gasket fields are filled from the site catalog and values already entered stay; button "Fill empty fields from catalog" (`.js-flange-catalog-apply`, type button). A title and a hint line inside the panel exist in the Edit dialog's HTML but are empty in the capture.
Buttons: "Add" (green, `name="addFlange"`, type submit), "Cancel" (`data-dismiss="modal"`), close "x" in the header.
Behaviour seen in the browser pass: on load Project and Isometric are preselected and all other fields are empty; the prefill only runs when the Isometric select is changed (from the browser-pass notes). The prefill fills only fields that are empty.

### Edit (`#editFlange`) — opened by the pencil in a row
Large dialog titled "Edit". Its shell holds only the title and the footer; the body is loaded on click from `/core/ajax/editFlange.php?id=<id>&action=showroom` into `#contentEditFlange`, inside a form `method="post" enctype="multipart/form-data"`. 47 fields: the same 45 fields as Add (same labels, names, types, same sections; Project select id `#mark1`, Isometric select id `#series1`, datalists `#flangeCatalogSizesEdit` and `#flangeCatalogRatingsEdit`) with these differences:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | all 45 fields of the Add dialog | as in Add | as in Add | only `isometric` | the stored value of the flange being edited (sample row values in Sample data); `tightning_date` and `commisioning_date` were empty for the sample | `project` and `isometric` options are marked selected for the stored values; `isometric` options carry the class of their project id (used by the chain) |
| 46 | Note | `note` | textarea, 2 rows | no | empty (sample) | last field of the last section |
| 47 | (hidden) | `editID` | hidden | – | the flange id (sample: 1) | |

- The last section is titled "Operating Pressure / Note" (in Add: "Operating Pressure / Operating Temperature"); it contains Operating Pressure, Operating Temperature, Test pressure and Note.
- On open, three requests run (see Rules). In the sample, Test pressure was empty-filled with "29" from the isometric lookup in the form only (from the browser-pass notes).
- Buttons: "Update" (orange, `name="editFlange"`, type submit, class `btn-hideEdit`), "Cancel", close "x".

### Documents (`#docsFlange`) — opened by the file icon in a row
Title "Documents". Body loaded from `/core/ajax/docsFlange.php?id=<id>&action=showroom` into `#contentDocsFlange`. Contains two forms. 10 fields.

Form 1 (`method="post" enctype="multipart/form-data"`), panel "General attachment" (help text: certificates, datasheets, photos or correspondence):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `_csrf` | hidden | – | session token (value not recorded here) | |
| 2 | Choose file (text box placeholder "Nothing selected") | `file` | file | no | none | selected file name is copied into a read-only text box (`#uploader…`) |
| 3 | (none) | `editID` | hidden | – | flange id (sample 1) | |

Button: "Add" (blue, block, `name="addFlangeDoc"`, type submit, class `btn-hideEdit`).

Form 2 (`#flangeHardcopyEvidenceForm`, `enctype="multipart/form-data"`, no action; submitted by script), green panel "Signed hard-copy protocol" (help text: this evidence is linked to the flange protocol and needs QA/QC validation before it can support release):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 4 | (none) | `_csrf` | hidden | – | session token | |
| 5 | (none) | `flange_id` | hidden | – | flange id (sample 1) | |
| 6 | Signing role | `signer_role` | select | no | Technician | 2 options: technician → Technician (default), qaqc → QA/QC |
| 7 | Signer name | `signer_name` | text | **yes** | empty | |
| 8 | Signing date | `signed_date` | date | **yes** | empty | |
| 9 | Document reference | `reference` | text | **yes** | empty | |
| 10 | Signed protocol file (text box placeholder "No file selected") | `hard_copy_file` | file | **yes** | none | accepts `.pdf`, `image/jpeg`, `image/png`, `image/webp` |

Button: "Upload signed hard-copy" (green, type submit).
Below the forms: a table with header cells "#", "File" and an empty third header; no rows for the sample flange. Footer: "Close". The dialog's script also starts a date picker (`.dpicker`, format dd.mm.yyyy), though no `.dpicker` field is in this dialog.

### Delete Flange (`#deleteFlange`) — opened by the trash in a row
Form `method="post"`. Body text: "Are you sure?".
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `deleteID` (`#bookIdDeleteFlange`) | hidden | – | empty in the page; set from the row's `data-id` when opened | |
Buttons: "Delete" (red, trash icon, `name="deleteFlange"`, type submit), "Cancel".

### Filter (`#filterFlanges`) — opened by the "Filter" button
Form `method="get"`. 3 fields.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `page` | hidden | – | flanges | |
| 2 | Project | `project` | select (select2) | no | All | 2 options: "" → All (default); 1 → 20240101 |
| 3 | Finished? | `finished` | select (select2) | no | -------- | 3 options: "" → -------- (default); 0 → No; 1 → Yes |
Buttons: "Filter" (blue, `name="filterIsoExecution"`, submit), "Cancel". The Export URL carries the parameters `project` and `finished` (values 0 and empty in the capture).

### Flanges — Report (`#pdfFlangeReport`) — opened by the "Report" button (needs ticked rows)
Form `action="../core/pdf/flange-report.php" method="get" target="_blank"`. 5 fields.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `cb` (`#t29xl`) | hidden | – | empty; the script writes the ticked flange ids, comma-separated | |
| 2 | (none) | `project` | hidden | – | empty | |
| 3 | (none) | `finished` | hidden | – | empty | |
| 4 | (none) | `projectsite` | hidden | – | 1 | |
| 5 | Language | `lang` | select (select2) | no | English | 4 options: en → English (default); nl → Nederlands; de → Deutsch; fr → Français |
Buttons: "Go" (blue, `name="go"`, submit, `onclick="refreshIt()"`), "Cancel". The PDF opens in a new tab.

### Import Flanges (`#importFlanges`) — present in the page; no control of the page was seen opening it
The "Excel import" button is a link, not a dialog trigger. The dialog exists in the DOM with an info alert in Dutch (text: use the Excel import wizard: upload, preview with validation, then commit), a link "Open Excel import" → `/weldpilot/index.php?page=flanges-import`, and a "Cancel" button. No inputs.

### Excel import page (`page=flanges-import`)
The capture shows only the shared page frame and the message "You do not have rights to open this page." for the observing account. Nothing else of the page (upload form, preview, commit) is visible.

## Rules found in the page's JavaScript
- Row selection (jQuery block "wsappsUpdateFlangeSelection"): the ids of all ticked row checkboxes (`#datatableDashboardList2 tbody input[id^="id_"]`) are joined by commas and written to `#t29xl` (the hidden `cb` of the Report dialog). With no ticked row, `#laydownTransportID`, `#flangeExportSelected` and `#pdfFlangeLabelsID` get class `disabled` and `aria-disabled="true"`; with at least one they are enabled. Runs on every checkbox change and on every table redraw.
- Select-all (`#flangeCheckAll`): sets every row checkbox that matches the current search (rows of the filtered set, all pages) to the header checkbox state. The header checkbox is ticked when there is at least one row checkbox and all rendered row checkboxes are ticked.
- Export click: reads `data-export-url`; if there are no ids or the URL is empty the click is stopped (guard line present); otherwise `window.location` goes to the URL plus `?cb=<ids>` (or `&cb=` when the URL already has `?`).
- Report click: stops when disabled or when `#t29xl` is empty; otherwise opens `#pdfFlangeReport`.
- Print labels click: stops when disabled; takes ids from `#t29xl` and opens `../core/pdf/flange-labels.php?ids=<ids>` in a new tab (`window.open`, `_blank`).
- Responsive columns (`wsappsFitFlangeListColumns`, run once after load and on every window resize): the table is wrapped in a scroll container (`flange-list-scroll`). Using the width of that container, columns are shown only when the width reaches a minimum: Status (index 8) 560, Flange Size (4) 720, Asset tag (3) 860, Target Moment (6) 1000, Gasket Type (5) 1140, Criticality (7) 1280 (pixels). Project, Iso number, Flange ID, Options and the checkbox column are always kept.
- Table options: `autoWidth: true`; columns -2 (Options) and -1 (checkbox) are neither orderable nor searchable; the checkbox column has class `flange-check-col`; column 2 has class `flange-id-col`.
- Requests seen when a row dialog or Add is used (all GET, JSON unless stated):
  - `/core/ajax/editFlange.php?id=<id>&action=showroom` (HTML body of the Edit dialog).
  - `/core/ajax/docsFlange.php?id=<id>&action=showroom` (HTML body of the Documents dialog).
  - `/core/ajax/flanges.php?action=catalog_lookup&flange_size=<value>&flange_rating=<value>` — answers `success`, `catalog`, `match`, `proposal`, `hint`, `fill_fields` (when the capture shows no match: `catalog:""`, `match:false`, `proposal:null`, and the 15 field names `stud_dia, studbolt_afmeting, aantal_studbolts, target_moment_nm, first_pass_nm, second_pass_nm, max_dev, target_stress, flange_rate_size, gasket_type, gasket_material, lubricant_used, matl_studbolts, materiaal_moer, torque_wrench_type`) and `apply_label` ("Fill empty fields from catalog"). The page's own script that calls it is in the shared script and not shown in this capture.
  - `/core/ajax/flanges.php?action=isometric_lookup&isometric=<isometric id>` — answers `success`, `match`, `proposal` (keys `line_number, pid, pipe_class, area_unit, location, irnno, testPressure`) and `fill_fields` (the keys that have a value). For isometric id 1 the proposal was line_number "N011-HV10001-0001", pid "N011-HV10001", pipe_class "A11011", area_unit "A1", location null, irnno "1000", testPressure "29"; for id 6 all values were null and `fill_fields` was empty.
  - `/core/ajax/ajax-notifications.php?action=count_unread` (shell, answers `{"count":0}`).
- Hard-copy upload (script inside the Documents dialog): submit of `#flangeHardcopyEvidenceForm` is stopped and sent as `POST /core/ajax/flanges.php` with multipart data = the form fields plus `action=protocol_hardcopy_upload`; on success the dialog closes and the page reloads; on failure an alert shows the server's `error` or "Hard-copy upload failed.".
- Script text present in this page but belonging to the flange detail page (`page=flanges&flange_id=<id>`), not to the list: `flangeToggleMethodFields` (shows the method fields when `.flange-tightening-method` is not empty; pressure A/B fields for `hydraulic_torque`; `method_tension_kn` for `bolt_tensioning`), `flangeUpdateAlignmentDifferences` (absolute difference of `alignment_after_*` and `alignment_before_*`, 3 decimals, "-" if either is not a number), workflow form (`flanges.php`, action `transition`; params `flange_id`, `to_status`, `reason`, `_csrf`), protocol save (`protocol_save`; `flange_id`, `form_data` JSON, `_csrf`), technician sign-off (`protocol_technician_signoff`; alert "Confirmation is required." if the statement checkbox is not ticked), QA/QC sign-off (`protocol_qc_signoff`; also `qc_note`), protocol PDF (`protocol_pdf_generate`), registration forms (data-action, or `deviation_close`), validation preview (`validation_preview`) and commit (`validation_commit`; confirm text "Record the displayed proposals for review? This does not change flange master data."), signature canvas drawing. All post to `../core/ajax/flanges.php` with `_csrf`.
- Add/Edit validation messages: none found in the capture (only the browser-level required check on `isometric`).

## Sample data
Counts: total 1, shown 1 ("Showing 1 to 1 of 1 entries"); page length 100.

| Project | Iso number | Flange ID | Asset tag | Flange Size | Gasket Type | Target Moment (Nm) | Criticality (hidden) | Status |
|---|---|---|---|---|---|---|---|---|
| 20240101 | 0001 | 1 | 2 | 2 / 2 | 2 | 2 | 12 (from the Edit dialog; the column is not drawn) | Planned |

Row options present: eye (`flange_id=1`), pencil (`data-id=1`), file (`data-id=1`), trash (`data-id=1`); checkbox `id_1` value 1.

Values of flange 1 in the Edit dialog: flange_id 1, from_equipment 1, to_equipment 1, eq_con 1, irnno t1, criticality 12, high_risk unchecked, pid 2, line_number 2, fluid_code 2, pipe_class 2, area_unit 2, location 2, flange_type 2, flange_size 2, flange_rating 2, flange_rate_size 2, gasket_type 2, gasket_material 2, studbolt_afmeting 2, stud_dia 2, aantal_studbolts 20, lubricant_used 2, matl_studbolts 2, materiaal_moer 2, torque_wrench_type 2, torque_wrench_id 2, first_pass_nm 2, second_pass_nm 2, target_moment_nm 2, target_stress 2, max_dev 2, tightning_date empty, report_nr 2, operator 2, cqi 2, commisioning_date empty, rejection_type 2, insp_result 2, operatingPressure empty, operatingTemp empty, testPressure 29, note empty.

Isometric options of the project 20240101: 0001, 00022, 0003, 00032, 0005, 0007, WF-73031-ST_STB000-01 (ids 1, 6, 895, 6191, 6598, 15767, 15424).

## Not in the capture
- The flange detail page (eye icon, `page=flanges&flange_id=<id>`): described only in the browser-pass notes, not captured in the files of this note.
- The result of the Add, Update, Delete, Filter, Report ("Go"), Export and Print labels actions (none was clicked).
- Add dialog datalist entries (`#flangeCatalogSizes`, `#flangeCatalogRatings`) and the title and hint text of the catalog panel (shown only when a catalog match exists; none in the capture).
- Table rows beyond the single sample row; the column visibility at other widths.
- The Excel import wizard (upload, preview, commit): the page gave "You do not have rights to open this page."
- The page's own script for filling Add/Edit fields (catalog and isometric prefill) is in the shared script and not in this capture.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, importCalculationsFromIso, importCalculationsFromIsoProject, removeLastCalculations, markPunchAsRemoved, setCheckedMaterialsTypeModal, deleteCheckedMaterialsModal, setStatus, statusLog, showIsometric, punchlist, punchlistEdit, showQuantityLog, materialStatusByRevision, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal (the last one is opened by the handheld menu "Scan flange QR label").
