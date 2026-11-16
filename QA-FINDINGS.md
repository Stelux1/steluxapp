# QA findings

## 2026-11-16 — Weld Pilot — hosted profile

Sweep of `/weld` and the shared entry in the hosted release profile `welding-workspace` (pilots feature), on a fresh sample database (`.data/welding-workspace` moved aside to `.data/welding-workspace.qa-weld-202611160223`; administrator created with `POST /api/auth/setup`). Browser pane at 1440 × 900 and 390 × 844, plus HTTP-level checks for the PDF endpoints and stored records. Accounts: the administrator and the seeded weld-only account Mila Kovač (Weld Pilot profile set to "Only review", password set through the user form and recorded in `.data/dev-login.txt`).

Verify (`npm run typecheck && npm test && npm run build:local && STELUX_RELEASE_PROFILE=welding-workspace npx vite build && npm run build:server`) passed before each commit (406 tests pass).

### Findings, by severity

1. **Major, fixed.** The weld table's inspection cells never showed a result. `client/weld-inspection-cell.tsx:17`, `client/inspections.tsx:148` and `:433` passed the workspace rows (`inspection_results`, `inspection_requests`) to `inspectionCellState` (`shared/inspections.ts:125`), which reads `results` / `requests`. Scenario: record NA on weld W100 in the NDT dialog. The repair weld W100R1 is created, but the W100 NDT cell still says "Yes" with no ✖ and no T (tracer details) button. Accepted welds W001 / W010 showed no ✔ either, and the NDT/PWHT Manager cell and the PWHT dialog were wrong in the same way. Fix: `workspaceCellRows()` maps the rows, with a test in `tests/inspections.test.ts`.
2. **Major, fixed.** Punch sign-off with "Sign on screen" could not be submitted. At `client/punch.tsx:258`, `onChange={setRead}` handed the SignaturePad reader function to a state setter. React called it as an updater and stored the returned Promise. Scenario: Punch lists → item → Mark as finished → Client, name, company, draw a signature → "read is not a function". The reader is now stored as the value; finish → passed → removed was walked end to end.
3. **Minor, fixed.** A validation error in Add weld / Mass edit welds was out of view. The banner sits at the top of a long form that is usually scrolled to its end, and focus stayed on the submit button (`client/weld-entry.tsx`, `Failure`). Scenario: mandatory fields on, pick a welder, scroll down, press Add weld. Nothing visible happens. The first invalid field now takes focus, or the banner scrolls into view.
4. **Minor, fixed.** Keyboard reorder lost focus. The Move up / down arrows are disabled while saving, so focus dropped to `<body>` after each move (`client/weld-entry.tsx`, `reorder`). Focus now returns to the moved weld's arrow, or to the other arrow once the weld reaches an end.
5. **Minor, fixed.** Tables could make the whole page scroll sideways at 390 px. A visually hidden header label (`.sr-only`, position absolute) at the end of a wide table escaped the `.table-scroll` clipping, because the scroll box was not its containing block. Scenario: Assign Iso to FWP at 390 px. The page was 889 px wide. Fix: `.table-scroll{position:relative}` (`client/styles.css`).
6. **Minor, fixed.** On a tracer weld, the T button also showed in the NDT (Pre) column even when that column does not apply (`shared/inspections.ts`, `inspectionCellState`). It now shows only where the weld is examined. Test added.
7. **Minor, fixed.** Labels in Punch lists → Add item did not match the 2026-11-16 capture: "Category" should read "Type" and "Isometric" should read "ISO". The fix is a hosted-only label in `shared/welder-data.ts` `HOSTED_LABELS`. Other profiles keep their labels. Test in `tests/punch.test.ts`.
8. **Minor, fixed.** Change password had no repeat field (capture: current, new, repeat), and its error was not announced (`client/App.tsx`, `PasswordDialog`). With the pilots feature it now asks for "Repeat new password" and checks that the two match. Profiles without pilots keep two fields.
9. **Major, open (product decision).** The visual inspection hub records "Accepted" for every listed weld unless "Not applicable" is chosen (`client/inspections.tsx`, `VisualInspectionHub`: the radios default to Accepted, and "Welds" defaults to All welds). Scenario: on STX-CW-001 tick Accepted for W100 / W201 and Not applicable for W202, then save. W028, which was never inspected, becomes Accepted. W019, which was Not applicable, is overwritten to Accepted. The toast says "saved for 7 welds". The capture lists `accepted[]` / `not-applicable[]` checkboxes, which suggests a weld gets a result only when ticked. To decide: start with nothing ticked (or the weld's latest VI outcome), and send only the ticked welds.
10. **Minor, open.** Sample data: seeded welds W019 / W028 (and the other seeded welds with `chargeNo` text but no `certificate1Id` / `certificate2Id`) show Chg.No. "H-1042" with Idx and Material "—". W001, with the same charge, shows "0001" and the certificate material (`server/seed.ts:91`). Edit weld shows no charge selected for them. To fix, link the seed welds to `certificate-1`. That changes sample data, so it was left for the owner of the seed.
11. **Minor, open.** The NDT dialog's "Welder" shows the welder's ID nr. (W-002), while the table's Wdr column shows the stamp (W01-518) (`client/inspections.tsx`, `NdtWeldDialog`). The capture only says read-only. Showing stamp and name would be consistent.
12. **Minor, open.** Label differences that need a decision because the field label also drives a list column. Hydrotest "Add test system" says "Name" where the capture has "Test system", but the list column is "Name" in the capture. Its acceptance select says "Select test system accepted by client" where the capture has "-- Not set --". The Defect codes column says "ISO 6520-1 reference" where the capture has "ISO 6520-1". Hydrotest request says "Include isometrics" where the capture has "Include isometric(s)".
13. **Minor, open.** At 1440 px the NDT dialog's five-round table is 70 px wider than the dialog, so "Additional 3" needs a horizontal scroll (the scroll hint is shown).
14. **Minor, open.** In the punch Add item "ISO" select, isometrics are not sorted by number (STX-SK-010 comes before STX-CW-003).

Console: no errors from the screens above after the fixes. The only errors seen came from deliberate failed saves (422) and from an older session's log in the same tab.

### Screens verified clean

- Entry: sign-in, workspace selector (Weld Pilot / MTO Pilot tiles), main project selector, Weld Pilot shell with Switch, Change project, Expire warnings (counter 3, popover with the 30 / 60 / 90-day choice) and Recent activity.
- Dashboard: WDI panel, KPI cards, 14 filter fields with Filter / Reset (Weld type = Field changes the KPIs), inspection compliance groups (Not compliant / Compliant / All groups).
- All 48 Weld Pilot menu pages open with their heading and columns, without failed requests: General data (Project sites, Companies, Attachment names, Documents), Start, Welder data (Welders with the Active / Inactive / Deleted tabs, Roles, Certificates, Customs), Weld data (WPS methods, Weld process, Weld type, Coating, Spools), Material data (Weld diameters, Material part, Type of material, Material supplier, Welding wire, Certifications), NDT data (NDT process groups, NDT process, Defect codes with "Enabled on this site" and Options → Activate / Deactivate on this site, NDT locations, PWHT process, PWHT locations), Welding data (Projects, Isometrics list, ITPs, Weld register, Data LISL, NDT/PWHT Manager with its eight tabs, Inspection results, QA/QC engineers, Export weld data), Releases (Prefab release, Field release with Show released, Assign Iso to FWP, Hydrotest release, Request archive, Punch lists, Flange Management), and System (Change password, User accounts with per-pilot columns, Profiles, Signatures, Company data). PQR is not in the hosted menu, and `/weld/welding/pqr` shows "Page not found".
- Certifications: the mandatory-field rule lists the seven required fields when the site setting is on.
- Isometrics list: six KPI cards, flag columns and filters. Set phase for checked isometrics saved. Copy isometrics with welds copied two isometrics to STX-2403; the target is required (button disabled until chosen).
- Isometric page (STX-CW-001 / STX-CW-003): six header cards, blockers, progress card, Options menus, and Reports → LISL Report, LISL Report (A3) and Blank LISL template (each returns `application/pdf`, `%PDF-1.7`).
- Weld table columns match the capture.
- Add weld: all 26 inputs and the section labels match. Weld no. is required. Mandatory fields apply once a welder is chosen. The charge-number lookup fills Index number / Material / Description / Diameter. "Upd. prev. weld" copied the charge to W028's second side.
- Add welds (range): End lower than Start is refused. W201–W203 were added.
- Mass edit welds: 43 inputs. The mandatory rule is reported per weld with highlighted fields. The update was applied to two welds.
- Delete weld with confirmation, Show deleted welds → Bring back, arrow and keyboard reorder.
- NDT dialog: five rounds, NA length and Defect type in the Initial round only, ReWeld? in Remaining. NA creates W100R1. Tracer details linked two tracers (the limit of two is enforced).
- Visual inspection for several welds. The cell states update; see finding 9.
- Field release Reopen: a reason is required. Field welds unlock while shop welds stay locked under the active prefab release.
- Punch lists: KPI cards, filters, Add item (validation, then save with a long description), Mark as finished with a drawn sign-off, Report passed, Mark as removed.
- Hydrotest: Add test system (long name), Open the test system, Add hydrotest request (Test record no. required), new request listed.
- Signatures: pen drawing saved as the full signature. Upload refuses a .txt file and saves a PNG short signature.
- User accounts: the edit form shows per-pilot Enabled + profile. Weld-only account: lands in `/weld` without the selector or Switch, has no write controls under "Only review" (Add weld / Mass edit disabled, the NDT dialog is read-only, Set phase disabled), and `/mto/dashboard` shows "You do not have access to MTO Pilot".
- 390 px: 45 Weld Pilot pages without page-level horizontal overflow after fix 5. Tab strips (NDT/PWHT Manager, Data LISL) scroll inside their own box.
- Dialog focus: dialogs trap Tab, and Escape closes them. The first invalid field takes focus (fix 3).

### Not checked

- The content of the generated PDFs (only status, type and signature bytes; no PDF text tool was available), and the other LISL variants.
- PWHT upload (single and multiple welds), the Pre-HT/PWHT request, Generate Mass NDT / NDT-Pre requests and Upload NDT on multiple welds.
- Prefab release of a ready isometric and the Prefab locks after a fresh release (none of the sample isometrics was ready; only the seeded released STX-CW-003 was used). Create release doc, Request archive filters.
- Flange Management add / edit (44 inputs), Excel import, labels. Assign Iso to FWP assignment. Hydrotest "Record result", documents and moving isometrics between test systems.
- Edit weld with "Upd. next weld", Stamp weld, the Attachments and Audit trail dialogs, Profiles editing, Company data logo sliders, and the Export weld data report contents.
- The 390 px check of dialogs (only pages), and the 390 px check for the administrator (it ran with the read-only account).
- The profiles `full`, `welding-demo` and `access-prototype` in the browser. They are covered only by the automated tests and builds; the label and password changes are gated on the hosted profile / pilots feature.
- The MTO Pilot (out of scope for this sweep).
