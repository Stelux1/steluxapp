# Weld Pilot → NDT data → Defect codes

Source: `weld__ndt__defect-codes.txt`, `weld__ndt__defect-codes__edit.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/ndt-defects/`.
State of the page for the observing account: normal.

## Page
- Browser title: "Defect codes - WeldPilot®". Panel heading: "Defect codes".
- Breadcrumb (top bar): link "Defect codes" → `/weldpilot/ndt-defects/`. The capture shows no other breadcrumb parts and no tabs.
- Language links in the header (same page, `lang=nl|en|de|fr`): "Nederlands", "English", "Deutsch", "Français", each `/weldpilot/index.php?lang=<xx>&page=ndt-defects&id=&project=&projectSite=`.
- Buttons above the list (top bar):
  - Options menu `#showDefectOptions` (class `wsapps-bulk-options`, starts as `is-inactive`; becomes active when at least one row checkbox is ticked). Its menu items are not written in this capture (the header was captured as a diff). From the browser-pass notes (`I2a-welders-catalogs.md`): "Options ▾" with "Activate selected" and "Deactivate selected"; on the sister page NDT locations the capture shows "Activate selected" → `#optsActivate` (`data-toggle="modal"`). The dialogs `#optsActivate` and `#optsDeactivate` are present in this page (see Dialogs).
  - "Add" (`btn btn-sm btn-primary`, plus icon) → dialog `#addNdtDefect` (`href="#addNdtDefect"`, `data-toggle="modal"`).
- Norm bar above the table (form, method post, class `wsapps-defect-normbar`):
  - Label "Norm" + select `#activateDefectNormSelect`, name `defect_norm`, 4 options: (empty value) → "All" (selected by default); `iso6520` → "ISO 6520-1"; `asme` → "ASME B31.3"; `api1104` → "API 1104".
  - Button "Activate on this site" (`btn btn-sm btn-primary`, name `activateDefectNorm`, type submit).
  - Help text (shown as written): "Tick rows and use Options, or choose a norm and activate it here. NA uses that list when Defect norm on the project site is the same. No norm selected keeps the current list."

## List
- Table `#datatableWarehouse`, client-side (`serverSide: false`, `ajax: null`), all 98 rows in the page.
- Columns in order (all visible, all sortable): 1 "Code", 2 "English", 3 "Dutch", 4 "Group", 5 "Norm", 6 "ISO 6520-1", 7 "Enabled on this site" (title written with a line break: "Enabled on<br>this site"), 8 "Options", 9 header-checkbox column (`.js-defect-check-all`, title "Check all"). Row cells for columns 3 to 7 carry class `hidden-xs` (hidden on the smallest screens); column 7 cells carry class `wsapps-defect-onsite`.
- Default sort: `order: [[7,"asc"]]` (column index 7 = "Options"). The rows in the capture are in this order: rows with an ISO reference in ascending order of that reference (100 to 5213), then the 11 "Current list" rows (reference "-"); the order inside equal references is not by norm.
- Page length 20; length menu options 5, 20, 50, 100, 500.
- Search: one global search input (placeholder "Search") with a clear (x) button. No per-column search inputs.
- Export buttons: "CSV", "Excel", and a print button (printer icon, no text).
- Row options (column "Options"): every row shows only a grey lock icon (`glyphicon glyphicon-lock text-muted`) with the tooltip "This defect code cannot be changed." No pencil and no trash icon in any of the 98 rows. Column 9 holds a row checkbox (class `checkbox11`, name `ccid_<id>`, value `s<id>`).
- Bulk actions: tick rows, then the Options menu (see Page). The header checkbox ticks or unticks all rows matching the current search.
- Texts: info "Showing _START_ to _END_ of _TOTAL_ entries" (displayed in the capture as "Showing 1 to 98 of 98 entries"); empty "No data available in table"; no match "No matching records found". No server-side table request (no `ajax` url).
- Enabled on this site column: cell text "Yes" or "No" (the browser-pass notes say orange No / green Yes).

## Dialogs

### Add (`#addNdtDefect`) — opened by the "Add" button
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Code | `code` | text, maxlength 20 | yes | empty | |
| 2 | English | `name_en` | text, maxlength 100 | yes | empty | |
| 3 | Dutch | `name_nl` | text, maxlength 100 | no | empty | |
| 4 | Group | `group_name` | select | no | "Crack" (first option) | 6 options: `crack` → Crack; `cavity` → Cavity; `inclusion` → Inclusion; `fusion` → Fusion; `shape` → Shape; `misc` → Miscellaneous |
| 5 | Norm | `norm` | select | no | "Current list" (first option) | 4 options: `legacy` → Current list; `iso6520` → ISO 6520-1; `asme` → ASME B31.3; `api1104` → API 1104 |
| 6 | ISO 6520-1 | `iso_ref` | text, maxlength 20 | no | empty | |

