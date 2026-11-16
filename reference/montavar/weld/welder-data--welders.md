# Weld Pilot → Welder data → Welders

Source: `weld__welder__welders.txt`, `weld__welder__welders-inactive.txt`, `weld__welder__welders-deleted.txt`, `weld__welder__weldercard-settings.txt`, and the dialog captures `weld__welder__welders__show.txt`, `__card.txt`, `__edit.txt`, `__docs.txt`, `__edit-qualification.txt`, `__filter.txt`, `__expire-warnings.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/weldpilot/index.php?page=personnel&type=1&view=welders` (the breadcrumb and the other captures use `…&projectSite=1`; inactive list: `…&projectSite=1&inactive=ok`; deleted list: `…&projectSite=1&show=deleted`; weldercard settings: `/weldpilot/index.php?page=weldercard&type=wire`).
State of the page for the observing account: normal.

Browser-tab title of the list pages: "Personnel - WeldPilot®". Of the weldercard settings page: "- WeldPilot®" (no text before the dash).

## Page

- Panel heading: **Welder**.
- Breadcrumb (top bar): `Personnel` (link `#`) → `Welder` (link `index.php?page=personnel&type=1&view=welders&projectSite=1`; on the other two views the link carries `&inactive=ok` / `&show=deleted`) → current crumb **Active** (on the inactive view **Inactive**, on the deleted view **Deleted**).
- Tabs: none. Instead, three status buttons above the list (links):
  | Button | Link | Look when selected |
  |---|---|---|
  | `Active 90` | `index.php?page=personnel&type=1&view=welders&projectSite=1` | btn-primary, `is-selected` |
  | `Inactive 0` | `…&projectSite=1&inactive=ok` | btn-warning, `is-selected` |
  | `Deleted 0` | `…&projectSite=1&show=deleted` | btn-danger, `is-selected` |
  Unselected buttons are btn-default. The numbers are the counts of the three groups for the chosen project site (90 / 0 / 0 in the sandbox).
- Filter bar next to the buttons: text "Home location: Zandbak" and a link button `Reset filters` → `index.php?page=personnel&type=1&view=welders&projectSite=1`.
- Top bar, right side, in order:
  1. Project-site select (form GET to `/weldpilot`, hidden `page=personnel`, `type=1`, `view=welders`; on the inactive view also hidden `inactive=ok`, on the deleted view hidden `show=deleted`). Select name `projectSite`, submits on change (`this.form.submit()`). Options (4): `all` → "All"; `1` → "Zandbak" (selected); `2` → "10420-2530 Ineos Project ONE"; `10` → "IPO - Carry Over". In the capture each option text is prefixed "[Change project site]".
  2. Cog button, `title="Weldercard settings"` → link `index.php?page=weldercard&type=wire` (see "Linked page" below).
  3. Sliders button, `title="Filter"` → opens dialog `#filterWelders`.
  4. `Add Welder` (plus icon) → opens dialog `#addPersonnel` (`data-toggle="modal"`, classes `buttonInsert open-addPersonnel`).
