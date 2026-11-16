# Vendor public documentation: WeldPilot / MTOPilot (Websonik)

**Summary line:** The vendor publishes a Dutch/English knowledge base (about 100 short articles, mostly screenshot-driven) but it is thin on rules. It answers questions 1 (partly), 4 (partly), 6 (not at all, only the generic industry scheme), 8 (partly), 9, 11 (partly), 12 (partly), 14 (partly) and 15. Questions 2 (formula), 3, 5, 7, 10, 13 are not covered publicly.

Method note: pages were read through a fetch tool that summarises each page, so wording is paraphrased and some screenshot-only content is invisible to it. Public pages only, nothing under the client host, no sign-up. Everything marked **Vendor** is stated on the page; **Inference** is mine.

## Sources read

Base: `https://websonik.com` (the old `websonik.nl` redirects there). Knowledge base prefix: `https://websonik.com/kennisbank/`.

- `/` home page. Products: WeldPilot, MTOPilot, EstimatePilot (ESTPilot), Management Dashboard, API. Marketing only.
- `/weldpilot`, `/mtopilot` product pages. Feature bullet lists, no statuses or workflows.
- `/helpdesk/` linked from the pages; not readable without login, not fetched further.
- Knowledge base index `/kennisbank/` (sections 1 Setup, 2 User setup, 3 Material management [MTOPilot], 4 Contracts and unit rates [ESTPilot], 5 Welding, QA/QC and testing [WeldPilot]). Many articles show "last updated 12-06-2026".
- Articles read: `3-211-isometrics-list`, `5-28-isometrics-list`, `5-05-dashboard`, `5-06-overview-iso`, `5-07-daily-reporting` (posted 12-09-2022, updated 12-06-2026), `3-23-isometric-execution`, `3-22-open-isometric`, `3-17-material-inventory`, `3-16-material-take-in` (updated 12-06-2026), `3-14-order-materials`, `3-15-pending-order`, `3-18-materials-list`, `3-24-pick-list-archive`, `5-29-open-isometric`, `5-30-menu-add-weld`, `5-30-2-weldcards`, `5-31-reports-menu`, `5-32-options-menu`, `5-33-ndt-requests-manager`, `5-35-ndt-archive`, `5-23-ndt-process`, `5-38-qa-qc-engineers`, `5-40-prefab-release`, `5-41-field-release`, `5-42-field-work-packages`, `5-44-test-systems`, `5-45-hydrotest-release`, `5-46-punch-list`, `5-47-system`, `5-09-roles`, `5-13-06-approval-workflow-and-signatures` (WPS module), `2-1-functie-profiel-aanmaken`, `2-2-aanmaken-van-een-applicatiegebruiker`, `3-36-profiles`.
- Blog / release posts (Dutch): `/nieuwe-updates-aangemeld-blijven-las-certificaten-lisl-updates-en-meer/` (18 Mar 2024), `/verbeteringen-en-nieuwe-functionaliteiten/` (29 Nov 2024), `/diverse-updates-en-verbeteringen/` (28 Mar 2025), `/laatste-verbeteringen-in-weldpilot-applicatie/` (8 Dec 2023), `/aankondiging-nieuwe-mobiele-app-voor-lasgegevensbeheer/` (16 Jan 2024), `/nieuwe-functie-aankondiging-pre-ht-pwht-requests-in-weldpilot/` (24 Jan 2025), `/een-aantal-kleine-aanpassingen-in-weldpilot/` (27 Sep 2022).
- Not found or not reachable: any PDF brochure, YouTube video descriptions, LinkedIn posts or trade-press articles about the products (searches returned unrelated vendors; `mtopilot.com` does not exist; `weldpilot.com` returned empty content). An unrelated "WeldPilot" friction-stir simulation tool by another vendor exists; ignore it.
- Not opened (listed in the index, might hold more): `5-30-1-mass-edit-welds`, `5-34-pre-ht-pwht-request-manager`, `5-36/37` archives, `5-39-export-weld-data`, `5-43-assign-iso-to-fwp`, `5-02-project-sites`, `5-08-welder`, `5-10-certificates`, `5-12`/`5-13-*` WPS manual chapters other than 06, `3-26..3-31` service requests and laydown, `3-25-iso-overview`, `3-35-user-accounts`, `4-13-statuses`. A follow-up pass over these is worthwhile for Q3, Q5, Q7.

