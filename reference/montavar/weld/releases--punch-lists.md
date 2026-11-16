# Weld Pilot → Releases → Punch lists

Source: `weld__releases__punch-lists.txt`, `weld__releases__punch-lists__add-item.txt`, `weld__releases__punch-lists__add-item-manual.txt`, `weld__releases__punch-lists__report-passed.txt`, `weld__releases__punch-lists__edit.txt`, `weld__releases__punch-lists__history.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=punchlists`.
State of the page for the observing account: normal. Browser tab title: "Punch lists - WeldPilot®".

The sign-off dialog and the "Remove punchlist" dialog are written in this capture or in `weld__start__dashboard.txt` (shared dialogs); their scripts come from `weld__start__dashboard.txt` and are marked "from the dashboard capture" below.

## Page

- Breadcrumb / heading link: "Punch lists" → `index.php?page=punchlists`. No tabs on this page.
- Language links in the header (same page): Nederlands, English, Deutsch, Français → `/weldpilot/index.php?lang=<nl|en|de|fr>&page=punchlists&id=&project=&projectSite=`.
- Buttons above the list, in order:

| Label | Look | What it does |
|---|---|---|
| Print (icon `fa-print`, id `wp-punch-print-filter`) | dark, small | opens dialog `#pdfPunchListFilter` ("Print"); title text (Dutch): "PDF: geselecteerde items, anders huidige filter (optioneel met bijlagen)" |
| Mark as finished (Sign-off) (icon `fa-check`, id `hydrotestRequestID`) | dark, small, **hidden** | opens `#wpPunchFinishSignoff` for the ticked rows; it is shown only while at least one row checkbox is ticked and the view is the default open view (class `wp-open-finish-signoff-bulk`) |
| Add item (icon `glyphicon-plus`, class `open-punchlist`, `data-id="0"`) | blue block button | opens dialog `#punchlist` ("Punch lists"), body loaded by `GET /core/ajax/punchlist.php?id=0&type=punchlists&action=showroom` |
| Export (icon `fa-file-excel-o`) | dark, small | link `/mtopilot/export-punchs.php`; title (Dutch): "Export uit brondata (geen cache-verversing nodig)" |

- Handheld floating menu (present on the page): "Scan weld", "Scan flange QR label", "Add punch" (`data-action="punchlist"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"`, opens `#punchlist` scan-first). Floating button title "Handheld".
- KPI tiles (links, order; the number comes first, then the label) — each sets the view / punch type / due filter of the list and reloads it:

| Tile label | Count shown | `data-view-t` | `data-punch-type` | `data-due-filter` | Extra class |
|---|---|---|---|---|---|
| Open | 1 | (empty) | (empty) | (empty) | `is-active` on load |
| Pre-punch (open) | 1 | (empty) | prepunch | (empty) | |
| Punch (open) | 0 | (empty) | punch | (empty) | |
| Te laat | 1 | (empty) | (empty) | overdue | `stat-overdue` |
| Deadline 7 dgn | 0 | (empty) | (empty) | due_soon | `stat-due-soon` |
| Finished | 0 | finished | (empty) | (empty) | `stat-finished` |
| Passed | 0 | passed | (empty) | (empty) | `stat-passed` |
| Removed | 0 | removed | (empty) | (empty) | |

  Colours from the browser-pass notes: Te laat has a red border, Deadline 7 dgn orange, Finished blue, Passed green.
- Filter bar (above the table), with hidden inputs `#wp-filter-viewT`, `#wp-filter-due`, `#wp-filter-iso` (value 0), `#sids` (ticked ids):
  - Project (`#wp-filter-project`, select2, placeholder "All"): options "" (All) and `1` → "20240101 — Template project" (2 options).
  - Punch type (`#wp-filter-punch-type`, select2 without search, placeholder "All"): "" , `prepunch` → Pre-punch, `punch` → Punch (3 options).
  - Type (`#wp-filter-item-type`, select2, placeholder "All"): "" , A, B, C, D (5 options).
  - Button "Toepassen" (`#wp-filter-apply`, primary, filter icon) and button "Reset" (`#wp-filter-reset`).
- Below the list: a green collapsible panel "AI Punch Categorization" (see Dialogs / Not in the capture).

