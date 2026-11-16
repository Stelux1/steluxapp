# WeldPilot → Welding data → NDT Batch Import and ISO PDF Import

Source: `weld__welding__ndt-batch-import.txt`, `weld__welding__iso-pdf-import.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=ndt-batch-import` and `/weldpilot/index.php?page=iso-pdf-import`.
State of the page for the observing account: "You do not have rights to open this page." (both pages).

No browser-pass notes under `reference/montavar/raw/_interactive/` mention either page. No dialog captures (`weld__welding__ndt-batch-import__*`, `weld__welding__iso-pdf-import__*`) exist.

## Page

Both pages show the same content for the observing account: the page area contains one message and nothing else.

- Title (page `<title>`): "- WeldPilot®" (both pages).
- Breadcrumb: not in the capture.
- Tabs: none in the capture.
- Buttons above the list: none in the capture (no list is shown).
- Message in the content area: "You do not have rights to open this page." (both pages).

Chrome present on every page of the app, not controls of these pages: the app switcher tiles at the top (MTOPilot®, ESTPilot®, WeldPilot®, TeamPilot®, ToolPilot®) and the floating handheld button (title "Handheld") with its menu items "Scan weld", "Scan flange QR label" and "Add punch". These are not opened by either page.

## List

None. The pages show no table for the observing account: no columns, no DataTables configuration, no `ajax` request, no export or print buttons, no row options and no info or empty texts.

The only request made while loading both pages is the global notification counter: `/core/ajax/ajax-notifications.php?action=count_unread`.

## Dialogs

None. Neither page has a control that opens a dialog for the observing account, so no dialog section is written for these pages.

Also present in the page, opened from elsewhere (ids only, written in full in the dashboard and other captures): editCompanyData, passwordChange, themeChange, admin, docPersonnel, cardPersonnel, cardPersonnelEdit, searchProject, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsActivate, optsDeactivate, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.

## Rules found in the page's JavaScript

Both pages load the same shared script bundle. The only lines that are new for each page in its capture are the page identifier:

- NDT Batch Import: `var __wsappsDebugPage = "ndt-batch-import";`
- ISO PDF Import: `var __wsappsDebugPage = "iso-pdf-import";`

The rest of the shared script is recorded in earlier captures and is not repeated here. No validation, field rule, computed value or page-specific request is found in these captures for either page. The only request the page makes is the notification counter listed under List.

## Sample data

None. The observing account sees no rows, no counts and no figures on either page.

## Not in the capture

Everything the two pages are for is not visible to the observing account. The capture shows only the rights message, so the following are not in these captures:

- The import form or upload control of each page (NDT Batch Import and ISO PDF Import): not shown, no fields, no buttons, no dialogs.
- Any list, table or history on either page: not shown.
- Any dialog opened from either page: none exists in the capture.

Capturing these requires an account with rights to open the two pages. The pages would then need their own captures (for example `weld__welding__ndt-batch-import__<what was opened>`).
