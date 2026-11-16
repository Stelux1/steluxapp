# Weld Pilot → General data → Project sites

Source: `weld__general__project-sites.txt`, `weld__general__project-sites-archived.txt`, `weld__general__project-sites__edit-zandbak.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=project-sites` (archived list: `/weldpilot/index.php?page=project-sites&type=archived`).
State of the page for the observing account: normal.

## Page

- Browser title: "Project sites - WeldPilot®". The side menu entry is "Project sites" (group "General data"), link `/weldpilot/index.php?page=project-sites`.
- Breadcrumb (top bar): a single active crumb "Project sites" → `/weldpilot/index.php?page=project-sites`. On the archived list the crumb is "Archived" → `/weldpilot/index.php?page=project-sites&type=archived`.
- Panel title: house icon + "Project sites", with a small "+" button at its right end → `href="#addProjectSite"` (`data-toggle="modal"`), no text.
- No tabs on the list page itself.
- Buttons in the top bar (active list):
  - "Show archived sites" (archive icon) → link `index.php?page=project-sites&type=archived`.
  - "Add project site" (plus icon, class `buttonInsert`) → opens dialog `#addProjectSite`.
- Buttons in the top bar (archived list): "Back to active sites" (chevron-left icon) → link `index.php?page=project-sites`. The "Add project site" button is not in the archived capture's top bar; the panel's "+" button is still there and points to `#addProjectSite`.
- Language links in the header (Nederlands, English, Deutsch, Français) append `lang=xx&page=project-sites&id=&project=&projectSite=` to the URL (shared header).

## List

Table `#datatableWarehouse`, client-side (DataTables `serverSide: false`, `ajax: null`; rows are in the page).