## List

- Panel title "Punch lists" (dark panel). Table `#datatablePunchList`, class `wp-punch-view-open`, striped/bordered/hover.
- Columns in order (title, data index, sortable): #(0), Project(1), Isometric(2), Type(3), Description(4), Due date(5), Contractor(6), Punch(7), Document(8), Status(9), Options (no data, not sortable, class `wp-punch-options-col`). All are visible; there are no hidden columns in the `DT` configuration. (The script reads the punch id of a row from data index 10, which is not a column.)
- Default sort: column 9 (Status) ascending. Page length 20; length menu 10, 20, 50, 100, 500. Server-side table: `GET /core/ajax/get-weldpilot-punchlist-datatable.php`; extra parameters sent with each draw: `viewT` (from the active tile), `project_id`, `iso_id`, `punch_type`, `item_type`, `due_filter`.
- Search: one search box with placeholder "Search" and a clear button (×). No per-column search inputs.
- Texts: empty "No data available in table"; info "Showing _START_ to _END_ of _TOTAL_ entries"; zero-match "No matching records found"; sandbox shows "Showing 1 to 1 of 1 entries".
- Overdue rows get the row class `wp-punch-row-overdue` (due date shown in red, from the browser-pass notes).
- The Isometric cell is a link: `index.php?page=isometrics&id=<iso id>&project=<project id>` opened in a new tab.
- Row options, in order (view "Open" only where stated):
  1. Arrow-up button (`wp-punch-promote`, blue, title "Promoveer naar Punch") — shown on a Pre-punch row; posts to `/core/ajax/promote-weldpilot-punch.php` with `punch_id`.
  2. "Mark as finished" (dark, check icon, `open-markPunchAsFinished`, `href="#wpPunchFinishSignoff"`) — opens the sign-off dialog for this one item.
  3. Trash button (red, `open-markPunchAsRemoved`, `href="#markPunchAsRemoved"`) — opens "Remove punchlist".
  4. Pencil button (orange, `open-punchlistEdit`, `href="#punchlistEdit"`, title "Bewerken") — opens "Edit punchlist item".
  5. History button (`open-wpPunchAudit`, title "Activity log") — opens "Activity log".
  6. Row checkbox (class `checkbox`) — feeds `#sids` and shows the bulk "Mark as finished (Sign-off)" button.
- Bulk actions: only the "Mark as finished (Sign-off)" button above the list and "Print" (prints the ticked rows when any are ticked, otherwise the current filter). No Options menu.
- Export button: link to `/mtopilot/export-punchs.php` (see Page). No DataTables export/print buttons in the table.

## Dialogs

### Print (`#pdfPunchListFilter`) — opened by Print (`#wp-punch-print-filter`)
Form `#wp-punch-filter-pdf-form`, method GET, action `/core/pdf/punchlist.php`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | mode | hidden (`#wp-pf-pdf-mode`) | no | filter | set to `selection` when rows are ticked, otherwise `filter` |
| 2 | (none) | isos | hidden (`#wp-pf-pdf-isos`) | no | empty | filled with the ticked ids (comma list) |
| 3 | (none) | view | hidden (`#wp-pf-pdf-view`) | no | empty | filled from the active view tile |
| 4 | (none) | project_id | hidden (`#wp-pf-pdf-project`) | no | empty | filled from the Project filter |
| 5 | (none) | punch_type | hidden (`#wp-pf-pdf-punch-type`) | no | empty | filled from the Punch type filter |
| 6 | (none) | due_filter | hidden (`#wp-pf-pdf-due`) | no | empty | filled from the due filter |
| 7 | Language | lang | select (select2) | no | English | 4 options: en → English (default), nl → Nederlands, de → Deutsch, fr → Français |
| 8 | Punch document (Document column / download) | import_doc | checkbox | no | unchecked, value `ok` | optional attachment |
| 9 | Isometric drawing (imported PDF per isometric) | import_iso | checkbox | no | unchecked, value `ok` | optional attachment |

Text: a hint line `#wp-pf-pdf-hint` shows either "All items matching the current filter" or "Selected punch items (N)"; a line says optional attachments apply only to items in the report. Buttons: "Print" (`#wp-punch-pdf-print-btn`, primary), "Cancel". Print opens the PDF URL in a new tab (see Rules).