Buttons: "Add" (`btn-primary`, name `addNdtDefect`, submit), "Cancel" (dismisses), close (x) in the header. Form method post.

### Edit (`#editNdtDefect`) — opened by a row's `.open-editNdtDefect` control
No row in the sandbox shows such a control (all rows are locked), so the dialog was never opened. Its structure is in the page (body built by the page's script on click). Hidden inputs in the footer: `editID` (`#editNdtDefectId`, type hidden, filled from the control's `data-id`) and `secureCode` (`#editNdtDefectSecure`, hidden, from `data-secure`).
| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Code | `code` | text, maxlength 20 | yes | from `data-code` | |
| 2 | English | `name_en` | text, maxlength 100 | yes | from `data-en` | |
| 3 | Dutch | `name_nl` | text, maxlength 100 | no | from `data-nl` | |
| 4 | Group | `group_name` | select | no | from `data-group` | same 6 options as in Add |
| 5 | Norm | `norm` | select | no | from `data-norm` | same 4 options as in Add |
| 6 | ISO ref. | `iso_ref` | text, maxlength 20 | no | from `data-iso` | label here is "ISO ref." (in Add it is "ISO 6520-1") |

Buttons: "Update" (`btn-warning`, name `editNdtDefect`, submit), "Cancel". Header title "Edit".

### Delete (`#deleteNdtDefect`) — opened by a row's `.open-deleteNdtDefect` control
No row shows such a control. Body text "Are you sure?". Hidden inputs: `deleteID` (`#deleteNdtDefectId`, from `data-id`), `secureCode` (`#deleteNdtDefectSecure`, from `data-secure`). Buttons: "Delete" (`btn-danger`, name `deleteNdtDefect`, submit), "Cancel".

### Activate selected (`#optsActivate`) and Deactivate selected (`#optsDeactivate`) — opened from the Options menu
Shown in this capture only as `SAME-AS weld__start__dashboard`; content read there:
| # | Dialog | Label | name | Type | Notes |
|---|---|---|---|---|---|
| 1 | Activate selected | (none) | `selectedIDS` (`#activationIds`) | hidden, read-only | filled by the page script with the comma-separated `val` of all ticked row checkboxes (e.g. `s84,s75`) |
| 2 | Activate selected | (none) | `fileid` | hidden | no value shown |
| 3 | Deactivate selected | (none) | `selectedIDS` (`#deactivationIds`) | hidden, read-only | same filling |
Text: "By clicking ‘Confirm,’ you will activate the selected options." / "...deactivate the selected options." Buttons: "Confirm" (`btn-success`, name `optsActivate` / `optsDeactivate`, submit), "Cancel".


