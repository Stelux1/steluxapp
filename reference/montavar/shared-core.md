# Reference capture — shared core (both pilots)

Observed read-only on 2026-11-15 on the reference site (sandbox project site "Zandbak"). No form was submitted.
Notation: `Label [name type]`, `*` = required, `sel{n}` = select with n options. Rules below are paraphrased from the reference's own on-screen help; do not copy its wording into our UI.

## Entry and shell

- Root page: heading "Select your application workspace", one tile per application, Light / Dark theme toggle.
- Each pilot has its own URL prefix, its own top-bar colour and its own sidebar.
- Top bar: menu toggle, app-switcher (back to the selector), pilot name, active **project site** chip, language flag, "Expire warnings" counter (expired welder qualifications; Weld only), notifications bell ("Mark all read", "No notifications"), theme toggle, user menu.
- User menu: list of project sites the user may work on (click = switch active site), languages, User Manuals, Logout.
- Every list is scoped to the active project site ("filtered from N total entries").
- States: table overlay "Loading…" / "Processing…"; empty "No data available in table"; no permission = full-width red banner "You do not have rights to open this page." and a greyed-out menu item; success = green toast bottom-right.

## Project sites (General data)

- Columns: Name | Address | Phone | Email address | IRN Code | Options (open, edit, delete). Buttons: Show archived sites, Add project site. CSV / Excel / print.
- The add/edit form has three tabs: **Project settings**, **Document settings**, **Iso progress**.

### Project settings tab
- Name*, Address*, Zip code, Residence, Phone, Email address, Archived [checkbox]
- **Mandatory fields** [checkbox]. When on: (1) saving a weld that has a welder requires Weld type, WPS number, Weld date, Diameter and Charge number 1 / Charge number 2; (2) saving a material certificate requires Charge number, Diameter, Material part, Type of material, Schedule, Wall thickness and Certificate type.
- **Flange tightening standard** [sel: No catalog (free entry) / ASME B16.5 torque table (2012) / Gasunie CSW-43 table B]. The chosen catalog pre-fills and checks flange torque values; values already entered are never overwritten.
- **Validation on WPS** [checkbox]. When on, and the WPS is linked to welder qualifications, a welder whose qualification does not match the weld's WPS cannot be assigned to that weld.
- **Project-specific Material Certificates** [checkbox]. When on, the weld form offers only charge numbers of certificates linked to that project, and only those certificates are printed in the Iso book / project book.
- **Material Management Display Setting** [checkbox]. Switches the MTO isometric view between "materials added to the isometric" and "pick-list status".
- **Defect norm** [sel: No norm selected / ISO 6520-1 / ASME B31.3 / API 1104]. Decides which defect codes may be chosen for a not-accepted NDT result on every project of the site; individual codes can still be switched per site under Defect codes.
- **Repair performance limit** [number, %]. Used by the Weld dashboard KPI; empty means 5 %.
- **NDT measurement** [radio: Inch-weighted / Per weld]. Inch-weighted: a large-bore weld counts more than a small-bore one. Per weld: e.g. 10 welds requiring NDT with 1 accepted = 10 % of the NDT weight.

### Iso progress tab (weights for isometric progress %)
- Phase split: Shop + Field + Site must total 100 % (example 38 / 54 / 8). Site is its own phase, not a share of Field.
- Inside each phase the active activities must total 100 %:
  - Shop: Welds, NDT, Material pipe, Supports, Appendages
  - Field: Material pipe, Welds, NDT, Supports, Appendages, Punch
  - Site: Hydrotest, Paint/Tracing (required only when Site > 0)
- Earned value of an activity = phase weight × activity weight (example: Site 8 % × Hydrotest 40 % = 3.2 % of the isometric).
- Welds are always inch-weighted. NDT is earned by the site's NDT measurement setting. A rejected result does not count as done; repair welds add no extra units.
- Shop pipe / supports / appendages are quantities; the ceiling is the Shop-typed issued quantity against the Shop MTO. Field erection counts the whole isometric (shop prefab is installed again in the field, not deducted). Issued / picked quantity is the ceiling for both.
- Paint/Tracing covers Paint, Tracing, Insulation; items marked N/A drop out.
- Quality (NDT accepted vs rejected) is shown next to progress and is not part of the %.
- Weight changes are versioned from the day of change; progress recalculates after save.

