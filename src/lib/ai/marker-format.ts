/**
 * Formato output "marker-delimited" per le narrative AI.
 *
 * PERCHÉ NON JSON: i modelli LLM, quando devono restituire testo
 * markdown freeform (paragrafi, **bold**, liste, citazioni di review
 * con virgolette, apostrofi, newline), producono spessissimo JSON
 * INVALIDO se gli chiedi `{ "section": "...testo..." }`. Basta una
 * virgoletta non-escaped dentro una citazione ("Service à la clientèle
 * 0") o una newline letterale per rompere `JSON.parse` → la
 * generazione fallisce con 502 NONOSTANTE la chiamata al modello sia
 * andata a buon fine e il contenuto sia perfetto. È un fallimento di
 * pura sintassi di trasporto, non di contenuto.
 *
 * SOLUZIONE: delimitare ogni sezione con un marcatore `@@section@@` su
 * riga propria, seguito dal testo. Il contenuto sotto il marcatore è
 * plain text e NON deve rispettare nessuna regola di escaping —
 * qualunque virgoletta/newline/markdown è lecito. Il parsing è un
 * semplice `split` sul marcatore: robusto per costruzione, non c'è
 * niente che il contenuto possa fare per romperlo (i modelli non
 * emettono `@@parola@@` nella prosa).
 */

/** Blocco di istruzioni da appendere al prompt per ottenere l'output
 *  in formato marker. `sections` sono le chiavi attese. */
export function markerOutputInstruction(
  sections: readonly string[],
  locale: "it" | "en",
): string {
  const markers = sections.map((s) => `@@${s}@@`).join("\n");
  const first = sections[0] ?? "section";
  const second = sections[1];
  if (locale === "en") {
    return `OUTPUT FORMAT — read carefully:
For each section, emit its marker on its own line, then the narrative text below it. Use these EXACT markers:
${markers}

Example shape:
@@${first}@@
First paragraph...

Second paragraph...
${second ? `@@${second}@@\n...` : ""}
Do NOT use JSON, do NOT wrap the text in quotes, do NOT add code fences or any preamble/postamble. The text under each marker is plain markdown (paragraphs separated by a blank line, optional **bold**, "- " lists).`;
  }
  return `FORMATO DI OUTPUT — leggi con attenzione:
Per ogni sezione, scrivi il suo marcatore su una riga a sé, poi sotto il testo della narrativa. Usa ESATTAMENTE questi marcatori:
${markers}

Esempio:
@@${first}@@
Primo paragrafo...

Secondo paragrafo...
${second ? `@@${second}@@\n...` : ""}
NON usare JSON, NON racchiudere il testo fra virgolette, NON aggiungere code fences o preamboli/postamboli. Il testo sotto ogni marcatore è markdown semplice (paragrafi separati da riga vuota, eventuali **bold**, liste "- ").`;
}

/**
 * Parser robusto dell'output marker. Ritorna una mappa section→testo,
 * includendo solo le chiavi in `allowed`. Tollera code fences attorno
 * all'output e virgolette/virgole residue (alcuni modelli racchiudono
 * ancora il testo come se fosse un valore JSON).
 */
export function parseMarkerSections<K extends string>(
  raw: string,
  allowed: Iterable<K>,
): Partial<Record<K, string>> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const allow = new Set<string>(allowed as Iterable<string>);
  const parts = text.split(/@@(\w+)@@/g);
  const out: Partial<Record<K, string>> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i];
    if (!allow.has(key)) continue;
    let body = (parts[i + 1] ?? "").trim();
    // Unwrap SOLO se il modello ha racchiuso il valore fra virgolette
    // JSON-style (body che inizia con "): in quel caso togliamo la "
    // iniziale e la finale (eventuale virgola di troncamento). NON
    // toccare la virgoletta finale se il body non inizia con " — il
    // contenuto può legittimamente terminare con una citazione.
    if (body.startsWith('"')) {
      body = body.replace(/^"/, "").replace(/",?$/, "").trim();
    }
    if (body) out[key as K] = body;
  }
  return out;
}

/**
 * Serializza un set di sezioni in formato marker — utile per PASSARE
 * input al modello (es. nel translate, dove la sorgente è già testo
 * markdown e infilarla in un JSON la esporrebbe allo stesso problema
 * di escaping in lettura).
 */
export function serializeMarkerSections(
  sections: { section: string; content: string }[],
): string {
  return sections.map((s) => `@@${s.section}@@\n${s.content}`).join("\n\n");
}
