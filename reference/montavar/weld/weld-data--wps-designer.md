# Weld Pilot → Weld data → WPS Designer
Source: `weld__welddata__wps-designer.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=wps-designer`.
State of the page for the observing account: normal (all five WPS rights in the page script are true: canEdit, canInsert, canDelete, canApprove, canExport).
Scope: DEFERRED feature. This page is the list of WPS specifications plus an embedded "Source Data" admin panel. The WPS editor itself (`page=wps-designer-edit&id=…`) is a separate page and is NOT in this capture (see "Not in the capture"). No capture named `weld__welddata__wps-designer__*` exists, and the browser-pass notes (`_interactive/*.md`) do not mention this page.

## Page
- Title bar text: "- WeldPilot®". Breadcrumb: link "WPS Designer" → `/weldpilot/wps-designer/`. Panel heading (dark panel): pencil icon + "WPS Designer" + a "+" button (`href="#createWps"`, opens `#createWps`).
- No tabs on the list itself. Language links in the header: Nederlands, English, Deutsch, Français (`?lang=xx&page=wps-designer`).
- Controls above the list:
  - "Status: All" dropdown with links: "All" (`?page=wps-designer`), "Draft", "Review", "Approved", "Superseded", "Archived" (`?page=wps-designer&status=<draft|review|approved|superseded|archived>`). The table request in this capture sends `status: ''` (the script hard-codes an empty status), so the capture does not show the status link filtering the table.
  - Project select `#wpsProjectFilter` (select2): 4 options: 0 → "All Projects" (default); 2 → "10420-2530 Ineos Project ONE"; 10 → "IPO - Carry Over"; 1 → "Zandbak". Change reloads the table.
  - "Create New WPS" (`data-target="#createWps"`).
  - "Source Data" → `toggleSourceDataPanel()` (slides the hidden `#sourceDataPanel` open/closed).

## List
- Table `#wpsDesignerTable`, server-side. Request: POST `/core/ajax/wps-designer-list.php`, extra params `project_id` (int, 0 = all) and `status` (empty string).
- Columns in order (8, all visible; the last four-to-six carry class `hidden-xs`): WPS Number (`wps_number`), Revision (`revision`), Project (`project_name`), Status (`status`, hidden-xs), Created By (`created_by_name`, hidden-xs), Created Date (`created_date`, hidden-xs), Updated Date (`updated_date`, hidden-xs), Options (not sortable). Row data also carries `id`, `status_raw`, `pdf_url`, `is_master`.
- Default sort: DT config says column 6 ascending; the script says `order: [[6,'desc']]` with the comment "updated_date DESC". The capture shows both; the inline script is what runs.
- Page length 50; options 25 / 50 / 100 / 250. Global search input (placeholder "Search", with clear button). No per-column search inputs. No export / print buttons on the list. No bulk actions, no checkboxes.
- Texts: empty "No WPS specifications found"; no-match "No matching WPS specifications found"; info "Showing _START_ to _END_ of _TOTAL_ entries"; processing "Loading...".
- Row options (icons, built in the script; shown by condition):
  1. Pencil (title "Edit", or "View" when no edit right) → `index.php?page=wps-designer-edit&id=<id>` — always.
  2. PDF icon, title "View PDF" → `row.pdf_url`, new tab — only status approved and export right.
  3. Files icon, title "Create Revision" → `createRevision(id)` — only approved.
  4. Clipboard icon, title "Clone as Draft" → `cloneWps(id)` — every status except archived.
  5. Share icon, title "Use for project (projectkopie maken)" → opens `#useForProjectModal` — only when `is_master` = 1 and approved.
  6. Archive icon, title "Archive WPS" → `archiveWps(id)` — only approved.
  7. Trash icon, title "Delete" → opens `#deleteWpsModal` — only draft.
- Status values visible in the Status menu: draft, review, approved, superseded, archived.