### Punch lists (`#punchlist`) — opened by Add item (and the handheld "Add punch")
Title "Punch lists" (`#wpPunchModalTitle`), body `#contentPunchlist` loaded by `GET /core/ajax/punchlist.php?id=0&type=punchlists&action=showroom`. Top: blue hint, in my words: manage items and view lists on the punch list page; this dialog is only for quick add and passed reporting; links "Open punch list" (`index.php?page=punchlists`) · "Passed overview" (`index.php?page=punchlists&viewT=passed`), both new tab. Two pill tabs: "Add item" (`#tab18_1`, active) and "Report passed" (`#tab18_2`). A hidden iframe `#punchlistActionFrame` (title "Punchlijst acties") exists. Footer button "Close".

#### Tab "Add item" — form `.wp-punch-add-form` (POST, multipart; `data-wp-ctx-mode="global"`, `data-wp-ctx-iso-id="0"`, `data-wp-ctx-project-id="0"`, `data-wp-ctx-needs-manual="1"`)
Section title "New item". Source toggle: buttons "Scan" (active in the first capture) and "Manual". Scan panel: help text (paraphrase: scan a weld label QR or the ISO book front-sheet QR and project and isometric fill in automatically), button "Start scanner", button "Stop" (hidden), status text "Scan a weld label QR code.". In the "Manual" capture the Scan panel is hidden and Project / ISO show.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | project (`#mark`) | select (select2) | no flag; script message "Please select a project." | 20240101 | 1 option: 1 → 20240101. Visible only in Manual mode (class `wp-punch-manual-fields`) |
| 2 | ISO | iso (`#series`) | select (select2) | no flag; script message for iso | "- Project related, not iso" | 8 options: 0 → - Project related, not iso*; 1 → 0001; 6 → 00022; 895 → 0003; 6191 → 00032; 6598 → 0005; 15767 → 0007; 15424 → WF-73031-ST_STB000-01. Visible only in Manual mode |
| 3 | Type | type | select (select2) | no | A — Immediate fix (blocking) | 4 options: A → A — Immediate fix (blocking)*; B → B — ASAP fix (blocking); C → C — Fix (non-blocking); D → D — Fix in operation (non-blocking) |
| 4 | File (camera) | file | file, `accept="image/*"`, id `wpPunchFile0` | no | none | used by button "Take photo" |
| 5 | File (gallery) | file2 | file, `accept="image/*,application/pdf,.pdf"`, id `wpPunchFile0Gallery` | no | none | used by button "Choose file" |
| 6 | Description | description | textarea (rows 3) | yes by script ("Please enter a description.") | empty | |
| 7 | Due date | duedate | text, readonly datepicker | no | today (16.11.2026) | |
| 8 | Contractor | company | select (select2) | no | MONTAVAR METALNA LOLA | 2 options: 7 → MONTAVAR METALNA LOLA*; 8 → Websonik Applicaties BV |
| 9 | Reported date | reporteddate | text, readonly datepicker | no | today (16.11.2026) | |
| 10 | Reported by | reportedby | select (select2) | no | — | 31 options: 0 → — (default), then 30 users (value → name, sorted by name; people not copied here) |
| 11 | Pre-Punch | punch | radio, value 1 | yes by script ("Choose Pre-punch or Punch.") | checked | label class `wp-punch-kind-active` |
| 12 | Punch | punch | radio, value 2 | | unchecked | |
| 13 | (none) | scanned_weld_id | hidden | | 0 | filled by a scan (`wp-punch-scanned-weld-id`) |
| 14 | (none) | scanned_iso_id | hidden | | 0 | filled by a scan |
| 15 | (none) | typepage | hidden | | punchlists | |
| 16 | (none) | page_slug | hidden | | punchlists | |
| 17 | (none) | editID | hidden | | 0 | |
| 18 | (none) | requesteddate | hidden | | empty | |
| 19 | (none) | requestedby | hidden | | 0 | |

Other controls: file hint texts (desktop and tablet: take a photo or pick a PDF/image, photos auto-resized to about 1280 px; phone: take a photo or choose a file), buttons "Take photo" (`data-mode="camera"`) and "Choose file" (`data-mode="gallery"`), file-name text "Nothing selected", preview box `#wpPunchFilePreview0`. Submit button: "Add" (`name="addPunchlist"`, type submit, primary, full width, plus icon).

