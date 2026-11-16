# INDEX - MTOPilot knowledge base (websonik.com/kennisbank, section 3 + 4-13)

Read in a real browser pane (text of every article plus every screenshot opened at full size). 38 articles read (37 from section 3, plus 4-13). The articles are short; most facts are only in screenshots. Dutch UI text appears rarely; the product UI itself is English.

Caveats: the screenshots are from 2021-2024 and sometimes from other products (3-1-1 shows a WeldPilot dialog). Sample CSV files (downloads) were not opened, so no column list of the CSV sheet exists in the KB text. A few composite screenshots (3-21 add-project / add-isometric forms, 3-35 add-user, 3-36 add-profile) are too small to read field by field.

## Articles (slug - title - content)
- 3-1-general-data - 3.01 General data - admin rights on projects; Project sites list screenshot.
- 3-1-1-project-sites - 3.02 Project sites - Add project site dialog: mandatory fields, WPS validation, Archived, Material Management Display Setting (what lights the indicator), Document settings.
- 3-1-2-materiaalbibliotheek-in-menu-project-sites - 3.03 - import material library from another project site ("Import materials from").
- 3-1-3-project-site-archiveren - 3.04 - Archived checkbox, Show archived sites.
- 3-5-dashboard - 3.05 Dashboard - spool locations list, filter, Show all, spool history.
- 3-5-importeren-van-materiaal-met-behulp-van-een-csv-bestand - 3.06 - CSV material import steps and dialog.
- 3-7-overnemen-van-materiaaldatabase-of-enkele-materialen-van-een-bestaand-project - 3.07 - take over library; Home location checkboxes on Edit material; material field list.
- 3-8-material-part - 3.08 - Part / Custom table.
- 3-9-type-of-material - 3.09 - Type of material / Type of steel / description / Basic material / Material group.
- 3-10-uom-unit-of-measure - 3.10 - UOM table.
- 3-11-spools - 3.11 - spool names, Enabled on this site, Activate/Deactivate selected.
- 3-12-operation-phases - 3.12 - phase labels (Field, Hydrotest field, Nog te bepalen, Shop, Supports, Valves).
- 3-13-material-supplier - 3.13 - supplier table.
- 3-14-order-materials - 3.14 - order screen, Order checked materials, PDF order document layout.
- 3-15-pending-order - 3.15 - pending order table with Ordered / Received.
- 3-16-material-take-in - 3.16 - Receive materials dialog, Alr. rec. / Today rec.
- 3-17-material-inventory - 3.17 - inventory, Add from DB, Import, Material No key.
- 3-18-materials-list - 3.18 - materials list with Ord.? / Inv. / Picked?, nightly refresh.
- 3-19-order-archive - 3.19 - archive of PDF orders, assign supplier.
- 3-20-certifications - 3.20 - certificates: add, import, ZIP export, where-used.
- 3-21-project - 3.21 - project/iso/material creation, import warnings, composite screenshots.
- 3-211-isometrics-list - 3.211 - isometrics list, Options menu, indicator legend M/E/W/Pfb/Fld, mass edit field list.
- 3-22-open-isometric - 3.22 - isometric materials page, truck icon colours, Picked, revisions.
- 3-23-isometric-execution - 3.23 - 70 % threshold, Reserve, Start, screenshot of the execution screen.
- 3-24-pick-list-archive - 3.24 - pick list PDF and take registration.
- 3-25-iso-overview - 3.25 - Project search dialog.
- 3-26-service-companies - 3.26 - service company table.
- 3-27-service-request-spools - 3.27 - spools overview, service request, move to laydown.
- 3-28-service-req-materials - 3.28 - one line, refers to 3.27.
- 3-29-request-archive - 3.29 - archive of requests, release document, upload.
- 3-30-laydown-areas - 3.30 - laydown areas and history.
- 3-31-laydown-meterials - 3.31 - one line, refers to 3.30.
- 3-32-company-data - 3.32 - admin only, via helpdesk.
- 3-33-change-password - 3.33 - change-password dialog.
- 3-34-change-theme - 3.34 - System default / Pro Suite.
- 3-35-user-accounts - 3.35 - user accounts and per-project profiles.
- 3-36-profiles - 3.36 - profiles and rights matrix.
- 4-13-statuses - 4.13 - ESTPilot calculation statuses (Approve, Cancel, On hold, Reject).

## Answers found

