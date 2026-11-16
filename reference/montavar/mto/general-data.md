# MTO Pilot → General data → Project sites, Storehouses (no rights)

Source: `mto__general__project-sites.txt`, `mto__general__storehouses.txt` — captured 2026-11-16 on the sandbox project site, read-only. URLs: `/mtopilot/index.php?page=project-sites` and `/mtopilot/index.php?page=lagers`.
Dialog bodies that the MTO capture only names by `SAME-AS` were read in `weld__general__project-sites.txt` (same template, same page, WeldPilot) and in `weld__general__project-sites__edit-zandbak.txt` (the Edit dialog loaded for project site id 1). The Edit body is therefore the WeldPilot-captured content of the same record; the MTO page itself does not show it.

State of the page for the observing account: Project sites: normal. Storehouses: "You do not have rights to open this page."

---

## Project sites (`?page=project-sites`)

### Page
- Browser title: "Project sites - MTOPilot®".
- Top bar: link "Project sites" → `/mtopilot/index.php?page=project-sites`.
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Panel heading: home icon (glyphicon-home) + "Project sites".
- Buttons above the list:
  - "+" (glyphicon-plus, no text, `.btn-primary`, `.btn-block`) → opens `#addProjectSite` (Bootstrap modal, `href="#addProjectSite"`).
  - "CSV" (`.buttons-csv`, `href="#"`) → DataTables Buttons export (not clicked).
  - "Excel" (`.buttons-excel`, `href="#"`) → DataTables Buttons export (not clicked).
  - Print icon (fa-print, `.buttons-print`, `href="#"`) → DataTables Buttons print (not clicked).

### List
- Table id `datatableWarehouse`, DataTables, client-side (`"ajax": null`, `serverSide: false`). The rows are in the HTML; no list request is made on load (the only request on load is `/core/ajax/ajax-notifications.php?action=count_unread`).
- Columns in order (header row and DT config agree):
  1. Name (link per row, see below)
  2. Address
  3. Phone
  4. Email address
  5. IRN Code
  6. Options (not hidden, sortable flag set in config)
- Hidden columns: none (all `vis: true`).
- Default sort: column index 4 (IRN Code), ascending.
- Page length: default 20. Length options: 5, 20, 50, 100, 500. Label "Show" … "entries".
- Search: one global search box, placeholder "Search", with a clear button (aria-label "Clear"). No per-column search inputs. No filters.
- Row options, in order, per row (all buttons in the Options column):
  1. Folder-open icon (glyphicon-folder-open, `btn-warning`, `btn-block`, `btn-xs`) → link `/mtopilot/index.php?page=project-sites&id=<id>&view=projects` (not followed).
  2. Pencil (glyphicon-pencil, class `.buttonEdit .open-editProjectSite`, `btn-warning`) → opens `#editProjectSite` for the row id (`data-id`).
  3. Trash (glyphicon-trash, class `.buttonDelete .open-deleteProjectSite`, `btn-danger`) → opens `#deleteProjectSite` for the row id.
  4. Upload icon (glyphicon-upload, class `.open-importEst`, `btn-warning`) → opens `#importEst` for the row id.
- Name cell: link `/mtopilot/index.php?page=project-sites&id=<id>&view=projects&redirect=<id>`. (Not followed.)
- Bulk actions (Options menu): none in the capture.
- Export / print: CSV, Excel, Print (see Page).
- Info text: "Showing 1 to 3 of 3 entries" (DataTables info template "Showing _START_ to _END_ of _TOTAL_ entries").
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none (`"ajax": null`).

### Dialogs

Four dialogs are opened by controls on this page. Every one is listed below.

#### Add project site (`#addProjectSite`) — opened by the "+" button above the list
Body has three tabs: Project settings (`#tab4_1b`, active), Document settings (`#tab4_2b`), Iso progress (`#tab4_6b`). There is no ISO Book or Memo templates tab in the Add dialog.