#### Tab "Report passed" — form `.wp-punch-add-form` (POST, multipart)
Section title "Report passed"; text in my words: registers that pre-punch or punch is complete for an isometric; the list is on the punch list page under the Passed filter.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | project (`#markPassed`) | select (select2) | script message "Please select a project." | 20240101 | 1 option: 1 → 20240101 |
| 2 | ISO | iso (`#seriesPassed`) | select (select2) | script message: "Please select an isometric (Passed requires an isometric)." | "- Project related, not iso" | same 8 options as above |
| 3 | File (camera) | file | file, `accept="image/*"`, id `wpPunchFilePassed0` | no | none | |
| 4 | File (gallery) | file2 | file, `accept="image/*,application/pdf,.pdf"`, id `wpPunchFilePassed0Gallery` | no | none | |
| 5 | Contractor | company | select (select2) | no | MONTAVAR METALNA LOLA | 2 options as above |
| 6 | Reported date | reporteddate | text, readonly datepicker | no | today (16.11.2026) | |
| 7 | Reported by | reportedby | select (select2) | no | — | 31 options as above |
| 8 | Pre-Punch | punch | radio, value 1 | script "Choose Pre-punch or Punch." | checked | |
| 9 | Punch | punch | radio, value 2 | | unchecked | |
| 10 | (none) | typepage | hidden | | punchlists | |
| 11 | (none) | page_slug | hidden | | punchlists | |
| 12 | (none) | editID | hidden | | 0 | |
| 13 | (none) | requesteddate | hidden | | empty | |
| 14 | (none) | requestedby | hidden | | 0 | |

Same file hint texts, "Take photo", "Choose file", "Nothing selected" as in the Add tab. Submit button: "Register passed" (`name="addPunchlistPassed"`, submit, green, full width, check icon). This tab has no Type, Description or Due date field.

### Edit punchlist item (`#punchlistEdit`) — opened by the row pencil
Form method POST, multipart; body `#contentPunchlistEdit` loaded by `GET /core/ajax/punchlistEdit.php?id=<row id>&action=showroom` (row id in the capture is `1.1`), then the activity log is appended from `GET /core/ajax/get-weldpilot-punch-audit.php?punch_id=<number before the dot>`. Dialog classes `bs-example-modal-lg wp-punch-enterprise-modal`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Type | type | select (select2) | no | value of the item (A in the sample) | 4 options: A → A — Immediate fix (blocking); B → B — ASAP fix (blocking); C → C — Fix (non-blocking); D → D — Fix in operation (non-blocking) |
| 2 | Description | description | text | yes (`required`) | item description | |
| 3 | Due date | duedate | text, class `dpicker` (not readonly here) | no | item due date (sample 21.03.2024) | |
| 4 | Contractor | company | select (select2) | no | item contractor | 2 options: 7 → MONTAVAR METALNA LOLA; 8 → Websonik Applicaties BV |
| 5 | Reported date | reporteddate | text, class `dpicker` | no | item reported date (sample 21.03.2024) | |
| 6 | Reported by | reportedby | select (select2) | no | sample: 0 → "-------------------------" | 31 options: 0 → ------------------------- then 30 users (value 1 and 3 to 31) |
| 7 | File | file | file ("Choose file" button; text box placeholder "Nothing selected") | no | none | |
| 8 | Pre-punch | punch | radio, value 1 | no | in the sample neither radio is checked although the list row says Pre-punch | |
| 9 | Punch | punch | radio, value 2 | no | unchecked | |
| 10 | (none) | editID | hidden | | `1.1` (item id as in the row) | |

Other controls: green button "Mark as Client approved" (class `wp-punch-accept-btn`, `data-punch-id="1"`; button type, not submit) under the fields; below it the activity-log paragraph (sample text, Dutch: "Geen activiteiten geregistreerd."). Footer: "Save" (`name="editPunchlist"`, submit, primary) and "Close".

