# WeldPilot → Welding data → Isometric page (one isometric: header cards, Welds panel, all dialogs)

Source: `weld__iso__0001.txt` plus its click captures `weld__iso__0001__*.txt` (30 files: add-weld-charge1, add-weld-length-ndt, add-weld-length, add-weld-open, add-weld-welder-wps, attachments, audit-trail, blockers, edit-isometric, edit-stamp-001, edit-weld-001, edit-weld-repair, link-itp, mass-edit-open, ndt-001, ndt-002, ndt-003, ndt-archive-001, ndt-pre-003, ndt-pre-archive-003, progress-card, punchlist, pwht-002, pwht-archive, show-deleted, tracer-detail-004, tracer-detail-010, vi-hub-archive, vi-hub) and `weld__iso__0003__{blockers,status-card,edit-weld}.txt`. The other isometrics (`weld__iso__0003`, `00022`, `00032`, `0005`, `0007`, `wf-73031`) are used only in "Sample data". Captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=isometrics&id=1&project=1` (isometric "0001", project 20240101 "Template project"). Other isometrics use the same page with another `id` (895, 6, 6191, 6598, 15767, 15424).
State of the page for the observing account: normal.

Statements marked "(browser-pass notes)" come from `raw/_interactive/I1-weld-isometric.md` (what was seen on screen, colours, behaviour after a click); everything else is read from the captures.

## Page
- Title: "Iso overview - WeldPilot®". Language links in the header: Nederlands, English, Deutsch, Français (`index.php?lang=xx&page=isometrics&id=1&project=1&projectSite=`).
- Breadcrumb (top bar): "20240101 Template project" → `index.php?page=isometrics&project=1`; "Iso" → same; "0001" → opens `#changeIsoInProject` (`data-id="1"`); "Welds" → `index.php?page=isometrics&project=1&id=1`. A "Zandbak" site link precedes them (browser-pass notes).
- No tabs. Top-bar buttons, right side:
  - **Options** (dropdown, `checkbox-persist`, right aligned): see "Options menu" below.
  - **Mass edit welds** (`#laydownTransportID`, `btn-dark`, class `disabled` until at least one weld checkbox is ticked) → `#massEditWeld`.
  - **Add weld** (`buttonInsert btn-primary`, glyphicon-plus) → `#addWeld`.
- Panel "Welds" (dark panel, list icon) with heading buttons: **WeldPilot®** (dropdown: MTOPilot® → `/mtopilot/index.php?page=isometrics&project=1&id=1`; ESTPilot® → `/estpilot/index.php?page=isometrics&project=1&id=1`), **Reports** (dropdown, below), and a pencil button `.open-editIsometric` → `#editIsometric` (`data-id="1"`).
- Reports menu, in order: "LISL Report" → `#pdfLISLFullLanguage`; "LISL Report (A3)" → `#pdfLISLFullLanguageA3`; "LISL Report [GU]" → `../core/pdf/lisldef.php?project=1&id=1` (new tab); "LISL Report [MV]" → `../core/pdf/lislmv.php?project=1&id=1`; "LISL Report [ISS]" → `../core/pdf/lisl-iss.php?project=1&id=1`; "LISL Report [WQ]" → `#pdfLISLFullLanguageWQ`; "LISL Report [WQ ver 2]" → `#pdfLISLFullLanguageWQNEW`; "LISL Report [GU Rev 2]" → `#pdfLISLFullLanguageGUrev2`; "LISL Report [GU Rev 3]" → `#pdfLISLFullLanguageGUrev3`; "Blank LISL template" → `#pdfLISLLanguage`; "Weld card" → `#generateLabelsOnMultipleWelds`; "Weld labels" → `#generateLabelsOnMultipleWelds2`; "Punch list - blank" → `../core/pdf/punchlist-new-blank.php?project=1&iso=1`; "ISO Book" (`#pdfIsoBook`, `data-id="1"`).
- Options menu, in order: "Attachments" → `#isoAttachmentsModal`; "Visual inspection" + count badge (1) → `#viHubModal` (`data-vi-tab="new"`); "Generate Mass NDT-Pre request" → `#pdfNdtPreRequestLanguageISO`; "Generate Mass NDT request" → `#pdfNdtRequestLanguageISO`; "Generate Mass Pre-HT/PWHT request" → `#pdfPwhtRequestLanguageISO`; "Upload Pre-HT/PWHT on multiple welds" → `#uploadPWHTonMultipleWelds`; "Punch list" → `#punchlist` (`.open-punchlist`); "Audit trail" (`.open-isometricAuditTrail`, `href="#"`, `data-iso-id="1"`) → `#showIsometricAuditTrail` after a request; "Set phase" → `#editIsometricPhase`; "Show deleted welds" → `index.php?page=isometrics&id=1&project=1&showdeleted=ok`; "Delete selected" (`.open-deleteSelectedWelds`) → `#deleteSelectedWelds`; then a checkbox row "Disable welds sorting" (`#toggleSortingEnabled`, `data-current-state="1"`, checkbox checked; the label switches to "Enable welds sorting"; toasts "Welds sorting enabled" / "Welds sorting disabled" / "Error updating sorting"). The menu stays open after "Audit trail" (browser-pass notes).

### Header cards (one row under the "Welds" heading; card titles from browser-pass notes)
1. **IDENTIFICATION** (key/value table `wsapps-iso-kv-table`): "ISO No" = link "0001 (IRN 1000)" → `../core/export/down.php?file=isometrics/20240101.0001.2.pdf` (new tab), link "Rev 2.00" → `#showRev`, a "+" button → `#addRev`; "Asset tag" = N011-HV10001-0001; hidden row "Drawing no. 1" = N011-HV10001.
2. **ITPS**: count badge "0/2"; icon button (title "Link ITP") `.wsapps-wp-itp-col-link` → `#weldpilotItpPickerModal`; body row "— | No ITP linked" with button "Link ITP" (same dialog). A hidden form `#wsappsIsoItpHeaderForm` holds `iso_id`=1, `weldpilot_itp_id`=0, `itpNo`=111111, `weldpilot_itp_id2`=0, `itpNo2` (empty), display texts "111111" and "— no ITP selected —", edit pencil (title "Edit") and add button (title "Add ITP"). In the Edit isometric dialog the two ITP values read "111111" (ITP No) and "222222" (ITP Field).
3. **COMPLIANCE**: "NoBo" = No; "NoBo Reg. no. / NoBo serial" = N/A / N/A; "PED Cat.-Mod" = -; "X Ray %" = 14.
4. **TECHNICAL**: "Piping class" = A11011; "PWHT" = Yes; "Test pressure" = 29; "Test system" = -.
5. **PROGRESS** (`#isoFieldProgressPanel`, `data-iso="1"`): three accordion buttons "Shop prefab 0%", "Field 0%", "Site 0%" (one open at a time; browser-pass notes: the chevron turns up and the title bold). Tooltips on the buttons (browser-pass notes): Shop prefab "Shop prefab phase (welds, NDT, shop-typed material).", Field "Field erection phase (pipe, welds, NDT, supports, appendages, punch).", Site explains that Shop + Field + Site make 100 % of the total, and that Hydrotest and Paint/Tracing only split the Site phase. Tables:

| Phase | Row (`data-field`) | Budget cell | Control | Bar / state |
|---|---|---|---|---|
| Shop prefab | Pipe (m) (`mtr_pipe_shop`), Supports (pcs) (`supports_shop`), Appendages (pcs) (`appendages_shop`) | "—" (tooltip "Ceiling: Shop issued / Shop MTO") | number input, DISABLED (tooltip "No Shop-typed material on this ISO.") | "N/A" |
| Field | Pipe (m) (`mtr_pipe2`), Supports (pcs) (`supports2`), Appendages (pcs) (`appendages2`) | "—" (tooltip "Budget (MTO)") | number input, DISABLED (tooltip "No MTO budget — add materials with this component code in MTOPilot. (CC 1 / CC 2 / CC 3)") | "0%" |
| Site | Paint (`paint_status`, specification A10), Tracing (`tracing_status`, specification —), Insulation (`insulation_status`, specification A15) | "Specification" + value | select `.wsapps-ifp-finish-select` with options 0 Open, 1 Done, 2 N/A (N/A selected on all three; tooltip "Mark as done, or N/A when paint, tracing or insulation is not required on this ISO.") | "N/A" |

   Buttons under the tables: **Save** (`#isoFieldProgressSave`, tooltip "Save shop, field and site values.") and **Set all to 100%** (`#isoFieldProgressAllDone`).
6. **STATUS** (`#datatableWarehouse1 .wsapps-iso-status-panel`, full width):
   - Link with big percentage and quality: text "0%Quality 72.7%" (`.wsapps-iso-status-tooltip`, tooltip "FW 100%").
   - Blockers button "20 open" (title "What blocks this isometric", `#wsappsIsoBlockers`) → dropdown `#wsappsIsoBlockersMenu` with section headers and entries: **Release**: "Prefab is not released yet" (`#wsappsIsoRelease`); **Welds**: "Weld 003 is missing required fields", 005, 008, 009, 011, 012, "Weld 010R1 …", "Weld 010R2 …" (each `.open-editWeld` → `#editWeld` with the weld id); **NDT**: "NDT on weld 001 has no result", 006, 011, 012, 013, 014, "010R1" (each `.open-showNDO` → `#showNDO`); **Repair**: "Rejection on weld 002, repair 002R1 is still open" (→ `#showNDO`, id 2), "Rejection on weld 005, repair 005R1 is still open" (→ `#showNDO`, id 5), "Rejection on weld 010, repair 010R1 is still open" (→ `#editWeld`, id 16820); **Punch**: "1 open pre-punch" → `index.php?page=punchlists&iso_id=1&project_id=1&punch_type=prepunch` (new tab). 1 + 8 + 7 + 3 + 1 = 20. The capture shows no row "002R1" or "005R1" in the weld list.
   - Delivery line (`#wsappsIsoRelease`): grey "Prefab not ready" (tooltip: one sentence per weld "Weld 001 has no type — assign shop or field." for 001, 002, 003, 005, 005A, 009, 011 and more, cut at 449 characters in the capture); then "Field completed" with button "Reopen" (`btn-warning`, unlock icon → `#confirmReopenField`) and button "Create release doc" (`btn-dark`, play icon → `#confirmInlineReleaseField`). No "Prefab complete" / "Field complete" button is shown on this isometric; the dialogs `#confirmPrefabComplete` and `#confirmFieldComplete` exist in the page.
   - Flow line: "Pre-Punch" "Open" with links "1 open" (`…punch_type=prepunch`) and "0 finished" (`…&viewT=finished`); "Hydrotest" with "—" and link "--" → `index.php?testSystem=0&project=&page=hydrotest-request&filterSpools=`; "Punch" "Open" with "0 open" (`…punch_type=punch`), "0 finished", and "1 overdue" (`…&due_filter=overdue`); warning text "Pre-punch: 1 A/B still need Finished + Akkoord."; two small buttons: "Punch list" → `index.php?page=punchlists&iso_id=1&project_id=1` (new tab) and "Item" (`.open-punchlist`) → `#punchlist`.
