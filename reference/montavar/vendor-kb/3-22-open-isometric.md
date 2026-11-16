# 3.22 Open isometric
URL: https://websonik.com/kennisbank/3-22-open-isometric/
Last updated 12-06-2026

## Text
- Open an isometric via the operational system or directly via the "Isometric List" menu.
- "Import" menu: import materials directly into an existing isometric. Works like the project-wide CSV import but materials only; same rules as chapter 1.2 ("preparing a CSV for import").
- Second way: add materials directly from the library or via "Add Custom Material"; click "Add".
- Breadcrumb: handy for quick jump e.g. from the isometric to the operational system. Clicking the isometric number lets you quickly open other isometrics in the same operational system.
- **Truck icon** shows with colour the status of the needed materials: red = needed materials not in stock; yellow = materials present but not in the required quantity; green = needed materials in stock.
- **Picked** = number of materials taken out. If a revision removes materials that were already picked, click the number and return the wanted number. Wrongly pulled materials (wrong selection): same steps. If a revision increases quantities but the materials were already issued: create a new line with "Add" and add the needed materials from the library.
- If a revision changes quantities and the materials were not yet picked: click the quantity and edit it. If the material lapses completely: delete the line with the trash icon.
- Link to the latest revision of the isometric drawing; clicking "Rev 0x" opens the revision register of all iso revisions (useful to justify extra work, "meerwerk").
- New revision: click the plus sign to add it. Only PDF files are allowed. To print later in the wanted format (A4/A3) and in perspective, save PDFs as described.
- Attachments to an isometric: open the Options menu, "Add attachment", select and upload a document.
- NOT stated here: the percentage formula of "Material status", the 70 % threshold (that is in 3-23), "Set type" and "quantity by revision" beyond the above.

## Screenshots (from screenshot)
1. Dialog "Import materials from CSV into Isometric": Choose file, "Download sample CSV file" (red frame), Import / Cancel.
2. Isometric "Materials" page (partly cropped): header "...-0-U901-806A-001 / Materials [Started]" (a play icon and the word Started in the title = isometric started); buttons "Import" and "Add" (dropdown with "Add material from DB" and "Add custom material", red frame). Info block: Piping class (10CS10), PWHT (No, red), Test pressure (14,3), Test system, and right block: Status (83%), Hydrotest completed (No, red), Material status (64%, red text) with a refresh button; "MTOPilot" dropdown; Search; table columns include Type, Qty, UOM, Ord.?, Inv., Picked?, Options. So "Material status" is a percentage with a refresh button and is coloured (red at 64 %, below the 70 % start threshold).
