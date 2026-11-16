# Reference capture tooling

How the files under `reference/montavar/` are produced. The reference site is only ever read: pages are opened by URL in the signed-in browser, a script reads the DOM and the page's JavaScript, and nothing is clicked, submitted, saved or generated.

## Files

- `dump.js` — the page-side reader. Paste its content once into the browser's JavaScript tool on a page of the site; it stores itself in the tab's `sessionStorage`. Then, on every page: `eval(sessionStorage.getItem('__claude_capture_tool')); await __capRun('<slug>')`, and `__capNext(4)` until it answers `remaining 0`. Each `__capNext` writes console lines `[CAP <slug> <i>/<n> @<run>] b64:<base64>.<length>`.
- `extract.py` — collects those console lines from the agent transcripts and writes `raw/<slug>.txt`: `python3 extract.py --out ../raw <session dir>` (the session folder holds the agent transcripts and the oversized tool results).
- `audit.py` — lists every browser action the agents took on the reference site, so a click or typed value cannot go unnoticed: `python3 audit.py <session dir>`.
- `pages.json` — the pages of the first sweep (every menu item of both pilots, opened by URL).
- `../raw/` — the raw captures. **Not in git** (client data, people's names, the vendor's JavaScript). The tidy per-menu-item files next to this folder are written from them.

Pages that change state when opened are not in the sweep: MTOPilot → Isometric execution (`page=iso-execution`) recalculates cached material status on load.

## Reading a raw capture

One file per page. Header lines: `URL`, `TITLE`, `XHR` (requests the page made while loading), then `--- DOM` and `--- SCRIPTS`.

DOM lines, in document order, indented by nesting:

| Line starts with | Meaning |
|---|---|
| `"text"` | a text node |
| `IN …` / `SEL …` / `TA …` | input / select / textarea. Attributes follow as written in the page: `#id`, `.classes`, `name=`, `type=`, `placeholder=`, `min=` `max=` `step=` `maxlength=`, `val=` (default value), `cur=` (current value when different), flags `REQUIRED` `READONLY` `DISABLED` `MULTIPLE` `CHECKED`. A select lists `cur="selected text"` and `opts(n): value|text ; …` (`*` = selected by default; at most 80 are listed, `…+N` gives the rest). |
| `BTN "text" …` / `A "text" …` | button / link, with `href=`, `onclick=`, `data-toggle=`, `data-target=` (the dialog it opens), `title=`, `ico=` (icon class when there is no text). |
| `TABLE …` then `DT {…}` | a table; `DT` is its DataTables configuration: columns (`t` title, `d` data key, `vis`, `sort`), `serverSide`, `ajax` URL and parameters, `pageLength`, `order`, `total` / `shown` row counts, and the empty / info texts. |
| `TR … \|\| cell \| cell …` | one table row; `TH:` marks a header cell; controls, links and icons inside a cell are in braces `{…}`. A table with a header shows at most 40 body rows, then `(+N more rows of M)`. |
| `DTROWS …` / `DTROW \|\| cell \| cell …` | rows that a client-side table holds in memory but does not draw on the current page (same cell notation as `TR`). |
| `MODAL DIV#id "title" … BEGIN` … `END id` | a dialog that is in the page (most dialogs are, without being opened). `SAME-AS <slug>` means the identical dialog was already written in that capture — read it there. |
| `CHROME HEADER/ASIDE … LINEDIFF` | top bar and side menu; only the lines that no earlier capture contained. The full menu is in the first capture of each pilot (`weld__start__dashboard`, `mto__start__dashboard`). |
| `HID` | the element itself is hidden (`display:none`, `hidden`, class `hide`). Everything inside a closed dialog is in the DOM but not marked. A select replaced by a "chosen"/select2 widget is also `HID`: that is the real field. |
| other `TAG #id .class "text"` | a container or text element worth an anchor (label, heading, tab pane, alert, help text). |

Scripts: `SCRIPT-SRC <path>` is an external file (the site's own ones are in `ext__*.txt`). `SCRIPT-INLINE … BEGIN` … `SCRIPT-END` is inline code. `LINEDIFF new=X of Y` means only lines that no earlier capture contained are written; `@@ N lines already captured on earlier pages` marks what was left out (the large shared script is complete in the first capture of the sweep). `SAME-AS` / `SAME-MODULO-NUMBERS-AS <slug>` point to the capture that has the script.

Captures made after a click (`<page slug>__<what was opened>.txt`): `--- OPEN n element(s)` then one `ROOT …` block per open dialog or menu, written in full; then `--- XHR-LOG`: every request the page made after the click (`XHR <method> <url> status=… len=… body=…`), followed by its response text up to `XHR-END`. A response is usually the HTML of the dialog body exactly as the server sent it, including scripts.

Transport: chunks are base64 with their length (`[CAP <slug> <i>/<n> @<run>] b64:….<len>`). The first two sweeps used a JSON string instead; the browser tool rewrites text that looks like an absolute URL, which cut a few of those chunks short — `extract.py` reports such a capture as `DAMAGED` and it is captured again.

Limits: values typed into password fields are never read. Content that the site loads only after a click (a dialog filled by a request, a tab loaded on demand) is not in a first-sweep capture; those are captured separately and named `…__<what was opened>`.
