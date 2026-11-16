# Weld Pilot → Handheld → Scan weld / Scan flange QR label / Add punch

Source: `weld__start__dashboard.txt` (scripts also from `ext__weld-dashboard.txt`; punch dialog body from the browser-pass notes `_interactive/I2c-releases-punch-flanges.md`) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/` (the Handheld group is part of the side menu on every Weld Pilot page).
State of the page for the observing account: normal. This is a deferred feature: it needs a camera, which the capture did not use.

## Page
The side menu has an accordion group **Handheld** (icon `glyphicon glyphicon-phone`, class `wsapps-handheld-menu-group`), placed after "Daily reporting" and before "Welder data". It has three entries, in this order:

| # | Label | Control | Opens |
|---|---|---|---|
| 1 | Scan weld | link, class `wp-handheld-open-weld-scan`, `href="javascript:void(0)"`, `role="button"`, title "Weld card, weld label or ISO book cover", icon `fa fa-qrcode` | dialog `#wpWeldScanModal` |
| 2 | Scan flange QR label | link, class `wp-handheld-open-flange-scan`, `href="javascript:void(0)"`, `role="button"`, icon `fa fa-qrcode` | dialog `#wpFlangeScanModal` |
| 3 | Add punch | link, class `open-punchlist`, `href="#punchlist"`, `data-toggle="modal"`, `data-id="0"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"`, icon `fa fa-plus-circle` | dialog `#punchlist` (title "Punch lists"), content loaded by request |

The same three entries exist as a floating button (class `wsapps-handheld-fab-btn`, title and aria-label "Handheld", icon `fa fa-qrcode`) with a pop-up list of three buttons (`role="menuitem"`, class `wsapps-handheld-fab-menu-item`, same labels and icons):
- "Scan weld", `data-action="weld-scan"`
- "Scan flange QR label", `data-action="flange-scan"`
- "Add punch", `data-action="punchlist"`, `data-wp-type="punchlists"`, `data-wp-scan-first="1"`

Whether the floating button is visible is decided by the class `wsapps-handheld-client` on the root element (set by a script depending on the device); the capture does not show the rule in detail. Clicking the floating button toggles the class `wsapps-handheld-fab-open` (the list opens or closes); a click anywhere outside the button removes that class. If the floating button is in mode `punchlist` (attribute `data-wsapps-fab-mode`), clicking it opens the punch dialog directly with scan-first, with type `punchlists`.

When any of the three entries is used, the mobile drawer (`__wsappsCloseHandheldDrawer`: removes class `wsapps-m-drawer-open` from the body) and the floating list are closed first.

## List
None. The three entries are plain menu items; no table.

## Dialogs

### Scan weld (`#wpWeldScanModal`) — opened by menu entry "Scan weld" or floating-list button "Scan weld"
Bootstrap modal with class `fade`, `role="dialog"`. No form, no `<input>`, `<select>` or `<textarea>` in the captured markup (the scripts fill more parts when scanning, see below).

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | – | – | – | – | – | The dialog has no form fields in the capture. |

Content in document order:
- Header: close button (icon `fa fa-times`, `data-dismiss="modal"`), title "Scan weld".
- Body `#wpWeldScanBody`: help text "Scan a weld card, weld label QR or the QR on the ISO book front sheet. For ISO book, pick the weld next." (class `help-block text-muted`).
- Button "Start scanner" (class `btn btn-primary btn-sm wp-weld-scan-start`, icon `fa fa-camera`).
- Button "Stop" (class `btn btn-default btn-sm wp-weld-scan-stop`, icon `fa fa-stop`), hidden at load.
- Block `data-wp-weld-scan-step="pick"` (hidden at load) containing the button "Scan again" (class `btn btn-link btn-sm wp-weld-scan-back`). The weld-scan script also expects, inside the "pick" step, elements `.wp-weld-scan-pick-title`, `.wp-weld-scan-meta` and `.wp-weld-scan-pick-list`, and a step `data-wp-weld-scan-step="scan"` with `.wp-weld-scan-video`, `.wp-weld-scan-status` (with a `data-empty` text) and `.wp-weld-scan-result`; these are not in the captured markup of the dialog (the capture shows only the elements listed above).
- Footer: button "Cancel" (class `btn btn-default`, `data-dismiss="modal"`).

### Scan flange QR label (`#wpFlangeScanModal`) — opened by menu entry "Scan flange QR label" or floating-list button "Scan flange QR label"
Bootstrap modal with class `fade`, `role="dialog"`. No form fields.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | – | – | – | – | – | The dialog has no form fields in the capture. |

