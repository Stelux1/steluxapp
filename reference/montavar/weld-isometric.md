# Reference capture — WeldPilot: isometric, welds, inspections, releases

Observed read-only on 2026-11-15 on the reference site (sandbox project site "Zandbak"). Dialogs were opened and closed without saving.
Notation: `Label [name type]`, `*` = required, `sel{n}` = select with n options.
The shared isometric header (cards, progress, status, blockers) is in `shared-core.md`.

## Weld table on the isometric (panel "Welds")

- Header buttons: Options ▾ | Mass edit welds (enabled when rows are checked) | Add weld. Panel header: pilot switch ▾, Reports ▾, edit isometric (pencil).
- Columns: Sort (drag handle) | WN | Type | Wdr | VI | NDT (Pre) | NDT | Pre-HT/PWHT | Idx | Chg.No. | Material ① | Idx | Chg.No. | Material ② | WPS | D | S | Options | checkbox
  - WN: weld number; repairs carry a suffix (`010R1`, `010R2`); inserted welds a letter (`005A`).
  - Type: abbreviation of the weld type (WS shop, FW field); tooltip "Shop weld" / "Field weld".
  - Wdr: welder stamp(s), comma separated; tooltip shows photo and name.
  - VI / NDT (Pre) / NDT / Pre-HT/PWHT: `No` (green, not required) or `Yes` (red while open). Icons after `Yes`: ✔ accepted, ✖ not accepted, `•••` request made / result pending, `T` button = tracer details, document icon = report file, printer icon = request PDF. Clicking the cell opens the per-weld dialog ("Create/Update NDT Request").
  - Material ①/②: `dia/schedule/wall/type of material/part` from the certificate, e.g. `1/2"/40/7,2/A106 Gr B/Pipe`; `EXISTING` / `CONN ISO` when the side is not new material.
  - D: diameter. S: spool.
  - Options: edit, delete, stamp. A **padlock** replaces them when the weld is locked; the row checkbox is then disabled. In the sample, field welds (FW) are locked while the isometric is "Field completed" and shop welds stay editable (inferred, not confirmed).
- Options ▾: Attachments · Visual inspection (count) · Generate Mass NDT-Pre request · Generate Mass NDT request · Generate Mass Pre-HT/PWHT request · Upload Pre-HT/PWHT on multiple welds · Punch list · Audit trail · Set phase · Show deleted welds · Delete selected · [x] Disable welds sorting
- Reports ▾: LISL Report · LISL Report (A3) · LISL Report [GU] · [MV] · [ISS] · [WQ] · [WQ ver 2] · [GU Rev 2] · [GU Rev 3] · Blank LISL template · Weld card · Weld labels · Punch list - blank · ISO Book
- Below the status card: "Batch release: Prefab overview | Field overview".

## Add weld / Edit weld

Add weld (26 inputs) and Edit weld share the layout. Buttons in edit: Add new · Update · Cancel.

- Weld no.* · Weld type [sel 18] · WPS number [sel — only WPS available to this project] · Fitup Date · Weld Date
- Welder, Welder 2, Welder 3, Welder 4 [sel — filled after the dialog opens; option text `ML396, Name | …`]. "Multiple welders?" reveals welders 2–4.
- Dia. [sel 55 from Weld diameters, first option "-- Length in mm --"] · Length in mm [number] (only for explicit length) · NDT percent [number 0–100, only with explicit length and NDT required]
- Coating 1 · Coating weld · Coating 2 · Sleeve · Spool [sel, 18 options — names from the **Spools catalog** that are enabled on the site, e.g. "Spool J", "SP01"; a spool on an isometric is the pair isometric + spool name. Our model keeps spools per isometric; treat that as a known difference, not something to change in this flow]
- KR · FP · Ins. length 1 · Ins. length 2 · Weld process [sel 12]
- Welding wire 1 · Pos 1 · Welding wire 2 · Pos 2
- Charge number 1 [sel] with checkbox "Upd. prev. weld"; Charge number 2 [sel] with checkbox "Upd. next weld" (copies the chosen charge to the adjoining side of the neighbouring weld). Options: `CONN ISO`, `EXISTING`, then material parts / certificates; after choosing, the dialog shows read-only **Index number, Material, Description, Diameter** fetched from the certificate.
- Checkboxes: NDT Req. Pre · NDT Req. · Pre-HT · PWHT Req. · Repair · Tracer (tracer is set by the tracer workflow, disabled here)
- Validation: Weld no. required. With the site setting "Mandatory fields" on and a welder chosen: Weld type, WPS number, Weld date, Diameter, Charge number 1 and 2 are required. With "Validation on WPS" on: a welder whose qualification does not match the WPS is refused. With "Project-specific Material Certificates" on: only certificates linked to the project are offered.