## 1. Isometrics list columns and KPI cards

Source: `3-211-isometrics-list`, `5-28-isometrics-list`. Confidence: medium for columns, none for KPI cards.

**Vendor** (WeldPilot isometrics list, ticks and crosses):
- Columns in the vendor table are NoBo, PWHT, M, E, W, Pfb, Fld, Doc. (The article does not list Total/NDT approved cards.)
- NoBo: cross = the isometric has no notified-body line; tick = it has one. PWHT: cross = no PWHT line; tick = a PWHT line exists.
- M (from MTOPilot): cross = no materials on the isometric yet; tick = materials present.
- E (from ESTPilot): cross = no calculation yet; tick = calculation present.
- W (WeldPilot): cross = no welds yet; tick = welds present.
- Pfb (prefab) and Fld (field): three states. Cross = not finished; cross also = finished but not yet reported; tick = finished and reported (signed off). If no indicator at all is shown, the isometric has no welds (never created, or no welding done).
- Doc: cross = no isometric document yet; tick = document exists.
- The data refreshes automatically every morning; a Refresh button reloads it for all users and "last refresh" is shown.

**KPI cards** (Total isometrics, NDT approved, PWHT approved, Prefab complete, Field complete, Documentation): not found. The dashboard article (`5-05-dashboard`) mentions only weld totals in mm or counts, filters, and three reports; no cards with these names.

**Inference:** "Pfb complete" is most likely the count of isometrics with the Pfb tick, and "Documentation" the Doc tick; the vendor does not say so.

## 2. Material status % and Reserve / Start

Source: `3-23-isometric-execution`, `3-22-open-isometric`, `3-24-pick-list-archive`, `3-18-materials-list`. Confidence: medium on Start/Reserve, formula not found.

**Vendor:**
- A "Start" button appears next to an isometric when all required materials for a phase or label (for example Prefab, Field, Supports) are available; the page names a 70% completeness threshold for this. Formula for the percentage: not given.
- If two isometrics compete for the same limited stock, both may show Start; pressing Start on one removes the button from the other.
- "Reserve" sets materials aside for an isometric so planners can compare which to start first by priority. A reservation can be stepped back.
- Start cannot be undone through the normal route; reversing it takes manual per-item actions.
- Start creates and saves a pick list as a PDF (printer icon reopens it); a further button shows the materials list where it can be recorded whether each item was collected and by whom (`3-24`).
- On the isometric, a truck icon shows material state by colour: red = required material not in stock; yellow = material present but not in the required quantity; green = in stock (`3-22`). A project setting says the indicator lights when materials are added to an isometric, or, if switched off, only when a pick list is created (post of 29 Nov 2024).
- The "Picked" column counts what has been issued; the quantity can be corrected by clicking it and entering the returned amount.
- The materials list (`3-18`) shows per isometric material whether it is ordered, in stock and issued; refreshed nightly, with a manual refresh.

**Not found:** the status names BLOCKED / PARTIAL / STARTABLE / STARTED, and any formula for "Material status %". **Inference:** the 70% rule and the colour states look like the origin of those labels, but this is a guess.

## 3. Tracer welds after a rejected (NA) NDT result

Not found. No article or post mentions tracer welds, rejected results, repair or re-examination rules. The NDT articles only cover requests (`5-33`), mass upload of results with up to four report numbers (`5-29`), and the NDT archive views Finished / Open NDT results / Open NDT welds (`5-35`).

## 4. Prefab release, Field release, Reopen, padlock

Source: `5-40-prefab-release`, `5-41-field-release`. Confidence: medium for prefab, low for the rest.

**Vendor:**
- Prefab: all NDO (NDT) must be finished with statuses and reports processed before pressing "Prefab complete". This is done after all prefab welds are made and the prefab-release indicator has appeared.
- Buttons on the release screen: "Go" (applies an ITP filter to load drawings), "Release selected" (releases the ticked isometrics to the next phase), "Upload signed docs" (under options) and "Upload". The release note lists only isometrics reviewed and released. Uploaded signed documents go to a Release archive in unaccepted and accepted versions; a printer icon marks that the accepted version is uploaded.
- Field release works the same way as prefab. Test systems are set up in work preparation and the field-release document should match the 1:1 isometrics of a test system. A signed field-release document is the approval to start a strength test.
- Reopen and padlock/locked welds: not mentioned in any article read. Not found.

