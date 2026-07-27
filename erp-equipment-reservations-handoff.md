# erp-equipment-reservations — AI Handoff Document

> **Rule**: Every new feature, bug fix, infrastructure change, or decision made in any session must be appended to the **Session Log** section at the bottom. This file is the authoritative context for future AI sessions working on this project.

---

## 1. What This App Is

Replacement for an Airtable + Softr app used by architects at the Agopian business to **reserve equipment/materials from a master catalog for specific construction projects**. Two views, mirroring the original Softr UI:

- **Master Catalog** — browse ~1,100 products (code, description, price, stock, category, supplier, photo), reserve quantity against a project.
- **Reservations** — table of all reservations (project code, architect, item, qty, date), editable/deletable by any logged-in architect (matches original Airtable "EDIT BY" shared-editing behaviour).

**Architects** (7, from source data): ALEX, CAROLIN, ELINA, ELLI, KONSTANTINOS, NIKI, VASIA — log in via Supabase Auth (email/password), no self-signup.

**Projects**: identified by OIK codes (e.g. `OIK102`, `OIK87.3.1`) — dropdown seeded from historical reservations, but the list can grow (new construction projects start over time).

---

## 2. Source Data

Originally exported from Airtable, dropped by the user into `public/` on 2026-07-27, then moved to `source-data/` (kept out of `public/` so it isn't bundled into the deployed app):

- `source-data/MASTER CODES-Grid view copy.csv` — 1,101 products, 21 categories, 76 suppliers. Photo column is Airtable's `image.png (https://v5.airtableusercontent.com/...)` format — signed URLs that **expire**, so they were downloaded immediately during this session.
- `source-data/RESERVATIONS-Grid view.csv` — 121 historical reservations.
- `source-data/catalog 16june26.XLSX` — an older (June 16) catalog export, superseded by the CSV (July 27). Left untouched, not imported — flagged here in case it ever needs cross-referencing.
- `source-data/reference-screenshots/` — 3 screenshots of the original Softr UI (Master Catalog, Reservations, Edit modal) used to understand the app's behaviour before building.

---

## 3. Key Decisions Made This Session

### Image hosting: GitHub + jsDelivr CDN (not Supabase Storage, not Cloudflare R2)
User explicitly asked to weigh in before proceeding, since images "need to be free and not impact Supabase in any way." Options presented:
- Supabase Storage — rejected: shares the same free-tier bandwidth pool (5GB/mo) as DB/API traffic; risk of exhausting it with 7 people repeatedly browsing 1,100 product photos.
- Cloudflare R2 — best long-term (zero egress fees, fully isolated), but needs new bucket/domain setup.
- **GitHub + jsDelivr — chosen.** Zero new accounts (repo already exists), zero cost, no realistic rate limit for internal use by 7 people, doesn't touch Supabase at all. Tradeoff accepted: images are public in a public GitHub repo (fine — furniture/fixture photos, nothing sensitive).

Images live in `catalog-images/<KODIKOS>.<ext>` at the repo root (NOT inside `public/`, so Vite doesn't bundle 18MB of images into the Vercel deploy — they're served purely from GitHub via jsDelivr: `https://cdn.jsdelivr.net/gh/adenadoume/erp-equipment-reservations@main/catalog-images/<file>`). 412 of 1,101 products had a photo; all 412 downloaded successfully (~18MB total).

### Repo structure: own git repo inside the monorepo folder
Same pattern as `ws-inventory-report` and `softone-live` — lives at `apps/erp-equipment-reservations/` in the MONOREPO folder tree, but is its own standalone git repo pushing to `github.com/adenadoume/erp-equipment-reservations`, NOT part of the monorepo's `paleros-bay-monorepo` repo. User confirmed this explicitly when asked.

### Auth: manually-created Supabase users, no self-signup
User said upfront to just tell them to create the Supabase Auth users for the 7 architects (dashboard → Authentication → Users → Add user, with `full_name` in user metadata). A `handle_new_user()` trigger auto-creates a `profiles` row from that metadata on signup — no separate manual profile step needed.

### Data import: SQL Editor + CSV import, not a service-role script
Only the **anon key** was provided, not a service-role key. Rather than ask for an elevated secret to script the import, the plan is: user pastes `supabase/schema.sql` into the SQL Editor once, then imports `supabase-import/{products,projects,reservations}.csv` via Supabase Studio's native CSV importer (Table Editor → Insert → Import data from CSV) — few clicks, no secrets exchanged. Scripts (`scripts/import_data.py`) already produced the cleaned CSVs from the raw Airtable export (numeric comma-decimals normalized, dates parsed, photo URLs rewritten to jsDelivr).

### Availability is computed live, not trusted from the Airtable snapshot
Airtable had static `DESMEVMENA`/`DIATHESIMA` rollup columns that would go stale the moment reservations are made in the new app. Instead, `products.q` (total stock) is the imported source of truth, and a Postgres view `product_availability` computes `available_qty = q - sum(reservations.quantity)` live.

---

## 4. New Requirement (not yet built): SoftOne order-sync

User asked mid-session: every time a reservation is created or deleted in this app, a SoftOne ΠΑΡΑΓΓΕΛΙΑ (purchase order) document — **ΠΑΛ-ΑΝ0026, dated 27/7/2026, number 26** — should be updated (line added on create, line removed on delete).

**Not yet implemented.** This is a live-ERP write operation (mutating a real production purchasing document), which is a materially different risk class than the rest of this app, so it's deliberately deferred as its own step rather than rushed alongside the initial build. Also: the existing `softone-live-backend` FastAPI service (see [[softone-live app]] memory) is currently **read-only** — only `GET`/browse routes exist, no documented write/save-document route. Before this can be built, need to:
1. Confirm whether SoftOne's `s1services` API supports updating an existing SALDOC's lines (add/remove), and what that call looks like.
2. Locate document ΠΑΛ-ΑΝ0026 via the SoftOne API to confirm series/findoc.
3. Decide where this logic lives — likely a new authenticated endpoint on `softone-live-backend` (already has SoftOne credentials + session handling on the Oracle VM) that this app's frontend calls after every reservation create/delete.
4. Also check `/Users/nucintosh/PYTHON/API_ws_REPORTS/ORACLE FASTAPI SOFTONE EMAIL REPORTS/` — a separate existing backend already doing SoftOne + email work, may have relevant write patterns or may be the better home for this.

## 5. Deferred to Phase 2 (per user)

Email notification triggered on each reservation — explicitly phase 2, not part of the initial build.

---

## 6. Architecture (once deployed)

```
Browser
   │
   ▼
Vercel (erp-equipment-reservations, auto-deploys on push to main)
   │  - React 18 + TypeScript + Vite + Ant Design 5 + react-router-dom + dayjs
   │  - talks directly to Supabase (no custom backend needed for CRUD)
   │
   ├──▶ Supabase (hgqigqmzgdrmkerxkwaa.supabase.co)
   │      - Auth (7 architect accounts, manually created)
   │      - Postgres: products, reservations, projects, profiles tables
   │      - RLS: authenticated users can read everything, insert/update/delete reservations
   │
   └──▶ jsDelivr CDN (cdn.jsdelivr.net/gh/adenadoume/erp-equipment-reservations@main/catalog-images/*)
          - product photos, served straight from this GitHub repo, free, no egress cost
```

---

## 7. Session Log

### 2026-07-27 — Initial build session

- Explored source CSVs + reference screenshots, confirmed understanding of the Softr app being replaced (see sections 1–2 above).
- Asked user to decide image hosting strategy; **GitHub + jsDelivr** chosen (see section 3).
- Confirmed with user that this app stays inside the MONOREPO folder tree but is its own git repo (matching `ws-inventory-report`/`softone-live` pattern).
- Initialized git repo, added remote `git@github.com:adenadoume/erp-equipment-reservations.git` (empty repo, confirmed via `git ls-remote`).
- Designed and wrote `supabase/schema.sql`: `products`, `reservations`, `projects`, `profiles` tables, `product_availability` view for live stock calc, RLS policies, `handle_new_user()` trigger for auto-profile creation.
- Wrote `scripts/import_data.py`: parses both Airtable CSVs, cleans European comma-decimal numbers, parses two different date formats (`Date` column is D/M/Y, `Created` column is M/D/Y — Airtable quirk), extracts photo URLs from Airtable's `image.png (url)` field format, downloads all images concurrently, rewrites photo URLs to jsDelivr, outputs `supabase-import/{products,projects,reservations}.csv`.
- Ran the pipeline: 1,101 products / 121 reservations parsed, 412/412 images downloaded successfully (~18MB), 7 architects and 15 project codes discovered and confirmed against source data (zero orphan product codes, zero blank required fields).
- Mid-session: user asked for a SoftOne order-sync feature (section 4) — logged as deferred, not yet built.
- Mid-session: user asked for this handoff file to be created and kept up to date — done, following the same rule as `softone-live-handoff.md`.
- *(To be continued — this entry will be updated as the app scaffold, pages, and deployment are completed in this same session.)*
