# Blitzkrieg operations workspace

A local working rebuild of the accessible Montavar modules, with a clearer Blitzkrieg interface and fictional sample data. The original site is never called by this app.

The Blitzkrieg interface uses the supplied logo artwork, a navy / electric blue / cyan palette, and locally bundled Outfit typography as a visual match for the logo. Brand tokens and logo layouts live in `client/brand.css`; the original artwork is in `public/brand/`. Existing database paths, environment variables, and session keys retain their Stelux names for compatibility.

## Start

Requires Node.js 24 or newer.

```sh
npm install
npm run build
npm start
```

Open **http://127.0.0.1:3000** and sign in, or create your administrator account for a new workspace. There is no preset production password. Sample projects, materials, welds, warehouses, and tools are created once. Your edits persist across restarts.

For development, use `npm run dev` and open **http://127.0.0.1:5173**. The API runs on port 3001. Stop any temporary preview on that port first.

## Current implementation

- Shared project sites, projects, isometrics, spools, companies, warehouses, drawings, and revision history.
- Materials catalog and reference tables; catalog/custom isometric requirements; orders, partial receipts, heat-number stock, issues/pick lists, transfers, adjustments, spool services, and laydown moves.
- Material execution with aggregated checked requirements, linked order/pick quantities, pending deliveries, and supplier assignment at take-in. Custom materials can be received and picked without entering the reusable catalog.
- Separate material laydowns, checked requirement movements, named material service requests, completion dates, and location history. Location tracking covers whole requirement lines; inventory returns and revision reversals still require source comparison.
- Welding records and traceability fields; welders and qualifications; configurable diameter outlines; NDT/PRE/VI/PWHT requests and result history; repair records, manual releases, work packages, test systems, punch lists, and flange records.
- WPS records support multiple PQRs, project scope and enabled sites. PQR entry includes all 26 observed attributes with reusable values; welders support aliases, deployment sites, customs and certificate types.
- Tool/article catalog, clients, stock, consumables, rentals, partial/full returns, transfer history, and stock adjustments.
- Independent accounts and permission profiles, linked document uploads, activity history, bulk edits, CSV validation/import, filtered CSV/XLSX exports, and browser print/Save as PDF.
- Search, filters, sorting, pagination, selectable columns, archives, global search, and mobile navigation.
- Distinct module dashboards for spool locations, welding length/count ratios, and tool minimum stock; sixteen filtered report views with authenticated CSV downloads and print layouts, including weld cards.
- Paginated record history retains access to older events beyond the overview's recent-activity feed.
- Separate ISO, ITP and ITP 2 revision numbers; optional files saved atomically with revisions; retained drawing history on the isometric. Material quantity logs record ordinary edits and revision-based removals, including a zero remaining requirement.

See **PARITY.md** for the distinction between implemented behavior, observed source behavior, and remaining parity work. A passing local test is not proof that an unavailable PHP routine has identical behavior.

## Tests

```sh
npm test
npm run build
```

Tests use temporary SQLite databases. HTTP tests open temporary loopback listeners and need local networking permission in restricted execution environments. They never change the live Montavar app or the user's `.data` directory.

Current verification: 79 default automated tests pass and the production build succeeds. An additional optional test against a disposable PostgreSQL instance covers migration, account login, inventory changes, rollback, version conflicts, audit pagination, CSV previews and persistence across independent connections. Browser checks cover sample material ordering/receipt/picking, partial tool returns, WPS/PQR links, welder deployment, material laydown/service, revision-file upload, independent ISO/ITP revision numbers, and partial/full removal of a material requirement. These checks do not establish hidden PHP-rule parity.

Browser smoke checks and workflow observations are recorded in `test-results/` when available. These generated artifacts are excluded from version control.