- Columns in order (all visible, all sortable): Name, Address, Phone, Email address, IRN Code, Options.
- Default sort: column 5 (IRN Code, index 4) ascending.
- Page length options: 5, 20, 50, 100, 500; default 20 ("Show … entries").
- Search: one global search box, placeholder "Search", with a clear (x) button. No per-column search inputs, no filters.
- Export / print buttons above the list: "CSV", "Excel", a print icon (no text). `__wsappsCanExport = true` in the page script.
- No bulk actions, no Options menu, no row checkboxes.
- Texts: empty "No data available in table"; info "Showing _START_ to _END_ of _TOTAL_ entries" (shown as "Showing 1 to 3 of 3 entries" / "Showing 0 to 0 of 0 entries"); no-match "No matching records found".
- Cell contents:
  - Name: a link to `/weldpilot/index.php?page=project-sites&id=<id>&view=projects&redirect=<id>` (the capture shows the site name as link text).
  - Address, Phone, Email address, IRN Code: plain text; "-" when empty.
  - Options (three icon buttons, in order):
    1. Open-folder icon, yellow (`btn-warning`) → link `/weldpilot/index.php?page=project-sites&id=<id>&view=projects` (the site's projects).
    2. Pencil icon, yellow, classes `buttonEdit open-editProjectSite`, `data-id=<id>`, `href="#editProjectSite"` → opens the Edit project site dialog (see Dialogs).
    3. Trash icon, red (`btn-danger`), classes `buttonDelete open-deleteProjectSite`, `data-id=<id>`, `href="#deleteProjectSite"` → opens the Delete project site dialog.

## Dialogs

Footer buttons named `btn-hideInsert` / `btn-hideEdit` are set to `visibility:hidden` by the page script until the matching `.buttonInsert` / `.buttonEdit` control is made visible (the script makes `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport` visible on load).

### Add project site (`#addProjectSite`) — opened by "Add project site" (top bar) and the "+" in the panel title

Large dialog (`bs-modal-lg`), form `method="post" enctype="multipart/form-data"`, three tabs in DOM order: "Project settings" (`#tab4_1b`, active), "Iso progress" (`#tab4_6b`), "Document settings" (`#tab4_2b`). The tab headers are displayed in the order Project settings, Document settings, Iso progress.

**Tab "Project settings"**

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | `name` | text | yes | empty | |
| 2 | Address | `address` | text | yes | empty | |
| 3 | Zip code | `zip` | text | no | empty | |
| 4 | Residence | `residence` | text | no | empty | |
| 5 | Phone | `phone` | text | no | empty | |
| 6 | Email address | `email` | text (not type email) | no | empty | |
| 7 | (hidden, before "Mandatory fields") | `siteValidation` | hidden | – | `0` | sent first; the checkbox below overrides it when ticked |
| 8 | Mandatory fields | `siteValidation` | checkbox (`#siteValidationAdd`) | no | unticked | value `ok` |
| 9 | Flange tightening standard | `flange_tightening_catalog` | select (`#addFlangeTighteningCatalog`) | no | "No catalog (free entry)" | 3 options: `` → No catalog (free entry) (default); `asme_b165` → ASME B16.5 torque table (2012); `gasunie_csw43` → Gasunie CSW-43 table B |
| 10 | (hidden) | `siteWpsValidation` | hidden | – | `0` | |
| 11 | Validation on WPS | `siteWpsValidation` | checkbox (`#siteWpsValidationAdd`) | no | unticked | value `ok` |
| 12 | Project-specific Material Certificates | `certproject` | checkbox (`#siteCertProjectAdd`) | no | unticked | value `ok` (no hidden twin) |
| 13 | Material Management Display Setting | `mtotype` | checkbox (`#siteMtotypeAdd`) | no | unticked | value `ok` (no hidden twin) |
| 14 | Defect norm | `defect_norm` | select (`#addSiteDefectNorm`) | no | "No norm selected" | 4 options: `` → No norm selected (default); `iso6520` → ISO 6520-1; `asme` → ASME B31.3; `api1104` → API 1104 |
| 15 | Repair performance | `repair_performance_limit` | number (`#addRepairPerformanceLimit`) | no | empty, placeholder `5` | min 0, max 100, step 0.1 |
| 16 | NDT measurement → "Inch-weighted" | `ndt_progress_basis` | radio | no | selected, value `inch` | |
| 17 | NDT measurement → "Per weld" | `ndt_progress_basis` | radio | no | not selected, value `count` | |
| 18 | Archived | `archived` | checkbox (`#siteArchivedAdd`) | no | unticked | value `ok` |

Help texts under the fields (paraphrased):
- Mandatory fields: when on, adding or editing a weld record with a welder requires Weld Type, WPS Number, Weld Date, Diameter and Charge Number 1 / Charge Number 2; adding a material certificate requires Charge Number, Diameter, Material Part, Type of Material, Schedule, Wall Thickness and Certificate Type.
- Flange tightening standard: the torque standard of this site; prefill and pass checks use only this catalog and never overwrite flange fields that are already filled.
- Validation on WPS: when on and a WPS is linked to a welder's qualification, a welder whose qualification does not match the required WPS cannot be assigned to a weld record.
- Project-specific Material Certificates: when on, only charge numbers of certificates linked to the project are offered when adding/editing a weld, and only those certificates are printed with the Iso or ProjectBook.
- Material Management Display Setting: switches between showing materials added to isometrics and showing the status of picklists.
- Defect norm: chooses which defect codes can be selected for an NA result for every project on the site; "No norm selected" keeps the current list; single codes can still be switched under "Defect codes".
- Repair performance: used by "Repair performance" on the WeldPilot dashboard; empty means 5%.
- NDT measurement: "Inch-weighted" — a DN500 weld counts more than a DN15 weld. "Per weld" — 10 welds with NDT required, 1 Accepted = 10% of the NDT weight. Then two paragraphs: "Weight changes are versioned from today. Daily EVM snapshots feed the BBE S-curve (earned = budget × ISO %). Quality (NDT Accepted vs Reject) is shown next to progress and is not part of the %." and "ISO progress updates automatically after save."
- Archived: when on, the site leaves the active list and is reachable from the archive.

**Tab "Iso progress"** (`#wsappsIsoProgressWeightsAdd`) — all number inputs have class `wsapps-weight-active`, min 0, max 100, no placeholder.

| # | Label | name | Type | Required | Default |
|---|---|---|---|---|---|
| 1 | (hidden) | `punch_prefab` | hidden | – | `0` |
| 2 | (hidden) | `hydro_prefab` | hidden | – | `0` |
| 3 | (hidden) | `paint_prefab` | hidden | – | `0` |
| 4 | Distribution - Shop | `destruction_prefab` | number | no | `50` |
| 5 | Welds - Shop | `welds_prefab` | number | no | `0` |
| 6 | NDT - Shop | `ndt_prefab` | number | no | `0` |
| 7 | Material pipe - Shop | `material_prefab` | number | no | `0` |
| 8 | Supports - Shop | `shoes_prefab` | number | no | `0` |
| 9 | Appendages - Shop | `appendages_prefab` | number | no | `0` |
| 10 | Distribution - Field | `destruction_field` | number | no | `50` |
| 11 | Material pipe - Field | `material_field` | number | no | `0` |
| 12 | Welds - Field | `welds_field` | number | no | `0` |
| 13 | NDT - Field | `ndt_field` | number | no | `0` |
| 14 | Supports - Field | `shoes_field` | number | no | `0` |
| 15 | Appendages - Field | `appendages_field` | number | no | `0` |
| 16 | Punch - Field | `punch_field` | number | no | `0` |
| 17 | Distribution - Site | `destruction_site` | number | no | `0` |
| 18 | Hydrotest | `hydro_field` | number | no | `0` |
| 19 | Paint/Tracing | `paint_field` | number | no | `0` |

Running sums shown under the groups (muted text, coloured by the script): after "Distribution - Shop" the phase sum ("100% / 100%" at load, i.e. 50 + 50 + 0), after "Appendages - Shop" the Shop sum, after "Punch - Field" the Field sum, after "Paint/Tracing" the Site sum; all three activity sums read "0% / 100%" at load.

Help text below the weights (paraphrased): total project progress is split into Shop, Field and Site, which must total 100%; Site is its own phase, not a percentage of Field. Worked example in the text: Shop 38 + Field 54 + Site 8 = 100; inside Site Hydrotest 40 + Paint/Tracing 60 = 100 of the 8%, giving Hydro 3.2% (8 × 40 / 100) and Paint/Tracing 4.8% (8 × 60 / 100). Within each part only the active activities count and must total 100%; Site activities are required only when the Site phase is above 0. Active in Shop: Welds + NDT + Pipe + Supports + Appendages. Active in Field: Pipe, Welds, NDT, Supports, Appendages, Punch. Active in Site: Hydrotest + Paint/Tracing. For Shop pipe/supports/appendages a quantity is entered as for Field; the ceiling is the Shop-typed issued quantity divided by the Shop MTO (examples in the text: 100 m all Shop gives shop 50 then 100; 30 m Shop + 70 m Field gives shop up to 30); Field erection uses the whole ISO (up to 100), shop prefab is installed again in the field and not deducted. NDT weight (example 10%) is earned by the site NDT measurement (inch-weighted or per weld); Reject does not count as done; repair welds add no extra earned units; welds stay inch-weighted. The issued/picked quantity is the ceiling for both Shop handling and Field installed pipe. Paint/Tracing is a site activity (Paint, Tracing, Insulation; N/A items drop out). Punch stays a separate Field weight.

**Tab "Document settings"**

| # | Label | name | Type | Required | Default | Options / placeholder |
|---|---|---|---|---|---|---|
| 1 | Prefix | `prefix` | text | no | empty | |
| 2 | Release doc drawing no | `prefixtype` | select (`type="text"` attribute) | no | "Drawing no + iso" | 2 options: `0` → Drawing no + iso (default); `1` → Prefix + iso |
| 3 | Hydrotest Execution Plan | `hydroplan` | text | no | empty | |
| 4 | Flange procedure No. | `flange_procedure_no` | text (`#addFlangeProcedureNo`) | no | empty | maxlength 100 |
| 5 | Subcontractor QA/QC | `field1` | text | no | empty | placeholder "eg. Subcontractor QA/QC" |
| 6 | Subcontractor Construction | `field2` | text | no | empty | placeholder "eg. Subcontractor Construction" |
| 7 | Principal UI | `field3` | text | no | empty | placeholder "eg. Principal UI" |
| 8 | Contractor QA/QC | `field4` | text | no | empty | placeholder "eg. Contractor QA/QC" |
| 9 | Contractor Construction | `field5` | text | no | empty | placeholder "eg. Contractor Construction" |
| 10 | NoBo | `field6` | text | no | empty | placeholder "eg. NoBo" |
| 11 | Doc.No. & Rev.No. (under heading "Visual Inspection") | `vtinfo` | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 12 | Procedure No. (same block) | `vtinfo2` | text | no | empty | placeholder "eg. CSW-01-N" |
| 13 | VT type 2 no: (heading "Visual Inspection V2") | `vt2no` | text | no | empty | placeholder "eg. VT-MNT-MNT-00078" |
| 14 | VT type 2 rev: | `vt2rev` | text | no | empty | placeholder "eg. 0" |
| 15 | VT type 2 date: | `vt2date` | text | no | empty | placeholder "eg. 12.12.2024." |
| 16 | VT type 2 order No: | `vt2order` | text | no | empty | placeholder "eg. 10420-2530." |
| 17 | Field 1: (heading "LISL A3/A4") | `lisl1` | text | no | empty | placeholder "eg. Company name" |
| 18 | Field 2: | `lisl2` | text | no | empty | placeholder "eg. Client" |
| 19 | Field 3: | `lisl3` | text | no | empty | placeholder "eg. NoBo" |
| 20 | Field 1: (heading "LISL GU/MV") | `lislgu1` | text | no | empty | placeholder "eg. Contractor/Supplier" |
| 21 | Field 2: | `lislgu2` | text | no | empty | placeholder "eg. Client" |
| 22 | Field 3: | `lislgu3` | text | no | empty | placeholder "eg. NoBo" |
| 23 | Doc.No. & Rev.No. | `lisldown` | text | no | empty | placeholder "eg. EN10002121 Rev.05" |
| 24 | Procedure No. | `lislup` | text | no | empty | placeholder "eg. CSW-01-N" |

Help texts: the Release doc drawing no select — "Drawing no + iso" combines the drawing number (example in text `EN190581-AP-PIP-I02-0-U732`) and the short isometric number (example `301-001`) in one field and affects the Prefab Release and Field Release documents; "Prefix + iso" puts a custom prefix before the isometric number. Hydrotest Execution Plan: the number given here is put by default on every Pressure Test Plan. Flange procedure No.: printed on every flange protocol of the site (the procedure number of the flange assembly record). The six signature fields: custom text replaces the labels of the signature fields of the "Pressure Test Plan". Visual Inspection V2 fields and LISL GU/MV fields: when filled, they update the default values of the VT report (document number and procedure) and of the LISL (GU) & LISL (MV) report. The "Add" form has no checkbox "Visual Inspection Ver 2", no field `vt2prefix` and no "LISL ISS — VT source" radios (those exist only in the Edit dialog).

**Footer:** "Add" (`name="addProjectSite"`, type submit, class `btn-primary btn-hideInsert`); "Cancel" (closes the dialog).

### Edit project site (`#editProjectSite`) — opened by the pencil in the Options column

Large dialog, form `method="post" enctype="multipart/form-data"`. The dialog body (`#contentP`) is empty in the page and is filled by a request when the pencil is clicked (see the JavaScript section). The page-embedded copy contains only the footer; the body was captured after a click on the pencil of the row "Zandbak" (`data-id="1"`). Values below are Zandbak's. Tab headers: "Project settings" (`#tab4_1_1`, active), "Document settings" (`#tab4_2_1`), "Iso progress" (`#tab4_6_1`), "ISO Book" (`#tab4_7_1`), "Memo templates" (`#tab4_8_1`). In the DOM the panes come in the order Project settings, ISO Book, Iso progress, Document settings, Memo templates.

**Tab "Project settings"** — the same 18 controls, names and option lists as in the Add dialog (ids differ: `#exampleInputEmail1` for name, `#siteValidation1`, `#flangeTighteningCatalog`, `#siteWpsValidation1`, `#siteCertProject1`, `#siteMtotype1`, `#siteDefectNorm`, `#repairPerformanceLimit1`, `#siteArchived1`). Values shown for Zandbak:

| name | Zandbak value |
|---|---|
| `name` | Zandbak (required) |
| `address` | - (required) |
| `zip`, `residence`, `phone`, `email` | empty |
| `siteValidation` | checkbox ticked (hidden twin `0`) |
| `flange_tightening_catalog` | "No catalog (free entry)" |
| `siteWpsValidation` | unticked (hidden twin `0`) |
| `certproject` | unticked |
| `mtotype` | ticked |
| `defect_norm` | "No norm selected" |
| `repair_performance_limit` | empty (placeholder `5`, min 0, max 100, step 0.1) |
| `ndt_progress_basis` | radio `inch` selected ("Inch-weighted"); `count` ("Per weld") not selected |
| `archived` | unticked |

**Tab "ISO Book"** — intro heading "LISL" and the sentence that these variants are grouped and the LISL used by the site should be switched on. All 37 checkboxes are ticked for Zandbak, each `value="ok"`, no hidden twin. Id → name → label:

| Id | name | Label |
|---|---|---|
| isoBookField2 | `lislold[]` | LISL |
| isoBookField3 | `lisloldSignature[]` | LISL V2 |
| isoBookField4 | `lisla3[]` | LISL A3 |
| isoBookField5 | `lisloldV2[]` | Weld record |
| isoBookField6 | `lislnew[]` | LISL [GU] |
| isoBookField7 | `lislmv[]` | LISL [MV] |
| isoBookField8 | `lislwq[]` | LISL [WQ] |
| isoBookField9 | `lislguver2[]` | LISL [GU Rev 2] |
| isoBookField10 | `lisl[]` | Blank LISL |
| isoBookField11 | `lisliss[]` | LISL [ISS] |
| isoBookField12 | `lislguver3[]` | LISL [GU Rev 3] |
| isoBookField13 | `lislwqNEW[]` | LISL [WQ ver 2] |
| isoBookField14 | `task[]` | Task sheet |
| isoBookField15 | `itp[]` | ITP documents |
| isoBookField16 | `itp2[]` | ITP 2 documents |
| isoBookField17 | `isometric[]` | Isometric |
| isoBookField18 | `ndtPre[]` | NDT Pre |
| isoBookField19 | `ndt[]` | NDT |
| isoBookField20 | `pwht[]` | Pre-HT/PWHT |
| isoBookField21 | `picklist[]` | Pick Lists |
| isoBookField22 | `pqr[]` | PQR |
| isoBookField23 | `wps[]` | WPS |
| isoBookField24 | `wpsgroup[]` | WPS (Group) |
| isoBookField25 | `summary[]` | Welder's summary lists |
| isoBookField26 | `weldercerts[]` | Welders' certifications |
| isoBookField27 | `vt[]` | Visual reports |
| isoBookField28 | `wires[]` | Welding wires |
| isoBookField29 | `certificateindex[]` | Certificate Index |
| isoBookField30 | `certificates[]` | Material certificates |
| isoBookField31 | `certificatesgroup[]` | Material certificates (Group) |
| isoBookField32 | `releaseshop[]` | Prefab release document |
| isoBookField33 | `releasefield[]` | Field release document |
| isoBookField34 | `punchlistblank[]` | Punch list (blank) |
| isoBookField35 | `punchlist[]` | Punch list |
| isoBookField36 | `ndtprocess[]` | NDT Process documents |
| isoBookField37 | `flangereport[]` | Flange report |
| isoBookField38 | `flangelabels[]` | Flange labels |

(The first twelve rows are the LISL group; the Add dialog has no ISO Book tab.)

**Tab "Iso progress"** — the same 3 hidden inputs and 16 number inputs, names, labels and help text as in the Add dialog; script `wsappsBindIsoProgressWeights('#wsappsIsoProgressWeights')` is bound after the content loads. Zandbak's values: every number input `0` (including `destruction_prefab` and `destruction_field`, which default to 50 in the Add dialog); all sums read "0% / 100%".

**Tab "Document settings"** — the 24 controls of the Add dialog (same names/labels/options; ids `#flangeProcedureNo`) plus these differences:
- Heading above vtinfo/vtinfo2 reads "Visual Inspection V1" (Add: "Visual Inspection").
- After heading "Visual Inspection V2": hidden `siteVt2` = `0` and checkbox `siteVt2` (`#checkboxVt1`, value `ok`, label "Visual Inspection Ver 2"; ticked for Zandbak). A stray text line "Check 5" appears under it.
- `vt2prefix`, text, label "VT 2 prefix:", placeholder "eg. VT-MNT-MNT" (after `vt2order`). Zandbak value "VT-MNT-MNT".
- Heading "LISL ISS — VT source" with radio `lislVtSource`: value `ndt` "VT from NDT column" (selected for Zandbak) and value `vt2` "VT from VT2 report".
- Zandbak values: `prefix` empty, `prefixtype` "Drawing no + iso", `hydroplan` empty, `flange_procedure_no` empty, `field1`..`field6` empty, `vtinfo`/`vtinfo2` empty, `vt2no` "VT-MNT-MNT-00078", `vt2rev` "0", `vt2date` "12.12.2024" (the placeholder in the form shows a trailing dot), `vt2order` "10420-2350" (placeholder "eg. 10420-2530."), `lisl1`..`lisl3`, `lislgu1`..`lislgu3`, `lisldown`, `lislup` empty.

**Tab "Memo templates"** (`#tab4_8_1`)
- Help text: standard texts can be customised per site or new templates added; global templates apply everywhere, site templates override or extend them.
- Table with columns "Button label", "Key", "Sort order" and an unnamed last column holding an "Edit" button per row. Button label cell = icon + label + grey badge "Global". 6 rows, all Global:

| Icon | Button label | Key | Sort order | record id |
|---|---|---|---|---|
| fa-industry | Prefab | `prefab` | 10 | 1 |
| fa-wrench | Field install | `field` | 20 | 2 |
| fa-search | NDT / inspection | `ndt` | 30 | 3 |
| fa-tint | Pressure test | `hydro` | 40 | 4 |
| fa-shield | Safety | `safety` | 50 | 5 |
| fa-paint-brush | Finishing | `finish` | 60 | 6 |

  Each Edit button carries the row's data (`data-record-id`, `data-template-key`, `data-label`, `data-icon`, `data-sort-order`, `data-scope="global"`, `data-html` = the template body, a bold heading and three bullet points).
- Green "New template" button (plus icon, `wsapps-iso-memo-add-btn`).
- Hidden editor panel "Isometric memo templates" (inline form `wsapps-iso-memo-template-form`, its own Save/Cancel buttons; not part of the dialog's outer submit):

| # | Label | name | Type | Required | Default |
|---|---|---|---|---|---|
| 1 | (hidden) | `record_id` | hidden | – | `0` |
| 2 | (hidden) | `customize_global` | hidden | – | `0` |
| 3 | Button label | `label` | text | yes | empty |
| 4 | Key | `template_key` | text | no | empty, placeholder "prefab, ndt, ..." |
| 5 | Icon (fa-*) | `icon` | text | no | `fa-file-text-o` |
| 6 | Sort order | `sort_order` | number | no | `100` |
| 7 | Content | `html_body` (textarea `#isoMemoTemplateHtml`, min-height 280px) | textarea / rich-text editor | yes in script | empty |

  Form buttons: "Save" (submit, primary), "Cancel", "Restore default" (warning, hidden by default), "Save for this site" (info, hidden by default), "Delete" (danger, hidden by default).

**Other inputs and buttons of the Edit dialog**
- `editID` hidden, value = site id (`1` for Zandbak), in the body after the tabs.
- Footer: hidden `secureCode` (`#bookIdEditProjectSiteSecure`; a 32-character hash filled by the page script); button "Duplicate Project site" (`#dupProjectSiteBtn`, green, `btn-hideInsert`); an empty-label submit button `#dupProjectSiteSubmit` with `name="addProjectSiteNew"` (not visible text); "Update" (`name="editProjectSite"`, type submit, `btn-warning btn-hideEdit`); "Cancel".
- Hidden panel `#dupProjectSiteOptions` (shown after the first click on "Duplicate Project site", whose label then becomes "Confirm"). Each item is a pair: hidden input `0` and a checkbox value `1`, all ticked by default. Group "Site settings": `projectSettings` (Project settings), `documentSettings` (Document settings), `isoProgress` (Iso progress), `isobook` (ISO Book). Group "Activated lists": `ndtProcess` (NDT process), `weldTypes` (Weld types), `wpsMethods` (WPS methods), `welders` (Welders), `memoTemplates` (Memo templates), `dailyReporting` (Daily reporting), `spools` (Spools), `materialSupplier` (Material supplier), `ndtLocations` (NDT locations), `pwhtProcess` (PWHT process), `pwhtLocations` (PWHT locations), `qaqcEngineers` (QA/QC engineers).

### Delete project site (`#deleteProjectSite`) — opened by the trash icon in the Options column

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | `deleteID` | hidden (`#bookIdEdit`) | – | filled with the row's `data-id` on click | |
| 2 | (none) | `secureCode` | hidden (`#bookIdDeleteProjectSiteSecure`) | – | filled on click (hash) | |

Body text: "Are you sure?". Buttons: "Delete" (`name="deleteProjectSite"`, submit, red, trash icon, `btn-hideDelete`), "Cancel".

### Import Materials DB from another project site (`#importEst`)

Present in the page. The page script has a handler `.open-importEst`, but no control in this page's list or top bar points to it in the capture. Fields: hidden `secureCode` (`#bookIdImportEstSecure`); buttons "Import" (`name="importMto"`, submit) and "Cancel". Its body is empty in the page (the script would fill `#bookIdImportEst` from a request, see below).

Also present in the page, opened from elsewhere (not described): `editCompanyData`, `passwordChange`, `themeChange`, `admin`, `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `importCalculationsFromIso`, `importCalculationsFromIsoProject`, `removeLastCalculations`, `markPunchAsRemoved`, `setCheckedMaterialsTypeModal`, `deleteCheckedMaterialsModal`, `setStatus`, `statusLog`, `showIsometric`, `punchlist`, `punchlistEdit`, `showQuantityLog`, `materialStatusByRevision`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `wpWeldScanModal`, `wpFlangeScanModal`.

## Rules found in the page's JavaScript

- Iso progress sums (`wsappsBindIsoProgressWeights`, called for `#wsappsIsoProgressWeightsAdd` in the Add dialog on page load and for `#wsappsIsoProgressWeights` after the Edit body loads): on every `input`/`change` of a number input in the box it recomputes four texts, each as "<n>% / 100%": phase = `destruction_prefab` + `destruction_field` + `destruction_site`; Shop = welds_prefab + ndt_prefab + material_prefab + shoes_prefab + appendages_prefab; Field = material_field + welds_field + ndt_field + shoes_field + appendages_field + punch_field; Site = hydro_field + paint_field. Empty or non-numeric values count as 0 (integer parse). Each text is green (`#3c763d`) when correct and red (`#a94442`) otherwise: the phase sum is correct at exactly 100, Shop at exactly 100, Field at exactly 100, Site when 100 or when `destruction_site` is 0. These are display colours only; the capture shows no blocking validation or message on save. The script also clears the (absent) `field-phase` and `site-phase` texts. (`punch_prefab`, `hydro_prefab`, `paint_prefab` are not included in any sum.)
- Edit pencil (`.open-editProjectSite`, handler "ENTERPRISE FIX" plus a second copy): reads `data-id`; computes the hidden `secureCode` as md5 of a fixed prefix + id + `prsE` (when an md5 function exists); sets `#contentP` to "Loading..."; opens `#editProjectSite`; then `GET /core/ajax/editProjectSite.php?id=<id>` with data `action=showroom`; on success puts the HTML into `#contentP`, binds the iso weights script and initialises Quill rich-text editors inside `#contentP` (height 130). On failure `#contentP` shows an alert in Dutch, "Project site kon niet worden geladen.".
- Delete trash (`.open-deleteProjectSite`): copies `data-id` into `deleteID` and sets `secureCode` = md5 of a fixed prefix + id + `prsD` (the second copy of the handler uses suffix `prs`).
- Duplicate (`wsappsResetDupProjectSiteUi`, `#dupProjectSiteBtn`): on opening or closing `#editProjectSite` the duplicate button text is reset to "Duplicate Project site", the option panel is hidden and all its checkboxes are re-ticked. First click on the button shows `#dupProjectSiteOptions` and changes the label to "Confirm"; the second click triggers a click on `#dupProjectSiteSubmit` (submit with `addProjectSiteNew`).
- Import (`.open-importEst`): sets `secureCode` = md5 of a fixed prefix + id + `impE` and requests `/core/ajax/importEst.php?id=<id>`, putting the answer in `#bookIdImportEst` (no control of this page triggers it in the capture).
- Memo templates (shared script, `wsapps-iso-memo-*` handlers): "New template" opens the editor panel with scope site and sort order 100; a row's "Edit" fills it from its `data-*` values (the Key field is read-only when the template is global and has a record id); "Delete" is shown only for a site template with an id; "Restore default" only for a site template with a key; "Save for this site" only for a global template with an id (it sets `customize_global=1` and submits). A save of a global template always sends `customize_global=1`. Submit is stopped silently when the site id of the memo panel is missing; if the content text is empty after stripping tags and `&nbsp;` the toast "Inhoud is verplicht." is shown and the request is not sent. Requests: `POST core/ajax/isoMemoTemplates.php` with the form fields plus `action=save&site_id=<id>`; `action=delete` with `site_id`, `record_id` (after the confirm text "Sjabloon verwijderen?"); `action=restore` with `site_id`, `template_key` (after the confirm text "Site-aanpassing verwijderen en standaard herstellen?"). The answer is JSON; with `ok` true the memo panel is replaced by `html` from the answer and a success toast (answer's `message`, else "Saved" / "Deleted" / "Restored") is shown; otherwise an error toast (answer's `message`, else "Save failed" / "Delete failed" / "Restore failed").
- Page load: variables `__wsappsDebugPage = "project-sites"`, `__wsappsIsProjectSites = true`, `__wsappsShouldScrollWarehouse = false`; `.buttonInsert`, `.buttonEdit`, `.buttonDelete`, `.buttonImport` are made visible, `.btn-hideInsert`, `.btn-hideEdit` hidden (shared script). The list's DataTable is initialised in the shared script (not shown for this page in the capture). Only request on load: `/core/ajax/ajax-notifications.php?action=count_unread` (the shared bell).
- No client-side check of required fields beyond the HTML `required` on `name` and `address` is in the capture.

## Sample data

Active list (`weld__general__project-sites`): "Showing 1 to 3 of 3 entries", page length 20.

| Name | Address | Phone | Email address | IRN Code | Options |
|---|---|---|---|---|---|
| Zandbak (id 1) | - | - | - | - | folder, pencil, trash |
| IPO - Carry Over (id 10) | Ineos Procject ONE | - | - | - | folder, pencil, trash |
| 10420-2530 Ineos Project ONE (id 2) | Scheldelaan 482 | phone A | - | - | folder, pencil, trash |

(The address text "Ineos Procject ONE" is spelled so in the capture.) All three IRN Code cells show "-", so the sort by IRN Code leaves the order as listed.

Archived list (`weld__general__project-sites-archived`): "No data available in table", "Showing 0 to 0 of 0 entries"; the colspan-6 empty row.

## Not in the capture

- The Edit dialog body for the sites "IPO - Carry Over" (id 10) and "10420-2530 Ineos Project ONE" (id 2): only Zandbak's (id 1) was opened. Pencil icon in each row.
- The body of `#importEst` (filled by `/core/ajax/importEst.php?id=<id>`); no control of this page opens it in the capture.
- The result of "Add", "Update", "Delete", "Duplicate Project site" / "Confirm" and the memo template Save/Delete/Restore (submits and POSTs were not executed); the server messages after them.
- The open state of the memo editor panel (opened by "New template" or a row's "Edit"), including the rich-text editor toolbar.
- Which sites the "Archived" checkbox moves to the archived list when ticked: the archived list was empty, so no archived row is shown.
- The rows of the list's CSV / Excel / print output.
- Rows of the "Show archived sites" list: the capture shows only the empty table (its column header is the same six titles).
