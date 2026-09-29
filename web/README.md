# TrueGrade

Multi-tenant heavy civil / sitework estimating web app. Tenant #1 is Interstate Rock at
`interstaterock.theanswerai.com`. The product name and tagline live only in
`src/config/brand.ts`. The UI palette matches theanswerai.com (navy `#06122B`/`#0B1B33`,
orange `#FF6B00`, Barlow Condensed headings); tokens are in `src/app/globals.css`.

## Stack

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript + Tailwind v4 | One deployable for UI, server actions, and file/API routes |
| DB | PostgreSQL + Prisma 6 | Relational data, row-level tenant scoping via a Prisma client extension |
| Jobs | Postgres-backed queue (`Job` table, `FOR UPDATE SKIP LOCKED`) with retries | No Redis needed; runs in-process or as `npm run worker` |
| Files | Tenant-namespaced storage (`src/lib/storage.ts`), local disk driver | Swap for S3/R2 behind the same interface |
| AI extraction | Anthropic Claude (`claude-opus-5-5`) with structured JSON output | Reads text and scanned PDFs (bid schedules, supplier quotes); cost is logged per tenant |
| PDF viewing | pdf.js in the browser, range requests, one page rendered at a time | Stays responsive on 500-sheet sets |
| Spreadsheets | ExcelJS | Cell protection, hidden columns, formulas that work in Excel/Sheets/Numbers |
| PDFs out | pdf-lib | Pure JS, no native deps |
| Auth | Email + password, bcrypt, DB sessions bound to the tenant | Simple, no third-party dependency; sessions can't cross subdomains |

## Run locally

```bash
cd web
cp .env.example .env        # set DATABASE_URL, optionally ANTHROPIC_API_KEY
npm install
npx prisma db push
npm run db:seed             # creates Interstate Rock + first admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm run dev
```

Open `http://interstaterock.localhost:3000` (Chrome resolves `*.localhost` to your machine).
Any host without a subdomain uses `DEV_TENANT`.

## Tests

```bash
npm test          # vitest: estimate math, RFQ spreadsheet round-trip, cross-tenant isolation
npm run typecheck
```

`tests/isolation.test.ts` creates two tenants and attempts cross-tenant reads, updates,
deletes and inserts of records, reads of uploaded files, and use of supplier quote links on
the wrong subdomain. Every attempt must fail. The test needs a Postgres database at
`TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/truegrade_test`).

## Deploy

1. Provision Postgres and set `DATABASE_URL`.
2. Point `*.theanswerai.com` (or just `interstaterock.theanswerai.com`) at the app and set
   `ROOT_DOMAIN=theanswerai.com`. Pass the original `Host` (or `X-Forwarded-Host`) through your proxy.
3. Set `STORAGE_DIR` to a persistent volume (or implement the S3/R2 driver in `src/lib/storage.ts`).
4. `npm ci && npx prisma migrate deploy && npm run build && npm start`.
5. For more than one web server, set `DISABLE_INPROCESS_WORKER=1` on web nodes and run `npm run worker` separately.
6. Add tenants at `/platform` (visible to emails in `PLATFORM_ADMIN_EMAILS`).

A `Dockerfile` is included.

## What's built (by the spec's phases)

- **Phase 1**: tenants by subdomain, Admin/Estimator roles, tenant-scoped query layer and file storage,
  isolation tests (records, files, links). Setup wizard steps 1–4: company basics and branding, labor
  (base, burden, prevailing wage, and a county wage table), equipment, materials with quote-expiry
  warnings, and a supplier/subcontractor directory with contacts, categories and CSV/Excel import.
- **Phase 2**: production rates asked in plain language with crew builder and live cost per unit;
  soils with swell/shrink and a before/after visual; assembly builder with live cost, breakdown,
  duplicate, and CY→ton conversion by density.
- **Phase 3**: chunked, resumable uploads (to 1 GB) with background processing; sheet index from
  title blocks with classification you can correct; vector vs scanned detection; bid schedule from
  AI extraction (with cost/time preview and monthly limit), Excel/CSV import, or manual entry;
  mandatory review table with sheet links; plan viewer with two-point calibration, a scale-mismatch
  warning, and linear/polyline/area/count tools mapped to bid items; takeoff vs owner-quantity
  variance flags.
- **Phase 4**: estimate organized by owner bid items (or default sections), bid item → assembly
  mapping with suggestions that must be confirmed, job-level overrides with reasons, a "How was this
  calculated?" expander on every line, a confidence indicator, versions, and duplicate-a-bid.
- **Phase 5**: consolidated material list with traceability; RFQs per category plus master with
  numbers like `IR-2026-0142-AGG-R0`; locked Excel with hidden line IDs and formulas, PDF, CSV,
  per-supplier copies, and a download-all zip; copy email text, open in email, mark as sent
  (including unknown recipients, saved to the directory in one click); download log; a "changed after
  download" banner with automatic revisions; returned spreadsheet import by RFQ number and line ID
  with fallback description matching; AI reading of suppliers' own PDF quotes; quote review;
  side-by-side comparison with lowest price, missing/expired/alternate/outdated-revision flags;
  selected prices flow into the estimate; Admin-approved price-history updates; comparison export.
- **Phase 6 (partial)**: secure, expiring, tenant-bound supplier quote form (`/q/<token>`); status
  tracking; estimator reminders for RFQs sent outside the app. Email-sending method selection and
  DNS instructions are in setup, but **no email is sent from the app yet**.
- **Phase 9 (partial)**: client and internal bid summary PDFs, bid form values (Excel/PDF) in owner
  item order, full estimate Excel. Final outputs are blocked while any bid item is unconfirmed or unmapped.
- **Phase 10**: `/platform` tenant creation with per-tenant AI spend.

## Not built yet

- Sending RFQs from inside the app (platform domain, company domain with live DNS verify, Google/Microsoft
  OAuth mailboxes), open tracking, and automatic supplier reminders.
- AI-assisted measurement overlays, LandXML surface comparison, addenda diffing, spec extraction.
- Historical job import, variance calibration, and job close-out.
- Wage determination and equipment cost report AI extraction.
- Forwarded or pasted email-text quote extraction.
- Real virus scanning (the hook is `scanFile` in `src/lib/storage.ts`; it reports NOT_SCANNED).
- Page thumbnails in the sheet index (the viewer renders pages on demand).
