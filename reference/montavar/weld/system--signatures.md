# Weld Pilot → System → Signatures

Source: `weld__system__signatures.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=signatures`. Window title: "WeldPilot®". The Handheld floating button and its three dialogs are also on this page; their markup is in `weld__start__dashboard.txt` (`MODAL DIV#wpWeldScanModal`, `MODAL DIV#wpFlangeScanModal`) and in the existing note `weld/handheld.md`. No `weld__system__signatures__*` dialog captures exist.
State of the page for the observing account: normal.

## Page
- Title: the breadcrumb is the only page title element: "Signatures" (`LI .crumb-active`, link `/weldpilot/index.php?page=profiles`). No H1 is captured.
- Tabs: none. The page is three stacked sections, each with an anchor id: "Show my signatures" (`#tab18_6xx`), "Sign with pen" (`#tab18_4xx`), "Upload signature" (`#tab18_5xx`). The page scrolls to a section when the URL hash is `#tab18_4xx`, `#tab18_5xx` or `#tab18_6xx`, or when the query has `sigview=1` (then `#tab18_6xx`). No links to these sections are captured.
- Buttons above the list: none. The page has no list or table.
- Top bar, app switcher (`#topbar-dropmenu`), tiles in this order: "MTOPilot®" (`/mtopilot/`), "ESTPilot®" (`/estpilot/`), "WeldPilot®" (`/weldpilot/`), "TeamPilot®" (`/teampilot/`), "ToolPilot®" (`/toolpilot/`).
- Language links in the header: "Nederlands", "English", "Deutsch", "Français" (`index.php?lang=nl|en|de|fr&page=signatures`).
- Handheld floating button (`BTN "" .wsapps-handheld-fab-btn`, title and aria-label "Handheld", icon `fa fa-qrcode`), with a list of three buttons (`role="menuitem"`): "Scan weld" (`data-action="weld-scan"`), "Scan flange QR label" (`data-action="flange-scan"`), "Add punch" (`data-action="punchlist"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"`). See Dialogs.

### Section "Show my signatures" (`#tab18_6xx`, class `wsapps-sig-card`)
Text only in the capture, no controls: "Show my signatures"; "Full signature (800x200px)"; "No full signature uploaded yet"; "Short signature (300x200px)"; "No short signature uploaded yet". Signature previews are not in the capture. The browser-pass notes say nothing opens from this section.

### Section "Sign with pen" (`#tab18_4xx`, class `wsapps-sig-draw`)
Heading (H2, `wsapps-sig-card-title`): "Sign with pen".

Inputs and controls in document order:

| # | Label | id | Type | Default in capture | Notes |
|---|---|---|---|---|---|
| 1 | "Add name under the signature: [logged-in user's name]" | `enable-name-overlay` | checkbox | `cur="on"`, no CHECKED flag shown | Label text contains the logged-in user's name (not copied). |
| 2 | "Add a background image" | `enable-background-image` | checkbox | `cur="on"`, no CHECKED flag shown | Shows `#background-options` when checked. |
| 3 | (file) | `background-image-upload` | file, `accept="image/*"` | empty | Inside `#background-options` (hidden at load). |
| 4 | "Size:" | `background-size` | select | "Medium (50%)" | Options: 25 → "Small (25%)"; 50 → "Medium (50%)" (selected by default); 75 → "Large (75%)"; 100 → "Full (100%)". Inside `#background-settings` (hidden at load). |
| 5 | "Horizontal position:" | `background-position-x` | select | "Center" | Options: left → "Left"; center → "Center" (selected by default); right → "Right". |
| 6 | "Vertical position:" | `background-position-y` | select | "Center" | Options: top → "Top"; center → "Center" (selected by default); bottom → "Bottom". |
| 7 | (trash icon button, no text) | `remove-background` | button `btn-xs btn-danger` | — | Inside `#background-preview`. Clears the file input, the stored image and hides the settings. |
| 8 | canvas | `signature-pad` | canvas `wsapps-sig-canvas` | — | Full signature, label "Full signature (800x200px)". |
| 9 | "Clear" | `clear-button` | button `btn-dark btn-sm` | — | Clears the full pad. |
| 10 | "Undo" | `undo-button` | button `btn-default btn-sm` | DISABLED | Undo of the full pad. |
| 11 | "Save" | `save-button` | button `btn-primary btn-sm` | — | Saves the full signature with composite options (below). |
| 12 | canvas | `signature-padNN` | canvas `wsapps-sig-canvas--short` | — | Short signature (paraaf), label "Short signature (300x200px)". |
| 13 | "Clear" | `clear-buttonNN` | button `btn-dark btn-sm` | — | |
| 14 | (no text, title "Undo") | `undo-buttonNN` | button `btn-default btn-sm` | DISABLED | |
| 15 | "Save" | `save-buttonNN` | button `btn-primary btn-sm` | — | |
| 16 | (alert, empty) | `signature-full-info` | div `.alert` | hidden | Empty in the capture. |

