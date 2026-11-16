# 5.28 Isometrics list
URL: https://websonik.com/kennisbank/5-28-isometrics-list/ — Updated 26-08-2024
Two ways to see isometrics: via an operational system (chapters 3.5, 3.5.1) or directly via menu **Isometrics** (all isometrics regardless of operational system; filter + quick filter; shows current status).
Options menu: 'Delete all isometrics' (application administrators only; use with care); 'Delete selected isometrics' (select first); 'Edit Isometrics (Mass Edit)' (select isometrics, fill the fields to change/add, 'Update'; typical after importing isometrics with incomplete info); 'Set Phase (Mass)' (set progress phase for multiple isos; e.g. a preparer marks that materials have been drawn/taken off: select isos, switch first option on, 'Update'); 'Generate ISO Book' (work folders).
**Status flag columns** (indicators in the list):
- NoBo: X = No Notified Body line (Iso); check = Notified body line.
- PWHT: X = No PWHT line (Iso); check = PWHT line.
- M (MTOPilot): X = no materials yet; check = materials present.
- E (ESTPilot): X = no calculation yet; check = calculation present.
- W (WeldPilot): X = no welds yet; check = welds present.
- Pfb (Prefab): X = prefab not ready; X (second state) = prefab ready not signed off ("gereed niet afgemeld"); check = prefab ready and signed off ("afgemeld").
- Fld (Field): X not ready; X ready not signed off; check ready and signed off.
- Doc. (Iso): X = no ISO document present; check = ISO present.
No indicator in Pfb / Fld = no welds present (not created or no welding work).
Data refreshes automatically every morning; 'Laatst refresh' (last refresh) date/time shown; button 'Vernieuwen' (Refresh) refreshes now and is visible for all users immediately.
No "KPI cards" are described in the text; screenshot 5 (lazy) probably the list/legend. The two X states for Pfb/Fld presumably differ in colour (red vs orange; to confirm from screenshot).

## Screenshot findings (from screenshot)
- Iso overview inside an operational system (breadcrumb "Zandbak / Project 01 ... / Iso"): columns ISO, IRN, Rev. no., ITP No, Asset tag, Piping class, Drawing no., NoBo (Yes in red), X-Ray %, PWHT (No in green), Priority, Status (percentage e.g. 35.2%), Started (small icons). Top right buttons "Options" and "Add". Options menu entries: Delete all isometrics; Delete selected isometrics; Edit isometrics (Mass edit); Set phase (Mass); Generate iso book; Generate grouped iso book; Show deleted ISO's; Copy selected isometrics.
- **Edit isometric (Mass edit)** dialog fields: IRN, Revision number, ITP No, ITP No 2, Asset tag, Drawing no., Date, NoBo Reg. no., NoBo serial, Piping class, Test pressure, Test system, Test medium, X Ray %, PED Cat.-Mod, Nom. diameter, Material, Paint spec., RAL, Insulation, Elevation, X axis, Y axis, Zone / Area, Priority (dropdown, default "Not changed"), Chemical clean, Tracing Spec, NoBo (dropdown ---), PWHT (dropdown), file pickers "Isometric" and "ITP document" ("Nothing selected").
- **Set phase (Mass)** dialog: seven+one checkboxes: Materials (MTOP); Estimate (ESTP); Welds defined (WP); Isometric formatted; Field documentation; Test documentation; Release documentation; Work preparation 100%. Buttons Update / Cancel. (These are the work-preparation KPIs/phases.)
- **Isometrics list** (menu Isometrics): header "Isometrics list", right "Last refresh: 22.08.2024. 03:35", buttons refresh icon and "Filter", page-size selector (20), Search box. Columns: Project, ISO No, IRN, ITP No, ITP No 2, P.Class, NoBo, PWHT, M, E, W, Pfb, Fld, Doc., Prio., Opts (link "Open"). In the example: NoBo "Yes" (orange) and PWHT "No" (green) as coloured text; M and E shown as red X, W as green check, Fld as orange X (= field ready but not signed off), Doc. as red X, Pfb blank (no prefab welds). So the first X state is red, the second X state ("ready, not signed off") is orange.
