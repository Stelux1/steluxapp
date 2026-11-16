# Reference capture — printable documents (PDF)

Observed read-only on 2026-11-16 by opening the reference's PDF views for sandbox isometric 0001 (plain GET renderers; nothing was saved or changed). Describes structure and labels so our own PDFs can carry the same information. Our PDFs use our own typography and the company data/logo configured in the workspace — never the reference's logo.

Every report is generated per isometric (and from the project for all its isometrics). Dialog options where present: Language; Type [All / Shop / Field]; "Weld record" checkbox; "Signature on each page" checkbox.

File name pattern seen: `<date>-<project>-LISL.pdf`.

## 1. LISL Report (portrait A4)

- Title "ISO <iso no> - LISL Report"; company logo top right.
- Block left: Client, Intern prj. no., Extern prj. no., Project description. Block right: company name, address, phone (from Company data).
- Grey box, three columns of label/value: Iso number (with "Rev. n") / ITP No / Asset tag / Drawing no. 1 — NoBo / NoBo Reg. no. / PED Cat.-Mod / X Ray % — PWHT / Piping class / Test pressure / Test system.
- Table, black header row, one weld per row with **two text lines** (side 1 / side 2): `WN` + `Type` | `Ind. no.` | `Pos / Material` | `Dia./Length` | `WT` | `Sch.` | `Chg.No.` | `WPS` | `Welder` + `Date` | `NDT Rp/Nr. 1` … `NDT Rp/Nr. 5` | `PWHT Rp/Nr.`
  - NDT cells: report number on the first line, then process and result code such as `RT (NA)`, `MT (A)`, `PT ---` (requested, no result).
  - Type shows the abbreviation and joint, e.g. `WS/`, `FW/BW`. A tracer welder is shown with `-Tr`.
- After the last row: a two-part box "Acceptance / examine prefabrication" and "Acceptance / examine assembly"; each has three lines — company, Client, NoBo — with a signature line and "Date:".
- Footer on every page: generation date-time left, `page/pages` right. The header blocks repeat on every page.

## 2. LISL Report (A3, landscape)

- Title "LISL Report"; same header blocks and grey box.
- Columns: `WN/Type` | `Ind.No.` | `Pos / Material` | `Dia./Length` | `WT` | `Sch.` | `Chg.No.` | `Attest number` | `WPS` | `Welder/Date` | `NDT Rp/Nr. PRE 1` … `PRE 5` | `NDT Rp/Nr. 1` … `5` | `PWHT Rp/Nr.`
- Same acceptance box.

## 3. LISL Report [GU] — "Welding report stations/installations"