Background image settings (`#background-settings`) also contain a label "Size:", "Horizontal position:" and "Vertical position:" (as in rows 4–6). The script writes the chosen file name into `#background-filename`; that element is not in the captured markup.

Full pad save (the script): name overlay is sent only when checkbox 1 is checked and a user name exists — text = the logged-in user's name, font size 40, font "Verdana, Arial, sans-serif", color `rgb(0, 71, 171)`, position "bottom" (bottom centre). Background image is sent only when an image was chosen: image data, size (percent from row 4), positionX (row 5), positionY (row 6). Pen colour of both pads: `rgb(0, 71, 171)` ("Pen blauw"). The full pad has undo, preview and auto-save every 5000 ms enabled; the short pad has undo, preview and auto-save every 5000 ms and a minimum stroke length of 1 (only checks the pad is not empty). After a successful short-pad save the page reloads after 2000 ms (`location.reload()`). After a full-pad save the code waits 2000 ms, but the one line inside that timeout is not in this capture ("already captured on earlier pages"), so its action is not shown.

Undo enabling: a timer checks each pad's undo stack; Undo is enabled while the stack is not empty and disabled otherwise (the short pad's timer period is 500 ms; the full pad's period line is not in this capture).

Messages in the page's script (`window.__wsappsSignatureI18n`), copied exactly:
- "Signature is empty"
- "Invalid signature preview"
- "Preview: %s"
- "Full signature (800x200px)"
- "Short signature (300x200px)"
- "Validation passed"
- "Cancel"
- "Save"
- "Saved"
- "Dimensions: %s | Size: %s KB"
- "Save failed after %d attempts: %s"
- "Unexpected error: %s"
- "Saving..."
- "Loading..."
- "An unsaved signature was restored."

### Section "Upload signature" (`#tab18_5xx`, class `wsapps-sig-card`)
Heading (H2): "Upload signature". Form `method="post"`, `enctype="multipart/form-data"`, no `action` attribute in the capture.

| # | Label / text | name | Type | Default | Notes |
|---|---|---|---|---|---|
| 1 | "Upload full signature (800x200px PNG)" | `full` | file, `accept=".png,image/png"`, id `signature-upload-full` | none | Visible button "Choose file" (`span.button.btn-dark`) over the input. |
| 2 | (text field) | — id `signature-upload-full-name`, class `gui-input` | text | placeholder "Nothing selected" | Gets the chosen file name on change. Read-only is not stated in the capture. |
| 3 | "Upload short signature (300x200px PNG)" | `short` | file, `accept=".png,image/png"`, id `signature-upload-short` | none | Visible button "Choose file". |
| 4 | (text field) | — id `signature-upload-short-name`, class `gui-input` | text | placeholder "Nothing selected" | Gets the chosen file name on change. |
| 5 | "Upload" | `uploadSignature` | submit button `btn-primary btn-hideImport` | — | See rules: the shared script hides it by default; this page's script shows it. |

## List
None on this page.

## Dialogs
Controls on this page that open dialogs: the Handheld floating button (its list items use `data-action`, a handler in the page script, not `href`/`data-target`). Its three items open three dialogs. Full detail is in `weld/handheld.md`; the summary is below.

### Scan weld (`#wpWeldScanModal`) — opened by the Handheld item "Scan weld"
Title "Scan weld". Help text: "Scan a weld card, weld label QR or the QR on the ISO book front sheet. For ISO book, pick the weld next."
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | – | – | – | – | – | No form fields in the capture. |

Buttons: "Start scanner" (`btn-primary btn-sm`, icon `fa fa-camera`); "Stop" (`btn-default btn-sm`, hidden at load); "Scan again" (`btn-link btn-sm`, inside a step `data-wp-weld-scan-step="pick"`, hidden at load); "Cancel" (`btn-default`, closes). The scanner steps and result elements the script expects are not in the captured markup.

### Scan flange QR label (`#wpFlangeScanModal`) — opened by the Handheld item "Scan flange QR label"
Title "Scan flange QR label". Help text: "Scan the QR code on the flange label."
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | – | – | – | – | – | No form fields in the capture. |

Buttons: "Start scanner" (`btn-primary btn-sm`, icon `fa fa-camera`); "Stop" (`btn-default btn-sm`, hidden at load); "Cancel" (`btn-default`, closes).