- Under the cards: "Batch release:" with links "Prefab overview" → `index.php?page=isometrics-finished` and "Field overview" → `index.php?page=isometrics-finished-field`.
- Page-load requests listed in the capture: `showMaterialDetailsByChargeNumber.php?id=0`, `showMaterialDetailsByChargeNumberDiameter.php?id=0` (also `&field=sizeinch`, `&field=sizeinch2`), `ajax-notifications.php?action=count_unread`.

## List
Table `#datatable3` ("Welds"), plain server-rendered rows. The capture has no `DT` line (no DataTables configuration), so no page length, order or ajax URL is shown; a script comment says the page holds several tables with id `datatable3`. Above the table: a search box (placeholder "Search", clear button) that filters rows by their text (see rules).
- Columns in order (header text; tooltip in brackets): Sort (only when the sort column exists), WN [Weld no.], Type [Weld type], Wdr [Welder], VI [Visual inspection status], NDT (Pre) [NDT Req.], NDT [NDT Req.], Pre-HT/PWHT [PWHT Req.], Idx [Index number], Chg.No. [Charge number], Material 1 [Material], Idx [Index number], Chg.No. [Charge number], Material 2 [Material], Proces [Weld process] (hidden column, cells show "-"), WPS [WPS number], D [Spool], S [Spool], Options, and a header checkbox `#checkAll`. The Sort column is present on 0001 (and 0007) and absent on the other captured isometrics (0003, 00022, 00032, 0005, wf-73031).
- Row attributes: `class wsapps-weld-sort-row`, `data-weld-id`, `data-shop-locked`, `data-field-locked` (0/1).
- Cells: Sort = drag handle (arrows icon, tooltip "Drag to reorder"). WN = weld number. Type = "WS" (tooltip "Shop weld") or "FW" (tooltip is the weld type name, "Butt Weld - Field" on 0001) or "-" when no type. Wdr = welder codes, comma separated ("ML396" then ", ML670"); each code has a tooltip with the welder's photo and name; "------" when none. VI = "---" plus a file icon (tooltip "Open visual inspection request archived document" → `../core/pdf/visual-inspection-v2.php?report_id=20522&project=1&id=1`) when the weld is on a visual report, otherwise "-".
- NDT (Pre) / NDT / Pre-HT/PWHT cells: "No", or a link "Yes" followed by icons. NDT "Yes" link → `#showNDO` (tooltip "Enter NDT Request results" when a request exists, "Create/Update NDT Request" otherwise); NDT (Pre) "Yes" → `#showNDOPre`; Pre-HT/PWHT "Yes" → `#showPWHT` (no tooltip). Icons after "Yes": check (tooltip "Accepted"), ellipsis (tooltip "In progress"), cross (tooltip "ReWeld" or "NA"), file icon (tooltip "Show NDT archive" → `#showWeldNdtArchive`; "Show NDT PRE archive" → `#showWeldNdtPreArchive`; "Show PWHT archive" → `#showWeldPwhtArchive`), printer (tooltip "Generate & Print PWHT Request" → `#pdfPwhtRequestLanguage`; tooltip "Generate & Print NDT Request" → `#pdfNdtRequestLanguageAdditional`), and a boxed "T" button (`.wsapps-weld-tracer-mark.open-weldTracerDetail`, `data-tracer-weld-id`) → `#weldTracerDetailModal`. (Colours: browser-pass notes — "Yes" green = done/accepted, red = required and unfinished; red cross on 002, black on 005/010.)
- Material cells show "<index>" / "<charge number>" / "<size>/<schedule>/<thickness>/<material>/<description>" (for example `1/2"/40/7,2/A106 Gr B/Pipe`); the generic charge "EXISTING" shows in the Material cell with "-" in the others.
- Options cell, unlocked weld: three buttons — pencil (`.open-editWeld`, `btn-warning`) → `#editWeld`; trash (`.open-deleteWeld`, `btn-danger`) → `#deleteWeld`; check-in-box icon (`.open-editStamp`) → `#editStamp` — and the last cell holds a checkbox `name="ccid_<id>"` `value=<id>`. Locked weld: a lock icon (tooltip "Locked after Field complete") and a DISABLED, ticked checkbox with the same title. (Pencil colour red when NDT/PWHT is in progress, padlock red: browser-pass notes.)
- Lock rule seen in the data: on 0001 the ten field welds (`data-field-locked="1"`) are locked because the isometric is Field completed; on 0003 the five shop welds (`data-shop-locked="1"`) after Prefab completed, and the field weld 004.
- Bulk: ticking row checkboxes enables "Mass edit welds"; "Options → Delete selected" acts on the ticked rows. The header checkbox ticks every visible row.
- Export / print buttons: none on the table (print comes from the Reports and Options menus).
- Empty text (also shown on the `showdeleted=ok` view of 0001): "No welds added yet for this isometric. Use Add weld or Add welds to create the first weld." (one cell, colspan 99). The "Showing … entries" info text is not present.
- Row options of a deleted weld (bring back) are not in the capture; `#backWeld` ("Bring weld back") exists.

## Dialogs
Shared option lists used below (copied from the captures):
- **L-weldtype** (18): 0 "----------" (shown "------" in Edit weld), 4 "Butt Weld - Field", 17 "Branch welds- Field", 18 "Socked welds -Shop", 19 "Butt Weld - Shop", 20 "Reinforcment Pad GW -Shop", 21 "Branch welds- Shop", 23 "Socked welds -Field", 24 "Reinforcment Pad GW -Field", 25 "Longitudinal Welds - Shop", 26 "Longitudinal Welds - Field", 27 "Reinforcment Pad FW - Shop", 28 "Fillet Weld - Shop", 29 "Fillet Weld - Field", 30 "HOOK-UP", 31 "Victaulic Joint-Shop", 32 "Victaulic Joint-Field", 33 "Reinforcment Pad FW - Field". (Mass-edit read for welds 001/002 returned `weldType` 3, which is not in this list.)
- **L-dia** (55 in Add/Edit/Mass edit, 54 in Add welds without "x"): first 10: 0 "----------", x "-- Length in mm --", 497 "-", 491 "--", 488 ".", 276 "0,38", 1 "0,5", 2 "0,75", 37 "0.75", 3 "1"; the rest are inch sizes from "1,25" to "84" (e.g. 15 "10", 16 "12", 519 "138", 12 "5", 405 "50", 14 "8", 518 "84").
- **L-spool** (18): 0 "----------", 34 "Spool J", 35 "Spool K", 36 "Spool L", 37 "Spool M", 38 "Spool N", 39 "Spool O", 40 "Spool P", 41 "Spool Q", 42 "Spool R", 43 "Spool S", 44 "Spool T", 45 "Spool U", 46 "Spool V", 47 "SP14", 48 "SP13", 49 "SP12", 50 "SP11".
- **L-coating** (2): 0 "------", 15 "UNCOATED". **L-wire** (2): 0 "------", 27 "110 / ad / sddfs / 225.0 mm" (Mass edit shows "110"). **L-wps** (4): 0 "----------", 1 "11111 | 141-2-GTAW (141-2)", 5 "23.008 | 141 (23.008 [2]|ISO 15614-1)", 6 "22.028BR | 135/136 (22.028BR [1]|ISO15614-1 / NEN3650)" (Mass edit: "141-2-GTAW | 11111 (141-2)" style).
- **L-charge** (21 in Edit weld / Mass edit, 16 in Add weld before certificates load): 0 "------", 9998 "CONN ISO", 9999 "EXISTING", 9989 "1 / Pipe", 9990 "2 / Elbow 45", 9991 "3 / Elbow 90", 9992 "4 / Flange", 9993 "5 / Tee", 9994 "6 / Reducer", 9995 "7 / Nipple", 9996 "8 / Valve", 9997 "9 / Cap", 9980 "10 / Swivel Flange", 9981 "11 / Swivel Male", 9982 "12 / Ball race", 9983 "13 / Female Flange"; then the five project charges (loaded by `getAllCerts.php?project=1`): 1 `11111 / 1/2" / 40 / Pipe / A106 Gr B / 7633186631` (selectable), 5 `1212 / 48" / 40 / Pipe / A106 Gr B /`, 3 `564321 / 1" / 40 / Cap / / 7633186631`, 4 `98784987 / 1/2" / NA / WN OR Fl / A234 Gr WPB /`, 2 `ada / / 1 / WN OR Fl / A105 / 8138259941` (the last four `selectable:false`, greyed).
- **L-welder**: Edit weld / Add weld after WPS choice: 91 options; first 10: 0 "-----------------" (Add weld: placeholder "Choose Welder", disabled), 1 "W01/W02", 2 "W01", 3 "W02", 4 (empty text; `getAllWelders.php` returns "W03"), 5 ("W02/W03"; returns "W03/W04"), 6 "W04", 28 "ML396 …", 109 "ML690 …", 110 "MV180 …"; texts are "<code> <name>" with a suffix " | G" in Edit weld. NDT dialog: 150 options (adds removed/other welders, one marked "(Deleted)"); NDT Pre: 91 options with suffix " | FL".
- **L-ndtproc** (NDT process, 5): 0 "-----------------", 1 "RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1", 4 "MT - Execution: EN ISO 17638 / Acceptance: EN ISO 23278 Lv2x", 5 "PT - Execution: EN ISO 3452-1 / Acceptance: EN ISO 23277 Lv2x", 13 "TOFD - Execution: NEN-EN-ISO 10863 / Acceptance NEN-EN-ISO 15626 L1". **L-ndtres**: 0 "-----------------", 2 "NA", 1 "Accepted". **L-lang**: en "English" (default), nl "Nederlands", de "Deutsch", fr "Français".

### Change ISO (`#changeIsoInProject`) — opened by the breadcrumb link "0001"
Header "Change ISO"; footer buttons "Go" (`name="Go"`, submit) and "Cancel". The body is empty in the capture (see "Not in the capture").

