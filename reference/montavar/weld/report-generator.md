# WeldPilot → Report generator → Form designer, My templates (deferred feature)

Source: `weld__reportgen__form-designer.txt`, `weld__reportgen__my-templates.txt` — captured 2026-11-16 on the sandbox project site, read-only. URLs: `/weldpilot/index.php?page=drag-drop-forms-vue3` (Form designer), `/weldpilot/index.php?page=form-templates` (My templates).
State of the page for the observing account: normal (both open). No dialog captures (`weld__reportgen__*__<something>`) exist and the browser-pass notes (`_interactive/*.md`) do not mention these pages. This is an overview for sizing, not a field-level spec.

Menu: "Report generator" (accordion, icon `glyphicon-th-list`) holds two items: "Form designer" (`page=drag-drop-forms-vue3`, icon `glyphicon-edit`) and "My templates" (`page=form-templates`, icon `glyphicon-list`).

## 1. Form designer

### Page
- Browser title: "Form Designer - Enterprise Edition". It is a separate single-page application (Vue 3, mounted at `#app`, class `form-designer-app`) inside the WeldPilot page; it does not use the normal page chrome (no header, side menu or breadcrumb in the capture).
- The page loads PDF.js (`pdf.js`, `pdf.worker.js`) as a module; the designer is a bundled file `/core/pages/drag-drop-forms-enterprise/frontend/dist/assets/js/index-….js`. Its source is not in the capture, so its behaviour is known only from what the DOM and the config object show.
- The only request seen while loading: `/core/ajax/get-profiles.php`.
- Interface texts are a mix of English and Dutch.

### Top toolbar (buttons in order; label — title text — state at load)
| Label | Title | State |
|---|---|---|
| New | New | enabled |
| Save | Save as | enabled |
| Save as | Save as | enabled |
| Load | Load | enabled |
| Draft | Draft | enabled |
| Test invullen | Open invulscherm (Route 2) — optioneel met isometrie-ID | disabled (green button) |
| (icon: undo) | Ongedaan maken (Ctrl+Z) | disabled |
| (icon: redo) | Opnieuw (Ctrl+Shift+Z / Ctrl+Y) | disabled |
| PDF | PDF Achtergrond | enabled |
| Fields | Add the customer form as a PDF background first. | disabled |
| (icon: trash) | Verwijderen | enabled |
| (icon: copy) | Dupliceren | enabled |
| (icon: zoom out) | Zoom uit | enabled |
| (text) | zoom level shown as "100%" | — |
| (icon: zoom in) | Zoom in | enabled |
| (icon: aspect ratio) | Reset zoom | enabled |
| Grid | Grid tonen/verbergen | toggle, on at load |
| Snap | Snap naar grid aan/uit | toggle, on at load |
| Portrait | Staand (portret) | toggle, on at load |
| Landscape | Liggend (landschap) | toggle, off at load |

What the capture shows beyond the labels: the "Fields" button is disabled with a title saying the customer form must first be added as a PDF background; "Test invullen" opens a fill-in screen ("Route 2"), optionally with an isometric ID. Nothing shows what Save / Save as / Load / Draft open.

### Page strip (multi-page forms)
Previous page (disabled), tab "Pagina 1" (active), next page (disabled), add page ("Pagina toevoegen"), duplicate page ("Pagina dupliceren"), delete page ("Pagina verwijderen", disabled), counter "1 / 1".

### Elements panel (left, title "Elements", has a close button)
- Button "Logo" (insert block, image icon).
- Group "Input fields": Text field, Text area, Checkbox, Radio, Dropdown, Date.
- Group "Other": Label, Image, Signature.

### Element properties panel (right, title "Element properties", has a close button)
Empty state text: "Select an element to edit its properties". Multi-select help: Ctrl+Click adds an element, Shift+Click selects a range, a click on empty space deselects. The property fields themselves are not in the capture (panel empty).

### Page configuration (inline script)
- `FORM_DESIGNER_APP = "weldpilot"`; `FORM_DESIGNER_CONFIG` = `{app: weldpilot, label: WeldPilot, features: {showExecutionSteps: false, showIsometrics: true, showWelds: true, showCivilElements: false}}`. The same designer is shared with a second app ("civilpilot") and is switched by this config.
- `FORM_DESIGNER_LANG = "en"`; `FORM_DESIGNER_LOGO_URL` = the company logo image.
- `FORM_DESIGNER_FIELD_VALUES`: ready-made values the designer can place into a form. Keys: company_name, company_address, company_zip, company_residence, company_phone, company_fax, company_mailbox, company_mnzip, company_mnresidence, company.logo, user.name, user.email, user.role, site_name, site_code, site_address, site_phone, site_email, site_zip, site_residence, current_date, current_datetime, today, now, vandaag, huidige_datum. Sandbox values: company_name "Montavar Engineering doo", site_name "Zandbak", current_date "2026-11-16", current_datetime "2026-11-16 13:14:48"; user.* hold person A's data (not copied).
- Template parameters, all `null` at load: `LOAD_TEMPLATE_ID`, `USE_TEMPLATE_ID`, `FORM_NAME`. The page takes them from the URL (see section 2: `use_template`, `form_name`).
- `CSRF_TOKEN` is set on `window`. API base: `/core/ajax/` with fallback `/live/core/ajax/`.

### Rules found in the page's JavaScript
Only the inline config above; the designer's own logic is in the bundled file that is not captured. Requests seen: `get-profiles.php` (on load). Other inline lines are the shared site scripts (`getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`) that belong to every page, not to this one.

### Sample data
None: the page opens an empty new form (Pagina 1 of 1, 100% zoom, portrait).

## 2. My templates

