# Weld Pilot → User menu → User Manuals

Source: `weld__user__user-manuals.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=user-manuals&doc=weldpilot-manual`.
State of the page for the observing account: normal. (Opened from the user menu item "User Manuals"; from the browser-pass notes: the user menu holds the project-site select2, language links shown on small screens, "User Manuals" and "Logout"; nothing was clicked inside it.)

## Page
- Browser title: "User Manuals - WeldPilot®". Breadcrumb: one active crumb "User Manuals" → `index.php?page=user-manuals`.
- No tabs, no buttons above the content. The content area (`#content`, class `wsapps-manuals-page`) has a left list headed "Choose a manual" and, next to it, the text of the chosen manual.
- The chosen manual is selected by the query parameter `doc=`. The item whose manual is shown carries class `is-active` (here WeldPilot).
- The page text starts with H1 "WeldPilot — End-User Manual" and a line: product WeldPilot® (Welding QA/QC); audience QA/QC engineers, welding coordinators/supervisors, welders/field, administrators; language English; version July 2026. Ends with the line "© WeldPilot / WS Apps — For authorised users only."
- Screenshots in the manual are `IMG` elements loaded from `/core/ajax/user-manual-asset.php?path=screenshots%2Fweldpilot%2F<file>.png`; each has a caption (e.g. "WeldPilot dashboard").
- Language links (NL / EN / DE / FR) in the header re-open this page as `index.php?lang=xx&page=user-manuals&id=&project=&projectSite=`; the manual text stays English in the capture.

## List
There is no table. The list of manuals ("Choose a manual") has 8 links, in this order. Each opens `index.php?page=user-manuals&doc=<doc>`:

| # | Label (exact) | `doc=` |
|---|---|---|
| 1 | WeldPilot — End-User Manual | `weldpilot-manual` (active in the capture) |
| 2 | CivilPilot — End-User Manual | `civilpilot-manual` |
| 3 | ESTPilot — End-User Manual | `estpilot-manual` |
| 4 | ISO Annotatie — End-User Manual | `iso-annotatie-manual` |
| 5 | ManagementHub — End-User Manual | `managementhub-manual` |
| 6 | MTOPilot — End-User Manual | `mtopilot-manual` |
| 7 | Version Comparison Report | `version-comparison-manual` |
| 8 | WPS Designer — End-User Manual | `wps-manual` |

The page lists the same 8 manuals whatever the pilot. Only the WeldPilot manual is in this capture; the other seven are not (see "Not in the capture").

## Dialogs
None opened by this page. (The manual text itself mentions dialogs of other pages; those belong to their own notes.)

## Rules found in the page's JavaScript
Nothing specific to this page found in the capture. Request made while loading: `/core/ajax/ajax-notifications.php?action=count_unread` (the header notification counter). The page's script list is the shared one (SAME-AS the dashboard capture) plus `jquery-1.12.4.js`, `toastr.js`, `jsqr.min.js`.

## Sample data
### Table of contents of the WeldPilot manual (31 chapters, anchors `#1-introduction` … )
1 Introduction · 2 Getting Started · 3 Dashboard · 4 Overview - Iso · 5 Daily Reporting · 6 Handheld & Weld Scan · 7 Project Sites & Projects · 8 Companies & ISO Docs · 9 Welders (Personnel) · 10 Roles, Certificates & Customs · 11 PQR & WPS Methods · 12 WPS Designer · 13 Weld Type, Coating & Spools · 14 Rapport Generator (Form Designer & Templates) · 15 Material Data · 16 NDT Data (Processes, Groups, Locations, PWHT) · 17 Isometrics List · 18 ITPs · 19 Isometric Detail — Welds · 20 NDT / PWHT Management · 21 NDT Batch Import · 22 Test Engineers & Export Welds · 23 Releases — Finished ISOs, FWP, Hydrotest · 24 Punch Lists · 25 Flange Management · 26 System — Users, Profiles, Signatures · 27 Common Workflows · 28 Error Messages and Validation · 29 Best Practices · 30 Frequently Asked Questions · 31 Document History.
(The contents list shows chapters 1–30 as links; chapter 31 "Document History" is the last heading of the text.)