- No CSV / Excel / PDF / print buttons on this page (the table's DOM string in the shared script is `lfrtip`: length, filter, processing, table, info, pagination — no button group).

## List

Table `#datatableWarehouse`, server-side (ajax url `/core/ajax/personnel-welders.php`).

| # | Column title | Sortable | Notes |
|---|---|---|---|
| 0 | ID nr. | yes | |
| 1 | Name | yes | cell is a link (class `open-showPersonnel`, `href="#showPersonnel"`, `data-id` = row id) that opens the Personnel data dialog |
| 2 | Company | yes | "-" when none |
| 3 | Role | yes | |
| 4 | Customs | no | "-" when empty. From the browser-pass notes: it lists the welder's qualification names joined with commas (for example "141\|FM1-FM2\|ISO9606-1/NEN3650, GTAW\|ASME"), not a custom code |
| 5 | Active on projects | no | project names joined with ", " |
| 6 | Currently on | yes | |
| 7 | Note | yes | |
| 8 | Active | yes | "Yes"; from the browser-pass notes shown as a green badge |
| 9 | Options | no | class `wsapps-col-options` |

- All columns are visible. Columns 0 and 2–8 carry the class `wsapps-m-col-hide`; Name and Options do not.
- On the deleted view column 8 is titled **Lifecycle** instead of "Active" (everything else equal).
- Default sort: column 8, ascending (`order:[[8,"asc"]]`).
- Page length: select named `datatableWarehouse_length`, options 10 / 25 / 50 / 100, default 25; label "Show … entries". Pagination: simple Previous / Next, no page numbers (from the browser-pass notes; the shared script says `pagingType: 'simple'`).
- Search: one global search box (type=search, placeholder "Search") with a clear (×) button; no per-column search inputs. Shared script: `searchDelay: 350`.
- Filters: the `#filterWelders` dialog (see Dialogs); its values are sent to the table request as `wire`, `process`, `diameter`, `thickness`, `pos`, `bw`, `asme` (0 = no filter).
- Row options, in order (each cell holds these controls):
  | Icon / title | Opens or does |
  |---|---|
  | user icon, `title="Show"` (class `hidden-xs open-showPersonnel`) | dialog `#showPersonnel` "Personnel data" |
  | pencil, `title="Edit"` (`open-editPersonnel`) | dialog `#editPersonnel` "Edit personnel info" |
  | file icon, `title="Certificates and files"` (`open-docPersonnel`) | dialog `#docPersonnel` "Personel's certificates and files" |
  | credit-card icon, `title="Welder card"` (`open-cardPersonnel`) | dialog `#cardPersonnel` "Welder card" |
  | hidden inputs `personnelID` (row id) and `targetActive` (value 0 on the active list) + pause button `title="Deactivate"`, `name="setPersonnelActive"`, type submit | form submit that sets the welder inactive. From the browser-pass notes the form has `onsubmit="return confirm('Set this welder inactive?')"` |
  | red trash, `title="Delete"` (`open-deletePersonnel`, `buttonDelete`) | dialog `#deletePersonnel` "Delete Personnel" |
- Bulk actions (Options menu): none on this page.
- Info text: "Showing _START_ to _END_ of _TOTAL_ entries" (capture: "Showing 1 to 25 of 90 entries"). Empty text: "No data available in table". No-match text: "No matching records found". Processing text: "Processing…".
- Inactive and deleted views: same table and columns; both show one row "No data available in table" and "Showing 0 to 0 of 0 entries" (total 0).
- Table request (`personnel-welders.php`): standard DataTables parameters (`draw`, `columns[i][data|name|searchable|orderable|search…]`, order, start, length, search) plus fixed parameters set by the page: `type=1`, `app="weldpilot"`, `projectSite="1"`, `status` ("active" / "inactive" / "deleted"), `wire`, `process`, `diameter`, `thickness`, `pos`, `bw`, `asme` (all 0 unless a filter is set). The capture's XHR list shows several draws (1, 2, 3 …) on the first load.

## Dialogs

Dialogs opened by a control of this page: `#addPersonnel`, `#filterWelders`, `#showPersonnel`, `#editPersonnel`, `#docPersonnel` (with `#editPersonnelDocument` opened from inside it), `#cardPersonnel`, `#deletePersonnel`. The `#cardPersonnelEdit`, `#personnelDocuments`, `#pdfWelderReportLanguageList` and `#addWelder` shells exist in the page, but no control of the list opens them in the capture (see "Not in the capture").

### Add Welder (`#addPersonnel`) — opened by the top-bar button "Add Welder"
Form: method post, `enctype="multipart/form-data"`. Labels all carry `for="input00"`.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | ID nr. | uid | text | yes | empty | a handler named `#uid` calls `liveCheckUID.php` and writes the answer into the empty box `#liveCheckUIDNo` above the buttons (see Rules) |
| 2 | Name | name | text | no | empty | |
| 3 | Welder ID Nr. | welderid | text | no | empty | |
| 4 | Address | address | text | no | empty | |
| 5 | Zip code | zip | text | no | empty | |
| 6 | Residence | residence | text | no | empty | |
| 7 | Phone | phone | text | no | empty | |
| 8 | Email address | email | email | no | empty | |
| 9 | Active | active | select (select2) | no | Active | 2 options: `0` → Inactive; `1` → Active (default) |
| 10 | Company | company | select (select2) | no | "---- Without company ----" | 3 options: `0` → "---- Without company ----" (default); `7` → MONTAVAR METALNA LOLA; `8` → Websonik Applicaties BV |
| 11 | Welder 1 | welder1 | select (select2) | no | "--------" | 248 options, row hidden until "Combination" is ticked. First 10: `0` → "--------"; `1` → W01/W02; `2` → W01; `3` → W02; `4` → W03; `5` → W03/W04; `6` → W04; `7` → ML548 + name; `8` → ML395 + name; `9` → ML061 + name. Later options follow the pattern "stamp + name" (person names not copied here) |
| 12 | Welder 2 | welder2 | select (select2) | no | "--------" | same 248 options as Welder 1; row hidden until "Combination" is ticked |
| 13 | Date of birth | dob | text, class `dpicker` | no | empty | datepicker, format dd.mm.yyyy |
| 14 | Currently on | currentlyon | text | no | empty | |
| 15 | Photo | file | file (id `file1x`, class `gui-file`) | no | none | a second, unnamed text box `#uploader1x` ("Nothing selected") shows the chosen file name; button text "Choose file" |
| 16 | Active on projects | projectSite[] | select (select2), MULTIPLE | no | nothing selected | 4 options: `0` → "--------"; `1` → Zandbak; `2` → 10420-2530 Ineos Project ONE; `10` → IPO - Carry Over |
| 17 | Globally deployable | flyingwelder | checkbox (id `checkboxExamplesFL`, value `ok`) | no | unchecked | |
| 18 | Combination | combination | checkbox (id `checkboxExamplesFLS`, class `enableCombination`, value `ok`) | no | unchecked | ticking it shows the Welder 1 / Welder 2 rows |

Buttons: `Add` (submit, name `addPersonnel`, class `btn-hideInsert`), `Cancel` (closes the dialog). The box `#liveCheckUIDNo` (class `default-hidden`) sits above the buttons.

### Edit personnel info (`#editPersonnel`) — opened by the pencil in the row options
Body loaded from `GET /core/ajax/editPersonnel.php?id=<row id>&action=showroom` (shown below for the example welder W01, row id 2). Form: post, multipart.

| # | Label | name | Type | Required | Default (W01) | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | ID nr. | uid | text | yes | W01 | |
| 2 | Name | name | text | no | empty | |
| 3 | Welder ID Nr. | welderid | text | no | W01 | |
| 4 | Address | address | text | no | empty | |
| 5 | Zip code | zip | text | no | empty | |
| 6 | Residence | residence | text | no | empty | |
| 7 | Phone | phone | text | no | empty | |
| 8 | Email address | email | email | no | empty | |
| 9 | Active | active | select | no | Active | 2 options: `0` → Inactive; `1` → Active (selected) |
| 10 | Company | company | select | no | Websonik Applicaties BV | 3 options: `0` → "---- Without company ----"; `7` → MONTAVAR METALNA LOLA; `8` → Websonik Applicaties BV (selected) |
| 11 | Date of birth | dob | text, class `dpicker` | no | 00.00.0000 | datepicker dd.mm.yyyy |
| 12 | Currently on | currentlyon | text | no | empty | |
| 13 | Photo | file | file (id `file1x2`) | no | none | unnamed text box `#uploader1x2` "Nothing selected"; upload icon |
| 14 | Active on projects | projectSite[] | select (select2), MULTIPLE | no | Zandbak selected | 4 options as in the Add dialog (`1` → Zandbak selected) |
| 15 | Globally deployable | flyingwelder | checkbox (id `checkboxExamplesFL2`, value `ok`) | no | unchecked | |
| 16 | (hidden) | editID | hidden | — | 2 | the welder's row id; the field appears three times in the markup (same value) |

There is no "Combination" checkbox and no Welder 1 / Welder 2 select in the edit dialog (the loaded script still hides `.memberLine`, but the markup has none). Buttons: `Update` (submit, name `editPersonnel`, btn-warning), `Close`.

### Personnel data (`#showPersonnel`) — opened by the user icon or the Name link
Read-only. Body from `GET /core/ajax/showPersonnel.php?id=<row id>&action=showroom`. Form post with one hidden input `editID` (value = row id, here 2).
- Left: photo image (placeholder `../core/assets/docs/no.png` when none) and a link button with a print icon labelled `Summary list` that links to the welder's stored Summary list PDF (`../core/assets/docs/down.php?file=…`, new tab).
- Label/value rows in order: ID nr., Welder ID Nr., Name, Address, Zip code, Residence, Phone, Fax, Email address, Company, Home location, Active (green "Yes" badge), Globally deployable (red "No" badge).
- Table "# | Document | WQ No | WPS | Note | Expire | Notify days" with one row per stored qualification/document: Document is a download link (download icon) to the stored file; WPS shows "Not selected" when none; Expire shows the date dd.mm.yyyy followed by a red warning icon when the date is past; Notify days shows "<n> days".
- Footer: `Close`.
- No `open-pdfWelderReportLanguageList` control exists in this dialog (per browser-pass notes).

### Welder card (`#cardPersonnel`) — opened by the credit-card icon
Body from `GET /core/ajax/editPersonnelCard.php?id=<row id>&action=showroom`. Form post, multipart. A sticky strip at the top reads "Welder ID Nr.: <id>   Name: <name>".

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Welding wire | wire | select (select2) | no | FM1 (first option) | 6: `1` FM1; `2` FM2; `3` FM3; `4` FM4; `5` FM5; `6` FM6 |
| 2 | Weld process | process | select (select2) | no | 135 | 5: `1` 135; `2` 136; `4` 141; `5` 111; `7` 141/111 |
| 3 | Diameter | diameter | select (select2) | no | >21,1 | 10: `3` >21,1; `4` >44,45; `5` >30,16; `6` >16.7; `7` ≥ 84,15; `8` ≥ 500; `9` ≥ 109,55; `10` ≥ 16,00; `11` ≥ 13,50; `12` 21,30-42,60 |
| 4 | Thickness | thickness | select (select2) | no | 3,00-22,00 | 6: `1` 3,00-22,00; `3` 7,13-28,5; `4` ≥ 3; `5` ≥ 1,50; `6` 2,00-20,40; `7` 3,00-5,55 |
| 5 | BW/FW | bw | select (select2) | no | BW | 4: `1` BW; `2` FW; `3` TTS; `4` BW, FW |
| 6 | Pos | pos | select (select2) | no | PH | 12: `1` PH; `2` H-L045; `3` BW:PA,PC,PF FW:PA,PB,PC,PF; `4` BW: PA,PC,PE,PF,H-L045 FW:PA,PB,PC,PD,PE,PF; `5` ALL EXCEPT PG(F); `6` BW:PA,PC,PE,PF FW:PA,PB,PC,PD,PE,PF; `7` PA,PC,PE,PF; `8` PA,PF FW:PB; `9` BW:PA ; FW:PA,PB; `10` PA,PC,PE,PF FW:PB; `11` PA,PB,PC,PD,PE,PF,PH; `12` BW:PA,PF FW:PA,PB,PF |
| 7 | ASME/EN | asme | select (select2) | no | EN | 2: `1` EN; `2` ASME |
| 8 | WQ No | lk[] | select (select2), MULTIPLE | no | nothing selected | 8 options, value = text: ROT 2023.95695 … ROT 2023.95702 (the WQ numbers stored for this welder) |
| 9 | (hidden) | editID | hidden | — | 2 | row id (appears twice) |

Buttons: `Add` (submit, name `personnelCardAdd`, btn-dark), `Print` (link `../core/pdf/welder-card.php?id=<row id>`, new tab), footer `Close`.
Below the form: table with header `# | Welding wire | Weld process | Diameter | Thickness | BW/FW | POS | ASME/EN | WQ No | -`. The sample welder has no card lines (empty table); the row controls of a card line are therefore not in the capture.

### Certificates and files (`#docPersonnel`, title "Personel's certificates and files") — opened by the file icon
Body from `GET /core/ajax/editPersonnelDoc.php?id=<row id>&action=showroom`. Strip "Welder ID Nr.: <id>   Name: <name>". No tabs. Two forms:

Form 1 (post, multipart) — add a qualification or document:

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | select (select2) | no | Summary list | 57 options, value = text. First 10: Summary list; Custom - CS\|GTAW\|Ø=All T=<11\|; Custom - SS\|GTAW\|Ø=All T=<5\|; Custom - CrMo\|GTAW\|Ø=All T=<7.4\|; Custom - 141\|FM1-FM2\|ISO9606-1; Custom - 141\|FM1-FM2\|ISO9606-1/NEN3650; Custom - GTAW\|FM1-FM2\|ASME; Custom - 111-B\|FM1-FM2\|ISO9606-1/NEN3650; Custom - SMAW-B\|FM1-FM2\|ASME; Custom - 111-C\|FM1-FM2\|ISO9606-1/NEN3650. The rest: further "Custom - …" names (the entries of Welder data → Customs) and the last four "Certificate - Ademlucht", "Certificate - Veilig verplaatsen van lasten", "Certificate - Sleutelcertificaat", "Certificate - Lasserskwalificatie" |
| 2 | WQ No | lk | text | no | empty | |
| 3 | WPS | wps[] | select (select2), MULTIPLE | no | nothing selected | 269 options; first 10: `0` → "--------"; `49` → 11.015 rv.2; `48` → 11.015FW rv.1; `47` → 11.016 rv.1; `46` → 11.017 rv.1; `45` → 11.018 rv.1; `43` → 11.030 rv.1; `44` → 11.030BR; `42` → 11.030FW; `1` → 11111 (the WPS numbers of the site) |
| 4 | File | file | file (id `file1x2`) | no | none | unnamed text box `#uploader1vvx2` "Nothing selected" |
| 5 | Note | note | text | no | empty | |
| 6 | Expire date | expire | text, class `dpicker`, READONLY | no | empty | datepicker dd.mm.yyyy |
| 7 | Notify (days) | notifydays | number | no | empty | |
| 8 | (hidden) | editID | hidden | — | 2 | |

Button: `Add` (submit, name `personnelDocuments`).

Form 2 (post) — welder note:

| # | Label | name | Type | Required | Default |
|---|---|---|---|---|---|
| 1 | (hidden) | editID | hidden | — | 2 |
| 2 | Note | note | text (full width) | no | empty (W01) |

Button: `Save` (submit, name `setWelderNote`).

Table: `# | Document 1 | WQ No | WPS | Note | Expire | Notify days | -`. Each row: Document = download link; WPS shows "Nothing selected" when empty; Expire date with a red warning icon when past; "<n> days"; last cell holds a form with hidden `editID` (welder row id) and `deleteID` (document id) and three controls, in order: trash button (class btn-warning; submit, name `deletePersonnelDocument`, no confirm in the markup), bell button (submit, name `personnelDocumentBell`, tooltip "Show in Expire warnings when this certificate is due"), pencil link (class `open-editPersonnelDocument`, `href="#editPersonnelDocument"`, `data-dismiss="modal"`, `data-id` = document id). Footer: `Close`.

### Edit qualification (`#editPersonnelDocument`, title "Edit personnel info") — opened by the pencil of a document row (this closes the Certificates dialog first)
Body from `GET /core/ajax/editPersonnelDocument.php?id=<document id>&action=showroom`. Strip "Welder ID Nr.: <id>   Name: <name>". Form post, multipart. Values shown are those of document id 6 of welder W01.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | Name | name | select (select2) | no | "Custom - 141\|FM1-FM2\|ISO9606-1/NEN3650" (current value selected) | same 57 options as the add form |
| 2 | WQ No | lk | text | no | ROT 2023.95698 | |
| 3 | WPS | wps[] | select (select2), MULTIPLE | no | nothing selected | same 269 options as the add form |
| 4 | File | file | file (id `file1x6`) | no | none | unnamed text box `#uploader1vvx6` |
| 5 | Note | note | markup says `type="note"` (not a standard input type; behaves as a text box) | no | empty | |
| 6 | Expire date | expire | text, class `dpicker`, READONLY | no | 04.04.2024 | datepicker dd.mm.yyyy |
| 7 | Notify (days) | notifydays | number | no | 30 | |
| 8 | (hidden) | editID | hidden | — | 6 | document id (appears twice) |
| 9 | (hidden) | modalID | hidden | — | 2 | welder row id |

Buttons: `Update` (submit, name `personnelDocumentsEdit`, btn-warning), footer `Close`. Rule shown by the hidden `modalID`: it carries the welder id; from the browser-pass notes it is there to reopen the welder's dialog after saving.

### Filter (`#filterWelders`) — opened by the sliders button
Form method get.

| # | Label | name | Type | Required | Default | Options / depends on |
|---|---|---|---|---|---|---|
| 1 | (hidden) | page | hidden | — | personnel | |
| 2 | (hidden) | type | hidden | — | 1 | |
| 3 | (hidden) | view | hidden | — | welders | |
| 4 | (hidden) | projectSite | hidden | — | empty in the list capture, 1 in the dialog capture | |
| 5 | Welding wire | wire | select (select2) | no | "-------------" | 7: `0` "-------------"; `1` FM1; `2` FM2; `3` FM3; `4` FM4; `5` FM5; `6` FM6 |
| 6 | Weld process | process | select (select2) | no | "-------------" | 6: `0`; `1` 135; `2` 136; `4` 141; `5` 111; `7` 141/111 |
| 7 | Diameter | diameter | select (select2) | no | "-------------" | 11: `0`; `3` >21,1; `4` >44,45; `5` >30,16; `6` >16.7; `7` ≥ 84,15; `8` ≥ 500; `9` ≥ 109,55; `10` ≥ 16,00; `11` ≥ 13,50; `12` 21,30-42,60 |
| 8 | Thickness | thickness | select (select2) | no | "-------------" | 7: `0`; `1` 3,00-22,00; `3` 7,13-28,5; `4` ≥ 3; `5` ≥ 1,50; `6` 2,00-20,40; `7` 3,00-5,55 |
| 9 | Pos | pos | select (select2) | no | "-------------" | 13: `0` plus the same 12 position strings as in the Welder card |
| 10 | BW/FW | bw | select (select2) | no | "-------------" | 5: `0`; `1` BW; `2` FW; `3` TTS; `4` BW, FW |
| 11 | ASME/EN | asme | select (select2) | no | "-------------" | 3: `0`; `1` EN; `2` ASME |

Buttons: `Filter` (submit, name `filterIsoExecution`, btn-primary), `Reset` (link `index.php?page=personnel&type=1&view=welders&projectSite=` — in the dialog capture with `projectSite=1`), `Cancel`.

### Delete Personnel (`#deletePersonnel`) — opened by the red trash in the row options
Form post. Text "Are you sure?". Hidden input `deleteID` (id `bookIdDeletePersonnel`, empty until opened; filled with the row's `data-id` by the click handler). Buttons: `Delete` (submit, name `deletePersonnel`, btn-danger, trash icon, class `btn-hideDelete`), `Cancel`.

### Expire warnings drop-down (not a dialog; top bar)
Opened by the warning-triangle icon with a count badge in the green top bar (plain Bootstrap dropdown, no request). Header "Expire warnings" with count (37 in the sandbox). List `#expireWarnList`: one card per expired or soon-to-expire document with a red × icon, the welder ID, the document name, "· dd.mm.yyyy" and the word "Expired" (class `expire-warn-item--expired`); sorted by date ascending (first 04.04.2024). Every card links to `/weldpilot/index.php?page=personnel&type=1&view=welders`. All 37 cards say "Expired" (counts per welder ID: W01 8, W02 5, W02/W03 4, W04 12, #4 8, from the browser-pass notes).

## Linked page: Weldercard settings (`index.php?page=weldercard&type=wire`)
Opened by the cog button. It maintains the catalogs behind the Welder card selects.
- Panel heading and breadcrumb entry: "Welding wire". Top bar has a dropdown button "Welding wire" (btn-warning) listing seven tab links: Welding wire (`type=wire`), Weld process (`type=process`), Diameter (`type=dia`), Pos (`type=pos`), BW/FW (`type=bw`), Thickness (`type=dikte`), ASME/EN (`type=asme`). Button `Add` (plus icon) → `#addWelderCard`.
- Table: columns `Name`, `Description`, and an unnamed options column (title `&nbsp;`); client-side (not server-side), page length 20 (options 5 / 20 / 50 / 100 / 500), default order column 1 ascending, global Search with clear button, info "Showing 1 to 6 of 6 entries", no export buttons. (The capture also holds a second, header-only table with the same two columns and a read error — ignore it as an artefact.)
- Row options: pencil (class `open-editWelderCard`, `href="#editWelderCard"`, `data-id`, `data-table="system_weldcard_wire"`) and trash (`open-deleteWelderCard`, `href="#deleteWelderCard"`, `data-id`).
- Sample rows (Name \| Description), in capture order: FM1 \| CS; FM3 \| CS (dekt ok FM2,FM1; FM2 \| CS (dekt ook FM1); FM4 \| CS (dekt ook FM3,FM2,FM1; FM6 \| Nikkel (dekt ook FM5); FM5 \| RVS. (Texts copied as shown, including the cut-off ones.)
- Dialog `#addWelderCard` ("Add"), form post:
  | # | Label | name | Type | Required | Default |
  |---|---|---|---|---|---|
  | 1 | Name | name | text | yes | empty |
  | 2 | Description | description | text | no | empty |
  | 3 | (hidden) | table | hidden | — | system_weldcard_wire |
  Buttons: `Add` (submit, name `addWelderCard`), `Cancel`.
- Dialog `#editWelderCard` ("Edit"): body loaded by `GET /core/ajax/editWelderCard.php?id=<id>&table=<table>` into `#contentEditWelderCard`; footer `Update` (submit, name `editWelderCard`, btn-warning), `Cancel`. Body fields not in the capture.
- Dialog `#deleteWelderCard` ("Delete"): "Are you sure?"; hidden `deleteID` (id `bookIdDeleteWelderCard`, empty) and hidden `table` (id `bookIdDeleteWelderCardTable`, value system_weldcard_wire); buttons `Delete` (submit, name `deleteWelderCard`), `Cancel`.

## Rules found in the page's JavaScript
- Combination (inline script of the list page): on load `.memberLine` rows (Welder 1, Welder 2) are hidden; clicking the checkbox `.enableCombination` shows them when ticked and hides them when unticked. The edit dialog's loaded script only shows them (never hides again) but the edit markup has no such rows.
- Datepickers: `.dpicker` fields use format `dd.mm.yyyy`; `.select2-single` fields become select2 widgets (dialog scripts).
- Live ID check (shared script): on `input`, `propertychange` or `paste` in the element `#uid`, the page requests `GET /core/ajax/liveCheckUID.php?id=<typed value>` and puts the answer into `#liveCheckUIDNo`. The Add Welder dialog's ID nr. input has no id in the capture, so that binding is not shown on it; the capture does not show the answer text.
- Row click handlers (page script + shared script), all GET with `action=showroom` where noted:
  - `.open-showPersonnel` → `/core/ajax/showPersonnel.php?id=<data-id>` → `#contentShowPersonnel`.
  - `.open-editPersonnel` → `/core/ajax/editPersonnel.php?id=<data-id>` → `#contentEditPersonnel`.
  - `.open-docPersonnel` → `/core/ajax/editPersonnelDoc.php?id=<data-id>` + `action=showroom` → `#contentDocPersonnel`.
  - `.open-editPersonnelDocument` → `/core/ajax/editPersonnelDocument.php?id=<data-id>` → `#contentEditPersonnelDocument`.
  - `.open-cardPersonnel` → `/core/ajax/editPersonnelCard.php?id=<data-id>` + `action=showroom` → `#contentCardPersonnel`.
  - `.open-cardPersonnelEdit` → `/core/ajax/editPersonnelCardEdit.php?id=<data-id>&welder=<data-foo>` → `#contentCardPersonnelEdit` (no control of this page uses it).
  - `.open-personnelDocuments` → `/core/ajax/personnelDocuments.php?id=<data-id>` → `#contentPersonnelDocuments` (no control of this page uses it).
  - `.open-pdfWelderReportLanguageList` → `/core/ajax/pdfWelderReportLanguageList.php?id=<data-id>` → `#contentWelderReportLanguageList` (no control of this page uses it).
  - `.open-deletePersonnel` → copies `data-id` into `#bookIdDeletePersonnel` (no request).
  - On weldercard settings: `.open-editWelderCard` → `/core/ajax/editWelderCard.php?id=…&table=…`; `.open-deleteWelderCard` copies `data-id` into `#bookIdDeleteWelderCard`.
- Script tags are stripped from every `/core/ajax/` response that was requested with `action=showroom` (shared prefilter); the dialog fields are initialised afterwards by `__wsappsInitAjaxModalFields`.
- Table: flag `__wsappsIsPersonnelWelders = true` makes the shared script build `#datatableWarehouse` with `processing`, `serverSide`, `deferRender`, no state saving, `searchDelay` 350, `pageLength` 25, simple paging, dom `lfrtip`, non-sortable columns 4, 5 and the last, Options column width 225px, columns 0 and 2–8 class `wsapps-m-col-hide`, column 7 width 18%. (In the shared copy the default order is column 1 asc; the list capture's table configuration says column 8 asc, which is the one shown on the page.) The ajax data function sends the fixed parameters listed under List (`d.type = 1`, `d.app`, `d.projectSite`, `d.status`, the seven filter values).
- Deactivate: the row form is guarded by a browser confirm "Set this welder inactive?" (from the browser-pass notes; not in the DOM capture).
- Other requests made by the page: `/core/ajax/ajax-notifications.php?action=count_unread` (periodic, GET, returns `{"count":0}`), `/core/ajax/searchProject.php` (project search dialog), `/core/ajax/saveAddCalculationModalState.php`, `/core/ajax/getListOfMaterials.php`, `/core/ajax/searchUnitRates.php`, `/core/ajax/searchTarrifs.php`, `/core/ajax/searchFactors.php` — shared code of other dialogs, not specific to this page.
- Validations with messages: none found in the capture (the only constraint is the `required` attribute on `uid`, and on `name` in the weldercard Add dialog).

## Sample data
Active list, project site Zandbak: 90 welders ("Active 90"), 0 inactive ("Inactive 0"), 0 deleted ("Deleted 0"); "Showing 1 to 25 of 90 entries". Of the first 25 rows, 23 have company MONTAVAR METALNA LOLA and 2 have "-"; all 25 have Role "WE", Customs "-", Currently on "-", Note "-", Active "Yes"; 18 are active on "10420-2530 Ineos Project ONE, IPO - Carry Over" and 7 on no project ("-"). Names are people's names and are not copied; the Name column is filled for all 25 (person A … person Y in the order below). From the browser-pass notes: the last page (rows 76–90) holds welders W01, W02, W02/W03, W04 and #4 with company "Websonik Applicaties BV" and an empty Name; W01 has 8 qualification documents, the card of W01 has no lines.

| ID nr. | Name | Company | Role | Customs | Active on projects | Currently on | Note | Active |
|---|---|---|---|---|---|---|---|---|
| MB023 | person A | - | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MB022 | person B | - | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MB024 | person C | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV998 | person D | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV994 | person E | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV996 | person F | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV991 | person G | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| ML062 | person H | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV993 | person I | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV997 | person J | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MB020 | person K | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MB019 | person L | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV985 | person M | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MB018 | person N | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |
| MV987 | person O | MONTAVAR METALNA LOLA | WE | - | 10420-2530 Ineos Project ONE, IPO - Carry Over | - | - | Yes |

Rows 16–25 in the same order: MB017 (projects as above), ML389, ML359, ML743, ML449, ML744, ML682, ML485 (these seven: no projects), MB015, MB014 (projects as above); all MONTAVAR METALNA LOLA / WE / Yes.

Personnel data sample (W01, row id 2): Welder ID Nr. W01; Company Websonik Applicaties BV; Home location Zandbak; Active Yes; Globally deployable No; 8 documents, all Notify days "30 days", WPS "Not selected", all Expire dates past (04.04.2024 … 24.04.2026):

| # | Document | WQ No | Expire |
|---|---|---|---|
| 1 | Custom - 141\|FM1-FM2\|ISO9606-1/NEN3650 | ROT 2023.95698 | 04.04.2024 |
| 2 | Custom - SMAW-B\|FM1-FM2\|ASME | ROT 2023.95701 | 20.06.2024 |
| 3 | Custom - 111-C\|FM1-FM2\|ISO9606-1/NEN3650 | ROT 2023.95699 | 14.11.2025 |
| 4 | Custom - SMAW-C\|FM1-FM2\|ASME | ROT 2023.95702 | 14.11.2025 |
| 5 | Summary list | ROT 2023.95697 | 07.01.2026 |
| 6 | Custom - GTAW\|FM1-FM2\|ASME | ROT 2023.95700 | 27.01.2026 |
| 7 | Custom - 141\|FM1-FM2\|ISO9606-1/NEN3650 | ROT 2023.95696 | 04.04.2026 |
| 8 | Custom - 141\|FM1-FM2\|ISO9606-1/NEN3650 | ROT 2023.95695 | 24.04.2026 |

## Not in the capture
- Rows beyond the first 25 of the active list (Next button / page-length select).
- Inactive and deleted lists hold no rows, so their row options (for example how a deactivated welder is re-activated, or restored from "Deleted") are not shown; the capture contains no Restore / Activate control.
- The Name link of rows with an empty name has no visible text (browser-pass notes).
- Dialog `#pdfWelderReportLanguageList` "Welder report" (buttons `Go`, `Cancel`; body loaded by `pdfWelderReportLanguageList.php`): no control of this page opens it.
- Dialogs `#cardPersonnelEdit` ("Welder card"), `#personnelDocuments` and `#addWelder` ("Add welder", only buttons Add / Cancel, empty body): present as shells, not opened by any control of the list.
- Welder card lines of a welder that has some (their row controls, the delete control); the sample welder has none.
- The answer text of the live ID check, and the server messages after Add / Update / Delete / Deactivate / Bell (no form was submitted).
- Body of the weldercard-settings "Edit" dialog (`#editWelderCard`) and the other six tabs of weldercard settings (Weld process, Diameter, Pos, BW/FW, Thickness, ASME/EN); only the Welding wire tab is captured.
- Weldercard-settings Add dialog on the other tabs (the hidden `table` value there is not shown).

Also present in the page, opened from elsewhere: `#editCompanyData`, `#passwordChange`, `#themeChange`, `#admin` (System settings), `#searchProject`, `#chooseProjectSite`, `#addDefaultProjectSite`, `#pdfCalculationStatuses`, `#optsActivate`, `#optsDeactivate`, `#optsGlobalDeactivateWps`, `#optsWpsCopy`, `#deleteCronReport`, `#editCronReport`, `#editIsometricPhaseMass`, `#signServiceRequest`, `#editServiceRequest`, `#addPqr`, `#addFlange`, `#editFlange`, `#deleteFlange`, `#importFlanges`, `#docsFlange`, `#filterFlanges`, `#pdfFlangeReport`, `#calculator`, `#todo`, `#calendarModal`, `#transferFromLagerToProject`, `#bulkTransferFromLagerToProject`, `#moveLagerToLager`, `#returnFromLager`, `#correctLagerEntry`, `#editLagerItem`, `#adjustLagerQuantity`, `#removeLagerItem`, `#showStorehouseAuditTrail`, `#viewLagerCerts`, `#createTransferOrder`, `#wpWeldScanModal`, `#wpFlangeScanModal`.