### Document settings tab
- Prefix; Release doc drawing no [sel: Drawing no + iso / Prefix + iso]; Hydrotest Execution Plan; Flange procedure No.
- Signature block titles: Subcontractor QA/QC, Subcontractor Construction, Principal UI, Contractor QA/QC, Contractor Construction, NoBo
- VT document: Doc.No. & Rev.No., Procedure No., VT type 2 no / rev / date / order No
- LISL: Field 1–3, LISL [GU] Field 1–3, Doc.No. & Rev.No., Procedure No.

## Projects (called "work packages" in menus)

- Columns: Intern prj. no. | Extern prj. no. | Project description | Contact name | Authority | Status (%) | Options | checkbox
- Row options: open, print, archive, edit, delete.
- Header: Export; Options ▾ (Delete selected projects, Edit projects (Mass edit), Generate multiple WP books, Show deleted work packages); Import ▾ (Import all WP data); Add project.
- Add project: Intern prj. no.*, Extern prj. no., Contact name, Phone, Authority, Project description, and one **enable switch per application** (Weld, MTO, …). A project appears only in the pilots it is enabled for.
- Import projects: CSV file, "clean import" checkbox (replaces the current list). Import all project data: long-running full import.

## Isometrics list

- KPI cards: Total isometrics; NDT approved; PWHT approved; Prefab complete; Field complete; Documentation — each as % and n / total.
- Columns: Project | ISO No | IRN | ITP No | ITP No 2 | P.Class | NoBo | PWHT | M | E | W | Pfb | Fld | Doc. | Prio. | Opts (Open)
  - NoBo, PWHT, M, E, W, Pfb, Fld, Doc. are ✓ / ✗ / — icons. M / E / W = "MTOPilot ready / ESTPilot ready / WeldPilot ready".
- Per-column filter inputs under the header; CSV / Excel / print; "Refresh data" with last-refresh time.
- Filter dialog: Project, NDT [All/No/Yes], PWHT, MTOPilot ready, ESTPilot ready, WeldPilot ready.

## Isometric (shared header, identical in both pilots)

- Breadcrumb: site / project / Iso / <ISO No ▾ change isometric> / Welds|Materials
- Cards:
  - **Identification**: ISO No (link to the drawing PDF) with IRN and "Rev n.nn" (opens revision history) and "+" (add revision); Asset tag
  - **ITPs** n/2: Link ITP (two slots, each with its own revision)
  - **Compliance**: NoBo (Yes/No), NoBo Reg. no. / NoBo serial, PED Cat.-Mod, X Ray %
  - **Technical**: Piping class, PWHT (Yes/No), Test pressure, Test system
  - **Progress**: Shop prefab %, Field %, Site % (each expandable), Save, "Set all to 100%"
  - **Status**: overall %, Quality %, "N open" (blockers list), Prefab ready / not ready, Field completed + Reopen + Create release doc, Pre-Punch (open / finished), Hydrotest, Punch (open / finished), overdue count. MTO shows additionally "Hydrotest completed" and "Material status %" with a refresh button.
