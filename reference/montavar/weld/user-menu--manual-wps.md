# WeldPilot → User menu → User Manuals → WPS Designer — End-User Manual

Source: `weld__user__manual-wps.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=user-manuals&doc=wps-manual`.
State of the page for the observing account: normal.

No capture named `weld__user__manual-wps__*` exists, and the browser-pass notes (`_interactive/*.md`) say nothing about this page. The only related remark there (from the browser-pass notes of the admin dashboard) is that the user menu in the top bar has an entry "User Manuals"; nothing in it was clicked.

## Page
- Browser title: `User Manuals - WeldPilot®`. Breadcrumb: a single active crumb "User Manuals" → `index.php?page=user-manuals`.
- The content container is `#content.wsapps-manuals-page`. It holds a manuals navigation (the same 17 lines as on the manuals index capture `weld__user__user-manuals`, so only a reference is written here) and then one manual document.
- The navigation is a list of links of the form `index.php?page=user-manuals&doc=<doc>`. Entries visible in the shared navigation (labels as written): "WeldPilot — End-User Manual" (`weldpilot-manual`), "CivilPilot — End-User Manual", "ESTPilot — End-User Manual", "ISO Annotatie — End-User Manual", "ManagementHub — End-User Manual", "MTOPilot — End-User Manual", "Version Comparison Report", "WPS Designer — End-User Manual" (`wps-manual`, the entry of this page). This page's capture does not repeat the navigation (its block is `LINEDIFF new=0`); on the index capture the active entry is the WeldPilot manual.
- There are no tabs and no buttons above the content. No form, input, select or table with a DataTables configuration exists in the document area.
- Images in the manual are served by `/core/ajax/user-manual-asset.php?path=screenshots/<file>.png` (about 34 screenshots; the document history says 34). Each has a caption. A few table cells are links to the screenshot of a source-data tab.
- Document header: H1 "WPS Designer — End-User Manual"; meta line: product WeldPilot® WPS Designer; audience QA/QC engineers, welding coordinators, project engineers, supervisors, administrators; language English; version June 2026. Footer line: copyright to WeldPilot / WS Apps, for authorised users only.

## List
Not a list page. The document is one long page with an in-page table of contents (anchor links `#1-introduction` … `#15-welding-standards--reference-guide`, plus `#81-standards-norm-registry` as a sub-entry). No DataTables, no export, no row options.

### Table of contents of the manual
1. Introduction
2. Getting Started
3. WPS List Overview
4. Creating and Managing WPS Records
5. WPS Editor
6. Approval Workflow and Signatures
7. PDF Export and Official Documents
8. Source Data Management (sub-entry 8.1 Standards (Norm Registry) — marked as a step-by-step guide)
9. Search, Filters, and List Actions
10. Administration and Permissions
11. Common Workflows
12. Error Messages and Validation
13. Best Practices
14. Frequently Asked Questions
15. Welding Standards — Reference Guide
(then an unnumbered "Document History" section)

### Rules stated per chapter (paraphrased)

**1. Introduction.** WPS Designer is the module for creating, reviewing, approving and maintaining Welding Procedure Specifications. It supports project-specific WPS, company-wide master templates that can be copied to projects, pre-fill from a PQR or a saved template, multi-step approval with digital signatures, an official signed PDF linked to the project WPS register, and an audit trail.
- Capability table: lifecycle Draft → Review → Approved → (Superseded / Archived); multi-tab editor with tabs General, Material, Technique, Consumables, Parameters, Groove, Links, Approvals, History; central source data for dropdown values; compatibility rules that filter valid combinations; master templates ("Master" flag, project copies via "Use for project"); digital signatures (drawn on canvas or stored); audit trail shown on the History tab.
- User roles table: Welding engineer / preparer (creates and edits drafts, links PQRs, submits for review); QA/QC reviewer (reviews, signs steps, final approves); Project engineer (requests project copies of masters); Administrator (profiles and permissions, source data, compatibility rules); Read-only user (views approved WPS, exports PDF when permitted).

**2. Getting Started.**
- Access path: left menu → "Weld data" → "WPS Designer". The module must be switched on in System settings by the setting "Enable WPS Designer"; if off, the menu item is greyed out.
- Navigation overview: WPS list (main page), Source Data (button on the list, embedded panel), WPS Editor (opened by Edit/View on a row), Profiles (System → Profiles).
- Six permission flags on the user profile, each with a letter: Show (s) opens the module and views records; Insert (i) creates WPS, clones, makes revisions, uses a master for a project; Edit (e) edits drafts, submits for review, archives; Delete (d) deletes draft WPS only; Approve (m) submits for review, signs, final approves; Export (x) previews/downloads PDF and views the official PDF. Administrators (role 1) have every right automatically.
- First-login checklist: the menu item is visible, the project appears in the Project filter, Insert is on if the user creates WPS, Approve and Export are on if the user approves.

