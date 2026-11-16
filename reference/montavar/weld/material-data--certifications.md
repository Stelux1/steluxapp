# Weld Pilot → Material data → Certifications

Source: `weld__material__certifications.txt`, `weld__material__certifications-import.txt`, `weld__material__certifications__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=certifications` (import wizard: `/weldpilot/index.php?page=certifications-import`).
State of the page for the observing account: normal.

## Page
- Browser title: "Certifications - WeldPilot®". Panel heading: "Certifications" (with a "+" button that opens `#addCertification`). Breadcrumb: "Certifications" (`/weldpilot/index.php?page=certifications`). No tabs.
- Buttons above the list (top bar):
  - "Import certifications" → link to `/weldpilot/index.php?page=certifications-import` (the import wizard, see below).
  - "Export to ZIP" (`#certExportZip`) → `/core/export/certifications-zip.php?project=`; a script turns the click into a hidden-iframe download (see Rules).
  - "Add certification" → opens dialog `#addCertification`.
  - "Refresh" → link `/weldpilot/index.php?page=certifications&refresh=ok&project=`.
- Toolbar inside the panel (left to right): search box `#certSearch` (placeholder "Search", with a clear button `#certSearchClear`); page-length select `#certPageLength` (25 / 50 / 100 / 500, shown 25); project filter select `#certFilterProject` (options: 0 → "All projects", 1 → "20240101"; shown "All projects"); export buttons "CSV", "Excel" and a print button (icon only).
- A bulk bar `#certBulkBar` is hidden until rows are ticked; see List.
- Language links in the header (Nederlands, English, Deutsch, Français) carry `page=certifications`.

## List
- Table `#datatableCerts`, server-side DataTable. Request: GET `/core/ajax/certifications.php?id=1&project=` (the capture shows the `draw` counter at 1 to 5 in the recorded requests, so the list was requested repeatedly while the page was open). Total rows: 3,665; the info text reads "Showing 1 to 5 of 5 entries (filtered from 3,665 total entries)".
- Columns in order (all visible; sortable unless noted):
  1. Index number (data 0)
  2. Charge number (1)
  3. Certificate-type (2)
  4. Attest number (3)
  5. Material No (4)
  6. Type of material (5)
  7. Material part (6)
  8. Basic material (7)
  9. Dia. (8)
  10. Schedule (9)
  11. Wall thickness (10)
  12. Supplier (11)
  13. Ctrl. (12, centred; shown as a check or cross icon)
  14. Accp. (13, centred; check or cross icon)
  15. Options (not sortable)
  16. Select-all checkbox `#certSelectAll` (header; not sortable; each row has a checkbox `.cert-row-check` with `data-id` = row id)
- The Index number cell shows a file icon (link `../core/export/down.php?file=certifications/<project>.<index>.pdf`, new tab) in front of the number when a PDF is attached.
- Columns 2 to 14 carry the class `hide-on-small` (hidden on small screens); some have priority classes `cert-col-priority-min`, `-med`, `-low`.
- Default sort: configuration `order: [[13,"asc"]]` (column index 13, counted from 0 = "Accp."), ascending. The five displayed rows are in the order 0005, 0003, 0004, 0002, 0001.
- Page length options: 25 (default), 50, 100, 500.
- Per-column search inputs: none. Global search: `#certSearch` (script calls `tableCerts.search(value).draw()` on every keystroke).
- Filter: project select `#certFilterProject`. A dialog `#filterCertificates` ("Filter") with a "Project" select exists in the page, but no control in the capture points to it.
- Row options (column Options), in order:
  1. pencil, title "Edit" → `#editCertification` (class `open-editCertification`)
  2. list icon, title "Show" → `#findCertification` (class `open-findCertification`)
  3. trash, title "Delete" → `#deleteCertification` (class `open-deleteCertification`)
- Bulk actions: `#certBulkBar` (hidden, shown text "0 selected" when nothing is ticked) with two selects "Controlled" and "Accepted" (each: "" → "Don't change", 1 → "Yes", 0 → "No"; shown "Don't change") and a button "Apply" (`#certBulkApply`). The capture contains no handler for this bar.
- Export/print: "CSV", "Excel", print icon (DataTables buttons `buttons-csv`, `buttons-excel`, `buttons-print`).
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries"; empty "No data available in table"; no match "No matching records found"; search label empty.