- Company name in italics above a framed header: left "WELDING REPORT STATIONS/INSTALLATIONS" and "Project: <main project>"; right a small block Doc / Version / Date / Page (document number, version and date come from the main project's Document settings "LISL [GU] Field 1–3"; page "n of N").
- Second frame: left two free lines from Document settings (specification reference; marking statement); middle "Installation no." (IRN), "Drawing No" (iso + rev), "Diameter", "ITP no:" (both ITP numbers), "PED Cat.:", "X Ray: n%"; right "Section" (project number), "Paint spec.", "Section description" (project description).
- Table in two halves.
  - Left, one row per material side: `Identifications code` → `Index No.` | `Charge Nr.` | `AP item code` (material number); `Diam. DN`; `WT mm`; `Material Type / quality`; `Pipe Coating`; `Description of material`; `POS`.
  - Right, one row per weld: `Weld No.` (with type abbreviation) | `Welders` | `Date` | `WPS` | **Not Destructive Test** with a pair `A / NA` + `Rep. No.` for each of: VT, PA, RT, PWHT, US weld, ToFD, MT/PT bevel, MT/PT | `Field coating weld`.
- Footer: three signature groups — company, Client, NoBo — each "Compiled by", "Date", "Signature".
- Below: list of the WPS used: `WPS code` | `WPS name` | `Definition`.

## 4. LISL Report [MV]

- Same frame as [GU]. Right half is wider: `Weld No.` | `Location` | `Joint Type` | `Welder 1` … `Welder 4` | `Date` | `WPS` | **Consumable details** (`Wire 1`, `mm`, `Wire 2`, `mm`) | `Fit-up date` | NDT pairs for VT, PA, RT, PWHT, US weld, ToFD, MT/PT bevel, MT/PT, PMI.
- Footer signatures and WPS list (`WPS name` | `WPS process` | `Definition`).

## 5. LISL Report [ISS] — "Inspection Summary Sheet"

- Bilingual labels (German with English beneath). Header grid: Drawing number; Sheet; Page n of N; Spool number; Project name; Train; Project number; ITP number (both); Doc. template; Supplier; fluid service category / PED category; NDT standard with two checkboxes (ASME, EN ISO).
- Table, several lines per weld: `Weld No.` + `Weld Type` | `Description` (material per side) | `Ø / Wall thickness` | `Certificate No.` + `Heat No.` | `WPS No.` + `PQR No.` | `Filler heat No.` | `Welder ID` + `Welding date` | then one column per method, each with "Report No." and "Test date": `VT 100 %`, `RT … %`, `PT / MT … %`, `UT … %`, `PMI … %`, `FN … %` (ferrite), `HV … %` (hardness) | `Comments`.
- Footer: three boxes — Supplier, Inspector, and the end client — each with Date, Section, Name (and signature).

## 6. LISL Report [WQ] and [WQ ver 2] — "Line Inspection Status List (LISL)"

- Company name above a framed header: an owner standard line, "Line Inspection Status List (LISL)", "Home location: <main project>", and in [WQ] "Visual inspection report(s): <numbers>"; right Doc. / Version / Date / Page.
- Second frame: Asset Tag, Drawing No., Diameter — Installation no., Page, Projectnr.
- Table: `Identification mark` (`Pipe or heat no.`, `B.B. no.`) | `Diam. DN` | `Wall thk. mm` | `Material Type/quality` | `Pipe` (`Coating`, `Installed length`) | `Description` (article number / description) | `POS` | `Weld no.` | `Welder` | `WPS no.` | `Fixed points on route map` (`KM`, `VT-no.`) | **Non-destructive testing** pairs `A / NA` + `Rep. No.` for AUT/Phased Array, Radiography, US las, ToFD, MT cap/MT bevel | `Weld coating` | `Insulation` (`Electrofusion shrink sleeve`, `QA/QC Approval`).
- Footer: contractor ("Signed by (contractor)", Date, Signature) and the owner's supervisor (Supervisor, Date, Signature).
- [WQ ver 2] differs only in the header (no visual-inspection line) and fills `VT-no.` per weld.

## 7. LISL Report [GU Rev 2] and [GU Rev 3] — "Welding report (heat transport) pipes and installations"

- Framed header: owner standard line left; a **QR code** top right (identifies the isometric); row "Pre-commissioning" | "WELDING REPORT (HEAT TRANSPORT) PIPES AND INSTALLATIONS"; then label/value rows: Project site, Project No., Visual inspection report(s) (Rev 2 only), Location or line number, Drawing No., Page.
- Table like [WQ]: identification mark, Diam., Wall thk., Material, Pipe (Coating, Installed length), Description, POS | Weld no., Welder, WPS no., Fixed points on route map (KM), VT-no. | NDT pairs for AUT/Phased Array, Radiography, US dubb., US las, ToFD, MT bevel, MT cap | Weld coating.
- Footer grid: rows Construction Supervisor / Signature / Date × columns Contractor / Client, and a box "Inspector's Stamp".

## 8. Other documents (same header conventions)

- Blank LISL template: the LISL frame with empty rows.
- Weld card / Weld labels: per selected weld — project, isometric, weld number, type, diameter, WPS, welder — with a QR code used by handheld scanning.
- Punch list - blank: project and isometric header with empty rows for items (type, description, due date, contractor, sign-off).
- Punch list (filled), Flange report, Certification index, MTO report (per operation phase), Pick list, NDT / NDT-Pre / PWHT requests (per isometric or mass), Prefab and Field release documents, Hydrotest request, Visual inspection report.
- ISO Book: one merged PDF per isometric (or for several) assembled from the checked parts — see `mto.md` "ISO Book" for the list; attachment names marked "ISO Book" are inserted before or after the isometric drawing according to their Position.

## Notes for our implementation

- Texts that name a third-party owner or its document numbers on the owner-specific forms ([GU], [MV], [ISS], [WQ], [GU Rev 2/3]) must come from the main project's Document settings or from data, not be hard-coded.
- Signature images from the Signatures page are placed in the signature lines when "Signature on each page" is ticked.