Content in document order:
- Header: close button (`fa fa-times`, `data-dismiss="modal"`), title "Scan flange QR label".
- Body `#wpFlangeScanBody`: help text "Scan the QR code on the flange label."
- Button "Start scanner" (class `btn btn-primary btn-sm wp-flange-scan-start`, icon `fa fa-camera`).
- Button "Stop" (class `btn btn-default btn-sm wp-flange-scan-stop`, icon `fa fa-stop`), hidden at load.
- Footer: button "Cancel" (`btn btn-default`, `data-dismiss="modal"`).

### Punch lists (`#punchlist`) — opened by menu entry "Add punch" (`href="#punchlist"`, `data-toggle="modal"`) or floating-list button "Add punch"
The shell captured in the page is: a modal with classes `modal wp-punch-enterprise-modal`, `role="dialog"`; header with close button and title `#wpPunchModalTitle` "Punch lists"; footer button "Close" (class `btn default`, `data-dismiss="modal"`). The body (`#contentPunchlist`) is empty in the page and is filled by a request when the entry is used (see rules). The dialog body was not captured in this file. From the browser-pass notes (the same dialog opened with "+ Add item" on the Punch lists page, request `GET /core/ajax/punchlist.php?id=0&type=punchlists&action=showroom`; "from the browser-pass notes"):
- A blue hint: manage items and view lists on the punch list page; the dialog is only for quick add and passed reporting. Links "Open punch list" and "Passed overview" (`page=punchlists&viewT=passed`).
- Two pill tabs: **Add item** (active) and **Report passed**.
- Add item tab: section title "NEW ITEM"; source toggle **Scan** (active) / **Manual**; Scan panel with help text "Scan a weld label QR or the QR on the ISO book front sheet. Project and isometric are filled in automatically.", a video viewport, a "Start scanner" button and the status "Scan a weld label QR code."; the manual fields Project and ISO are hidden in scan mode.
- Fields always visible, as the notes list them (the `name` attributes are not given in this capture, except those the page script reads, shown in the "name" column):

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Project | `project` | select | yes (script: must be > 0 when visible) | – | visible only in Manual mode; in the notes: default 20240101, one option |
| 2 | ISO | `iso` | select | only for "Report passed" (script) | "- Project related, not iso" | visible only in Manual mode; further options are isometric numbers |
| 3 | Type | not named in the capture | select | – | "A — Immediate fix (blocking)" | A Immediate fix (blocking), B ASAP fix (blocking), C Fix (non-blocking), D Fix in operation (non-blocking) |
| 4 | File | not named | file (Take photo / Choose file, text "Nothing selected") | no | – | camera capture helper `__wsappsInitPunchlistPhotoCapture`; images are compressed in the browser before upload |
| 5 | Description | `description` | textarea | yes (script) | – | – |
| 6 | Due date | not named | read-only date picker | – | today | – |
| 7 | Contractor | not named | select | – | first company | – |
| 8 | Reported date | not named | date | – | today | – |
| 9 | Reported by | not named | select | – | "—" | all users listed |
| 10 | Pre-Punch / Punch | `punch` | toggle (radio-type; script checks `[name=punch]:checked`) | yes | Pre-Punch preselected | – |
| 11 | scanned weld id | class `wp-punch-scanned-weld-id` | hidden | – | 0 | filled by a scan |
| 12 | scanned iso id | class `wp-punch-scanned-iso-id` | hidden | – | 0 | filled by a scan |

- Buttons: blue full-width "Add" (submit name `addPunchlist`; on the Report passed tab the button is named `addPunchlistPassed`), source buttons `.wp-punch-source-btn` with `data-wp-source="scan"` and `"manual"`, "Start scanner".
- Report passed tab (from the notes): text about registering that pre-punch or punch is complete for an isometric; fields Project, ISO, File and others not detailed here (see the Punch lists page note).
- The form carries `data-wp-punch-source="1"` and `data-wp-needs-manual` (`1` means a scan or a manual choice is needed), and the form class `wp-punch-add-form`.
The full field list of this dialog (all names) is not in this capture; it belongs to the Punch lists page.

## Rules found in the page's JavaScript

