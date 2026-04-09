# MAIT — Meta Ads Intelligence Tool

NIMA Digital · internal SaaS for Meta competitive intelligence, creative library, and performance analytics.

> Stack: **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Apify**

---

## 1. Quick start

```bash
cd mait
cp .env.example .env.local   # already populated with shared NIMA Supabase creds
# fill APIFY_API_TOKEN before running scrapes
npm run dev
```

Open http://localhost:3000

## 2. Database setup

The schema lives in `supabase/migrations/0001_init.sql`. **All tables are
prefixed `mait_`** so the app can coexist with other NIMA projects on the same
Supabase instance.

Run it once via the Supabase SQL editor:

1. Open https://supabase.com/dashboard/project/ovwdjablkqkvhxtzrxmy/sql
2. Paste the contents of `supabase/migrations/0001_init.sql`
3. Run

After that, register at `/register` — the bootstrap endpoint creates a
workspace and assigns the first user as `admin`.

> ⚠️ The current `.env.local` points at the **shared** `nima-digital` Supabase
> project. To migrate to a dedicated MAIT project later, just create a new
> Supabase project, run the same migration, and swap the env vars.

## 3. Environment variables

| Var                              | Required | Notes                                                              |
| -------------------------------- | -------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | yes      | Supabase project URL                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | yes      | Public anon key                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`      | yes      | Server-only. Used by `/api/auth/bootstrap` and `/api/apify/scan`.  |
| `APIFY_API_TOKEN`                | yes\*    | \* required only to actually run scrapes                           |
| `APIFY_ACTOR_ID`                 | no       | Defaults to `apify/meta-ads-scraper`. Swap to a cheaper alternative if needed. |
| `META_APP_ID` / `META_APP_SECRET`| Phase 1.1| For Meta Marketing API OAuth                                       |

## 4. What's included (MVP — sezione 9 del brief)

- ✅ Email/password Auth (Supabase Auth + cookie session)
- ✅ Workspace bootstrap on first login
- ✅ 4 ruoli (`super_admin`, `admin`, `analyst`, `viewer`) — RLS enforced
- ✅ CRUD competitor (URL pagina Facebook → page_id auto-detected)
- ✅ Scan on-demand via Apify (`POST /api/apify/scan`)
- ✅ Lista ads per competitor con preview cards
- ✅ Dashboard overview (counters, latest ads, top competitor)
- ✅ Creative Library (basic grid)
- ✅ Alerts feed
- ✅ CSV export (`/api/export/ads.csv?competitor_id=…`)
- ✅ Dark / gold NIMA theme

### Phase 1.1 (Should Have) — _placeholder pages presenti_

- Scheduling automatico Apify (cron)
- Search & filtri Creative Library
- Meta OAuth + Performance Analytics
- AI tagging (Anthropic)

## 5. Project layout

```
src/
├── app/
│   ├── (auth)/           login + register
│   ├── (dashboard)/      protected app (sidebar layout)
│   │   ├── dashboard/    overview
│   │   ├── competitors/  list + new + [id] detail
│   │   ├── library/      creative library
│   │   ├── analytics/    performance (Phase 1.1)
│   │   ├── benchmarks/   (Phase 2)
│   │   ├── alerts/
│   │   └── settings/
│   └── api/
│       ├── auth/         bootstrap + signout
│       ├── competitors/  CRUD
│       ├── apify/scan/   trigger scrape
│       └── export/       CSV
├── components/
│   ├── ui/               button, card, input, label, badge
│   ├── layout/           sidebar, header
│   └── ads/              ad-card
├── lib/
│   ├── supabase/         browser, server, admin clients
│   ├── apify/            service layer (actor → normalized rows)
│   ├── meta/             URL parsers + Ad Library URL builder
│   └── auth/session.ts   getSessionUser helper
├── types/                shared TS interfaces
└── proxy.ts              auth proxy (Next.js 16 — replaces middleware.ts)
```

> **Next.js 16 note**: middleware was renamed to **proxy**. The file is
> `src/proxy.ts` and exports a `proxy()` function. This is intentional, not a typo.

## 6. Trigger a scan manually

```bash
curl -X POST http://localhost:3000/api/apify/scan \
  -H 'content-type: application/json' \
  -H 'cookie: <copy from browser devtools after login>' \
  -d '{ "competitor_id": "<uuid>", "max_items": 200 }'
```

The endpoint:
1. Validates ownership via RLS-aware Supabase server client
2. Inserts a `mait_scrape_jobs` row (`status=running`)
3. Calls the Apify actor and waits for completion (max 5 min)
4. Upserts results into `mait_ads_external` (dedup by `workspace_id + ad_archive_id`)
5. Updates job status, competitor `last_scraped_at`, emits an alert

## 7. Deployment

Deploy to Vercel with the same env vars. The Apify scan route declares
`maxDuration = 300` (Vercel Pro). On Hobby cap it at 60s and use a smaller
`max_items`, or move scraping to a background job (Apify scheduler / Edge
Function — Phase 1.1).

## 8. Out of scope (intentionally)

The following items from the brief are **not** in this MVP and were left for
later phases per the prioritization in section 9 of the brief:

- Apify scheduling (cron) — wire up via `pg_cron` or Apify Scheduler
- Meta Marketing API OAuth + sync (Pipeline B)
- Storage of media in Supabase Storage (currently we keep the original CDN URL)
- AI tagging via Anthropic
- PDF report generation
- Webhook / Slack integration
- Benchmarking dashboard

---

© NIMA Digital Consulting FZCO
