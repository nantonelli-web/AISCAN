# META ADS INTELLIGENCE TOOL (MAIT)

## Development Brief for Claude Code

**NIMA Digital Consulting FZCO** — Dubai Digital Park, Silicon Oasis
Aprile 2026 · Confidenziale

---

## 1. Executive Summary

Questo documento descrive le specifiche per lo sviluppo di un applicativo web "Meta Ads Intelligence Tool" (nome in codice: **MAIT**), una piattaforma SaaS interna di NIMA Digital che consente di raccogliere, analizzare e visualizzare dati pubblicitari dall'ecosistema Meta (Facebook, Instagram, Messenger, Audience Network).

Il tool si basa su **Apify** come layer di data extraction dalla Meta Ad Library (dati pubblici), integrato con le **API ufficiali Meta Marketing** per gli account di proprietà/gestiti. L'obiettivo è offrire ai clienti NIMA e al team interno una dashboard unificata per competitive intelligence, analisi performance e benchmarking creativo.

### Obiettivi chiave

- **Competitive Intelligence:** monitoraggio automatico delle creatività, copy e strategie adv dei competitor dei clienti NIMA
- **Performance Analytics:** visualizzazione KPI campagne gestite (dati interni via Meta Marketing API)
- **Creative Library:** archivio searchable di tutte le ads scrappate con filtri per industry, format, CTA, periodo
- **Benchmarking:** confronto performance proprie vs. stime di mercato e pattern competitor
- **Alerting:** notifiche su nuove campagne competitor, cambi di strategia, trend emergenti

---

## 2. Architettura Tecnica

### 2.1 Tech Stack

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui + Recharts per dashboard/grafici |
| Backend | Next.js API Routes (serverless), tRPC o REST |
| Database | Supabase (PostgreSQL) con Row Level Security |
| Auth | Supabase Auth (email + social login) |
| Data Extraction | Apify SDK (Node.js) + Meta Marketing API |
| Job Queue | Supabase Edge Functions + pg_cron / Apify Scheduler |
| Storage | Supabase Storage (media creatività scaricate) |
| Deploy | Vercel (frontend) + Supabase (backend/DB) |

### 2.2 Data Flow

Il sistema opera con due pipeline parallele di raccolta dati:

#### Pipeline A — Dati Esterni (Apify)

Raccolta dati pubblici dalla Meta Ad Library tramite Apify Actors. Questi dati sono accessibili senza autenticazione Meta e includono tutte le ads attive (e inattive fino a 7 anni per political ads) pubblicate su qualsiasi piattaforma Meta.

- L'utente admin configura i "monitor" (brand/competitor da tracciare)
- Un job schedulato (giornaliero/settimanale) lancia gli Apify Actors
- I risultati vengono normalizzati e salvati su Supabase
- Le creatività (immagini/video) vengono scaricate in Supabase Storage
- La deduplicazione avviene tramite hash dell'ad ID Meta

#### Pipeline B — Dati Interni (Meta Marketing API)

Per gli account ads gestiti da NIMA, connessione diretta via Meta Marketing API (Graph API v19+) con token di accesso Business Manager. Questo fornisce dati granulari non disponibili pubblicamente.

- Connessione OAuth tramite Facebook Login for Business
- Accesso a: Ad Account Insights, Campaign/AdSet/Ad level metrics
- Metriche: spend, impressions, reach, CPM, CPC, CTR, conversions, ROAS
- Breakdown per: età, genere, placement, device, region, ora del giorno
- Sync automatico ogni 6 ore per dati del giorno corrente

---

## 3. Dati Disponibili via Apify

Gli Actors Apify per la Meta Ad Library restituiscono dati strutturati in JSON.

### 3.1 Dati Ad-Level (per ogni singola ad)

| Campo | Descrizione | Note |
|-------|------------|------|
| `adId` / `adArchiveID` | ID univoco dell'ad nella library | Chiave primaria per dedup |
| `adText` / `body` | Copy testuale dell'ad (primary text) | Analizzabile per pattern/keyword |
| `headline` | Titolo dell'ad | Spesso assente in formato Stories |
| `description` | Descrizione aggiuntiva | Link description sotto il titolo |
| `callToAction` / `CTA` | Tipo di CTA (Shop Now, Learn More…) | Mappabile a obiettivi campagna |
| `originalImageUrl` | URL immagine originale | Da scaricare e archiviare |
| `videoSdUrl` / `videoHdUrl` | URL video SD e HD | Se disponibile |
| `linkUrl` / `landingPage` | URL di destinazione dell'ad | Utile per analisi funnel |
| `startDate` / `endDate` | Date di attivazione/disattivazione | Per calcolo durata campagna |
| `publisherPlatforms` | Piattaforme (FB, IG, Messenger…) | Array multiplo |
| `adStatus` | ACTIVE / INACTIVE | Derivato dal filtro di ricerca |
| `languages` | Lingue rilevate nella creatività | Es. `["en", "ar"]` |
| `impressions` (range) | Range di impressioni stimate | Solo per political/special ads |
| `spend` (range) | Range di spesa stimata | Solo per political/special ads |

