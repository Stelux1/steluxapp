# Blitzkrieg operations workspace

A local working rebuild of the accessible Montavar modules, with a clearer Blitzkrieg interface and fictional sample data. The original site is never called by this app.

The Blitzkrieg interface uses the supplied logo artwork, a navy / electric blue / cyan palette, and locally bundled Outfit typography as a visual match for the logo. Brand tokens and logo layouts live in `client/brand.css`; the original artwork is in `public/brand/`. Existing database paths, environment variables, and session keys retain their Stelux names for compatibility.

## Start

Requires Node.js 24 or newer.

```sh
npm install
npm run build:local
npm run start:local
```

Open **http://127.0.0.1:3000** and sign in, or create your administrator account for a new workspace. There is no preset production password. Sample projects, materials, welds, warehouses, and tools are created once. Your edits persist across restarts.

For development, use `npm run dev` and open **http://127.0.0.1:5173**. The API runs on port 3001. Stop any temporary preview on that port first.

## Welding evaluation workspace

The supplied Access schema has a separate local prototype with a joined 87-field **Data LISL** register, two-sided material/certificate links, and support for the supplied example welds. The relationship diagram is implementation reference material; it is not displayed in the application. Run `npm run build:prototype` followed by `npm run start:prototype`, then open **http://127.0.0.1:3003**. It uses its own SQLite database and never selects the configured PostgreSQL database. See [the prototype notes](reference/access-prototype.md) for import, schema mapping, and verification.

The server profile `welding-demo` delivers projects, sites, isometrics, basic spools, welders, WPS references, weld execution, NDT/visual inspection, results, repairs, documents, and two welding reports. Account permissions still apply inside that scope. The complete internal workspace remains the default `full` profile.

```sh
npm run build:demo
npm run start:demo
```

Open **http://127.0.0.1:3002** and create the evaluation workspace's own administrator account. The internal workspace keeps port 3000; `PORT` can override either server's port. Development uses `npm run dev:demo` on ports 5173/3001.

The local evaluation server uses its own SQLite database in `.data/welding-demo/`, including separate accounts, session cookies, and uploads. It does not connect to `DATABASE_URL`, copy production data, change existing accounts, or rewrite their permission profiles. `STELUX_DEMO_DATA_DIR` can select another evaluation directory; selecting the full workspace's data directory is rejected. Keep this directory outside the full workspace's uploads directory. The cloud entry described below instead requires a separately configured evaluation PostgreSQL database.

`npm run build:demo` writes `dist-welding-demo/`, without source maps. `npm run build` continues to write the complete internal build to `dist/`. Each server profile serves its corresponding build, so both versions can coexist. Neither build directory is committed. Restart the server after changing `STELUX_RELEASE_PROFILE`; there is no profile switch in the interface.

The release policy in `shared/release.ts` defines positive lists of resources, fields, actions, inspection types, reports, and navigation. The API filters bootstrap data, documents, history, and CSV/Excel/report exports, and rejects omitted endpoints and fields. The client uses the same delivered catalog for forms, columns, links, search, and reports. Basic edits preserve omitted field values and qualification links. The evaluation interface retains its sample-data label.

### Project navigation and isometric workspace

The hosted welding workspace and local Access prototype start with a main-project picker. Existing project sites are the main projects; their numbered project records appear as subprojects. The selected main project scopes the dashboard, subprojects, isometrics, welds, inspections, documents, search, and welding report exports. Shared materials, certificates, welders and WPS references remain available for linked entries.

Open a subproject to see its isometric table, then open an isometric as a full workspace. It contains ISO/ITP document links and uploads, technical details, WDI totals, the LISL register, spools and document history. Adding and editing records uses popup forms with the current subproject or isometric preselected. Subproject and isometric tables also support permission-controlled bulk edits. The LISL overview brings the weld type, welder, visual/NDT status, both material/certificate sides, WPS, diameter and spool together, with the other column groups and all 87 export fields still available. The NDT requirement filter also applies to the downloaded register.

## Cloud deployment

Use Node.js 24+ or the included Dockerfile. The cloud entry fixes the `welding-workspace` scope, including the connected 87-field LISL register and material certificates, binds to `0.0.0.0`, respects `PORT` (default 3000), and serves both the client and authenticated API from the same origin. The compiled server runs without `tsx` or development dependencies. A static `dist` upload alone cannot run this application.

