/**
 * Lista valute usate nei picker per export advertising.
 * Le valute "primarie" (Gulf + globali piu' diffuse) sono in cima
 * cosi l'utente le seleziona velocemente; il resto in ordine
 * alfabetico per ISO code.
 */

export interface CurrencyOption {
  code: string;
  label: string;
}

const PRIMARY: CurrencyOption[] = [
  { code: "AED", label: "AED — Dirham Emirati" },
  { code: "SAR", label: "SAR — Riyal Saudita" },
  { code: "QAR", label: "QAR — Riyal Qatar" },
  { code: "KWD", label: "KWD — Dinaro Kuwait" },
  { code: "BHD", label: "BHD — Dinaro Bahrain" },
  { code: "OMR", label: "OMR — Riyal Oman" },
  { code: "USD", label: "USD — Dollaro USA" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — Sterlina" },
];

const REST_RAW: CurrencyOption[] = [
  { code: "ARS", label: "ARS — Peso Argentino" },
  { code: "AUD", label: "AUD — Dollaro Australiano" },
  { code: "BRL", label: "BRL — Real Brasiliano" },
  { code: "CAD", label: "CAD — Dollaro Canadese" },
  { code: "CHF", label: "CHF — Franco Svizzero" },
  { code: "CLP", label: "CLP — Peso Cileno" },
  { code: "CNY", label: "CNY — Renminbi" },
  { code: "COP", label: "COP — Peso Colombiano" },
  { code: "CZK", label: "CZK — Corona Ceca" },
  { code: "DKK", label: "DKK — Corona Danese" },
  { code: "EGP", label: "EGP — Sterlina Egiziana" },
  { code: "HKD", label: "HKD — Dollaro Hong Kong" },
  { code: "HUF", label: "HUF — Fiorino Ungherese" },
  { code: "IDR", label: "IDR — Rupia Indonesiana" },
  { code: "ILS", label: "ILS — Shekel Israeliano" },
  { code: "INR", label: "INR — Rupia Indiana" },
  { code: "JPY", label: "JPY — Yen Giapponese" },
  { code: "KRW", label: "KRW — Won Sud-Coreano" },
  { code: "MAD", label: "MAD — Dirham Marocchino" },
  { code: "MXN", label: "MXN — Peso Messicano" },
  { code: "MYR", label: "MYR — Ringgit Malaysiano" },
  { code: "NGN", label: "NGN — Naira Nigeriano" },
  { code: "NOK", label: "NOK — Corona Norvegese" },
  { code: "NZD", label: "NZD — Dollaro Neozelandese" },
  { code: "PEN", label: "PEN — Sol Peruviano" },
  { code: "PHP", label: "PHP — Peso Filippino" },
  { code: "PLN", label: "PLN — Zloty Polacco" },
  { code: "RON", label: "RON — Leu Romeno" },
  { code: "RUB", label: "RUB — Rublo Russo" },
  { code: "SEK", label: "SEK — Corona Svedese" },
  { code: "SGD", label: "SGD — Dollaro Singapore" },
  { code: "THB", label: "THB — Baht Thailandese" },
  { code: "TRY", label: "TRY — Lira Turca" },
  { code: "TWD", label: "TWD — Dollaro Taiwanese" },
  { code: "UAH", label: "UAH — Grivnia Ucraina" },
  { code: "VND", label: "VND — Dong Vietnamita" },
  { code: "ZAR", label: "ZAR — Rand Sudafricano" },
];

const REST = REST_RAW.slice().sort((a, b) => a.code.localeCompare(b.code));

export const CURRENCY_OPTIONS: ReadonlyArray<
  CurrencyOption & { group: "primary" | "rest" }
> = [
  ...PRIMARY.map((c) => ({ ...c, group: "primary" as const })),
  ...REST.map((c) => ({ ...c, group: "rest" as const })),
];