### 3.2 Dati Advertiser-Level

| Campo | Descrizione |
|-------|------------|
| `pageName` | Nome della pagina Facebook |
| `pageId` | ID numerico della pagina |
| `pageCategory` | Categoria (E-Commerce, Fashion, etc.) |
| `pageLikes` | Numero di like della pagina |
| `pageVerified` | Status di verifica (blue badge) |
| `instagramUsername` | Handle Instagram collegato |
| `instagramFollowers` | Follower del profilo IG collegato |
| `country` | Paese dell'advertiser |

### 3.3 Pricing Apify per Meta Ads

Il modello di costo Apify si articola su due livelli: abbonamento piattaforma + costo per Actor.

| Piano | Costo/mese | Crediti inclusi | Uso stimato |
|-------|-----------|----------------|-------------|
| Free | $0 | $5 crediti | ~850 ads/mese |
| Starter | $29/mese | $29 crediti | ~10.000 ads/mese |
| Scale | $199/mese | $199 crediti | ~50K-80K ads/mese |
| Business | $999/mese | $999 crediti | Volume enterprise |

**Actor consigliato:** `apify/scrapers/meta-ads` (Meta Ads Scraper) — modello pay-per-result a $1.50/1.000 ads (piano Free) fino a $3.40-5.80/1.000 ads. Alternativa più economica: `leadsbrary/meta-ads-library-scraper` a $1.50/1.000 ads fisso.

**Stima costi per NIMA:** Monitorando 20 competitor con ~100 ads attive ciascuno, aggiornamento settimanale = ~8.000 ads/mese ≈ $12-29/mese di costi Apify. Piano Starter ($29) sufficiente per la fase iniziale.

---

## 4. Funzionalità del Tool

### 4.1 Dashboard Principale

La dashboard è il punto di ingresso dell'utente e mostra una panoramica aggregata:

- Conteggio totale ads monitorate (attive/inattive)
- Numero di brand/competitor tracciati
- Trend volume ads negli ultimi 30/60/90 giorni (area chart)
- Top 5 competitor per volume ads attive
- Distribuzione ads per piattaforma (FB, IG, Messenger, etc.)
- Feed "Latest Ads" con preview creatività in tempo reale
- Alert badge per nuove campagne rilevate dall'ultimo sync

### 4.2 Competitor Monitor

Sezione dedicata al monitoraggio sistematico dei competitor.

**Setup Monitor:**
- Aggiunta competitor tramite URL pagina Facebook o ricerca per nome
- Assegnazione a un "gruppo" / progetto cliente
- Configurazione frequenza di scraping (giornaliera/settimanale/on-demand)
- Filtri: country, lingua, tipo di ad, status (active/all), piattaforma

**Vista Competitor:**
- Timeline di tutte le ads del competitor (sortable per data, durata, piattaforma)
- Preview card con immagine/video, copy, CTA, landing page
- Indicatore di durata campagna (ads attive da lungo = evergreen content)
- Confronto side-by-side tra 2+ competitor
- Export dataset in CSV/Excel

### 4.3 Creative Library

Archivio centralizzato e searchable di tutte le creatività raccolte:

- Ricerca full-text su copy, headline, description
- Filtri: brand, data, formato (image/video/carousel), piattaforma, CTA type, lingua
- Vista griglia (Pinterest-like) e vista lista
- Tag manuali e automatici (AI-powered tramite Claude API per categorizzazione)
- Download singolo o bulk delle creatività
- Collezioni/board per organizzare ads di ispirazione

### 4.4 Performance Analytics (Account Interni)

Per gli account Meta Ads collegati tramite OAuth (clienti NIMA gestiti in agenzia):

- Overview: spend totale, impressions, reach, CPM, CPC, CTR, conversioni, ROAS
- Trend temporale con granularità giorno/settimana/mese
- Breakdown per: campaign, ad set, singola ad
- Breakdown per: placement, device, età, genere, regione
- Top performing ads con preview creatività
- Anomaly detection: alert su cali/spike improvvisi di performance
- Comparazione periodo vs. periodo (es. mese corrente vs. precedente)