- **Progress card in detail** (expanding each row):
  - Shop prefab n %: inputs Pipe (m), Supports (pcs), Appendages (pcs). Each shows its own % or "N/A".
  - Field n %: inputs Pipe (m), Supports (pcs), Appendages (pcs).
  - Site n %: Paint (shows the isometric's paint spec), Tracing, Insulation — each a three-way choice Open / Done / N/A.
  - Buttons Save and "Set all to 100%". Toasts: saved; "value exceeds the MTO budget"; "value exceeds issued/picked quantity"; "no MTO budget — add materials with this component code in MTO"; "no issued/picked quantity — progress cannot be entered"; invalid value; saving failed.
  - The budget for pipe / supports / appendages is the isometric's MTO quantity of materials whose **component code** (Material database column "CC") classifies them as pipe, support or appendage, split by Shop / Field operation phase; the entered value may not exceed the budget nor the issued/picked quantity. With no budget the input is disabled and shows N/A.
  - Calculation model: every phase has "drivers", each with a weight (from the site's Iso progress settings), a progress 0–1 and an in-scope flag. Shop drivers: welds, NDT, pipe, supports, appendages. Field: pipe, welds, NDT, supports, appendages, punch. Site: hydrotest, finish (paint / tracing / insulation; N/A items drop out). Phase % = Σ(weight × progress) over drivers that are in scope and have weight > 0, divided by the sum of those weights — out-of-scope drivers drop out and the rest renormalise. Isometric % = Σ(phase weight × phase %). Displayed with one decimal.
  - Welds driver: inch-weighted share of welds that are welded. NDT driver: per the site's NDT measurement (inch-weighted or per weld), accepted results only.
  - "Quality n %" next to the status = accepted NDT results / (accepted + not accepted); it is not part of progress.
- Blockers ("What blocks this isometric"), grouped: Release (prefab not released yet) · Welds (weld N is missing required fields) · NDT (NDT on weld N has no result) · Repair (rejection on weld N, repair NR1 still open) · Punch (n open pre-punch).
- Pilot switch dropdown on the panel header opens the same isometric in another pilot.
- Options ▾ (both pilots): Attachments, Audit trail, Set phase.
- Add isometric (39 inputs): Iso number* (letters, digits, `.`, `_`, `-` only), IRN, Revision number, Asset tag, Drawing no. 1, Date, NoBo Reg. no., NoBo serial, Piping class, Test pressure, Test medium, NDT norm, PED Cat.-Mod, Nom. diameter, Material, Paint spec., RAL, Insulation, Elevation, X axis, Y axis, Zone / Area, Priority [sel: No priority, Prio 1 … Prio 5], Chemical clean, Tracing Spec, Norm No., Norm, NoBo [checkbox], PWHT [checkbox], description, files: ISO drawing, ITP, ITP 2.
- Set phase (8 checkboxes): prefab_materials, prefab_est, prefab_doc, prefab_welds, field_doc, field_test, field_release, prep_finished. Also available as mass edit for checked isometrics.
- Add revision (ISO / ITP / ITP 2 separately): current files, optional file, revision number, comment.
- Copy isometrics: target project, copy welds [checkbox], copy materials [checkbox], copy calculations [checkbox].
- Import isometrics: CSV file. Delete all / delete selected isometrics; deleted ones can be brought back.

## Users, profiles, signatures (System)

### User accounts
- Columns: Username | Name | Title | Email address | Company | Phone | one ✓/✗ column per application | Options. Buttons: Show deleted, Add user.
- Add user: Username*, Password*, Name, Title, Address, Email address, Phone, Company [sel], Deactivate user [checkbox].
- **Access is per application**: for each pilot an "Enabled" checkbox, a scope select [All project sites / Specific project site(s)], and a profile select. With "Specific project site(s)", each site has its own checkbox and its own profile select. So one user can have different profiles in Weld and MTO, and different profiles on different sites.

### Profiles
- List: Name | Description | Options. Sandbox profiles: admin, "Highest rights for QAQC", "Only review" (external), "Standard profile for workpreparator", "Full rights (almost as admin)", "Work Preparation Manager".
- A profile is a matrix of 98 numbered areas × actions (show, insert, edit, delete, export, import, print). The full list is already in `reference/permissions-observed.json`.

### Signatures
- "Show my signatures": full signature (800×200 px) and short signature (300×200 px).
- "Sign with pen": draw on canvas; options "add name under the signature" and "add a background image"; Clear / Undo / Save / Upload.

### Other
- Change password: current, new, repeat. Change theme [sel]. Company data (name, address, logo with max-height and padding sliders) used on documents.