### Chapters, sections and the rules each states (own words)

**1. Introduction** — sections: Key concepts, Key functionality, User roles.
- Everything is bound to a project site. Concepts defined: ISO, spool (column S), NDT/NDO, PWHT/Pre-HT, PQR, WPS, ITP/KNR (inspection rule with an NDT %), FWP, hydrotest, punch list (pre-punch then punch), flange record.
- Tracer: a weld required after a rejected weld; at most 2 tracers per rejected weld.
- Four typical roles: QA/QC engineer (NDT/PWHT, compliance, releases), welding coordinator/supervisor (dashboard, ITP, weld registration, master data), welder/field (handheld scan, add punch), administrator (users, profiles, settings, master data).

**2. Getting Started** — 2.1 Log in; 2.2 Choose a project site; 2.3 Header / top bar; 2.4 Enable dark mode; 2.5 Weak password banner; 2.6 Navigation overview; 2.7 Permissions; 2.8 First-login checklist.
- Without the WeldPilot application right on the user, a "no permission" alert shows.
- With no site chosen, a chooser dialog opens that cannot be closed without choosing; the active site is a badge by the logo; switching site reloads and syncs all pilots.
- Menu items without rights are greyed out and lead to a no-rights page.
- Six permission flags per page and profile: Show (s), Insert (i), Edit (e), Delete (d), Import/commit (m), Print (p).
- A red weak-password banner appears on every page when password quality is low.
- Header holds: site badge, app-tile switch, language (NL/EN/DE), certificate/file expiry warnings, notification bell (Transfer Orders, PDF jobs, storehouse orders), theme toggle, user menu.

**3. Dashboard** — Screen overview, KPI cards, View toggle, Filter panel, Action buttons, Reports dropdown, Inspection compliance panel, ITP/KNR Manager, user instructions (filter; welder report; sync legacy ITP/KNR; manage definitions).
- KPIs: Projects, Isometrics, Total weld length / Total welds (view toggle: Number of welds / Welds length), Welded, Examined %, Repaired, Repair rate, Repair performance (actual vs Limit, default 5 %, alert when over).
- Repair rate by number = repaired welds divided by welded welds; welds without a welder excluded; "examined" = welds with an NDT result. By length = repaired length divided by examined length.
- Filters: From/To date (dd.mm.yyyy), Company, Weld type (All/Shop/Field), Intern prj. no., Welder, ITP/KNR, Piping class, IRN (typed search, list not preloaded), PED cat.-mod, Material, NDT process group, NDT process, WPS method. Project, welder, NDT group and WPS method accept several values; empty means all. Buttons Filter, Reset, Reports.
- Reports: Welder report (and all-sites variant when a welder is picked), Welder tracking advanced, WDI tracking, WDI tracking V2, Welder tracking – With tracer, – NDT tracking, Open welds, Revisions report, Tracer report, Project book (only with a project selected). Report language is chosen in a dialog; PDFs announce completion by notification.
- Compliance panel: per group (welder + WPS + ITP/KNR) Total, Required, Examinated, Selected, Remaining, progress bars, defect block (welds, examined, exam %, rejected, reject %, tracers, tracer status). Refreshes every 180 s; 50 cards per page, non-compliant first; filter Not compliant / Compliant / All.
- ITP/KNR Manager: central catalog (Code, NDT %, Usage, Status); manual "Sync legacy ITP's" imports codes from isometrics; codes without a single legacy NDT % keep a fallback of 10 %; definitions can be added, edited, archived (links on isometrics keep their value) and restored.