## 5. Transfer to project from Material inventory

Not found. `3-17-material-inventory` only says the inventory is the sum of all receipts from Material take-in, that items can also be added manually or by import, that manual entry must use items from the material library, and that Material No is the unique key. Nothing on transfer, return, or reservation.

## 6. Punch items type A / B / C / D

Not found for the vendor. `5-46-punch-list` describes pre-punch and punch rounds, "Add item" with attachments (PDF, photo), recording a clean punch, an open-items overview, and "Mark as finished" for several items at once. Per-isometric punch lists show open items and two further tabs hold all items including passed pre-punch and punch (`5-29`).
The A/B/C/D scheme appears only in a generic third-party hydrotest guide (A before hydrotest, B after, C before mechanical completion, D documentation before turnover). **Inference only;** do not treat it as WeldPilot behaviour.

## 7. Signature rules on Visual inspection report and other documents

Mostly not found.
**Vendor:**
- LISL has a "Signature on each page" option (`5-31`); grey-field shading marks which fields inspection must approve (A4 and A3, not yet rolled out to every customer).
- Project document settings allow company-specific names for signature roles (subcontractor and contractor QA/QC and construction, main user interface, NoBo), which change labels on the pressure test plan (Druktestplan); document/revision and procedure numbers set the defaults on VT, LISL (GU) and LISL (MV) reports (post 29 Nov 2024).
- A QA/QC engineers table supplies names printed on several reports (`5-38`).
- Visual inspection report can cover one or several welds (shop and field together); the "Vi" column shows dots = no result yet, "A" = approved (`5-31`).
- Digital signatures exist in the WPS module (statuses Draft / Review / Approved; step roles Manufacturer, Customer, Third party; saved profile signature or drawn one; editing after signing invalidates signatures) (`5-13-06`). This is WPS only.
- "Full vs short signature": not found.

## 8. LISL report variants

Partly found.
**Vendor:**
- LISL (list of welds per isometric) is generated from the isometric: Reports, choose the LISL, tick Prefab, Field, or neither for both, then Go (`5-31`).
- Layouts: modern or classic, each with or without NDT/PWHT columns; without them there are two open boxes for heat numbers entered during prefab. A blank template exists. The workshop LISL can be added automatically to the prefab/field map.
- "LISL Report A3": larger writing fields so more characters fit (post 18 Mar 2024); the LISL gained fields NDT Rp/Nr. Pre 1 to Pre 4.
- (GU) and (MV) are named as LISL reports with document/revision/procedure defaults (post 29 Nov 2024). The meaning of the abbreviations is not explained.
- Not found: [ISS], [WQ], [WQ ver 2], [GU Rev 2], [GU Rev 3], and any German field names on an [ISS] form.
- ISO Book is the largest report, with prefab and field variants and a document-selection mode; an NDT procedure can be attached and a punch list exported blank or filled (update 05-03-2026).

## 9. Daily reporting

**Vendor** (`5-07-daily-reporting`, high confidence): it is an e-mail schedule. Add one or more addresses and a time; the application then mails a daily update on the number of welds made and their diameters. No on-screen view is described. Planned, not yet available: a per-work-planner productivity report and a real-time project progress report. (The related `5-06-overview-iso` is a waterfall view of isometric statuses that planners update after tasks.)

## 10. ITP templates, ITP/KNR percentage, inspection compliance

Mostly not found.
**Vendor:** ITP NO and ITP NO2 are fields on the isometric with revision numbers (letters allowed since Mar 2024); the prefab release screen has an "ITP filter" ("Go"). NDO percentage is entered per weld, including length-based welds in mm (for example 5% or 10%), with an "NDT req." toggle (`5-23`, `5-29`). A dashboard report "NDO percentage monitoring" filters by date, welder and WPS and takes a percentage threshold; a welder certificate renewal report exists (`5-05`). ITP templates, KNR and required examinations per welder/WPS: not found.

## 11. Report generator, Form designer, WPS Designer, Handheld scanning, AI