### Activity log (`#wpPunchAuditModal`) — opened by the row history button
Body `#wp-punch-audit-body`: first "Loading...", then the response of `GET /core/ajax/get-weldpilot-punch-audit.php?punch_id=<id>`; sample response (Dutch): "Geen activiteiten geregistreerd."; if the response is empty the script writes "No activity recorded."; on failure "Error!". No inputs. Footer button "Cancel".

### Mark as finished (Sign-off) (`#wpPunchFinishSignoff`) — opened by the row "Mark as finished" button or the bulk button
Form `.wp-punch-finish-signoff-form` (multipart; submitted by script, see Rules). A summary line (class `wp-finish-signoff-summary`) is set by script to "N item(s) will be finished with sign-off." (bulk) or "This item will be finished with sign-off." (single row).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (none) | punch_ids | hidden (`wp-finish-punch-ids`) | | empty | filled by script: row punch id, or the ticked ids comma-separated |
| 2 | (none) | iso_id | hidden (`wp-finish-iso-id`) | | empty | filled from `#wp-filter-iso` |
| 3 | (none) | mark_passed | hidden | | 0 | |
| 4 | Signed by — Client | signer_type | radio, value client | | checked | |
| 5 | Signed by — User | signer_type | radio, value user | | | |
| 6 | Signed by — Inspection | signer_type | radio, value inspection | | | |
| 7 | Client name * | client_name | text | yes when signer is Client (message "Client name is required.") | empty | client fields shown for Client |
| 8 | Company | client_company | text | no | empty | |
| 9 | Function | client_function | text | no | empty | |
| 10 | (none) | use_saved_signature | hidden (`wp-signoff-use-saved`) | | 0 | inside the User block (hidden); the User block shows an info line naming the logged-in user (person A), a "Saved signature will be used" preview when one exists, or a warning "No saved signature. Register one under Signatures." with link "Signatures" → `index.php?page=signatures` (new tab) |
| 11 | (none) | saved_signature_type | hidden (`wp-signoff-saved-type`) | | full | |
| 12 | Inspector * | inspector_id | select (select2) | yes when signer is Inspection (message "Select an inspector.") | — | 31 options: 0 → — (default) then 30 users; block hidden until Inspection is chosen |
| 13 | Date * | signed_date | text, readonly, class `dpicker` | yes | today (16.11.2026) | |
| 14 | Remarks | remarks | textarea (rows 2) turned into a rich-text editor (Quill toolbar: bold, italic, two list buttons, four alignment buttons, clean) | no | empty | |
| 15 | Signature method — Draw digitally | signoff_method | radio, value draw | | checked | shows the drawing canvas with button "Clear" (eraser icon) |
| 16 | Signature method — Upload PDF | signoff_method | radio, value upload | | | shows the upload section |
| 17 | (none) | signature_data | hidden (`wp-signoff-signature-data`) | | empty | filled from the canvas as a PNG data URL on submit |
| 18 | Upload signed PDF | signoff_file | file, `accept=".pdf"` | | none | upload section, hidden unless "Upload PDF" is chosen |

Buttons: "Finish + Sign-off" (green, check icon, `wp-punch-finish-signoff-submit`), "Cancel".