## Dialogs

### Add certification (`#addCertification`, large) — opened by "Add certification" (top bar and panel "+")
Form: method post, enctype multipart/form-data.
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Charge number | chargeNo (`#fChargeNo`) | text | no | empty | |
| 2 | Attest number | attestNo | text | no | empty | |
| 3 | Material | materialDB | hidden-style text input turned into a searchable select, placeholder "Choose Material from DB" | no | empty | list of materials loaded by script `/core/ajax/getAllMaterials.php` (searchable) |
| 4 | Diameter | diameter (`#fDiameter`) | select (select2) | no | shows first option `1/2"` | 500 options, no empty entry. First 10: 1 → 1/2", 2 → 3/4", 3 → 1", 4 → 1.1/4", 5 → 1.1/2", 6 → 2", 7 → 2.1/2", 8 → 3", 9 → 3.1/2", 10 → 4" (later entries include 4.75", sizes up to 48", and reducer sizes such as 3/4"x1/2") |
| 5 | Material part | materialPart (`#fMaterialPart`, class `materialPart`) | select (select2) | no | shows first option "Pipe" | 68 options, no empty entry. First 10: 2 → Pipe, 3 → Elbow 45, 4 → Elbow 90, 5 → Flange, 6 → Valve, 7 → Cap, 8 → Reducer, 9 → Nipolet, 13 → Outlet, 14 → Plug |
| 6 | Type of material | typeMaterial (class `typeMaterial`) | select (select2) | no | shows first option "A234 Gr WPB/CS/Fitting/" | 131 options, no empty entry; text form here is like "A106 Gr B/CS/Pipe/". First 10: 3 → A234 Gr WPB/CS/Fitting/, 9 → A106 Gr B/CS/Pipe/, 10 → A105/CS/Flange/, 11 → A216 Gr WCB/CS/Valve/, 12 → A335 Gr P1/HTCS/Pipe/, 13 → A234 Gr WP1/HTCS/Fitting/, 14 → A182 Gr F1/HTCS/Flange/, 15 → A217 Gr WC1/HTCS/Valve/, 18 → A312 RVS316L/SS/Pipe/, 19 → A403 WP316L/SS/Fitting/ |
| 7 | Schedule | schedule (`#fSchedule`) | text | no | empty | |
| 8 | Wall thickness | wallThickness (`#fWwallThickness`) | text | no | empty | |
| 9 | Hot yield | hotyield | text | no | empty | |
| 10 | Impact strength | impact | text | no | empty | |
| 11 | Certificate-type | certificateType (`#fCertType`) | text | no | empty | |
| 12 | Supplier | supplier | select (select2) | no | shows first option "PFF BV Klundert" | 8 options: 1 → PFF BV Klundert, 2 → VAN LEEUVEN JR BUIZENHANDEL BV NL, 3 → ELIMP D.O.O. RS, 4 → HONEX D.O.O. RS, 5 → Bus Industrial Tools Roosendaal, 6 → Montavar Metalna Lola D.O.O., 7 → Technip Energies, 8 → Tecnicas Reunidas S.A. |
| 13 | Project | project[] | multi-select (select2) | no | nothing selected | 3 options: 0 → "--------", ALL → "ALL", 1 → "20240101" |
| 14 | Controlled | controlled (`#checkboxControl`) | checkbox, value 1 | no | unchecked | |
| 15 | Accepted | accepted (`#checkboxAcc`) | checkbox, value 1 | no | unchecked | |
| 16 | Note | note (`#wsapps-quill-vv02418c`) | textarea (hidden source of a rich-text editor) | no | empty | the editor toolbar has bold, italic, two list buttons, four alignment buttons and a clear-format button |
| 17 | File | file | file | no | none ("Nothing selected" in the companion text box `#uploader4AA`, which is not a named field) | button text "Choose file" |

