# Comportamento del date range negli scan Apify

Documenta come il parametro `date_from` / `date_to` viene gestito nei diversi canali di scan, perché Meta e Google si comportano in modo diverso, e cosa significa concretamente per chi usa l'app.

Aggiornato: 2026-05-11.

---

## 1. Il principio generale

Il date range che imposti nello scan può fare due cose molto diverse a seconda della piattaforma:

- **Filtro alla fonte** — la piattaforma supporta nativamente un filtro per data, lo passiamo allo scraper e otteniamo solo gli ad nel range. Riduce costo e tempo dello scrape.
- **Etichetta cosmetica** — la piattaforma non supporta filtri server-side. Lo scraper scarica sempre tutta la libreria pubblica. Il range serve solo come metadata e si applica eventualmente a runtime nelle viste.

Quale dei due si applica dipende esclusivamente da come la piattaforma espone i dati pubblicamente.

---

## 2. Google Ads — il date range è **cosmetico**

### Come funziona

Lo scraper interroga la **Google Ads Transparency Center**, libreria pubblica con tutti gli ad attivi (e alcuni recentemente cessati) di un brand. **Google non permette di filtrare per data lato server**: lo scraper riceve sempre tutto quello che è pubblicamente visibile.

Esempio Elena Mirò: 383 ads totali in libreria, scrapati interi a ogni chiamata.

### Cosa succede al `date_from` / `date_to`

- Viene salvato come **metadata sul job** in `mait_scrape_jobs.date_from` / `date_to` (audit: "il 11/05 ho richiesto uno scan per 11/04 → 11/05")
- **Non riduce** cosa va in `mait_ads_external`: salviamo TUTTI i 383 ads
- Per analizzare un sottoinsieme temporale si filtra a runtime sulle viste (benchmark, library, AI analysis) usando `start_date` come chiave

### Conseguenze pratiche

- Range 30 giorni vs 1 anno → **identico costo Apify, identico tempo, identico contenuto in DB**
- Se cambi range su una view → vedi un sottoinsieme diverso degli stessi dati salvati. Nessun nuovo scan, nessun nuovo costo
- Per recuperare ads scartati da scan precedenti (vecchia logica con filter aggressivo) c'è il link "Riprocessa dataset ultimo scan" che riusa il dataset Apify entro 6 giorni dalla scrape originale

### File rilevanti

- `src/lib/apify/google-ads-service.ts` — funzioni `startGoogleAdsScan`, `finalizeGoogleAdsScan`, `scrapeGoogleAds` (no più date filter sui records)
- `src/app/api/apify/scan-google/route.ts` — kick-off async, salva opts in `scan_options jsonb`
- `src/app/api/apify/scan-google/reconcile/route.ts` — supporta `force_refinalize` per riprocessare dataset

---

## 3. Meta Ads — il date range **filtra alla fonte**

### Come funziona

La **Facebook Ads Library** supporta nativamente il filtro per data sia nell'URL della library sia come parametro dell'actor Apify. Lo scraper riceve solo gli ad nel range richiesto.

```
src/lib/apify/service.ts:341
if (opts.dateFrom) input.startDate = opts.dateFrom;
if (opts.dateTo)   input.endDate   = opts.dateTo;
```

### Cosa succede al `date_from` / `date_to`

- Viene passato sia all'URL della Ads Library sia all'input dell'actor Apify
- Apify scrappa **solo** gli ad nel range
- In DB finiscono solo gli ad scrapati (quindi solo quelli del range)

### Conseguenze pratiche

- Range 30 giorni → Apify scrappa solo gli ad in quel range → DB contiene solo quelli
- Range 1 anno → Apify scrappa più ad → costo Apify e tempo crescono → DB contiene più ad
- Se domani vuoi guardare gli ultimi 90 giorni ma hai scansionato 30, **ti mancano** i dati e devi ri-scrappare con range più largo

### File rilevanti

- `src/lib/apify/service.ts` — funzione `scrapeMetaAds`, passaggio `startDate`/`endDate` all'actor
- `src/app/api/apify/scan/route.ts` — route sync (`maxDuration = 300`)

---

## 4. Perché la differenza è intenzionale

| | Meta Ads Library | Google Transparency Center |
|---|---|---|
| Filtro per data server-side | ✓ supportato | ✗ non disponibile |
| Strategia ottimale | Filtrare alla fonte, scrappare il necessario | Scrappare tutto, filtrare a runtime |
| Riduzione costo Apify con range stretto | Sì (proporzionale) | No |

Se forzassimo Meta a "scrappare sempre tutto" pagheremmo Apify per dati che non ci servono (Meta library è molto più estesa di Google per i brand grossi).

Se forzassimo Google a "filtrare alla fonte" non funzionerebbe perché Google non lo permette: lo scraper ignorerebbe il parametro.

Se in futuro Google Transparency aggiungesse un filtro per data nativo, potremmo allineare i due flussi. Oggi no.

---

## 5. Riepilogo per canale (tutti gli altri)

| Canale | Date filter | Cosa va in DB | Sync/Async |
|---|---|---|---|
| **Meta** | Server-side (FB + actor) | Solo range richiesto | Sync (300s cap) |
| **Google** | Cosmetico | Tutta la libreria | Async (webhook) |
| **TikTok Ads** | Server-side (DSA Library) | Solo range richiesto | Sync |
| **Snapchat Ads** | Server-side (Snap API) | Solo range richiesto | Sync |
| **YouTube / Instagram** | Post-scrape, organic | Variabile | Sync |

---

## 6. UX in app

### Su Meta

Il range che scegli ha un impatto reale: riduce costo e tempo. Se ti interessano dati storici devi scegliere un range largo o ri-scrappare in seguito con range esteso (e pagare di nuovo).

### Su Google

Il range che scegli è solo un'etichetta. Tecnicamente il sistema scarica sempre tutta la libreria del brand. Quindi se vuoi avere tutti gli ad in libreria puoi tranquillamente impostare 1 anno o 90 giorni — non costa di più, non rallenta lo scan. Cambi range sulla view → vedi un sottoinsieme diverso dei dati che hai già.