Create a **separate empty PostgreSQL database** for evaluation. Supply these values through private runtime environment variables or an untracked local `.env`; never use a `VITE_` prefix:

| Variable | Value |
| --- | --- |
| `STELUX_DEMO_DATABASE_URL` | Evaluation PostgreSQL connection URL |
| `STELUX_DEMO_DATABASE_PASSWORD` | Evaluation database password, unless included in that URL |
| `STELUX_DEMO_DATABASE_CA` | Optional CA file path accessible inside the runtime |
| `STELUX_PUBLIC_URL` | Exact public HTTPS origin, for example `https://welding.example.com` |
| `PORT` | Hosting platform's port, if supplied |

Only loopback URLs may use HTTP for local verification. Public writes are restricted to the configured origin; HTTPS sessions use Secure, HttpOnly, SameSite cookies. A proxy must preserve the request Origin header. Database TLS verification remains enabled for remote hosts.

```sh
npm ci
npm run build:cloud
npm run db:prepare:cloud
npm run start:cloud
```

Run database preparation once before the first deployment, and again when applying a schema update. It is idempotent and preserves existing evaluation accounts and records. It rejects existing unmarked/internal databases before migrations run. The cloud server verifies preparation and the evaluation marker at startup; it never seeds or migrates during a cold start and never falls back to SQLite. `DATABASE_URL` and the internal database password are not used for cloud evaluation. Reusing the same database target is rejected when both connection URLs are present, and the database marker also protects against aliases to an existing internal workspace.

Cloud documents (up to 20 MB each) are stored in private PostgreSQL tables in the same transaction as their attachment records. Accounts, sessions, documents and business records survive container replacement; no persistent local disk is required. The local versions retain their current file storage. This deployment requires ordinary TCP access to PostgreSQL and Node worker-thread support for the existing synchronous database adapter; it runs no background jobs.

For Docker, build the image, run the initialization command against the evaluation database, then start it with the same runtime variables:

```sh
docker build -t blitzkrieg-welding .
# Put only the evaluation runtime variables above in this private file.
docker run --rm --env-file .env.cloud blitzkrieg-welding node dist-server/server/prepare-cloud.js
docker run -d --name blitzkrieg-welding --env-file .env.cloud -p 3000:3000 blitzkrieg-welding
```

`.env.cloud` is ignored by Git and excluded from the Docker build context. The final image contains production dependencies, `dist-welding-demo/` and `dist-server/`; it contains no source maps, internal documentation, local databases, `.env` files, tests or source checkout. Keep TLS certificates mounted read-only or use the committed public CA at `dist-server/server/certs/supabase-ca.crt` if appropriate for your provider. Check `/api/health`, sign in, exercise a weld and upload a document, then replace the container and verify both the record and document again.

`npm run backup:cloud` backs up the selected evaluation PostgreSQL database, including document content, credentials and the evaluation marker. Sessions are omitted. Restore the SQL only into an empty schema created by `Store` and `initializeDocumentStorage`; never restore over a live workspace.

### Shipvela / Next.js deployment

The hosted release uses `welding-workspace` for the same connected LISL workflow as the local Access prototype, with the existing hosted database and accounts. It contains no schema diagram and never imports the local example data automatically. The isolated local `access-prototype` and restricted `welding-demo` profiles remain available.

Before deploying this release to an existing, already prepared hosted database, set its existing private connection variables and exact `STELUX_PUBLIC_URL`, then run `STELUX_CLOUD_DATABASE=workspace npm run db:prepare:welding`. This creates a private PostgreSQL backup, adds four nullable generated material/certificate references, and checks that all records, credentials, audit history, counters, and documents are unchanged. The command is repeatable. Cloud request handling refuses an unprepared traceability schema and never runs migrations. Fresh evaluation preparation includes these references through `db:prepare:cloud`.

The default `npm run build` now produces a **Next.js SSR application**, with output `.next`, rather than a static Vite directory. It builds the existing browser interface and exposes the authenticated Express domain API through a Next.js Node API route. No separate Express server, Express compute pilot or `shipvela.compute.json` is needed. Next.js is pinned in `package-lock.json`. The Vite/local and Docker workflows remain available through `build:local`, `build:demo` and `build:cloud`.