Opening
- Scripts `jsqr.min.js` (library jsQR) and `weldpilot-weld-scan.js?v=1792651897` are loaded from `/core/assets/js/`: in the Weld Pilot app at page load (function `__wsappsEnsureWeldScanScripts`), and again when the menu entry is used (`wpEnsureWeldScan`). Flange scan loads `jsqr.min.js` and `weldpilot-flange-scan.js?v=1792651897` the first time the entry is used (`wpEnsureFlangeScan`). The flange-scan script itself is not in the capture; only its loader and four messages are.
- Weld scan entries (`.wp-handheld-open-weld-scan`, floating `data-action="weld-scan"`): close the drawer and floating list, load the scripts, then call `__wsappsOpenWeldScanModal`, which binds the dialog once, resets it to the "scan" step and shows it. If that function is missing, the dialog is shown with `modal('show')`.
- Flange scan entries (`.wp-handheld-open-flange-scan`, floating `data-action="flange-scan"`): same, with `__wsappsOpenFlangeScanModal`; if the modal bootstrap is missing, the floating-list handler navigates to `index.php?page=flanges`.
- Showing `#wpWeldScanModal` (event `show.bs.modal`) resets it again; closing it (`hidden.bs.modal`) stops the camera and resets it.
- "Add punch": `__wsappsOpenHandheldPunchlist` creates a hidden link to `#punchlist` with `data-id` 0 (or the given id), `data-wp-type` = `punchlists`, and `data-wp-scan-first="1"`, clicks it and removes it. The `.open-punchlist` handler reads `data-id`, `data-wp-type`, `data-wp-scan-first`, then requests the dialog body: GET `punchlist.php?id=<id>&type=<type>`, data `action=showroom`, and puts the answer into `#contentPunchlist` (`__wsappsLoadPunchlistContent`). On a Punch lists page the entry has the same effect; `window.__wsappsPunchlistLoadState` keeps the id and type for later reloads (GET `punchlist.php?id=…&type=…`).
- After the body is loaded: device layout is applied (`__wsappsApplyPunchlistDeviceLayout`, detects desktop or not), photo capture, kind toggle (Pre-punch / Punch), scan init (`__wsappsInitPunchlistScan`) and a warnings request (`__wsappsPunchlistLoadWarnings`; the notes name `get-punch-warnings.php?iso_id=…` for the isometric context). If the body has a scan panel (`[data-wp-punch-scan-panel="1"]`), `jsqr.min.js` and `weldpilot-punchlist-scan.js` are loaded first (not captured). When `scanFirst` is set (Add punch from Handheld), 80 ms after loading the script clicks the source button `data-wp-source="scan"` of the first `form.wp-punch-add-form`, so the dialog starts in Scan mode.

Scan weld (`weldpilot-weld-scan.js`, "Handheld: Las scannen")
- Detector choice: if the browser has `BarcodeDetector`, mode `native` (formats `qr_code`); else if `jsQR` exists, mode `jsqr`; else mode `none`.
- "Start scanner": in mode `none` it asks for the scripts again and retries every 120 ms, at most 50 times, showing a diagnostic line (`laden t<n> mode=… native=… jsQR=… ready=… gUM=…`); after 50 tries it shows "GEEN SCANNER" plus the diagnostic. Without `navigator.mediaDevices.getUserMedia` it shows `__wsappsWeldScanMsgNoCamera` or "Geen camera.". Otherwise it stops any running scan, shows `__wsappsWeldScanMsgResolving` or "Camera starten…", and requests the camera with `facingMode` ideal `environment`, width ideal 1280, height ideal 720, no audio. On success the video plays, the status becomes `__wsappsWeldScanMsgNative` or `__wsappsWeldScanMsgFallback` (default "Scanner actief."), "Start scanner" hides and "Stop" shows, and a frame loop (`requestAnimationFrame`) starts. On camera failure the status is "CAM-FOUT: " + the error name (or "onbekend").
- Frame loop: skips frames while a request is running or the video is not ready. Native: `detector.detect(video)`, first code's `rawValue`, trimmed. jsQR: draws the frame on a canvas (video width and height, at least 32 each), `jsQR(imageData, w, h, {inversionAttempts: 'dontInvert'})`. A code is processed only if it differs from the last processed one.
- "Stop": stops tracks and the loop, shows "Start scanner", hides "Stop", status back to its `data-empty` text.
- Request after a detected code: GET `resolve-weldpilot-punch-scan.php`, parameter `scan` = the raw QR text, dataType JSON, header `X-Requested-With: XMLHttpRequest`. Expected answer fields: `success`, `message`, `weld_id`, `iso_id`, `project_id`, `weld_no`, `iso_no`, `project_no`, `scan_type`.
  - `success` false or missing: status = `message` or `__wsappsWeldScanMsgFailed` or "Mislukt."; result cleared; scanning continues (last code forgotten).
  - A weld is meant (`scan_type` not `iso` and `weld_id` > 0): status `__wsappsWeldScanMsgOk` or "Las herkend."; result shows a primary block button with pencil icon, text `__wsappsWeldScanEditBtn` or "Bewerk las", followed by "(" weld number (`weld_no`, else the id) ")"; its link is `<base>/<app folder>/index.php?page=isometrics&id=<iso id>&openWeld=<weld id>` plus `&project=<project id>` when known (needs weld id and iso id, else `#`); the scanner stops.
  - An ISO is meant (`scan_type` = `iso`, or no weld id and `iso_id` > 0): status `__wsappsWeldScanMsgIsoOk` or "Isometrie herkend."; scanner stops; the "pick" step is shown: title `__wsappsWeldScanMsgPickTitle` or "Kies een las"; meta line "ISO " + iso number (or id) and, if known, "Project: " + project number; a spinner while loading.
  - Neither: status failed message; scanning continues.
  - HTTP error: status = `message` of the JSON error body or the failed message.