1. **Material status % of an isometric** - partly. 3-23: execution start button appears when needed materials for a phase/label are present from 70 % completeness (screen header "Percent range: 70 - 100%"). 3-22 (screenshot): "Material status" shown as a coloured percentage with a refresh button (64 % red, 83 % separate "Status"); truck icon: red = needed materials not in stock, yellow = present but not in required quantity, green = in stock. NOT in KB: what exactly is counted and the formula.
2. **Isometric execution** - partly. 3-23: Start button when >= 70 %; if stock suffices for only one of two isos, starting one removes Start on the other; Reserve reserves materials for the iso so you can view by priority and can be undone; Start (confirm dialog with Note) cannot be undone except by manual per-item actions; Start creates the pick list (3-24). Screenshot: columns Project, ISO, Piping class, Priority (Prio-1, Prio-2, Prio-4...), Drawing no., Chemical clean, Mat.status, Reserve/Start; buttons Reserved materials, Filter, Refresh all. NOT in KB: BLOCKED / PARTIAL / STARTABLE / STARTED names (only a "Started" label in an iso title), Type filter Shop/Field/Valves (only appear as Operation Phases / Type values, 3-12), priority semantics beyond Prio-N values.
3. **Pick list** - partly. 3-24: created and stored as PDF after clicking Start; printer icon opens the PDF; list button registers whether materials were picked up and by whom, plus extra info (Note). Screenshot: 5-digit Pick List No., Report No., Taken? Yes/No, "Confirm material take" dialog with Note. Correcting Picked: 3-22 - click the Picked number and return the wanted number; for increased quantities after issuing, add a new line. Numbering rule not stated beyond sequential 5 digits in screenshots.
4. **Material inventory** - partly. 3-17: shows all present materials, sum of take-ins, manual add from the library (items must exist in library), CSV import via template, Material No is the unique key checked against the library, useful for client-supplied material; screenshot: "Show: Only with some quantity" filter, Add menu (Add material from DB / Import), row icons. NOT in KB: Transfer to project, moving between storehouses, return to inventory, corrections with reasons, transfer orders (types, priority, statuses), QR labels.
5. **Order -> take in** - partly. 3-14: select checked lines, "Order checked materials" creates a PDF (quotation or order); similar lines merged; saw-loss/oversize is decided by the user, no automatic allowance; supplier is linked later in Order archive (3-19). PDF layout and 5-digit order number in screenshot. 3-15: pending order lines with Ordered/Received/Ord. No./Date. 3-16: Receive materials dialog (Order No. + Supplier chosen at take-in), per-line "Today rec." vs "Alr. rec." (partial receipts). 3-20: certificates added/imported separately (PDF optional at first). NOT in KB: e-mail of the order, negative receipts, certificates captured at take-in.
6. **Materials on an isometric** - partly. 3-21/3-22: Add -> "Add material from DB" (Material group dropdown, then Material search, Type dropdown e.g. Shop, Quantity) or "Add custom material"; Import of CSV into iso; columns Group, Mat.no., DIA, Type, Qty, UOM, Ord.?, Inv., Picked?, Options; quantity changes by revision handled by clicking the quantity (not picked) or the Picked number (return) or a new line (more needed than issued), trash to delete. NOT in KB: "add to DB" option for custom materials, "Set type" action.
7. **Material DB import by CSV / copy from another project** - partly. 3-5-importeren (steps, sample CSV download, no column list in text), 3-1-2 and 3-7 (copy whole DB via "Import material database from another project site"; single item via Home location checkboxes on Edit material). Visible database fields: Home location, Material group, Article No, Legacy No, Material No, DIA, LBS/SCH, Material part, Type of material, UOM, Price, Material description. The exact CSV column list is not given (sample file not opened).
8. **Logistics** - partly. Service companies 3-26 (fields Name, Address, Phone, Email); service request (spools) 3-27 (select spools, Service request with Company, Name, notes -> Confirm -> PDF; Move to laydown); service request for materials 3-28 (no content, refers to 3-27); request archive 3-29 (list with Report No., Company, Added by; print request, print Release document, Upload approved document); laydown areas 3-30 (add, open area, History); laydown materials 3-31 (no content). NOT in KB: statuses of requests, signing steps beyond upload of an approved document.
9. **MTO dashboard / Operation phases** - partly. 3-5: the dashboard is the spool-location list (no cards/boards); 3-12: Operation phases are labels to group materials by phase (Field, Hydrotest field, Nog te bepalen, Shop, Supports, Valves).
10. **Storehouses** - not in the knowledge base (no article; the only related notions are "Home location" per project and laydown areas).
11. **Spools** - partly. 3-11 (names, Enabled on this site, activate/deactivate), 3-5 and 3-27 screenshots: filter fields Paint spec., Diameter, Chemical clean, Currently on, Request; columns Project, ISO, Spool, Chemical clean, Currently on, Last request. "Currently on" comes from the spool history (Date / Type Laydown or Service / Location: laydown name or "Ord. No. nnnnn <service company>"), 3-5.