### 4.5 Benchmarking

Confronto tra dati interni e pattern di mercato rilevati dallo scraping competitor:

- Volume ads: quante ads attive hai vs. media competitor
- Frequency: quanto spesso i competitor cambiano creatività
- Format mix: distribuzione image vs. video vs. carousel (tu vs. mercato)
- CTA analysis: quali CTA usano i competitor nel tuo settore
- Copy length analysis: lunghezza media testi ads nel settore
- Landing page patterns: dove mandano il traffico (PDP, collection, homepage)

### 4.6 Alerting & Reporting

- Notifiche email/in-app quando un competitor lancia nuove ads
- Weekly digest automatico con summary delle novità
- Report PDF esportabile con grafici e dati chiave (per presentazioni clienti)
- Webhook per integrazione con Slack/n8n/Make

---

## 5. Ruoli e Permessi

| Ruolo | Permessi | Destinatari |
|-------|---------|-------------|
| **Super Admin** | Tutto. Gestione tenant, billing, config Apify, gestione utenti globale, accesso a tutti i workspace. | Nik, Marina (NIMA core team) |
| **Admin** | Gestione workspace proprio: aggiunta competitor, connessione account Meta, gestione utenti del proprio workspace, config schedule, export dati. | Account manager NIMA per ogni cliente |
| **Analyst** | Accesso completo in lettura: dashboard, creative library, analytics, benchmarking. Export dati. Non può aggiungere/rimuovere competitor o modificare config. | Analisti NIMA, team marketing cliente |
| **Viewer** | Solo visualizzazione dashboard e report pre-configurati. No export raw data, no accesso creative library dettagliata. | C-level clienti, stakeholder esterni |

### Multi-tenancy

Ogni cliente NIMA opera in un "workspace" isolato. I dati tra workspace non sono mai condivisi. La Creative Library può avere una sezione "cross-workspace" (solo per Super Admin) per analisi trasversali. Il modello si basa su Row Level Security (RLS) di Supabase con `workspace_id` come discriminante.

---

## 6. Casi d'Uso Business

### 6.1 Onboarding nuovo cliente NIMA

Quando NIMA acquisisce un nuovo cliente per la gestione Meta Ads:

- Creazione workspace dedicato
- Setup monitor competitor (5-10 brand del settore)
- Prima scansione completa: storico ads attive di tutti i competitor
- Connessione account Meta Ads del cliente via OAuth
- Generazione report "Competitive Landscape" iniziale da presentare al cliente

### 6.2 Pitch commerciale / New Business

Prima ancora di acquisire il cliente, il tool può essere usato per:

- Screening delle ads attive del prospect (cosa stanno facendo ora?)
- Analisi dei competitor del prospect come "valore aggiunto" nella proposta
- Presentazione di insight concreti durante il pitch ("i vostri competitor stanno investendo pesantemente su video format")
- Differenziazione del servizio NIMA rispetto ad agenzie che non offrono competitive intelligence

### 6.3 Ottimizzazione campagne ongoing

Durante la gestione quotidiana delle campagne:

- Ispirazione creativa: cosa funziona nel mercato? Quali format/CTA stanno usando i top performer?
- Validazione strategia: il cliente vuole fare solo immagini statiche, ma tutti i competitor stanno pushando Reels → dato oggettivo per convincerlo
- Timing: i competitor lanciano campagne stagionali prima? Dopo? Quanto durano?
- Budget intelligence: per special ads (political/housing), stime di spend competitor visibili

### 6.4 Reporting cliente mensile

Generazione automatica del report mensile con:

- Performance KPI delle campagne gestite (dati interni)
- Sezione "Competitive Intelligence" con novità competitor
- Benchmark: come performiamo vs. mercato
- Raccomandazioni data-driven per il mese successivo

### 6.5 Industry Research

Ricerca per settore (non per singolo competitor) per identificare trend macro:

- Scraping per keyword ("luxury handbag", "skincare routine") anziché per pagina
- Analisi trend format creativi nel settore
- Mappatura nuovi player che stanno investendo in ads
- Intelligence per content strategy dei clienti

---

## 7. Schema Database (Supabase)

Schema essenziale — da espandere durante lo sviluppo. Tutte le tabelle includono `workspace_id` per RLS.

### Tabelle principali