UI usability review (21 October 2026): larger, higher-contrast text; clearer navigation and page search; visible removable filters; menus that stay outside table clipping; keyboard focus handling; and scroll cues for wide tables. The finished build passes TypeScript and Vite validation. Browser checks cover all 88 screens/report views at desktop and phone widths, plus targeted checks at 320, 768, and 1024 pixels. Interaction checks cover project create/edit/bulk/archive/restore, partial material receipts and issues, partial tool returns, inspections, CSV import, CSV/Excel export, attachments, print layout, and sign-in/out. All writes used an isolated sample database. Results, repeatable browser scripts, and screenshots are in `output/playwright/`, including `ui-review.json`.

## Data and backups

- Database: Supabase PostgreSQL when `DATABASE_URL` is set in the private `.env` file; otherwise `.data/stelux.sqlite`.
- Uploaded files: `.data/uploads/`.
- `STELUX_DATA_DIR` can point to another local directory for isolated tests.
- `PORT` overrides the listening port; the server binds only to `127.0.0.1`.

### Supabase PostgreSQL

Copy `.env.example` to `.env`. Set `DATABASE_URL` to the URL from **Supabase → Connect → Direct → Session pooler**, with the password removed from the URL. Set `STELUX_DATABASE_PASSWORD` to the database password separately, inside quotes. This avoids URL encoding problems with special characters. The server loads `.env` automatically. These variables are never included in the React bundle.

```sh
npm run db:check
npm run db:migrate
npm run build
npm start
```

Stop the app before migration. `db:migrate` first saves a consistent SQLite snapshot and copies uploads under `backups/before-supabase-*`. It then copies every resource, password hash, audit event, counter and attachment path to an **empty** PostgreSQL workspace in one transaction, checking row counts and foreign keys. It refuses to overwrite a populated workspace. Existing accounts keep their passwords; sign in again after migration. The original SQLite database remains available. Uploaded files still live on this computer in `.data/uploads/`.

The private `stelux` PostgreSQL schema is outside Supabase's public Data API. Database access stays in the Express server, with the existing session and permission checks. TLS certificate verification is enabled for remote hosts; if needed, set `STELUX_DATABASE_CA` to the CA certificate downloaded from Supabase. The synchronous domain API uses one dedicated worker connection, preserving transaction boundaries and serializing writes with a PostgreSQL advisory lock. This suits the current local app; high-concurrency hosting would need an asynchronous repository.

The bundled public CA in `server/certs/supabase-ca.crt` comes from [Supabase's certificate download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). SHA-256 fingerprint: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`. It expires on 26 April 2031; refresh it from Supabase if the service changes its certificate authority.

`GET /api/health` checks the active database and reports `database: "postgres"` or `"sqlite"`. If a configured PostgreSQL connection fails, startup fails rather than switching to an unrelated SQLite workspace.

The optional integration test requires a disposable local PostgreSQL database named `stelux_test`; it resets that database's `stelux` schema:

```sh
STELUX_TEST_DATABASE_URL=postgresql://postgres:password@127.0.0.1:55432/stelux_test node --import tsx --test tests/postgres.test.ts
```

### Backups

```sh
npm run backup
```

This saves the active database and copies attachments into a private timestamped directory under `backups/`. PostgreSQL backups contain `stelux-postgres.sql`, a consistent transaction snapshot with account hashes and history; restore it with a PostgreSQL client only into an empty, initialized `stelux` schema. Sessions are omitted, so sign in again. For SQLite, stop the app, preserve the current `.data` directory, and place the snapshot's `stelux.sqlite` and `uploads/` into a new `.data` directory before restarting.

## Structure

- `shared/`: resource schemas, form definitions, workflow definitions, and summary calculations.
- `server/store.ts`: SQLite repository, reference constraints, schema upgrades, optimistic versions, transactions, and audit history.
- `server/workflows.ts`: domain operations; stock and history changes commit or roll back together.
- `server/http.ts`: authenticated API, permissions, imports, exports, and files.
- `client/`: React interface, forms, tables, details, and dashboards.

Credentials use salted scrypt hashes. Sessions are independent from Montavar. Database files, uploads, backups, and environment files are excluded by `.gitignore`. Hosting deployment remains separate work.
