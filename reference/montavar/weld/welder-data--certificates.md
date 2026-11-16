# WeldPilot → Welder data → Certificates

Source: `weld__welder__certificates.txt`, `weld__welder__certificates__edit.txt` (browser-pass notes: `reference/montavar/raw/_interactive/I2a-welders-catalogs.md`) — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/certificates/`.
State of the page for the observing account: normal (the page and its list opened; no rights message).

## Page
- Title: `Certificates - WeldPilot®`.
- Breadcrumb (top bar): "Certificates" (link `index.php?page=certificates`, the active crumb).
- Tabs: none on this page.
- Panel title: "Certificates".
- Buttons above the list:
  - "Add Certificate" (top bar, btn-primary, block, plus icon, `href="#addCertificate"`, `data-toggle="modal"`) → opens the Add Certificate dialog (`#addCertificate`).
  - Icon-only "+" button in the panel heading (same class, same `href="#addCertificate"`, `data-toggle="modal"`, plus icon, no text) → opens the same dialog.
  - "CSV" (`buttons-csv`), "Excel" (`buttons-excel`), icon-only print (`buttons-print`, print icon). All three are links with `href="#"`; the capture shows no handler for them.
- The page DOM also contains a global floating menu (outside the content area, not specific to this page): "Scan weld", "Scan flange QR label", "Add punch". Those are not part of this page's list.

## List
- Table id `datatableWarehouse` (DataTables, client-side: `serverSide` false, `ajax` null — no server-side request for the list).
- Columns, in order:
  1. Name (data key 0, sortable, visible)
  2. Abbreviation (data key 1, sortable, visible)
  3. Options (data key 2, flagged sortable, visible; contains the row buttons, no text)
- Hidden columns: none.
- Default sort: column 1 (Abbreviation), ascending.
- Page length: default 20. The DataTables configuration lists length options 5, 20, 50, 100, 500, but the DOM has no page-length selector and no pagination; the browser-pass notes record "none (all rows)" for this page.
- Per-column search inputs: none.
- Filters: none beyond the global search.
- Global search: a label with a search icon and an input `type="search"`, placeholder "Search", with a clear button (aria-label "Clear", times icon). The DataTables search text is empty.
- Row options, in order:
  - Pencil icon, btn-warning, `title` none, `data-id` = row id, `href="#editCertificate"`, `data-toggle="modal"`, class `open-editCertificate` → opens the Edit certificate dialog (`#editCertificate`) and loads the row's data into it.
  - Trash icon, btn-danger, `data-id` = row id, `href="#deleteCertificate"`, `data-toggle="modal"`, class `open-deleteCertificate` → opens the Delete certificate dialog (`#deleteCertificate`).
- Bulk actions (Options menu): none in the capture.
- Export / print: CSV, Excel, print (see Page).
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (DataTables language setting; rendered as "Showing 1 to 4 of 4 entries" in the sandbox).
- Empty text: "No data available in table". Zero-match text: "No matching records found".
- Server-side table request: none (client-side table). The only request on load is the page-wide `GET /core/ajax/ajax-notifications.php?action=count_unread`.
- Unexplained in the capture: before the data table there is a second, header-only table (no id, classes `table table-striped … dataTable`) with header "Name | Abbreviation | Options" and no rows. Its DataTables configuration in the capture is an error: `TypeError: Cannot read properties of undefined (reading 'ajax')`. The capture does not show what this table is for.

## Dialogs

### Add Certificate (`#addCertificate`) — opened by "Add Certificate" (top bar) or the "+" button in the panel heading
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | `name` | text (`form-control`) | yes | empty | none shown |
| 2 | Abbreviation | `abbreviation` | text (`form-control`) | yes | empty | none shown |
| 3 | (no label) | `type` | hidden, in the footer | – | `1` | fixed value |

- Tabs in the dialog: none.
- Buttons: "Add" (btn-primary, btn-hideInsert, type submit, `name="addCertificate"`); "Cancel" (btn default, closes the dialog via `data-dismiss="modal"`); close icon in the header (`data-dismiss="modal"`).
- Rules stated in the dialog: none in text. Name and Abbreviation are marked `required` in the markup; the capture shows no JavaScript validation for them.
- The form has `method="post"`; the capture does not show the action attribute.

