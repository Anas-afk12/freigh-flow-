# FreightFlow PRO

**A local, offline desktop application for freight forwarding operations** — sea freight, FCL/LCL, export-focused. It replaces a workflow of 10+ Excel sheets with a single system where staff enter data **once** against a `Job_Number` and generate professional shipping documents with one click.

> A job that takes ~45 minutes across spreadsheets takes ~5 minutes here.

> Screenshots of the running app are generated into `docs/screenshots/` — run `npm start` and open `http://localhost:3000` to see the live UI.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Key features](#key-features)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Everything is local](#everything-is-local)
- [Project structure](#project-structure)
- [How the app works](#how-the-app-works)
- [REST API](#rest-api)
- [Business rules that matter](#business-rules-that-matter)
- [Testing](#testing)
- [Building the Windows installer](#building-the-windows-installer)
- [Backups](#backups)
- [License](#license)

---

## Why this exists

The company duplicated the same data (clients, containers, rates) across many spreadsheets per shipment. That caused typos, wasted time, and looked unprofessional. FreightFlow PRO makes **`Job_Number` the master key**: rates, containers, taxes and documents all link to one job entered once.

## Key features

- **Job lifecycle** — `BOOKED → SAILED → DELIVERED → CLOSED`, plus `CANCELLED`.
- **Master data** — clients (shippers/consignees/notify/vendors), ports, commodities, container types. Full CRUD with active/inactive toggling (never hard-deleted where historically referenced).
- **Buying/selling rates** in USD **or** PKR, with **currency-safe** profit — every rate row is converted to a common base (USD) individually before aggregation, using the exchange rate **locked onto the job** at first profit/tax generation (so editing the global rate never rewrites history).
- **ZKT / KHRT tax generation** on positive PKR profit, with configurable percentages.
- **One-click PDF documents** — Bill of Lading, Invoice, Booking Note, CRO Request — with a company letterhead and atomic per-year document numbering (`BL-2026-001`, `INV-2026-001`, …).
- **Reports** — GPSHT (shipment tracking, one row per container) and JOBGP (profit/tax analysis, one row per job), each with filters, sorting, print, and **Excel export**.
- **Atomic, gap-free job numbers** — `EUMEX-2026-001` via a dedicated sequence table (no `MAX()+1` race).
- **Rotating local backups** — keeps the last 30 copies of the database file.
- **Packaged as a Windows desktop app** via Electron (optional; the app also runs as a plain local web app).

## Technology

| Layer | Choice | Why |
|---|---|---|
| Database | SQLite via **better-sqlite3** | Single local file, no server, synchronous — safe atomic multi-table writes |
| Backend | Node.js + Express | Simple, JS everywhere |
| Frontend | HTML + CSS + vanilla JS | No build step, easy to maintain |
| PDF | jsPDF + jspdf-autotable | Local generation, no external service |
| Excel | SheetJS (`xlsx`) | Report export |
| Desktop | Electron + electron-builder | Windows `.exe` installer |

> **Note on the database driver:** production targets `better-sqlite3` (a native module). If it can't be compiled/fetched in a restricted environment, the app transparently falls back to Node's built-in `node:sqlite` (Node 22.5+) behind a thin compatibility shim, so it still runs. Electron packaging uses `better-sqlite3`.

## Quick start

Requires **Node.js 18+** (Node 22+ recommended).

```bash
# 1. Install dependencies
npm install
# (to run/test only, without the Electron toolchain: npm install --omit=dev)
#
# On Node 24+ (no better-sqlite3 prebuilt binary) or a machine without Python /
# build tools, skip native compilation — the app falls back to Node's built-in
# SQLite automatically:
#   npm install --omit=dev --ignore-scripts
# Windows users can instead just double-click start-freightflow.bat.

# 2. Create the database, schema and seed data (idempotent)
npm run db:reset

# 3. Start the local web app
npm start
# → open http://localhost:3000
```

The server auto-creates the schema and seed data on first boot, so `npm start` alone is enough after `npm install`.

Useful scripts:

| Script | Action |
|---|---|
| `npm start` | Run the Express server (web app) |
| `npm run dev` | Run with nodemon (auto-reload) |
| `npm test` | Run the integration test suite |
| `npm run db:init` | Create schema only |
| `npm run db:seed` | Seed master data + sample job (idempotent) |
| `npm run db:reset` | **Drop** and rebuild the database from scratch |
| `npm run electron` | Launch the Electron desktop shell |
| `npm run build:win` | Build the Windows NSIS installer |

## Everything is local

There is **no cloud and no external service**. All data lives in a single SQLite file at `data/freightflow.sqlite` (configurable via `.env`). PDFs and Excel files are generated on your machine. The app only listens on `localhost`. Deleting the `data/` folder is the only way to lose data — which is why backups exist.

`.env`:

```
PORT=3000
DB_PATH=./data/freightflow.sqlite
NODE_ENV=development
```

## Project structure

```
freightflow-pro/
├── server.js                 # Express server (serves API + static frontend)
├── main.js                   # Electron entry point (spawns server, backups on close)
├── src/
│   ├── db/                   # connection (with node:sqlite fallback), schema, seed, reset
│   ├── repositories/         # all SQL, one file per table, fully parameterized
│   ├── services/             # profit (currency-safe), tax, job numbering, PDF, backups
│   ├── pdf/                  # BL / Invoice / Booking / CRO templates
│   ├── controllers/          # parse → validate → call service → shape response
│   ├── routes/               # API wiring only
│   ├── middleware/           # centralized error handler, validation, logger
│   └── utils/                # currency, dates, numbers, typed errors
├── public/                   # frontend (no framework, no build step)
│   ├── *.html                # dashboard, new-job, job-detail, master-data, settings, reports
│   ├── css/style.css
│   └── js/                   # api, table, modal, toast, validate + pages/
├── tests/db.test.js          # integration tests (npm test)
├── data/                     # SQLite file + backups/ (git-ignored)
└── docs/screenshots/
```

Strict one-way layering: `routes → controllers → services → repositories → db`.

## How the app works

1. **Create a job** — pick shipper/consignee/notify/commodity/ports and cargo details; a `Job_Number` is generated atomically on save. Containers can be added at creation or later.
2. **Add rates** — buying (with vendor) and selling rows, each in USD or PKR.
3. **Open the job** — see live, currency-safe profit; generate ZKT/KHRT taxes (this locks the exchange rate onto the job).
4. **Generate documents** — one click produces a BL, Invoice, Booking Note or CRO PDF and records it in the job's document history.
5. **Report & export** — GPSHT and JOBGP with filters, sorting, print and Excel export.

## REST API

All responses use a `{ success, data }` / `{ success, error: { message, code } }` envelope. List endpoints support `?search=&status=&page=&limit=`.

```
GET/POST                 /api/jobs
GET/PUT/DELETE           /api/jobs/:id
POST                     /api/jobs/:id/archive
GET/POST                 /api/jobs/:id/containers
GET/POST                 /api/jobs/:id/rates
GET                      /api/jobs/:id/profit
POST                     /api/jobs/:id/generate-taxes
GET/POST/PUT/DELETE      /api/clients | /api/ports | /api/commodities | /api/container-types
GET                      /api/reports/gpsht      (+ /export → Excel)
GET                      /api/reports/jobgp       (+ /export → Excel)
POST/GET                 /api/documents/:jobId/bl | invoice | booking | cro   (→ PDF)
GET/PUT                  /api/settings
```

## Business rules that matter

- **Currency-safe profit** — `Profit = Σ(selling→USD) − Σ(buying→USD)`, converting each row individually. Mixed USD/PKR rows are never summed raw.
- **Locked exchange rate** — set from global settings the first time profit/tax is generated, then fixed on the job.
- **Taxes only on positive PKR profit** — ZKT (2.5%) and KHRT (7.5%) percentages are configurable in Settings.
- **No hard deletes on financial data** — a job with any paid rate or generated document is archived, never deleted.
- **Atomic numbering** — job numbers and per-type document numbers come from dedicated sequence tables, gap-free per year.

## Testing

```bash
npm test
```

Runs 35 assertions against a throwaway database, covering schema/seed integrity, currency-safe profit (including a mixed USD/PKR regression test), positive-only tax generation, atomic gap-free numbering, PDF generation, and the soft-archive rule.

## Building the Windows installer

```bash
npm install            # includes the Electron toolchain (devDependencies)
npm run build:win
```

Produces an NSIS installer in `dist/` with desktop and Start Menu shortcuts. Place an `icon.ico` in `build/` to brand it. `better-sqlite3` is rebuilt for Electron automatically by electron-builder.

## Backups

The database is a single file, so the app keeps rotating backups (last 30) in `data/backups/`. In the desktop build a backup is taken automatically on app close. You can also run it manually:

```bash
node src/services/backupService.js
```

## License

MIT — see [LICENSE](LICENSE).
