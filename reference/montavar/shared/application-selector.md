# Shared → Application selector (site root after sign-in)

Source: `shared__selector.txt` — captured 2026-11-16 on the sandbox project site, read-only. URL: `/`.
State of the page for the observing account: normal. (The `<title>` is "Websonik Apps".)

## Page
- Layout: `#main` > `#content_wrapper` > `#content`. No top bar, side menu, breadcrumb or tabs appear in the capture.
- Company logo image (`.company-logo`), alt text "Montavar Engineering doo", source `/core/assets/docs/1716810196-montavar_logo.png?v=1716810196` (a customer-uploaded logo, versioned by a timestamp query).
- Heading text (`.wsapps-launcher-title`): "Select your application workspace".
- Five launcher cards (`A.wsapps-launcher-card`), in this order. Each is a plain link with an icon (Font Awesome 4 class) and a label that carries the ® sign:

| # | Label | href | Icon class |
|---|---|---|---|
| 1 | MTOPilot® | `mtopilot` | `fa fa-cube` |
| 2 | ESTPilot® | `estpilot` | `fa fa-calculator` |
| 3 | WeldPilot® | `weldpilot` | `fa fa-fire` |
| 4 | TeamPilot® | `teampilot` | `fa fa-users` |
| 5 | ToolPilot® | `toolpilot` | `fa fa-wrench` |

  The hrefs are relative (no leading slash). The capture shows no per-card description text, badge or permission marker.
- Theme control: label "Theme" (`.wsapps-launcher-theme-label`) and two buttons (`.wsapps-launcher-theme-btn`), attribute `data-wsapps-ui-theme`:
  - "Light" — `data-wsapps-ui-theme="light"`, icon `fa fa-sun-o`, active by default (class `is-active`).
  - "Dark" — `data-wsapps-ui-theme="dark"`, icon `fa fa-moon-o`.
- Footer text: "2017 – 2026 © Websonik. All Rights Reserved." and a link "Privacy Policy" (`href="Privacy Policy.pdf"`).

## List
None. The page has no table, filter, search box, row options, export or print button, and makes no table request.

## Dialogs
None. No control on this page opens a dialog, and the DOM holds no input, select, textarea or form (0 fields).

## Rules found in the page's JavaScript
One inline script (`h=s8y2zxyk`, 1244 characters), a self-calling function that only runs if `document.body` exists and at least one `[data-wsapps-ui-theme]` element exists.
- `applyTheme(theme)`: dark is chosen only when the value is exactly `dark`. It toggles the class `wsapps-launcher-page--dark` on the body, sets the body attribute `data-wsapps-ui-theme` to the theme, sets the content of the `meta[name="theme-color"]` tag to `#0f172a` for dark and `#f1f5f9` for light, and for each button toggles class `is-active` and sets `aria-pressed` to "true" or "false" depending on whether it matches.
- `persistTheme(theme)` stores the choice in three places: a cookie `wsapps_ui_theme` (URL-encoded value, path `/`, max-age 31536000 seconds = one year, SameSite=Lax); `localStorage` key `wsapps_ui_theme` (errors ignored); and a background GET request `index.php?ui_theme=<theme>&ajax=1` with same-origin credentials (response ignored, failures ignored).
- Click handler on each theme button: reads its attribute (anything other than `dark` counts as `light`), calls `applyTheme`, then `persistTheme`.
- No other request, validation or computed value in this capture. The page made no request while loading (`XHR []`; waited 755 ms).

## Sample data
Five launcher cards (listed above); theme "Light" active on load; footer years "2017 – 2026". No rows or figures.

## Not in the capture
- What the server does on `index.php?ui_theme=…&ajax=1` (response not captured).
- How the page decides which cards to show for an account: the capture shows all five for the observing account and nothing about restrictions.
- The landing page of each card (`mtopilot`, `estpilot`, `weldpilot`, `teampilot`, `toolpilot`) is outside this capture; MTOPilot and WeldPilot dashboards are in their own notes. ESTPilot, TeamPilot and ToolPilot were not captured here.
- Dark appearance of the page (only the class and meta colour are known, not the stylesheet).
- From the browser-pass notes (`_interactive/I2b-admin-dashboard.md`, Part C): inside the pilots, a grid icon left of the logo in the top bar opens a strip of the same five tiles (MTOPilot orange, ESTPilot yellow, WeldPilot green, TeamPilot purple, ToolPilot blue), dims the page, and makes no request; it is closed by clicking the icon again. That is a separate control on other pages, not part of this capture.
- From the browser-pass notes (`_interactive/I3-mto.md`, Part E): opening `/mtopilot/` lands on `index.php?redirect=&logout=&page=&id=&project=&type=1`. Nothing in the notes says how a user gets from sign-in to this selector.

Also present in the page, opened from elsewhere: none (no dialogs in this capture).
