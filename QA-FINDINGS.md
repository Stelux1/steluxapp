# QA findings


## 2026-11-16 — detailed parity audit

Scope: the whole of Weld Pilot and MTO Pilot (hosted profile `welding-workspace`) against the reference WeldPilot / MTOPilot, from the live first version `2f41d99` through `c1c123a` (capture tooling) to `e5209c9` (end of the four waves) and on to `df5617a` (second scenario walk fixes, security reviews 2 and 3, hosted-upgrade, PostgreSQL and old-stock fixes; branch `claude/blitzkrieg-detailed-audit-615f44`). Nothing of this section is released.

### Method

1. **Capture.** The reference was captured read-only: page captures and their JavaScript (`reference/montavar/raw/`), five browser passes (`_interactive/I1`, `I2a`, `I2b`, `I2c`, `I3`), 81 tidy reference notes (`reference/montavar/weld/`, `mto/`, `shared/`), the vendor manuals and knowledge base, the client's documents (`_client-docs-digest.md`). No form was submitted. Two pages changed state on opening: MTOPilot → Isometric execution, opened once on purpose on 2026-11-16 at 14:10 (it recalculated the material status of 7 isometrics), and the NDT archive page, which appears to refresh a cache when opened. Generated documents were not opened (opening generates them).
2. **Comparison.** 22 areas compared screen by screen against our application; 605 ledger entries (`_findings/LEDGER.json`).
3. **Refutation.** Every finding was challenged by a second reader (`<area>.verdicts*.json`); a second source pass settled or narrowed 83 of the 111 entries that needed an answer, capture or decision (`_findings/OPEN-ITEMS.md`).
4. **Scenarios.** 17 working scenarios walked on our application (`_scenarios/SA`, `SB`, `SC`: S1–S17). Steps were done on screen in the built-in browser where the reports say so; SC did most steps through the HTTP API because the browser pane shared one cookie jar between instances.
5. **Four waves of fixes,** each flow on its own branch, merged into an integration branch and verified (52 flows: wave 1 six, wave 2 fourteen, wave 3 twenty-one, wave 4 eleven; merge commits below). Per finding: outcome, what the user sees now, what is left open, commit (`_findings/outcomes/wave1-4.json`).
6. **Security review 1** of `c1c123a..9836f11` (integration/wave2): ten findings, all handled in wave 3 (`w3-security-fixes`). **Security review 2** of `9836f11..e5209c9` (waves 3 and 4): 13 findings (2 high, 4 medium, 7 low), all fixed in `cb66367`, `cc2ed5e`, `89b9a18`. **Security review 3** of `e5209c9..a6490c8`: no critical, high or medium finding; two low findings left open on purpose.
7. **Second scenario walk** of S1–S17 on the merged code `e5209c9` (`_scenarios/SA2.md`, `SB2.md`, `SC2.md`), then fixes of its new defects (`8b06dde`, `b651bbf`, `925062a`).
8. **Hosted upgrade and rehearsal**: data steps made strictly insert-only and the rehearsal made row-by-row (`6e64e64`); PostgreSQL fixes (`a1cda34`, `5c7e6c9`); old stock counted per main project (`db4dea4`), also on the hosted server and in the browser (`cf99e5e`); four rehearsals on copies of the live data (the fourth, on `df5617a`, is the final one).

Verify at `e5209c9` (end of wave 4, lead's run): 1057 tests, 0 failures. Verify at `88e4c40`: 1092 tests, 1078 pass, 14 skipped. **Verify at `df5617a` (lead's own full chain): 1097 tests, 1083 pass, 0 fail, 14 skipped (PostgreSQL), all builds pass.** On PostgreSQL (fourth rehearsal) the whole suite passes: 1097 of 1097, none skipped.

### Counts (checked with a script against the JSON files)

Ledger, 605 entries by status: confirmed 274, confirmed-corrected 249, needs-owner-decision 26, refuted 16, needs-capture 13, needs-client-answer 12, duplicate 10, not-a-defect-owner-decision 3, not-a-defect-deferred 2. To fix (confirmed + confirmed-corrected): 523, of which 509 have a wave outcome; the other 14 are listed below.

Outcomes: 518 records (wave 1 lists two findings twice), 516 per wave, 515 distinct ids (514 ledger findings plus the flow record `w2-upgrade-additive`; iso-shared-013 appears in wave 3 and wave 4). Final state per id (the later wave wins): **fixed 475, partly fixed 30, wrong finding 8, not fixed 2.** Six outcomes are on entries the ledger still marks open (needs-capture fixed 1 and not fixed 1; needs-client-answer fixed 2; needs-owner-decision fixed 1).

| Wave | Flows | Findings (distinct) | Fixed | Partly | Wrong finding | Not fixed | Questions (client / owner) |
|---|---|---|---|---|---|---|---|
| 1 | 6 | 91 | 82 | 9 | 0 | 0 | 18 / 14 |
| 2 | 14 | 137 | 120 | 14 | 3 | 0 | 44 / 12 |
| 3 | 21 | 225 | 213 | 7 | 4 | 1 | 64 / 33 |
| 4 | 11 | 63 | 60 | 1 | 1 | 1 | 42 / 14 |

Seven of the 30 partly-fixed findings had their open part closed later under another finding id (the outcome record itself was not updated): weld-catalogs-material-ndt-037 and -039 (all 98 defect codes ship, w1-left-3, wave 3); iso-shared-017 and weld-releases-019 ("1 open pre-punch", wave 3 merge decision); iso-shared-030 (IRN field greyed, iso-shared-031, wave 4); weld-inspections-R1 (VI column follows the report, weld-inspections-001, wave 4); scn-SC-D6 (server-side site for every account, w3-access-session-sites). Counting them as fixed gives fixed 482, partly fixed 23.

The 241 builder questions were merged into 38 client questions plus a minor table, and 20 owner questions plus a minor table, in `CLIENT-QUESTIONS.md`.

### Findings not fully fixed, with the reason

Not fixed:

- **iso-shared-013** (Quality % on 0001: ours 81.3 % (13/16), reference 72.7 %). No rule reproduces it; five of 25 archive rows were not captured. Client question 13.
- **scn-SC-N3** (Inv. repeats the whole balance on every line of the same material). No capture shows the same material on two lines. Client question 3.

Partly fixed (open part still open at `e5209c9`):

| id | Left open | Why |
|---|---|---|
| access-users-profiles-007 | Area 125 "Prefab/Field release" missing, so External's ticks cannot be stored; Admin is our renamed profile; existing workspaces untouched | area not built; client question 38 |
| access-users-profiles-012 | Areas 36, 83, 95 have no page here; MTO dashboard areas gate only in the page | pages do not exist; owner minor table |
| access-users-profiles-023 | Editable sign-in name, password label and rule, one profile per pilot left out (Storehouse manager came in wave 4, delta-I2b-005) | lead's instruction; owner V1, V2 |
| delta-I3-009 | The "Selected" summary in Add material is built but no test renders it | test gap only |
| iso-shared-034 | Deleting a revision from Current revisions | not built |
| mto-iso-execution-R1 | Rounding, credit for own untaken pick list, stock beyond ordered, sharing one material | client question 2 |
| mto-logistics-015 | 100-rows-per-page paging on Service request | not built |
| mto-procurement-stock-012 | Certificate PDF and charge fields left out of Edit item | certificates belong to a site, storehouses are company-wide; client question 26 |
| mto-procurement-stock-030 | Duplicate storehouse names refused by a unique index | replacing a live index is not insert-only; owner V6 |
| scn-SB-N7 | All ten LISL variants are always listed | no rule found; client question 24 |
| scn-SB-N8 | ISO Book lacks Flange labels, welder's certificates, the 14 MTO report types, custom docs | not built |
| scn-SC-D3 | A site-inventory transfer or removal may eat reserved stock | client question 3 |
| sec1-010 | `trust proxy` not set; counter in memory per instance | hosting; owner V8 |
| shell-general-031 | Theme switch and Privacy Policy link; logo checked in tests only | owner V12 |
| shell-general-032 | Main-projects card screen texts (isometric lists done by w1-left-11) | not changed |
| shell-general-R1 | The server accepts a site with no weights at all | owner minor table |
| weld-catalogs-material-ndt-005, weld-catalogs-welder-weld-015 | Reference titles only on nine catalogs plus Roles | other catalogs not covered |
| weld-catalogs-material-ndt-022 | No Refresh button (the Subproject label was fixed by w1-left-5) | not built |
| weld-catalogs-material-ndt-023 | Wire numbers not independent per main project; older shared certificates stay shared; qualifications may point at another site's wire | unique wire name index stays; owner V6 |
| weld-iso-welds-016 | Sleeve is a text field | no sleeve catalog |
| weld-punch-flanges-021 | Flange ID optional only once per isometric; "Requires enhanced control" caption | unique rule stays (merge decision); owner V6 |
| weld-releases-034 | ITP matrix and ITP templates | page without rights; client question 32 |