Project settings tab

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | empty | |
| 2 | Address | address | text | yes | empty | |
| 3 | Zip code | zip | text | no | empty | |
| 4 | Residence | residence | text | no | empty | |
| 5 | Phone | phone | text | no | empty | |
| 6 | Email address | email | text | no | empty | |
| 7 | (hidden) | siteValidation | hidden | — | 0 | pairs with #8 |
| 8 | Mandatory fields | siteValidation | checkbox (value `ok`) | no | unchecked | ticked = value `ok` |
| 9 | Flange tightening standard | flange_tightening_catalog | select | no | "No catalog (free entry)" (cur) | 3 options: (empty value) → No catalog (free entry); asme_b165 → ASME B16.5 torque table (2012); gasunie_csw43 → Gasunie CSW-43 table B. No option is marked as default in the Add dialog; the cur value is "No catalog (free entry)". |
| 10 | (hidden) | siteWpsValidation | hidden | — | 0 | pairs with #11 |
| 11 | Validation on WPS | siteWpsValidation | checkbox (value `ok`) | no | unchecked | |
| 12 | Project-specific Material Certificates | certproject | checkbox (value `ok`) | no | unchecked | |
| 13 | Material Management Display Setting | mtotype | checkbox (value `ok`) | no | unchecked | |
| 14 | Defect norm | defect_norm | select | no | "No norm selected" (cur) | 4 options: (empty) → No norm selected; iso6520 → ISO 6520-1; asme → ASME B31.3; api1104 → API 1104 |
| 15 | Repair performance | repair_performance_limit | number (min 0, max 100, step 0.1) | no | empty | placeholder "5" |
| 16 | NDT measurement: Inch-weighted | ndt_progress_basis | radio (value `inch`) | — | selected | help text: "A DN500 weld counts more than a DN15 weld." |
| 17 | NDT measurement: Per weld | ndt_progress_basis | radio (value `count`) | — | not selected | help text: "10 welds with NDT required, 1 Accepted = 10% of the NDT weight." |
| 18 | Archived | archived | checkbox (value `ok`) | no | unchecked | |

Iso progress tab (`#tab4_6b`; the weight inputs carry class `.wsapps-weight-active`, type number, min 0, max 100)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 19 | (hidden) | punch_prefab | hidden | — | 0 | |
| 20 | (hidden) | hydro_prefab | hidden | — | 0 | |
| 21 | (hidden) | paint_prefab | hidden | — | 0 | |
| 22 | Distribution - Shop | destruction_prefab | number | no | 50 | sums, see Rules |
| 23 | Welds - Shop | welds_prefab | number | no | 0 | |
| 24 | NDT - Shop | ndt_prefab | number | no | 0 | |
| 25 | Material pipe - Shop | material_prefab | number | no | 0 | |
| 26 | Supports - Shop | shoes_prefab | number | no | 0 | |
| 27 | Appendages - Shop | appendages_prefab | number | no | 0 | |
| 28 | Distribution - Field | destruction_field | number | no | 50 | |
| 29 | Material pipe - Field | material_field | number | no | 0 | |
| 30 | Welds - Field | welds_field | number | no | 0 | |
| 31 | NDT - Field | ndt_field | number | no | 0 | |
| 32 | Supports - Field | shoes_field | number | no | 0 | |
| 33 | Appendages - Field | appendages_field | number | no | 0 | |
| 34 | Punch - Field | punch_field | number | no | 0 | |
| 35 | Distribution - Site | destruction_site | number | no | 0 | |
| 36 | Hydrotest | hydro_field | number | no | 0 | |
| 37 | Paint/Tracing | paint_field | number | no | 0 | |