### Edit isometric (`#editIsometric`) — opened by the pencil in the Welds panel header (loaded from `editIsometric.php?rand=…&id=1&action=showroom`); also `.open-editIsometric`
Two-column dialog (`bs-modal-lg`), form POST multipart. Fields by section (values of 0001):
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| – | section "Basic" | | | | | |
| 1 | Iso number | isoNo | text | pattern `[A-Za-z0-9._-]+` | 0001 | tooltip: only letters, numbers, dots, - and _; hidden error text "Special characters are not allowed in the ISO number" (`#isoNoEditError`); `data-wsapps-iso-allow-unchanged` |
| 2 | Asset tag | assetTag | text | no | N011-HV10001-0001 | |
| 3 | IRN | irn | text | no | 1000 | |
| 4 | Revision number | revNo | text | no | 2 | help text: change the number here; a new revision with PDF goes through the "Add rev" link (→ `#addRev`) |
| 5 | ITP No | weldpilot_itp_id, itpNo | hidden ×2 | | 0, 111111 | shown as text "111111" with pencil "Edit" (`.wsapps-wp-itp-open`) |
| 6 | ITP Field | weldpilot_itp_id2, itpNo2 | hidden ×2 | | 0, 222222 | text "222222" with pencil "Edit" |
| – | "Current revisions:" links "2.00" (Studs wijziging) and "1.00" (RFC) → the PDFs | | | | | |
| – | section "Drawing & registration" | | | | | |
| 7 | Drawing no. 1 | drawingNo | text | no | N011-HV10001 | |
| 8 | Date | date | text (datepicker `dd.mm.yyyy`) | no | 04.02.2024 | |
| 9 | NoBo Reg. no. | noBoReg | text | no | N/A | |
| 10 | NoBo serial | noBoSerial | text | no | N/A | |
| – | section "Test & NDT" | | | | | |
| 11 | Piping class | pipingClass | text | no | A11011 | |
| 12 | Test pressure | testPressure | text | no | 29 | |
| 13 | Test system | (no name) | text, READONLY DISABLED | | PTC 01 | assigned in the hydrotest release (browser-pass notes) |
| 14 | Test medium | testMedium | text | no | WATER | |
| 15 | X Ray % | (no name) | text, READONLY DISABLED | | 14 | taken from the ITP (browser-pass notes) |
| 16 | NDT norm | ndtnorm | text | no | N/A | |
| 17 | PED Cat.-Mod | ped | text | no | (empty) | |
| 18 | Nom. diameter | nomDiameter | text | no | ND250 | |
| – | section "Material & finishing" | | | | | |
| 19 | Material | material | text | no | CS | |
| 20 | Paint spec. | paintSpec | text | no | A10 | |
| 21 | RAL | ral | text | no | 1101 | |
| 22 | Insulation | insulation | text | no | A15 | |
| – | section "Location & priority" | | | | | |
| 23 | Elevation | elevation | text | no | (empty) | |
| 24 | X axis | xaxis | text | no | (empty) | |
| 25 | Y axis | yaxis | text | no | (empty) | |
| 26 | Zone / Area | zone | text | no | A1 | |
| 27 | Priority | priority | select (6) | no | 1 "Prio 1" | 0 "No priority", 1 "Prio 1", 2 "Prio 2", 3 "Prio 3", 4 "Prio 4", 5 "Prio 5" |
| – | section "Other" | | | | | |
| 28 | Chemical clean | chemicalClean | text | no | N/A | |
| 29 | Tracing Spec | tracing | text | no | N/A | |
| 30 | Norm No. | asme2 | text | no | (empty) | |
| 31 | Norm | asme | text | no | 1111 | |
| 32 | Options: NoBo | noBo | checkbox (value ok) | no | unchecked | |
| 33 | Options: PWHT | pwht | checkbox (value ok) | no | checked | |
| – | section "Documents" | | | | | |
| 34 | Isometric | fileiso | file (.pdf) | no | "Nothing selected" | note: ITP PDFs are managed in the ITP catalog |
| 35 | Instructions for field personnel | description | rich-text editor (Quill, hidden textarea `#isoEditDescription`) | no | (empty) | template buttons "Prefab", "Field install", "NDT / inspection", "Pressure test", "Safety", "Finishing" insert fixed bullet text; mode radio |
| 36 | Templates mode | isoMemoInsertMode | radio | | "append" checked | "Append" / "Replace" |
| 37 | | editID | hidden | | 1 | |
| 38 | | secureCode | hidden | | token | |
Footer: "Add new" (`name="addIsometricNew"`, submit, green) with checkboxes `copyWelds` "Copy Welds", `copyMats` "Copy Materials", `copyCalcs` "Copy Calculations"; "Update" (`name="editIsometric"`, submit, orange); "Cancel".

### Link ITP (`#weldpilotItpPickerModal`) — opened by the ITPS card icon button or "Link ITP"
Select `#weldpilotLinkItpSelect` (no name; select2) label "Choose ITP", one option "— Select ITP —" (the list is empty for this project: `picker_list` returned `{"success":true,"items":[]}`). Footer "Cancel", "Link ITP" (`#weldpilotLinkItpConfirmBtn`). Attributes `data-wp-active-slot="any"`, `data-wp-active-iso-id="1"`. A second dialog `#weldpilotItpUnlinkModal` ("Unlink ITP") exists; no control for it is in the capture.

### Add rev (`#addRev`) — opened by the "+" in ISO No, and by the "Add rev" link in Edit isometric
| # | Label | name | Type | Required | Default |
|---|---|---|---|---|---|
| 1 | Isometric | fileiso | file (.pdf) | no | "Nothing selected" |
| 2 | Revision number | revNo | text | no | 3 |
| 3 | Comment | comment | text | no | empty |
Text "Current revisions:" with the two PDF links "/ Studs wijziging" and "/ RFC". Buttons "Add" (`name="addRev"`), "Cancel". Dialogs `#addRevItp` ("Add ITP revision", `addRevItp`) and `#addRevItp2` ("Add ITP revision 2", `addRevItp2`) have the same three fields (`revNo` is number, step 0.01, default 3); no control on this page opens them.

### Current revisions (`#showRev`) — opened by the "Rev 2.00" link
Table with one row per revision: hidden `revid` (2, 1), a red trash submit button `name="deleteRev"`, and the PDF link with comment ("/ Studs wijziging", "/ RFC"). Button "Close".

### Confirm dialogs of the Status card
| Dialog | Opened by | Text (paraphrased) | Fields | Buttons |
|---|---|---|---|---|
| `#confirmPrefabComplete` "Prefab complete" | Prefab-complete button (not shown on 0001) | asks to mark the isometric Prefab complete; it then appears in the release overview and shop welds lock at once | hidden `isometricId`=1, `page`=isometrics, `project`=1, `view`=weldpilot | "Confirm" (`finishInShop`), "Cancel" |
| `#confirmFieldComplete` "Field complete" | Field-complete button (not shown on 0001) | asks to mark Field complete; it appears in the field release overview, hydrotest and handover follow | same four hidden fields | "Confirm" (`finishInField`), "Cancel" |
| `#confirmReopenField` "Reopen field complete" | "Reopen" next to "Field completed" | question "Are you sure you want to reopen Field complete?"; muted line: the isometric is removed from the field release overview | same four hidden fields; `reopenReasonCode` select REQUIRED "Reason *" (5: "" "— Select reason —", NDT_CORRECTION "NDT correction", WELD_ERROR "Weld error corrected", DATA_ENTRY "Data entry error", OTHER "Other"); `reopenReasonText` rich-text "Notes" (placeholder "Required for some reasons", 3 rows) | "Reopen" (`reopenField`), "Cancel" |
| `#confirmReopenShop` "Reopen prefab complete" (present on 0003 only) | "Reopen" next to "Prefab completed" | question "Are you sure you want to reopen Prefab complete?"; muted line: shop welds become editable again and the isometric leaves the prefab release overview | same fields (`isometricId`=895 there), same reason list | "Reopen" (`reopenShop`), "Cancel" |
| `#confirmInlineReleaseField` "Release selected" | "Create release doc" | asks to generate a Field release document for this isometric (names "ITP 2: 222222"); after generation the isometric is marked released | form GET `../core/pdf/releaseDocField.php` target `_blank`; hidden `selectedIDS`=",1", `itp`=222222 | "Confirm" (`confirmReleaseField`), "Cancel" |

### Set phase (`#editIsometricPhase`) — Options → "Set phase"
Hidden `deleteID`=1 and eight checkboxes (value ok, all unchecked): `prefab_materials` "Materials (MTOP)", `prefab_est` "Estimate (ESTP)", `prefab_doc` "Isometric formatted", `prefab_welds` "Welds defined (WP)", `field_doc` "Field documentation", `field_test` "Test documentation", `field_release` "Release documentation", `prep_finished` "Work preparation 100%". Buttons "Update" (`editIsometricPhase`), "Cancel".

### Attachments (`#isoAttachmentsModal`) — Options → "Attachments"
| # | Label | name | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | (hidden) | iso | hidden | | 1 | in upload form and archive form |
| 2 | Report type | reportNo | select2 (21) | no | 73 "2-200-AS PREFABRICATED" | first 10: 73 "2-200-AS PREFABRICATED", 72 "108 - Isometric pre-fab", 71 "107 - Blank LISL rev", 70 "106 - CUT LISt rev", 69 "103 - MTO SUPPORT rev", 68 "105 - 3D rev", 67 "104 - Support rev", 66 "102 - MTO rev", 65 "101 - Isometric rev", 64 "Ready for work"; more: 45 "Support SHOP", 46 "Support FIELD", 5 "Support index", 22 "Info Documents", 44 "CUT LIST", 9 "Piping layout", 6 "3D snippet", 2 "Flange tightening", 7 "Supports", 11 "Prefab signed off", 16 "Field signed off" |
| 3 | Upload (Hold CTRL …) Only PDFs are allowed | files[] | file multiple (.pdf) | no | text field `#isoAttachmentsFileLabel` "Nothing selected", READONLY | |
Buttons "Upload" (`#isoAttachmentsUploadBtn`), "Delete" (`#isoAttachmentsDeleteBtn`, red, hidden while there are no attachments), "Cancel". Archive area shows "Attachments Nothing selected" (empty); delete checkboxes are named `cfDel[]` in the script.

### Visual inspection (`#viHubModal`) — Options → "Visual inspection"
Tabs "New", "Upload", "Visual reports archive" (+ count 1). A hidden panel `#viHubChoosePanel` (list of open reports to choose from, button "Cancel") replaces the tabs when several open reports exist.
| # | Tab / Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | New (form `#viGenerateForm`, GET `../core/pdf/visual-inspection-v2.php`) | project, id, vt_version | hidden | | 1, 1, 2 | |
| 2 | Filter | filterType | select | no | 0 "Include all welds" | 0 "Include all welds", 3 "Select specific weld(s)" (shows the weld table) |
| 3 | weld table (columns C, WN, Type, Wdr; 18 rows: every weld except 001, which is already on report VT 345) | cb[] | checkbox | needed when filter is 3 | | |
| 4 | ITP | itp | select | no | 1 "ITP 1" | 1 "ITP 1", 2 "ITP 2" |
| 5 | Activity No | activityNo | text | no | empty | |
| 6 | QAQC Engineer | qaqc | select (1) | no | 1 (person A) | |
| 7 | Custom Report No (If needed) | customNo | text | no | empty | |
| 8 | Upload (form `#viHubUploadForm`, POST) | id | hidden | | 1 | |
| 9 | Select report | reportNo | select | no | 20522 "345" | one option |
| 10 | Inspection date | inspectionDate | text, datepicker | no | 16.11.2026 (today) | |
| 11 | table A / NA / WN / Type / Wdr (weld 001 only) | a[], na[] | checkboxes | each weld needs one of the two | | ticking A clears NA of the same weld and the reverse |
| 12 | VI document(s) (Hold CTRL …) Only PDFs are allowed | files[] | file multiple | needed to upload | | |
| 13 | Archive (form `#viHubArchiveForm`) | vtDel[] (generated), vtDelUpload[] (uploaded) | checkbox | | | "Generated reports": link "VT 345" → `../core/pdf/visual-inspection-v2.php?report_id=20522&project=1&id=1`; "Uploaded reports": empty text "Check for delete" |
Buttons: "Digital fill-in" (`#btnViDigitalFill`, green), "Go (PDF)" (`#btnViGoPdf`), "Save A/NA" (`#btnViHubSaveMarks`), "Upload" (`#btnViHubUpload`), "Delete" (`#btnViHubDelete`), footer "Cancel". Help text: ticks can be saved weld by weld; the PDF is uploaded (or the report finished by Digital fill-in) only when every weld on the report is marked; a weld is never on two reports.

