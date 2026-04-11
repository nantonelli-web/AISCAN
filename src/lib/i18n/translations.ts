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
      it: "Competitive intelligence, performance analytics e creative library per il team NIMA Digital. Monitora competitor, analizza creativit\u00E0, presenta insight ai clienti.",
      en: "Competitive intelligence, performance analytics and creative library for the NIMA Digital team. Monitor competitors, analyse creatives, present insights to clients.",
    },
    loginBtn: { it: "Accedi", en: "Sign in" },
    registerBtn: { it: "Crea account", en: "Create account" },
    featureMonitorTitle: { it: "Competitor Monitor", en: "Competitor Monitor" },
    featureMonitorBody: {
      it: "Scraping automatico delle ads attive dei competitor via Apify + Meta Ad Library.",
      en: "Automatic scraping of competitor active ads via Apify + Meta Ad Library.",
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
    competitors: { it: "Competitors", en: "Competitors" },
    compare: { it: "Confronto", en: "Compare" },
    library: { it: "Creative Library", en: "Creative Library" },
    collections: { it: "Collezioni", en: "Collections" },
    benchmarks: { it: "Benchmarks", en: "Benchmarks" },
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
      it: "Competitor monitorati",
      en: "Monitored competitors",
    },
    latestAds: { it: "Latest ads", en: "Latest ads" },
    viewAll: { it: "Vedi tutto", en: "View all" },
    noAdsYet: {
      it: "Nessuna ad ancora. Aggiungi un competitor e lancia uno scan.",
      en: "No ads yet. Add a competitor and run a scan.",
    },
    topCompetitors: { it: "Top 5 competitor (active)", en: "Top 5 competitors (active)" },
    noDataYet: { it: "Nessun dato ancora.", en: "No data yet." },
  },

  // ─── Competitors ───────────────────────────────────────────
  competitors: {
    title: { it: "Competitors", en: "Competitors" },
    subtitle: {
      it: "Brand monitorati nel tuo workspace.",
      en: "Monitored brands in your workspace.",
    },
    addCompetitor: { it: "Aggiungi competitor", en: "Add competitor" },
    noCompetitors: {
      it: "Nessun competitor configurato.",
      en: "No competitors configured.",
    },
    noCompetitorsClickAdd: {
      it: "Clicca Aggiungi competitor per iniziare.",
      en: "Click Add competitor to get started.",
    },
    lastScan: { it: "Ultimo scan:", en: "Last scan:" },
    allCompetitors: { it: "Tutti i competitor", en: "All competitors" },
    exportCsv: { it: "Export CSV", en: "Export CSV" },
    noAdsCollected: {
      it: "Nessuna ad ancora raccolta. Lancia uno Scan now per popolare la libreria.",
      en: "No ads collected yet. Run a Scan now to populate the library.",
    },
    adsCount: { it: "ads (max 120 pi\u00F9 recenti)", en: "ads (max 120 most recent)" },
  },

  // ─── New Competitor ────────────────────────────────────────
  newCompetitor: {
    title: { it: "Aggiungi competitor", en: "Add competitor" },
    subtitle: {
      it: "Inserisci l'URL pagina Facebook o Meta Ad Library del competitor.",
      en: "Enter the competitor's Facebook page or Meta Ad Library URL.",
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
    createSubmit: { it: "Crea competitor", en: "Create competitor" },
    createLoading: { it: "Creazione...", en: "Creating..." },
    created: { it: "Competitor creato.", en: "Competitor created." },
    error: { it: "Errore", en: "Error" },
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
  },

  // ─── Relative time ─────────────────────────────────────────
  relativeTime: {
    minutesAgo: { it: "m fa", en: "m ago" },
    hoursAgo: { it: "h fa", en: "h ago" },
    daysAgo: { it: "g fa", en: "d ago" },
  },

  // ─── Ad Detail ─────────────────────────────────────────────
  adDetail: {
    backToCompetitor: { it: "Torna al competitor", en: "Back to competitor" },
    creativeVariants: { it: "Varianti creative", en: "Creative variants" },
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
  },

  // ─── Compare ───────────────────────────────────────────────
  compare: {
    title: { it: "Confronto competitor", en: "Competitor comparison" },
    subtitle: {
      it: "Seleziona 2 o 3 competitor per confrontarli side-by-side.",
      en: "Select 2 or 3 competitors to compare them side-by-side.",
    },
    selectCompetitors: { it: "Seleziona competitor", en: "Select competitors" },
    noCompetitorsInWorkspace: {
      it: "Nessun competitor nel workspace.",
      en: "No competitors in workspace.",
    },
    selectAtLeast2: {
      it: "Seleziona almeno 2 competitor per vedere il confronto.",
      en: "Select at least 2 competitors to see the comparison.",
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
      it: "Confronto competitivo basato sulle ads scrappate.",
      en: "Competitive comparison based on scraped ads.",
    },
    noData: {
      it: "Nessun dato disponibile. Aggiungi dei competitor e lancia almeno uno scan per popolare i benchmark.",
      en: "No data available. Add competitors and run at least one scan to populate benchmarks.",
    },
    comparativeAnalysis: {
      it: "Analisi comparativa su",
      en: "Comparative analysis on",
    },
    adsOf: { it: "ads di", en: "ads from" },
    competitorsWord: { it: "competitor.", en: "competitors." },
    totalAds: { it: "Ads totali", en: "Total ads" },
    activeAds: { it: "Ads attive", en: "Active ads" },
    avgCampaignDuration: {
      it: "Durata media campagna",
      en: "Avg. campaign duration",
    },
    avgCopyLength: { it: "Lungh. media copy", en: "Avg. copy length" },
    volumePerCompetitor: {
      it: "Volume ads per competitor",
      en: "Ad volume per competitor",
    },
    globalFormatMix: { it: "Format mix (globale)", en: "Format mix (global)" },
    formatPerCompetitor: {
      it: "Format mix per competitor",
      en: "Format mix per competitor",
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
    onPlatforms: { it: "Su:", en: "On:" },
    saveToCollection: { it: "Salva in collezione", en: "Save to collection" },
    notAnalyzed: { it: "Non analizzata dall'AI", en: "Not analyzed by AI" },
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
      it: "Board di ispirazione. Salva ads dalla Creative Library o dai competitor.",
      en: "Inspiration boards. Save ads from the Creative Library or competitors.",
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
    allTagged: { it: "Tutte le ads sono già state analizzate.", en: "All ads have already been analyzed." },
    allTaggedBtn: { it: "Tutto analizzato", en: "All analyzed" },
    allTaggedTooltip: { it: "Tutte le ads di questo competitor sono state analizzate dall'AI.", en: "All ads from this competitor have been analyzed by AI." },
    toTag: { it: "ads da analizzare", en: "ads to analyze" },
    toAnalyze: { it: "da analizzare", en: "to analyze" },
    complete: { it: "Analisi completata", en: "Analysis complete" },
    aiTag: { it: "AI Tag", en: "AI Tag" },
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