- Report generator / Form designer: not found.
- WPS: the vendor has a WPS user manual (`5-13-*`, 14 chapters: list, editor, approval workflow and signatures, PDF export and official documents, source data, permissions, validation, FAQ) plus WPS methods, PQR list (PQR can be linked to a WPS). A "WPS Designer" by that name: not found; **inference:** the "WPS Editor" chapter is the nearest thing.
- Weld card: generated from Reports, for all or chosen welds; carries QR codes since Dec 2023; bulk weld labels or cards for several isometrics in a sub-project since Mar 2026 (`5-30-2`). WQ number on the card is clickable. Flange QR label and ISO book cover: not found (ISO Book is covered under Q8).
- Handheld scanning: an Android app (beta, announced 16 Jan 2024) that signs in with the company sub-domain plus credentials, opens projects, and scans a QR code to jump to the weld data to view or edit. Dedicated scanner hardware: not mentioned.
- AI panels: not found.

## 12. Negative take-in, order PDF or e-mail, order numbering

**Vendor:**
- Order materials (`3-14`): select materials from one or more isometrics, group similar items; the user must calculate saw-loss overmatch. "Order checked materials" generates a PDF usable for a quote request or the order. E-mail sending is not described. A supplier is attached to the order in the Order archive.
- Pending order (`3-15`): shows outstanding orders and full or partial receipt.
- Take-in (`3-16`): "Receive materials" button, pick order and supplier, enter received quantities, save.
- Negative take-in and order numbering: not found.

## 13. Flange management

Not found (no status values, torque tables, ASME B16.5 or Gasunie CSW-43 mention, or flange labels in any public page).

## 14. Hydrotest release

**Vendor** (`5-44`, `5-45`, medium confidence):
- Test systems are built at spool level, not isometric level; spools from different isometrics can be tested together, and non-testable (open-ended) spools go to a system marked "Testing not applicable".
- Colour states: blue = not tested (excluded), green = test complete, white = not yet complete. Required documents per system are attached and saved.
- Hydrotest release: fill the required fields and choose attachments, confirm; the system compiles a test package (can take a while). After the test is approved and acceptance documents are signed: Results, select the PTC, choose the acceptance document and add it; a Results History shows results and upload status. Beyond that, client acceptance rules are not described.

## 15. User access

**Vendor** (`2-1`, `2-2`, `3-36`, `5-47`, high confidence):
- Profiles are created by an application administrator (name, optional description, tick rights); unlimited number; assigned per application and per user; a user can have different rights in project A and project B, set per project or for all projects at once. A user sees changed rights after a browser refresh. Individual right names are not listed.
- Job-profile (role) table is shared: for WeldPilot only the value "Lasser" (welder) applies.
- Users can be active or inactive; users with full rights manage users; key users manage profiles; only the Websonik admin toggles two-step verification and edits company data.

## Other documented behaviour worth knowing

- Weld record mandatory fields (post 29 Nov 2024): weld type, WPS number, weld date, diameter, batch/heat number; empty required fields show a red marker. A welder can be assigned only if qualified for the weld's WPS. Adding a weld needs at least weld number, weld type, spool, diameter (`5-30`).
- Material certificate records: material type, schema and certificate type are essential.
- Weld sorting per isometric (Options, "Enable welds sorting"); deleted welds can be viewed and restored by application admins ("Show deleted welds", "Reset"); a stamp icon records who re-stamped (`5-29`, `5-32`).
- NDT: "NDT req." checkbox per weld; mass NDT request per isometric, one request per page by default or "single page request" (Mar 2026); several NDT methods per weld possible (Dec 2023); mass upload of results/PWHT with up to four report numbers; Pre-HT and PWHT requests share one window and mass requests exist (Jan 2025). Archive views: Finished NDT, Open NDT results, Open NDT welds.
- Mass Edit Welds, Set Vi results on multiple welds, Visual reports archive, per-isometric Punchlist, "Set phase" (marks work-preparation KPIs, such as materials pulled; also Set Phase (Mass) in the list).
- Isometric revisions: PDF only; a revision register supports charging extra work; deleting a project site archives it with restore ("Show Archived Sites").
- Field Work Packages group isometrics of an area or system (name required, description optional), clustered by foreman labels.
- Dashboard: default one month, left filters, View menu toggles weld totals between mm and counts (Mar 2025); Excel export of all weld data and an API are advertised.
- Dashboard reports: NDO percentage monitoring, revision overview, welder certificate renewal.
- Company and product claims: ISO and ASME support, private cloud or dedicated servers, named users include several Dutch contractors (home page).