Document settings tab (`#tab4_2b`)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 38 | Prefix | prefix | text | no | empty | |
| 39 | Release doc drawing no | prefixtype | select (class form-control, type attr text) | no | "Drawing no + iso" (cur) | 2 options: 0 → Drawing no + iso; 1 → Prefix + iso |
| 40 | Hydrotest Execution Plan | hydroplan | text | no | empty | |
| 41 | Flange procedure No. | flange_procedure_no | text (maxlength 100) | no | empty | |
| 42 | Subcontractor QA/QC | field1 | text | no | empty | placeholder "eg. Subcontractor QA/QC" |
| 43 | Subcontractor Construction | field2 | text | no | empty | placeholder "eg. Subcontractor Construction" |
| 44 | Principal UI | field3 | text | no | empty | placeholder "eg. Principal UI" |
| 45 | Contractor QA/QC | field4 | text | no | empty | placeholder "eg. Contractor QA/QC" |
| 46 | Contractor Construction | field5 | text | no | empty | placeholder "eg. Contractor Construction" |
| 47 | NoBo | field6 | text | no | empty | placeholder "eg. NoBo" |
| 48 | Doc.No. & Rev.No. (Visual Inspection) | vtinfo | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 49 | Procedure No. (Visual Inspection) | vtinfo2 | text | no | empty | placeholder "eg. CSW-01-N" |
| 50 | VT type 2 no: | vt2no | text | no | empty | placeholder "eg. VT-MNT-MNT-00078" |
| 51 | VT type 2 rev: | vt2rev | text | no | empty | placeholder "eg. 0" |
| 52 | VT type 2 date: | vt2date | text | no | empty | placeholder "eg. 12.12.2024." |
| 53 | VT type 2 order No: | vt2order | text | no | empty | placeholder "eg. 10420-2530." |
| 54 | Field 1: (LISL A3/A4) | lisl1 | text | no | empty | placeholder "eg. Company name" |
| 55 | Field 2: (LISL A3/A4) | lisl2 | text | no | empty | placeholder "eg. Client" |
| 56 | Field 3: (LISL A3/A4) | lisl3 | text | no | empty | placeholder "eg. NoBo" |
| 57 | Field 1: (LISL GU/MV) | lislgu1 | text | no | empty | placeholder "eg. Contractor/Supplier" |
| 58 | Field 2: (LISL GU/MV) | lislgu2 | text | no | empty | placeholder "eg. Client" |
| 59 | Field 3: (LISL GU/MV) | lislgu3 | text | no | empty | placeholder "eg. NoBo" |
| 60 | Doc.No. & Rev.No. (LISL GU/MV) | lisldown | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 61 | Procedure No. (LISL GU/MV) | lislup | text | no | empty | placeholder "eg. CSW-01-N" |

Section headings printed in this tab (text, not fields): "Visual Inspection", "Visual Inspection V2" (the VT type 2 fields below it), "When these fields are filled in…" help text, "LISL A3/A4", "LISL GU/MV". The Add dialog has no "Visual Inspection V1" wording and no "VT 2 prefix" or "Visual Inspection Ver 2" checkbox; those exist only in the Edit dialog.

Buttons: "Add" (submit, `btn-primary`, name `addProjectSite`), "Cancel" (`data-dismiss="modal"`).

Text rules in the dialog (paraphrased):
- Mandatory fields: when on, a weld record with a welder needs Weld Type, WPS Number, Weld Date, Diameter and Charge Number 1 / Charge Number 2; a material certificate needs Charge Number, Diameter, Material Part, Type of Material, Schedule, Wall Thickness and Certificate Type.
- Flange tightening standard: the chosen torque table is used only for prefill and pass checks; filled flange fields are never overwritten.
- Validation on WPS: when on and a WPS is linked to the welder's qualification, a welder whose qualification does not match the WPS cannot be assigned to a weld record.
- Project-specific Material Certificates: when on, only charge numbers of certificates linked to the project are offered in weld forms and printed in the ISO or ProjectBook.
- Defect norm: decides which defect codes can be chosen for an NA result on all projects of the site.
- Repair performance: used by the Repair performance tile on the WeldPilot dashboard; empty means 5%.
- Archived: archived projects leave the active list and stay in the archive.
- Document settings: the release drawing option changes how Prefab Release and Field Release documents name the iso; the Hydrotest plan number and Flange procedure number are printed on the respective documents; the VT and LISL fields replace default document values when filled.
- Iso progress: the weights must total 100 per phase (see Rules).

#### Edit project site (`#editProjectSite`) — opened by the pencil in a row (`.open-editProjectSite`, `data-id`)
The dialog is present in the page; its body is loaded by the request `GET /core/ajax/editProjectSite.php?id=<id>&action=showroom` after the click (shows "Loading..." first). The body below is the one loaded for id 1 (Zandbak) in the WeldPilot capture. Column "Default" holds the value in that capture (Zandbak); "—" = no value attribute.

Tabs: Project settings (`#tab4_1_1`, active), Document settings (`#tab4_2_1`), Iso progress (`#tab4_6_1`), ISO Book (`#tab4_7_1`), Memo templates (`#tab4_8_1`).