The linked Shipvela project is `798638c9-f97b-4714-9c30-ba250967e208`, repository `Stelux1/steluxapp`, branch `main`. Select **Next.js SSR**, build command **`npm run build`**, output **`.next`**, and Node.js **24**. Shipvela's documented SSR path requires **Pro or Studio**; Free/Hobby static hosting cannot execute the private API. Installing Shipvela Deploy and accepting hosting permissions is a separate account-owner action. A local successful build does not establish that those account requirements are satisfied.

Configure `STELUX_DEMO_DATABASE_URL`, `STELUX_DEMO_DATABASE_PASSWORD` (unless the URL includes it), and the exact HTTPS `STELUX_PUBLIC_URL` from the table above. Use a separately prepared evaluation database, with the same `npm run db:prepare:cloud` procedure. Existing evaluation accounts and documents persist. The internal `DATABASE_URL` and local data are never adopted as evaluation data.

To connect the hosted welding interface to an **existing workspace and its accounts**, explicitly set `STELUX_CLOUD_DATABASE=workspace` and configure `DATABASE_URL`, `STELUX_DATABASE_PASSWORD`, the optional `STELUX_DATABASE_CA`, and `STELUX_PUBLIC_URL` in Shipvela. Use a certificate path committed to the repository, such as `server/certs/supabase-ca.crt`, rather than a local absolute path. This choice preserves the welding interface and existing account permissions. Only the selected database's settings enter the private server bundle.

Back up the existing database, then run `STELUX_CLOUD_DATABASE=workspace npm run db:prepare:cloud` with its private connection settings and public origin before deploying. This path requires an initialized workspace with an existing account, adds cloud document storage, and preserves users, password hashes, records and permissions. It never runs schema migrations or sample-data seeding. If attachment records still depend on local files, preparation refuses to proceed until those files have been imported into database document storage. The default `evaluation` mode retains its separate database and marker checks. Cloud request handling never prepares either database.

Amplify supplies Shipvela environment variables during the build. `scripts/build-shipvela.mjs` checks the required values for the selected database in a hosted build and writes only that explicit server-variable allowlist to a private JSON file under `dist-server/server/`. It does not load or copy a developer's `.env`. The JSON, compiled API, PostgreSQL worker, certificates and traced runtime dependencies belong exclusively to the server bundle; they are never in `public/` or `.next/static/`. JSON preserves special characters in passwords without dotenv expansion. Runtime variables override the saved build values. Changing these values requires a new deployment.

If your database requires a private CA file, make it accessible to the runtime and configure `STELUX_DEMO_DATABASE_CA`; the public Supabase CA is included at `dist-server/server/certs/supabase-ca.crt`. Public API and data responses use `Cache-Control: no-store`, same-origin writes retain their CSRF checks, and session cookies remain HttpOnly. Next serves page navigation and assets; database initialization and migrations never run at request time.

```sh
npm ci
npm run build
# Supply the evaluation runtime values above, then:
npm start
```

Verify `/api/health`, sign-in, a weld edit, authenticated document upload/download, and persistence after replacing the runtime. `scripts/verify-shipvela.mjs` performs this check against an explicitly selected disposable local PostgreSQL database. Hosting request/response size limits still apply to attachments; the generic Docker API supports up to 20 MB.

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
npm run build:local
```

Tests use temporary SQLite databases. HTTP tests open temporary loopback listeners and need local networking permission in restricted execution environments. They never change the live Montavar app or the user's `.data` directory.

Current verification: all 101 automated tests pass with disposable PostgreSQL integration databases configured, and the Next.js, local, and cloud production builds succeed. An additional optional test against a disposable PostgreSQL instance covers migration, account login, inventory changes, rollback, version conflicts, audit pagination, CSV previews and persistence across independent connections. Browser checks cover sample material ordering/receipt/picking, partial tool returns, WPS/PQR links, welder deployment, material laydown/service, revision-file upload, independent ISO/ITP revision numbers, and partial/full removal of a material requirement. These checks do not establish hidden PHP-rule parity.

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
npm run build:local
npm run start:local
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
