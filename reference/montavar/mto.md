# Reference capture — MTOPilot

Observed read-only on 2026-11-15 on the reference site (sandbox project site "Zandbak"). No form was submitted.
Notation: `Label [name type]`, `*` = required, `sel{n}` = select with n options.
Shared screens (project sites, projects, isometrics list, isometric header, users) are in `shared-core.md`; Material part, Type of material, Material supplier and Certifications are in `weld-catalogs.md`.

Not captured: **Storehouses** ("You do not have rights to open this page"). The storehouse dialogs below were readable because they are embedded in other pages.

## Flow

```
Material database ──► ISO materials ──► Order materials ──► Pending order ──► Material take in
                                                                                    │
                                                              Material inventory (per storehouse)
                                                                                    │
            Ord.? / Inv. / Picked per row ◄──── transfer to project / pick ◄────────┘
                             │
        Material status % ──► Isometric execution (Reserve, Start) ──► Pick List archive
```

## Dashboard (Start)

- Header: site, date, Site ID. Selector **Operation phase** (All operation phases + each phase) with "Current <phase>" chip. Button: Material revisions report.
- KPI cards: Theoretical startable (isometrics in scope, started) · Partially covered (some stock, not enough to start fully) · Blocked isometrics (shortage in free pool; reserved) · Blocking backorder qty (isometrics waiting on ordered material; open ordered total) · Not ordered materials (isometrics still missing an order; unique materials) · Free pool materials (unique materials with positive free pool after take-ins, issues and reservations)
- Visual management chips: Max startable, Free pool materials, Ordered, Received, Open ordered, Blocking backorder, Not ordered, 0-7 days, 8-14 days, 15+ days, No logistics update. Charts: "Isometrics by logistics signal" (bar), "Backlog by site" (stacked: open ordered, blocking backorder, not ordered) with a small table.
- Readiness focus: "Top startable isometrics" (and blocked / hottest blocker materials).
- Operations board: tabs ALL · STARTABLE · PARTIAL · BLOCKED · OPEN ORDERED · NOT ORDERED · AT SERVICE · AT LAYDOWN · AGING; "Clear server-side filters". Columns: Project / ISO | Readiness (badge BLOCKED / PARTIAL / STARTABLE / STARTED + "Covered n / m") | Shortage (qty + top material numbers) | Blocking backorder | Not ordered | Logistics / Aging (signal: Not-sent, Started, Laydown, At service; last event date and age in days) | Action (ISO link).

## Isometric in MTO (panel "Materials")

- Header buttons: Options ▾ (Attachments, Audit trail, Set phase) · Set type · Delete selected · Add ▾ (Add material from DB, Add custom material). Panel: pilot switch ▾, Print (MTO report, language), type filter ▾ (All types + each operation phase), refresh, edit isometric.
- Status card adds: Hydrotest completed (Yes/No), **Material status %** with a refresh button.
- Columns: Group | Mat.no. | DIA | LBS/SCH | Description | Type (operation phase) | Qty. | UOM | Ord.? (Yes/No) | Inv. | Picked | Options | checkbox
- Add material from DB: Material group [sel 258, "Choose group"] → Material [sel, filled after the group is chosen] → Quantity* [number], Revision [sel: isometric revisions], Type [sel: operation phases]
- Add custom material: Material group*, Article No, Legacy No, Material No*, DIA, LBS/SCH, Quantity*, Type [sel], Price, UOM [sel 20], Revision [sel], Charge number [sel: from certificates], Material description, "add to DB" [checkbox]
- Set type for checked rows: operation phase [sel]. Import material in ISO: CSV file.
- Quantity by revision: click the quantity → Beginning / Now and a log; "Remove quantity by revision" needs a revision, step 0.01, max = current quantity (see `PARITY.md`).
- Receive directly on the isometric ("add received material"): Order No. [sel], Supplier [sel].

## Materials (catalogs)

- Material database: columns CC | Group | Article No | Material No | Description | DIA | LBS/SCH | UOM | Options, per-column search. Buttons: Mass edit materials, Import material, Add material.
  - Add material: Component code, Material group*, Article No, Legacy No, Material No, DIA, LBS/SCH, UOM [sel 20: EA, BX, M …], Material part [sel], Type of material [sel], Material description
- UOMs: UOM | Options. Add: UOM*
- Operation Phases: ID | Operation Phase | Options. Add: Material type*. Sandbox phases: Shop, Field, Hydrotest field, Support Field, Valves, Support Shop, Support WS, Support FW, Shop missing, Revision mat, Shop IYM, Field IYM, and two company-named phases.
- Spools, Material part, Type of material, Material supplier: same screens as in WeldPilot.

## Order / Take in

