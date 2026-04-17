export const locales = ["it", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "it";

const translations = {
  // ─── Landing page ──────────────────────────────────────────
  landing: {
    tagline: {
      it: "NIMA Digital \u00B7 Internal SaaS",
      en: "NIMA Digital \u00B7 Internal SaaS",
    },
    heading: {
      it: "Meta Ads Intelligence Tool.",
      en: "Meta Ads Intelligence Tool.",
    },
    subtitle: {
      it: "Competitive intelligence, performance analytics e creative library per il team NIMA Digital. Monitora i brand, analizza creativit\u00E0, presenta insight ai clienti.",
      en: "Competitive intelligence, performance analytics and creative library for the NIMA Digital team. Monitor brands, analyse creatives, present insights to clients.",
    },
    loginBtn: { it: "Accedi", en: "Sign in" },
    registerBtn: { it: "Crea account", en: "Create account" },
    featureMonitorTitle: { it: "Brand Monitor", en: "Brand Monitor" },
    featureMonitorBody: {
      it: "Scraping automatico delle ads attive dei brand via Apify + Meta Ad Library.",
      en: "Automatic scraping of brand active ads via Apify + Meta Ad Library.",
    },
    featureLibraryTitle: { it: "Creative Library", en: "Creative Library" },
    featureLibraryBody: {
      it: "Archivio searchable di tutte le creativit\u00E0 raccolte, con filtri e tag.",
      en: "Searchable archive of all collected creatives, with filters and tags.",
    },
    featureAnalyticsTitle: {
      it: "Performance Analytics",
      en: "Performance Analytics",
    },
    featureAnalyticsBody: {
      it: "KPI delle campagne gestite via Meta Marketing API, breakdown e benchmarking.",
      en: "Campaign KPIs via Meta Marketing API, breakdowns and benchmarking.",
    },
  },

  // ─── 404 ───────────────────────────────────────────────────
  notFound: {
    title: { it: "Pagina non trovata.", en: "Page not found." },
    description: {
      it: "La risorsa che stai cercando non esiste, \u00E8 stata spostata o non hai i permessi per vederla.",
      en: "The resource you are looking for does not exist, has been moved, or you don't have permission to view it.",
    },
    backDashboard: { it: "Torna alla dashboard", en: "Back to dashboard" },
    home: { it: "Home", en: "Home" },
  },

  // ─── Header ────────────────────────────────────────────────
  header: {
    workspace: { it: "Workspace", en: "Workspace" },
    signOut: { it: "Esci", en: "Sign out" },
  },

  // ─── Sidebar ───────────────────────────────────────────────
  sidebar: {
    dashboard: { it: "Dashboard", en: "Dashboard" },
    brands: { it: "Brands", en: "Brands" },
    compare: { it: "Confronto", en: "Compare" },
    library: { it: "Creative Library", en: "Creative Library" },
    collections: { it: "Collezioni", en: "Collections" },
    benchmarks: { it: "Benchmarks", en: "Benchmarks" },
    report: { it: "Report", en: "Report" },
    alerts: { it: "Alerts", en: "Alerts" },
    settings: { it: "Settings", en: "Settings" },
    footer: { it: "NIMA Digital \u00B7 v0.1", en: "NIMA Digital \u00B7 v0.1" },
  },

  // ─── Auth ──────────────────────────────────────────────────
  auth: {
    loginTitle: { it: "Accedi", en: "Sign in" },
    loginDescription: {
      it: "Usa l'email del tuo workspace NIMA.",
      en: "Use your NIMA workspace email.",
    },
    noAccount: { it: "Non hai un account?", en: "Don't have an account?" },
    registerLink: { it: "Registrati", en: "Register" },
    registerTitle: { it: "Crea il tuo account", en: "Create your account" },
    registerDescription: {
      it: "Inserisci i tuoi dati. Ti verr\u00E0 assegnato un nuovo workspace.",
      en: "Enter your details. You will be assigned a new workspace.",
    },
    hasAccount: { it: "Hai gi\u00E0 un account?", en: "Already have an account?" },
    loginLink: { it: "Accedi", en: "Sign in" },
    continueGoogle: { it: "Continua con Google", en: "Continue with Google" },
    registerGoogle: { it: "Registrati con Google", en: "Sign up with Google" },
    orDivider: { it: "oppure", en: "or" },
    emailLabel: { it: "Email", en: "Email" },
    passwordLabel: { it: "Password", en: "Password" },
    loginSubmit: { it: "Accedi con email", en: "Sign in with email" },
    loginLoading: { it: "Accesso...", en: "Signing in..." },
    redirect: { it: "Redirect...", en: "Redirect..." },
    welcomeBack: { it: "Bentornato.", en: "Welcome back." },
    fullNameLabel: { it: "Nome completo", en: "Full name" },
    workspaceNameLabel: { it: "Nome workspace", en: "Workspace name" },
    workspacePlaceholder: { it: "Es. NIMA Core", en: "E.g. NIMA Core" },
    registerSubmit: { it: "Crea account con email", en: "Create account with email" },
    registerLoading: { it: "Creazione...", en: "Creating..." },
    registerError: {
      it: "Errore durante la registrazione.",
      en: "Error during registration.",
    },
    bootstrapFailed: { it: "Bootstrap fallito:", en: "Bootstrap failed:" },
    accountCreated: { it: "Account creato.", en: "Account created." },
  },

  // ─── Dashboard ─────────────────────────────────────────────
  dashboard: {
    greeting: { it: "Buongiorno", en: "Good morning" },
    subtitle: {
      it: "Panoramica del tuo workspace MAIT.",
      en: "Overview of your MAIT workspace.",
    },
    totalAds: { it: "Ads totali", en: "Total ads" },
    activeAds: { it: "Ads attive", en: "Active ads" },
    monitoredCompetitors: {
      it: "Brand monitorati",
      en: "Monitored brands",
    },
    latestAds: { it: "Latest ads", en: "Latest ads" },
    viewAll: { it: "Vedi tutto", en: "View all" },
    noAdsYet: {
      it: "Nessuna ad ancora. Aggiungi un brand e lancia uno scan.",
      en: "No ads yet. Add a brand and run a scan.",
    },
    topCompetitors: { it: "Top 5 brand (active)", en: "Top 5 brands (active)" },
    noDataYet: { it: "Nessun dato ancora.", en: "No data yet." },
  },

  // ─── Competitors (Brands) ─────────────────────────────────
  competitors: {
    title: { it: "Brands", en: "Brands" },
    subtitle: {
      it: "Brand monitorati nel tuo workspace.",
      en: "Monitored brands in your workspace.",
    },
    addCompetitor: { it: "Aggiungi brand", en: "Add brand" },
    noCompetitors: {
      it: "Nessun brand configurato.",
      en: "No brands configured.",
    },
    noCompetitorsClickAdd: {
      it: "Clicca Aggiungi brand per iniziare.",
      en: "Click Add brand to get started.",
    },
    lastScan: { it: "Ultimo scan:", en: "Last scan:" },
    allCompetitors: { it: "Tutti i brand", en: "All brands" },
    exportCsv: { it: "Export CSV", en: "Export CSV" },
    noAdsCollected: {
      it: "Nessuna ad ancora raccolta. Lancia uno Scan now per popolare la libreria.",
      en: "No ads collected yet. Run a Scan now to populate the library.",
    },
    adsCount: { it: "ads (max 120 pi\u00F9 recenti)", en: "ads (max 120 most recent)" },
    likes: { it: "likes", en: "likes" },
    pageCategories: { it: "Categorie pagina", en: "Page categories" },
    selectedCountries: { it: "Paesi selezionati:", en: "Selected countries:" },
    channelAll: { it: "Tutti", en: "All" },
    noMetaAds: { it: "Nessuna Meta Ad raccolta.", en: "No Meta Ads collected." },
    noGoogleAds: { it: "Nessuna Google Ad raccolta.", en: "No Google Ads collected." },
  },

  // ─── New Brand ─────────────────────────────────────────────
  newCompetitor: {
    title: { it: "Aggiungi brand", en: "Add brand" },
    subtitle: {
      it: "Inserisci l'URL pagina Facebook o Meta Ad Library del brand.",
      en: "Enter the brand's Facebook page or Meta Ad Library URL.",
    },
    detailsTitle: { it: "Dettagli", en: "Details" },
    detailsDescription: {
      it: "Il primo scraping pu\u00F2 essere lanciato dopo la creazione.",
      en: "The first scrape can be launched after creation.",
    },
    pageNameLabel: { it: "Nome pagina", en: "Page name" },
    pageNamePlaceholder: { it: "Es. Nike", en: "E.g. Nike" },
    pageUrlLabel: {
      it: "URL pagina Facebook o Meta Ad Library",
      en: "Facebook page or Meta Ad Library URL",
    },
    countryLabel: { it: "Paese", en: "Country" },
    categoryLabel: { it: "Categoria", en: "Category" },
    createSubmit: { it: "Crea brand", en: "Create brand" },
    createLoading: { it: "Creazione...", en: "Creating..." },
    created: { it: "Brand creato.", en: "Brand created." },
    error: { it: "Errore", en: "Error" },
    selectCategory: { it: "Seleziona categoria", en: "Select category" },
    instagramLabel: { it: "Username Instagram", en: "Instagram username" },
    instagramPlaceholder: { it: "es. nike (senza @)", en: "e.g. nike (without @)" },
    googleAdsSection: { it: "Google Ads (opzionale)", en: "Google Ads (optional)" },
    googleDomainLabel: { it: "Dominio Google Ads", en: "Google Ads domain" },
    googleAdvertiserIdLabel: { it: "Google Advertiser ID", en: "Google Advertiser ID" },
    searchCountry: { it: "Cerca paese...", en: "Search country..." },
    noCountryMatch: { it: "Nessun paese trovato.", en: "No country found." },
  },

  // ─── Edit Brand ────────────────────────────────────────────
  editCompetitor: {
    title: { it: "Modifica brand", en: "Edit brand" },
    detailsTitle: { it: "Dettagli", en: "Details" },
    detailsDescription: { it: "Modifica le informazioni del brand.", en: "Edit brand information." },
    save: { it: "Salva modifiche", en: "Save changes" },
    saving: { it: "Salvataggio...", en: "Saving..." },
    saved: { it: "Brand aggiornato.", en: "Brand updated." },
    deleteBtn: { it: "Elimina brand", en: "Delete brand" },
    deleteConfirm: { it: "Sei sicuro di voler eliminare", en: "Are you sure you want to delete" },
    deleteWarning: { it: "Tutte le ads e gli scan associati verranno eliminati.", en: "All associated ads and scans will be deleted." },
    confirmDelete: { it: "Elimina definitivamente", en: "Delete permanently" },
    deletingProgress: { it: "Eliminazione...", en: "Deleting..." },
    deleted: { it: "Brand eliminato.", en: "Brand deleted." },
    deleteError: { it: "Errore nell'eliminazione.", en: "Error deleting." },
    cancel: { it: "Annulla", en: "Cancel" },
  },

  // ─── Scan Button ───────────────────────────────────────────
  scan: {
    scanNow: { it: "Scan now", en: "Scan now" },
    scanning: { it: "Scanning\u2026", en: "Scanning\u2026" },
    scrapingInProgress: {
      it: "Scraping in corso\u2026 (pu\u00F2 richiedere 30-90s)",
      en: "Scraping in progress\u2026 (may take 30-90s)",
    },
    adsSynced: { it: "ads sincronizzate.", en: "ads synced." },
    scanOptions: { it: "Opzioni scan", en: "Scan options" },
    dateFrom: { it: "Da", en: "From" },
    dateTo: { it: "A", en: "To" },
    adStatus: { it: "Stato ads", en: "Ad status" },
    adStatusMeta: { it: "Stato ads (solo Meta)", en: "Ad status (Meta only)" },
    activeOnly: { it: "Solo attive", en: "Active only" },
    allAds: { it: "Tutte (attive + inattive)", en: "All (active + inactive)" },
    resetFilters: { it: "Reset filtri", en: "Reset filters" },
    launchScan: { it: "Lancia scan", en: "Launch scan" },
    scanAll: { it: "Scan tutti i brand", en: "Scan all brands" },
    scanAllLaunch: { it: "Lancia scan globale", en: "Launch global scan" },
    scanAllProgress: { it: "Scanning brand", en: "Scanning brands" },
    scanAllDone: { it: "Scan completato!", en: "Scan completed!" },
    scanAllPartial: { it: "brand completati", en: "brands completed" },
    last30days: { it: "Ultimi 30 giorni", en: "Last 30 days" },
    scanPeriod: { it: "Periodo di scansione", en: "Scan period" },
    days: { it: "giorni", en: "days" },
    scanGoogle: { it: "Scan Google Ads", en: "Scan Google Ads" },
    scanningGoogle: { it: "Scanning Google\u2026", en: "Scanning Google\u2026" },
    scrapingGoogleInProgress: {
      it: "Scraping Google Ads\u2026 (pu\u00F2 richiedere 20-60s)",
      en: "Scraping Google Ads\u2026 (may take 20-60s)",
    },
  },

  // ─── Frequency Selector ────────────────────────────────────
  frequency: {
    schedule: { it: "Schedule:", en: "Schedule:" },
    manual: { it: "Manuale", en: "Manual" },
    daily: { it: "Giornaliera", en: "Daily" },
    weekly: { it: "Settimanale", en: "Weekly" },
    updateError: {
      it: "Impossibile aggiornare la frequenza.",
      en: "Unable to update the frequency.",
    },
    scheduleDisabled: {
      it: "Schedule disattivato \u2014 solo scan manuali.",
      en: "Schedule disabled \u2014 manual scans only.",
    },
    dailyActive: { it: "Scraping giornaliero attivo.", en: "Daily scraping active." },
    weeklyActive: {
      it: "Scraping settimanale attivo.",
      en: "Weekly scraping active.",
    },
  },

  // ─── Job History ───────────────────────────────────────────
  jobHistory: {
    title: { it: "Cronologia scan", en: "Scan history" },
    deleteSelected: { it: "Elimina", en: "Delete" },
    selectedSuffix: { it: "selezionati", en: "selected" },
    selectedSuffixSingular: { it: "selezionato", en: "selected" },
    bulkDeletePrompt: {
      it: "Stai per eliminare",
      en: "You are about to delete",
    },
    scansWord: { it: "scan", en: "scans" },
    adsAssociated: { it: "ads associate", en: "associated ads" },
    deleteAdsQuestion: { it: "Vuoi eliminare anche le ads?", en: "Do you also want to delete the ads?" },
    deleteScanAndAds: { it: "Elimina scan + ads", en: "Delete scans + ads" },
    onlyScans: { it: "Solo gli scan", en: "Scans only" },
    cancel: { it: "Annulla", en: "Cancel" },
    deselectAll: { it: "Deseleziona tutti", en: "Deselect all" },
    selectAll: { it: "Seleziona tutti", en: "Select all" },
    ofTotal: { it: "di", en: "of" },
    selectedLabel: { it: "selezionati", en: "selected" },
    deletingProgress: { it: "Eliminazione in corso\u2026", en: "Deleting\u2026" },
    deletingScanCount: { it: "Eliminazione di", en: "Deleting" },
    scanAndAdsDeleted: { it: "Scan e ads eliminati.", en: "Scan and ads deleted." },
    scanDeleted: { it: "Scan eliminato.", en: "Scan deleted." },
    scansAndAdsDeleted: { it: "scan e ads relativi eliminati.", en: "scans and related ads deleted." },
    scansDeleted: { it: "scan eliminati.", en: "scans deleted." },
    deleteScanLabel: { it: "Elimina scan", en: "Delete scan" },
    confirmDeleteAds: {
      it: "Vuoi eliminare anche le",
      en: "Do you also want to delete the",
    },
    adsCollected: { it: "ads raccolte da questo scan?", en: "ads collected from this scan?" },
    scanPlusAds: { it: "Scan + ads", en: "Scan + ads" },
    scanOnly: { it: "Solo scan", en: "Scan only" },
    error: { it: "Errore", en: "Error" },
    succeededLabel: { it: "riusciti", en: "succeeded" },
    lastRun: { it: "ultimo", en: "last" },
  },

  // ─── Relative time ─────────────────────────────────────────
  relativeTime: {
    minutesAgo: { it: "m fa", en: "m ago" },
    hoursAgo: { it: "h fa", en: "h ago" },
    daysAgo: { it: "g fa", en: "d ago" },
  },

  // ─── Ad Detail ─────────────────────────────────────────────
  adDetail: {
    backToCompetitor: { it: "Torna al brand", en: "Back to brand" },
    creativeVariants: { it: "Varianti creative", en: "Creative variants" },
    allCarouselCards: { it: "Tutte le card del carousel", en: "All carousel cards" },
    variantLabel: { it: "Variante", en: "Variant" },
    fullText: { it: "Testo completo", en: "Full text" },
    headline: { it: "Headline", en: "Headline" },
    copy: { it: "Copy", en: "Copy" },
    descriptionLabel: { it: "Descrizione", en: "Description" },
    details: { it: "Dettagli", en: "Details" },
    startDate: { it: "Data inizio", en: "Start date" },
    endDate: { it: "Data fine", en: "End date" },
    stillActive: { it: "Ancora attiva", en: "Still active" },
    duration: { it: "Durata", en: "Duration" },
    daysUnit: { it: "giorni", en: "days" },
    landingPage: { it: "Landing page", en: "Landing page" },
    platforms: { it: "Piattaforme", en: "Platforms" },
    aiTagSector: { it: "Settore", en: "Sector" },
    aiTagFormat: { it: "Formato", en: "Format" },
    aiTagTone: { it: "Tono", en: "Tone" },
    aiTagObjective: { it: "Obiettivo", en: "Objective" },
    aiTagSeasonality: { it: "Stagionalit\u00E0", en: "Seasonality" },
    aiTagLanguage: { it: "Lingua", en: "Language" },
    adMetadata: { it: "Metadati dell'ad", en: "Ad metadata" },
    displayFormat: { it: "Formato display", en: "Display format" },
    ctaType: { it: "Tipo CTA", en: "CTA type" },
    variantsCount: { it: "Varianti creative", en: "Creative variants" },
    enabled: { it: "Attivo", en: "Enabled" },
    aiGenerated: { it: "Generato con AI", en: "AI generated" },
    reshared: { it: "Condiviso da altra pagina", en: "Reshared" },
    yes: { it: "S\u00EC", en: "Yes" },
    targetedCountries: { it: "Paesi target", en: "Targeted countries" },
    relatedPages: { it: "Pagine correlate", en: "Related pages" },
  },

  // ─── Compare ───────────────────────────────────────────────
  compare: {
    title: { it: "Confronto brand", en: "Brand comparison" },
    subtitle: {
      it: "Seleziona 2 o 3 brand per confrontarli side-by-side.",
      en: "Select 2 or 3 brands to compare them side-by-side.",
    },
    selectCompetitors: { it: "Seleziona brand", en: "Select brands" },
    noCompetitorsInWorkspace: {
      it: "Nessun brand nel workspace.",
      en: "No brands in workspace.",
    },
    selectAtLeast2: {
      it: "Seleziona almeno 2 brand per vedere il confronto.",
      en: "Select at least 2 brands to see the comparison.",
    },
    tabTechnical: { it: "Analisi tecnica", en: "Technical analysis" },
    tabCopy: { it: "Analisi copy", en: "Copy analysis" },
    tabVisual: { it: "Analisi creativa", en: "Creative analysis" },
    estimatedObjective: { it: "Obiettivo campagna stimato", en: "Estimated campaign objective" },
    estimate: { it: "Stima", en: "Estimate" },
    showSignals: { it: "Mostra segnali", en: "Show signals" },
    hideSignals: { it: "Nascondi segnali", en: "Hide signals" },
    objectiveDisclaimer: {
      it: "Questa \u00E8 una stima basata su segnali pubblici (tipo CTA, formato ad, Advantage+, landing page). L'obiettivo reale della campagna \u00E8 visibile solo all'inserzionista tramite Meta Ads Manager. Affidabilit\u00E0 indicativa: la barra mostra il livello di confidenza.",
      en: "This is an estimate based on public signals (CTA type, ad format, Advantage+, landing page). The actual campaign objective is only visible to the advertiser via Meta Ads Manager. The bar shows the confidence level.",
    },
    calculating: { it: "Calcolo in corso\u2026", en: "Calculating\u2026" },
    totalAds: { it: "Ads totali", en: "Total ads" },
    activeAds: { it: "Ads attive", en: "Active ads" },
    formatMix: { it: "Format mix", en: "Format mix" },
    topCta: { it: "Top CTA", en: "Top CTA" },
    platformsLabel: { it: "Piattaforme", en: "Platforms" },
    avgDuration: { it: "Durata media", en: "Avg. duration" },
    avgDurationDays: { it: "gg", en: "d" },
    avgCopyLength: { it: "Lungh. media copy", en: "Avg. copy length" },
    avgCopyChars: { it: "chr", en: "chr" },
    refreshRate: { it: "Refresh rate (90gg)", en: "Refresh rate (90d)" },
    adsPerWeek: { it: "ads/sett.", en: "ads/wk" },
    latestAds: { it: "Ultime ads", en: "Latest ads" },
    generatedAt: { it: "Generato il", en: "Generated on" },
    regenerate: { it: "Rigenera", en: "Regenerate" },
    regenerating: { it: "Rigenerazione...", en: "Regenerating..." },
    staleWarning: {
      it: "Dati potenzialmente non aggiornati \u2014 nuove ads rilevate dall'ultima analisi",
      en: "Data may be outdated \u2014 new ads detected since last analysis",
    },
    generating: { it: "Generazione confronto...", en: "Generating comparison..." },
    generatingAi: { it: "Analisi AI in corso...", en: "AI analysis in progress..." },
    staleShort: { it: "da aggiornare", en: "outdated" },
    savedComparisons: { it: "Confronti salvati", en: "Saved comparisons" },
  },

  // ─── Library ───────────────────────────────────────────────
  library: {
    title: { it: "Creative Library", en: "Creative Library" },
    subtitle: {
      it: "Tutte le creativit\u00E0 raccolte nel workspace.",
      en: "All creatives collected in the workspace.",
    },
    noAdsFiltered: {
      it: "Nessuna ad trovata con questi filtri.",
      en: "No ads found with these filters.",
    },
    resultsMax: { it: "risultati (max 120)", en: "results (max 120)" },
    searchPlaceholder: {
      it: "Cerca in headline, copy, description\u2026",
      en: "Search in headline, copy, description\u2026",
    },
    searchBtn: { it: "Cerca", en: "Search" },
    formatLabel: { it: "Formato", en: "Format" },
    formatImage: { it: "Immagine", en: "Image" },
    formatVideo: { it: "Video", en: "Video" },
    platformLabel: { it: "Piattaforma", en: "Platform" },
    ctaLabel: { it: "Call to Action", en: "Call to Action" },
    statusLabel: { it: "Stato", en: "Status" },
  },

  // ─── Benchmarks ────────────────────────────────────────────
  benchmarks: {
    title: { it: "Benchmarks", en: "Benchmarks" },
    subtitle: {
      it: "Analisi comparativa basata sulle ads scrappate.",
      en: "Comparative analysis based on scraped ads.",
    },
    noData: {
      it: "Nessun dato disponibile. Aggiungi dei brand e lancia almeno uno scan per popolare i benchmark.",
      en: "No data available. Add brands and run at least one scan to populate benchmarks.",
    },
    comparativeAnalysis: {
      it: "Analisi comparativa su",
      en: "Comparative analysis on",
    },
    adsOf: { it: "ads di", en: "ads from" },
    competitorsWord: { it: "brand.", en: "brands." },
    totalAds: { it: "Ads totali", en: "Total ads" },
    activeAds: { it: "Ads attive", en: "Active ads" },
    avgCampaignDuration: {
      it: "Durata media campagna",
      en: "Avg. campaign duration",
    },
    avgCopyLength: { it: "Lungh. media copy", en: "Avg. copy length" },
    volumePerCompetitor: {
      it: "Volume ads per brand",
      en: "Ad volume per brand",
    },
    globalFormatMix: { it: "Format mix (globale)", en: "Format mix (global)" },
    formatPerCompetitor: {
      it: "Format mix per brand",
      en: "Format mix per brand",
    },
    topCta: { it: "Top CTA", en: "Top CTA" },
    platformDistribution: {
      it: "Distribuzione piattaforma",
      en: "Platform distribution",
    },
    avgCampaignDurationChart: {
      it: "Durata media campagna",
      en: "Avg. campaign duration",
    },
    avgCopyLengthChart: {
      it: "Lunghezza media copy",
      en: "Avg. copy length",
    },
    refreshRateChart: { it: "Refresh rate (90gg)", en: "Refresh rate (90d)" },
    daysLabel: { it: "Giorni", en: "Days" },
    charsLabel: { it: "Caratteri", en: "Characters" },
    adsPerWeekLabel: { it: "Ads/settimana", en: "Ads/week" },
    adsLabel: { it: "Ads", en: "Ads" },
    aiGeneratedPercent: { it: "% AI generato", en: "% AI generated" },
    advantagePlusPercent: { it: "% Advantage+", en: "% Advantage+" },
    aiGeneratedChart: { it: "Ads AI-generated per brand (%)", en: "AI-generated ads per brand (%)" },
    advantagePlusChart: { it: "Advantage+ per brand (%)", en: "Advantage+ per brand (%)" },
    avgVariantsChart: { it: "Media varianti per ad", en: "Avg. variants per ad" },
    variantsLabel: { it: "Varianti", en: "Variants" },
    topTargetedCountries: { it: "Top paesi target", en: "Top targeted countries" },
  },

  // ─── Report ────────────────────────────────────────────────
  report: {
    title: { it: "Report", en: "Report" },
    subtitle: {
      it: "Genera report brandizzati in PPTX o PDF per singoli brand o confronti.",
      en: "Generate branded PPTX or PDF reports for single brands or comparisons.",
    },
    typeSingle: { it: "Singolo brand", en: "Single brand" },
    typeComparison: { it: "Confronto brand", en: "Brand comparison" },
    selectBrand: { it: "Seleziona brand", en: "Select brand" },
    selectBrands: { it: "Seleziona brand", en: "Select brands" },
    template: { it: "Template", en: "Template" },
    noTemplate: { it: "Nessun template (stile MAIT default)", en: "No template (MAIT default style)" },
    defaultStyle: { it: "Stile MAIT default", en: "MAIT default style" },
    uploadTemplate: { it: "Carica template", en: "Upload template" },
    templateName: { it: "Nome template", en: "Template name" },
    uploadBtn: { it: "Carica", en: "Upload" },
    usingTemplate: { it: "Usando template", en: "Using template" },
    language: { it: "Lingua", en: "Language" },
    font: { it: "Font", en: "Font" },
    format: { it: "Formato", en: "Format" },
    generateBtn: { it: "Genera report", en: "Generate report" },
    generating: { it: "Generazione in corso\u2026", en: "Generating\u2026" },
    generated: { it: "Report generato", en: "Report generated" },
    downloadReady: { it: "Download pronto \u2014 il file \u00E8 stato scaricato.", en: "Download ready \u2014 the file has been downloaded." },
    errorGeneration: { it: "Errore nella generazione del report.", en: "Error generating the report." },
    templateUploaded: { it: "Template caricato.", en: "Template uploaded." },
    templateDeleted: { it: "Template eliminato.", en: "Template deleted." },
    contentSelection: { it: "Contenuto report", en: "Report content" },
    sectionTechnical: { it: "Analisi tecnica", en: "Technical analysis" },
    sectionCopy: { it: "Analisi copy (AI)", en: "Copy analysis (AI)" },
    sectionVisual: { it: "Analisi creativa (AI)", en: "Creative analysis (AI)" },
    channel: { it: "Canale", en: "Channel" },
    selectSections: { it: "Seleziona le sezioni da includere nel report.", en: "Select sections to include in the report." },
    savedComparisons: { it: "Confronto salvato", en: "Saved comparison" },
    savedComparisonsHint: { it: "Seleziona un confronto gi\u00E0 generato oppure scegli i brand manualmente al passo successivo.", en: "Select an existing comparison or pick brands manually in the next step." },
    stale: { it: "dati obsoleti", en: "outdated" },
  },

  // ─── Alerts ────────────────────────────────────────────────
  alerts: {
    title: { it: "Alerts", en: "Alerts" },
    unreadOf: { it: "non letti su", en: "unread out of" },
    total: { it: "totali", en: "total" },
    noAlerts: { it: "Nessun alert.", en: "No alerts." },
    markReadError: {
      it: "Errore nel marcare l'alert come letto.",
      en: "Error marking alert as read.",
    },
  },

  // ─── Settings ──────────────────────────────────────────────
  settings: {
    title: { it: "Settings", en: "Settings" },
    subtitle: { it: "Workspace, membri e inviti.", en: "Workspace, members and invitations." },
    workspaceTitle: { it: "Workspace", en: "Workspace" },
    workspaceDescription: {
      it: "Informazioni del workspace corrente.",
      en: "Current workspace information.",
    },
    nameLabel: { it: "Nome:", en: "Name:" },
    slugLabel: { it: "Slug:", en: "Slug:" },
    membersTitle: { it: "Membri", en: "Members" },
    membersDescription: {
      it: "Utenti con accesso a questo workspace.",
      en: "Users with access to this workspace.",
    },
  },

  // ─── Invite Form ───────────────────────────────────────────
  invite: {
    inviteTitle: { it: "Invita utente", en: "Invite user" },
    inviteDescription: {
      it: "Inserisci l'email e scegli il ruolo. Verr\u00E0 generato un link di invito valido 7 giorni.",
      en: "Enter the email and choose a role. A 7-day invite link will be generated.",
    },
    emailLabel: { it: "Email", en: "Email" },
    emailPlaceholder: { it: "collega@email.com", en: "colleague@email.com" },
    roleLabel: { it: "Ruolo", en: "Role" },
    roleAdmin: { it: "Admin \u2014 gestione completa", en: "Admin \u2014 full management" },
    roleAnalyst: { it: "Analista \u2014 lettura + export", en: "Analyst \u2014 read + export" },
    roleViewer: {
      it: "Viewer \u2014 solo visualizzazione",
      en: "Viewer \u2014 view only",
    },
    sendBtn: { it: "Genera invito", en: "Generate invite" },
    sendingBtn: { it: "Invio...", en: "Sending..." },
    inviteCreated: { it: "Invito creato per", en: "Invite created for" },
    deleteError: { it: "Errore nell'eliminare l'invito.", en: "Error deleting invitation." },
    inviteDeleted: { it: "Invito eliminato.", en: "Invitation deleted." },
    linkCopied: { it: "Link copiato negli appunti.", en: "Link copied to clipboard." },
    linkGenerated: {
      it: "Link di invito generato \u2014 condividilo con l'utente:",
      en: "Invite link generated \u2014 share it with the user:",
    },
    sentInvitesTitle: { it: "Inviti inviati", en: "Sent invitations" },
    roleAnalystShort: { it: "Analista", en: "Analyst" },
    accepted: { it: "Accettato", en: "Accepted" },
    expired: { it: "Scaduto", en: "Expired" },
    pending: { it: "In attesa \u2014 scade", en: "Pending \u2014 expires" },
    deleteInvite: { it: "Elimina invito", en: "Delete invitation" },
  },

  // ─── Invite Page ───────────────────────────────────────────
  invitePage: {
    expiredTitle: { it: "Invito scaduto", en: "Invitation expired" },
    expiredDescription: {
      it: "Questo link di invito \u00E8 scaduto. Chiedi all'admin del workspace di inviartene uno nuovo.",
      en: "This invitation link has expired. Ask the workspace admin to send you a new one.",
    },
    youAreInvited: { it: "Sei stato invitato", en: "You have been invited" },
    invitedTo: {
      it: "Sei stato invitato al workspace",
      en: "You have been invited to workspace",
    },
    withRole: { it: "con il ruolo", en: "with the role" },
    loginOrRegister: {
      it: "Accedi o registrati per accettare l'invito.",
      en: "Sign in or register to accept the invitation.",
    },
    loginBtn: { it: "Accedi", en: "Sign in" },
    registerBtn: { it: "Registrati", en: "Register" },
    acceptBtn: { it: "Accetta invito", en: "Accept invitation" },
    accepting: { it: "Accettazione...", en: "Accepting..." },
    acceptError: {
      it: "Errore nell'accettare l'invito.",
      en: "Error accepting the invitation.",
    },
    accepted: { it: "Invito accettato!", en: "Invitation accepted!" },
  },

  // ─── Ad Card ───────────────────────────────────────────────
  adCard: {
    viewOnMeta: {
      it: "Vedi creativo su Meta Ad Library",
      en: "View creative on Meta Ad Library",
    },
    viewOnGoogle: {
      it: "Vedi su Google Ads Transparency",
      en: "View on Google Ads Transparency",
    },
    onPlatforms: { it: "Su:", en: "On:" },
    saveToCollection: { it: "Salva in collezione", en: "Save to collection" },
    notAnalyzed: { it: "Non analizzata dall'AI", en: "Not analyzed by AI" },
    formatImage: { it: "IMAGE", en: "IMAGE" },
    formatVideo: { it: "VIDEO", en: "VIDEO" },
    formatCarousel: { it: "CAROUSEL", en: "CAROUSEL" },
    aiBadge: { it: "AI", en: "AI" },
  },

  // ─── Save to Collection ────────────────────────────────────
  saveCollection: {
    title: { it: "Salva in collezione", en: "Save to collection" },
    adSaved: { it: "Ad salvata nella collezione.", en: "Ad saved to collection." },
    saveError: { it: "Errore nel salvare.", en: "Error saving." },
    noCollections: {
      it: "Nessuna collezione. Creane una.",
      en: "No collections. Create one.",
    },
    newCollectionPlaceholder: {
      it: "Nuova collezione",
      en: "New collection",
    },
  },

  // ─── Collections ───────────────────────────────────────────
  collections: {
    title: { it: "Collezioni", en: "Collections" },
    subtitle: {
      it: "Board di ispirazione. Salva ads dalla Creative Library o dai brand monitorati.",
      en: "Inspiration boards. Save ads from the Creative Library or monitored brands.",
    },
    noCollections: { it: "Nessuna collezione creata.", en: "No collections created." },
    noCollectionsHint: {
      it: "Clicca l'icona segnalibro su qualsiasi ad per salvarla in una collezione.",
      en: "Click the bookmark icon on any ad to save it to a collection.",
    },
    createdOn: { it: "Creata il", en: "Created on" },
    allCollections: { it: "Tutte le collezioni", en: "All collections" },
    noAdsInCollection: {
      it: "Nessuna ad in questa collezione. Usa l'icona segnalibro sulle card per aggiungerne.",
      en: "No ads in this collection. Use the bookmark icon on cards to add some.",
    },
  },

  // ─── Tag Button ────────────────────────────────────────────
  tagButton: {
    aiTagging: { it: "AI tagging in corso\u2026", en: "AI tagging in progress\u2026" },
    taggingFailed: { it: "Tagging fallito.", en: "Tagging failed." },
    adsTagged: { it: "ads taggate.", en: "ads tagged." },
    remaining: { it: "ancora da analizzare.", en: "remaining to analyze." },
    allTagged: { it: "Tutte le ads sono gi\u00E0 state analizzate.", en: "All ads have already been analyzed." },
    allTaggedBtn: { it: "Tutto analizzato", en: "All analyzed" },
    allTaggedTooltip: { it: "Tutte le ads di questo brand sono state analizzate dall'AI.", en: "All ads from this brand have been analyzed by AI." },
    toTag: { it: "ads da analizzare", en: "ads to analyze" },
    toAnalyze: { it: "da analizzare", en: "to analyze" },
    complete: { it: "Analisi completata", en: "Analysis complete" },
    aiTag: { it: "AI Tag", en: "AI Tag" },
    aiTagTitle: { it: "Classificazione AI", en: "AI Classification" },
    aiTagDescription: {
      it: "Analizza automaticamente ogni ad con AI per classificare settore, tono, formato creativo, obiettivo e stagionalit\u00E0.",
      en: "Automatically analyze each ad with AI to classify sector, tone, creative format, objective, and seasonality.",
    },
    aiTagShort: {
      it: "Classifica settore, tono, formato e obiettivo con AI",
      en: "Classify sector, tone, format and objective with AI",
    },
    tagging: { it: "Tagging\u2026", en: "Tagging\u2026" },
    error: { it: "Errore", en: "Error" },
  },

  // ─── Analytics ─────────────────────────────────────────────
  analytics: {
    title: { it: "Performance Analytics", en: "Performance Analytics" },
    subtitle: {
      it: "KPI campagne gestite via Meta Marketing API.",
      en: "Campaign KPIs via Meta Marketing API.",
    },
    comingSoon: { it: "In arrivo (Phase 1.1)", en: "Coming soon (Phase 1.1)" },
    comingSoonDescription: {
      it: "Connessione OAuth Meta Business Manager + sync automatico ogni 6h.",
      en: "OAuth connection to Meta Business Manager + automatic sync every 6h.",
    },
    availableAfter: {
      it: "Sezione disponibile dopo aver collegato un Ad Account Meta.",
      en: "Section available after connecting a Meta Ad Account.",
    },
  },

  // ─── Clients ───────────────────────────────────────────────
  clients: {
    clientLabel: { it: "Cliente", en: "Client" },
    noClient: { it: "Nessun cliente (non assegnato)", en: "No client (unassigned)" },
    newClientPlaceholder: { it: "Nuovo cliente...", en: "New client..." },
    created: { it: "Cliente creato.", en: "Client created." },
    unassigned: { it: "Non assegnati", en: "Unassigned" },
    emptyClient: { it: "Nessun brand in questa cartella.", en: "No brands in this folder." },
  },

  // ─── Organic Posts ─────────────────────────────────────────
  organic: {
    title: { it: "Contenuti organici Instagram", en: "Instagram Organic Content" },
    subtitle: {
      it: "Post organici raccolti dal profilo Instagram.",
      en: "Organic posts collected from the Instagram profile.",
    },
    scanInstagram: { it: "Scan Instagram", en: "Scan Instagram" },
    scanning: {
      it: "Scraping Instagram\u2026 (pu\u00F2 richiedere 30-90s)",
      en: "Scraping Instagram\u2026 (may take 30-90s)",
    },
    postsSynced: { it: "post Instagram sincronizzati.", en: "Instagram posts synced." },
    likes: { it: "likes", en: "likes" },
    comments: { it: "commenti", en: "comments" },
    views: { it: "visualizzazioni", en: "views" },
    videoViews: { it: "Visualizzazioni video", en: "Video views" },
    noPostsYet: {
      it: "Nessun post organico ancora. Lancia uno Scan Instagram per popolare la sezione.",
      en: "No organic posts yet. Run a Scan Instagram to populate this section.",
    },
    postsCount: { it: "post organici", en: "organic posts" },
    avgLikes: { it: "Media likes", en: "Avg. likes" },
    avgComments: { it: "Media commenti", en: "Avg. comments" },
    totalViews: { it: "Views totali", en: "Total views" },
    totalPosts: { it: "Post organici", en: "Organic posts" },
    viewOnInstagram: { it: "Instagram", en: "Instagram" },
  },

  // ─── Creative Analysis ─────────────────────────────────────
  creativeAnalysis: {
    title: { it: "Analisi AI Creativa", en: "AI Creative Analysis" },
    subtitle: {
      it: "Analisi comparativa copy e visual tramite agenti AI.",
      en: "Comparative copy and visual analysis via AI agents.",
    },
    copywriterTitle: { it: "Copywriter", en: "Copywriter" },
    creativeDirectorTitle: { it: "Direttore Creativo", en: "Creative Director" },
    analyzing: { it: "Analisi in corso\u2026", en: "Analyzing\u2026" },
    analysisFailed: {
      it: "Analisi AI fallita. Riprova.",
      en: "AI analysis failed. Please try again.",
    },
    analysisComplete: { it: "Analisi completata.", en: "Analysis complete." },
    toneOfVoice: { it: "Tono di voce", en: "Tone of voice" },
    copyStyle: { it: "Stile copy", en: "Copy style" },
    emotionalTriggers: { it: "Trigger emozionali", en: "Emotional triggers" },
    ctaPatterns: { it: "Pattern CTA", en: "CTA patterns" },
    strengths: { it: "Punti di forza", en: "Strengths" },
    weaknesses: { it: "Punti deboli", en: "Weaknesses" },
    visualStyle: { it: "Stile visivo", en: "Visual style" },
    colorPalette: { it: "Palette colori", en: "Color palette" },
    photographyStyle: { it: "Stile fotografico", en: "Photography style" },
    brandConsistency: { it: "Coerenza brand", en: "Brand consistency" },
    formatPreferences: { it: "Preferenze formato", en: "Format preferences" },
    comparison: { it: "Confronto", en: "Comparison" },
    recommendations: { it: "Raccomandazioni", en: "Recommendations" },
    launchAnalysis: { it: "Analisi AI Creativa", en: "AI Creative Analysis" },
    close: { it: "Chiudi", en: "Close" },
    copywriterFailed: { it: "L'analisi del copywriter non \u00E8 disponibile. Il modello AI potrebbe essere temporaneamente offline.", en: "Copywriter analysis is not available. The AI model may be temporarily offline." },
    creativeDirectorFailed: { it: "L'analisi del direttore creativo non \u00E8 disponibile. Il modello AI potrebbe essere temporaneamente offline.", en: "Creative director analysis is not available. The AI model may be temporarily offline." },
  },

  // ─── Common ────────────────────────────────────────────────
  common: {
    error: { it: "Errore", en: "Error" },
    loading: { it: "Caricamento...", en: "Loading..." },
    ads: { it: "ads", en: "ads" },
  },

  // ─── Language Switcher ─────────────────────────────────────
  language: {
    it: { it: "IT", en: "IT" },
    en: { it: "EN", en: "EN" },
  },
} as const;

export type TranslationKey = keyof typeof translations;
export type Translations = typeof translations;
export default translations;

/**
 * Utility: get a translated value from a flat key path like "dashboard.greeting"
 * Works on both server and client.
 */
export function t(locale: Locale, section: string, key: string): string {
  const sec = (translations as Record<string, Record<string, Record<Locale, string>>>)[section];
  if (!sec) return `[${section}.${key}]`;
  const entry = sec[key];
  if (!entry) return `[${section}.${key}]`;
  return entry[locale] ?? entry["it"] ?? `[${section}.${key}]`;
}
