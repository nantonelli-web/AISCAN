import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TikTok video proxy — same-origin pipe for the hover preview on
 * organic TikTok post cards.
 *
 * Why this exists: clockworks/tiktok-scraper exposes the direct mp4
 * URL via `videoMeta.playAddr`. When the browser embeds that URL
 * straight in a <video> element on aiscan.io, the TikTok CDN
 * (v16-webapp.tiktok.com / v19-webapp etc.) responds 403 because
 * the request lacks the expected Referer / cookies / signed headers
 * that TikTok mandates for cross-origin media reads.
 *
 * Instagram CDN (cdninstagram.com) is far more permissive about
 * cross-origin <video> reads, which is why that hover preview
 * already works without any proxy. Same pattern for ad-card video
 * URLs (Meta's fbcdn).
 *
 * This route reads the post by its post_id, validates the caller
 * has access to its workspace, and streams the upstream response
 * with the right Referer + UA so the CDN responds 200. Range
 * requests are forwarded unchanged so <video> seek/scrub still
 * works — without that the player would buffer the whole file
 * before starting and seeking would just restart playback.
 *
 * Caveat: TikTok signs playAddr URLs with a short-lived token
 * (typically 24h). Once expired the upstream returns 403 even with
 * the right Referer; the front-end falls back to the cover image.
 * Refresh the scan to regenerate playAddr URLs.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve the user's workspace so we can authorise the read.
  // Anyone in the workspace can see any TikTok post owned by it —
  // same model as the rest of the dashboard.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  const { data: post } = await admin
    .from("mait_tiktok_posts")
    .select("video_url, workspace_id")
    .eq("post_id", postId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  if (!post?.video_url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Forward Range header so the client can seek without re-buffering
  // from byte 0. Most players send `Range: bytes=0-` on first load
  // and `Range: bytes=N-` on each scrub.
  const range = req.headers.get("range") ?? undefined;

  const upstream = await fetch(post.video_url, {
    headers: {
      // TikTok CDN gates cross-origin reads on the Referer header.
      // Setting it to the canonical tiktok.com domain matches what
      // the embed/share page sends and unblocks the 403.
      referer: "https://www.tiktok.com/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ...(range ? { range } : {}),
    },
    // No credentials — the playAddr URL itself carries the signed
    // token in the query string, no cookie needed.
    cache: "no-store",
  }).catch((e) => {
    console.error("[proxy/tiktok-video] fetch failed:", e);
    return null;
  });

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Upstream error", status: upstream?.status ?? 0 },
      { status: 502 },
    );
  }

  // Pass through the headers a video player cares about: status
  // (206 Partial Content vs 200), content-type, content-length,
  // content-range and accept-ranges. Anything else (cookies, auth)
  // is dropped so we don't leak upstream state.
  const passthrough = new Headers();
  for (const k of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ]) {
    const v = upstream.headers.get(k);
    if (v) passthrough.set(k, v);
  }
  // Cap browser-side caching to 5 minutes — playAddr tokens flip
  // every few hours, so a long cache would serve dead URLs after
  // a token rotation. 5 min is enough to cover one user's hover-
  // browse session through a brand's grid.
  passthrough.set("cache-control", "private, max-age=300");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: passthrough,
  });
}
