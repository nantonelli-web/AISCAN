import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyzeCopy,
  analyzeVisuals,
  type BrandAdData,
  type CreativeAnalysisResult,
} from "@/lib/ai/creative-analysis";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 120;

const schema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(2).max(3),
  locale: z.enum(["it", "en"]).optional(),
});

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credit check
  const credit = await consumeCredits(user.id, "ai_analysis", "AI Creative Analysis");
  if (!credit.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credit.balance },
      { status: 402 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch ads from the last 10 days per competitor (cap at 12)
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const brands: BrandAdData[] = await Promise.all(
    parsed.data.competitor_ids.map(async (id) => {
      const [{ data: comp }, { data: ads }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_ads_external")
          .select("headline, ad_text, description, cta, image_url")
          .eq("competitor_id", id)
          .gte("created_at", tenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      return {
        brandName: comp?.page_name ?? "Unknown",
        competitorId: id,
        ads: (ads ?? []) as {
          headline: string | null;
          ad_text: string | null;
          description: string | null;
          cta: string | null;
          image_url: string | null;
        }[],
      };
    })
  );

  // Run both agents in parallel — if one fails, the other still returns
  const [copywriterReport, creativeDirectorReport] = await Promise.all([
    analyzeCopy(brands, parsed.data.locale ?? "it"),
    analyzeVisuals(brands, parsed.data.locale ?? "it"),
  ]);

  const result: CreativeAnalysisResult = {
    copywriterReport,
    creativeDirectorReport,
  };

  if (!copywriterReport && !creativeDirectorReport) {
    await refundCredits(user.id, "ai_analysis", "AI Creative Analysis");
    return NextResponse.json(
      { error: "Both AI agents failed. Check OPENROUTER_API_KEY and model availability." },
      { status: 502 }
    );
  }

  return NextResponse.json(result);
}