### Punch lists (`#punchlist`) — opened by the Handheld item "Add punch"
Title "Punch lists". Body is loaded by request when opened (`GET /core/ajax/punchlist.php?id=0&type=punchlists&action=showroom`, from the browser-pass notes). Fields below are from the browser-pass notes as summarised in `weld/handheld.md`; `name` is given only where the notes list it.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | `project` | select | yes (script: must be > 0 when visible) | — | Visible only in Manual mode. One option (default 20240101) in the notes. |
| 2 | ISO | `iso` | select | only for "Report passed" (script) | "- Project related, not iso" | Visible only in Manual mode; further options are isometric numbers. |
| 3 | Type | not named | select | "A — Immediate fix (blocking)" | A Immediate fix (blocking); B ASAP fix (blocking); C Fix (non-blocking); D Fix in operation (non-blocking) |
| 4 | File | not named | file ("Take photo" / "Choose file", "Nothing selected") | no | — | Camera helper; images are compressed in the browser before upload. |
| 5 | Description | `description` | textarea | yes (script) | — | — |
| 6 | Due date | not named | read-only date picker | — | today | — |
| 7 | Contractor | not named | select | — | first company | — |
| 8 | Reported date | not named | date | — | today | — |
| 9 | Reported by | not named | select | — | "—" | All users listed. |
| 10 | Pre-Punch / Punch | `punch` | toggle (radio-type) | yes | Pre-Punch | — |
| 11 | (scanned weld id) | class `wp-punch-scanned-weld-id` | hidden | — | 0 | Filled by a scan. |
| 12 | (scanned iso id) | class `wp-punch-scanned-iso-id` | hidden | — | 0 | Filled by a scan. |

Tabs: "Add item" (active) and "Report passed". Source buttons: "Scan" (`data-wp-source="scan"`, active) and "Manual". Scan help text: "Scan a weld label QR or the QR on the ISO book front sheet. Project and isometric are filled in automatically." Scan status: "Scan a weld label QR code." Buttons: "Start scanner"; "Add" (submit `addPunchlist`; on "Report passed" the submit is `addPunchlistPassed`); "Close" (footer, `btn default`). Fields of "Report passed" are not described in the capture.

Also present in the page, opened from elsewhere (not opened by a control on this page): editCompanyData, passwordChange, themeChange, admin ("System settings", with "Update" `name="admin"` and "Cancel"), docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal and wpFlangeScanModal (described above), punchlist (described above).

## Rules found in the page's JavaScript
- Initial scroll: on ready, if the URL hash is `#tab18_4xx`, `#tab18_5xx` or `#tab18_6xx`, or the query has `sigview=1` (then `tab18_6xx`), the page scrolls that section to the top.
- Upload button visibility: the shared script hides `.btn-hideImport` by default; this page's script forces `.btn-hideImport` visible on ready and again after 1000 ms (CSS visibility and show).
- Background image: checking "Add a background image" shows `#background-options`; unchecking hides it, clears the file input, clears the stored image and hides `#background-settings`. Choosing a file reads it as a data URL, shows `#background-settings`. The trash button does the same as unchecking the file.
- Pads: Clear calls the pad's clear; Undo calls its undo; Save calls the pad's save with the options in "Sign with pen" above. Save errors are logged to the console ("Save error:").
- Requests: on load the page makes `GET /core/ajax/ajax-notifications.php?action=count_unread` (captured XHR). The page's script itself makes no request in the capture; the save and upload requests are performed by the pad library and the form (not shown; endpoints not in the capture).
- The shared script (LINEDIFF section) contains other requests (`/core/ajax/getListOfMaterials.php`, `searchProject.php`, `saveAddCalculationModalState.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`) that are not tied to any control on this page in the capture.

## Sample data
The sandbox shows no signatures: "No full signature uploaded yet" and "No short signature uploaded yet". No rows, figures or percentages. Both checkboxes show `cur="on"` in the capture.

## Not in the capture
- Signature previews (the uploaded or saved images) in "Show my signatures": the DOM shows the empty state text only.
- The `#background-filename` element written by the script, and the contents of `#signature-full-info` after a save or upload.
- Save and upload endpoints and their responses: nothing was clicked, so no request beyond the load request is captured.
- The handheld dialog bodies beyond the markup above (scanner steps, pick list), and the "Report passed" tab fields of the punch dialog (see the browser-pass notes and `weld/handheld.md`).
- The one line in the full-pad save timeout and the full-pad undo timer's period (both "already captured on earlier pages" in the capture).
