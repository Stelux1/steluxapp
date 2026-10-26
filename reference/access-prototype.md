# Local Access prototype

This implementation follows the supplied relationship screenshot and the `ISO details` table in `Blitzkrieg - Prototype 1.accdb`. That table contains 87 columns and two example welds. Its exact column names and order are recorded in `access-prototype-schema.json`. The screenshot describes the application’s data relationships. It is implementation reference material and is not displayed in the web application.

## Run locally

```sh
npm run build:prototype
npm run start:prototype
```

Open http://127.0.0.1:3003. This profile always uses local SQLite in `.data/access-prototype/stelux.sqlite` and a separate `dist-access-prototype/` build. It ignores `DATABASE_URL`, rejects cloud mode, binds to loopback, and creates no fictional project records. The existing full and welding-demo profiles retain their own storage and release boundaries. These commands run locally; publishing the code does not select or modify a hosted database.

To extract the supplied database again, install the reader only in an isolated Python runtime and import its JSON:

```sh
uv run --with access-parser==0.0.6 python scripts/extract-access-prototype.py '/path/to/Blitzkrieg - Prototype 1.accdb'
npm run import:prototype
```

The JSON and SQLite files are ignored by Git. Import reads `ISO details` only, preserves leading zeros, normalizes decimal commas, and creates related ISO, welder, WPS, spool, material, certificate-index, and inspection records in one transaction. A repeated identical import adds nothing. A different import or existing project records cause an explicit refusal, and a bad later row rolls back the whole batch. No Access macros, queries, or forms are executed. Other Access tables and document attachments are not imported by this command.

## Connected records

| Access model | Application record |
| --- | --- |
| Data ISO | Isometric drawing, linked to project and site; technical fields include area, ITP, PED, NDT %, piping class, paint, RAL, pressure-test plan, pressure and medium |
| Data LISL | Weld register, linked to ISO, type, up to four welders, spool and WPS |
| Weld type | Name and abbreviation |
| Welders | Stable welder ID and name |
| Spools | Spool number scoped to its ISO |
| WPS methods | WPS number, process, definition, joint type and active flag |
| Material database | Material group, article, legacy and material numbers, diameter, schedule and wall thickness |
| Certificates | Certificate / attest number, index, material reference, charge / heat, material code, diameter and description |
| VT / NDT / heat treatment | Dated inspection requests and results; full history remains available |

Each weld has two material and certificate references. Selecting a certificate fills its material and charge. The API rejects mismatched materials or charge numbers and prevents a linked certificate edit from invalidating existing welds. Inactive WPS references remain readable on historical welds but cannot be newly assigned in the prototype.

The **Data LISL** page joins all 87 source fields, offers six column groups, searches all fields, filters by project and ISO, and exports all fields to CSV. The application exposes editable business records rather than a schema diagram. ISO and weld number stay at the start of each column group.

NDT 1–4 show the first four non-cancelled NDT requests ordered by date, creation time and ID, with the latest result per request. Further requests and superseded results remain in Inspection results. VT upload status reflects a real document attached to the selected visual result. Source `YES` / `NO` inspection outcomes become `Accepted` / `Rejected`; absent optional weld flags become unchecked. An empty source welding process is labeled `Not recorded`, and no process or inspection outcome is inferred. Unspecified VT / NDT dates remain blank. Certificate indices create explicitly labeled index references, not fabricated original certificate numbers or documents. Heat-treatment reports without a source result require review and cause import to stop.

The `Sub-Projects` table and a project-specific ISO table are present in the supplied file, but the current Access reader cannot reliably parse their rows. Their content is not claimed as imported; the two complete `ISO details` rows supply the prototype data.

## Verification

`npm test` includes transactional import rollback, idempotency, all 87 source columns, certificate integrity on both sides, inspection history, isolated runtime, reopen persistence, authenticated CSV export, inactive WPS assignment, and read-only API permissions. Existing regression tests continue to cover the other workspace profiles. PostgreSQL integration tests require an explicitly configured disposable database and remain optional.

Release verification on 26 October 2026: all 100 automated tests passed with no skips, using disposable PostgreSQL 17 databases for the integration checks. Local, Access prototype, cloud, and Next.js builds passed. The Next.js production check covered sign-in, permissions, weld edits, XLSX export, document upload/download, and persistence after restart in both database modes. Browser checks confirmed that the schema links are absent, the former schema URL returns 404, and LISL search, exports, and material certificate selection work.