Wrong findings (8; the reference already does what we do): mto-logistics-011, scn-SA-N1, scn-SB-N1, scn-SB-N2, scn-SB-N5, scn-SB-N6, w1-left-2, weld-catalogs-welder-weld-R2.

To-fix findings with no wave outcome (14): five PARITY.md corrections done in this documentation pass (weld-catalogs-material-ndt-006, -033, weld-iso-welds-035, access-users-profiles-025, mto-logistics-021); shell-general-026 (menu extras: owner V3; its Weld process / Request archive and Transfer orders parts were built via shell-general-025 and mto-procurement-stock-010); w1-left-4 (rich text: owner V4); mto-logistics-R1 (QR closing: Handheld, deferred); mto-catalogs-R1 (Shop-typed phases: client question 10); weld-iso-welds-R2 (Mass edit unticked flags: client question 20); weld-catalogs-material-ndt-R5 (catalog tabs: owner V19); weld-dashboard-reports-R1, -R2, -R3 (dashboard scope, Project book, Repaired: client questions 15, 16; R3 has a default behind `isRepairedWeld`).

### Scenario defects and their fate

First walk (S1–S17, before the fixes). 20 defects in the ledger (18 D items and two N items of kind defect):

| Defect | Severity | Fate |
|---|---|---|
| scn-SA-D1 lost session drops to sign-in silently | medium | fixed (w2) |
| scn-SA-D2 raw parser text on a non-JSON answer | low | fixed (w2) |
| scn-SA-D4 changing Treatment / Examination unticks welds | medium | fixed (w3) |
| scn-SA-D5 Tracer details overlap at 1024 × 768 | low | fixed (w2) |
| scn-SB-D1 locked weld accepts NDT results after release | high | fixed (w2, 423) |
| scn-SB-D2 duplicate Flange ID / ITP number gives the generic 409 | medium | fixed (w2) |
| scn-SB-D3 action-route refusals lose their text | high | fixed (w2) |
| scn-SB-D4 punch numbers jump | low | fixed (w2) |
| scn-SB-D5 negative torque "between 0 and ∞" | low | fixed (w2) |
| scn-SC-D1 every 409 shows the generic sentence | high | fixed (w2) |
| scn-SC-N1 custom material with an existing number gets the generic refusal | low | fixed (w2) |
| scn-SC-D2 Controlled-but-not-Accepted certificate accepted on a weld | high | fixed (w3) |
| scn-SC-D3 reserved stock transferable without warning | high | partly fixed (w2); rest is client question 3 |
| scn-SC-D4 Materials tab 86.5 % against the board 70 % | high | fixed (w2) |
| scn-SC-D5 started isometric still offers Reserve and Start | medium | fixed (w3) |
| scn-SC-D6 Request archive lists another main project's requests | high | partly fixed (w2), closed by the server-side site in w3 |
| scn-SC-D7 limited account receives welders of another main project | high | fixed (w2) |
| scn-SC-D8 editing one line moves Ordered between lines | medium | fixed (w3) |
| scn-SC-D9 out-of-scope PDF answers 404 instead of 403 | low | fixed for isometric PDFs (w2); still there in the second walk for other PDFs; fixed in `925062a` (welder, release, hydrotest request and order PDFs answer 403 `site`) |
| scn-SC-N9 MTO bootstrap carries a subproject switched off for MTO | medium | fixed (w2) |

The 19 scenario differences ended: 11 fixed, 5 wrong findings, 2 partly fixed (scn-SB-N7, -N8), 1 not fixed (scn-SC-N3). SA's D3 and D6 were marked "not defects" by the walker itself.

### Second scenario walk (S1–S17 on the merged code `e5209c9`)

Run on 2026-11-16 by three walkers on their own instances (own host names, so no session was lost this time); every saving step in SA2 and SB2 was a real click on screen; SC2 did the refusal checks, PDF reads and parts of S13, S14, S16, S17 through the HTTP API. Files: `_scenarios/SA2.md`, `SB2.md`, `SC2.md`.

**All 17 scenarios reached the goal; 5 with a detour:** S2 (a welder first had to be qualified for the WPS), S4 (NDT location and process set in Mass edit first; repair weld added by hand, as the reference does), S9 (Add flange could not save; the flange was created through the API), S13 (Order materials hid the pipe; an existing pending order was received instead), S17 (a WPS needs a site tick, as in the first walk). S15 reached its goal with a gap: Sign online and Upload were opened but not completed (signature drawing and file chooser could not be driven).

First-walk differences, summed over the three files: 110 gone, 28 still there, 16 changed (the rest not exercised or not judgeable). First-walk defects: SA D4 and D5 gone, D1 and D2 not retested (need a second server or a killed server), D3 not a defect, D6 still there (tracer welds stay in the NDT blocker until examined, iso-shared-015); SB D1–D5 all gone; SC: only D9 still there (fixed afterwards, see below).

Still there as differences (not defects): password rule 10-256, account-level plus per-application profile, 6 operation phases instead of 14 (sample data), WPS needs a site tick, six extra required certificate fields, PQR saved with a name only, Adjust takes the counted quantity, "Set as completed" for the hydrotest, no Language select on punch print.

New defects of the second walk and their fate:

| Walk | Defect | Fate |
|---|---|---|
| SA2 N-D1 (medium) | No welder offered for any WPS on the sample data: qualification documents named no WPS while Validation on WPS is on | fixed in `925062a` (sample welders' documents name the WPS they weld; demo copy remapped) |
| SA2 N-D2 (low) | After Bring back the deleted-welds view stayed open with "No welds added yet for this isometric." | fixed in `925062a` (returns to the active welds) |
| SA2 N-D3 (medium) | PWHT request manager still lists welds with an accepted PWHT | **not changed**: the reference PWHT request manager lists accepted ones too (weld-inspections-030) |
| SA2 N4, N6, N7 | No hint where to set the NDT process; "R00001" against "00001"; PWHT dialog warning read "NDT Request" | fixed in `925062a` (hint, "00001" everywhere, PWHT warning) |
| SB2 N9-1 (high) | Add flange dialog could not save with an isometric chosen (404, the client sent spool and WPS fields) | fixed in `8b06dde` (Add and Edit flange save again; a test posts exactly what the dialog builds) |
| SB2 N7-1 (medium) | Prefab complete can be reopened while Field is complete and released | **not changed**: the reference allows it (weld-releases-006) |
| SB2 N9-2 (low) | List Status and the flange report ignore a signed assembly record (stays "Planned") | **not changed**: no rule in the captures; client question 9 |
| SB2 N9-3 (low) | UTC time on signatures and "Registered", local time elsewhere in the protocol PDF | fixed in `8b06dde` (local clock); also: Record pass asks for a measured stress only against a Target Stress |
| SB2 N7-2, N10-1 (low) | Field release filter matched ITP No 2 only (the S7 detour); the unlabelled icon unlinked an ITP at once | fixed in `925062a` (a Shop+Field ITP in ITP No counts for Field; "Unlink ITP — Unlink <ITP> from this asset?") |
| SC2 N-A (defect) | Order materials netted an unlinked open order twice (pipe missing, tees 50 instead of 66) | fixed in `b651bbf` (an open order counts once) |
| SC2 N-B (defect) | Start on the Shop chip issues the Field-typed lines too | **not changed**: Start issues every available line of the isometric; needs a capture; client question 4 |
| SC2 N-C (layout) | Reserve wrapped under Start and was covered by the next row | fixed in `b651bbf` (checked at 390, 940 and 1400 px) |
| SC2 N-D, N-F (minor) | Doubled Material log text; Today rec. kept after saving | fixed in `b651bbf` |
| SC2 N-H | A limited reader receives welds of welders it cannot read | fixed in `925062a` (bootstrap `welderStamps`: code and name of the welders its welds name, no welder records; checked by security review 3) |
| SC2 D9 | Out-of-scope PDF answers 404 | fixed in `925062a` (403 `site`) |
| SC2 N-E, N-G (minor) | Transfer to project opens with an empty quantity; the Weld reader reads the catalog `materials` | not addressed in the fix commits (Weld Pilot reading materials is the certificate picker's need, weld-catalogs-material-ndt-026) |

The fixes after the second walk (`8b06dde`, `b651bbf`, `925062a`) were not walked again on screen; their tests pass and security review 3 read them.

### Security review 1 and the fixes

| id | Severity | Finding | Fix (wave 3, `w3-security-fixes`, merged in `8b982ff`) |
|---|---|---|---|
| sec1-001 | high | Pilot enablement and pilot-profile changes not judged as access changes; a pilot the administrator is not enabled in counted as all main projects (already live) | Such a pilot counts as reaching none; switching a pilot or its profile is an access change; a limited administrator gets 403 (fixed) |
| sec1-002 | high | An account could change its own pilot profile | No account changes its own pilot enablement or profiles (403, or 409 for the last administrator); on others only an administrator reaching every main project in that pilot (fixed) |
| sec1-003 | high | ISO Book evaluated the other pilot without its main-project access, per-site profile or project switch-off | Other-pilot parts worked out per isometric; otherwise 422 (fixed) |
| sec1-004 | medium | Tracer proposal not limited to the account's main projects | Reads only records the account may read (fixed) |
| sec1-005 | medium | Copy parts judged with the pilot profile, not the target main project's | Add right checked with the target main project's profile; 403 and nothing written (fixed) |
| sec1-006 | medium | Completion fields, X Ray % and IRN writable through Add new and carried by Copy | Dropped / refused with 422 (fixed) |
| sec1-007 | low | Automatic-IRN rule not enforced on bulk edit or a move | Both main projects judged; 422 (fixed) |
| sec1-008 | low | ITP X-Ray sync and Import from isometrics worked on every isometric | Only the isometrics the request reaches (fixed) |
| sec1-009 | low | Duplicate refusal revealed values of other main projects | Message without the value; names stay unique workspace-wide (fixed; owner V6) |
| sec1-010 | medium | Sign-in limit per address only, cleared by any success (already live) | Eight failures hold the account five minutes, 40 hold the address; open: `trust proxy`, in-memory counter (partly fixed; owner V8) |

Not checked by that review (its own list): PostgreSQL row-level security and the Postgres path, the hosting proxy's `req.ip`, the React client beyond raw-HTML sinks, ZIP bombs inside uploaded `.xlsx`, concurrency across serverless instances. Seen out of scope and still open: the ISO Book part "MTO report per operation phase" fails for every account.

### Security review 2 and the fixes

Range `9836f11..e5209c9` (waves 3 and 4) plus the ten fixes of review 1 (all ten hold on `e5209c9`). Every finding reproduced on a seeded SQLite instance except sec2-009 (from the code) and parts of sec2-011. Index: `_findings/security-review-2/INDEX.md`; regression tests in `tests/security-review-2.test.ts`.

| id | Severity | Finding | Fix |
|---|---|---|---|
| sec2-001 | high | Changing a profile's rights not limited to accounts the editor reaches (already live) | refused when an active account using the profile reaches main projects outside the editor's reach, also on archive / restore (`cb66367`) |
| sec2-002 | high | Undo on an NDT request needed only Show on 66 | needs Delete on 76 (NDT) or 94 (NDT Pre) as well (`cb66367`) |
| sec2-003 | medium | Order checked materials ordered requirement lines of other main projects | every line read through the record guard first (`cc2ed5e`) |
| sec2-004 | medium | An account could tick itself Storehouse manager and unlock Adjust quantity | Storehouse manager is an access change: never on one's own account; on another only with Edit on 26 and 53 from an administrator reaching every main project in MTO Pilot (`cc2ed5e`) |
| sec2-005 | medium | Flange evidence could be added after QA/QC sign-off; Release judged live rows | no evidence after sign-off (422); Release judges the evidence of the registered PDF (`cc2ed5e`) |
| sec2-006 | medium | Clean project import and archive reached projects switched off for the pilot | left alone; 404 in that pilot except pilot-flag-only writes (`cc2ed5e`) |
| sec2-007 | low | Project import wrote the other pilot's part into a switched-off project | refused for import and Copy isometrics (`89b9a18`) |
| sec2-008 | low | Removing PWHT documents / NDT results needed only Add | Delete on 97, Restart on 76 / 94 (`89b9a18`) |
| sec2-009 | low | Typed Prefab / Field report number not checked for uniqueness (already live) | refused when used for that phase in the main project; no index changed (`89b9a18`) |
| sec2-010 | low | Stock to project / transfer completion copied certificates of another main project | only certificates the request reaches (`89b9a18`) |
| sec2-011 | low | Inventory → Storehouse transfer orders readable from every main project | readable company-wide by design (storehouses are shared); actions need the source main project (`89b9a18`) |
| sec2-012 | low | Isometric Attachments "Only PDFs" checked the name only | PDF signature, type and name checked; stored as application/pdf (`89b9a18`) |
| sec2-013 | low | A new profile could carry any rights with only Add on Profiles | needs Edit on Users and Profiles, within the creator's own profiles (`89b9a18`) |

Open owner points from review 2: whether Users Edit alone may tick Storehouse manager for another account; whether the QA/QC flange signer must differ from the technician.

### Security review 3

Range `e5209c9..a6490c8` (review 2 fixes, scenario fixes, `6e64e64`). Index: `_findings/security-review-3/INDEX.md`. Probes on seeded SQLite; `tests/security-review.test.ts` and `-2` 23 pass; hosted-preparation, site-scope, access, releases, flanges, mto-stock 157 pass. **No critical, high or medium finding.** All thirteen review 2 fixes hold, two with a gap, left open on purpose:

- **sec3-001 (low):** the new-profile ceiling of sec2-013 applies on create only; an empty profile created first can then be edited to any rights. Owner question V21.
- **sec3-002 (low):** the reach rule of sec2-001 skips archived accounts that use the profile. Owner question V22.

Verdict of review 3: the code may be released from the point of view of sign-in, permissions and the main-project and pilot boundaries. Its "not checked": PostgreSQL row-level security in a real run (and the PostgreSQL run of the rehearsal), several server instances, the React client beyond the server answers; the `sessions` table is outside the rehearsal comparison.

**Review 4 (a6490c8..df5617a):** no critical, high or medium finding; one low finding left open (sec4-001: an old transfer order whose source main project cannot be told can be assigned, picked or cancelled by any account that can read it; completion is refused and no stock moves; not a regression). The savepoint wraps one statement and always rethrows; the derived stock values are never accepted from a client or stored; a limited account receives no other main project's stock through the derivation. Verdict of the reviewer: may be released. Not run against a real PostgreSQL server by the reviewer (the rehearsal ran the whole suite on PostgreSQL: 1097 of 1097).

### Verified by looking

Builders looked at their screens in the built-in browser on their own instance (a copy of the sample database) in these flows, as their reports state: S1a (Project sites table, edit and duplicate dialogs, bell, account menu, Attachment names sorting), C2b (certificates; the 800 px overflow fix was not re-checked), C4 (WPS list, Add WPS, PQR list, Import PQR at 390 px), w2-access-core, w2-flanges, w2-hydrotest (Status card Hydrotest line; not Enter results, Results history, Attachments), w2-iso-state-core (partly), w2-itp-register (not the Link ITP picker, revision upload, import), w2-mto-material-db (375 px), w2-mto-spool-logistics, w2-mto-stock-core, w2-ndt-results-tracers (1024 × 768 and 375 px), w2-punch-model (desktop width only), w3-catalog-shell-leftovers, w3-flange-record (390 px; not the PDF or drawing a signature), w3-iso-list-metrics (both pilots), w3-iso-page-dialogs (not the audit trail or read-only Edit weld), w3-mto-dashboard (375 px), w3-mto-execution, w3-mto-material-sites (375 px), w3-mto-procurement (375 px), w3-mto-stock-ui, w3-ndt-manager (NDT, NDT archive and Pre tabs only), w3-service-request-docs (375 px; PDFs not opened in a viewer), w3-weld-form (not the reason box, not 390 px), w4-dashboard-reports (no PDF seen on screen), w4-memo-templates, w4-ndt-batch-import (375 px), w4-project-import (390 px), w4-project-iso-pages (not Add isometric), w4-spool-catalog, w4-transfer-orders (not Reverse, Cancel or the PDF), w4-weld-dashboard (ITP/KNR Manager at 390 px). The scenario walk SA and SB was done on screen; SC mostly through the API. No save on the reference.

### Verified by test

Every fixed finding has an automated test named in its outcome record, except the client-only changes the outcomes mark as untested (for example weld-iso-welds-004, -012, -042, w1-left-1, w1-left-7, mto-iso-execution-R2, mto-iso-execution-032's Type select, delta-I3-009). Each wave's integration branch passed the verify chain (typecheck, `npm test`, `build:local`, the hosted vite build, `build:server`, `build`); the hosted-upgrade tests were brought up to the merged plan of wave 3 (`b46182d`) and wave 4 (`88d7f44`). At `e5209c9`: 1057 tests, 0 failures. At `df5617a` (lead's chain): 1097 tests, 1083 pass, 0 fail, 14 skipped (PostgreSQL); 1097 of 1097 on PostgreSQL. New since wave 4: `tests/security-review-2.test.ts`, `tests/legacy-stock.test.ts`, the row-by-row upgrade test, the Add / Edit flange payload test and the hosted-profile HTTP tests of old stock (`cf99e5e`).

### What was NOT verified

- **The live site after sign-in.** Nothing after sign-in on the hosted site was checked; the owner must sign in. The rehearsals ran on copies of today's live data, not on the live site.
- **Document contents against reference PDFs.** No reference document was opened (LISL variants, weld card, labels, ISO Book, Punch list - blank, Flange report, request PDFs, dashboard reports, Export.xlsx), because opening generates them; ours were compared with the manuals only, pending the owner's permission (owner V9).
- **Pages without rights on the reference:** ITPs, ITP templates, Storehouses, NDT Batch Import, flange import. Built from the vendor's manual.
- **PostgreSQL.** The whole suite passes on PostgreSQL (1097 of 1097 in the fourth rehearsal; a duplicate refusal gave an internal error on PostgreSQL before `a1cda34`). Without the test databases 14 are skipped. Not checked by any review: PostgreSQL row-level security in a real run, and several server instances (security review 3).
- **Browsers.** No report mentions Safari or Firefox; neither was looked at. Phone widths were checked only in C4, w2-ndt-results-tracers, w2-mto-material-db, w3-mto-material-sites, w3-service-request-docs, w3-mto-procurement, w3-flange-record, w3-mto-dashboard, w4-ndt-batch-import, w4-project-import and w4-weld-dashboard; S1a, w2-punch-model, w2-hydrotest and w3-weld-form say they did not check them.
- **Screens no builder opened in a browser** (reports say so, or do not mention a browser): C1 catalogs (not mentioned), C2a material data, C3 welder data, w2-iso-pages (Add rev, delete, Add new, IRN), w2-refusal-texts (sign-in notice), w2-upgrade-additive, w2-visual-inspection (VT hub), w3-access-session-sites (Delete project site dialog, account menu, sidebar wording, tab sync), w3-access-ui (user editor, signature composition, password dialog), w3-mto-iso-materials (Materials panel Type select), w3-punch-lists (punch dialogs and list changes), w3-release-pages (not mentioned), w3-security-fixes (server only), w3-vt-site-settings, w3-weld-table (weld table, Mass edit, Stamp), w3-welder-card (welder card, certificates and files), w4-exports, w4-inspection-cell (weld cell, PWHT dialog), w4-weld-form-rules (weld dialog layout, optgroups, warning box, Add welds button). Also not opened: the Certifications import and ZIP dialogs (C2b), the WPS copy dialog (delta-I2a-004), the Material log and storehouse transactions list (mto-procurement-stock-032, -R2), NDT Generate dialogs, request detail, undo and restart (w3-ndt-manager).
- **Integration as a whole.** The second scenario walk was the browser pass on the merged `e5209c9`. The commits after it (`8b06dde`, `b651bbf`, `925062a`, the review 2 fixes, `6e64e64`, `a1cda34`, `5c7e6c9`, `db4dea4`) are covered by tests and security review 3 only, and `cf99e5e` by its hosted-profile HTTP tests and the fourth rehearsal; none was walked again on screen. Not done in either walk: drag-and-drop of the sort handle, PDF file pickers, drawing a signature in Sign online, Remove punch item, Upload signed docs, Create release doc, Manage ITP/KNR, Edit flange, the flange label and deviation forms.
- **The React client** beyond the server answers (security reviews 2 and 3).

### Database changes of the hosted upgrade, in order

The upgrade only inserts: one backup, then the schema step, then the data steps (`server/hosted-preparation.ts`, wave 1 restructure). New tables, reference columns generated from the resource definitions, three unique indexes on new tables, four insert-only data steps. Existing rows are never rewritten; new fields inside record data read a default when absent.

1. Wave 1: reference columns `certifications.siteId`, `certifications.diameterId`, `welding_wires.siteId`, `wps.sourceId`, `wps.copySiteId`; table `notifications`; data step **catalogData** (missing standard defect codes; made insert-only in wave 2, `w2-upgrade-additive`; up to 58 more codes in wave 3); data step **diameterCatalog** (missing reference diameters of the 499-row catalog).
2. Wave 2: reference columns `flanges.projectId`, `materials.uomId`, `stock.siteId`, `picklists.siteId`, `reservations.siteId`, `transfer_orders.fromSiteId`, `spools.testSystemId`; tables `hydrotest_results`, `spool_moves`, `visual_reports` (**unique** on siteId + number); counter row `operation_phase_number`; data step **projectHoldings** (each old project holding becomes a site-inventory row plus one movement, once). The merge removed the step that wrote test systems onto old spools and kept the unique rule on (isometric, Flange ID).
3. Wave 3: eight flange tables (`flange_records`, `flange_passes`, `flange_bolts`, `flange_leak_tests`, `flange_labels`, `flange_deviations`, `flange_signatures`, `flange_events`) with **unique** index `flange_labels_unique_0` on `qr_token`; tables `weldercard_options` (**unique** on list + name) and `welder_card_lines`; session main project as extra rows in the existing sessions table; `catalog_sites` rows for materials written only when users change materials.
4. Wave 4: table `spool_names` (no unique index) with data step **spoolNames** (one name per distinct existing spool name; a second run adds 0); table `iso_memo_templates` (siteId reference, no unique index).

Changes after wave 4:

5. `6e64e64`: the data steps never touch a counter or an existing row; `projectHoldings` books each old holding as a new site-inventory row with movements numbered `MM-UPG-<hash>-<n>` (not from the MM counter); every data step declares the tables it inserts into; the rehearsal (`rehearse-hosted-upgrade.mjs`) compares every pre-existing row by primary key (counters included) and allows new rows only in the declared tables plus audit.
6. `db4dea4`: no stored change. An old stock row (written before the upgrade, no location kind) whose storehouse belonged to a main project counts, when read, as inventory of that main project — for Material status, free stock, Inv., Start, Reserve and issue — never across main projects. A new booking into such a row ends the derivation.
7. `cf99e5e`: no stored change. The third rehearsal (on `88e4c40`) passed every database step but showed that the hosted field filter dropped the storehouse's main project, so old stock was still not counted in the isometric header, list and Materials panel. Now the server attaches the read-only derived values `legacySiteId` and `legacyClaimed` to stock rows written before the upgrade; they are never stored and never accepted from a client. An old open transfer order shows its source again and can be completed; old untaken pick lists keep working. Tests run through the hosted profile over HTTP.

Second rehearsal on a copy of today's live data: all 20 steps passed. Third rehearsal (on `88e4c40`): every database step passed; it found the hosted field filter gap fixed by `cf99e5e`.

**Final rehearsal on `df5617a`:** fourth rehearsal, on a fresh copy of the live data (backup `backups/2026-11-16T20-00-27.304Z/` in the main checkout): **20 of 20 steps passed**; every pre-existing row unchanged in all 93 tables, counters included; the second run added nothing; server boot, sign-in and both pilots' bootstrap passed. Rows added: audit 583, diameters 488, ndt_defect_codes 82, spool_names 9, stock 2, movements 2. Created: 16 tables, 47 reference columns, 3 unique indexes, row-level security on the 16 tables. Whole suite on PostgreSQL: 1097 of 1097 pass, none skipped.

Stock after the upgrade: the live version counts the stock of every storehouse of the workspace regardless of main project. After the upgrade old stock counts only for the isometric's own main project (the storehouse's main project), as the reference does, on the hosted server and in the browser. Isometrics that relied on another main project's stock show a lower Material status (figures below; owner V7).

### What users will notice after the upgrade

Figures delivered by the hosted server before → after the upgrade on the live data in the fourth rehearsal (19 isometrics; the live data is the demo set, one user):

| Main project | Isometrics | Material status / Inv. before → after |
|---|---|---|
| North fabrication yard | all six | unchanged: 100, 100, 25, 100, 100, 100 %, Inv. unchanged |
| Riverside installation | all three | 100 % → 0 %, Inv. → 0: their material lies only in a storehouse that belongs to North |
| Demo – Riverside | ST-004, ST-006, ST-005 | ST-004 100 → 0 %; ST-006 86.5 → 0 %; ST-005 stays 100 % with Inv. 180 → 0 |
| Demo – North | CW-003, SK-008, others | CW-003 100 → 91 %; SK-008 47.7 → 34 % (other isometrics' reservations and untaken pick lists now count); the others unchanged |

Three isometrics were recomputed by hand from the rows and equal the server's figures.

On every isometric, and in the lists:

- One more "release" blocker: Prefab and Field are listed separately (one per phase not completed).
- "Ready" instead of a cross on Pfb / Fld where every weld has a welder.
- Quality % without repair welds (one demo isometric 75 → 66.7 %).
- Progress changed on two demo isometrics.
- 488 more diameters and 82 more defect codes in the lists.
- A new account starts with both applications off.
- Adjust quantity needs an administrator or a ticked Storehouse manager; nobody is ticked after the upgrade.

### Merge commits (`git log --oneline --first-parent c1c123a..df5617a`)

Wave 1: `6dfbe8d` C1, `d57a3cc` C2a, `451cb44` C2b, `ccd4181` C3, `903fb84` C4, `d639f00` S1a; then `63f010c` (Roles wording), `e211351` (hosted preparation sequence). Wave 2: `6927516` w2-upgrade-additive, `9148fd6` w2-refusal-texts, `f1fbe69` w2-flanges, `7fcbe60` w2-itp-register, `68d6afd` w2-visual-inspection, `6bb7285` w2-mto-material-db, `43cdb82` w2-mto-spool-logistics, `48e8aec` w2-iso-pages, `2654b18` w2-hydrotest, `3ec961f` w2-punch-model, `6f5489c` w2-ndt-results-tracers, `82df868` w2-access-core, `f90497c` w2-iso-state-core, `f0041db` w2-mto-stock-core, plus lead commits `e29f267` … `9836f11`. Wave 3: `8b982ff` w3-security-fixes, `ad232cf` w3-catalog-shell-leftovers, `49b2b6e` w3-welder-card, `f49ddda` w3-flange-record, `c5630e4` w3-vt-site-settings, `26758bb` w3-mto-execution, `0ad2ac8` w3-service-request-docs, `17dbc54` w3-mto-dashboard, `6471a48` w3-access-ui, `7c9b9f6` w3-punch-lists, `14f48d6` w3-mto-iso-materials, `b2b98af` w3-mto-material-sites, `6e391aa` w3-mto-procurement, `1e79e89` w3-mto-stock-ui, `608f74e` w3-access-session-sites, `a9f972c` w3-ndt-manager, `c4557ac` w3-release-pages, `71a3904` w3-iso-page-dialogs, `813fc1d` w3-weld-table, `c395927` w3-weld-form, `89ce756` w3-iso-list-metrics, plus lead commits E1–E10 (`9b3a86a` … `861bb38`), `b46182d`, `a4d94a8`. Wave 4: `6e4a5a4` w4-inspection-cell, `aed2c2d` w4-project-iso-pages, `46dc617` w4-weld-form-rules, `29edb70` w4-spool-catalog, `1066f1f` w4-transfer-orders, `78dc6b2` w4-memo-templates, `40186eb` w4-weld-dashboard, `3c225ea` w4-dashboard-reports, `f03a432` w4-exports, `ea8e210` w4-ndt-batch-import, `f2683a5` w4-project-import, plus `105199a`, `b15621c`, `88d7f44`, `e5209c9`. After wave 4 (integration/final): `915a7fd`, `bba3055`, `a6490c8` merge the security review 2 fixes (`cb66367`, `cc2ed5e`, `89b9a18`), the second-walk fixes (`8b06dde`, `b651bbf`, `925062a`) and the upgrade change (`6e64e64`); then `a1cda34`, `5c7e6c9`, `db4dea4`, merged in `88e4c40`; then `cf99e5e`, merged in `df5617a`.

### Sources that disagree (later wins)

- mto-catalogs-008's outcome says the add-material form still offers Progress class; mto-catalogs-007 (merged later in wave 3) took it off the form, and `shared/material-sites.ts` confirms it.
- iso-shared-030 (wave 2) says the IRN field is not greyed; iso-shared-031 (wave 4) greys it.
- weld-catalogs-material-ndt-037 / -039 say 58 codes are not shipped; w1-left-3 (wave 3) ships all 98.
- iso-shared-013 is partly fixed in wave 3 and not fixed in wave 4; the wave 4 record stands (no rule reproduces 72.7 %).
- The ledger still marks five entries open that waves fixed (iso-shared-028, -029, shell-general-005, weld-catalogs-material-ndt-027) or tested (iso-shared-013).
- PARITY.md listed a same-project rule for test systems as an own addition; weld-releases-022 / -027 let one test system hold several projects. The entry is removed.

### Verdict

**Release: approved by the lead on 2026-11-16 for `df5617a`** — verify chain green (1097 tests, 0 failures), four merges verified, rehearsal on a fresh copy of the live data passed 20 of 20 steps with every pre-existing row unchanged, the whole suite passes on PostgreSQL, and four independent security passes end without an open critical, high or medium finding (three low findings stay open: sec3-001, sec3-002, sec4-001). The hosted database is upgraded in the README's order before the push; the result of the upgrade and of the check of the delivered build is recorded below once done.


## 2026-11-16 — Fixes of review findings 1–3, and the collapsible menu

Scope: the three open findings of the review below, plus one addition asked for by the product owner (the left menu can be collapsed to icons).

### Closed

- **Finding 1 (test system name across main projects).** The summary label `testSystemName` is produced only for a test system of the isometric's own project or of no project (`shared/iso-summary.ts`). Every write now follows the rule of the hydrotest move action (`server/store.ts`): an isometric takes only a test system of its own project or a shared one (on create, on a changed test system and on a changed project), and a test system that holds isometrics (deleted ones included, so a restore cannot bring the mismatch back) cannot be handed to another project. The isometric form offers only those test systems. Test: `tests/release-review.test.ts` (plain update, create and project move refused with the field named; a link written below the rules is named to nobody; a shared system is named).
- **Finding 2 (link to a record the account cannot read).** A relation field that names a record not linked yet needs view access to that record (`links` in `server/release-access.ts`, called by the create, update and bulk routes). This covers every relation (PQRs of a WPS, including the primary PQR field, projects of an ITP, WPS, certificate or wire, main projects and customs of a welder, main projects of an account), not only the reported one. Links already there may stay or be removed. Test: a WPS editor without PQR rights gets 403 on create, update and the primary PQR field; with view access to PQRs the same request links.
- **Finding 3 (new attribute value without the add right).** A text that names no existing value adds one to the catalog only when the account has the add right there (`Actor.canAdd`, asked in `server/store.ts` at the point of creation, so every route is covered). Otherwise the request is refused with 403 and the field named; existing values are still chosen by name or id with the edit right alone. Test: Edit without Add is refused and nothing is added; Edit with Add and module-level "Read & write" add as before.

Each of the three tests fails without its fix (checked by taking the fixes out and running the file).

### Added

- **Menu collapsed to icons** (`client/App.tsx`, `client/pilot.tsx`, `client/nav-collapse.css`, group icons in `shared/pilots.ts`). Client only; no request, permission or data changes. Checked in the browser on the local sample workspace at 1440 × 900, 1280 × 620 and 375 × 812: collapse and expand, the choice kept after a reload, group panels in both pilots (the last group stays on screen), Escape and outside click, the "Iso overview" and "Change password" entries from a panel, and the narrow-screen drawer (always full, no toggle).

### Found after the first deploy of this change, fixed

- **The collapsed menu shipped without its styles.** The hosting wrapper (`pages/_app.tsx`) keeps its own list of stylesheets and the new `client/nav-collapse.css` was only in the local entry (`client/main.tsx`), so the hosted build had the toggle button and no rules for it. No build or test failed, and the browser check ran on the local entry. Found by reading the deployed stylesheet right after the deploy; fixed by adding the import. `tests/hosting-styles.test.ts` now fails when the two lists differ. The build without the styles was live for about 6 minutes (09:41–09:47 UTC). After the corrected build went live, the deployed stylesheet was read back on the live sign-in page: collapsed menu 72 px wide, page margin 72 px, round toggle, group panel beside the icons.

### Review of this change

An independent read-only review of the server diff before the deploy: pass with notes, nothing blocking. Its one finding (a deleted isometric let a test system change project, and a later restore brought the mismatch back) is closed above. Its two notes are intended behaviour: moving an isometric to another project asks the user to clear or change the test system first (the field is named), and bulk project edit fails the whole batch the same way.

### Not checked

- CSV import (closed in the hosted profile) does not ask for view access to linked records; the rule of finding 2 applies to the create, update and bulk routes.
- The collapsed menu was not checked in Safari or Firefox.

Verify (`npm run typecheck && npm test && npm run build:local && STELUX_RELEASE_PROFILE=welding-workspace npx vite build`, then `npm run build:server` and `npm run build`) passed before each commit: 523 tests, 515 pass, 0 fail, 8 skipped (PostgreSQL).


## 2026-11-16 — Review of the follow-up fixes and rollout check (after the release review)

Scope: the 13 commits after `abb366b` (follow-up fixes, PQR delivery, Iso overview, demo project script). Read-only review with HTTP probes, plus a rehearsal of the hosted update on a copy of the hosted database.

### Findings, by severity

1. Low–Medium, fixed (see the section above). `testSystemName` in the isometric summary follows `iso.testSystemId` without checking the test system against the caller's project site access or the isometric's project (`shared/iso-summary.ts:100`, `server/iso-summary.ts:23`). Scenario: an account that may edit isometrics on all main projects sets, with a plain record update, a North isometric's test system to a Riverside one; an account limited to North then sees that one name. The plain update also skips the same-project rule of the hydrotest move action (`server/hydrotest.ts:28`); that part is older than this diff. Fix: produce the label only for a test system inside the caller's site scope that has the isometric's project or none, and apply the same-project rule to `testSystemId` on plain isometric writes.
2. Low, fixed (see the section above). A WPS editor without PQR rights can link a PQR by id (`shared/release.ts:169`, `server/store.ts` `syncRelations`): the link is written, the PQR itself is not readable. Fix: require PQR read access for each linked id.
3. Low, fixed (see the section above). Typing a new attribute value while editing a PQR creates a `qualification_options` record without the Add right (`server/store.ts:166`); only detailed profiles with Edit and without Add are affected.
4. Info. Visual inspection results are not locked after a release (unchanged by this diff).
5. Info. The engineer on the Visual inspection report is matched at print time from the current QA/QC engineer record; a signature is still printed only over results its owner recorded.

### Verified clean

- PQR, attribute values and WPS–PQR links: refused in MTO Pilot and for accounts without Weld Pilot access; read-only profiles cannot write; link records cannot be posted directly.
- Visual inspection hub: unknown or duplicate welds, free-text results and empty reports are refused; a weld outside the account's project sites with a choice is refused and nothing is written.
- Visual report signature: the recording account comes from the audit trail (session actor, never client input); sample and demo rows never print a signature.
- Iso overview, wording and release dialog changes are client-side only.
- `server/demo-project.ts` is a command only (no route, not imported by a server entry point), refuses SQLite and unprepared schemas, runs dry by default, inserts `demo-` records and a marker in one transaction and changes no existing row.
- Hosted update rehearsed on a copy loaded with the hosted backup of 2026-11-16: 20 of 20 steps pass (13 tables, 62 reference columns, 9 unique indexes added; all 80 existing tables identical). Over that copy, with a test administrator: sign-in, the selector, 46 Weld Pilot and 35 MTO Pilot menu pages, PQR, Iso overview, the Visual inspection dialog, and every isometric PDF for three existing and four demo isometrics.

### Verdict

Pass with notes. Nothing blocks the deployment; findings 1–3 were follow-up work and are fixed (section above).

## Follow-up fixes (2026-11-16)

Fixes for the open items of the three sections below, plus two menu items. No browser or dev server was used; each fix has an automated check. Verify (`npm run typecheck && npm test && npm run build:local && STELUX_RELEASE_PROFILE=welding-workspace npx vite build`) passed before every commit: 516 tests, 508 pass, 0 fail, 8 skipped (PostgreSQL). `shared/resources.ts` and `server/hosted-schema.ts` are unchanged.

### Closed

- **Weld sweep 9: the visual inspection hub records Accepted for every listed weld.** Every weld now starts without a result. Per weld the user picks Accepted, Not accepted or Not applicable, and only those welds are sent and written. A listed weld without a choice keeps its earlier result. "Set all to Accepted" is an explicit button. A save with no choice is refused on the client and the server (422). Test: `tests/inspections.test.ts`. A report lists three welds, one gets a choice, one result is created, and an earlier Not applicable on another listed weld is unchanged.
- **Release review 7: the release dialog offers every signature.** With pilots it now lists only the signed-in account's own signatures.
- **Release review 4: the visual report prints the signature of the matched engineer.** The image is printed only when the engineer's account also recorded every VI result of the report. The recording account comes from the audit trail (latest create or update). Otherwise the name is printed over an empty line. Test: `tests/pdf-documents.test.ts` (recorded by A naming engineer B: no image; recorded by B: image).
- **MTO sweep 10: the "Open ordered" chip and the Backlog table disagree.** Both now sum `orderLinesInScope` (`shared/mto-dashboard.ts`). On the sample, STX-2401 shows 74 in both. Test: `tests/mto-dashboard.test.ts` checks that the chip equals the table sum per phase and per main project.
- **MTO sweep 9: no Test system in the MTO Pilot header.** The isometric summary now carries one label, `testSystemName`, and only for the isometrics the caller may read. The header falls back to it. Test: `tests/site-scope.test.ts` (an MTO-only account limited to North gets "CW-01" and never the Riverside name). `tests/access.test.ts` allows only that one label.
- **MTO sweep 12 and Weld sweep 11, 12, 14 (wording).** Fixed:
  - Mass edit says "1 record updated." (and "1 weld updated.").
  - Select prompts keep acronyms and pilot names ("Select UOM", "Select Weld Pilot profile", "Select MTO Pilot profile").
  - "Include isometric(s)".
  - Test systems: hosted label "Test system", list column "Test system", and "-- Not set --" as the acceptance select's empty option.
  - Defect codes column "ISO 6520-1".
  - "Order checked materials" opens a dialog of that name with "Create order", without the custom-materials sentence.
  - Isometric selects are sorted by ISO number.
  - The NDT dialog's Welder shows the Wdr stamps, with the names as tooltip. The NDT/PWHT Manager Welder column follows.
  - Add material from DB / Add custom material and the storehouse dialogs focus the first invalid field after an error.
  - The pick list view has a Storehouse column.
- **Weld sweep 10 and MTO sweep 11 (sample data, local only).** Seeded welds whose charge number matches exactly one seeded certificate are traced to it (certificate and material per side). Every sample isometric gets its ISO revision record.
- **Added: PQR in Weld Pilot.** The hosted profile now delivers `pqr` (page), `qualification_options` (records only), the `wps_pqr` links and the WPS `pqrIds` / `pqrId`. Weld Pilot only. Test: `tests/pilots.test.ts`.
- **Added: Iso overview in both pilots.** Weld Pilot "Welding data", right after ITPs. MTO Pilot "Projects data", last. It opens the "Project search" dialog. Choose a project of the open main project (intern prj. no. - description, a searchable input with the project list). Search opens `/workspace/projects/:id/isometrics` in the current pilot. The entry is shown only with read access to projects and isometrics. Test: `tests/pilots.test.ts` (position in both menus).

### Still open

- MTO sweep 8: "Transfer to project" stock semantics (product decision).
- Release review 5 and 6: login rate limit behind the proxy, and sign-in timing (product owner).
- Weld sweep 13: the NDT dialog's five-round table is 70 px wider than the dialog at 1440 px.
- None of the fixes above was checked in the browser. A short pass over the visual inspection hub, the Project search dialog, the MTO header and the wording changes is still to do.

## 2026-11-16 — Release review (before production deployment)

Hostile review of `git diff origin/main...HEAD` (216 files), focused on the hosted release profile `welding-workspace` (pilots feature). Covered: authentication and sessions, the pilot boundary, access per project site, administrator-only resources, signatures, side channels (PDF documents, ISO Book, CSV / XLSX, bootstrap, history, audit), uploads, injection, hosted schema preparation and silent fallbacks. Every suspicion got a concrete scenario and was confirmed or dropped against the HTTP test harness (`createApp` on a temporary SQLite workspace). The confirmed findings have regression tests in `tests/release-review.test.ts`, and each test fails without its fix. No external site, remote database or `.env` file was used. No `db:*` script was run.

Verify (`npm run typecheck && npm test && npm run build:local && STELUX_RELEASE_PROFILE=welding-workspace npx vite build && npm run build:server`) passed after the fixes: 513 tests, 505 pass, 0 fail, 8 skipped. The 8 skipped are the PostgreSQL tests; no local PostgreSQL was available.

### Findings, by severity

1. **High, fixed.** A limited administrator could escape its own project site access through accounts (`server/http.ts:171,183,195`, `server/site-scope.ts` `assertSiteAccessEdit`). The rule "access cannot be widened by an account that does not have it itself" only looked at the scope fields present in the request. Scenario: an administrator limited to North fabrication yard in Weld Pilot calls `POST /api/records/users` with name, email, an administrator profile and a password, and no scope fields. The call returns 201, and the new account reaches every main project. The same administrator can call `PUT /api/records/users/<unlimited administrator>` with `{ password }`. That returns 200, and signing in with the new password works, which takes over the unlimited administrator. Fix: `assertAccountReach` (`server/site-scope.ts:147`). In every pilot where the actor is limited, an account it creates, changes or archives must be disabled there or limited to a subset of the actor's main projects. The account is checked as it was before the write, and again inside the write's transaction as saved. Accounts within the administrator's own main projects can still be edited, and unlimited administrators are unchanged. Writing `user_sites` links directly was already refused (405, read-only resource).
2. **High, fixed.** A release could carry another account's signature, which the release document then prints (`server/releases.ts:44`, printed by `server/pdf/operational-documents.ts:95`). Scenario: an account with release rights posts `/api/actions/release` with the `signatureId` of a colleague's full signature. The call returns 201, and the Prefab / Field release PDF places the colleague's signature image in the Subcontractor QA/QC block. This breaks the signature ownership rule ("each user writes only their own signatures"), and PARITY says the block shows the *releasing* signer. Fix: in the hosted rules, a release takes only the releasing account's own signature (403 with a field message otherwise). The system actor (sample data) is not checked.
3. **Medium, fixed.** A hydrotest result on a shared test system completed isometrics of another main project (`server/hydrotest.ts` `recordResult`, and the record routes of `test_systems` / `hydrotest_requests`). A test system without a project is "shared" (`shared/site-scope.ts`), and its hydrotest state applies to every isometric in it (`hydrotestState`). Scenario: a shared system holds iso-1 (North) and iso-4 (Riverside). An account limited to North records "Passed" (201), and Riverside's iso-4 becomes hydrotest-completed. The same happens when it creates a passed request directly, sets "Testing not applicable" on the system, or archives a passed request. Fix: `Store.guardTestSystem` (`server/store.ts:59`). On create, update and archive of a test system or hydrotest request, each isometric of the system is read through the record guard, so a write that would change an unreachable isometric is refused with 403 and rolled back. A shared system that holds only the account's own isometrics still works.
4. **Medium, open (product decision).** The Visual inspection report prints the signature of the user whose e-mail (else name) matches the chosen QA/QC engineer (`shared/pdf-documents.ts:165`, `server/pdf/operational-documents.ts:81`). Scenario: any account with the Visual / Pre-HT results right records a VI result naming engineer X, and the printed report carries X's signature image, although X did not sign. PARITY already lists this as "Unverified". Options: link engineers to accounts and print only when the engineer is the recording account, or leave the box empty.
5. **Low, open (pre-existing, not changed on this branch, unconfirmed on the host).** The login rate limit counts by `req.ip` in process memory (`server/http.ts:87-94`), and `trust proxy` is never set. Scenario: behind the host's reverse proxy every client shares the proxy's address, so 8 wrong passwords from anyone lock all sign-ins for 5 minutes. On a serverless runtime each instance has its own counter. Fix later: a trusted-proxy setting plus a per-account counter stored in the database.
6. **Low, open (pre-existing).** Sign-in timing reveals whether an e-mail exists. scrypt runs only for an existing active account (`server/http.ts:92-94`). Fix later: compare against a dummy hash when no account matches.
7. **Low, open.** The release dialog offers an administrator every signature it may view (`client/releases.tsx:121`). After fix 2, choosing someone else's signature returns a clear field error. Filtering the choice to the account's own signatures would avoid the round trip.
8. **Low, accepted risk (D2: the client starts from an empty database).** Rules tightened on save for rows saved by earlier releases: Service companies need an Address (now required). The pilots profile requires a Material group on catalog materials. Flange torque values are numbers, and `flangeStoredValue` converts numeric strings. Punch items need a Description. Such a row stays readable and listed, and only its next edit asks for the field. Nothing runs at startup or on read. Legacy option values (priority, punch category and status) are mapped through `legacy`.

### Verified clean

- **Setup and sessions:** "requires setup" only when no credential exists. It is checked inside the setup transaction, and seeded accounts without passwords do not count. Passwords use scrypt with a random salt, a constant-time compare and 10-256 characters. A password change needs the current password and drops every session. An administrator's password reset drops the target's sessions. Deactivated, archived or pilot-disabled accounts are refused on their next request. Cookies are HttpOnly, SameSite Strict and Secure on an HTTPS origin. Mutating requests need `X-Stelux-Request` and an allowed Origin.
- **Last administrator:** the check runs per pilot (`access.administrators`) on user / profile update, archive and bulk profile edit, inside the write's transaction.
- **Pilot boundary:** a missing, unknown or forged pilot is refused, and so is a header / `?pilot=` mismatch (`?pilot=` only on GET / HEAD). `pilotBoundary` removes the other pilot's module and areas. The two documented crossings return aggregates only (`isoSummariesFor`) or follow the owning pilot per part (`copyParts` plus `assertCopyInScope`; copies stay within one main project). Every delivered workflow action maps to a real permission area, and unknown actions are refused by default.
- **Per-site scope:** every resource has a rule (test-enforced). `store.get` guards every read and write, every reference field is resolved through the guard (forged ids get 403), relation links outside the scope are kept, lists are filtered through `access.visible`, and raw SQL writes exist only inside `Store` create / update / archive. Bootstrap, records, history, audit (record visibility first), reports, CSV / XLSX exports (relation labels of hidden sites read "Unavailable record"), the materials list, PDF documents of all three scopes, PDF attach (import right on each target) and the ISO Book (isometrics readable in the pilot; files pass the same two checks as `GET /api/files/:id`) were all checked.
- **Administrator-only resources and signatures:** users, user_sites, profiles and company_data need an administrator. Signatures are own-only, administrators may view but never write, and image uploads to another account's signature are refused.
- **"Enabled on this site"** is enforced in `Store.validate` for newly chosen references (copies keep theirs). Bulk edit of enablement catalogs only switches availability.
- **Hosted field projection:** `projectRow` on every row the API returns (records, bootstrap, action results). Error field names are limited to delivered fields, and 409 messages are generic.
- **Uploads:** signature and company logo files must be PNG / JPEG up to 1 MB with matching type, name and magic bytes. Punch sign-off PDFs are checked by magic bytes, up to 10 MB. Other uploads use an extension allow-list and a 20 MB limit. Downloads are always `attachment`, `application/octet-stream` or `send` with a root, with `nosniff`, and stored names are server UUIDs. ISO Book: damaged, encrypted and renamed files are listed as "not included" and never throw. Total input is limited to 100 MB, 2000 pages and 100 isometrics, and the file name is sanitised.
- **Injection:** there is no `dangerouslySetInnerHTML` or `innerHTML`. Every SQL identifier in `server/hosted-schema.ts` / `server/postgres-schema.ts` comes from `shared/resources.ts` keys, field names and unique rules, and values are bound. CSV escapes formulas (`escape_formulas`, `reportCsv`). PDF text goes through `pdfText`.
- **Hosted schema preparation (code review; the PostgreSQL tests are skipped here):** one transaction under the schema advisory lock. A row count and digest of every pre-existing table are compared before commit, so no record is rewritten, and any error rolls back. Reference and unique violations are refused before anything is changed. A dry run rolls back and writes no backup. The step is idempotent and does nothing (and needs no backup) when the schema is already prepared. A backup is taken before a real run. Startup verification (`verifyHostedSchema`) reads catalogs only and refuses a database that is not prepared.
- **Fallbacks:** the cloud runtime requires `STELUX_PUBLIC_URL` (QR links fall back to the request origin only locally). Sample accounts are seeded only for local runs. The profile fallback `row.profileId` applies only to accounts saved before per-pilot profiles. No default secrets were found.

### Verdict

**PASS WITH FIXES APPLIED.** Two high findings (administrator escape from project site access, foreign signatures on releases) and one medium (shared test systems) were fixed at the root with regression tests, and verify passed. Nothing blocks the release. Before going live, run the hosted preparation against the production database with `--dry-run` first, because its PostgreSQL tests could not run in this environment. Finding 4 needs a product decision; findings 5-7 are follow-ups.

## 2026-11-16 — MTO Pilot and merged additions — hosted profile

Sweep of `/mto` and of the Weld-side additions from the wave-2 merge (Reports menu, operational documents, ISO Book, site scope). Hosted release profile `welding-workspace` (pilots feature), fresh sample database (`.data/welding-workspace` moved aside to `.data/welding-workspace.qa-mto-202611160307`), administrator created with `POST /api/auth/setup`. Checked in the Browser pane at 1440 × 900 and 390 × 844, plus HTTP checks for data boundaries and the PDF endpoints. Accounts: the administrator; the seeded MTO-only account Daan Visser; Sara Jansen, with Weld Pilot limited to Riverside installation. Both passwords were set through the user form and recorded in `.data/dev-login.txt`.

Verify (`npm run typecheck && npm test && npm run build:local && STELUX_RELEASE_PROFILE=welding-workspace npx vite build && npm run build:server`) passed before each commit: 510 tests, 502 pass, 0 fail, 8 skipped.

### Findings, by severity

1. **Major, fixed.** The isometric header showed different punch numbers in MTO Pilot and Weld Pilot. `client/iso-header.tsx:114` passed `rows.punchlists` to `PunchStatus` (`client/punch.tsx:274`). MTO Pilot receives no punch items, so the header always said "0 open · 0 finished". Scenario: on STX-CW-001 Weld Pilot shows Pre-punch "1 open", while MTO Pilot (admin, or the MTO-only account) shows "0 open". The A/B release hint was missing as well. Fix: `PunchStatus` now takes the server summary's `punch` counts (`IsoSummary.punch` already carried them), so both pilots show the same figures.
2. **Major, fixed.** The user form's site list offered only the open main project (`client/components.tsx:133`). Options came from `rows.sites`, which holds only the active main project. Scenario: with North fabrication yard open, edit Sara Jansen, then set Weld Pilot project site access to "Specific project site(s)". Only "North fabrication yard" can be ticked, so the account cannot be limited to Riverside installation. Fix: a multiple-choice site field now lists every main project the editor may see (`allRows`). Checked again: both projects are listed. Sara, limited to Riverside, gets only Riverside in Weld Pilot (3 isometrics), and a LISL for a North isometric returns 404. MTO Pilot (all sites) is unchanged.
3. **Minor, fixed.** On MTO Pilot, the main project cards showed "0 Welds" and "WDI progress 0% completed" for every project (`client/project-workspace.tsx:48-49`), because MTO Pilot receives no welds. The intro also spoke of weld records. Without weld access, the weld count and the WDI block are now hidden, and the MTO intro mentions materials instead. Weld Pilot cards are unchanged (North: 23 welds, 94 %).
4. **Minor, fixed.** Material database column headings did not match the capture (`client/mto-materials.tsx:47`). They read "Component code | Material group | … | Material description" where the capture has "CC | Group | … | Description". PARITY.md claimed these matched. The Add material form keeps its capture labels (Component code, Material group, Material description).
5. **Minor, fixed.** Logistic and supplier catalogs used our own labels instead of the capture's (`shared/welder-data.ts` `HOSTED_LABELS` / `HOSTED_COLUMNS`). Material supplier: "Supplier name | City | Phone | Email" became "Name | Address | Email address | Phone"; the form now says "Zip code" and "Residence". Service companies: "Company name" became "Name" and "Email" became "Email address". Laydown areas / Laydown materials: "Name" / "Laydown name" became "Laydown". Hosted only; other profiles keep their labels. Test in `tests/mto-materials.test.ts`.
6. **Minor, fixed.** The Storehouses page opened as "Warehouses" with "Add warehouse", though the menu says Storehouses (`shared/release.ts` `projectResource`). In the pilots profile it is now "Storehouses" / "Add storehouse" / "Storehouse name".
7. **Minor, fixed.** In Add custom material, the checkbox read "Also add this material to the Material database" where the capture has "add to DB" (`client/mto-materials.tsx:192`). The label now follows the capture, and our hint explains it.
8. **Major, open (product decision).** Material handed to a project disappears from the isometric. "Transfer to project" moves stock out of the storehouse into a project holding (`shared/mto-stock.ts` `projectHoldings`). `requirementExecution` (`shared/materials.ts:21`), and with it Inv., Material status, Reserve and Start, only count storehouse stock. Scenario: QA-MTO-0001 on STX-CW-003: order 10, receive 6, correct −1, so Inv. 5. Transfer the 5 to North fabrication yard, the isometric's own main project: Inv. drops to 0, Material status falls back from 88.1 % to 76.2 %, and Reserve says "Nothing free to reserve". The material became usable again only after "Return to inventory". The capture does not say where transferred material goes (PARITY "Inventory operations": inferred). To decide: should a project holding count toward its own isometrics (Inv., coverage, pick)?
9. **Minor, open (product decision).** In MTO Pilot the Technical card shows Test system "—" where Weld Pilot shows "CW-01" (`client/iso-header.tsx:64` reads `rows.test_systems`, which MTO Pilot does not receive). The other header numbers now match. Carrying the name in `IsoSummary` would break that type's own rule (counts, percentages and yes/no only), so this needs a decision on the boundary.
10. **Minor, open.** Dashboard figures disagree. The "Open ordered" chip and the Blocking backorder card's subline say 74, while the "Backlog by project" table and chart say 0 for STX-2401 (`shared/mto-dashboard.ts:266` vs `:284`). The chip counts every open order line in scope; the table counts only open quantity allocated to requirement lines. Both formulas are inferred (PARITY "MTO Pilot dashboard"), so which one the reference means needs a decision.
11. **Minor, open (sample data).** Sample isometrics show "Rev 2" in the header (from `iso.revNo`) but have no `revisions` records. So the Revision select in Add material from DB / Add custom material only offers "No revision", and the quantity log says "Add an ISO revision before recording a revision removal" on an isometric that already shows Rev 2. Seeding revision records would fix it; that changes the sample data.
12. **Minor, open.** Several messages are inconsistent: the "Order checked materials" button opens a dialog titled "Order checked requirements" with "Create requirement order", whose text says custom materials stay outside the catalog even when "add to DB" was used. Mass edit says "1 records updated." The pick list view does not show the storehouse, so a split line (2 + 3 of QA-MTO-0001 from two storehouses) looks like a duplicate. Add material from DB keeps focus on the button after a validation error (the Weld forms move it to the first invalid field). Placeholders read "Select uom", "Select weld pilot profile", "Select mto pilot profile".

Console: the screens above logged no new errors and no failed requests (each page was crawled with a fetch / console.error hook). The pane's console buffer also held errors from earlier sessions in the same tab (a `useRef` error in an old weld-entry build, connection-refused lines from a stopped server); none came back.

### Screens verified clean

- Entry: workspace selector, MTO main project selector (cards after fix 3), MTO dashboard: operation phase selector with "Current <phase>" chip, six KPI cards, visual management chips and both charts, readiness focus, operations board tabs (AT SERVICE filter checked) and paging. Changing the phase to Field recalculates the cards.
- All 37 MTO Pilot menu items open with their heading, columns and buttons, with no failed requests and no page-level horizontal overflow at 1440 px or 390 px: Project sites, Storehouses, Documents, Dashboard, Material database, Material part, Type of material, UOMs, Spools, Operation Phases, Material supplier (with "Enabled on this site" and Options), Order materials, Pending order, Material take in, Material inventory, Transfer orders, Materials list, Isometric materials, Order archive, Certifications, Projects, Isometrics list, Isometric execution, Pick List archive, Service companies, Service request, Service req. - Materials, Request archive, Laydown areas, Laydown materials, MTO & calculations, Calculation norms, User accounts, Profiles, Company data (and Change password from the menu).
- Material database: per-column search; Mass edit materials on a checked row (Component code set to GSK); the material created with "add to DB" appears in the list (15 materials).
- Isometric under /mto (STX-CW-001, STX-CW-003): the six header cards match Weld Pilot (progress, quality, blockers, phases, punch after fix 1; the MTO-only account gets identical `isoSummaries` for all three isometrics). Also checked: Material status and Hydrotest completed; the Materials table columns Group … Picked; type filter; CSV / Excel links.
- Isometric actions: Add material from DB (group required, material list filled after the group, quantity required; validation shown). Add custom material with a 128-character description and add to DB (the description is truncated in the table, no overflow). Set type (required, then saved). Quantity log (Beginning / Now). Print → MTO report dialog → `GET /api/pdf/mto-report` 200 `application/pdf`.
- Chain, checked on the isometric after each step: add (Ord.? No, Inv. 0, 76.2 %) → Order checked materials (Ord.? Yes) → Receive materials (order, supplier and storehouse required; over-receipt refused with a message; 6 received with a charge number) → Correct receipt (−1 with a reason; the log shows −1) → Inv. 5, 88.1 % → Transfer to project (finding 8) → Return to inventory (over-quantity refused) → Move to storehouse (2 to Field stores) → Correct entry (Reason required) → Reserve (Reserved materials 3 → 6) → Start (PL-2026-0011) → Pick List archive: View, Mark as taken → Inv. 0, Picked 5; CS-B020 and CS-F150 picked 20 / 12, status 88.1 %.
- MTO-only account (Daan Visser): lands in `/mto`, no Weld Pilot (`/weld/dashboard` shows "You do not have access to Weld Pilot"; `GET /api/bootstrap` with pilot weld returns 403). MTO bootstrap holds no welds, inspection results or punch items. Header numbers match the administrator's Weld Pilot view, apart from finding 9.
- Weld Pilot Reports menu on STX-CW-001: each item returns `200 application/pdf`: LISL Report, (A3), [GU], [MV], [ISS], [WQ], [WQ ver 2], [GU Rev 2], [GU Rev 3], Blank LISL template, Weld card, Weld labels, Punch list - blank, Welder's summary. ISO Book: the parts list shows its reasons ("No ITP document is uploaded …"); "Pick lists" and "MTO report per operation phase" are refused for the Weld profile; Check all available → 19-page book downloaded.
- Operational documents over HTTP (Weld Pilot): NDT request, visual report, prefab release, hydrotest request and punch list each return `%PDF`. Flange report asks for an isometric or project (422 with a message). Pick list (MTO) returns 200.
- Site scope: after fix 2, an account limited to one main project sees only that one (Weld bootstrap: sites = [Riverside installation]).
- Dialog keyboard: Tab cycles inside the dialog (Move to storehouse), Escape closes; native validation focuses the invalid field (Return to inventory, Correct entry).
- 390 px: every MTO page above, the MTO dashboard, the isometric page and the Add custom material dialog (8–382 px, no inner overflow).

### Not checked

- Service request / Move to laydown / Complete service, and the transfer order create / complete / cancel actions (pages and columns only).
- Import (CSV) paths, Print QR label, the Material revisions report PDF, and the MTO report language option (the app is English only, D9).
- A non-admin MTO account with a restricted profile ("Only review") on each MTO page; the no-access state was checked only at pilot level.
- Profiles full, welding-demo and access-prototype in the browser. Their behaviour is covered by the test suite. Fixes 3 and 2 change shared components: fix 3 hides weld data only without weld read access; fix 2 changes only multiple-choice site fields.
- Contrast and screen-reader announcements beyond the accessible names read through the accessibility tree.

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