Add welds (range): Weld no. Start* [number], Weld no. End* [number], Dia. [sel].

Mass edit welds (43 inputs, applied to checked rows): Weld type, Welder 1–4, Coating 1/2, Welding wire 1/2, Pos 1/2, Charge number 1/2, WPS number, Weld process, Fitup date + "Clear date", Weld date + "Clear date", Dia., Length in mm, NDT Req. Pre, NDT Req., Pre-HT, PWHT Req., Repair, Tracer, **NDT location Pre** + NDT process Pre for Initial / Remaining / Additional / Additional 2 / Additional 3, **NDT location** + NDT process for the same five rounds, PWHT location Pre + PWHT process Pre, PWHT location + PWHT process.

Other weld actions: drag to reorder (can be disabled), delete with confirmation, show deleted welds and bring one back, stamp edit.

## NDT per weld (dialog "NDT <project> / <iso> / <weld>")

- Welder (read-only), NDT location [sel], Request number [text, prefix `R`]
- Five columns = rounds: **Initial, Remaining, Additional, Additional 2, Additional 3**. Each: NDT process [sel], Film Nr., NDT Rp/Nr. (report number), NDT date, NDT res. [sel: — / NA / Accepted]. A ✔ in the column header marks a round whose process is set.
- Initial column only: NA length [mm] and Defect type [sel, 12 values such as Slag Inclusion, Porosity — list depends on the site's defect norm]; enabled when the result is NA.
- Remaining column: ReWeld? [checkbox].
- NDT documents: multiple files, PDF only.
- The same dialog exists for NDT Pre. Archives per weld: NDT archive, NDT Pre archive, PWHT archive.

Upload NDT on multiple welds: welds[], and for each round report number + result; files[].
Generate NDT request PDF (per isometric or mass): NDT processes[] to include, language, note, include isometrics [checkbox].

## Tracers

- A weld with a not-accepted result needs **2 tracer welds**. The `T` button on a weld opens "Tracer details": the original rejected weld (or "no source weld link found"), "Linked tracer welds | n linked of 2 required", the selected tracer (project, isometric, weld) and its NDT results per process.
- Tracer welds are excluded from the inspection-compliance counts on the dashboard.

## Pre-HT / PWHT

- Upload Pre-HT/PWHT on multiple welds: welds[], Pre report number, report number, file, check [checkbox].
- Request PDF per isometric: language, note, options (4 inputs).

## Visual inspection hub (Options → Visual inspection)

- Tabs: New upload · Visual reports archive.
- Fields: weld filter [sel: all / select specific welds], welds[], ITP [sel: ITP 1 / ITP 2], Activity No., QA/QC engineer [sel], Custom No., Report No. [sel], Inspection date, accepted[] / not-applicable[] per weld, files[].

## NDT/PWHT Manager (Welding data)

- Tabs: NDT Pre · NDT · NDT archive PRE · NDT archive · NDT request archive · PWHT request manager · PWHT archive · PWHT request archive
- Table: Project | ISO | Weld no. | Type | Welder | NDT Pre (or NDT) | NDT R/Nr. | Idx. No. | Chg.No. | Material ① | Ind.No. | Chg.No. | Material ② | Proces | WPS | checkbox
- Welds enter a tab when the matching flag (NDT Req. Pre / NDT Req. / PWHT) is set and leave it for the archive once a result is recorded.

## Punch lists (Releases)

- KPI cards: Open · Pre-punch (open) · Punch (open) · Overdue · Deadline 7 days · Finished · Passed · Removed
- Filters: Project, Punch type [Pre-punch / Punch], Type [A / B / C / D]. Buttons: Print, Add item, Export.
- Columns: # | Project | Isometric | Type | Description | Due date | Contractor | Punch | Document | Status | Options
- Isometric punch progress [sel: 0 %, 25 %, 50 %, 75 %, 100 %].
- Isometric status shows: Pre-Punch Open/… with open and finished counts, Punch likewise, overdue count, and a warning such as "Pre-punch: 1 A/B still need Finished + approval".

## Releases

- Prefab release list (default filter hides released): Options (Choose ITP) | Project | ISO | IRN | Rev. no. | ITP No | ITP No 2 | Spools | Piping class | Drawing no. 1 | NoBo | X Ray % | PWHT | Priority. Header: Options ▾, Filter, refresh.
- Field release: same shape for field completion. On the isometric: "Field completed" with Reopen (asks for a reason, 3 inputs) and "Create release doc".
- Assign Iso to FWP: tabs Field Work Packages · Assign Iso to FWP. Table: Project | ISO | Diameter | Paint spec. | Asset tag | Test pressure | Test medium | Test system | FWP | Check. Filter, Export.
- Hydrotest release: tabs Test systems · Spools. Test systems: Name | TS accepted by client (e.g. Approved, Testing not applicable) | Options. Add test system.
- Request archive: date range filter.

## Flange Management (Releases)

- Buttons: Export · Report · Print labels · Filter · Excel import · Add.
- Columns: Project | Iso number | Flange ID | Asset tag | Flange Size | Gasket Type | Target Moment (Nm) | Status (e.g. Planned) | Options (view, edit, documents, delete)
- Add flange (44 inputs): Project, Isometric*, Flange ID, From equipment, To equipment, Equipment connection, IRN no, Criticality, High risk, P&ID, Line number, Fluid code, Pipe class, Area/unit, Location, Flange type, Flange size, Flange rating, Flange rate/size, Gasket type, Gasket material, Stud bolt dimension, Stud diameter, Number of stud bolts, Lubricant used, Stud bolt material, Nut material, Torque wrench type, Torque wrench ID, First pass (Nm), Second pass (Nm), Target moment (Nm), Target stress, Max deviation, Tightening date, Report no., Operator, CQI, Commissioning date, Rejection type, Inspection result, Operating pressure, Operating temperature, Test pressure.
- Torque values are pre-filled and checked from the site's flange tightening standard (see `shared-core.md`).

## Dashboard (Start)

- Header: site name, date, Site ID.
- KPI cards: Projects · Isometrics · Total welds (by type abbreviation) · Welded · Examined % (welds with an NDT result and a welder, share of scope) · Repaired · Repair rate (repaired / welded; welds without a welder excluded) · Repair performance (value, limit, scope; badge "Above limit").
- Filter panel: From date, To date, Company, Weld type [All / Shop / Field], Intern prj. no., Welder, ITP/KNR, Piping class, IRN, PED Cat.-Mod, Material, NDT process group, NDT process, WPS method. Filter / Reset.
- Buttons: Manage ITP/KNR · View ▾ (number of welds / …) · Reports ▾.
- Inspection compliance: grouped by welder + WPS + ITP/KNR. Per group: total welds, required examination (ceil of welds × ITP/KNR NDT %, 10 % when no ITP/KNR is linked), examined welds (fully completed NDT only), selected for examination (NDT Req. set and not completed), remaining required, status COMPLIANT / NOT COMPLIANT, bars Tested / Selected / Remaining, weld defect % per welder/WPS (welds, examined, exam %, rejected, reject %, tracers, tracer status). Group filter: Not compliant / Compliant / All groups; search; paging.

## Not captured (no access with the observing account)

- ITPs, ITP templates ("You do not have rights to open this page"), NDT Batch Import.

## Additional captures (2026-11-16)

### Punch lists — dialogs
- Add item dialog has two tabs: **Add item** and **Report passed**. New item can be started by **Scan** (weld label / ISO book QR — belongs to the deferred Handheld feature) or **Manual**.
- Manual fields: Project [sel], ISO [sel; first option "- Project related" for a punch not tied to an isometric], Type [sel], File (take photo / choose file; photos are resized), second File, Description, Due date, Contractor [sel: companies], Reported date, Reported by [sel: personnel], Pre-Punch / Punch [radio].
- Type options, exact: `A — Immediate fix (blocking)`, `B — ASAP fix (blocking)`, `C — Fix (non-blocking)`, `D — Fix in operation (non-blocking)`.
- Row options: move, **Mark as finished**, delete, edit, history. Statuses seen: Open → Finished → Passed; Removed (with "mark as removed" confirmation); Overdue is derived from the due date.
- Finish sign-off dialog: signer type [radio: Client / other], Client name*, Company, Function, Inspector* [sel: personnel], Date*, Remarks, sign-off method [radio: Draw digitally / Upload signed PDF] with the file.
- Print dialog: Language, include punch document, include isometric drawing.

### Flange Management — extras
- Filter: Project, Finished [— / No / Yes]. Report: language. The add form has no status select; the list status (e.g. "Planned") is derived from the record's progress (tightening date / result / finished).

### Hydrotest release — dialogs
- Add test system: Test system* (name), Description, "Test system accepted by client" [sel: -- Not set -- / Testing not applicable / Approved].
- Move isometric(s) to a test system: Test system [sel].
- Hydrotest request: QA/QC engineer [sel], Test record no., Pump type, Hose type, Manifold, Pressure gauge no., Recorder No, Calibration cert, Piping class, Design code, Test medium, Required test pressure, Actual test pressure, Date, Test start, Test end, Area temp, Test duration, Required leak test pressure, Leak test duration, Note, Include isometric(s) [checkbox].
- Custom hydrotest documents: type [sel: Punchlist / Pressure test ITP / Blind list / Pressure gauge-recorder certificate / Piping and instrumentation diagram / 3D snippet], files.
- Spools tab filter: Test system, Project.

### Releases — filter
- Prefab / Field release filter: Project, ITP No, Show [Hide released / Show released].