**3. WPS List Overview.** The list is the central register of all WPS.
- Columns: WPS Number (master templates carry a "Master" badge), Revision (Rev 0, Rev 1, …), Project, Status, Created By / Date, Updated Date, Options.
- Status badges: Draft (grey, editable, not submitted), Review (yellow, submitted, waiting for signatures/approval), Approved (green, final, read-only, official PDF available), Superseded (replaced by a newer revision), Archived (closed, no longer active). A screenshot of a status filter dropdown is referenced.
- Option buttons and when each is visible:
  | Button | Visible when | Does |
  |---|---|---|
  | Edit (pencil) | always; "View" if read-only | opens the editor |
  | View PDF | Approved + Export right | opens the official PDF in a new tab |
  | Create Revision | Approved + Insert | starts a new revision |
  | Clone as Draft | not Archived + Insert | duplicates as a new draft |
  | Use for project (share icon) | Approved master template + Insert | creates a project copy (see 4.4) |
  | Archive | Approved + Edit | marks the WPS archived |
  | Delete (trash) | Draft + Delete | removes the draft permanently |
- Top bar actions: "Create New WPS" (opens the creation modal), "Source Data" (toggles the embedded source-data panel), Status filter, Project filter, Search (quick search over the columns).
- Find-a-WPS instruction: set Status and Project filters, type in Search, then click Edit or the WPS number link.

**4. Creating and Managing WPS Records.**
- 4.1 Create New WPS modal. Fields: Project (required), WPS Number (required, full identifier), WPS Number (Short) (optional), Pre-fill source (optional: Empty / PQR / Template). Buttons: Cancel (closes without creating) and "Create WPS" (validates and opens the new draft in the editor). After creating, the user completes the editor tabs and saves.
- 4.2 Create from PQR. Choosing "Start from PQR" shows a required (when PQR is chosen) "Select PQR" dropdown; the PQR values pre-fill all editor tabs. If the PQR's qualification-standard text matches a "PQR Match Pattern" configured on a standard (Source Data → Standards), the Norm on the General tab is set automatically; otherwise the user picks the norm manually.
- 4.3 Create from Template. Required (when template is chosen) field "Select template" (a saved WPS template). Templates are made from the editor with Actions → Save as Template.
- 4.4 Use for Project (master template → project copy). Prerequisites: source WPS Approved, flagged Master template, user has Insert. Opened from the list row with the blue Master badge and Approved status via the blue share-icon button. Modal fields (labels as shown in the manual, in Dutch): "Doelproject" (target project, required), "WPS Number voor de kopie" (leave empty for automatic numbering, optional), "PQR-koppelingen meenemen" (copy linked PQR documents; optional, checked by default). Buttons: Cancel and "Projectkopie maken" (creates the draft copy and opens the editor). The master stays unchanged; each copy is an independent draft that goes through its own review/approval for the target project, including customer signatures if configured.
- 4.5 Delete WPS confirmation. Only Draft WPS can be deleted; Approved and Review ones cannot. The red Delete icon opens a confirmation with a warning that the action cannot be undone; buttons Cancel (keep) and Delete (permanent).