Project settings tab

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | text | yes | Zandbak | |
| 2 | Address | address | text | yes | - | |
| 3 | Zip code | zip | text | no | empty | |
| 4 | Residence | residence | text | no | empty | |
| 5 | Phone | phone | text | no | empty | |
| 6 | Email address | email | text | no | empty | |
| 7 | (hidden) | siteValidation | hidden | — | 0 | |
| 8 | Mandatory fields | siteValidation | checkbox (`ok`) | no | checked | |
| 9 | Flange tightening standard | flangeTighteningCatalog → name flange_tightening_catalog | select | no | "No catalog (free entry)" | options: (empty) → No catalog (free entry) (marked default); asme_b165 → ASME B16.5 torque table (2012); gasunie_csw43 → Gasunie CSW-43 table B |
| 10 | (hidden) | siteWpsValidation | hidden | — | 0 | |
| 11 | Validation on WPS | siteWpsValidation | checkbox (`ok`) | no | unchecked | |
| 12 | Project-specific Material Certificates | certproject | checkbox (`ok`) | no | unchecked | |
| 13 | Material Management Display Setting | mtotype | checkbox (`ok`) | no | checked | |
| 14 | Defect norm | defect_norm | select | no | "No norm selected" | options: (empty) → No norm selected (marked default); iso6520 → ISO 6520-1; asme → ASME B31.3; api1104 → API 1104 |
| 15 | Repair performance | repair_performance_limit | number (min 0, max 100, step 0.1) | no | empty | placeholder "5" |
| 16 | Inch-weighted | ndt_progress_basis | radio (`inch`) | — | checked | |
| 17 | Per weld | ndt_progress_basis | radio (`count`) | — | unchecked | |
| 18 | Archived | archived | checkbox (`ok`) | no | unchecked | |

ISO Book tab (`#tab4_7_1`): 37 checkboxes, all named as array `name[]`, value `ok`, all checked in the capture. Heading "LISL" and text "These variants are grouped together. Turn on the LISL that this site uses in the ISO Book." The first 12 belong to the group LISL; the other 25 are document types.

| # | Label (checkbox) | name | Default |
|---|---|---|---|
| 19 | LISL | lislold[] | checked |
| 20 | LISL V2 | lisloldSignature[] | checked |
| 21 | LISL A3 | lisla3[] | checked |
| 22 | Weld record | lisloldV2[] | checked |
| 23 | LISL [GU] | lislnew[] | checked |
| 24 | LISL [MV] | lislmv[] | checked |
| 25 | LISL [WQ] | lislwq[] | checked |
| 26 | LISL [GU Rev 2] | lislguver2[] | checked |
| 27 | Blank LISL | lisl[] | checked |
| 28 | LISL [ISS] | lisliss[] | checked |
| 29 | LISL [GU Rev 3] | lislguver3[] | checked |
| 30 | LISL [WQ ver 2] | lislwqNEW[] | checked |
| 31 | Task sheet | task[] | checked |
| 32 | ITP documents | itp[] | checked |
| 33 | ITP 2 documents | itp2[] | checked |
| 34 | Isometric | isometric[] | checked |
| 35 | NDT Pre | ndtPre[] | checked |
| 36 | NDT | ndt[] | checked |
| 37 | Pre-HT/PWHT | pwht[] | checked |
| 38 | Pick Lists | picklist[] | checked |
| 39 | PQR | pqr[] | checked |
| 40 | WPS | wps[] | checked |
| 41 | WPS (Group) | wpsgroup[] | checked |
| 42 | Welder's summary lists | summary[] | checked |
| 43 | Welders' certifications | weldercerts[] | checked |
| 44 | Visual reports | vt[] | checked |
| 45 | Welding wires | wires[] | checked |
| 46 | Certificate Index | certificateindex[] | checked |
| 47 | Material certificates | certificates[] | checked |
| 48 | Material certificates (Group) | certificatesgroup[] | checked |
| 49 | Prefab release document | releaseshop[] | checked |
| 50 | Field release document | releasefield[] | checked |
| 51 | Punch list (blank) | punchlistblank[] | checked |
| 52 | Punch list | punchlist[] | checked |
| 53 | NDT Process documents | ndtprocess[] | checked |
| 54 | Flange report | flangereport[] | checked |
| 55 | Flange labels | flangelabels[] | checked |