- Weld picker request: GET `get-welds-for-iso-scan.php?iso_id=<id>`, JSON with `success`, `message`, `welds` (each with `weld_id`, `weld_no`, `diameter`), `iso_id`, `project_id`. Failure shows the message (or "Fout.") in red; no welds shows `__wsappsWeldScanMsgPickEmpty` or "Geen lassen."; otherwise a list of block buttons, label = weld number (or id) plus the diameter in grey brackets, each a link to the same isometric-weld URL as above.
- "Scan again" (text `__wsappsWeldScanMsgBack` or "Opnieuw scannen"): back to the "scan" step, list, result and status cleared.
- Default texts in the script are Dutch; the English labels the dialog shows ("Start scanner", "Stop", "Scan again") come from the markup.

Scan flange QR label
- Messages set in the page: processing "Processing QR code…", success "Flange recognized.", failure "Scan could not be processed.", button "Open flange" (`__wsappsFlangeScanMsgResolving`, `…Ok`, `…Failed`, `…OpenBtn`). The request, field names and result handling of the flange scan are in `weldpilot-flange-scan.js`, which is not in the capture: none found in the capture. The only fallback the capture shows is the redirect to `index.php?page=flanges` described above.

Add punch validation (`__wsappsValidatePunchlistForm`, on submit of `.wp-punch-add-form` via `__wsappsSubmitPunchlistForm`; messages in the capture are Dutch defaults, the notes saw the English ones)
- `description` empty → "Please enter a description." (default "Vul een beschrijving in.").
- A visible `project` select with value ≤ 0 → "Please select a project." ("Selecteer een project.").
- No visible project select, form has `data-wp-punch-source="1"`, is not the Report passed form, `data-wp-needs-manual="1"`, manual fields hidden, and both scanned weld id and scanned iso id ≤ 0 → "Scan a weld label or ISO book QR first, or choose project and isometric manually."
- Report passed form (has button `addPunchlistPassed`) with a visible `iso` select value ≤ 0 → "Please select an isometric (Passed requires an isometric)."
- Neither `punch` option checked (when `punch` inputs exist) → "Choose Pre-punch or Punch."
- Submit: the photo, when present, is compressed (max 1280 px, quality 0.72); status texts "Saving…", "Saved.", "Save failed…" (notes); the form posts into a hidden frame `punchlistActionFrame` with the button name (default `addPunchlist`) and the page type; afterwards the dialog is reloaded with the same id and type, the punch table (`#datatablePunchList`) is redrawn if present, and the active tab is remembered in `sessionStorage` key `punchlistActiveTab`.

## Sample data
The sandbox shows no data for this item: three menu entries and two empty scan dialogs. Nothing was scanned.

## Not in the capture
- Body of `#punchlist` after "Add punch" (loaded by `punchlist.php?id=0&type=punchlists&action=showroom`): only seen in the browser-pass notes, field `name` attributes mostly unknown (see above).
- Scripts `weldpilot-flange-scan.js` and `weldpilot-punchlist-scan.js`, and the library `jsqr.min.js` (skipped); the flange-scan request and result.
- The "scan" step markup of `#wpWeldScanModal` (video element, status line and result area) and the title, meta and list of the "pick" step, which the script uses but the captured markup does not show.
- What the camera, a real scan and the replies of `resolve-weldpilot-punch-scan.php` and `get-welds-for-iso-scan.php` look like: needs a camera and real QR codes; not tried (Start scanner was not clicked).
- Device rule for showing the floating button (`applyHandheldFabVisibility` sets class `wsapps-handheld-client`).

Also present in the page, opened from elsewhere: `#fillIRN`, `#markPunchAsRemoved` (Remove punchlist), `#punchlistEdit` (Edit punchlist item), `#createTransferOrder` and other dialogs of the page chrome.