**5. WPS Editor.** Nine tabs. Locking: Approved / Superseded / Archived are read-only (use Create Revision to change); in Review, once the first signature exists the content is locked until all steps are signed, and editing invalidates signatures.
- Tab summary: General (identification, norm, dates, master flag), Material (base materials, thickness ranges, groups), Technique (processes, positions, joint types, heat treatment), Consumables (filler wire, flux, gas, tungsten), Parameters (amperage, voltage, travel speed etc. per pass), Groove Design (type, angles, root gap), Links & PQRs (linked PQR and supporting documents), Approvals (signatory steps and signatures), History (audit trail).
- 5.1 General tab (draft) fields: WPS Number (fixed after creation), Revision, WPS Short Number (no), Project (yes), Norm (yes; from the Standards registry), Norm Revision (no; edition/year, e.g. 2023), WPS Date (yes), Language (yes; PDF/output language), Product Type (yes; Pipe / Plate / Both), Prepared By (no), Master template (no; on an approved WPS it makes the WPS eligible for "Use for project"), Notes (no).
- Norm selection: the dropdown lists the active standards. Choosing a norm on a draft shows or hides the ASME fields (F-No / A-No) from the standard's UI flags, narrows the position options by the standard's Position Scheme (ISO only, ISO + ASME, or All), changes compatibility filtering by the standard's profile, and updates the auto-selected PDF template. A norm that was deactivated later still shows with the suffix "(inactive)" on WPS that already use it.
- 5.2 Material: base materials, groups, thickness and diameter ranges; values come from Source Data → Materials, compatibility rules may limit them. 5.3 Technique: processes, positions, joint types, preheat, interpass, PWHT. 5.4 Consumables: filler, shielding gas, backing gas, tungsten from source lists. 5.5 Parameters: per pass/run current, voltage, travel speed, wire feed. 5.6 Groove Design: preparation, angles, root face, spacing. 5.7 Links & PQRs: link PQR records, upload or reference related documents. 5.8 Approvals (draft setup): define the approval steps (manufacturer, customer, third party) before submitting. 5.9 History: chronological entries for creation, field changes, status changes, signature events.
- 5.10 Review status: a banner announces the content lock after the first signature. Action table: "Save Draft" (unavailable when locked), "Submit for Review" (draft → review, needs validation), "Final Approve WPS" (available when every step is signed), "PDF Export" (preview or download templates).
- 5.11 Approved (read-only): green Approved badge, yellow Locked banner, changes only by revision; PDF Export under Actions; "View PDF" in the list for the official signed document once generated.
- Top bar controls of the editor: a "Saved" indicator (auto-save status), an "Actions" menu (save, clone, template, review, approve, PDF, revision, archive), "Back to List".

**6. Approval Workflow and Signatures.** Flow: Draft → Submit for Review → Review → all steps signed → Final Approve → Approved.
- The Approvals tab during review shows per step: Step (order and role: Manufacturer, Customer, Third party), Assigned to (a user or an external signatory), Status (Pending / Approved / Rejected), Actions (Sign digitally, Send invitation, Reject).
- Digital signature modal fields: "Saved signature" (from the user profile, optional), "Draw signature" (canvas; required unless the saved one is used), "Comment" (optional). Buttons: "Use this signature", "Clear", "Cancel", "Sign".
- Procedure: open a WPS in Review, go to Approvals, press "Sign digitally" on the assigned step, choose a stored or drawn signature, optionally comment, press Sign; when all steps are signed use Actions → Final Approve WPS. Changing content after a signature invalidates the signatures and they must be repeated.

**7. PDF Export and Official Documents.** Actions → PDF Export offers Preview (in the browser) and Download. Several PDF templates can be listed; an asterisk marks the one chosen automatically from the WPS norm and the PDF Template linked to that standard. After final approval the system produces an official PDF with signatures, reachable from "View PDF" on approved list rows, from Actions → PDF Export, and regenerated on demand (Export right) if signatures changed. The official document is linked to the older WPS register through the field `wps_method_id`.