Iso progress tab (`#tab4_6_1`): hidden `punch_prefab`, `hydro_prefab`, `paint_prefab` (each value 0), then the same 16 weight inputs as the Add dialog, all type number, min 0, max 100, default values all 0 in the capture: Distribution - Shop (destruction_prefab), Welds - Shop (welds_prefab), NDT - Shop (ndt_prefab), Material pipe - Shop (material_prefab), Supports - Shop (shoes_prefab), Appendages - Shop (appendages_prefab), Distribution - Field (destruction_field), Material pipe - Field (material_field), Welds - Field (welds_field), NDT - Field (ndt_field), Supports - Field (shoes_field), Appendages - Field (appendages_field), Punch - Field (punch_field), Distribution - Site (destruction_site), Hydrotest (hydro_field), Paint/Tracing (paint_field). Sum labels in the capture: "0% / 100%" on the phase line, Shop, Field and Site. With these values the phase line, Shop and Field labels are red and the Site label is green (colour rules in Rules, item 1).

Document settings tab (`#tab4_2_1`)

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 56 | Prefix | prefix | text | no | empty | |
| 57 | Release doc drawing no | prefixtype | select | no | "Drawing no + iso" (cur) | 0 → Drawing no + iso; 1 → Prefix + iso (no option marked) |
| 58 | Hydrotest Execution Plan | hydroplan | text | no | empty | |
| 59 | Flange procedure No. | flange_procedure_no | text (maxlength 100) | no | empty | |
| 60 | Subcontractor QA/QC | field1 | text | no | empty | placeholder "eg. Subcontractor QA/QC" |
| 61 | Subcontractor Construction | field2 | text | no | empty | placeholder "eg. Subcontractor Construction" |
| 62 | Principal UI | field3 | text | no | empty | placeholder "eg. Principal UI" |
| 63 | Contractor QA/QC | field4 | text | no | empty | placeholder "eg. Contractor QA/QC" |
| 64 | Contractor Construction | field5 | text | no | empty | placeholder "eg. Contractor Construction" |
| 65 | NoBo | field6 | text | no | empty | placeholder "eg. NoBo" |
| 66 | Doc.No. & Rev.No. (Visual Inspection V1) | vtinfo | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 67 | Procedure No. (Visual Inspection V1) | vtinfo2 | text | no | empty | placeholder "eg. CSW-01-N" |
| 68 | (hidden) | siteVt2 | hidden | — | 0 | pairs with #69 |
| 69 | Visual Inspection Ver 2 | siteVt2 | checkbox (`ok`, id checkboxVt1) | no | checked | |
| 70 | VT type 2 no: | vt2no | text | no | VT-MNT-MNT-00078 | placeholder "eg. VT-MNT-MNT-00078" |
| 71 | VT type 2 rev: | vt2rev | text | no | 0 | placeholder "eg. 0" |
| 72 | VT type 2 date: | vt2date | text | no | 12.12.2024 | placeholder "eg. 12.12.2024." |
| 73 | VT type 2 order No: | vt2order | text | no | 10420-2350 | placeholder "eg. 10420-2530." |
| 74 | VT 2 prefix: | vt2prefix | text | no | VT-MNT-MNT | placeholder "eg. VT-MNT-MNT" |
| 75 | VT from NDT column | lislVtSource | radio (`ndt`) | — | checked | heading "LISL ISS — VT source" |
| 76 | VT from VT2 report | lislVtSource | radio (`vt2`) | — | unchecked | |
| 77 | Field 1: (LISL A3/A4) | lisl1 | text | no | empty | placeholder "eg. Company name" |
| 78 | Field 2: (LISL A3/A4) | lisl2 | text | no | empty | placeholder "eg. Client" |
| 79 | Field 3: (LISL A3/A4) | lisl3 | text | no | empty | placeholder "eg. NoBo" |
| 80 | Field 1: (LISL GU/MV) | lislgu1 | text | no | empty | placeholder "eg. Contractor/Supplier" |
| 81 | Field 2: (LISL GU/MV) | lislgu2 | text | no | empty | placeholder "eg. Client" |
| 82 | Field 3: (LISL GU/MV) | lislgu3 | text | no | empty | placeholder "eg. NoBo" |
| 83 | Doc.No. & Rev.No. (LISL GU/MV) | lisldown | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 84 | Procedure No. (LISL GU/MV) | lislup | text | no | empty | placeholder "eg. CSW-01-N" |

