# WeldPilot → Welding data → ITPs

Source: `weld__welding__itps.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=weldpilot-itps`.
State of the page for the observing account: "You do not have rights to open this page."

## Page
- Document title: "- WeldPilot®" (the page sets no title of its own in the capture).
- Breadcrumb: none in the capture.
- Tabs: none in the capture.
- Buttons above the list: none. There is no list on this page for the observing account.
- Page content (`#content`): the single message "You do not have rights to open this page." Nothing else is rendered in the page area.
- Shell elements present in the DOM (not specific to this page): language links in the header (Nederlands, English, Deutsch, Français, all `index.php?lang=…&page=weldpilot-itps`); the app switcher tiles MTOPilot® (`/mtopilot/`), ESTPilot® (`/estpilot/`), WeldPilot® (`/weldpilot/`), TeamPilot® (`/teampilot/`), ToolPilot® (`/toolpilot/`); the handheld floating button (title "Handheld") with menu items "Scan weld", "Scan flange QR label", "Add punch".

## List
None. The page shows no table for the observing account. The capture contains no column list, no info or empty text of a table, no row options and no export or print buttons for this page.

Server requests: none specific to this page. The only request made while loading is the shell notification counter `/core/ajax/ajax-notifications.php?action=count_unread`.

## Dialogs
None. No control on this page opens a dialog in the capture.

Also present in the page DOM, opened from elsewhere (not from this page's content): `editCompanyData`, `passwordChange`, `themeChange`, `admin` (System settings), `docPersonnel`, `cardPersonnel`, `cardPersonnelEdit`, `searchProject`, `chooseProjectSite`, `addDefaultProjectSite`, `pdfCalculationStatuses`, `optsActivate`, `optsDeactivate`, `optsGlobalDeactivateWps`, `optsWpsCopy`, `deleteCronReport`, `editCronReport`, `editIsometricPhaseMass`, `signServiceRequest`, `editServiceRequest`, `addPqr`, `addFlange`, `editFlange`, `deleteFlange`, `importFlanges`, `docsFlange`, `filterFlanges`, `pdfFlangeReport`, `calculator`, `todo`, `calendarModal`, `transferFromLagerToProject`, `bulkTransferFromLagerToProject`, `moveLagerToLager`, `returnFromLager`, `correctLagerEntry`, `editLagerItem`, `adjustLagerQuantity`, `removeLagerItem`, `showStorehouseAuditTrail`, `viewLagerCerts`, `createTransferOrder`, `wpWeldScanModal`, `wpFlangeScanModal`. Most of these are the same shell dialogs as on the dashboard page (`SAME-AS weld__start__dashboard`); `addFlange` is the same as on the project-sites page.

## Rules found in the page's JavaScript
- The only page-specific line in the new script text of this capture is `var __wsappsDebugPage = "weldpilot-itps";`.
- The other script lines in the capture are marked as already captured on earlier pages (shared shell code: request helpers such as `getListOfMaterials.php`, `searchProject.php`, `searchUnitRates.php`, `searchTarrifs.php`, `searchFactors.php`, `saveAddCalculationModalState.php`). They are not tied to this page in the capture.
- No validation, no field shown or hidden on a condition, no browser-side computation and no ITP list request are shown for this page. None found in the capture for this page's content.

## Sample data
None. The observing account has no rights to this page, so no ITP rows, counts or figures are shown.

## Not in the capture
- The ITP list, its columns, its toolbar buttons, its dialogs and its row actions. They are not rendered for the observing account, so they cannot be captured with this account.
- From the browser-pass notes (`_interactive/I1-weld-isometric.md`, not this page): the isometric page's "Link ITP" picker calls `weldpilotItps.php?action=picker_list`, which returned an empty list (`{"success":true,"items":[]}`) for that account and project. The notes do not record this ITP page being opened with rights, so the list layout for an account that has rights is not documented in the reference material available here.