**8. Source Data Management.** Purpose: maintain the dropdown values, the norm registry and the compatibility rules. Audience: administrator or welding coordinator. Reached by the "Source Data" button on the list, or a standalone legacy route.
- Tabs (each with a screenshot link) and what they hold: Materials (base/filler types, P-numbers), Weld Processes (ISO/AWS codes), Weld Positions (PA, PC, 1G …), Joint Types (butt, fillet …), Consumable Brands, Wire Types, Shielding Gas, Tungsten, Compatibility Rules, Standards (norm registry, see 8.1).
- Common to most tabs: an Add button, a data table with edit and delete per row, a search box.
- 8.1 Standards (Norm Registry). Steps to add: open Source Data → Standards tab (last tab) → green "+ Add Standard" → modal fields Code (unique, locked after creation), Label, Profile (asme, iso_european, aws, generic), Default Revision (optional), PDF Template (or default), PQR Match Patterns (one per line, case-insensitive; the manual's example for ASME IX lists three phrases). Then UI flags: "Show ASME F-No / A-No fields", "Show ASME P-Group numbers", "Position Scheme" (ISO only (PA–PG), ISO + ASME, All). Validation flags: "Require F-No/A-No on approve", "Require PQR on approve", "Require EN material group". Then Sort Order (lower = higher priority in the dropdown and in pattern matching), Active (left on), Save. Suggested check: create a test draft with the new norm and see that fields, validation and PDF template follow.
- Editing: blue Edit icon on the row; everything except Code can change; effects apply to new WPS, existing WPS keep stored values. Deactivating: set Active to Inactive and save; the norm disappears for new WPS, existing WPS show "(inactive)" and keep working. The manual advises deactivating rather than deleting.
- Compatibility rules: restrict which materials, processes, positions and joints can be combined; managed per Rule Set with a priority and operators (always, equals, contains, etc.). Example instruction: add a weld position via Source Data → Weld Positions tab → "+ Add Weld Position" with a Position Code and English/Dutch descriptions; it then shows in the Technique tab dropdown.

**9. Search, Filters, and List Actions.** Filters: Status (All, Draft, Review, Approved, Superseded, Archived), Project (All or one site), Search box (free text over visible columns), Page size 25 / 50 / 100 / 250. Column headers sort; default sort is Updated Date, descending.

**10. Administration and Permissions.** The module needs the system setting "Enable WPS Designer" (System → System settings). Rights are assigned per profile under System → Profiles → [Profile] → WPS Designer using the letters s, i, e, d, m, x. Users may store a default signature under System → Signatures to speed up signing.

**11. Common Workflows.** (The capture cuts this chapter's text after about 1200 characters.) 11.1 Create from scratch: Create New WPS → project and number, no pre-fill → complete tabs → link PQRs on Links → define approval steps → Submit for Review → signatories sign → Final Approve WPS → download via View PDF. 11.2 Deploy a master to a project: master Approved with Master template checked → Use for project → target project → "Projectkopie maken" → adjust → review and approve for that project. 11.3 Revise an approved WPS: Actions → Create Revision → edit the new draft → submit, sign, approve; the previous revision becomes Superseded when the new one is approved. Further workflows after 11.3, if any, are cut off in the capture.

**12. Error Messages and Validation.** Table with message/situation → cause → resolution, thirteen rows: Insufficient rights (missing profile flag); WPS not found (bad ID or deleted); Cannot delete (status not Draft); Validation failed on submit (required fields empty); PQR link required (norm/rules need a PQR); All approval steps must be signed (approve pressed too early); Content locked after signing (edit during review; create a revision or reject/restart); Signatures invalidated (data changed after signing; re-sign); Compatibility warning (invalid material/process combination); Choose target project (Use for project without a project); F-No / A-No required (ASME validation flag; fill on Consumables tab); EN material group required (standard flag; set on Material tab); Norm shows (inactive) (standard deactivated; keep or pick an active norm on a draft).

**13. Best Practices.** (Capture cut off near the end.) Advice list: master templates for company-standard WPS deployed per project; pre-fill from a PQR when data exists; define approval steps before submitting; do not edit after the first signature; keep source data central and avoid free text; review compatibility rules when adding materials or processes; set up the Standards registry (patterns, PDF templates) before rolling out a new code; use revisions rather than editing approved WPS; check PDF output before final approval; use the History tab for audits; restrict Delete to coordinators (sentence cut off).

**14. Frequently Asked Questions.** Seventeen question/answer entries. Rules they state: the menu item is missing when the module is disabled or Show (s) is missing; Clone makes an independent draft, Use for project copies an approved master to a target project and remembers the master as source; an approved WPS cannot be edited, a revision is created and the old one becomes Superseded; deleting needs Delete (d) and Draft status; a new weld process is added at Source Data → Weld Processes → Add (admin access); changing data after signing invalidates signatures; the official PDF is under View PDF or PDF Export and can be regenerated after re-signing; a WPS belongs to exactly one project (use per-project copies from a master); compatibility rules hide or warn about invalid combinations; "Save as Template" is in Actions in the editor and needs Edit; standards are added or edited by administrators in Source Data → Standards and the Code cannot be renamed (deactivate and create a new one instead); "(inactive)" in the Norm dropdown means the standard was deactivated, value kept for traceability; from a PQR the norm is chosen by matching the qualification-standard text against the patterns, lowest Sort Order wins; for a norm needing its own PDF layout (example given: AWS D1.1) the vendor must register a custom template, then it is assigned on the standard.

**15. Welding Standards — Reference Guide.**
- Six aspects a standard controls: Norm dropdown, UI fields (ASME F-No, A-No, P-Group), Validation (PQR, F-No/A-No, EN material group before approval), Compatibility (filtering by profile), PDF template, PQR pre-fill (automatic norm detection).
- Standards list columns: Code (stored on each WPS as `standard_code`, immutable), Label, Profile, PDF Template, Sort Order, Active, Actions (Edit or delete).
- Add/Edit field reference (field → required → note): Code (yes, create only; cannot change), Label (yes; changeable anytime), Profile (yes; generic, iso_european, asme or aws; drives compatibility filtering and default UI), Default Revision (no; only a hint, the user types Norm Revision per WPS), PDF Template (no; empty means the default layout named `normal`), PQR Match Patterns (no; one per line, case-insensitive substring match against PQR qualification standard text), Show ASME F-No / A-No (no; shows the fields on the Consumables tab), Show ASME P-Group numbers (no), Position Scheme (no; ISO only, ISO + ASME or All), Require F-No/A-No on approve (no; blocks final approval when missing), Require PQR on approve (no; default on), Require EN material group (no), Sort Order (no; integer, default 100, lower first), Active (yes; Active / Inactive).
- Pre-installed standards (four, all active):
  | Code | Profile | PDF Template key |
  |---|---|---|
  | ISO 15614-1 | iso_european | iso-15614 |
  | ASME IX | asme | asme-ix |
  | EN 13480 | iso_european | en-13480 |
  | EN ISO 15609-1 | iso_european | iso-15609 |
- Profile behaviour: asme (F-No/A-No fields visible, ISO + ASME positions, compatibility filtered for ASME); iso_european (positions PA–PG, no ASME F/A fields by default); aws (reserved for AWS-style standards, flags set by hand); generic (minimal filtering, the compatibility engine may show a warning). Changing the Norm on a draft refreshes visible fields and dropdown options at once.
- Norm selection on the General tab (drafts only): Norm (required) and Norm Revision (optional); the list is sorted by Sort Order; inactive norms stay visible on WPS that use them but cannot be chosen for new ones.
- PQR pre-fill: the system scans field 25 of the PQR (qualification standard text) against each standard's patterns, substring and case-insensitive; the match with the lowest Sort Order wins; no match means manual choice. Example patterns for ASME IX: `asme ix`, `asme section ix`, `asme bpvc ix`.
- PDF binding: the template marked `*` in PDF Export follows the WPS norm; without a configured template the `normal` layout is used.
- Inactive standards: hidden for new WPS and norm changes; existing WPS keep the code and show "(inactive)", stay editable (draft) or readable (approved); validation and PDF export still use the stored standard setup.

**Document History** (table): June 2026 — initial release with 34 screenshots; June 2026 — Chapter 15 restructured as a reference guide and 8.1 added with step-by-step standards instructions and screenshots.

## Dialogs
No dialog is opened by a control of this page: the document area contains only text, tables, links and images. The dialogs in the capture belong to the application shell (see the last line below). The manual itself describes dialogs of the WPS Designer (Create New WPS, Use for project, Delete WPS, Digital Signature, Add Standard) but only as text and screenshots; no field names (`name="…"`) of those dialogs are in this capture. 0 dialogs and 0 fields described from the DOM.

## Rules found in the page's JavaScript
- Inline script `1mpktsixkd` (shared with the manuals index capture): adds the class `wsapps-manuals-view` to `<html>` and `<body>`; sets the CSS variable `--wsapps-manuals-height` to the window height minus the top of `#content` (minimum 240 px) when `#content` has the class `wsapps-manuals-page`; runs once on load and again on every window resize (function `wsappsManualsSyncHeight`).
- Requests: the page makes one request while loading, `GET /core/ajax/ajax-notifications.php?action=count_unread` (shell notification counter); images come from `/core/ajax/user-manual-asset.php?path=…`. The other scripts are the shared shell scripts (`SAME-AS weld__start__dashboard`).
- No validation, conditional field or computation belongs to this page.

## Sample data
Not a data page. Key figures of the document: 15 numbered chapters plus Document History; 34 screenshots (per document history); the version stated in the document is June 2026 and the product line "Product: WeldPilot® WPS Designer". The sandbox shows the same manual text as any account; nothing in it depends on the project data.

## Not in the capture
- The images themselves (screenshots served by `user-manual-asset.php`); only their file names and captions are in the capture.
- The tail of chapters 11 and 13 (the capture cuts those paragraphs; chapter 11 after 11.3, chapter 13's last advice).
- The other manuals, reachable through the navigation links (`doc=` values listed above).
- The WPS Designer module itself (menu "Weld data" → "WPS Designer"), which the manual describes; it is not part of this capture.
- Whether the "WPS Designer — End-User Manual" navigation entry is marked active on this page: the capture only shows the unchanged navigation block (`LINEDIFF new=0 of 17`).

Also present in the page, opened from elsewhere (shell dialogs): `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin`, `#docPersonnel`, `#cardPersonnel`, `#cardPersonnelEdit`, `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`; the handheld floating menu (Scan weld, Scan flange QR label, Add punch).