**4. Overview - Iso** — Filter, Phase columns, 4.1 Iso overview (Project search), instructions (find ISOs in a phase; open a project's list; set an ITP for several isometrics; delete selected isometrics).
- Kanban columns by phase: no status set, prefab_materials (Materials MTO), prefab_est (Estimate EST), prefab_doc (Isometric formatted), prefab_welds (Welds defined WP), field_doc, field_test, field_release, prep_finished (Work preparation 100%).
- Bulk "Set ITP" exists only on the project isometric list, not the site-wide list. A Shop or Shop+Field ITP fills the first ITP slot; a Field ITP fills slot 2 when a shop ITP is already set.
- Deleting an isometric is refused while it has welds; further refusal reasons: materials in MTOPilot, reserved materials, calculations, or an isometric already started.

**5. Daily Reporting** — Field reference (Add recipient), Recipients table, instructions.
- Scheduled e-mail reports per site: "Daily weld report" and/or "Welders expire warning report"; "All reports" sends both (no second row for the same type and address).
- Fields: Report, Email, Time Hour (00–23), Time Min (00 or 30), Monday–Sunday ticks. Table columns Email, Report, Time, Mon–Sun (tick/cross), Options (edit, delete).

**6. Handheld & Weld Scan** — Two entry points, Weld Scan dialog, instructions (scan a weld; add a punch by scanning).
- Entries "Scan weld" and "Add punch"; on mobile a floating button replaces the sidebar group.
- QR types: welder card, weld label, ISO book cover. A weld QR opens the edit view with a short field set (weld number, type, welder, WPS, date, diameter, two charges) and an "All fields" switch; an ISO QR first lists the welds.
- Punch by scan fills project and isometric; types A (immediate fix, blocking), B, C, D.

**7. Project Sites & Projects** — 7.1 Project sites list, site settings, Iso progress weights, ISO Book, edit/duplicate site; 7.2 Projects (per site).
- Site settings: "Mandatory fields" (with a welder chosen, Weld type, WPS number, Weld Date, Dia., Charge number 1 and 2 become required); "Validation on WPS" (welder lists stay disabled until a WPS is chosen; only qualified welders/matching charges); "Project-specific Material Certificates" (charge lists limited to certificates linked to the project).
- Iso progress weights: Phase = Shop + Field + Site = 100 %; Shop (welds, NDT, pipe, supports, appendages), Field (pipe, welds, NDT, supports, appendages, punch) each total 100 %; Site (hydrotest, paint/tracing) totals 100 % when Site phase > 0. Save is rejected if an active column is not 100 %. NDT measurement: inch-weighted or per weld; a reject does not count as done. Shop quantity ceiling = Shop-typed issued / Shop MTO; field uses the whole ISO. Weight changes are stored as versions from today.
- Duplicate site copies chosen site settings and activated lists (NDT process, weld types, WPS methods, welders, memo templates, daily reporting, spools …); projects, isometrics and welds are not copied; the copy name gets " (Copy)".
- Row-count menu choice is remembered across lists; on Project sites the highest value is 500.
- Projects: columns Intern number, Description, Status %; Options (delete selected, mass edit, project books, show deleted, fill IRN); import wizard; with "Auto IRN numbers" on, an empty IRN cell gets the next site IRN; mass edit keeps a value when its field is left empty.

**8. Companies & ISO Docs** — 8.1 Companies, 8.2 ISO docs.
- Company: Name, Address, Phone, Email. ISO doc types are per site; standard documents are locked (name editable only), own documents can be deleted.

**9. Welders (Personnel)** — Status tabs, Columns, Row actions, Top bar actions, Add Welder fields, instructions.
- Tabs Active / Inactive / Deleted with counts. Columns: ID nr., Name, Company, Role, Customs, Active on projects, Currently on, Note, Active, Options.
- Row icons: profile, edit, certificates and files, welder card, delete, deactivate. Top bar: + Add Welder, Export, Print, Weldercard settings.
- Add Welder fields: ID nr., Name, Welder ID Nr., Address, Zip code, Residence, Phone, Email address, Active, Company, Welder 1 / Welder 2, Date of birth, Currently on, Photo, Active on projects, Globally deployable, Combination.
- Expiring/expired certificates feed the header warning triangle. Welder card: choose Welding wire, Weld process, Diameter, Thickness, BW/FW, Pos, ASME/EN, WQ No., then Add and Print.

**10. Roles, Certificates & Customs** — 10.1 Roles, 10.2 Certificates, 10.3 Customs.
- Roles and Certificates: Name and Abbr (both required for certificates); certificate delete only when unassigned; certificate import wizard.
- Customs: Name and Abbr accept letters, numbers and symbols such as < Ø /; code/HTML refused; diameter and wall-thickness from/to stay numeric.

**11. PQR & WPS Methods** — 11.1 PQR (find, add fields, add, import), 11.2 WPS Methods.
- PQR columns have per-column Search fields. Core fields listed: Material EN15608, PQR, Insp Authority No., Report No., Material, Filler Material, Pipe/Plate, t, Position, processes (ASME/EN), groove type, shielding gas, EN and ASME IX group/diameter/thickness, preheat, annealing, impact/hardness/macro tests, Standard, Comments, Valid until, File.
- PQR import: PQR number required; an existing PQR number is updated and keeps its PDF; "Valid until" accepts dd-mm-yyyy or yyyy-mm-dd; rows with errors can be set to skip.
- WPS method fields: WPS Number, Weld process, Definition, Joint type, Project(s), PQR; four optional group lists (ISO groups, allowed dissimilar ISO pairs, same for ASME). Empty is allowed and never blocks; Edit weld only warns when charge groups fall outside the WPS, and still saves. Groups are also set on Material data → Type of material and inherited by certificates.

**12. WPS Designer** — list columns, top bar actions, pointer to the separate WPS manual.
- Statuses Draft / Review / Approved; list columns WPS Number, Revision, Project, Status, Created By, dates, Options. Editor tabs named: General, Material, Technique, Consumables, Parameters, Groove, Links, Approvals, History; approvals use digital signatures. An approved Designer WPS copies its groups onto the WPS method. Enabled by an administrator in System settings.

**13. Weld Type, Coating & Spools** — 13.1–13.3.
- Coating 1/2 in Add weld; Edit weld adds Coating weld (same list) and Sleeve (separate sleeve list on the same page). Coatings in use stay on welds when edited/deleted.
- Spools group welds on an isometric (field Spool, column S). The "Weld process" menu item is hidden (superseded by WPS Designer / WPS methods).
- A flange "preview proposals" validation exists only in development/test databases, changes no master data and is not for production.

**14. Rapport Generator** — 14.1 Form Designer, 14.2 My Templates.
- Drag-and-drop designer for VI/QA report forms; save, then publish before use on isometrics. A PDF background can be read to detect empty lines and name them from WeldPilot data (ISO no., weld no., WPS, welder, drawing, line); values are prefilled when opened on an isometric. Template list columns: Name, Description, Created by, Format, Created at, Public, Options.

**15. Material Data** — 15.1 Certifications, 15.2 Welding wire; page table of Weld diameters, Material part, Type material, Material supplier.
- Add certification validated fields: Material, Charge number, Schedule, Wall thickness, Certificate type; Dia., Material part, Type of material enforced in controlled mode. Controlled and Accepted are flags (green tick / red cross).
- With "Mandatory fields" on, charge dropdowns in the weld form list only certificates that are both Controlled and Accepted; others show a refusal message; one already saved on the weld stays selectable.
- Export to ZIP and Import for certifications; welding wire fields Rod type, Type material, Norm, Certificate type, Supplier, Project, Controlled, Accepted, Note, File.

**16. NDT Data** — processes, groups, locations, PWHT processes/locations, defect codes.
- Routes named: `/ndt-process-groups/`, `/ndt-process/`, `/ndt-location/`, `/pwht-process/`, `/pwht-location/`, `/ndt-defects/`.
- Defect codes per norm (ISO 6520-1, ASME B31.3, API 1104) are switched on/off per site; "Activate selected" needs ticked rows; standard codes are locked; a code already on a weld stays available there. Project field "Defect norm" turns a norm's list on for every project on the site; when the ITP matrix is on and the ITP profile has a norm, the profile decides.

**17. Isometrics List** — KPI bar, Columns, Column filters, Top bar actions, instructions.
- KPI cards (click to filter): Total Isometrics, NDT Approved %, PWHT Approved %, Prefab Complete %, Field Complete %, Documentation %.
- Columns: Project, ISO No (short), IRN, ITP No, ITP No 2, P.Class, No Bo, PWHT, M, E, W, Pfb, Fld, Doc., Prio., Opts. Buttons: Refresh data (rebuilds cached snapshot), Filter, + Add material, Import. M/E/W open the three pilots.

**18. ITPs** — columns, scope behaviour, Add ITP fields, add/revise/edit/delete/import, link to an isometric, ITP matrix.
- Columns: ITP No, Title, Scope, X Ray %, Latest Rev, Isometrics, Active, Options (Edit, Revisions, Delete).
- Scope: Shop fills ITP slot 1; Field fills slot 2 when a shop ITP is present; Shop+Field fills slot 1 and hides slot 2.
- Add fields: ITP No*, Title, Description, Scope, X-Ray %, Revision number*, PDF*, Comment; edit adds Sort order and Active. New revision keeps older ones and becomes the active one copied to linked isometrics. Changing X-Ray % syncs linked isometrics.
- An ITP with linked isometrics cannot be deleted (unlink or set inactive). "Import from isometrics" is a one-time migration action per site.
- ITP matrix (needs a system setting plus a site setting): profile EN 13480 or Blank; allowed party codes P, H, W, R, S, P/R, P/H, R/W, W*, H*; states draft → Internal review → For approval → released; line 1 is the gate; releasing needs a different user (exception: sole administrator with ITP edit); released matrix is not editable (next change = new draft revision); a hold on line 6 or 9 blocks prefab/field release of that weld, on line 14 or 15 blocks hydrotest release of that test system.

**19. Isometric Detail — Welds** — header panels, blocking list, field progress, Prefab/Field complete, toolbar, WELDS table, visual inspection, row actions, NDT inline, audit trail, Add weld, Add welds (bulk), Edit weld, Mass edit, NDT result, PWHT result, Tracer detail, Stamp, Edit isometric, Material status per revision.
- Header panels: Identification, ITPs, Compliance (NoBo, PED category, X-Ray %), Technical (piping class, PWHT, test pressure, test system), Field progress (MTO), Status (progress %, prefab/field completed, pre-punch, punch, hydrotest).
- Prefab complete is available when shop welds are welded and NDT-complete where required (also available with no shop welds); Field complete only after Prefab complete; reopening needs weld edit rights, and after a release document only a supervisor may reopen (reason required).
- Field progress: installed pipe/supports/appendages cannot exceed the MTO budget (nor issued/picked); Paint, Tracing, Insulation each Open / Done / N/A (default N/A); all three N/A moves their site weight to Hydrotest.
- Weld columns: WN, Type, Wdr (welders 1–4), VI-short (A green, NA red), NDO (Pre), NDO, Pre-HT/PWHT, Index/type, Charge, Material 1 and 2, WPS, D, S, Options, checkbox. Edit icon turns red when an NDT/PWHT report exists (editing restricted).
- Add weld fields: Weld no. (always required); Weld type, WPS number, Weld Date, Dia., Charge number 1 and 2 required under "Mandatory fields" once a welder is chosen; Welder 1–4, Coating 1/2, Welding wire 1/2, Pos 1/2, Fitup date, Spool, NDT Req. Pre, NDT Req., Pre-WHT, PWHT Req., Repair, Tracer. Weld Date defaults to today on add, not on edit. Dia. must match the diameter carried by the charges; if the two charges differ, a default diameter is chosen with a radio option (always checked).
- Edit-only fields: Coating weld, KR, FP, Sleeve, Ins. length 1/2, NDT percent (0–100, shown when Dia. is x and NDT Req. ticked); "Upd. prev. weld" / "Upd. next weld" copy charge, coating and insulation length to the neighbour weld.
- Bulk add: Weld no. Start/End plus shared type, welders, WPS, Dia., Spool and requirements. Mass edit changes only ticked fields; empty dates keep, "Clear date" removes; with a welder set, missing type/WPS/date/Dia. on any selected weld stays required.
- NDT result: Result A / NA, Film No., Report No., NDT Date, PDF, defect type/location/length/remark when NA; "Restart NDT process" clears the stored result of the ticked process only. PWHT result: Pass/Fail, Report No., Date, Soak time/Temp, PDF.
- Visual inspection: a weld belongs to one VI report; mark A/NA per weld, then upload the PDF or finish the digital form once every weld on the report is marked.
- Audit trail records weld changes, delivery/phase actions with reopen reason, revisions, release documents, plus MTOPilot/ESTPilot changes; entries show date, user, source app, field, old → new.
- A delete of selected welds leaves shop welds that are locked after Prefab complete. Edit isometric: ITP Shop/Field pickers, X-Ray % read-only (from ITP), Test system read-only; copy welds/materials/calculations from another ISO.

**20. NDT / PWHT Management** — Tabs, Top bar actions, Open-welds tabs, instructions.
- Tabs: NDT (`ndt-requests`), NDT archive PRE (`open-ndt-pre-welds`), NDT archive (`open-ndt-welds`), NDT request archive, PWHT request manager (`pwht-requests`), PWHT archive, PWHT request archive. Actions: Generate Mass NDT request (PRE and post), Search. Open-welds tables refresh every 180 s.
- A mass request needs ticked welds with an open NDT process; request numbers are R-prefixed; "NDT R/Nr." column shows several numbers comma-separated. Request PDF language is chosen in a dialog.

**21. NDT Batch Import** — two tabs.
- Via file (template → upload → preview → Lookup for unmatched welds → Commit; requires the Import/commit right "m"). An NA row is saved only with NaLength, DefectType and Welder filled.
- Via request number: NDT-Pre / NDT toggle, NDT Request No., Search welds (only welds of that request on the current site, grouped per ISO, only the requested processes), Welder ID (up to four, comma-separated), Report No. and PDF per ISO, Commit import.

**22. Test Engineers & Export Welds** — 22.1, 22.2.
- Only active test engineers can be assigned to releases; bulk Activate/Deactivate selected.
- Export welds: single project or All projects; codes GAP, SP, E, B stay out of the Excel file unless ticked (All ticks all four); runs in the background, only new/changed welds rebuilt.

**23. Releases — Finished ISOs, FWP, Hydrotest** — 23.1–23.4.
- Prefab release (`isometrics-finished`) and Field release (`isometrics-finished-field`): Filter, Make release doc, Release archive, Upload release results.
- FWP list: FWP No, Description, Project, Status (Draft/Released), Options; detail: Project, ISO, Spool, PWHT, Chemical clean, No of services; assign ISOs via Check + Assign Iso to FWP + Field package + Confirm.
- Hydrotest: tabs Test systems and Spools; test system fields Test system, Description, accepted by client (Not set / Approved / Testing not applicable); release modal fields (QA/QC engineer, test record no., equipment, piping class, design code, medium, required/actual test pressure, date, start/end, area temperature, duration, leak test pressure and duration, included isometrics). A spool can be moved to a test system or off it.

**24. Punch Lists** — KPI cards, Statuses, Filters, Columns, Top bar actions, Punch dialog, Report passed, Sign-off, instructions.
- Cards: Open, Pre-punch (open), Punch (open), Te laat, Deadline 7 dgn, Finished, Passed, Removed.
- Statuses: Open; Finished (work done); Passed only when the item is Finished and has Akkoord and every A/B item of that phase (Pre-punch or Punch) is Finished and Akkoord. A and B block the phase, C and D do not. Punch can be Passed only after Pre-punch A/B are passed (or moved to Punch); with no pre-punch items Punch can pass. After Punch is Passed no items can be added, except by a Full access account (Punch only, not Pre-punch).
- Types A (immediate fix, blocking), B, C, D; item fields: input mode Scan/Manual, Project, ISO, Type, photo and/or file, Description, Due date, Contractor, Reported date/by, Pre-Punch/Punch. Promote pre-punch by changing its type to Punch.
- Sign-off: signed by Client/User/Inspection, client name, company, function, inspector, date, remarks, method (draw / upload PDF / upload signed PDF); signed items become Finished and Akkoord.

**25. Flange Management** — top bar, columns, row actions, Add Flange fields, add/import/filter/export/report/QR label, joint assembly record.
- Columns: Selection, Options, Project, ISO No, Flange ID, Line Number, Flange Size / Rating, Gasket Type, Target torque, Criticality, Status. Row actions: View, Edit, Documents, Delete (with delete right).
- Field groups: project/ISO (required), identification, planning/status (incl. Finished?), torque data (wrench, passes in Nm, target moment, target stress, max. deviation, lubricant), flange and bolting, operating conditions.
- Assembly record: passes and bolts are compared server-side with target torque, target stress and max. deviation; a failed bolt needs a deviation reference and reason; bolt number must be within the master stud count; a leak test with result Passed is required for the release gate; two signatures (executor, then QA/QC or customer QA/QC) are required; PDF is generated only after QA/QC sign-off and is immutable (hash checked on every open); QR scans only find flanges of the active site and are audited; master data is never changed by the record. Procedure number is set in the site's Document settings.

**26. System — Users, Profiles, Signatures** — 26.1–26.4.
- User accounts need application permission (WeldPilot = 1); profiles grant per-page flags s/i/e/d/m/p; signatures (full and initials) are offered at approvals and punch sign-off; Change password, Change theme, Edit company data and System settings (administrator only; enables WPS Designer, ISO progress, auto IRN, login methods, applications).

**27. Common Workflows** — 27.1 Register welds on a new ISO; 27.2 Request and process NDT; 27.3 Process PWHT; 27.4 Create a hydrotest release; 27.5 Manage punch lists to release; 27.6 Add and track flanges; 27.7 Handheld weld scan; 27.8 Deploy a WPS to a project; 27.9 Monitor compliance via the dashboard.
- Release order stated: ISOs finished (prefab/field) and punches resolved before a hydrotest release; pre-punch promoted to punch then signed off before release.

**28. Error Messages and Validation** — table of 14 situations (message, cause, resolution): no permission, no rights (page), choose project site, greyed menu item, red Edit icon, cannot delete weld (referenced by reports), NDT batch commit failed (missing right m or unmatched welds), validation on add weld, Dia./charge mismatch, welder dropdown disabled, charge number filtered out, Compliance NOT COMPLIANT (required examination greater than examined), PDF generation failed, weak password banner.

**29. Best Practices** — one list: choose the site first; set NDT/PWHT requirements when adding welds; use mass NDT requests; enter NDT results from the weld cells; resolve pre-punches before release; shop welds stay locked after shop release; tracers for rejected welds (max 2); keep master data before bulk entry; WPS in WPS Designer; handheld scan; refresh isometrics list after bulk import; profiles per site for role-3 users; store signatures; watch the expiry triangle.

**30. Frequently Asked Questions** — 15 question lines; two (shop weld edit after release; clean URLs) have no answer text in the capture. Answers repeat the rules above (tracer max 2 per reject, NOT COMPLIANT meaning, tablet FAB).

**31. Document History** — 16 dated rows, July 2026 to November 2026 (initial release, then feature notes such as field progress panel, site phase, ITP/KNR manager, certification columns, restart NDT process, defect codes, edit-weld scrolling, row-count memory, Upd. prev./next weld diameter).

## Not in the capture
- The text of the seven other manuals (CivilPilot, ESTPilot, ISO Annotatie, ManagementHub, MTOPilot, Version Comparison Report, WPS Designer): each link `index.php?page=user-manuals&doc=<doc>` would show it.
- The screenshots (`user-manual-asset.php?path=screenshots/weldpilot/*.png`); only alt texts and captions are captured.
- Full text of a few long manual paragraphs was cut where the capture was shortened by me while reading (flange assembly record end, ITP/KNR sync toast details, handheld edit view details); the list above covers what was read.
- The user menu itself (the control that opens this page) was not clicked in any capture.

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin` (System settings), `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, and further shared dialogs of the page shell.
