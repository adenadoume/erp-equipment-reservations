# erp-equipment-reservations — AI Handoff Document

> **Rule**: Every new feature, bug fix, infrastructure change, or decision made in any session must be appended to the **Session Log** section at the bottom. This file is the authoritative context for future AI sessions working on this project.

> **SAFETY RULE (CRITICAL, per explicit user instruction 2026-07-27)**: SoftOne write access from this system may **only ever** target document **ΠΑΛ-ΑΝ0026 / SALDOC FINDOC 45911** — no other SoftOne document, under any circumstances. Other SoftOne documents feed ΑΑΔΕ (the Greek tax authority); writing to the wrong one is a legal/financial risk, not just a data bug. This is enforced in code as a **hardcoded, non-parameterized target** in `softone.py`'s `sync_equipment_order_lines()` (`EQUIPMENT_ORDER_OBJECT`/`EQUIPMENT_ORDER_FINDOC`/`EQUIPMENT_ORDER_FINCODE` constants), with a live FINCODE sanity-check before every write — there is no code path, parameter, or request body field that can redirect a write anywhere else. If this system ever needs to write to SoftOne for a different purpose in the future, that requires a new, separately-reviewed function — never generalize `sync_equipment_order_lines()` into a parameterized "write to any document" helper.

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

## 4. SoftOne order-sync — write API confirmed working, feature not yet built

User asked mid-session: every time a reservation is created or deleted in this app, a SoftOne ΠΑΡΑΓΓΕΛΙΑ document — **ΠΑΛ-ΑΝ0026** (SALDOC, series ΠΑΛ-ΑΝ, **FINDOC key = 45911**, customer "ΧΡΙΣΕΜΜΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ ΑΚΙΝΗΤΩΝ", both header and line `COMMENTS` = "PDH RESERVATIONS") — should be updated to mirror reservations (line added on create, line removed on delete). User confirmed writes are safe to test here ("it's order only, no other implications") and that the one pre-existing line on this doc (`L3289W`, qty 1) was leftover/test, fine to overwrite.

