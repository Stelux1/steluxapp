# Reference capture — WeldPilot master data

Observed read-only on 2026-11-15 on the reference site (sandbox project site "Zandbak"). No form was submitted.
Notation: `Label [name type]`, `*` = required, `sel{n}` = select with n options (first options shown).
Field `name`s are the reference's own form names; use the **labels** for our UI and our existing field names in `shared/resources.ts`.

## Pattern shared by many catalogs: "Enabled on this site"

Catalog records are global; each project site switches them on or off. Lists show a column **Enabled on this site**, the add form has a checkbox **Enable on this site (<site>)**, and the page has an **Options** menu with "Activate on this site" / "Deactivate on this site" for the checked rows. Seen on: Weld type, Coating, Spools, Material supplier, NDT process, Defect codes, NDT locations, PWHT process, PWHT locations, QA/QC engineers, Laydown areas. WPS additionally has a global deactivate and a "copy to site".

Every list has: page-size select, search box, CSV / Excel / print buttons, edit and delete icons per row.

## Welder data

### Welders (Personnel → Welder)
- Tabs with counters: **Active**, **Inactive**, **Deleted**. Chip "Home location: <site>". Site selector at top. "Reset filters".
- Columns: ID nr. | Name | Company | Role | Customs | Active on projects | Currently on | Note | Active | Options
- Add Welder: ID nr. [uid* text], Name [name text], Welder ID Nr. [welderid text], Address, Zip code, Residence, Phone, Email address [email], Active [sel: Inactive/Active], Company [sel], Welder 1 [sel — alias from weld-stamp list], Welder 2 [sel], Date of birth, Currently on [text], file upload, Active on projects [multi-select of project sites], Globally deployable [checkbox], Combination [checkbox]
- Filter welders (by qualification): Welding wire [sel], Weld process [sel], Diameter [sel], Thickness [sel], Pos [sel], BW/FW [sel], ASME/EN [sel]
- Per welder: certificates and files dialog, welder card (view / edit).

### Roles
- Columns: Role | Abbreviation | Max amount tasks | Lead role? | Options
- Add Role: Role [name*], Abbreviation [abbreviation*], Max amount tasks [max_tasks], Lead role? [checkbox]

### Certificates (welder certificate types)
- Columns: Name | Abbreviation | Options
- Add Certificate: Name*, Abbreviation*

### Customs (welder qualification types)
- Columns: Name | Abbreviation | Options
- Add Custom: Name*, Abbreviation*, Diameter from, Diameter to, Wall thickness from, Wall thickness to
- Expired customs produce the header counter "Expire warnings" (entries like `W01 Custom - 141|FM1-FM2|ISO9606-1/NEN3650 · 04.04.2024 Expired`).

## Weld data

### Weld process
- Columns: Weld process | Options. Add: Weld process*

### Weld type
- Columns: Weld type | Shop/Field | Abbreviation | Joint type | Groove type | Enabled on this site | Options
- Add weld type: Weld type*, Shop/Field* [sel: Shop / Field], Abbreviation*, Joint type, Groove type
- 18 types in the sandbox: Butt Weld, Branch welds, Socked welds, Reinforcment Pad GW, Reinforcment Pad FW, Longitudinal Welds, Fillet Weld, Victaulic Joint — each as Shop and Field — plus HOOK-UP. Abbreviations seen in the weld table: WS (shop), FW (field).

### Coating
- Columns: Coating | Abbreviation | Enabled on this site | Options
- Add coating: Coating*, Abbreviation*, Enable on this site

### Spools (catalog of spool names)
- Columns: Spool name | Enabled on this site | Options
- Add spool: Spool name*, Abbreviation*, Enable on this site

### WPS methods, PQR
- Already compared field by field — see `PARITY.md` rows "WPS" and "PQR". Add PQR has 55 inputs (26 attributes, each with a reusable dropdown plus an "add new" input, and a file).

## Material data