### Remove punchlist (`#markPunchAsRemoved`) — opened by the row trash button (shared dialog, from `weld__start__dashboard.txt`)
Form POST, text "Are you sure?", hidden input `deleteID` (`#markPunchAsRemovedID`, set by script to the row's `data-id`). Buttons "Delete" (red, `name="markPunchlistAsDeleted"`, submit), "Cancel".

### AI Punch Categorization (panel, not a dialog)
Green panel opened by clicking its heading (collapse `#aiPunchBody`). Text (paraphrase): AI reads punch descriptions and suggests categories. Buttons: "Categorize uncategorized items" (`#aiPunchAnalyze`), "Apply all suggestions" (`#aiPunchApplyAll`, hidden until results exist). Hidden areas: "Analyzing descriptions..." (`#aiPunchLoading`), alert "No uncategorized punch items found." (`#aiPunchNoItems`), results (`#aiPunchResults`). No form inputs.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#wpWeldScanModal`, `#importCalculationsFromIso`, `#importCalculationsFromIsoProject`, `#removeLastCalculations`, `#setCheckedMaterialsTypeModal`, `#deleteCheckedMaterialsModal`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#addPqr`, `#addFlange`, `#deleteFlange`, `#importFlanges`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#createTransferOrder`, `#wpFlangeScanModal`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#setStatus`, `#statusLog`, `#showIsometric`, `#showQuantityLog`, `#materialStatusByRevision`, `#editServiceRequest`, `#editFlange`, `#docsFlange`, `#showStorehouseAuditTrail`, `#viewLagerCerts`.

## Rules found in the page's JavaScript

Page script (this capture, functions `wsappsPunch*`):
- Filtering: each KPI tile click copies its `data-view-t`, `data-punch-type`, `data-due-filter` into `#wp-filter-viewT`, the Punch type select and `#wp-filter-due`; if the view changed it calls `wsappsReinitPunchTable`, otherwise it reloads the table. Changing Project or Punch type clears the due filter and reloads. "Toepassen" reloads; "Reset" goes to `index.php?page=punchlists`. The URL is rewritten with `history.replaceState` to `index.php?page=punchlists` plus `viewT`, `punch_type`, `due_filter`, `project_id`, `iso_id` when set. The active tile is the one whose three data values match the current filter values.
- Bulk button `#hydrotestRequestID`: hidden at load; shown when `#sids` is not empty and hidden when the view is not the default open view (`wsappsPunchUpdateActionButtons`). Clicking a row checkbox calls `updateTextArea`.
- Print: on opening `#pdfPunchListFilter` the hidden fields are filled; with ticked ids `mode`=selection and `isos`=ids, otherwise `mode`=filter and `isos` removed; `go=1` is appended; the PDF opens in a new tab as `/core/pdf/punchlist.php?<fields>` (`https://montavar.websonik.nl/core/pdf/punchlist.php` is the base constant); if the pop-up is blocked a warning toast (Dutch) appears; the dialog then closes.
- Promote (`.wp-punch-promote`): `POST` (jQuery ajax, JSON) to `/core/ajax/promote-weldpilot-punch.php` with `punch_id`; on `ok` a success toast (default text "Gepromoveerd naar Punch") and table reload; otherwise error toast ("Promoveren mislukt") or "Promoveren mislukt (netwerk)".
- Activity log (`.open-wpPunchAudit`): reads punch id from row data index 10, shows "Loading...", opens `#wpPunchAuditModal`, GETs `get-weldpilot-punch-audit.php` (see Dialogs).
- Table request: `get-weldpilot-punchlist-datatable.php` (see List).
- AI panel (this capture): "Categorize uncategorized items" collects rows (id and description) and POSTs JSON `items` to `ai-punch-categorize.php` (path built by `aiUrl`); with no items shows the "No uncategorized punch items found." alert; a result list shows columns #, Description (cut at 80 characters), Category, Priority (Urgent / Normal / Low badges), Discipline, Confidence (rounded percent, "-" if none), and per row buttons Apply and Dismiss; Apply marks the row done ("Applied!") and sends feedback type `punch_categorize_accept` with id, category, priority, discipline; Dismiss removes the row and sends `punch_categorize_dismiss` with id; "Apply all suggestions" applies every row. Feedback goes through `sendFeedback` (endpoint not visible in this capture). If the server answers without `categorizations` an alert shows the server error or (Dutch) "Categorisatie niet beschikbaar.". Note: the row collector reads `#datatable4`, `#punchDataTable` or `.ws-punch-table`; the list on this page is `#datatablePunchList`, so no matching table is visible in the capture.
- Messages defined for the add / passed forms: "Please enter a description.", "Please select a project.", "Please select an isometric (Passed requires an isometric).", "Choose Pre-punch or Punch.", "Saving…", "Saved.", "Save failed. Check your permissions or try again.", "Network error. Check your connection and try again.", "No confirmation from the server. Check the punch list overview.", "HEIC format is not supported. Use "Choose file" or save as JPEG.", "Server returned no valid response (often upload too large). Try again — photos are now auto-resized.", "Could not read the photo. Use "Choose file" and pick JPEG or PNG.", "Scan a weld label or ISO book QR first, or choose project and isometric manually."; scan messages: "Processing QR code…", "Weld recognized.", "Isometric recognized.", "Could not process scan.", "No camera available. Use manual lookup.", "Scanner active — point at the QR code.", "Scanner active (compatibility mode)."; description prefixes "Punch weld" / "Punch". The scripts that apply these messages are not in these captures (only the message constants).
- Sign-off messages: "Client name is required.", "Signature is required.", "Select an inspector.", "Select one or more items first.".

From the dashboard capture (shared scripts):
- `.open-punchlist` click: GET `punchlist.php?id=<data-id>&type=<data-wp-type>` with `action=showroom` and fills `#contentPunchlist`.
- `.open-punchlistEdit` click: GET `punchlistEdit.php?id=<data-id>&action=showroom` into `#contentPunchlistEdit`, removes any old audit block, then GETs `get-weldpilot-punch-audit.php?punch_id=<id>` and appends it.
- `.open-markPunchAsFinished`: takes the number before the dot of the row id; fills `punch_ids`; `.wp-open-finish-signoff-bulk`: uses `#sidsMass` or `#sids`; with no ids shows a warning toast with "Select one or more items first." and stops. Both fill `iso_id` from `#wp-filter-iso`.
- Sign-off form (`__wsappsInitPunchSignoffTab`, `__wsappsSubmitSignoffForm`): radio "Signed by" shows Client / User / Inspection fields; "Signature method" toggles canvas vs upload; User loads the saved signature of the logged-in user; checks before sending: Client needs a client name, Inspection needs a chosen inspector, a drawn signature must not be empty unless a saved signature is used (draw method). Then it POSTs `FormData` (all fields plus `saveSignoff=1`, `punch_ids` joined by comma) to `save-weldpilot-punch-signoff.php`; on success a toast (default "Sign-off opgeslagen."), the dialog closes, `#sids` / `#sidsMass` are cleared, row checkboxes unticked, the table reloaded; on a failure response the toast shows the message or "Opslaan mislukt."; on a network error "Netwerkfout.". The submit button shows "Opslaan…" while busy.
- "Mark as Client approved" (`.wp-punch-accept-btn`): browser confirm with the text "Mark as Client approved"; then POST `accept-weldpilot-punch.php` with `punch_id`; on success a toast (default "Klant akkoord gemarkeerd."), the button is replaced by a green badge, the table reloads; on failure an error toast or "Fout bij markeren." / "Netwerkfout.".
- `.open-markPunchAsRemoved`: copies the row `data-id` into `#markPunchAsRemovedID`.

## Sample data

Key figures: tiles Open 1, Pre-punch (open) 1, Punch (open) 0, Te laat 1, Deadline 7 dgn 0, Finished 0, Passed 0, Removed 0. Info line "Showing 1 to 1 of 1 entries"; `total` 1, `shown` 1. Project filter holds one project "20240101 — Template project". Contractors: MONTAVAR METALNA LOLA (7), Websonik Applicaties BV (8). 30 users selectable under Reported by (31 options with the empty one).

| # | Project | Isometric | Type | Description | Due date | Contractor | Punch | Document | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 20240101 | 0001 (link to isometric id 1, project 1) | A | Schoen zweeft | 21.03.2024 | VSH WP01 | Pre-punch | - | Open |

(The row is the only row. Its Contractor cell reads "VSH WP01" in the list, while the Contractor selects hold the two companies above.)

## Not in the capture

- Rows beyond the single sample row; other views (Finished, Passed, Removed, Te laat, Deadline 7 dgn) — the tiles reload the table, content not captured; the table header may differ per view (script `wsappsReinitPunchTable` is called but its body is not in the capture).
- Result of Print (PDF), Export (`/mtopilot/export-punchs.php`), promote, Mark as finished save, Remove, Edit save, Add, Register passed, Mark as Client approved: not clicked (browser-pass notes: "None of my clicks saved anything").
- Scanner (Start scanner needs the camera), Take photo / Choose file, the datepickers' popups.
- The AI Punch Categorization results and the `aiUrl` base path / feedback endpoint (button not clicked).
- Scripts that apply the add/passed form validation and save (only message constants are in the capture).
- The sign-off dialog showing a "Saved signature will be used" state and the real inspector list use data for the logged-in user (not copied).
- The pre-punch row's edit dialog showing no radio checked (see Edit dialog) — cause not visible.
