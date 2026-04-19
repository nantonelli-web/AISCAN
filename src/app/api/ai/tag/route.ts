import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagAdsBatch, tagPostsBatch } from "@/lib/ai/tagger";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 120;

const schema = z.object({
  competitor_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * Tag untagged ads with AI. Optionally filter by competitor.
 * Only works if OPENROUTER_API_KEY is set.
 */
export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // Credit check
  const credit = await consumeCredits(user.id, "ai_tagging", "AI Tagging batch");
  if (!credit.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credit.balance },
      { status: 402 }
    );
  }

  // Find ads that don't have ai_tags yet
  let q = supabase
    .from("mait_ads_external")
    .select("id, ad_text, headline, description, cta, image_url, video_url, platforms, landing_url, raw_data")
    .eq("workspace_id", profile.workspace_id)
    .is("raw_data->ai_tags", null)
    .limit(parsed.data?.limit ?? 20);

  if (parsed.data?.competitor_id) {
    q = q.eq("competitor_id", parsed.data.competitor_id);
  }

  const { data: ads, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ads || ads.length === 0) {
    return NextResponse.json({ ok: true, tagged: 0, message: "No untagged ads found." });
  }

  const toTag = ads.map((a) => ({
    id: a.id as string,
    ad_text: a.ad_text as string | null,
    headline: a.headline as string | null,
    description: a.description as string | null,
    cta: a.cta as string | null,
    has_video: !!a.video_url,
    has_image: !!a.image_url,
    platforms: (a.platforms as string[] | null) ?? [],
    landing_url: a.landing_url as string | null,
  }));

  const results = await tagAdsBatch(toTag);

  if (results.size === 0 && toTag.length > 0) {
    await refundCredits(user.id, "ai_tagging", "AI Tagging batch");
    return NextResponse.json(
      {
        ok: false,
        tagged: 0,
        error: "AI tagging failed for all ads. Check OPENROUTER_API_KEY and model availability.",
      },
      { status: 502 }
    );
  }

  const admin = createAdminClient();
  let tagCount = 0;
  for (const [adId, tags] of results) {
    const ad = ads.find((a) => a.id === adId);
    const existingRaw = (ad?.raw_data ?? {}) as Record<string, unknown>;
    await admin
      .from("mait_ads_external")
      .update({ raw_data: { ...existingRaw, ai_tags: tags } })
      .eq("id", adId);

    // Also upsert into mait_tags + mait_ads_tags for filtering
    for (const [category, value] of Object.entries(tags)) {
      if (!value || typeof value !== "string") continue;
      const tagName = `${category}:${value}`;

      const { data: existingTag } = await admin
        .from("mait_tags")
        .select("id")
        .eq("workspace_id", profile.workspace_id)
        .eq("name", tagName)
        .single();

      let tagId: string;
      if (existingTag) {
        tagId = existingTag.id;
      } else {
        const { data: newTag } = await admin
          .from("mait_tags")
          .insert({ workspace_id: profile.workspace_id, name: tagName })
          .select("id")
          .single();
        if (!newTag) continue;
        tagId = newTag.id;
      }

      await admin
        .from("mait_ads_tags")
        .upsert({ ad_id: adId, tag_id: tagId }, { onConflict: "ad_id,tag_id" });
    }

    tagCount++;
  }

  // ─── Tag organic posts too ───
  const postLimit = Math.max(1, (parsed.data?.limit ?? 20) - tagCount);
  let postQ = supabase
    .from("mait_organic_posts")
    .select("id, caption, post_type, video_url, hashtags, raw_data")
    .eq("workspace_id", profile.workspace_id)
    .is("raw_data->ai_tags", null)
    .limit(postLimit);

  if (parsed.data?.competitor_id) {
    postQ = postQ.eq("competitor_id", parsed.data.competitor_id);
  }

  const { data: posts } = await postQ;
  let postTagCount = 0;

  if (posts && posts.length > 0) {
    const postsToTag = posts.map((p) => ({
      id: p.id as string,
      caption: p.caption as string | null,
      post_type: p.post_type as string | null,
      has_video: !!(p.video_url),
      hashtags: (p.hashtags as string[] | null) ?? [],
    }));

    const postResults = await tagPostsBatch(postsToTag);

    for (const [postId, tags] of postResults) {
      const post = posts.find((p) => p.id === postId);
      const existingRaw = (post?.raw_data ?? {}) as Record<string, unknown>;
      await admin
        .from("mait_organic_posts")
        .update({ raw_data: { ...existingRaw, ai_tags: tags } })
        .eq("id", postId);
      postTagCount++;
    }
  }

  return NextResponse.json({ ok: true, tagged: tagCount + postTagCount });
}