### Generate Mass NDT-Pre request (`#pdfNdtPreRequestLanguageISO`, title "NDT-Pre Request"), Generate Mass NDT request (`#pdfNdtRequestLanguageISO`, title "NDT Request"), Generate Mass Pre-HT/PWHT request (`#pdfPwhtRequestLanguageISO`, title "PWHT request") — Options menu
All are GET forms in a new tab (`../core/pdf/ndt-pre-request-mass.php`, `ndt-request-mass.php`, `pwht-request-mass.php`) with an info box ("When you generate NDT Request you can not change request data. Please check that you entered correct data!").
| Dialog | name | Type | Default | Notes |
|---|---|---|---|---|
| NDT, NDT-Pre, PWHT | sourcePage, sourceProject, sourceISO | hidden | isometrics, 1, 1 | |
| NDT, NDT-Pre, PWHT | ids | hidden | filled with the ticked weld ids | |
| NDT | ndt[] | checkbox, label "RT - Execution: RToD T-0201 / Acceptance: RToD T-0111" (value 6, `data-weld-ids="41"`) under heading "NDT Process" | unchecked | only processes still open on the ticked welds are listed |
| NDT-Pre | __ndtAllDone | hidden | 1 | text "All NDT requests have already been created for the selected welds." under "NDT-Pre Process"; "Go" is DISABLED |
| PWHT | pwhttype | radio | "pwht" checked | values pwhtpre "Pre-WHT", pwht "PWHT" |
| NDT, NDT-Pre, PWHT | lang | select | en | L-lang |
| NDT, NDT-Pre | note | rich-text "Note" | empty | |
| NDT, NDT-Pre, PWHT | includeIsometrics | checkbox | unchecked | label "Isometric tekening meesturen in PDF (request + iso)" |
Buttons "Go" (submit), "Cancel". The NDT and NDT-Pre dialogs carry messages for the checks in the script: "Select one or more welds in the table first.", "None of the selected welds has an open NDT process.", "Select at least one NDT process before generating the request.", "All NDT requests have already been created for the selected welds."

### Upload Pre-HT/PWHT on multiple welds (`#uploadPWHTonMultipleWelds`) — Options menu
Table "Check | WN | Type | Wdr" with checkboxes `weld[]` for the four welds that require PWHT (002, 003, 005, 007). Fields: `pwhtNoReportPre` "Pre-HT Rp/Nr." (text), `pwhtNoReport` "PWHT Rp/Nr." (text), `id` hidden 1, `file` "Document (Only PDFs are allowed)" (file .pdf), `pwhtCheck` checkbox "PWHT 100%". Buttons "Upload" (`uploadPWHTonMultipleWelds`), "Cancel". The sibling dialogs `#uploadNDTonMultipleWelds` / `…Pre` (fields `weld[]`, `ndtRpNo`, `ndtResult`, `ndtRpNoRemaining`, `ndtResultRemaining`, `ndtRpNoAdditional`, `ndtResultAdditional`, `ndtRpNoAdditional2`, `ndtResultAdditional2`, `ndtRpNoAdditional3`, `ndtResultAdditional3`, `id`, `files[]`) exist in the page but no control of it opens them.