Memo templates tab (`#tab4_8_1`): intro text (paraphrased): global templates apply everywhere; site templates override or extend them. Table "Button label | Key | Sort order", six rows, each with a grey "Global" badge and an "Edit" button (`.wsapps-iso-memo-edit-btn`, carries the template data):

| Button label | Key | Sort order | Icon |
|---|---|---|---|
| Prefab | prefab | 10 | fa-industry |
| Field install | field | 20 | fa-wrench |
| NDT / inspection | ndt | 30 | fa-search |
| Pressure test | hydro | 40 | fa-tint |
| Safety | safety | 50 | fa-shield |
| Finishing | finish | 60 | fa-paint-brush |

Each template's text is a short bullet list (paraphrase): Prefab — check material and fit-up, shop welds per WPS, mark spools and line after completion. Field install — check supports and alignment, field welds per WPS, update weld status and NDT requests. NDT / inspection — visual inspection before NDT where applicable, NDT only after release or fit-up OK, process results before next work. Pressure test — isolate systems per test plan, verify medium, pressure and hold time, document result and punch items. Safety — work permit or LMRA applies, PPE mandatory, stop on deviation or unsafe situation. Finishing — coating and insulation per spec, protect piping in transport, complete handover documentation.

Button "New template" (`btn-success`, plus icon, `.wsapps-iso-memo-add-btn`) opens a hidden editor panel (heading "Isometric memo templates"), containing:
- hidden `record_id` (0), hidden `customize_global` (0)
- Button label: text, required, empty
- Key: text, placeholder "prefab, ndt, ...", empty
- Icon (fa-*): text, default "fa-file-text-o"
- Sort order: number, default 100
- Content: textarea `html_body` (id isoMemoTemplateHtml), empty
- Buttons: "Save" (`btn-primary`, submit), "Cancel" (`.wsapps-iso-memo-cancel-btn`), "Restore default" (`btn-warning`, hidden), "Save for this site" (`btn-info`, hidden), "Delete" (`btn-danger`, hidden).

Hidden in the modal body (outside the tabs): `editID` = 1 (the record id).

Footer
- Hidden `secureCode` (`#bookIdEditProjectSiteSecure`): filled with a per-record token by the page script (see Rules). Not copied here.
- Button "Duplicate Project site" (`#dupProjectSiteBtn`, `btn-success`, label switches to "Confirm" on the first click; see Rules).
- Button with no label (`#dupProjectSiteSubmit`, name `addProjectSiteNew`, submit), triggered by the Confirm click.
- Duplicate options panel (`#dupProjectSiteOptions`, hidden until the first click). Each option has a checkbox (name as listed, value 1, checked by default) and a hidden input of the same name with value 0. Site settings: Project settings (projectSettings), Document settings (documentSettings), Iso progress (isoProgress), ISO Book (isobook). Activated lists: NDT process (ndtProcess), Weld types (weldTypes), WPS methods (wpsMethods), Welders (welders), Memo templates (memoTemplates), Daily reporting (dailyReporting), Spools (spools), Material supplier (materialSupplier), NDT locations (ndtLocations), PWHT process (pwhtProcess), PWHT locations (pwhtLocations), QA/QC engineers (qaqcEngineers). 16 checkboxes in total.
- Buttons: "Update" (`btn-warning`, name `editProjectSite`, submit), "Cancel".

Totals for the Edit dialog: 18 + 19 + 37 + 29 described inputs in the three panes, plus 8 memo-editor and editID inputs, plus secureCode and 32 duplicate-panel inputs (16 checkboxes, 16 hidden).

#### Delete project site (`#deleteProjectSite`) — opened by the trash icon in a row (`.open-deleteProjectSite`, `data-id`)
Body: text "Are you sure?" inside a form (method post).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | deleteID | hidden | — | empty in capture (the page script fills it with the row id) | |
| 2 | (no label) | secureCode (`#bookIdDeleteProjectSiteSecure`) | hidden | — | empty in capture (the page script fills it with a token) | |