- Order materials: columns Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | checkbox. One row per material, summed over the isometrics that still need it. Filters: project, isometric. Buttons: Export, **Order checked materials**.
- Pending order: Group | Material No | Description | Ordered | Ord. No. | Date | Received. CSV / Excel / print.
- Material take in: log of receipts — Date | Order No. | Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Supplier. Button **Receive materials**: Order No. [sel `00007 | date`], Supplier [sel] → then quantities per line. Negative quantities appear in the log as corrections.
- Material inventory: Material group | Article No | Material No | DIA | LBS/SCH | Description | Quantity | UOM | Options | checkbox. Show [Only with quantity / All materials]. Add ▾ (Add material from DB, Import). **New Transfer Order (n)** for checked rows. Row options: inventory log, Print QR label, Request transfer to storehouse, remove from inventory.
- Materials list: Project | Iso number | Ch.clean | Group | Mat.no. | Description | Qty. | Ord.? | Inv. | Picked. Cached, shows "Last refresh" and a refresh button. Filter, Excel, print.
- Order archive: filters Project, From date, To date. Columns Date | Request number | Assigned supplier | Options.
- Certifications: same screen as in WeldPilot.

### Storehouse dialogs (embedded)
- Transfer from storehouse to project: quantity (min 0.01, step 0.01)*, to project site* [sel]. Bulk variant for checked rows.
- Move storehouse to storehouse: quantity, "all" [checkbox], to storehouse [sel]
- Return from storehouse: quantity, "all" [checkbox]
- Correct entry / Edit storehouse item: Material group (max 100), Article no (100), UOM [sel], Description (2000), DIA (20), LBS (20), **Reason*** [sel: Import error / Name correction / Other], Reason text (500), certificate charge [sel] or new charge, certificate file
- Adjust quantity: 3 inputs. Remove item: 2 inputs (reason such as "Imported by mistake"). Storehouse audit trail. View certificates.
- Create transfer order: Type* [sel: Inventory - Project / Inventory - Storehouse / Storehouse → Project / Storehouse → Storehouse / Return → Inventory], Priority [Normal / Urgent], From storehouse, To project site, To storehouse, Notes, items (material no*, description, quantity* min 0.01, UOM).

## Projects data

- Projects, Isometrics list, Iso overview: shared screens.
- Isometric execution: counter "n isometric(s) found" with time; filters Type [Shop / Field / Valves], % [All / 100% / 80–99% / 70–79% / < 70%], Priority [Prio-1 / Prio-2 / Prio-3]; CSV, Excel, Print, search; auto-refresh interval select. Columns: Project | ISO | Piping class | Priority | Drawing no. 1 | Chemical clean | Mat.status (bar + %) | Options (**Reserve**, **Start**). Buttons: Reserved materials, Refresh all. Note: opening this page recalculates the cached material status.
- Pick List archive: filters Project, From date, To date. Columns Date | Report No. | Project | ISO No | Taken? | Options. Button: Pick list archive export.

## Logistic

- Service companies: Name | Address | Phone | Email address | Enabled on this site | Options. Add: Name*, Address*, Phone, Email address.
- Service request (spools): Project | ISO | Spool | Diameter | Paint spec. | PWHT (✓/✗) | Chemical clean | Currently on | Last request | checkbox. Buttons: **Service request** (Company [sel], Name, Note, include isometric drawings [checkbox]), **Move to laydown**, Filter, Export. "Currently on" shows the service company, "Transport" or the laydown.
- Service req. - Materials: Project | ISO | Material | Dia | P.Spec. | Ch.clean | Qty. | Currently on. Buttons: Move to laydown, Filter.
- Request archive: date filter, ordered by date.
- Laydown areas: Laydown | Enabled on this site | Options. Add: Laydown*. "Laydown areas - Materials" is a second catalog with the same shape.

## Hydrotest request (dialog reachable from logistics / releases)

- QA/QC engineer [sel], Test record no., Pump type, Hose type, Manifold, Pressure gauge no., Recorder No, Calibration cert, Piping class, Design code, Test medium, Required test pressure, Actual test pressure, Date, Test start, Test end, Area temp, Test duration, Required leak test pressure, Leak test duration …
- Custom hydrotest documents: type [sel, 6: Punchlist, Pressure test, Blind list …], files.

## ISO Book (multi-document PDF, both pilots)

- Language; include checkboxes: Task sheet, ITP documents, ITP 2 document, Isometric, NDT Pre, NDT, PWHT, LISL, LISL V2, LISL (A3), Weld record, LISL [GU], LISL [MV], LISL [ISS], blank LISL, Pick Lists, Punch list, Punch list (blank), Flange report, Flange labels, Certificate Index, PQR, WPS, NDT Process documents, welder's summary, Visual reports, Prefab release, Field release, material certificates, MTO report per operation phase, and one checkbox per custom attachment name.