Buttons: "Add" (`#addCerts`, submit, name `addCertification`), "Cancel" (closes), header close "×".

### Edit certification (`#editCertification`, large) — opened by the pencil icon of a row
Body is not part of the page: it is requested on click (see Rules). Opened for row id 1 in `weld__material__certifications__edit.txt`: GET `/core/ajax/editCertification.php?id=1&action=showroom` (status 200). Values below are those of that row (Index 0001).
| # | Label | name | Type | Required | Default (row 1) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Charge number | chargeNo | text | no | 11111 | |
| 2 | Attest number | attestNo | text | no | 22222 | |
| 3 | Material (searchable field, hidden until "Change" is clicked) | materialDB | text turned into a select | no | 7633186631 | shown only after the "Change" link; it is the same material list as in the Add dialog |
| 4 | Material (read-only text, with link "Change") | materialDBb | text, readonly and disabled | no | 7633186631 | link "Change" (`.enable`) hides this box and shows field 3 |
| 5 | Diameter | diameter (`#fDiameter`) | select (select2) | no | 1 → 1/2" | 501 options: the 500 of the Add dialog plus 0 → "--------" at the start |
| 6 | Material part | materialPart (`#fMaterialPart`) | select (select2) | no | 2 → Pipe | 69 options: 0 → "--------" plus the 68 of the Add dialog |
| 7 | Type of material | typeMaterial | select (select2) | no | 9 → "A106 Gr B / CS / Pipe / C-Si" | 132 options: 0 → "--------" plus 131. Text form here has spaces and a fourth part, e.g. 3 → A234 Gr WPB / CS / Fitting / C-Si, 10 → A105 / CS / Flange / C-Si, 11 → A216 Gr WCB / CS / Valve / C-Si, 12 → A335 Gr P1 / HTCS / Pipe / 9Cr-1 Mo-V, 13 → A234 Gr WP1 / HTCS / Fitting / 9Cr-1 Mo-V, 14 → A182 Gr F1 / HTCS / Flange / 13CrMo4 4, 15 → A217 Gr WC1 / HTCS / Valve / C-½ Mo, 18 → A312 RVS316L / SS / Pipe / 316L, 19 → A403 WP316L / SS / Fitting / SS |
| 8 | Schedule | schedule | text | no | 40 | |
| 9 | Wall thickness | wallThickness | text | no | 7,2 | |
| 10 | Hot yield | hotyield | text | no | empty | |
| 11 | Impact strength | impact | text | no | empty | |
| 12 | Certificate-type | certificateType | text | no | 3.1 | |
| 13 | Supplier | supplier | select (select2) | no | 1 → PFF BV Klundert | same 8 options as in the Add dialog |
| 14 | Project | project[] | multi-select (select2) | no | 1 → 20240101 selected | 0 → "--------", ALL → "ALL", 1 → "20240101" |
| 15 | Controlled | controlled (`#checkboxControl1`) | checkbox, value 1 | no | checked | |
| 16 | Accepted | accepted (`#checkboxAcc1`) | checkbox, value 1 | no | checked | |
| 17 | Note | note | textarea (plain here, no editor toolbar) | no | "test" | |
| 18 | File | file (`#file1`) | file | no | none | button "Choose file"; companion text box `#uploader4cv1` (not a named field) |
| 19 | (hidden) | editID | hidden | — | 1 (row id) | |

Footer: checkbox "Copy file" (name `myfile`, value `ok`, class `btn-hideInsert`); "Duplicate certificate" (green, submit, name `addCertification`, class `btn-hideInsert`); "Update" (blue, submit, name `editCertification`, class `btn-hideEdit`); "Cancel". The duplicate button submits under the same name as the Add dialog's "Add" button.

### Show certification (`#findCertification`, large) — opened by the list icon of a row
Header "Show certification"; footer "Cancel". Body (`#contentFindCertification`) is loaded by request: GET `/core/ajax/findCertification.php?id=<row id>`. The body is not in the capture.

### Delete certification (`#deleteCertification`) — opened by the trash icon of a row
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | deleteID (`#bookIdDeleteCertification`) | hidden | — | filled by script with the row id | |
Text: "Are you sure?". Buttons: "Delete" (red, trash icon, submit, name `deleteCertification`), "Cancel".