Buttons: "Delete" (`btn-danger`, name `deleteProjectSite`, submit, trash icon), "Cancel".

#### Import Materials DB from another project site (`#importEst`) — opened by the upload icon in a row (`.open-importEst`, `data-id`)
Title "Import Materials DB from another project site".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label) | secureCode (`#bookIdImportEstSecure`) | hidden | — | empty in capture (the page script fills it with a token) | |

Buttons: "Import" (`btn-warning`, name `importMto`, submit), "Cancel". The dialog body holds no further fields in the capture; the page script loads content into `#bookIdImportEst` (see Not in the capture).

Also present in the page, opened from elsewhere (no control on this page points to them): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, importCalculationsFromIso, importCalculationsFromIsoProject, removeLastCalculations, markPunchAsRemoved, setCheckedMaterialsTypeModal, deleteCheckedMaterialsModal, setStatus, statusLog, showIsometric, punchlist, punchlistEdit, showQuantityLog, materialStatusByRevision, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal.

### Rules found in the page's JavaScript
The page's own script is the WeldPilot capture's copy of the same page (identical `SAME-AS` blocks); the MTOPilot capture's large script shows only its differing lines, and the rest is shared.

1. Iso progress weights (`window.wsappsBindIsoProgressWeights`, applied to `#wsappsIsoProgressWeightsAdd` on load and to `#wsappsIsoProgressWeights` after the Edit body loads). Recalculates on every input or change of a number field in the box:
   - Shop phase = Distribution Shop + Distribution Field + Distribution Site. Label `shop-phase` shows "<n>% / 100%". Coloured green when it equals 100, red otherwise.
   - Shop = Welds Shop + NDT Shop + Material pipe Shop + Supports Shop + Appendages Shop. Coloured green when 100, red otherwise.
   - Field = Material pipe Field + Welds Field + NDT Field + Supports Field + Appendages Field + Punch Field. Green when 100, red otherwise.
   - Site = Hydrotest + Paint/Tracing. Green when Distribution Site is 0 or the Site sum is 100, red otherwise.
   - Empty numbers count as 0. The line labels "field-phase" and "site-phase" are cleared (empty text).
2. Opening Edit (`.open-editProjectSite`): sets the hidden secure token, sets the body to "Loading...", shows the modal, then requests `GET /core/ajax/editProjectSite.php?id=<id>&action=showroom` and writes the answer into `#contentP`; initialises the weights box and the rich text editors in `#contentP` (height 130). On request failure the body shows "Project site kon niet worden geladen." (short vendor message, copied exactly).
3. Secure tokens on the three row dialogs: when `md5` is available the token is md5 of a fixed prefix, the row id and a suffix; suffix `prsE` for Edit, `prsD` for Delete, `impE` for Import. Lines 917–921 of the large script also set the Delete token with suffix `prs` and set `#bookIdEdit` to the row id, but the lines between are shared with other pages, so which handler owns them is not clear from the capture.
4. Duplicate (`#dupProjectSiteBtn`): first click shows `#dupProjectSiteOptions` and changes the label from "Duplicate Project site" to "Confirm" (`data-label-confirm`); second click triggers a click on `#dupProjectSiteSubmit`. Hiding or showing `#editProjectSite` resets the label and sets all duplicate checkboxes to checked.
5. Import (`.open-importEst`): sets the secure token in `#bookIdImportEstSecure` and requests `GET /core/ajax/importEst.php?id=<id>`, writing the answer into `#bookIdImportEst` (the response is not in the capture).
6. Requests on load and by the shared script: `GET /core/ajax/ajax-notifications.php?action=count_unread` (on load). The large shared script also contains `GET /core/ajax/getListOfMaterials.php`, `/core/ajax/searchProject.php`, `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php` and `/core/ajax/searchFactors.php`; these are in the script for all pages, and the capture does not show them firing on this page.
7. Table initialisation: "DataTable initialization is handled in shared-js.php" (comment); that file is not in the capture. Page variables set: `__wsappsDebugPage = "project-sites"`, `__wsappsIsProjectSites = true`, `__wsappsCanExport = true`.
8. Buttons with classes `buttonInsert`, `buttonEdit`, `buttonDelete`, `buttonImport`, `buttonPrint` and `btn-hidePrint` are set to visible on load.
9. Browser validation only: `REQUIRED` on Name and Address (Add and Edit). No other validation messages or browser-side rules are shown in the captured script for this page.
10. Form submits: Add, Update, Delete, Import and Duplicate Confirm are normal form posts (`method="post"`; Add and Edit use `enctype="multipart/form-data"`). No request is made by the script before they are clicked.