- **workspaces:** `id`, `name`, `slug`, `created_at`, `settings` (JSONB)
- **users:** `id`, `email`, `name`, `role` (super_admin|admin|analyst|viewer), `workspace_id`, `created_at`
- **competitors:** `id`, `workspace_id`, `page_name`, `page_id`, `page_url`, `category`, `country`, `monitor_config` (JSONB), `last_scraped_at`
- **ads_external:** `id`, `workspace_id`, `competitor_id`, `ad_archive_id` (unique), `ad_text`, `headline`, `description`, `cta`, `image_url`, `video_url`, `landing_url`, `platforms` (array), `languages` (array), `start_date`, `end_date`, `status`, `raw_data` (JSONB), `created_at`
- **ads_media:** `id`, `ad_id`, `media_type`, `storage_path`, `original_url`, `downloaded_at`
- **meta_accounts:** `id`, `workspace_id`, `account_id`, `account_name`, `access_token` (encrypted), `token_expires_at`, `last_synced_at`
- **ads_internal:** `id`, `workspace_id`, `meta_account_id`, `campaign_id`, `adset_id`, `ad_id`, `ad_name`, `creative_url`, `metrics` (JSONB: spend/impressions/clicks/conversions/etc.), `date`, `breakdowns` (JSONB), `fetched_at`
- **scrape_jobs:** `id`, `workspace_id`, `competitor_id`, `apify_run_id`, `status`, `started_at`, `completed_at`, `records_count`, `cost_cu`
- **alerts:** `id`, `workspace_id`, `type`, `competitor_id`, `message`, `read`, `created_at`
- **tags:** `id`, `name`, `workspace_id` — relazione M:N con ads_external via `ads_tags`
- **collections:** `id`, `workspace_id`, `name`, `description`, `user_id` — relazione M:N con ads_external via `collection_ads`

---

## 8. Integrazione Apify — Dettaglio Tecnico

### 8.1 Actor Selection

L'Actor principale raccomandato è `apify/scrapers/meta-ads` (Meta Ads Scraper ufficiale Apify) con modello pay-per-result. Caratteristiche chiave:

- Input: singola URL di Meta Ad Library o URL pagina Facebook
- Output: JSON strutturato con tutti i campi descritti nella sezione 3
- Non richiede login Meta o cookies
- Supporta filtri nativi: country, lingua, tipo ad, status, piattaforma, formato
- Scraping in tempo reale (non cache)
- Supporta scheduling nativo Apify

### 8.2 Flusso di Integrazione

Implementare un service layer (`apify.service.ts`) che gestisce:

- Lancio run Actor con parametri dinamici (URL, filtri)
- Polling status run (o webhook callback)
- Fetch risultati dal dataset Apify
- Normalizzazione dati nel formato del nostro DB
- Deduplicazione tramite `ad_archive_id`
- Download e storage media (immagini/video) in Supabase Storage
- Logging costi (CU consumati per run) nella tabella `scrape_jobs`

### 8.3 Esempio Chiamata API

```typescript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// Lancio scraping per un competitor
async function scrapeCompetitorAds(competitorAdLibraryUrl: string, maxItems = 200) {
  const run = await client.actor('apify/scrapers/meta-ads').call({
    startUrls: [{ url: competitorAdLibraryUrl }],
    maxItems,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // Normalizza e salva su Supabase
  for (const ad of items) {
    await upsertAd({
      ad_archive_id: ad.adArchiveID,
      ad_text: ad.adText || ad.body,
      headline: ad.headline,
      description: ad.description,
      cta: ad.callToAction,
      image_url: ad.originalImageUrl,
      video_url: ad.videoHdUrl || ad.videoSdUrl,
      landing_url: ad.linkUrl,
      platforms: ad.publisherPlatforms,
      languages: ad.languages,
      start_date: ad.startDate,
      end_date: ad.endDate,
      status: ad.adStatus,
      raw_data: ad,
    });
  }

  return items.length;
}
```

---

## 9. Scope MVP (Phase 1)

Per il lancio iniziale, le feature sono prioritizzate come segue:

### Must Have (MVP)

- Auth con email/password (Supabase Auth)
- Creazione workspace + gestione utenti con 4 ruoli
- Aggiunta competitor (URL pagina Facebook)
- Scraping on-demand via Apify (bottone "Scan Now")
- Visualizzazione lista ads per competitor con preview
- Dashboard con conteggi base e ultimi ads rilevati
- Export CSV/Excel

### Should Have (Phase 1.1)

- Scheduling automatico scraping (giornaliero/settimanale)
- Creative Library con ricerca full-text e filtri
- Alert in-app per nuove ads rilevate
- Connessione account Meta via OAuth (Pipeline B)
- Performance analytics base per account interni

### Nice to Have (Phase 2)

- AI tagging creatività (via Claude API)
- Benchmarking dashboard
- Report PDF automatico
- Webhook/Slack integration per alert
- Ricerca per keyword (non solo per pagina)
- Analisi sentiment copy ads