### Page
- Browser title "- WeldPilot®"; content header "Form templates"; breadcrumb: "Start" (`index.php`) → "Form templates" (`index.php?page=form-templates`).
- Top-bar button "New template" (`btn-primary`, plus icon) → `index.php?page=drag-drop-forms-vue3` (the Form designer).
- Empty-state alert (shown when there are no templates): "Geen templates gevonden." with link "Maak uw eerste template" → the Form designer.
- Panel "Available templates" holds the table.

### List
- Table `#datatableFormTemplates`, client-side (`serverSide` false, no ajax URL; rows are in the page HTML).
- Columns in order (all visible): Name (sortable), Status (sortable), Description (sortable), Aangemaakt door (sortable), Formaat (sortable), Created at (sortable), Publiek (sortable), Replaces document (not sortable), Options (not sortable).
- Default sort: the DT configuration in the capture says column 7 "Publiek" ascending (`[[6,"asc"]]`); the page script calls `order: [[5,'desc']]` ("Order by created date", Created at descending). The two disagree; the capture does not show which one wins. The script also fixes columns 7 and 8 as not orderable with width 180px.
- Page length 25; options 10, 25, 50, 100 ("Show … entries"). One global search input (placeholder "Search", clear button); no per-column search.
- Info text "_START_ - _END_ / _TOTAL_", empty "0 - 0 / 0"; "No records found"; filtered "(filtered from _MAX_)"; pager labels First, Previous, Last (Next not shown in the capture lines).
- No export / print buttons and no bulk-action menu.
- Row options: the capture has zero rows, so the row markup is not shown. The script defines these actions, which the row options call: `previewTemplate(id)`, `useTemplate(id)`, `duplicateTemplate(id)`, `deleteTemplate(id)`; and a select with class `template-binding-select` (data attribute `template-id`) in "Replaces document". Labels and icons of the row options are not in the capture.

### Dialogs
1. **Template Preview** (`#templatePreviewModal`) — opened by `previewTemplate`. Body "Laden..." until loaded; content is placed into an element `#previewContainer`; footer button "Sluiten". No inputs.
2. **Template Gebruiken** (`#useTemplateModal`) — opened by `useTemplate`. Text: "Wilt u dit template gebruiken om een nieuw formulier te maken?"

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Formulier Naam: | (none; id `newFormName`) | text, placeholder "Geef het formulier een naam" | yes (script rejects empty or whitespace) | empty | — |

Buttons: "Annuleren" (closes), "Template Gebruiken" (`confirmUseTemplate()`).

Dialogs `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#editServiceRequest`, `#editFlange`, `#docsFlange`, `#showStorehouseAuditTrail`, `#viewLagerCerts` and the `SAME-AS` modals exist in the page but are opened from elsewhere.

### Rules found in the page's JavaScript
- Table init: see sorting above; instant search.
- `confirmUseTemplate`: if the name is empty/blank, `alert` "Vul een naam in voor het formulier."; otherwise navigates to `index.php?page=drag-drop-forms-vue3&use_template=<id>&form_name=<url-encoded name>` (the designer then reads these two parameters).
- `previewTemplate`: request to `../core/ajax/preview-template.php` with `template_id`; the response HTML is shown in the preview dialog; on failure shows an error alert "Fout bij laden van preview".
- `duplicateTemplate`: `confirm` "Wilt u dit template dupliceren?"; request to `../core/ajax/duplicate-template.php` with `template_id` (header `X-Requested-With: XMLHttpRequest`); success message "Template succesvol gedupliceerd!"; failure "Fout bij dupliceren: <error>" or "Er is een fout opgetreden bij het dupliceren."; HTTP method and what happens to the table after success are not visible.
- `deleteTemplate`: `confirm` "Weet u zeker dat u dit template wilt verwijderen? Deze actie kan niet ongedaan gemaakt worden."; request to `../core/ajax/delete-template.php` with `template_id` (same header); success "Template succesvol verwijderd!"; failure "Fout bij verwijderen: <error>" or "Er is een fout opgetreden bij het verwijderen."
- Document binding (`change` on `.template-binding-select`): POST to `../core/ajax/set-form-template-binding.php` with `template_id`, `document_binding` (the select's value) and `_csrf` when a token exists; select is disabled while the request runs; expects JSON `{success, message}`; on failure `alert` "Koppeling opslaan mislukt: <message or onbekende fout>" or "Koppeling opslaan mislukt." The select's options are not in the capture.
- Page request on load: `/core/ajax/ajax-notifications.php?action=count_unread` (shared site header).

### Sample data
Sandbox has 0 templates: the table shows "No records found" and the info "0 - 0 / 0"; the info alert "Geen templates gevonden." is shown.

## Size indicators (from the capture only)
- Server endpoints named: `get-profiles.php`, `preview-template.php`, `duplicate-template.php`, `delete-template.php`, `set-form-template-binding.php`; plus unnamed save / load / draft / fill-in ("Route 2") / PDF-background / field-detection endpoints implied by toolbar buttons.
- Template list fields visible: Name, Status, Description, creator, format, created date, public flag, replaced document (9 columns).
- Designer: page canvas with grid/snap/zoom/orientation, multi-page, 10 element kinds (Logo, Text field, Text area, Checkbox, Radio, Dropdown, Date, Label, Image, Signature), PDF background import, property panel, multi-select, undo/redo, 26 predefined merge values.

## Not in the capture
- Everything the designer does after a click: what New, Save, Save as, Load, Draft, PDF, Fields, Test invullen open; the property fields per element; the file formats of Formaat; the values of Status.
- Template rows (none exist), the row-option labels and the options of the "Replaces document" select.
- Where the filled-in forms are stored or listed, and how a form becomes a PDF report (no other Report generator item exists in the menu).
- The designer's bundled source.
