# rockitdocs

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
`TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/rockitdocs_test`).

## Deploy

1. Provision Postgres and set `DATABASE_URL`.
2. Point `*.theanswerai.com` (or just `interstaterock.theanswerai.com`) at the app and set
   `ROOT_DOMAIN=theanswerai.com`. Pass the original `Host` (or `X-Forwarded-Host`) through your proxy.
3. Set `STORAGE_DIR` to a persistent volume (or implement the S3/R2 driver in `src/lib/storage.ts`).
4. `npm ci && npx prisma migrate deploy && npm run build && npm start`.
5. For more than one web server, set `DISABLE_INPROCESS_WORKER=1` on web nodes and run `npm run worker` separately.
6. Add tenants at `/platform` (visible to emails in `PLATFORM_ADMIN_EMAILS`).

A `Dockerfile` is included.

### Launch on Railway (recommended)

`railway.json` builds the Dockerfile and health-checks `/api/health`. On every boot the container
applies migrations and, the first time only, creates Interstate Rock and its first admin (it refuses to
create one without a real `SEED_ADMIN_PASSWORD`).

**One command** (from the `web/` folder, with `RAILWAY_API_TOKEN`, `ANTHROPIC_API_KEY` and
`SEED_ADMIN_PASSWORD` set as environment variables):

```bash
bash scripts/railway-deploy.sh
```

It creates the project, Postgres, the web service, variables (secrets are piped, never echoed), a volume
at `/data`, deploys, and prints the DNS record to add at Hostinger for `interstaterock.theanswerai.com`.
It is safe to re-run.

**By hand in the Railway dashboard:** create a project from the GitHub repo with root directory `web`, add
PostgreSQL, add a volume at `/data`, set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `ROOT_DOMAIN=theanswerai.com`,
`DEV_TENANT=interstaterock`, `ANTHROPIC_API_KEY`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, then add the custom
domain under Settings → Networking and the CNAME it shows at your DNS host.

## What's built (by the spec's phases)

- **Phase 1**: tenants by subdomain, Admin/Estimator roles, tenant-scoped query layer and file storage,
  isolation tests (records, files, links, and every newer table). Setup steps 1–4: company basics and branding
  (logo shows live in the sidebar, sign-in page, supplier quote form, PDFs and spreadsheets), labor (base,
  burden, prevailing wage, county table, and AI reading of wage determination PDFs with review), equipment
  (plus AI reading of equipment cost reports with review), materials with quote-expiry warnings, and a
  supplier/subcontractor directory with CSV/Excel import.
- **Phase 2**: production rates asked in plain language with crew builder and live cost per unit; soils with
  swell/shrink and a before/after visual; assembly builder with live cost, breakdown, duplicate, CY→ton.
- **Phase 3**: chunked, resumable uploads (to 1 GB) with background processing and ClamAV scanning; sheet index
  with lazy thumbnails, title-block extraction and classification you can correct; vector vs scanned detection;
  bid schedule from AI, Excel/CSV, or manual entry; mandatory review; plan viewer with calibration,
  scale-mismatch warning, and linear/polyline/area/count tools; takeoff vs owner-quantity variance flags.
- **Phase 4**: estimate by owner bid items, mapping suggestions that must be confirmed, job-level overrides,
  "How was this calculated?" on every line, confidence (calibrated / quoted / verified / override /
  unverified), versions, duplicate-a-bid.
- **Phase 5**: consolidated material list with traceability; RFQs per category plus master; locked Excel with
  hidden line IDs, PDF, CSV, per-supplier copies, zip; copy email text, open in email, mark as sent; download
  log; changed-after-download/send revisions; returned spreadsheet import; AI reading of PDF quotes and of
  pasted/forwarded email text; quote review; side-by-side comparison; price-history updates; comparison export.
  Subcontractor scope packages with Excel/PDF export.
- **Phase 6**: send from the app with the three methods (platform domain via Resend; company domain with the
  provider's exact DNS records, live Verify, email-to-IT, automatic fallback; Google/Microsoft mailboxes via
  OAuth with daily-limit warnings). Preview and approve every email; each carries the pre-filled spreadsheet, a
  secure quote-form link, a decline link and an open pixel. Statuses (sent, opened, responded, declined,
  overdue, failed), automatic supplier reminders, estimator reminders for RFQs sent outside the app,
  notifications inbox, per-RFQ activity log.
- **Phase 7**: LandXML surfaces → grid cut/fill with the company's swell/shrink, a cut/fill map, manual
  earthwork entries with source notes, and one-click draft bid items; addenda diffing (AI or Excel/CSV) with
  per-change accept, bid package version history, revised/new sheet list, and affected-RFQ revisions; spec
  requirements (AI or manual) that flow to material lines and RFQs, with flags for cited standard specs that
  weren't uploaded; AI measurement suggestions pinned to the sheet callouts they came from (amber until
  accepted, edited or rejected).
- **Phase 8**: past jobs from PDF, Excel/CSV or photos of printed reports (AI) or typed in; review beside the
  source; mapping to production rates with inline "create new"; variance calibration with Approve / Edit /
  Dismiss (never automatic); calibrated rates show as CALIBRATED in estimates.
- **Phase 9**: close-out from any bid (prefilled from its estimate) feeding the same calibration; client and
  internal bid summary PDFs, bid form values (Excel/PDF) in owner item order, full estimate Excel.
- **Phase 10**: `/platform` tenant creation with per-tenant AI spend.

## Configuration

Everything optional degrades gracefully and says so in the UI. See `.env.example` for the full list.

| Setting | What it turns on |
|---|---|
| `ANTHROPIC_API_KEY` | All AI reading (bid schedules, quotes, specs, addenda, measurement, job costs, wage/equipment reports) |
| `RESEND_API_KEY`, `MAIL_FROM_DOMAIN` | Delivering email. Without them, sends are saved in the log and marked "not delivered" |
| `APP_SECRET` | Encrypts mailbox tokens (required for "Connect my email") |
| `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `OAUTH_REDIRECT_BASE` | "Connect my email". Register `<OAUTH_REDIRECT_BASE>/api/oauth/{google,microsoft}/callback` |
| `CLAMAV_HOST` | Upload virus scanning via clamd; uploads are refused if the scanner is down |
| `TZ` | Time zone for due dates and reminders (Dockerfile default `America/Denver`) |

## Known limits

- Email "opened" is approximate: some mail apps preload images and others block them.
- AI measurement reads printed callouts and stationing; it never measures by eye, so sheets without
  callouts get no suggestions.
- Storage uses the local disk driver (a Railway volume); swap in S3/R2 behind `src/lib/storage.ts` for
  multiple servers.
