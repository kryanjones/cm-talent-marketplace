# Collective Media — Talent Marketplace

A proprietary web platform that lets advertising and sponsorship buyers discover the
journalists and creators Collective Media represents, design custom sponsorship
bundles, and see real reach and engagement math — including a deduplicated-reach
estimate — behind those bundles.

It has three access points, all driven by one data model:

1. **Discover** (`/`) — the buyer experience. Filter creators, build a bundle of
   creators and individual channels, and watch per-component and aggregate reach
   update live. No rate cards; pricing is "request pricing."
2. **Sales** (`/sales`) — internal. Everything buyers see plus rate cards,
   inventory/availability, lead times, past partners, exclusivities, the application
   vetting queue, and the bundles buyers have saved.
3. **Apply** (`/apply`) — the public creator application flow with a stubbed
   application fee. Submissions land as `Pending Review` and are approved/rejected
   from the Sales desk.

---

## Tech stack

- **Next.js (App Router) + TypeScript**
- **Tailwind CSS**, themed entirely from `BRAND.md` tokens via a CSS-variable layer
- **Framer Motion** for the motion layer (card enter/exit, filter transitions,
  count-ups, panel reveals)
- **Airtable** as the editable backend/CMS, accessed **only** through server-side code
- Deployable to **Vercel**

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in Airtable creds (optional — see below)
npm run dev                        # http://localhost:3000
```

### Runs with no credentials

If `AIRTABLE_API_KEY` is unset, the app automatically falls back to the **local seed
dataset** in `/data` (generated from `CM_Seed_Data_Review.xlsx`: 200 creators, 652
channels, 200 brand-boundary records, 3 overlap coefficients). A banner on Discover
indicates when local data is in use.

In local mode, writes (applications, approvals, saved bundles) are persisted to a
gitignored overlay at `data/runtime.json`, so the application → vetting → live
inventory flow is fully demonstrable. Delete that file to reset to the pristine seed.

---

## Environment variables

Create `.env.local` (never commit it):

| Variable | Required | Purpose |
|---|---|---|
| `AIRTABLE_API_KEY` | for live data | Personal Access Token, scoped to `data.records:read` + `data.records:write` on the base only. **Server-side only.** |
| `AIRTABLE_BASE_ID` | for live data | The base ID (`app…`). |
| `AIRTABLE_TABLE_*` | optional | Override table names if they differ from the defaults (`Creators`, `Channels`, `Brand Boundaries`, `Overlap Assumptions`, `Saved Bundles`). |
| `DATA_SOURCE` | optional | Force `local` or `airtable`. Defaults to auto (Airtable if creds present, else local). |
| `SITE_PASSWORD` | optional | If set, the **entire site** is behind one shared password (via `middleware.ts` → `/gate`). Use this to lock a private/preview deployment. Unset = open. |
| `SALES_ACCESS_PASSWORD` | optional | If set, `/sales` requires this password (on top of the site gate). If unset, the route is open. |
| `ADMIN_ACCESS_PASSWORD` | optional | Same gate, admin role. |

> **Security:** the Airtable key is read only inside `lib/data/airtable.ts`, which
> imports `server-only`. All Airtable traffic flows through server components and the
> API routes under `app/api/*`. The key is never sent to the browser — verified by the
> production build (the key does not appear in any client chunk).

---

## How the Airtable schema maps to the app

The data layer (`lib/data`) maps Airtable records into the domain types in
`lib/types.ts`, joining creators to channels and boundaries in `loadAll()`.

**The live base's actual shape (differs from the original spec — the code matches the
live base, which is the source of truth):**

- The **Creators** table holds ~852 rows: the **200 real creators** (each has a
  `Creator ID`; all `Active`) plus ~652 auto-created "channel proxy" rows
  (`Name = "Person — Platform"`, only `Name` + `Channels`). The adapter keeps only
  rows that have a `Creator ID` or a `Status` and ignores the proxy rows.
- **`Channels.Creator` is a plain text creator name** (e.g. `"Lila Cho"`), so channels
  join to creators **by name**. (`Channel Name` is itself a linked-record field, so the
  display name is reconstructed as `"Creator — Platform"`.)
- **`Brand Boundaries.Creator` is a linked record**, so boundaries join **by record id**.

The adapter (`mapChannel`) supports both a text-name `Creator` and a linked-record
`Creator`, so it keeps working if that field is later converted to a link.

| Airtable table | Domain type | Notes |
|---|---|---|
| `Creators` | `Creator` | `Headshot` is an attachment; `Prior Outlets`, `Primary Beat`, `Trust Signals`, `Category Affinities` are multi-selects. |
| `Channels` | `Channel` | One row per platform per creator. `Avg Engagement Rate` is a fraction (0.046 = 4.6%). `Audience Age Bands`, `Audience Gender Split`, `Rate Card` are JSON in long-text fields. `Rate Card` is **stripped server-side** before reaching the buyer. |
| `Brand Boundaries` | `BrandBoundary` | `Past Brand Partners` and `Active Exclusivities` are **sales-only** and stripped for the buyer. |
| `Overlap Assumptions` | `OverlapAssumption` | Drives the deduplicated-reach math; tunable without code changes. |
| `Saved Bundles` (optional) | `SavedBundle` | What buyers assemble; `Components` stored as JSON. |

Editing a record in Airtable changes the front-end on the next request (buyer and
sales routes are `force-dynamic`; the adapter caches reads for ~30s).

### Swapping the backend later

Everything reads through `lib/data/index.ts`. To move to Supabase/Postgres, implement
the `DataAdapter` interface (`lib/data/adapter.ts`) once and point `pickAdapter()` at
it — components, API routes, and business logic are untouched.

---

## The reach math

`lib/reach.ts` → `calculateBundleReach(components, coefficients)`:

- **Gross** = sum of each channel's reach.
- **Net (estimated, deduplicated)** = an incremental model: components are ordered by
  raw reach; each contributes `reach × (1 − strongest overlap with what's already
  counted)`. Overlap is the strongest applicable coefficient between two components:
  - same creator, cross-platform → highest (default 30%)
  - different creators sharing a beat/affinity → moderate (default 15%)
  - unrelated → lowest (default 5%)
- Also returns implied overlap %, reach-weighted blended engagement, combined formats,
  a demographic composite, and the geographic footprint.

The net figure is always **labeled an estimate** in the UI. Coefficients live in the
`Overlap Assumptions` table, so they're tunable without code; swap `overlapFractionFor`
for real overlap data later and the rest of the pipeline is unchanged.

The **recommendation engine** (`lib/recommend.ts`) scores creators not yet in the
bundle by incremental deduplicated reach, category coherence/diversification, a
budget-efficiency proxy, and demographic/geo gap-filling — weighted by the buyer's goal
(Maximize Reach, Fit Budget, Tighten Category, Expand Audience). It returns the top
three with one-line reasons and respects brand boundaries (never recommends a creator
whose no-go categories conflict with an active category filter; flags exclusivities).

---

## How to add a creator

- **Via the app:** go to `/apply`, submit the form (pay the stubbed fee), then approve
  it from `/sales` → Applications. Approved creators become live and appear on Discover.
- **Directly in Airtable:** add a row to `Creators` with `Status = Active`, link its
  `Channels` and `Brand Boundaries`, and it appears on the next request. Only `Active`
  creators show in the buyer array.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel (framework auto-detected as Next.js).
3. Add the environment variables above in **Project → Settings → Environment Variables**
   (at minimum `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID`; optionally the access
   passwords). Add them for Production and Preview.
4. Deploy. No build configuration is required.

> If you deploy without Airtable creds, the app serves the bundled local seed dataset.
> Note that local-mode writes use the serverless filesystem and are ephemeral on
> Vercel — connect Airtable for durable writes.

---

## Project structure

```
app/
  page.tsx            Buyer (Discover) — server component, fetches sanitized data
  sales/page.tsx      Sales desk (gated)
  apply/page.tsx      Public creator application
  api/                Server routes (applications, status, bundles, unlock)
components/
  buyer/              Array, filters, cards, bundle panel, recommendations
  sales/              Inventory, vetting queue, saved bundles, access gate
  ui.tsx              Shared editorial primitives
lib/
  data/               Swappable data layer (index, adapter, airtable, local)
  reach.ts            Bundle reach math
  recommend.ts        Rules-based recommendation engine
  types.ts            Domain types (the contract)
data/                 Local seed JSON (from CM_Seed_Data_Review.xlsx)
BRAND.md              Design tokens — visual source of truth
```

All personas and metrics in the seed set are fictional, for demonstration only.
