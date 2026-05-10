import { redirect } from "next/navigation";

/**
 * /collections e' stato unificato in /library?tab=collections.
 * Manteniamo il path come redirect per evitare di rompere bookmark
 * e link condivisi precedenti.
 */
export default function CollectionsRedirect() {
  redirect("/library?tab=collections");
}