### Weld diameters
- Columns: Diameter | Size in mm | Size in inches | Outline in mm | Sorting | Options
- Add: Diameter*, Size in mm*, Size in inches, Outline in mm, Sorting

### Material part
- Columns: Part | Custom | Options. Add: Part*, Custom
- Sandbox values: Pipe, Elbow 45, Elbow 90, Flange, Tee, Reducer, Nipple, Valve, Cap, Swivel Flange, Swivel Male, Ball race, Female Flange.

### Type of material
- Columns: Type of material | Type of steel | Material description | Basic material | Material group | ISO / ASME | Options
- Add: Type of material*, Type of steel*, Material description, Basic material, Material group, Lucefin group nr., ISO 15608 group [sel, 32 values: 1.1, 1.2, 1.3 …], ASME P-Number [sel, 16: P-1, P-3, P-4 …], ASME Group Number [sel: 1–5]

### Material supplier
- Columns: Name | Address | Email address | Phone | Enabled on this site | Options
- Add: Name*, Address, Zip code, Residence, Mailbox number, MN-Zip code, MN-Residence, Phone, Fax, Email address

### Welding wire
- Columns: Index number | Charge number | Rod type | Type of material | mm | Certificate-type | Attest number | Supplier | Ctrl. | Accp. | Options
- Filter: Project
- Add welding wire: Charge number, Attest number, mm [number], Rod type, Type of material, Norm, Project [multi-select incl. ALL], Supplier [sel], Certificate-type, Controlled [checkbox], Accepted [checkbox], Note, file

### Certifications (material certificates — shared with MTO Pilot)
- Buttons: Import certifications | Export to ZIP | Add certification | Refresh. Filter by project.
- Columns: Index number | Charge number | Certificate-type | Attest number | Material No | Type of material | Material part | Basic material | Dia. | Schedule | Wall thickness | Supplier | Ctrl. | Accp. | Options
- Example row: 0001 | 11111 | 3.1 | 22222 | 7633186631 | A106 Gr B | Pipe | C-Si | 1/2" | 40 | 7,2 | PFF BV | controlled ✓ | accepted ✓
- A certificate file can be attached (file icon next to the index number).

## NDT data

### NDT process groups
- Columns: NDT process group | Description | Options. Add: NDT process group*, Description
- Sandbox groups: RT, PT, MT, UT-ToFD, VT, PA, MT-b, PT-b, UT, PMI, FERRITE

### NDT process
- Columns: NDT process | Description | Group | WPR | Enabled on this site | Options
- Add: NDT process*, Description*, Method [sel, 12: RT, PT …], WPR [checkbox], Enable on this site
- Example: `RT - Execution: EN ISO 17636-1 class B / acceptance: EN ISO 10675 Lv1`

### Defect codes
- Columns: Code | English | Dutch | Group | Norm | ISO 6520-1 | Enabled on this site | Options
- Add: Code*, English*, Dutch, Group [sel, 6: Crack, Cavity, Inclusion …], Norm [sel: Current list, ISO 6520-1, ASME B31.3 …], ISO 6520-1 reference

### NDT locations / PWHT locations
- Columns: location | Enabled on this site | Options. Add: location*

### PWHT process
- Columns: PWHT process Nr. | Description | Enabled on this site | Options. Add: PWHT process Nr.*, Description*

## Welding data

### QA/QC engineers
- Columns: Name | Company | Phone | Email address | Stamp | Enabled on this site | Options
- Add: Name*, Company*, Phone, Email address, Stamp, Level, Certificate 1, Certificate 2, Enable on this site

## General data

### Companies
- Columns: Name | Address | Phone | Email address | Options. Add: Name*, Address*, Phone, Email address

### Attachment names
- Columns: Name | ISO Book | Hydrotest | Options. Manual sorting toggle.
- Add: Name*, ISO Book [checkbox], Hydrotest [checkbox], Position [sel: Before Isometric / After Isometric]