### Filter (`#filterCertificates`) — no control of this page points to it in the capture
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | page | hidden | — | certifications | form method get |
| 2 | Project | project | select (select2) | no | "All" | 2 options: "" → All, 1 → 20240101 |
Buttons: "Filter" (primary, submit, name `go`), "Cancel".

### Import certifications (`#importCertification`) — present in the page; the top-bar "Import certifications" button links to the wizard page instead
Header "Import certifications". Body: an info box (Dutch text, roughly: use the Excel import wizard — upload, preview with validation, then commit) and a button "Open Excel import" (link to `/weldpilot/index.php?page=certifications-import`). Button: "Cancel". No form fields.

### Import wizard page (`/weldpilot/index.php?page=certifications-import`, `weld__material__certifications-import.txt`)
Title "- WeldPilot®" (empty page name). Breadcrumb: "Certifications" (link to the list) → "Import certifications". Panel heading "Import certifications". Info text: upload an Excel (XLSX) file; a preview with error highlighting per cell follows. "Templates:" with link "Download Excel template" (`/core/export/templates/certifications_import_template_xlsx.php`, new tab).
Form `#certImportUploadForm` (multipart):
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Excel file (.xlsx) | file | file, accept `.xlsx` | yes | none | |
Buttons: "Upload" (submit), "Cancel" (link back to the list).
Hidden until an upload: status box `#certImportStatus`, button "Commit import" (`#certImportCommitBtn`, green), table `#certImportTable` with header cells "#", "Actie", "Index", "Charge", "CertType", "Attest", "Wall", "Schedule", "TypeMaterial", "MaterialPart", "Diameter", "Supplier", "Ctr", "Acc", and a summary line `#certImportSummary`.
Preview rows (built by script): column Actie is a select with options "import" / "skip"; Index, Charge, CertType, Attest, Wall and Schedule are plain text copies of the uploaded cells; TypeMaterial, MaterialPart, Diameter and Supplier are selects (class `ci-map`, data-field `typeMaterialId`, `materialPartId`, `diameterId`, `supplierId`) filled from server lists; Ctr and Acc are selects with 0 → "No", 1 → "Yes" (data-field `controlled`, `accepted`). A cell is marked as error or ok according to the row's error flags (`typeMaterialS`, `materialPartS`, `diameterS`, `supplierS`, `controlledS`, `acceptedS`). A row set to "skip" gets class `ci-row-skip`.

## Rules found in the page's JavaScript
List page:
- Toolbar script: moves the export buttons into the filter toolbar; search box typing calls the table's `search(value).draw()` and toggles a "has value" style; the clear button empties the box and redraws.
- Row click handlers: `.open-findCertification` requests `/core/ajax/findCertification.php?id=<row id>` and writes the result into `#contentFindCertification`; `.open-editCertification` requests `/core/ajax/editCertification.php?id=<row id>` (GET) into `#contentEditCertification`, hides the `.hideM` block (searchable material field), and turns on a click handler on "Change" (`.enable`) that shows `.hideM` and hides `.showM` (the read-only text). `.open-deleteCertification` copies the row id into `#bookIdDeleteCertification`.
- Edit dialog, material field: when the searchable material list (`window.data`, loaded from `/core/ajax/getAllMaterials.php`) exists, the field becomes a select2 with a client-side filter (case-insensitive contains, 20 results per page). The current value is matched against the list by full text, first word, or id. On change, the first word of the chosen text is taken as the material number and sent to `/core/ajax/checkMaterial.php` (data parameter `my`). The answer is split at the first dot: the first part sets the Material part select (integer), the second part sets the Type of material select; either is skipped when empty.
- Export to ZIP: click is intercepted; a token is built and the iframe loads the export URL with an added `dl=<token>`; the button shows a spinner and the text "Generating ZIP…" and is disabled; an info toast "The certificate ZIP is being prepared. The download starts when it is ready." appears. A cookie `certzip_done_<token>` is polled every 800 ms: value `1` → success toast "ZIP is ready — the download has started."; value `err` → error toast "The ZIP could not be created."; anything else or after 600 s → warning "This is taking longer than expected. Check your downloads."
- The page also loads `/core/ajax/getListOfMaterials.php` (parameters `id`, `timer`, `ajax`) and `/core/ajax/searchProject.php` from the shared script; these belong to other dialogs and their use on this page is not shown.
- No client-side validation of the Add or Edit forms found in the capture. The handler for the bulk bar "Apply" and for `#certFilterProject` is not in the capture.

