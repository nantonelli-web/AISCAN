import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * After the user picks a "From" date in a range, hand focus to the
 * paired "To" input and pop its calendar open — so they don't have
 * to find and click the second field themselves.
 *
 * Deferred to the next tick because the browser is still mid-dismiss
 * on the From popup; calling showPicker() synchronously inside the
 * change handler races with that animation and Chrome quietly drops
 * the request. focus() alone is the safe fallback when showPicker()
 * throws (Safari pre-16.4, lost user activation, etc).
 */
/** Extract the YouTube video ID from any of the watch / share / embed
 *  URL forms silva returns. Returns the 11-char ID or null. Used by
 *  Compare and the ad-detail page to substitute the unplayable YouTube
 *  watch URL with a real thumbnail (`i.ytimg.com/vi/{ID}/hqdefault.jpg`)
 *  and a click-out link to YouTube. */
export function youtubeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
  return m ? m[1] : null;
}

/** True only if the URL points at a media file the HTML <video> element
 *  can actually play — i.e. NOT a YouTube/Vimeo watch URL, which need
 *  an iframe embed and otherwise render as a black rectangle. */
export function isPlayableVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return false;
  return true;
}

export function jumpToDateInput(el: HTMLInputElement | null): void {
  if (!el) return;
  setTimeout(() => {
    try {
      el.focus();
      el.showPicker?.();
    } catch {
      // showPicker can throw without a fresh user activation — the
      // focus() above already moved the cursor, which is enough.
    }
  }, 0);
}