**Write capability confirmed live, 2026-07-27** — `setData` works against this SoftOne instance using the exact same auth/session pattern the existing read-only `softone-live-backend` already uses (`service`, `clientID`, `appId`, `object`, `key`, `data`). Full contract sourced from the official **SoftOne BlackBook** (`SoftOne BlackBook ENG ver.3.5.pdf`, dropped into this app's repo root by the user — Chapter 12, "SetData (Post Method)", p.483-495) and verified empirically against the live document:

- **Child-table (line) semantics — this is the critical, documented, and empirically-verified behavior**: to update a document's `ITELINES`, you must include the `LINENUM` of **every existing line you want to keep** (with no other fields, if it's unchanged) alongside any lines you're adding or changing. **Any existing line whose `LINENUM` is NOT included in the `data.ITELINES` array gets deleted.** This is not merge-by-default — it's an explicit "list the lines you want to survive" contract.
- **New lines** use `LINENUM` **≥ 9000001** (official convention, confirmed in the BlackBook's own worked SALDOC example: two new lines get `LINENUM: 9000001` and `9000002`).
- **Empirical test performed** (on the live ΠΑΛ-ΑΝ0026 / FINDOC 45911, with user's explicit go-ahead): sent `setData` with `key: 45911` and `data.ITELINES` containing one line for `MTRL: 24959` (=A7642BB), `QTY1: 1`, **without** including the existing line's `LINENUM`. Result: `{"success": true, "id": "45911"}` — updated the same document (didn't duplicate), and the pre-existing `L3289W` line was gone, replaced by the new `A7642BB` line. This is exactly what the docs predicted, and confirms the write path is real and working, not just documented.
- **Hard constraint discovered**: a SALDOC **cannot have zero lines** — tried setting `ITELINES: []` to clean the test document back to empty, got a clean rejection: `{"success": false, "error": "Το παραστατικό δεν έχει καμία γραμμή"}` ("the document has no line"), **and the document was left unchanged** (confirms writes are validated/transactional, not partially applied on failure — good safety property). So the sync logic must never try to reduce a document to zero lines; if the last reservation is deleted, either leave a harmless placeholder line or handle that case deliberately.
- Document currently has 1 line left over from this test (`A7642BB` qty 1) — intentionally not cleaned up further (can't be emptied per above), will simply get overwritten once the real sync writes actual reservation data.
- Official worked example (BlackBook p.494-495, "6. Add Sales Document") for reference — confirms field names for a fresh SALDOC + ITELINES creation:
  ```json
  {
    "SERVICE": "SetData", "OBJECT": "SALDOC", "KEY": "",
    "DATA": {
      "SALDOC": [{"SERIES": "7001", "TRDR": "40", "PAYMENT": "1003"}],
      "ITELINES": [
        {"LINENUM": 9000001, "MTRL": 2015, "QTY1": 1, "PRICE": 10, "VAT": "1310", "MTRUNIT4": "101", "MTRCATEGORY": "204"},
        {"LINENUM": 9000002, "MTRL": 2016, "QTY1": 2, "PRICE": 5, "VAT": "1310", "MTRUNIT4": "101", "MTRCATEGORY": "204"}
      ],
      "SRVLINES": []
    }
  }
  ```

**Design implication for the real sync** (not built yet): since `LINENUM` must stay **stable per reservation** to update/delete individual lines without disturbing others, `reservations` needs a new nullable `softone_linenum integer` column — assigned once (starting at 9000001, incrementing) the first time a reservation is synced, then reused on every subsequent update/delete for that same reservation. On every sync call: fetch current live reservations for this doc, build the full `ITELINES` array (existing unchanged lines by `LINENUM` only, changed ones with `LINENUM` + changed fields, brand-new ones with a freshly-assigned `LINENUM` ≥ 9000001, deleted ones simply omitted), and send the whole array — this "always send full desired state" approach is what makes the sync correct and idempotent given the delete-by-omission semantics above.

**Also, per user's own insight mid-session**: once this sync is live, SoftOne's own `Δεσμευμένα`/`ITEM.V15` (committed) will start including these mirrored order lines automatically, which means `ITEM.V21`/ΔΙΑΘΕΣΙΜΑ (already synced into `products.stock_softone`, see 4b below) will then also reflect our own app's reservations — no separate accounting needed for that.

**Built and deployed 2026-07-27** (schema migration still pending, see below):

- `POST /api/equipment/sync-order` on `softone-live-backend` — idempotent full-replace: reads all current `reservations` (joined with `products.mtrl_id`), assigns `softone_linenum` (≥9000001, incrementing) to any reservation that doesn't have one yet, persists that back to Supabase, builds the complete `ITELINES` array, and writes it via the guarded `sync_equipment_order_lines()` in `softone.py`. Skips (doesn't fail) reservations whose product has no `mtrl_id` yet — depends on `/api/equipment/sync-stock` having run at least once to populate that.
- Frontend calls this (fire-and-forget, `src/lib/orderSync.ts`) after every reservation create (`ReserveModal.tsx`), edit, and delete (`Reservations.tsx`) — best-effort, a failure only shows a warning toast, never blocks the actual Supabase operation (Supabase stays the source of truth).
- **Blocked on the pending schema migration** (`supabase/migration_002_admin_rls_softone.sql`, not yet run by user as of this writing) — `reservations.softone_linenum` and `products.mtrl_id` don't exist in the live DB yet. Verified the endpoint fails *cleanly* in this state (502 "column does not exist", not a crash) — confirmed live via `curl -X POST https://erp.agop.pro/api/equipment/sync-order`.
- **Once the migration runs**, still need to run `/api/equipment/sync-stock` once to backfill `mtrl_id` for all 1,101 products before the order-sync can build real lines for existing reservations.

## 4b. SoftOne stock sync — built and live

User asked (2026-07-27) to keep `products.stock_softone` updated from SoftOne's Αποθήκη → Είδη → Ευρετήριο Ειδών (Items Index) screen, specifically the **ΔΙΑΘΕΣΙΜΑ (available)** calculated field — not raw stock. The old Airtable script (pasted by user) pulled `ITEM.SoRemQty1`, which turns out to be the **wrong field**.

**Live-tested against the real SoftOne API** (`aromaioniou.oncloud.gr`, using `softone-live-backend`'s existing `app/softone.py` client + credentials from its `.env`):

- `getBrowserInfo` object=`ITEM`, list=`ALL` exposes both fields, with distinct captions:
  - `ITEM.SoRemQty1` → caption **"Συνολ. Υπόλοιπο"** (total remaining / raw stock) — what the old script used.
  - `ITEM.V21` → caption **"Διαθέσιμα"** (available) — **this is the correct field**, computed by SoftOne itself (stock minus commitments — `ITEM.V15` = "Δεσμευμένα"/committed, `ITEM.V16` = "Αναμενόμενα"/incoming, both feed into V21).
  - Confirmed both fields can differ (V21 = SoRemQty1 − committed) though the one item spot-checked (`A7642BB`) happened to have zero commitments so they matched (22 = 22).
- **Filter matters a lot for performance.** SoftOne's `ITEM` table is much bigger than our ~1,100 equipment products (this is a shared multi-purpose ERP instance). An **unfiltered** `getBrowserInfo` (list=ALL, no filter) times out past 30s — confirmed by direct test. The old Airtable script's filter `ITEM.APVCODE=35*` is the correct scope: live-tested, returns **totalcount=1105** (matches our ~1,101 products), `getBrowserInfo` takes ~12.6s (slow but reliable), and paginated `getBrowserData` in batches of 500 pulls all 1,105 rows in **~2.3s total** (3 batches). Full bulk sync ≈ 15s end-to-end.
- **Critical implication**: never do this per-product (1,100 individual `getBrowserInfo`+`getBrowserData` round trips) — reproduced a real SSL/read timeout doing exactly that in a quick sequential-loop test. One filtered bulk call + pagination is the only viable approach. User explicitly flagged this ("keep in memory") — the sync should run periodically (cron/scheduled job) and cache the result in `products.stock_softone`, not be queried live from SoftOne on every catalog page load.

**Built and live as of 2026-07-27.** User chose "both" (nightly cron + manual button) when asked. Implementation added to the existing `softone-live-backend` (not a new service) since SoftOne credentials + session handling already live there:

- `POST /api/equipment/sync-stock` on `softone-live-backend` (full detail in that app's own handoff, `softone-live-handoff.md`, per its handoff-file rule) — bulk-fetches `ITEM.V21` for `APVCODE=35*`, upserts into `products.stock_softone` only for `kodikos` already in the catalog (never creates new rows).
- Nightly cron on `oracle-arm`, 23:00 UTC, hits `localhost:8003` directly.
- Manual "Sync SoftOne stock" button added to `src/pages/Catalog.tsx`, calls `https://erp.agop.pro/api/equipment/sync-stock` directly (that backend's CORS is already wide open, so no proxy rewrite was needed in this app).
- **Important scope note**: this only refreshes `products.stock_softone` (an informational/reference column). It does **not** touch `products.q`, which is the column that actually drives this app's own live availability calc (`product_availability` view = `q − sum(our reservations)`). Those are intentionally two different numbers: `stock_softone`/ΔΙΑΘΕΣΙΜΑ already accounts for SoftOne-side commitments (e.g. stock sold via other business documents), while `q` minus *our* reservations is what tells an architect what's actually free to reserve through this app. If `q` should also start tracking SoftOne over time, that's a separate explicit decision — not made yet, would need to be raised with the user (it changes what "available" means in the catalog UI).
- **Bugs hit and fixed during first deploy** (full postmortem in `softone-live-handoff.md`): (1) upserting unconditionally created 21 incomplete rows for SoftOne items outside the actual catalog — fixed by pre-filtering to known `kodikos` only; (2) a stale `__pycache__/*.pyc` on the VM (leftover from an earlier botched `scp -r` that nested-copied into `app/app/`) caused a deployed fix to silently not take effect — `docker build --no-cache` after purging `__pycache__` resolved it. Also corrected: the documented backend path (`/home/ubuntu/softone-live-backend/`) was stale post-migration; real path is `/home/ubuntu/softone-live/`.
- **Extended 2026-07-27 (later same day)**: `fetch_equipment_availability()` now also captures `MTRL` (SoftOne's internal numeric item key, parsed from `ZOOMINFO`, e.g. `"ITEM;24959"` → `24959`) alongside `V21`, and `/api/equipment/sync-stock` upserts it into a new `products.mtrl_id` column. This is what section 4's order-sync needs to build `ITELINES` (`setData` requires the numeric `MTRL`, not the text product code).

## 4c. Admin roles + ownership-based reservation permissions — built 2026-07-27

User: architects should only be able to edit/delete their **own** reservations (not each other's, as the original shared-Airtable-editing model allowed), except `giorgos@palerosbay.com`, who should have full admin rights over everything.

- `profiles.role` (`'architect'` default, or `'admin'`) added via `migration_002_admin_rls_softone.sql`.
- RLS policies on `reservations` for insert/update/delete changed from "any authenticated user" to `architect_id = auth.uid() OR is_admin()` (new `is_admin()` SQL function checking `profiles.role`).
- `giorgos@palerosbay.com` already existed as a real Supabase Auth user (along with several others created since the last session: `elina@woodandstone.gr`, `leo@`/`irene@`/`alex@`/`pavlos@`/`elli@palerosdreamhomes.com`, `base@palerosbay.com`, `george@agop.pro` — team is actively self-provisioning accounts) — migration grants admin role to their existing user id (`ecca4e7b-2c74-48cb-b609-1528687c1818`).
- Frontend (`AuthContext.tsx`) exposes `isAdmin`; `Reservations.tsx` hides the Edit/Delete buttons entirely for rows the current user doesn't own (unless admin) rather than showing controls that would just fail against RLS.
- **Blocked on the same pending migration as 4/order-sync** — not live until `migration_002_admin_rls_softone.sql` is run.

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
- Scaffolded the app (package.json, vite.config.ts, tsconfig.json, index.html, vercel.json, `.env.example`/`.env.local`) following the `softone-live` convention (React 18 + Vite 4 + AntD 5, own local `node_modules`, port 5180).
- Built `src/`: `lib/supabase.ts` (client), `lib/AuthContext.tsx` (session + profile), `App.tsx` (routes + auth guard), `components/Layout.tsx` (header nav matching the original MASTER CATALOG / RESERVATIONS buttons), `pages/Login.tsx`, `pages/Catalog.tsx` (search/category/supplier filters, paginated grid, live availability from the `product_availability` view), `components/ReserveModal.tsx` (reserve qty against an existing or newly-typed OIK project code), `pages/Reservations.tsx` (search/filter by project+architect, inline qty edit, delete, CSV export).
- `npm install` run inside the app folder (self-contained `node_modules`); this also registered the app as an npm workspace member in the **monorepo root's** `package-lock.json` (expected — same thing already happened for `ws-inventory-report`/`softone-live`; not committed as part of this app's repo, that's the parent repo's concern).
- Fixed one build error (`ImportMeta.env` typing — added standard `src/vite-env.d.ts`). `npm run build` succeeds; `npm run dev` boots cleanly on :5180 (verified via curl, not yet clicked through in a real browser since the Supabase tables don't exist until the user runs `schema.sql`).
- Committed and pushed app code (2nd commit). Verified images resolve live via jsDelivr (`curl -I` on `A7642BB.png` → 200).
- **What's left for the user** (see final chat message for full instructions): run `supabase/schema.sql`, import the 3 CSVs in `supabase-import/` via Supabase Studio (products → projects → reservations, in that FK order), create 7 Supabase Auth users (need real email addresses — not in the source data), set `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in Vercel project settings if not already there.
- Remaining open items: SoftOne ΠΑΛ-ΑΝ0026 order-sync (section 4, not started) and email-on-reservation (section 5, explicit phase 2).

### 2026-07-27 (continued) — Admin roles, ownership RLS, order-sync built, UI fixes

- UI fixes: catalog's "Sync SoftOne stock" button moved to the right of the toolbar + confirm dialog; Reservations photos 90px; Catalog switched pagination → infinite scroll (IntersectionObserver).
- User corrected an earlier assumption: pushed back that `stock_softone` (old Airtable field) was already correct — live arithmetic check (`SoRemQty1=18, V15=70, V21=-52`, `18−70=−52`) settled it: `V21`/ΔΙΑΘΕΣΙΜΑ is correct, confirmed by user after seeing the numbers.
- User's own insight, worth remembering: once the order-sync (section 4) is live, SoftOne's own Δεσμευμένα will include our mirrored reservation lines automatically — so `stock_softone`/V21 ends up reflecting our own reservations too, no extra plumbing needed for that.
- **SoftOne write API investigated and confirmed working** — see section 4. Official BlackBook docs (`SoftOne BlackBook ENG ver.3.5.pdf`, user dropped it into the repo root — gitignored, proprietary vendor docs, not meant for the public repo) plus a live empirical test against ΠΑΛ-ΑΝ0026 itself (with user's explicit go-ahead) nailed down the exact `LINENUM`/full-replace semantics.
- **User set the critical safety rule** (now at the top of this file): SoftOne writes may only ever target ΠΑΛ-ΑΝ0026/FINDOC 45911, no other document, ever — ΑΑΔΕ/legal exposure otherwise. Implemented as a hardcoded, non-parameterized target in `softone.py`, not a runtime check.
- Built and deployed: `POST /api/equipment/sync-order` (order-sync, section 4) and admin roles + ownership-based RLS (section 4c) — both on `softone-live-backend` / this app's schema respectively. Both **blocked on `migration_002_admin_rls_softone.sql`** being run — not yet done as of this entry. Verified the backend fails cleanly (not a crash) in this pending state.
- **Bug caught by user while testing live**: Edit/Delete buttons disappeared for everyone. Root cause: all 121 imported reservations have `architect_id = NULL` (CSV import only had text names), so the new ownership check correctly hid buttons for rows nobody's linked to — expected given the migration hasn't run, but needed a backfill so it resolves itself once it does. Added a `UPDATE ... WHERE architect_id IS NULL AND lower(architect_name) = lower(profiles.full_name)` step to the migration — auto-links ALEX/ELINA/ELLI's historical reservations to their now-existing real accounts (`alex@palerosdreamhomes.com` etc.); CAROLIN/KONSTANTINOS/NIKI/VASIA stay admin-only-editable until they get real accounts too.
- Deploy notes: redeployed `softone-live-backend` twice more this session (MTRL capture + order-sync endpoint) — used `docker build --no-cache` after purging `__pycache__` both times per the gotcha logged in `softone-live-handoff.md`, no repeat of that bug.
- **What's left for the user right now**: run `supabase/migration_002_admin_rls_softone.sql` in the SQL Editor — this is blocking three features at once (admin roles, per-architect edit permissions, and the order-sync). After that, run the "Sync SoftOne stock" button once to backfill `mtrl_id` for all products before the order-sync can build real lines for existing reservations.
- Also queued, not started: single "add product" flow (enter code, auto-fill from SoftOne via exact-code lookup, upload image) and bulk product import (Excel of codes + drag-drop images matched by `<code>.jpg` filename).