## Rules found in the page's JavaScript
- `__wsappsDefectTable()`: returns the DataTable of `#datatableWarehouse` when it is initialised.
- `__wsappsSyncDefectBulk()` (runs on change of any `input.checkbox11`): collects the `val` of every ticked row checkbox (over all rows, including rows not on the current page) into `#activationIds` and `#deactivationIds`; removes the class `is-inactive` from `#showDefectOptions` when at least one is ticked, adds it back when none.
- `.js-defect-check-all` change: sets all header "check all" boxes to the same state and ticks or unticks every row checkbox that matches the current search, then re-syncs the bulk menu.
- `#activateDefectNormSelect` change: filters the table on column 5 ("Norm") by exact match to the selected option's text; "All" removes the filter. This only filters the view; saving is done by the "Activate on this site" submit (name `activateDefectNorm`, field `defect_norm`).
- `.open-editNdtDefect` click: copies `data-id`, `data-secure` into the hidden fields, builds the form body (Code, English, Dutch, Group, Norm, ISO ref.) and fills it from `data-code`, `data-en`, `data-nl`, `data-group`, `data-norm`, `data-iso`.
- `.open-deleteNdtDefect` click: copies `data-id`, `data-secure` into the delete dialog's hidden fields.
- Requests on load: `/core/ajax/ajax-notifications.php?action=count_unread` (notification count, shared by all pages). The add, edit, delete, activate and deactivate actions are ordinary form posts (no ajax endpoint in this page's script). Opening an edit dialog was not possible, so no request log exists for it (`weld__ndt__defect-codes__edit.txt` contains the 98 table rows and "0 request(s)").

## Sample data
- 98 rows, "Showing 1 to 98 of 98 entries" (page length 20, so 5 pages by default).
- By norm: ISO 6520-1 63, API 1104 15, ASME B31.3 9, Current list 11. Enabled on this site: Yes 11 (all "Current list" rows), No 87. Locked: 98 of 98, editable: 0.
- Group values counted: Shape 31, Cavity 15, Inclusion 12, Fusion 12, Crack 9, Miscellaneous 8, and "-" for the 11 Current list rows. ISO 6520-1 column is "-" for the Current list rows.
- Codes are not unique across norms (for example IP appears under API 1104 and ASME B31.3).
- Note: the first table in the capture (a header-only clone created by DataTables) has no rows; all rows are in `#datatableWarehouse`.

### All codes, grouped by norm

### Norm: ISO 6520-1 (63 rows)

| Code | English | Dutch | Group | Norm | ISO 6520-1 | Enabled on this site | Options | Row checkbox name |
|---|---|---|---|---|---|---|---|---|
| 100 | Crack | Scheur | Crack | ISO 6520-1 | 100 | No | locked (lock icon) | ccid_12 |
| 101 | Longitudinal crack | Langsscheur | Crack | ISO 6520-1 | 101 | No | locked (lock icon) | ccid_13 |
| 102 | Transverse crack | Dwarscheur | Crack | ISO 6520-1 | 102 | No | locked (lock icon) | ccid_14 |
| 103 | Radiating cracks | Stervormige scheuren | Crack | ISO 6520-1 | 103 | No | locked (lock icon) | ccid_15 |
| 104 | Crater crack | Eindkraterscheur | Crack | ISO 6520-1 | 104 | No | locked (lock icon) | ccid_16 |
| 105 | Group of disconnected cracks | Groep losse scheuren | Crack | ISO 6520-1 | 105 | No | locked (lock icon) | ccid_17 |
| 106 | Branching crack | Vertakte scheur | Crack | ISO 6520-1 | 106 | No | locked (lock icon) | ccid_18 |
| 201 | Gas cavity | Gasholte | Cavity | ISO 6520-1 | 201 | No | locked (lock icon) | ccid_19 |
| 202 | Shrinkage cavity | Krimpholte | Cavity | ISO 6520-1 | 202 | No | locked (lock icon) | ccid_27 |
| 301 | Slag inclusion | Slakinsluiting | Inclusion | ISO 6520-1 | 301 | No | locked (lock icon) | ccid_29 |
| 302 | Flux inclusion | Fluxinsluiting | Inclusion | ISO 6520-1 | 302 | No | locked (lock icon) | ccid_33 |
| 303 | Oxide inclusion | Oxide-insluiting | Inclusion | ISO 6520-1 | 303 | No | locked (lock icon) | ccid_34 |
| 304 | Metallic inclusion | Metaalinsluiting | Inclusion | ISO 6520-1 | 304 | No | locked (lock icon) | ccid_35 |
| 401 | Lack of fusion | Bindingsfout | Fusion | ISO 6520-1 | 401 | No | locked (lock icon) | ccid_38 |
| 402 | Incomplete penetration | Onvolledige doorlassing | Fusion | ISO 6520-1 | 402 | No | locked (lock icon) | ccid_42 |
| 501 | Undercut | Inkarteling | Shape | ISO 6520-1 | 501 | No | locked (lock icon) | ccid_43 |
| 502 | Excess weld metal | Te hoge sluitlaag | Shape | ISO 6520-1 | 502 | No | locked (lock icon) | ccid_48 |
| 503 | Excessive convexity | Te bolle hoeklas | Shape | ISO 6520-1 | 503 | No | locked (lock icon) | ccid_49 |
| 504 | Excess penetration | Te veel doorlassing | Shape | ISO 6520-1 | 504 | No | locked (lock icon) | ccid_50 |
| 505 | Incorrect weld toe angle | Verkeerde teenhoek | Shape | ISO 6520-1 | 505 | No | locked (lock icon) | ccid_51 |
| 506 | Overlap | Overlap | Shape | ISO 6520-1 | 506 | No | locked (lock icon) | ccid_52 |
| 507 | Linear misalignment | Lineaire hoog-laag | Shape | ISO 6520-1 | 507 | No | locked (lock icon) | ccid_53 |
| 508 | Angular misalignment | Hoekverdraaiing | Shape | ISO 6520-1 | 508 | No | locked (lock icon) | ccid_54 |
| 509 | Sagging | Doorzakking | Shape | ISO 6520-1 | 509 | No | locked (lock icon) | ccid_55 |
| 510 | Burn-through | Doorbranding | Shape | ISO 6520-1 | 510 | No | locked (lock icon) | ccid_56 |
| 511 | Incompletely filled groove | Onvolledig gevulde groef | Shape | ISO 6520-1 | 511 | No | locked (lock icon) | ccid_57 |
| 512 | Excessive asymmetry of fillet weld | Ongelijke beenlengte hoeklas | Shape | ISO 6520-1 | 512 | No | locked (lock icon) | ccid_58 |
| 513 | Irregular weld width | Onregelmatige lasbreedte | Shape | ISO 6520-1 | 513 | No | locked (lock icon) | ccid_59 |
| 514 | Irregular surface | Onregelmatig oppervlak | Shape | ISO 6520-1 | 514 | No | locked (lock icon) | ccid_60 |
| 515 | Root concavity | Wortelterugval | Shape | ISO 6520-1 | 515 | No | locked (lock icon) | ccid_61 |
| 516 | Root porosity | Wortelporositeit | Shape | ISO 6520-1 | 516 | No | locked (lock icon) | ccid_62 |
| 517 | Poor restart | Slechte herstart | Shape | ISO 6520-1 | 517 | No | locked (lock icon) | ccid_63 |
| 521 | Incorrect weld dimensions | Verkeerde lasafmeting | Shape | ISO 6520-1 | 521 | No | locked (lock icon) | ccid_64 |
| 601 | Stray arc | Zwerflas | Miscellaneous | ISO 6520-1 | 601 | No | locked (lock icon) | ccid_67 |
| 602 | Spatter | Spatten | Miscellaneous | ISO 6520-1 | 602 | No | locked (lock icon) | ccid_68 |
| 603 | Torn surface | Ingescheurd oppervlak | Miscellaneous | ISO 6520-1 | 603 | No | locked (lock icon) | ccid_69 |
| 604 | Grinding mark | Slijpspoor | Miscellaneous | ISO 6520-1 | 604 | No | locked (lock icon) | ccid_70 |
| 606 | Excessive grinding | Te ver weggeslepen | Miscellaneous | ISO 6520-1 | 606 | No | locked (lock icon) | ccid_71 |
| 610 | Temper colour | Aanloopkleur | Miscellaneous | ISO 6520-1 | 610 | No | locked (lock icon) | ccid_72 |
| 615 | Residual slag | Restslak | Miscellaneous | ISO 6520-1 | 615 | No | locked (lock icon) | ccid_73 |
| 618 | Faulty tack weld | Foute hechtlas | Miscellaneous | ISO 6520-1 | 618 | No | locked (lock icon) | ccid_74 |
| 2011 | Isolated gas pore | Enkele gasporie | Cavity | ISO 6520-1 | 2011 | No | locked (lock icon) | ccid_20 |
| 2012 | Uniformly distributed porosity | Gelijkmatig verdeelde porositeit | Cavity | ISO 6520-1 | 2012 | No | locked (lock icon) | ccid_21 |
| 2013 | Clustered porosity | Porositeitsnest | Cavity | ISO 6520-1 | 2013 | No | locked (lock icon) | ccid_22 |
| 2014 | Linear porosity | Lineaire porositeit | Cavity | ISO 6520-1 | 2014 | No | locked (lock icon) | ccid_23 |
| 2015 | Elongated cavity | Langgerekte holte | Cavity | ISO 6520-1 | 2015 | No | locked (lock icon) | ccid_24 |
| 2016 | Wormhole | Wormgat | Cavity | ISO 6520-1 | 2016 | No | locked (lock icon) | ccid_25 |
| 2017 | Surface pore | Oppervlakteporie | Cavity | ISO 6520-1 | 2017 | No | locked (lock icon) | ccid_26 |
| 2024 | Crater pipe | Eindkraterpijp | Cavity | ISO 6520-1 | 2024 | No | locked (lock icon) | ccid_28 |
| 3011 | Linear slag inclusion | Lineaire slakinsluiting | Inclusion | ISO 6520-1 | 3011 | No | locked (lock icon) | ccid_30 |
| 3012 | Isolated slag inclusion | Enkele slakinsluiting | Inclusion | ISO 6520-1 | 3012 | No | locked (lock icon) | ccid_31 |
| 3013 | Clustered slag inclusions | Slakinsluitingsnest | Inclusion | ISO 6520-1 | 3013 | No | locked (lock icon) | ccid_32 |
| 3041 | Tungsten inclusion | Wolfraaminsluiting | Inclusion | ISO 6520-1 | 3041 | No | locked (lock icon) | ccid_36 |
| 3042 | Copper inclusion | Koperinsluiting | Inclusion | ISO 6520-1 | 3042 | No | locked (lock icon) | ccid_37 |
| 4011 | Lack of side-wall fusion | Flankbindingsfout | Fusion | ISO 6520-1 | 4011 | No | locked (lock icon) | ccid_39 |
| 4012 | Lack of inter-run fusion | Bindingsfout tussen de lagen | Fusion | ISO 6520-1 | 4012 | No | locked (lock icon) | ccid_40 |
| 4013 | Lack of root fusion | Wortelbindingsfout | Fusion | ISO 6520-1 | 4013 | No | locked (lock icon) | ccid_41 |
| 5011 | Continuous undercut | Doorlopende inkarteling | Shape | ISO 6520-1 | 5011 | No | locked (lock icon) | ccid_44 |
| 5012 | Intermittent undercut | Onderbroken inkarteling | Shape | ISO 6520-1 | 5012 | No | locked (lock icon) | ccid_45 |
| 5013 | Shrinkage groove | Wortelkerf | Shape | ISO 6520-1 | 5013 | No | locked (lock icon) | ccid_46 |
| 5014 | Inter-run undercut | Inkarteling tussen de lagen | Shape | ISO 6520-1 | 5014 | No | locked (lock icon) | ccid_47 |
| 5211 | Excessive throat thickness | Te grote a-hoogte | Shape | ISO 6520-1 | 5211 | No | locked (lock icon) | ccid_65 |
| 5213 | Insufficient throat thickness | Te kleine a-hoogte | Shape | ISO 6520-1 | 5213 | No | locked (lock icon) | ccid_66 |

### Norm: ASME B31.3 (9 rows)

| Code | English | Dutch | Group | Norm | ISO 6520-1 | Enabled on this site | Options | Row checkbox name |
|---|---|---|---|---|---|---|---|---|
| CRACK | Crack | Scheur | Crack | ASME B31.3 | 100 | No | locked (lock icon) | ccid_75 |
| ROUND | Rounded indications | Ronde indicaties | Cavity | ASME B31.3 | 201 | No | locked (lock icon) | ccid_78 |
| ELONG | Elongated indication | Langgerekte indicatie | Inclusion | ASME B31.3 | 301 | No | locked (lock icon) | ccid_79 |
| LOF | Lack of fusion | Bindingsfout | Fusion | ASME B31.3 | 401 | No | locked (lock icon) | ccid_76 |
| IP | Incomplete penetration | Onvolledige doorlassing | Fusion | ASME B31.3 | 402 | No | locked (lock icon) | ccid_77 |
| UC | Undercutting | Inkarteling | Shape | ASME B31.3 | 501 | No | locked (lock icon) | ccid_80 |
| REINF | Face or root reinforcement | Sluitlaag of doorlassing | Shape | ASME B31.3 | 502 | No | locked (lock icon) | ccid_83 |
| CONC | Concave root or burn-through | Wortelterugval of doorbranding | Shape | ASME B31.3 | 515 | No | locked (lock icon) | ccid_82 |
| SURF | Surface porosity or exposed slag | Oppervlakteporie of zichtbare slak | Cavity | ASME B31.3 | 2017 | No | locked (lock icon) | ccid_81 |

### Norm: API 1104 (15 rows)

| Code | English | Dutch | Group | Norm | ISO 6520-1 | Enabled on this site | Options | Row checkbox name |
|---|---|---|---|---|---|---|---|---|
| C | Crack | Scheur | Crack | API 1104 | 100 | No | locked (lock icon) | ccid_84 |
| P | Porosity | Porositeit | Cavity | API 1104 | 201 | No | locked (lock icon) | ccid_94 |
| IF | Incomplete fusion | Bindingsfout | Fusion | API 1104 | 401 | No | locked (lock icon) | ccid_88 |
| ICP | Inadequate cross penetration | Onvolledige kruisbinding | Fusion | API 1104 | 401 | No | locked (lock icon) | ccid_87 |
| IP | Inadequate penetration | Onvolledige doorlassing | Fusion | API 1104 | 402 | No | locked (lock icon) | ccid_85 |
| IPD | Inadequate penetration due to high-low | Onvolledige doorlassing door hoog-laag | Fusion | API 1104 | 402 | No | locked (lock icon) | ccid_86 |
| BT | Burn-through | Doorbranding | Shape | API 1104 | 510 | No | locked (lock icon) | ccid_91 |
| IC | Internal concavity | Wortelterugval | Shape | API 1104 | 515 | No | locked (lock icon) | ccid_90 |
| CP | Cluster porosity | Porositeitsnest | Cavity | API 1104 | 2013 | No | locked (lock icon) | ccid_95 |
| HB | Hollow bead porosity | Holle rupsporie | Cavity | API 1104 | 2016 | No | locked (lock icon) | ccid_96 |
| ESI | Elongated slag inclusion | Langgerekte slakinsluiting | Inclusion | API 1104 | 3011 | No | locked (lock icon) | ccid_92 |
| ISI | Isolated slag inclusion | Enkele slakinsluiting | Inclusion | API 1104 | 3012 | No | locked (lock icon) | ccid_93 |
| IFD | Incomplete fusion due to cold lap | Bindingsfout door cold lap | Fusion | API 1104 | 4012 | No | locked (lock icon) | ccid_89 |
| EU | External undercut | Uitwendige inkarteling | Shape | API 1104 | 5011 | No | locked (lock icon) | ccid_97 |
| IU | Internal undercut | Inwendige inkarteling | Shape | API 1104 | 5013 | No | locked (lock icon) | ccid_98 |

### Norm: Current list (11 rows)

| Code | English | Dutch | Group | Norm | ISO 6520-1 | Enabled on this site | Options | Row checkbox name |
|---|---|---|---|---|---|---|---|---|
| GI | Gas Inclusion | Gasinsluiting | - | Current list | - | Yes | locked (lock icon) | ccid_7 |
| FMI | Foreign Material Inclusion | Insluiting van vast materiaal | - | Current list | - | Yes | locked (lock icon) | ccid_10 |
| UW | Undercut Weld | Insnoering | - | Current list | - | Yes | locked (lock icon) | ccid_5 |
| CR | Crater | Krater | - | Current list | - | Yes | locked (lock icon) | ccid_9 |
| CS | Crack Shrinkage | Krimpscheuren | - | Current list | - | Yes | locked (lock icon) | ccid_6 |
| LI | Lack of Inter-run Fusion | Lasinsluiting | - | Current list | - | Yes | locked (lock icon) | ccid_4 |
| OW | Overlap Weld | Lasverbranding | - | Current list | - | Yes | locked (lock icon) | ccid_8 |
| LOF | Lack of Fusion | Onvolledige doorsmelting | - | Current list | - | Yes | locked (lock icon) | ccid_3 |
| PO | Porosity | Porositeit | - | Current list | - | Yes | locked (lock icon) | ccid_2 |
| SI | Slag Inclusion | Slakinsluiting | - | Current list | - | Yes | locked (lock icon) | ccid_1 |
| RSC | Root surface concavity | Wortelinkeping | - | Current list | - | Yes | locked (lock icon) | ccid_11 |

## Not in the capture
- The Options menu items (their labels) of `#showDefectOptions` on this page: the header was captured as a diff; known only from the browser-pass notes and the sister page.
- The Edit and Delete dialogs opened from a row: no row has the controls (all locked), so the edit and delete flows were never opened and no request was seen.
- The result of "Activate on this site" or of Activate/Deactivate selected (not clicked).
- Page 2 to 5 of the default 20-row view: all rows are in the page, so nothing is missing.

Also present in the page, opened from elsewhere: editCompanyData, passwordChange, themeChange, admin, chooseProjectSite, addDefaultProjectSite, pdfCalculationStatuses, optsGlobalDeactivateWps, optsWpsCopy, deleteCronReport, editCronReport, editIsometricPhaseMass, signServiceRequest, editServiceRequest, addPqr, addFlange, editFlange, deleteFlange, importFlanges, docsFlange, filterFlanges, pdfFlangeReport, calculator, todo, calendarModal, transferFromLagerToProject, bulkTransferFromLagerToProject, moveLagerToLager, returnFromLager, correctLagerEntry, editLagerItem, adjustLagerQuantity, removeLagerItem, showStorehouseAuditTrail, viewLagerCerts, createTransferOrder, wpWeldScanModal, wpFlangeScanModal.