## Dialogs
Fields are listed by `name` where the input has one, otherwise by `id` (these dialogs mostly use ids and read values in script).
### Create New WPS (`#createWps`) — opened by "Create New WPS" and the "+" in the panel heading
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project * | project_id | select (select2) | yes | "Select Project..." | 3 projects (see project filter) |
| 2 | WPS Number * | wps_number | text | yes | – | placeholder "e.g., WPS-001"; help: unique identifier |
| 3 | WPS Number (Short) | wps_number_short | text | no | – | placeholder "e.g., 001"; help: optional short version |
| 4 | Pre-fill source (optional) | create_source | radio | no | none | "Empty WPS (no pre-fill)" = none; "Start from PQR" = pqr; "Create from template" = template |
| 5 | Select PQR * | pqr_id | select (select2) | when source = pqr | "Select PQR..." | group `#create_pqr_group` hidden until "Start from PQR"; only the placeholder option is in the capture (options not loaded) |
| 6 | Select template * | template_id | select (select2) | when source = template | "Select template..." | group `#create_template_group` hidden until "Create from template"; filled by request `wps-designer-template-list.php` (templates: id, name) |
Buttons: "Cancel" (dismiss), "Create & Edit" (`createWps()`).
### Use for project (`#useForProjectModal`) — opened by the share icon in a row
| # | Label | id | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | (hidden source id) | ufpSourceId | hidden | – | row id | – |
| 2 | Doelproject * | ufp_project_id | select (select2) | yes | "Select Project..." | 3 projects |
| 3 | WPS Number voor de kopie | ufp_wps_number | text | no | empty | placeholder "Leeg = automatisch" |
| 4 | PQR-koppelingen meenemen naar de projectkopie | ufp_copy_pqr | checkbox | no | checked | – |
Text: explains that a draft project copy of a master template is made, and that the copy goes through its own review / approve process for that project, including customer signing where applicable. Buttons: "Cancel", "Projectkopie maken" (`confirmUseForProject()`).
### Delete WPS (`#deleteWpsModal`) — opened by the trash icon in a draft row
Hidden `deleteWpsId` (row id). Text: confirmation question and "This action cannot be undone." Buttons: "Cancel", "Delete" (`confirmDeleteWps()`).
### Source Data panel (`#sourceDataPanel`, hidden until "Source Data") — not a dialog; heading "Source Data Management", close button "Sluiten"; info text (Dutch) says it manages the dropdown values of the WPS Designer. 10 tabs (links `#src-…`), each a client-side table (length options 10/25/50/100, default 25, search box) with Edit (pencil) and Delete (trash) buttons per row and an Add button above:
| Tab | Add button | Columns | Rows in sandbox |
|---|---|---|---|
| Materials (`#src-materials`) | "Add Material" | Material Type, Material Group, ASME P-Number, ASME Group Number, AWS Classification, Actions | 10 |
| Weld Processes | "Add Weld Process" | Process Code, Description (EN), Description (NL), Actions | 7 |
| Weld Positions | "Add Weld Position" | Position Code, Description (EN), Description (NL), Actions | 15 |
| Joint Types | "Add Joint Type" | Joint Type, Description, Actions | 8 |
| Consumable Brands | "Add Consumable Brand" | Brand Description, ISO Code, AWS Classification, Actions | 6 |
| Wire Types | "Add Wire Type" | Wire Code, Description (EN), Description (NL), Actions | 10 |
| Shielding Gas | "Add Gas Type" (heading "Shielding Gas Types") and "Add Composition" (heading "Gas Compositions") | Gas Code, Description (EN), Description (NL), Actions; and Composition Description, Actions | 10 and 8 |
| Tungsten | "Add Tungsten Type" | Tungsten Code, Description (EN), Description (NL), Actions | 6 |
| Compatibility Rules | "Rule Set" and "Regel" | Rule Set, Norm, Context, Target, Type, Prio, Acties (plain table, no paging) | 67 (40 shown in capture) |
| Standards | "Add Standard" | Code, Label, Profile, PDF Template, Sort Order, Active, Actions (sort: Sort Order, then Code) | 4 |
Compatibility tab also has a select `#compatFilterSet` "Filter op Rule Set" (8 options: "Alle rule sets" + 7 sets, labelled "name [standard or global]"; changing it reloads rules) and a Dutch intro text saying rules decide which materials, processes, positions and joints may be combined and apply directly in the WPS editor.
Source Data edit dialogs (each has Cancel + Save; title switches "Add …"/"Edit …"; `Save` on submit):
| Dialog id | Fields (id, type, required) |
|---|---|
| `#materialModal` "Add Material" | material_id hidden; material_type text * ("Material Type *"); material_group text; asme_p_number text; asme_group_number text; aws_classification text |
| `#processModal` "Add Weld Process" | process_id hidden; process_code text * (placeholder "e.g., SMAW, GTAW, GMAW"); process_description_en text * ("Description (English) *"); process_description_nl text ("Description (Dutch)") |
| `#positionModal` "Add Weld Position" | position_id hidden; position_code text * (placeholder "e.g., 1G, 2G, 5G, 6G"); position_description_en text *; position_description_nl text |
| `#jointModal` "Add Joint Type" | joint_id hidden; joint_type text * (placeholder "e.g., Butt, T-Joint, Corner"); description textarea (rich-text editor, toolbar bold, italic, two list buttons, four align buttons, clean) |
| `#consumableModal` "Add Consumable Brand" | consumable_id hidden; consumable_description text * ("Brand Description *"); consumable_iso_code text; consumable_aws_classification text |
| `#wireModal` "Add Wire Type" | wire_id hidden; wire_code text *; wire_description_en text; wire_description_nl text |
| `#gasTypeModal` "Add Gas Type" | gastype_id hidden; gastype_code text * ("Gas Code *"); gastype_description_en text; gastype_description_nl text |
| `#gasCompModal` "Add Composition" | gascomp_id hidden; gascomp_description text * |
| `#tungstenModal` "Add Tungsten Type" | tungsten_id hidden; tungsten_code text *; tungsten_description_en text; tungsten_description_nl text |
### Compatibility rule (`#compatRuleModal`, title "Compatibiliteitsregel"; JS titles "Nieuwe regel" / "Regel bewerken") — "Regel" button or row Edit
| # | Label | id | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | – | compat_rule_id | hidden | – | – | – |
| 2 | Rule Set * | compat_rule_set_id | select | yes | first set (or the filter's set when adding) | 7: 7 Joints dikte/materiaal; 1 Processen per P-Number; 6 ASME materialen; 5 ASME posities; 3 EN posities; 4 EN ISO 15609-1 posities; 2 ISO posities |
| 3 | Rule Type | compat_rule_type | select | no | Allow | allow → Allow; deny → Deny |
| 4 | Priority | compat_priority | number | no | 100 | – |
| 5 | Context Field (panel "WHEN (context)") | compat_context_field | select | no | always (altijd) | always, standard_code, asme_p_number, thickness_max, thickness_min |
| 6 | Operator | compat_context_operator | select | no | eq (=) | eq, lte (≤), gte (≥), lt (<), gt (>) |
| 7 | Context Value | compat_context_value | text | no | – | placeholder "bijv. P-8, 6, ISO 15614-1"; help: may be empty or * for always |
| 8 | Target Type (panel "THEN (target)") | compat_target_type | select | no | process_code | process_code, position_code, joint_keyword, material |
| 9 | Target Value | compat_target_value | text | yes | – | placeholder "bijv. 141, PA, double v, missing_asme_p"; help: process_code = ISO 4063 code, position_code e.g. PA/1G, joint_keyword = substring of joint type, material: missing_asme_p = without P-Number |
| 10 | Notities | compat_notes | text | no | – | – |
Buttons: "Annuleren", "Opslaan".
### Rule Set (`#compatSetModal`, title "Rule Set"; JS "Nieuwe rule set") — "Rule Set" button
Fields: compat_set_id hidden; compat_set_name text * ("Naam *"); compat_set_standard select ("Norm (leeg = alle normen)"; 5 options: "— Alle normen —" (empty, default), ISO 15614-1, ASME IX, EN 13480, EN ISO 15609-1); compat_set_description text ("Beschrijving"); compat_set_active checkbox ("Actief", checked). Buttons "Annuleren", "Opslaan".
### Standard (`#standardModal`, "Add Standard" / "Edit Standard") — "Add Standard" or row Edit
| # | Label | id | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | – | standard_id | hidden | – | – | – |
| 2 | Code * | std_code | text (max 100) | yes | – | read-only when editing; help: unique, cannot change after creation |
| 3 | Label * | std_label | text (max 190) | yes | – | – |
| 4 | Profile | std_profile | select | no | generic | generic, iso_european, asme, aws |
| 5 | Default Revision | std_revision_default | text (max 50) | no | – | sent as null when empty |
| 6 | PDF Template | std_pdf_template_id | select | no | "— Default (normal) —" | 7: (empty) default; normal "Standard (Full A4)"; compact "Compact (1-2 pages)"; asme-ix "ASME IX"; iso-15614 "ISO 15614-1"; iso-15609 "EN ISO 15609-1"; en-13480 "EN 13480 (Piping)" |
| 7 | PQR Match Patterns | std_pqr_patterns | textarea (rich-text widget) | no | – | one pattern per line, case-insensitive substring match |
| 8 | Show ASME F-No / A-No fields (UI Flags) | std_show_f_a_numbers | checkbox | no | unchecked | – |
| 9 | Show ASME P-Group numbers | std_show_p_group | checkbox | no | unchecked | – |
| 10 | Position Scheme | std_position_scheme | select | no | iso_only | iso_only "ISO only (PA–PG)"; iso_and_asme "ISO + ASME (PA–PG + 1G–6G)"; all "All" |
| 11 | Require F-No/A-No on approve (Validation Flags) | std_require_f_a | checkbox | no | unchecked | – |
| 12 | Require PQR on approve | std_require_pqr | checkbox | no | checked | – |
| 13 | Require EN material group | std_require_en_group | checkbox | no | unchecked | – |
| 14 | Sort Order | std_sort_order | number (min 0) | no | 100 | – |
| 15 | Active | std_active | select | no | Active | 1 Active; 0 Inactive; help: inactive standards are hidden from the editor dropdown except for WPS that already use them |
Buttons "Cancel", "Save".

## Rules found in the page's JavaScript
- Create (`createWps`): browser validity check on the form; if source = pqr and no PQR chosen → alert "Please select a PQR record."; if source = template and none chosen → alert "Please select a template." While waiting the body shows a spinner "Creating WPS..."; on success it opens the editor `wps-designer-edit&id=<wps_id>` (adds `&prefill=<prefill_summary>` when the server returns one); on error the form is restored. Request: POST `wps-designer-create.php`, serialized form (project_id, wps_number, wps_number_short, create_source, pqr_id, template_id).
- Radio `create_source`: shows the PQR select for "pqr", the template select for "template"; clears the one not chosen.
- Clone (`cloneWps`): browser prompt "Nieuw WPS nummer voor clone (leeg = auto):"; Cancel aborts. POST `wps-designer-clone.php` {source_id, new_wps_number}; opens editor with `&wizard=1`.
- Create revision (`createRevision`): confirm "Create a new revision of this WPS?"; POST `wps-designer-create-revision.php` {wps_id}; opens editor on `new_wps_id`.
- Use for project: requires a target project (alert "Kies een doelproject."); POST `wps-designer-clone.php` {source_id, target_project_id, as_master_copy: 1, copy_pqr_links 0/1, new_wps_number}; opens editor on the copy.
- Archive: confirm (Dutch text: archived WPS stays visible but is no longer active); POST `wps-designer-save.php` {id, status: 'archived'}; reloads table.
- Delete: POST `wps-designer-delete.php` {id}; hides dialog, reloads table.
- Templates: on load, GET/POST `wps-designer-template-list.php` fills `#create_template_id` (and any `.wizard-template`) with {id, name}.
- Source Data CRUD (all tabs except compatibility): edit loads the row by POST `wps-source-get.php` {table, id}; delete asks "Are you sure you want to delete this …?" then POST `wps-source-delete.php` {table, id}; save POST `wps-source-save.php` {table, id, data{…}}; success reloads the whole page, failure alerts "Error: …". Table names: wps_source_materials, wps_source_weld_processes, plus equivalents per tab (positions, joints, consumables, wire, gas types, gas compositions, tungsten) and wps_source_standards.
- Standards save: patterns textarea split by line, trimmed, blanks dropped, stored as a JSON list; UI flags stored as JSON {show_asme_f_a_numbers, show_asme_p_group_numbers, position_scheme}; validation flags as JSON {require_f_a_numbers_on_approve, require_pqr_on_approve, require_en_material_group}; sort_order defaults to 100; code is sent only on create and is read-only on edit.
- Compatibility: `wps-compatibility-get.php` returns rule sets and rules (param `rule_set_id`, or `id` for one rule); `wps-compatibility-save.php` with `entity` = rule | rule_set; `wps-compatibility-delete.php` {entity: 'rule', id} after confirm "Regel verwijderen?". Rule rows render Context as "<field> <operator> <value>" (just "always" when always), Target as "<type> = <value>", Type as a green allow / red deny label, Norm as the set's standard or "global". Empty text "Geen regels. Voer migratie v4 uit of voeg regels toe."
- Select2 is applied to selects with class select2-single and rebuilt after dynamic option changes.
- Not on this page's scripts: the approval, review and signature steps (see below).

## Sample data
List: no rows ("No WPS specifications found", "Showing 0 to 0 of 0 entries") for the observing account with project filter "All Projects".
Source Data (visible after "Source Data"): materials 10, processes 7, positions 15, joints 8, consumable brands 6, wire types 10, gas types 10, gas compositions 8, tungsten 6, compatibility rules 67 in 7 sets, standards 4.
Standards (all 4 rows):
| Code | Label | Profile | PDF Template | Sort Order | Active |
|---|---|---|---|---|---|
| ISO 15614-1 | ISO 15614-1 | iso_european | iso-15614 | 10 | Active |
| ASME IX | ASME IX | asme | asme-ix | 20 | Active |
| EN 13480 | EN 13480 | iso_european | en-13480 | 30 | Active |
| EN ISO 15609-1 | EN ISO 15609-1 | iso_european | iso-15609 | 40 | Active |
Examples: material "ASTM A106 Grade B" / P-1 / group 1 / "A106 Gr.B"; process "141" "Tungsten inert gas welding (141 / GTAW / TIG)"; position "PA" "Flat position (PA / 1G)"; joint "Single V butt" "Single V-groove butt joint (ISO 9692-1)"; consumable "ER316L (AWS A5.9)" / "ISO 14343-A-W 19 12 3 L" / "ER316L"; wire "ER70S-6"; gas "M21" "Ar + 15–25% CO2 (M21)"; tungsten "WL15" "1.5% Lanthanated (Gold)". Rule examples: set "Processen per P-Number", global, `asme_p_number eq P-1`, `process_code = 111`, allow, 100; set "Joints dikte/materiaal", global, `thickness_max lte 6`, `joint_keyword = double v`, deny, 90; set "ASME posities", ASME IX, always, `position_code = PA`, allow, 100.

## Not in the capture
- The WPS editor (`index.php?page=wps-designer-edit&id=<id>`, also `&wizard=1`, `&prefill=…`): its sections, field groups, review / approve / sign steps, PDF generation and PQR linking are not shown. Opened by the pencil icon, Create & Edit, Clone, Create Revision or Use for project. Size of the editor cannot be estimated from this capture. The statuses Draft / Review / Approved / Superseded / Archived, "Require PQR on approve" and "Require F-No/A-No on approve" flags, and the customer signing mention in "Use for project" are the only approval-related facts visible; no signature or sign-off control is on this page.
- The PDF behind "View PDF" (`pdf_url`) and the PDF templates themselves.
- Rows of the list (none for this account); the 27 compatibility rules beyond the first 40; options of the "Select PQR" select (loaded elsewhere; only the placeholder is present).
- Responses of the requests (`wps-compatibility-get.php`, `wps-designer-list.php`, `wps-designer-template-list.php` are listed as loaded; bodies not captured).
Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