---

## 10. Note per Claude Code

### 10.1 Setup Progetto

```bash
npx create-next-app@latest mait --typescript --tailwind --app --src-dir
```

Dipendenze principali:

```bash
npm install @supabase/supabase-js apify-client recharts date-fns zod lucide-react
npx shadcn-ui@latest init
```

Struttura cartelle:

```
src/
├── app/
│   ├── (auth)/          # Login, register, forgot-password
│   ├── (dashboard)/     # Layout con sidebar
│   │   ├── dashboard/   # Overview principale
│   │   ├── competitors/ # Lista + detail competitor
│   │   ├── library/     # Creative library
│   │   ├── analytics/   # Performance analytics (account interni)
│   │   ├── benchmarks/  # Benchmarking
│   │   ├── alerts/      # Centro notifiche
│   │   └── settings/    # Workspace, utenti, connessioni, billing
│   └── api/
│       ├── apify/       # Webhook + trigger scraping
│       ├── meta/        # OAuth callback + sync
│       └── cron/        # Edge functions per scheduling
├── lib/
│   ├── supabase/        # Client, types, queries
│   ├── apify/           # Service layer Apify
│   ├── meta/            # Service layer Meta Marketing API
│   └── utils/           # Helpers, formatters, validators
├── components/
│   ├── ui/              # shadcn components
│   ├── dashboard/       # Widget, chart components
│   ├── ads/             # AdCard, AdGrid, AdDetail
│   └── layout/          # Sidebar, Header, RoleGuard
└── types/               # TypeScript interfaces
```

### 10.2 Variabili Environment

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APIFY_API_TOKEN=
META_APP_ID=
META_APP_SECRET=
```

### 10.3 Priorità di Sviluppo

Seguire questo ordine:

1. **Setup Supabase:** schema DB + RLS policies + Auth
2. **Layout base:** sidebar navigation + auth pages
3. **CRUD workspace e competitor**
4. **Integrazione Apify:** service layer + primo scraping funzionante
5. **Pagina competitor detail** con lista ads
6. **Dashboard aggregata**
7. **Creative Library** con search
8. **Ruoli e permessi** (middleware + RLS)
9. **Scheduling e alerting**
10. **Meta OAuth + Performance Analytics**

### 10.4 Design Guidelines

Il tool deve seguire un design dark/luxury coerente con il brand NIMA Digital:

- **Background principale:** `#0A0A0A` (near-black)
- **Accent color:** `#D4A843` (warm gold) per CTA, highlight, titoli
- **Testi:** white per heading, muted gray `#B0B0B0` per body
- **Cards:** charcoal `#1A1A1A` con border subtle e gold accent
- **Font:** Inter o system font stack per UI, Georgia per titoli sezione
- **Spazi generosi, layout pulito, minimal**
- **Grafici:** palette scura con gold come colore primario serie dati

### 10.5 RLS Policies (esempio)

```sql
-- Ogni utente vede solo i dati del proprio workspace
CREATE POLICY "Users can view own workspace data"
ON ads_external FOR SELECT
USING (workspace_id = (
  SELECT workspace_id FROM users WHERE id = auth.uid()
));

-- Solo admin e super_admin possono inserire competitor
CREATE POLICY "Admins can insert competitors"
ON competitors FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND workspace_id = competitors.workspace_id
  )
);
```

---

## 11. Considerazioni Legali

- **Meta Ad Library è pubblica:** i dati nella Ad Library sono intenzionalmente resi pubblici da Meta per trasparenza. Lo scraping di questi dati è generalmente considerato lecito.
- **Nessun dato personale:** lo scraper non raccoglie dati personali degli utenti, ma solo dati relativi agli inserzionisti e alle loro ads.
- **Meta Marketing API:** l'accesso ai dati interni avviene tramite API ufficiali con token autorizzati. Pienamente conforme ai ToS Meta.
- **GDPR compliance:** i dati raccolti riguardano attività commerciali (ads), non persone fisiche. Tuttavia, includere una nota informativa nell'app e una data retention policy.
- **Rate limiting:** rispettare i rate limit sia di Apify che di Meta API per evitare ban.
- **Rischio ToS scraping:** sebbene i dati siano pubblici, Meta può modificare i propri ToS. Monitorare eventuali cambiamenti e avere un fallback (API ufficiale Ad Library se/quando disponibile senza restrizioni).

---

*NIMA Digital Consulting FZCO · Dubai Digital Park, Silicon Oasis · info@nimadigital.ae*