Import wizard:
- Base URL for its requests: `https://montavar.websonik.nl/core/ajax/certificationsImport/` (endpoint names were cut from the capture). Upload submit: shows "Uploaden en valideren..."; on success reports "Batch aangemaakt (#<id>). Corrigeer fouten en commit daarna." and loads the lookups and the batch rows; on failure shows the server error or "Upload mislukt".
- Changing a row's Actie select or a mapping select sends a request with `rowId`, `field`, `value` and then reloads the batch.
- After rendering, the summary reads "Rijen: <n> | Errors: <n> | Importeerbaar nu: <n>" and "Commit import" is shown only if at least one row is importable.
- "Commit import" asks `confirm`: only rows without errors are imported (Dutch text: "Commit: alleen rijen zonder errors worden geïmporteerd. Doorgaan?"); then shows "Commit bezig..." and, on success, "Gecommit. Inserted: <n> | Skipped: <n>".

## Sample data
Total 3,665 entries; the sandbox project shows 5 ("Showing 1 to 5 of 5 entries (filtered from 3,665 total entries)"). Rows (row id equals the index number without zeros: 5, 3, 4, 2, 1). In the Ctrl./Accp. columns "✓" = check icon, "✗" = cross icon. "PDF" = file icon link in the Index number cell.

| Index number | Charge number | Certificate-type | Attest number | Material No | Type of material | Material part | Basic material | Dia. | Schedule | Wall thickness | Supplier | Ctrl. | Accp. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0005 | 1212 | 152516 | - | - | A106 Gr B | Pipe | 4 | 48" | 40 | 19 | PFF BV | ✗ | ✗ |
| 0003 (PDF) | 564321 | 3.1 | 6544 | 7633186631 | - | Cap | - | 1" | 40 | 7.2 | PFF BV | ✓ | ✗ |
| 0004 | 98784987 | 3.1 | - | - | A234 Gr WPB | WN OR Fl | C-Si | 1/2" | NA | 2 | PFF BV | ✗ | ✗ |
| 0002 (PDF) | ada | 5 | sdada | 8138259941 | A105 | WN OR Fl | C-Si | - | 1 | 2 | PFF BV | ✓ | ✗ |
| 0001 (PDF) | 11111 | 3.1 | 22222 | 7633186631 | A106 Gr B | Pipe | C-Si | 1/2" | 40 | 7,2 | PFF BV | ✓ | ✓ |

Row 0001 in the edit dialog: Hot yield and Impact strength empty, Note "test", project 20240101, supplier "PFF BV Klundert".

## Not in the capture
- Body of "Show certification" (`#findCertification`): loaded by the list-icon click.
- Edit dialog for rows other than 0001; the "Add" dialog's material search results (list from `getAllMaterials.php`).
- Handler and result of the bulk bar "Apply", of the project filter `#certFilterProject`, and of the CSV / Excel / print buttons (library buttons; output not captured).
- Server messages after "Add", "Update", "Duplicate certificate" and "Delete" submits (nothing was submitted).
- The import wizard after an upload: status texts from the server, preview rows, validation errors, endpoint names, the template file contents.
- Rows beyond the 5 shown (the sandbox project has 5; 3,665 is the unfiltered total).
- From the browser-pass notes: the Edit dialog was opened by hand and the "Duplicate certificate" button was identified as the submit that creates a copy; no separate duplicate dialog or row icon exists. Index numbers with a blue file icon have an attached PDF. The notes say the list re-polls the server by itself.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#docsFlange`, `#deleteFlange`, `#importFlanges`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