### Edit certificate (`#editCertificate`) — opened by the pencil icon of a row
The dialog shell in the page has only a header and a footer. The body is loaded when the row's pencil is clicked (see Rules). The captured load for row id 1 ("Ademlucht") gave:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | `name` | text (`form-control`) | yes | row's name (for row 1: `Ademlucht`) | loaded from the server on click |
| 2 | Abbreviation | `abbreviation` | text (`form-control`) | yes | row's abbreviation (for row 1: `AL`) | loaded from the server on click |
| 3 | (no label) | `editID` | hidden, after the fields | – | row id (for row 1: `1`) | loaded on click |

- Tabs in the dialog: none.
- Buttons: "Update" (btn-warning, btn-hideEdit, type submit, `name="editCertificate"`); "Cancel" (btn default, `data-dismiss="modal"`); close icon in the header.
- The loaded body sits inside a `FORM method="post"` in the dialog, in a container `#contentEditCertificate`.
- Rules stated in the dialog: none in text.

### Delete certificate (`#deleteCertificate`) — opened by the trash icon of a row
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (no label; text "Are you sure?" above it) | `deleteID` (id `bookIdDeleteCertificate`) | hidden, in the body form | – | empty in the markup; set by the page's script when the trash icon is clicked (the row's id) | depends on the clicked row |

- Tabs in the dialog: none.
- Buttons: "Delete" (btn-danger, btn-hideDelete, type submit, `name="deleteCertificate"`, trash icon `glyphicon glyphicon-trash`); "Cancel" (btn default, `data-dismiss="modal"`); close icon in the header.
- Text in the dialog: "Are you sure?".
- The Delete dialog's body was not opened in the capture; only its markup as shown above is in the page.

Also present in the page, opened from elsewhere (not controls of this page): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.

## Rules found in the page's JavaScript
- Edit click (`.open-editCertificate`): on click the handler takes the row's id into a variable `myBookId` and requests `/core/ajax/editCertificate.php?id=<myBookId>`; the response HTML is placed into `#contentEditCertificate`. The request actually observed was `GET /core/ajax/editCertificate.php?id=1&action=showroom` (status 200). The `action=showroom` parameter comes from a line that is not in this capture (the source lines of the handler's first five lines are among lines already captured on earlier pages). The exact read of the id is not in this capture either.
- Delete click (`.open-deleteCertificate`): the handler sets the value of `.modal-body #bookIdDeleteCertificate` to `myBookId`.
- Add and Edit validation: none found in the capture beyond the HTML `required` attribute.
- The classes `btn-hideInsert`, `btn-hideEdit` and `btn-hideDelete` are on the submit buttons; the capture does not show any script that reads them.
- Requests made by the page on load: `GET /core/ajax/ajax-notifications.php?action=count_unread` (page-wide, not specific to this list).
- Requests made after clicks: `GET /core/ajax/editCertificate.php?id=<id>&action=showroom` on the Edit click. No request on Add or Delete open. Submit requests (Add, Update, Delete) are not in the capture.
- Other scripts in the page's capture (for example the project search and the list requests for unit rates, tariffs and factors) belong to other dialogs or pages.

## Sample data
Row counts: 4 total, 4 shown ("Showing 1 to 4 of 4 entries").

| Name | Abbreviation | Options (edit / delete, data-id) |
|---|---|---|
| Ademlucht | AL | pencil / trash (id 1) |
| Lasserskwalificatie | LK | pencil / trash (id 5) |
| Sleutelcertificaat | SL | pencil / trash (id 4) |
| Veilig verplaatsen van lasten | VVL | pencil / trash (id 3) |

Rows appear in this order, which is Abbreviation ascending (AL, LK, SL, VVL).

From the browser-pass notes (not in the captures): the trash icons of rows 1, 2 and 4 are drawn pale, and the one for "Sleutelcertificaat" is bright red. The markup is the same for all four; the notes give no reason for the difference.

## Not in the capture
- The Delete certificate dialog body after a click (only its markup in the page is captured; the trash click was not captured as a separate opening).
- The Add Certificate dialog after a click (its markup is in the page; no separate open capture exists).
- The result of any submit (Add, Update, Delete): not clicked.
- The form action attribute of the three dialogs' forms: not shown in the markup.
- The second, header-only table's purpose (see List).