### Punch lists (`#punchlist`) — Options → "Punch list", and the "Item" button (loaded from `punchlist.php?id=1&type=isometrics&action=showroom` and `get-punch-warnings.php?iso_id=1`)
Title "Punch lists". Warning: "There are still 1 A/B items that must be Finished and approved (Akkoord) before this phase can be Passed." Info box: manage items on the punch list page; this dialog is for quick add and passed reporting; links "Open punch list" → `index.php?page=punchlists`, "Passed overview" → `index.php?page=punchlists&viewT=passed`. Pills "Add item" (active) and "Complete punch & Sign-off".
| # | Pill / Label | name | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | Add item — badge "ISO: 0001"; source toggle button "Scan" (QR scan: "Start scanner" / "Stop", status "Scan a weld label QR code.") | scanned_weld_id, scanned_iso_id | hidden | | 0, 0 | scanning fills project and isometric |
| 2 | Type | type | select2 (4) | no | A | A "A — Immediate fix (blocking)", B "B — ASAP fix (blocking)", C "C — Fix (non-blocking)", D "D — Fix in operation (non-blocking)" |
| 3 | File (button "Take photo") | file | file image/* | no | | |
| 4 | File (button "Choose file") | file2 | file image/*, PDF | no | "Nothing selected" | photos are auto-resized |
| 5 | Description | description | textarea (3 rows) | no | | |
| 6 | Due date | duedate | text, datepicker, READONLY | no | 16.11.2026 | |
| 7 | Contractor | company | select2 (2) | no | 7 "MONTAVAR METALNA LOLA" | 7 "MONTAVAR METALNA LOLA", 8 "Websonik Applicaties BV" |
| 8 | Reported date | reporteddate | text, datepicker, READONLY | no | 16.11.2026 | |
| 9 | Reported by | reportedby | select2 (31) | no | 0 "—" | 30 persons |
| 10 | Pre-Punch / Punch | punch | radio | | 1 "Pre-Punch" checked | 1 "Pre-Punch", 2 "Punch" |
| 11 | | typepage, page_slug, editID, requesteddate, requestedby | hidden | | isometrics, isometrics, 1, empty, 0 | |
| 12 | Complete punch & Sign-off — "1 Pre-Punch open", "0 Punch open" | iso_id, mark_passed | hidden | | 1, 0 | |
| 13 | Pre-Punch / Punch | punch | radio | | 2 "Punch" checked | |
| 14 | Select punch items; "Select all" | punch_ids[] | checkbox | | | one open item row (hidden for the chosen phase) |
| 15 | Signed by | signer_type | radio | | client | client "Client", user "User", inspection "Inspection" |
| 16 | Client name * / Company / Function | client_name, client_company, client_function | text | client name yes | empty | for "Client" |
| 17 | (user) signature of the logged-in user | use_saved_signature, saved_signature_type | hidden | | 0, full | warning "No saved signature. Register one under Signatures." (link → `index.php?page=signatures`) |
| 18 | Inspector * | inspector_id | select2 (31) | yes for "Inspection" | 0 "—" | 30 persons |
| 19 | Date * | signed_date | text, datepicker, READONLY | yes | 16.11.2026 | |
| 20 | Remarks | remarks | textarea (2 rows) | no | | |
| 21 | Signature method | signoff_method | radio | | draw | draw "Draw digitally" (canvas + "Clear"; `signature_data` hidden), upload "Upload PDF" (`signoff_file` file .pdf, label "Upload signed PDF") |
Buttons: "Add" (`addPunchlist`), "Finish + Sign-off" (`saveSignoff`), footer "Close". A hidden iframe `#punchlistActionFrame` receives the form results.

### Audit trail (`#showIsometricAuditTrail`) — Options → "Audit trail" (`ajax-isometric-audit.php?isoId=1&weldId=0`)
Select `#isoAuditWeldFilter` (label "Weld no.", no name, `data-iso-id`=1), 20 options: 0 "All" (selected), then every weld (1 "001" … 66350 "016"). Result area text (empty history): "No audit entries for this isometric yet." Footer "Close".

### Delete selected (`#deleteSelectedWelds`) — Options → "Delete selected"
Text "Are you sure?"; hidden `deleteID` (`#deleteSelectedWeldsIds`, filled with the ticked ids). Buttons "Delete" (`deleteSelectedWelds`), "Cancel". Delete weld (`#deleteWeld`, from the trash icon): same text, hidden `deleteID`, `secureCode`; "Delete" (`deleteWeld`). Bring weld back (`#backWeld`): same text, hidden `deleteID`, `secureCode`; "Bring back" (`backWeld`), "Cancel".

### Add weld (`#addWeld`) — "Add weld" button (form POST multipart)
Fields in DOM order (the screen shows them in three columns: browser-pass notes).
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Weld no. | weldNo | text | yes | empty | `#liveCheckWeldNo` (hidden box in the footer) |
| 2 | Weld type | weldType | select2 | red border once a welder is chosen | 0 | L-weldtype |
| 3 | Welder (hidden link "Multiple welders?" `.multipleWelders`) | welder | select2 | no | 0 "-----------------" | only that option until a WPS is chosen; then L-welder |
| 4 | Welder 3 | welder3 | select2 | no | same | same |
| 5 | Coating 1 | coating1 | select2 | no | 0 | L-coating |
| 6 | Welding wire 1 | wire1 | select | no | 0 | L-wire |
| 7 | Pos 1 | pos1 | text | no | empty | |
| 8 | Charge number 1 | chargeNo1 | select2 | red border once a welder is chosen | 0 | L-charge; choosing one shows a table "Index number / Material / Description / Diameter" (`#chargeNo1results`) |
| 9 | WPS number | wpsNo | select | yes once a welder is chosen | 0 | L-wps; choosing one reloads the welder lists |
| 10 | Welder 2 | welder2 | select2 | no | 0 | |
| 11 | Welder 4 | welder4 | select2 | no | 0 | |
| 12 | Coating 2 | coating2 | select2 | no | 0 | L-coating |
| 13 | Welding wire 2 | wire2 | select | no | 0 | L-wire |
| 14 | Pos 2 | pos2 | text | no | empty | |
| 15 | Charge number 2 | chargeNo2 | select2 | red border once a welder is chosen | 0 | L-charge |
| 16 | | weldingProcess | hidden | | 0 | |
| 17 | Fitup date | datefit | text, datepicker, READONLY | no | empty | |
| 18 | Weld Date | date | text, datepicker, READONLY | yes once a welder is chosen | today (16.11.2026) | |
| 19 | Dia. | diameter | select2 | yes once a welder is chosen | 0 | L-dia |
| 20 | Length in mm | dialen | number step 1 | no | | group `.showOnDiaX`, hidden; the capture shows it staying hidden after picking "-- Length in mm --" |
| 21 | Spool | spool | select2 | no | 0 | L-spool |
| 22 | NDT Req. Pre | ndoReqPre | checkbox (ok) | no | unchecked | |
| 23 | NDT Req. | ndoReq | checkbox (ok) | no | unchecked | |
| 24 | Pre-WHT | pwhtReq | checkbox (ok) | no | unchecked | same name as the next one |
| 25 | PWHT Req. | pwhtReq | checkbox (ok) | no | unchecked | |
| 26 | Repair | repair | checkbox (ok) | no | unchecked | |
| 27 | Tracer | tracer | checkbox (ok) | no | unchecked | |
Footer: "Add" (`addWeld`, submit; DISABLED in the capture after a welder and WPS were chosen while Weld type, Dia., Charge number 2 were still empty), "Cancel". Requests seen: `getAllCerts.php?project=1` ×2 on open, `getAllWelders.php` ×4 and `getAllCerts.php?project=1&include=1` ×2 after choosing WPS "11111 | 141-2-GTAW (141-2)", `showMaterialDetailsByChargeNumber*.php` after a charge number, POST `weld-material-group-check.php`.

### Add welds (`#addWelds`, title "Add weld") — no control on this page opens it
Fields: `weldNo` "Weld no. Start" (number, REQUIRED, default 001), `weldNo2` "Weld no. End" (number, REQUIRED, default 015), `diameter` "Dia." (select, 54 options, L-dia without "x"). Footer "Add" (`addWelds`), "Cancel". The empty-table text names "Add welds".

### Mass edit welds (`#massEditWeld`) — "Mass edit welds" button (enabled with ticked rows; form POST multipart)
All fields empty = keep the existing value (browser-pass notes). Request on open: `mass-edit-weld-mandatory.php?ids=1%2C2` (returns each ticked weld's mandatory values), `getAllWelders.php`, `getAllCerts.php?project=1`.
| name | Label | Type | Default / options |
|---|---|---|---|
| _return_page, _return_project, _return_id, _return_view | | hidden | isometrics, 1, 1, weldpilot |
| weldType | Weld type | select2 | 0 "----------", L-weldtype |
| welder, welder2, welder3, welder4 | Welder, Welder 2, Welder 3, Welder 4 | select2 | 0 "-----------------"; L-welder after load |
| coating1, coating2 | Coating 1, Coating 2 | select2 | L-coating |
| wire1, wire2 | Welding wire 1, Welding wire 2 | select | 0, 27 "110" |
| pos1, pos2 | Pos 1, Pos 2 | text | empty |
| chargeNo1, chargeNo2 | Charge number 1, Charge number 2 | select2 (21) | L-charge |
| wpsNo | WPS number | select2 (4) | L-wps |
| weldingProcess | Weld process (hidden group) | select2 (12) | 0 "----------", 7 "TB", 10 "111", 11 "141-111", 12 "141", 13 "135", 14 "135-138", 15 "138", 17 "141-138", 18 "GTAW", 19 "SMAW", 20 "GTAW/SMAW" |
| datefit, datefit_clear | Fit-up Date, "Clear date" | text datepicker READONLY; checkbox (value 1) | tooltip: leave empty to keep, tick Clear date to remove the date |
| date, date_clear | Weld Date, "Clear date" | same | same |
| diameter, dialen | Dia., Length in mm | select2 (55); number (hidden group) | L-dia |
| ndoReqPre, ndoReq, pwhtReqPre, pwhtReq, repair, tracer | NDT Req. Pre, NDT Req., Pre-HT, PWHT Req., Repair, Tracer | checkbox (ok) | unchecked (Tracer enabled here) |
| section "NDT Pre": ndtLocationPre | NDT location Pre | select2 | 0 "-----------------" |
| ndtProcessPre, ndtProcessRemainingPre, ndtProcessAdditionalPre, ndtProcessAdditional2Pre, ndtProcessAdditional3Pre | NDT process (×5) | select2 | L-ndtproc |
| section "NDT": ndtLocation, ids | NDT location; hidden ids | select2; hidden | `ids`=ticked ids |
| ndtProcess, ndtProcessRemaining, ndtProcessAdditional, ndtProcessAdditional2, ndtProcessAdditional3 | NDT process (×5) | select2 | L-ndtproc |
| section "Pre-HT / PWHT": pwhtLocationPre, pwhtLocation | PWHT location Pre, PWHT location | select2 (4) | 0 "-----------------", 1 "Workshop MNT - Beograd", 2 "Termoproces - Beograd", 4 "Site MNT - Antwerp" |
| pwhtProcessPre, pwhtProcess | PWHT process Pre, PWHT process | select2 (2) | 0 "-----------------", 1 "PWHT" |
Buttons "Update" (`massEditWeld`), "Cancel".

### Edit weld (`#editWeld`) — pencil in the Options cell, and the blockers entries (`editWeld.php?id=<weld id>&action=editweld`)
Fields in DOM order (weld 001 values; the form is the same for every weld).
| # | Label | name | Type | Required | Default (001) | Options / depends on |
|---|---|---|---|---|---|---|
| 0 | "Previous edits" (button, count 1, toggles a table Date / Comment / User) | | | | | table is in the DOM; disabled for a locked weld |
| 0a | warning "Warning Weld has NDT or PWHT in progress" and label "You MUST enter reason for editing weld" | note | rich-text (Quill), placeholder as the label | yes | empty | only shown for welds with NDT/PWHT in progress (001, 002, 003, 005); "Update" stays disabled until the text is not empty |
| 1 | Weld no. | weldNo | text | yes | 001 | |
| 2 | Weld type | weldType | select2 | yes (red border when empty) | 0 "------" | L-weldtype |
| 3 | Welder | welder | select2 | no | 28 (ML396) | L-welder |
| 4 | Welder 3 | welder3 | select2 | no | 0 | L-welder |
| 5 | Coating 1 | coating1 | select2 | no | 0 | L-coating |
| 6 | Coating weld | coating3 | select2 | no | 0 | L-coating |
| 7 | KR | kr | text | no | empty | |
| 8 | FP | fp | text | no | empty | |
| 9 | Welding wire 1 | wire1 | select | no | 0 | L-wire |
| 10 | Pos 1 | pos1 | text | no | empty | |
| 11 | "Upd. prev. weld" | cbWeld1 | checkbox | no | unchecked | inside the label of Charge number 1 |
| 12 | Charge number 1 | chargeNo1 | select2 | yes | 1 (`11111 / 1/2" / 40 / Pipe / A106 Gr B / 7633186631`) | L-charge (21); shows table Index number 0001 / Material A106 Gr B / Description Pipe / Diameter 1/2" |
| 13 | WPS number | wpsNo | select2 | yes | 1 "11111 | 141-2-GTAW (141-2)" | L-wps |
| 14 | Welder 2 | welder2 | select2 | no | 163 (ML670) | L-welder |
| 15 | Welder 4 | welder4 | select2 | no | 0 | L-welder |
| 16 | Coating 2 | coating2 | select2 | no | 0 | L-coating |
| 17 | Sleeve | sleeve | select2 (1) | no | 0 "------" | |
| 18 | Ins. length 1 | insLength | text | no | empty | |
| 19 | Ins. length 2 | insLength2 | text | no | empty | |
| 20 | Welding wire 2 | wire2 | select | no | 0 | L-wire |
| 21 | Pos 2 | pos2 | text | no | empty | |
| 22 | "Upd. next weld" | cbWeld2 | checkbox | no | unchecked | inside the label of Charge number 2 |
| 23 | Charge number 2 | chargeNo2 | select2 | yes | 1 | L-charge |
| 24 | Weld process | weldingProcess | select2 (12) | no | 0 "------" | hidden group; list as in Mass edit |
| 25 | Fitup Date | datefit | text datepicker | no | empty | |
| 26 | Weld Date | date | text datepicker | yes | 21.03.2024 | |
| 27 | Dia. | diameter | select2 | yes | 1 "0,5" | L-dia |
| 28 | Length in mm | dialen | number step 1 | no | 0 | group hidden unless Dia. is "x" |
| 29 | Spool | spool | select2 | no | 0 | L-spool |
| 30 | NDT Req. Pre | ndoReqPre | checkbox (ok) | no | unchecked | |
| 31 | NDT Req. | ndoReq | checkbox (ok) | no | checked | |
| 32 | NDT percent | ndtpercent | number, placeholder "0–100", min 0, max 100, step 1 | no | empty | shown only when Dia. is "x" and NDT Req. is ticked |
| 33 | Pre-HT | pwhtReqPre | checkbox (ok) | no | unchecked | |
| 34 | PWHT Req. | pwhtReq | checkbox (ok) | no | unchecked | |
| 35 | Repair | repair | checkbox (ok) | no | unchecked | |
| 36 | Tracer | (no name) | checkbox DISABLED | no | unchecked | label tooltip "Tracer is assigned via NDT / dashboard, not here." |
| 37 | | editID | hidden | | 1 | |
| 38 | | __editweld_orig_weldno | hidden (`data-iso`=1) | | 001 | |
| 39 | | __editweld_existing_weldnos | hidden | | `001|002|003|004|005|006|007|008|009|010|011|012|013|014|005A|010R1|010R2|015|016` | |
Footer: hidden `secureCode`; "Add new" (`addWeld`, DISABLED), "Update" (`editWeld`, DISABLED), "Cancel". Variants: (a) 0003 weld 005 (no NDT/PWHT): no "Previous edits", no warning, no `note`; Weld type, Charge number 1, WPS number, Charge number 2 (all `alertArea`, red left border) and Weld Date are empty; "Update" still disabled. (b) Locked weld 010R1: every input DISABLED, blue box "Locked after Field complete" with a sentence naming the weld (the weld name is written in Dutch "Las 010R1 is locked after Field complete."), "Previous edits" disabled; Weld Date empty with red border.

### Stamp (`#editStamp`) — check-in-box icon of an unlocked weld (`editStamp.php?id=<weld id>&action=showroom`)
Select `stamp` (31 options): 0 "-----------" (default), then 30 entries "<person> / <stamp no>" (stamp no present for two: 00111 and QC001; the others end with "/ "). Hidden `editID` (1). Buttons "Update" (`editStamp`), "Cancel".

### NDT (`#showNDO`) — "Yes" link of NDT, and blockers entries (`showNDO.php?id=<weld id>&action=showroom`)
Title "NDT"; heading "<project> / <iso> / <weld>" (20240101 / 0001 / 001); read-only line "Welder <code>" (and "Welder 2 <code>"). Five columns, each starting with a process select; `ndtProcess` is marked with a check icon in the label (a column preselected from the NDT request).
| # | Label | name | Type | Required | Default (001) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Welder (hidden group) | welderCC; welder | select2 DISABLED REQUIRED (150); hidden | | 28; 28 | L-welder |
| 2 | NDT location | ndtLocation (select, 0 options, DISABLED); ndtLocation hidden | | | hidden value 1 | |
| 3 | Request number | ndtNo | text DISABLED | | R00011 (0002: "R") | |
| 4 | Column 1: NDT process | ndtProcess | select2 | yes | 1 RT | L-ndtproc |
| 5 | Film Nr. / NDT Rp/Nr. / NDT date | filmNo / ndtRpNo / ndtDate | text / text / text datepicker | no | empty (002: RT-001, 27.12.2024) | |
| 6 | NDT res. | ndtResult | select | no | 0 | L-ndtres; onchange refreshes the NA fields |
| 7 | NA length | naLength | text (mm, placeholder "mm") | no | DISABLED unless result NA | numbers only (script) |
| 8 | Defect type | defect | select2 (12) REQUIRED | | DISABLED unless NA | 0 "-----------------", 1 "Slag Inclusion", 2 "Porosity", 3 "Lack of Fusion", 4 "Lack of Inter-run Fusion", 5 "Undercut Weld", 6 "Crack Shrinkage", 7 "Gas Inclusion", 8 "Overlap Weld", 9 "Crater", 10 "Foreign Material Inclusion", 11 "Root surface concavity" |
| 9 | Welder for error | welderNA | select2 (3) REQUIRED | | DISABLED unless NA | 0, 28 (welder 1 code), 163 (welder 2 code) |
| 10 | Column 2: NDT process | ndtProcessRemaining | select2 | no | 4 MT | L-ndtproc; the fields below show only when a process is chosen |
| 11 | Film Nr. / NDT Rp/Nr. / NDT date / NDT res. | filmNoRemaining / ndtRpNoRemaining / ndtDateRemaining / ndtResultRemaining | text ×3 / select | no | empty | L-ndtres |
| 12 | ReWeld? | reweld | checkbox (ok) | no | unchecked, DISABLED unless NA (002: checked) | wrapper `#ndtReweldWrap`, `data-ndt-diameter-inches="0.5"` |
| 13 | Column 3: NDT process, film, report, date, result | ndtProcessAdditional, filmNoAdditional, ndtRpNoAdditional, ndtDateAdditional, ndtResultAdditional | select2, text ×3, select | no | 5 PT | |
| 14 | Column 4 | ndtProcessAdditional2, filmNoAdditional2, ndtRpNoAdditional2, ndtDateAdditional2, ndtResultAdditional2 (hidden twin, value 0) | | no | empty; fields READONLY / result DISABLED when no process | |
| 15 | Column 5 | ndtProcessAdditional3, filmNoAdditional3, ndtRpNoAdditional3, ndtDateAdditional3, ndtResultAdditional3 (hidden twin, value 0) | | no | same | |
| 16 | Panel "Enable tracers" (hidden until NA) | ndtEnableTracers (checkbox, no name, DISABLED); button "Save tracers" (`#ndtTracerProposalSave`) | | | | note: up to 2 tracer welds per rejected weld in the same welder / WPS / ITP-KNR group; panel `data-weld-id`, `data-welder-id`, `data-wps-id`, `data-itp-code`, `data-is-rejected`, `data-has-linked-tracers` |
| 17 | NDT documents (Hold CTRL for multiple files upload) Only PDFs are allowed | files[] | file multiple (.pdf) | no | "Nothing selected" | existing documents are listed with checkbox `ndtDel[]` (value = document id) and "Check for delete" |
| 18 | | report, editID, ndtpdf | hidden | | ok, <weld id>, 2 | |
| 19 | Button "Restart NDT process" (`.wsapps-ndt-undo-open`) | wsapps-ndt-weld-undo-pick (checkbox per process, no name; `data-weld`, `data-process`, `data-pre`, `data-result`) | | | all ticked | confirm text "You are about to restart the selected NDT process." / "The NDT result for the selected process will be removed." / "Are you sure?" + "Yes" (`.wsapps-ndt-weld-undo-go`) |
Hidden panel `#ndtAiSuggestPanel` titled "AI Suggesties". Footer "Save" (`editNdtRequest`), "Cancel". Values seen: weld 002 has RT result NA, NA length 100, MT Accepted, ReWeld ticked, one document; weld 003 has RT, MT, PT all Accepted (NA fields disabled) and one document.

### NDT Pre (`#showNDOPre`) — "Yes" link of NDT (Pre) (`showNDOPre.php?id=3&action=showroom`)
Title "NDT Pre". Same layout as NDT with suffix "Pre" on names and without defect / welder-for-error / ReWeld / tracer: `welderPre` (select, REQUIRED, 91 options, empty; hidden twin `welderPre`=0), `ndtLocationPre` (select DISABLED + hidden twin = 1), `ndtNoPre` (R00001, DISABLED), then per column: process `ndtProcessPre` / `ndtProcessRemainingPre` / `ndtProcessAdditionalPre` / `ndtProcessAdditional2Pre` / `ndtProcessAdditional3Pre` (003: MT, PT, then empty), `filmNoPre`, `filmNoRemainingPre`, `filmNoAdditionalPre`, `filmNoAdditional2Pre`, `filmNoAdditional3Pre`, `ndtRpNoPre`, `ndtRpNoRemainingPre`, `ndtRpNoAdditionalPre`, `ndtRpNoAdditional2Pre`, `ndtRpNoAdditional3Pre`, `ndtDatePre`, `ndtDateRemainingPre`, `ndtDateAdditionalPre`, `ndtDateAdditional2Pre`, `ndtDateAdditional3Pre`, `ndtResultPre` (Accepted), `ndtResultRemainingPre` (Accepted), `ndtResultAdditionalPre`, `ndtResultAdditional2Pre`, `ndtResultAdditional3Pre` (the last three disabled with hidden twins 0), `naLengthPre` (DISABLED); `files[]`; hidden `reportPre`=ok, `editID`=3, `ndtpdfPre`=2; "Restart NDT process" list (MT, PT). Footer "Save" (`editNdtRequestPre`), "Cancel". Result change calls `__ndoShowNAPreUpdate`.

### PWHT request (`#showPWHT`) — "Yes" link of Pre-HT/PWHT (`showPWHT.php?id=2&action=showroom`)
Heading "20240101 / 0001 / 002", section "PWHT".
| # | Label | name | Type | Required | Default | Options |
|---|---|---|---|---|---|---|
| 1 | PWHT location | pwhtLocation | select2 (4) | no | 1 "Workshop MNT - Beograd" | 0 "------------", 1 "Workshop MNT - Beograd", 2 "Termoproces - Beograd", 4 "Site MNT - Antwerp" |
| 2 | PWHT process | pwhtProcess | select2 (2) | no | 1 "PWHT (Procedure 001)" | 0 "------------", 1 "PWHT (Procedure 001)" |
| 3 | PWHT Rq/Nr. | pwhtNo | select (1) | no | 7 "00007" | |
| 4 | PWHT Date | pwhtDate | text datepicker | no | empty | |
| 5 | PWHT Rp/Nr. | pwhtNoReport | text | no | empty | |
| 6 | PWHT 100% | pwhtCheck | checkbox (ok) | no | unchecked | |
| 7 | Document (Only PDFs are allowed) | file | file (.pdf) | no | "Nothing selected" | "Check for delete" text |
| 8 | | editID | hidden | | 2 | |
Footer "Save" (`editPwhtRequest`), "Cancel".

### NDT archive (`#showWeldNdtArchive`), NDT Pre archive (`#showWeldNdtPreArchive`), PWHT archive (`#showWeldPwhtArchive`) — file icons in the NDT / NDT (Pre) / Pre-HT/PWHT cells
Tables "Document | Date | Details" (NDT, NDT Pre) and "Document | Date" (PWHT). NDT archive of 001: `20240321_R00011-NDT-Request.pdf`, 21.03.2024. 15:33, link "Details" → `index.php?page=ndt-requests&type=archive&report=11` (new tab); document link tooltip "Open archived NDT Request" → `../core/export/down.php?file=…`. NDT Pre archive of 003: `20240321_R00002-NDT-RequestPre.pdf` 21.03.2024. 11:36 and `20240321_R00001-NDT-RequestPre.pdf` 21.03.2024. 11:30, Details → `…&type=archive&pre=pre&report=2` / `report=1`. PWHT archive of 007: `20241011_R00011-PWHT-Request.pdf`, 11.10.2024. 11:22 (tooltip "Open archived PWHT Request"). Button "Close".

### Tracer details (`#weldTracerDetailModal`) — boxed "T" in an NDT cell (`getWeldTracerDetail.php?tracer_weld_id=<id>`, JSON)
Title "Tracer details"; body text built by script: section "Original rejected weld" with "No source weld link found for this tracer." (when no source), "Linked tracer welds | 1 linked of 2 required.", then each tracer "Tracer | Weld: <no>" with "Project: <project no> | Isometric: <iso no>", label "Selected tracer" for the clicked one, "NDT results:" and a list "<process> <result>" or "No NDT results recorded.". Seen: weld 004 → no results; weld 010 → "RT … NA", "MT … Accepted", "RT - Execution: RToD T-0201 / Acceptance: RToD T-0111 Accepted". Error texts: "Unable to load tracer details.", "No direct access (session or AJAX header).", "Not authenticated." Footer "Close".

### Report and print dialogs (opened from the Reports menu and the row print icons)
All are GET forms in a new tab; footer "Go" (`name="go"`, submit) and "Cancel".
| Dialog (title) | Opened by | Form action | Fields (name) |
|---|---|---|---|
| `#pdfLISLFullLanguage` "LISL Report" | Reports → "LISL Report" | `../core/pdf/lisl.php` | `lang` (L-lang, en), `type` (REQUIRED select: 0 "All", 1 "Shop", 2 "Field"), `blank` checkbox "Weld record", `signature` checkbox "Signature on each page", hidden `project`=1, `id`=1 |
| `#pdfLISLFullLanguageA3` "LISL Report (A3)" | "LISL Report (A3)" | `lisl-a3.php` | `lang`, `type` (as above), `signature` "Signature on each page", `project`, `id` |
| `#pdfLISLFullLanguageWQ` "LISL Report [WQ]", `…WQNEW` "LISL Report [WQ ver 2]", `…GUrev2` "LISL Report [GU Rev 2]", `…GUrev3` "LISL Report [GU Rev 3]" | the matching entries | `lislwq.php`, `lislwqNEW.php`, `lislguVer2.php`, `lislguVer3.php` | `lang`, `project`, `id` |
| `#pdfLISLLanguage` "Blank LISL template" | "Blank LISL template" | `blank-lisl.php` | `lang`, `project`, `id` |
| `#generateLabelsOnMultipleWelds` "Weld card" / `#generateLabelsOnMultipleWelds2` "Weld labels" | "Weld card" / "Weld labels" | `weld-cards.php` / `weld-labels.php` | `filterType` (0 "Include all welds", 3 "Select specific weld(s)" → table with `cb[]` per weld, 19 rows), `project`, `id` (twice) |
| `#pdfIsoBook` "ISO Book" | "ISO Book" | (body loaded by `pdfIsoBook.php?id=…&app=weldpilot`) | none in the capture |
| `#pdfPwhtRequestLanguage` "PWHT request" | printer icon in the Pre-HT/PWHT cell | `../core/pdf/pwht-request.php` | info box (same warning text for PWHT), hidden `selectedIDS`, `project`=1, `sourceProject`=1, `sourceSite`=1; body `#contentPdfPwhtRequestLanguage` loaded by `pdfPwhtRequestLanguage.php?id=…&type=isometrics&project=1` |
| `#pdfNdtRequestLanguageAdditional` "NDT Request" | printer icon in the NDT cell (weld 013) | `ndt-request-additional.php` | info box, hidden `sourcePage`=isometrics, `sourceProject`=1, `weldType`, `welder`, `sourceSite`=1; body `#contentPdfNdtRequestLanguageAdditional` loaded on click |

### Hydrotest link (0003 only)
On 0003 the flow line shows a link "Yes" (`href="#"`, `data-toggle="modal"`, no target id) and "PTC 01". The page holds `#setAsCompleted` ("Hydrotest", text "Set as completed?", hidden `id`, `secureCode`, button "Set" `setAsCompleted`) and `#setAsNotCompleted` ("Set as not completed?", "Set" `setAsNotCompleted`); the capture does not say which one the link opens.

## Rules found in the page's JavaScript
- **Weld list search** (inline script ending the page): a text box above `#datatable3` hides every `tbody` row whose text does not contain the typed text (case-insensitive) and unticks `#checkAll`; clicking `#checkAll` ticks or unticks all visible rows' checkboxes and fires change.
- **Mass-edit button** (script on `#checkAll`'s table): collects the numeric values of ticked row checkboxes into a comma list and writes it to `#t29` (mass edit), `#t29x` (NDT request), `#t29x2` (NDT-Pre request), `#t29xx` (PWHT request); with at least one id the button `#laydownTransportID` loses `disabled` and turns `btn-primary`; otherwise it stays disabled (`btn-dark`). The state is also refreshed on checkbox change/click, table redraw and every 500 ms. A click on the disabled button shows the toast "Selecteer eerst 1 of meer lassen." and does not open the dialog.
- **Modal fallback**: clicks on `#addWeld`, `#addWelds`, `#massEditWeld`, `#changeIsoInProject`, `#editIsometric` openers call `modal('show')` themselves when Bootstrap's handler did not.
- **Sorting**: rows with `.wsapps-weld-sort-row` are jQuery-UI sortable by the handle `.wsapps-weld-drag-handle`; on drop the table gets a "saving" look and POST `updateWeldSorting.php` with `isoId=1` and `order=<weld ids in new order>` is sent; success toast "Order saved", failure toast the server message or "Something went wrong.". The Options entry "Disable welds sorting" posts `toggleSortingEnabled.php` (`isoId`, `enabled` 0/1), flips checkbox and label, toasts, and reloads the page; on error it reverts and shows "Error updating sorting".
- **Page refresh**: `refreshIt()` calls `refreshPage()` after 300 ms (used after NDT/VI actions).
- **Progress card** (`#isoFieldProgressPanel`): clicking a phase title opens it and closes the others. The live model has three phases with drivers (shop: welds, ndt, mtr_pipe_shop, supports_shop, appendages_shop; field: mtr_pipe2, welds, ndt, supports2, appendages2, punch; site: hydro, finish) each with weight, progress 0–1 and scope; in the capture every weight is 0 and the welds driver progress is 1, NDT 0. Phase percentage = weighted average of in-scope drivers; total = average of the three phases weighted by each phase's share ("destruction") when the share is above 0; the total is written to `.wsapps-iso-detail-header .wsapps-iso-status-pct`. Quantity inputs are clamped between 0 and their `max` (or the budget); bar colour green `#5cb85c` at 100 %, orange `#f0ad4e` from 80 %, blue `#337ab7` otherwise; Shop progress needs a budget (> 0) and issued quantity; finish rows: N/A (value 2) is out of scope and shows a grey `#bbb` bar "N/A", Done (1) = 100 %, Open (0) = 0 %; the Site "finish" driver is done count / in-scope count. "Set all to 100%" sets every enabled quantity input to its max (or budget) and every finish select that is not N/A to Done. "Save" POSTs `../core/ajax/save-iso-field-progress.php` with `iso` and the value of every enabled quantity input and finish select (by `name`); success refreshes bars and shows "Field progress saved"; validation codes map to the messages "Value exceeds the MTO budget", "Value exceeds issued/picked quantity", "No MTO budget — add materials with this component code in MTOPilot.", "No issued/picked quantity — progress cannot be entered.", "Invalid value"; other failures "Saving failed". A `.wsapps-ifp-max` handler (set to maximum) exists but no such button is in the capture.
- **Blockers dropdown**: on open the menu is moved to `<body>`, positioned `fixed` under the button, 320 px wide (kept 8 px inside the window); any click on an entry closes it.
- **ITP picker** (`weldpilot-itp-picker.js` plus an inline bootstrap): clicking a `.wsapps-wp-itp-col-link` fills the select from GET `weldpilotItps.php?action=picker_list&scopes=…` (items show "<itp_no> — <title>"; scopes: both slots free → "shop,field,both"; only primary used → "field"; only secondary used → "shop,both") and opens the dialog. "Link ITP" (needs a selection, else toast "Select an ITP first.") writes the id into the primary (`weldpilot_itp_id`) or secondary (`weldpilot_itp_id2`) hidden input by the item's `scope` (field → secondary, both → primary and clears secondary, otherwise primary) and POSTs `weldpilotItps.php` with `action=apply_to_isometric`, `iso_id`, `weldpilot_itp_id`, `weldpilot_itp_id2`; toasts "ITP linked." / "Could not link ITP." / "Could not find isometric ITP panel."
- **Visual inspection hub**: opening selects the tab from `data-vi-tab`; "Filter" value 3 shows the weld picker; the Upload tab shows only the table of the selected report. Upload and Save A/NA require one A or NA tick for each weld; messages: "Each weld must have A (accepted) or NA (not accepted) before upload. Missing: <welds>", "Select at least one weld when "Select specific weld(s)" is active.", "Tick at least one A or NA to save.", "Results saved. Still open: <n>", "Every weld is marked. Upload a PDF now, or finish the report via Digital fill-in.", "Upload failed", "Delete failed", "Failed to prepare VT", "Select at least one report to delete", "Delete selected VT report(s)?" (confirm), "Choose the open report you want to fill in." ("<n> welds still open" per report). Requests: POST `/core/ajax/prepareViDigitalReport.php` (form data + `mode` = pdf or digital; answers `success`, `choose`, `reports`, `pdf_url`, `completion_url`, `reused`, `message`), POST `/core/ajax/clearViPrepareIntent.php` when the dialog closes, POST `/core/ajax/uploadViHubDocuments.php` (files), POST `/core/ajax/saveViHubMarks.php` (a[], na[]), POST `/core/ajax/deleteViHubReports.php` (vtDel[], vtDelUpload[]). All with header `X-Requested-With: XMLHttpRequest` (and a CSRF token when present); after success the isometric page is refreshed.
- **Attachments**: POST `/core/ajax/uploadIsoAttachments.php` (form), POST `/core/ajax/deleteIsoAttachments.php` (`cfDel[]`; with nothing ticked the toast reads "Check for delete"); the response carries `archiveHtml`, `count`; the count is shown as a badge on the "Attachments" menu entry and the red "Delete" button shows only when count > 0. Errors "Upload mislukt" / "Verwijderen mislukt".
- **Tracer details**: GET `getWeldTracerDetail.php` with `tracer_weld_id`; renders the lists described in the dialog section.
- **Edit weld / Add weld** (scripts inside the loaded form): changing Charge number 1 or 2 requests `showMaterialDetailsByChargeNumber.php?id=`, `showMaterialDetailsByChargeNumberDiameter.php?id=` (+ `&field=sizeinch`, `&field=sizeinch2`) and `showMaterialDetailsByChargeNumberOptions.php?weld=<id>&side=1|2&id=`; when the two diameters differ the "default diameter" radio block (`.myDefaultDia`/`.radioHide`) is shown. The material-group check is POST `weld-material-group-check.php` (`chargeNo1`, `chargeNo2`, `wpsNo`) answering `{"warnings":[]}`. Choosing Dia. "x" shows "Length in mm" (Edit weld); "NDT percent" shows only when Dia. is "x" and NDT Req. is ticked. Weld numbers beginning with "E" or "B", or containing "GAP" or "SP", hide weld type, spool, WPS, coatings, welders 1–4, wires, charge number 2 and the process, and reset those values to 0; "GAP" also clears and hides charge number 1; "B" keeps the spool; "SP" shows spool and diameter, hides charge number 1; other numbers show everything. The reason box gates the "Update" button of Edit weld (enabled only when the note has visible text). Fields flagged `alertArea` get a 3 px red left border. Site-setting functions `__wsappsInitWeldFormSiteRules`, `__wsappsApplyWelderMandatoryFields`, `__wsappsIsWelderSelected`, `__wsappsRefreshWeldDiaValidation` decide which fields become mandatory once a welder is chosen (their bodies are in the shared script, not in this capture). Locked weld: all inputs and both save buttons are disabled by script.
- **NDT dialogs**: columns 2–5 show their film/report/date/result block only while their process select is not 0; "NA length" accepts one number (comma becomes dot, other characters dropped); changing a result, defect or NA length triggers (500 ms debounce, and once 800 ms after load when a result is set) POST `core/ajax/ai-ndt-suggest.php` with weld id/no, iso no, diameter, thickness, material, wps, welder, `is_reweld`, `lang`, `ndt_result`, `ndt_process`, `defect_id`, `defect`, `na_length`; the answer fills a hidden "AI Suggesties" panel, which stays hidden on failure or `ai_available:false`. "Restart NDT process" shows the process checkboxes and the confirm text.
- **Audit trail**: GET `ajax-isometric-audit.php?isoId=1&weldId=<0|weld id>`; the weld select reloads the list.
- **Punch dialog**: GET `punchlist.php?id=1&type=isometrics&action=showroom` and `get-punch-warnings.php?iso_id=1` on open.
- **Mass edit**: GET `mass-edit-weld-mandatory.php?ids=<ids>` (returns for each weld `id`, `weldNo`, `welder`, `weldType`, `wpsNo`, `date`, `diameter`, `dialen`, `chargeNo1`, `chargeNo2`), `getAllWelders.php`, `getAllCerts.php?project=1`.
- **Edit isometric**: the ISO number field is validated with pattern `[A-Za-z0-9._-]+` (message above) unless unchanged; template buttons insert fixed bullet lists into the rich-text field in append or replace mode.
- Other requests named in the shared script for this page: `pdfIsoBook.php`, `pdfCertificateIndexAndLISL.php`, `pdfCertificateIndexLanguage.php`, `editIsometric.php?rand=…&id=`, `ajax-table-isometrics-single.php?id=1&project=1…` (and `&deleted=ok`), `ajax-table-isometricsShort.php`, `ajax-refresh-isometrics.php`.

## Sample data
Header and status of the seven captured isometrics (all show Shop prefab 0%, Field 0%, Site 0% and ITPS "0/2"; "NoBo" No; "PED Cat.-Mod" -; Test system -):

| Iso (page `id`) | Rev | Big % / Quality text (tooltip) | Open blockers | Prefab / Field state | Pre-Punch open / finished | Punch open / finished | Hydrotest | X Ray % / PWHT / Piping class / Test pressure |
|---|---|---|---|---|---|---|---|---|
| 0001 (1) | 2.00 | 0% / "Quality 72.7%" (FW 100%) | 20 (1 Release, 8 Welds, 7 NDT, 3 Repair, 1 Punch) | "Prefab not ready" / "Field completed" + Reopen + Create release doc | 1 / 0 (1 overdue; warning "Pre-punch: 1 A/B still need Finished + Akkoord.") | 0 / 0 | "— --" | 14 / Yes / A11011 / 29 |
| 0003 (895) | 0 | 0% / "Quality 0%" (FW 100%) | 16 (13 Welds, 2 NDT, 1 Repair) | "Prefab completed" + Reopen + "Release not available" (tooltip: ITP number is missing — enter it before prefab release.) / "Field completed" + Reopen + "Release not available" (tooltip: ITP 2 is missing — enter it before field release.) | 0 / 0 | 0 / 0 | "Yes", "PTC 01" | - / No / - / - |
| 00022 (6) | 0 | 0% (no quality text; empty tooltip) | 2 (Prefab and Field not released) | "Prefab not ready" / "Field not ready" | 0 / 0 | 0 / 0 | "—" | - / No / - / - |
| 00032 (6191) | 0 | 0% (tooltip FW 100%) | 15 (2 Release, 13 Welds) | "Prefab not ready" / "Field not ready" | 0 / 0 | 0 / 0 | "— --" | - / No / - / - |
| 0005 (6598) | 0 | 0% / "Quality 75%" (WS 82%, FW 100%) | 3 (2 Release, 1 Repair: "Rejection on weld 003, repair 003R1 is still open") | "Prefab not ready" / "Field not ready" | 0 / 0 | 0 / 0 | "—" | - / No / - / - |
| 0007 (15767) | 0 | 0% / "Quality 0%" (WS 96%) | 5 (2 Release, 3 Repair: 003→003R1, 003R1→003R2, 003R2→003R3) | "Prefab not ready" / "Field not ready" | 0 / 0 | 0 / 0 | "—" | - / No / - / - |
| WF-73031-ST_STB000-01 (15424) | 0 | 0% (tooltip WS 10%) | 2 (Prefab and Field not released) | "Prefab not ready" / "Field not ready" | 0 / 0 | 0 / 0 | "—" | - / No / - / - |

Weld counts per isometric (type by the Type column; "NDT Yes" counts the NDT column "Yes" links):

| Iso | Welds | WS | FW | no type "-" | Locked (shop / field) | NDT Yes: accepted | in progress | rejected ReWeld / NA | Yes without result mark | "T" tracer marks | NDT (Pre) Yes | Pre-HT/PWHT Yes (accepted) | On a VI report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0001 | 19 | 4 | 10 | 5 | 0 / 10 | 2 | 3 | 1 / 2 | 5 (13 Yes in all) | 2 | 1 (accepted) | 4 (1) | 1 |
| 0003 | 19 | 5 | 1 | 13 | 5 / 1 | 2 | 1 | 0 / 2 | 0 (5 Yes) | 0 | 0 | 0 | 19 |
| 00022 | 15 | 0 | 0 | 15 | 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 | 1 (0) | 0 |
| 00032 | 19 | 5 | 1 | 13 | 0 / 0 | 0 | 0 | 0 / 0 | 5 (5 Yes) | 0 | 0 | 0 | 0 |
| 0005 | 6 | 5 | 1 | 0 | 0 / 0 | 3 | 0 | 0 / 1 | 0 (4 Yes) | 2 | 0 | 0 | 0 |
| 0007 | 9 | 9 | 0 | 0 | 0 / 0 | 0 | 0 | 1 / 2 | 2 (5 Yes) | 0 | 0 | 0 | 0 |
| WF-73031 | 1 | 1 | 0 | 0 | 0 / 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 | 0 | 0 |

Notes: the Sort column exists only on 0001 and 0007; 0003's weld numbers include "001_1", "001_1R1", "001_2", "001_2R1", "001_3", "E01", "E02"; 0007 has the weld numbers 001, 002, 003, 003R1, 003R2, 003.1, 003.2, 004, 005; 0005 has 001, 002t, 003, 003r1, 004, 333; 00022 has 15 numbered welds 001 to 015 (the first carries a free-text suffix); 00032 repeats the 0003 numbering; WF-73031 has one weld "01". Tooltip of the Type "FW" cell: 0001 "Butt Weld - Field", 0003 "Branch welds- Field"; "WS": "Shop weld".

Every weld row of **0001** (list order; Wdr shows codes only; "Chg" = charge numbers of Material 1 / Material 2; "-" is the displayed dash; NDT cell notation: [E] = link tooltip "Enter NDT Request results", [C] = "Create/Update NDT Request"):

| WN | Type | Wdr | VI | NDT (Pre) | NDT | Pre-HT/PWHT | Chg 1 / 2 | WPS | D | S | Lock / Options |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 001 | WS | ML396, ML670 | --- + file | No | Yes [E] in progress, archive | No | 11111 / 11111 | 11111 | 0,5" | - | unlocked: edit, delete, stamp, checkbox |
| 002 | WS | ML396, ML670 | - | No | Yes [C] ReWeld cross | Yes, printer | 11111 / 11111 | 11111 | 0,5" | - | unlocked |
| 003 | - | ML396, ML670 | - | Yes [E] accepted, Pre archive | Yes [C] accepted | Yes, printer | 11111 / 11111 | 11111 | 0,5" | - | unlocked |
| 004 | FW | ML396 | - | No | Yes [C] T | No | 11111 / 11111 | 11111 | 0,5" | SP01 | field-locked (lock icon, disabled checkbox) |
| 005 | - | ML396 | - | No | Yes [C] NA cross | Yes, printer | 11111 / 11111 | 11111 | 10" | - | unlocked |
| 005A | WS | ML396 | - | No | Yes [C] accepted | No | 11111 / 11111 | 11111 | 10" | - | unlocked |
| 006 | FW | ML396 | - | No | Yes [E] archive | No | 11111 / 11111 | 11111 | 10" | - | field-locked |
| 007 | FW | ML396 | - | No | No | Yes accepted, PWHT archive | 11111 / 564321 (Material 2 `1"/40/7.2/-/Cap`) | 11111 | 10" | - | field-locked |
| 008 | FW | ML396 | - | No | No | No | 11111 / 11111 | 11111 | 10" | - | field-locked |
| 009 | - | ML396 | - | No | No | No | - / - | 11111 | 10" | - | unlocked |
| 010 | FW | ML396 | - | No | Yes [C] NA cross, T | No | 11111 / 11111 | 11111 | 10" | - | field-locked |
| 010R1 | FW | ML396 | - | No | Yes [E] in progress, archive | No | 11111 / 11111 | 11111 | 0,5" | - | field-locked |
| 010R2 | FW | ML396 | - | No | No | No | - / - | 11111 | - | - | field-locked |
| 011 | - | ML396 | - | No | Yes [C] | No | - / - | 11111 | 10" | - | unlocked |
| 012 | FW | ML396 | - | No | Yes [C] | No | 11111 / 11111 | 11111 | 10" | - | field-locked |
| 013 | FW | ML396 | - | No | Yes [E] in progress, archive, printer | No | 11111 / 11111 | 11111 | 0,5" | - | field-locked |
| 014 | WS | ML396 | - | No | Yes [C] | No | ada (index 0002, `0/1/2/A105/ WN OR Fl`) / 11111 | 11111 | 0,5" | - | unlocked |
| 015 | - | ------ | - | No | No | No | "EXISTING" / "EXISTING" (shown in the Material cells) | - | - | - | unlocked |
| 016 | FW | W01 | - | No | No | No | 11111 / 11111 | 11111 | 0,5" | - | field-locked |

Material 1 and 2 text for charge 11111 is `1/2"/40/7,2/A106 Gr B/Pipe` with Idx 0001; Material 2 of 007 is Idx 0003 `1"/40/7.2/-/Cap`.

Every weld row of **0003** (no Sort column; all rows have the VI "---" + file icon → `visual-inspection-v2.php?report_id=11&project=1&id=895`; NDT (Pre) and Pre-HT/PWHT are "No" on every row):

| WN | Type | Wdr | NDT | Chg 1 / 2 | WPS | D | S | Lock / Options |
|---|---|---|---|---|---|---|---|---|
| 001_1 | WS | ML396 | Yes [E] NA cross, archive | 1212 / 1212 (Idx 0005 `48"/40/19/A106 Gr B/Pipe`) | 11111 | 48" | J | shop-locked |
| 001_1R1 | WS | ML396 | Yes [E] accepted, archive | 1212 / 1212 | 11111 | 48" | - | shop-locked |
| 001_2 | WS | ML396 | Yes [E] NA cross, archive | 1212 / 1212 | 11111 | 48" | - | shop-locked |
| 001_2R1 | WS | ML396 | Yes [E] accepted, archive | 1212 / 1212 | 11111 | 48" | - | shop-locked |
| 001_3 | WS | ML396 | No | 1212 / 1212 | 11111 | 48" | - | shop-locked |
| 004 | FW | ML396, W04 | Yes [E] in progress, archive | 564321 (Idx 0003 `1"/40/7.2/-/Cap`) / - (Material 2 "4 / Flange") | 11111 | 1" | - | field-locked |
| 005 – 015 (eleven rows 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015) | - | ML396 | No | - / - | - | 48" | - | unlocked: edit, delete, stamp, checkbox |
| E01 | - | ML396 | No | 98784987 (Idx 0004 `1/2"/NA/2/A234 Gr WPB/ WN OR Fl`) / - | - | - | - | unlocked |
| E02 | - | ML396 | No | ada (Idx 0002 `0/1/2/A105/ WN OR Fl`) / - | - | - | - | unlocked |

## Not in the capture
- Body of "Change ISO" (`#changeIsoInProject`, breadcrumb "0001"): header, "Go" and "Cancel" only; the isometric choice is loaded on click.
- Body of "ISO Book" (`#pdfIsoBook`), the language/content blocks `#contentPdfPwhtRequestLanguage` and `#contentPdfNdtRequestLanguageAdditional` (filled by request after the printer icon is clicked), and the weld-selection content of `#pdfNdtRequestLanguage` etc. beyond what is listed.
- Which dialog the Hydrotest "Yes" link on 0003 opens (`href="#"`).
- Deleted welds: the `showdeleted=ok` view of 0001 has no rows, so the row layout of deleted welds and the control that opens `#backWeld` are not shown.
- Any weld whose diameter is set as "Length in mm" (no such weld on 0001; the "Length in mm" input stays hidden in Add weld); Edit weld of such a weld.
- The "Prefab complete" and "Field complete" buttons of the Status card (neither is shown on 0001/0003 because both phases are already completed or not ready); the dialogs exist (`#confirmPrefabComplete`, `#confirmFieldComplete`).
- Result of every save/submit (Add, Update, Delete, Upload, Save, Reopen, Create release doc, Finish + Sign-off): nothing was submitted.
- The "Start scanner" camera view; Quill toolbar behaviour; the "Previous edits" body for other welds; shared script bodies (`__wsappsInitWeldFormSiteRules` etc.).
- Bodies of the NDT dialog's tracer proposal list (`#ndtTracerProposalBody`, filled on NA) and of the "AI Suggesties" panel.
- Colours, hover states and which welds show a red pencil are known only from the browser-pass notes.

Also present in the page, opened from elsewhere (not by a control of this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, addProject, editProject, pdfCertificateIndexLanguage, deleteProject, backProject, importProjects, importFull, deleteAllIso, deleteSelectedIso, pdfMTOReportLanguageList, pdfESTReportLanguageList, returnMaterialByRevision, changeQuantityByRevision, pdfIsoBookMultiple, pdfIsoBookMultipleGroup, pdfIsoBookEst, importMaterialInISO, importIsometrics, deleteMaterialISOimport, deleteMaterialISO, editMaterialISO, editMaterialISOimport, addReceivedMaterial, setCalculationAsFinished, setCalculationAsNotFinished, setPunch, uploadNDTonMultipleWelds, uploadNDTonMultipleWeldsPre, generateLabelsOnMultipleWeldsProject, generateLabelsOnMultipleWelds2Project, showOrderDetails, showOrderAuditTrail, pdfNdtRequestLanguage, pdfNdtPreRequestLanguageAdditional, pdfNdtRequestLanguageMass, pdfNdtRequestLanguagePre, pdfNdtRequestLanguagePreMass, addIsometric, editIsometricMass, addRevItp, addRevItp2, showRevItp, showRevItp2, backIsometric, deleteIsometric, editCalculation, deleteCalculation, importCalculationsFromIso, importCalculationsFromIsoProject, removeLastCalculations, markPunchAsRemoved, setCheckedMaterialsTypeModal, deleteCheckedMaterialsModal, setStatus, statusLog, showIsometric, punchlistEdit, showQuantityLog, materialStatusByRevision, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, copyIsometrics, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