### Sample data
- 3 project sites, "Showing 1 to 3 of 3 entries". Table order is the DOM order (IRN Code is "-" on all three rows).

| Name (link) | Address | Phone | Email address | IRN Code | Row id |
|---|---|---|---|---|---|
| Zandbak | - | - | - | - | 1 |
| IPO - Carry Over | Ineos Procject ONE | - | - | - | 10 |
| 10420-2530 Ineos Project ONE | Scheldelaan 482 | (a +32 company phone, shown in the list) | - | - | 2 |

- The Zandbak Edit values (Project settings, Document settings, Iso progress, ISO Book, Memo) are listed in the Edit dialog tables above (the capture's Default column).

---

## Storehouses (`?page=lagers`) — no rights

### Page
- Browser title: "Storehouses - MTOPilot®".
- The only content is the message: "You do not have rights to open this page."
- No breadcrumb, tabs, buttons, list, or dialog opened from a control on this page.

### List
- None. The page shows no list and no table request.

### Dialogs
- None opened from this page (no control is shown).
- Also present in the page DOM, not opened from a control here: addLager, editLager, deleteLager, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, srArchiveScanModal, materialQrScanModal, editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, importCalculationsFromIso, importCalculationsFromIsoProject, removeLastCalculations, markPunchAsRemoved, setCheckedMaterialsTypeModal, deleteCheckedMaterialsModal, setStatus, statusLog, showIsometric, punchlist, punchlistEdit, showQuantityLog, materialStatusByRevision, editServiceRequest.

### Rules found in the page's JavaScript
none found in the capture for this page (the page shows only the message; the script contains handlers for controls this page does not render, not described here).

### Sample data
- None (no rights).

### Not in the capture
- Storehouse content: not visible to this account.

---

## Not in the capture (Project sites)
- Import dialog content: `GET /core/ajax/importEst.php?id=<id>` loaded into `#bookIdImportEst` after clicking the upload icon in a row. The response is not in the capture; the dialog body in the capture has only the hidden secure field and the Import/Cancel buttons.
- Edit dialog bodies for rows id 2 and 10 (the MTO page's other rows): only id 1 was loaded in the captures.
- Edit dialog as shown on the MTO page: the MTO capture names the dialog `SAME-AS`; the body above is from the WeldPilot capture of the same record.
- Duplicate result: the second click (Confirm) submits `addProjectSiteNew`; the capture did not submit.
- Memo template Save / Delete / Restore / Save for this site: the handler code is not in the captured lines; the buttons are hidden until the editor opens.
- Name link destination (`view=projects&redirect=<id>`) and folder icon destination (`view=projects`): not followed.
- CSV, Excel and Print outputs: not clicked.
- Rows beyond the first page: none (3 rows in total).
- Results of Add, Update, Delete and Import submits: not submitted.

---

Discrepancies between the captures and the browser-pass notes (for the reader):
- `reference/montavar/raw/_interactive/I2b-admin-dashboard.md` says the Edit dialog's ISO Book has "22 document types"; the Edit dialog in the capture lists 25 document types after the 12 LISL variants (37 checkboxes in total).
- The same notes say the VT type 2 date and order carry a leading space; the capture's `val` attributes show "12.12.2024" and "10420-2350" without a leading space.
- The MTO row for IPO - Carry Over shows "Ineos Procject ONE" (spelling as in the capture) in the Address column.

Reported counts: 4 dialogs described (Add project site, Edit project site, Delete project site, Import Materials DB from another project site), 208 inputs including hidden ones (Add 61, Edit 144 incl. secure and duplicate fields, Delete 2, Import 1).
