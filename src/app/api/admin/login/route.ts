import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminToken } from "@/lib/admin-jwt";
import { checkRate, recordAttempt } from "@/lib/rate-limit/admin-login";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  try {
    const { email: rawEmail, password } = await request.json();

    if (!rawEmail || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const email = String(rawEmail).toLowerCase().trim();
    const ip = getClientIp(request);
    const supabase = createAdminClient();

    const gate = await checkRate(supabase, { email, ip });
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts, try again later" },
        { status: 429 }
      );
    }

    const { data: admin, error } = await supabase
      .from("mait_admins")
      .select("id, email, password_hash, name, role")
      .eq("email", email)
      .single();

    // Always run a bcrypt comparison so response time does not leak whether
    // the email exists. Compare against a dummy hash when the row is missing.
    const dummyHash = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.tDmvl6ZvF3AfP1wG2JvxVGCfJc6W";
    const hash = admin?.password_hash ?? dummyHash;
    const valid = await bcrypt.compare(password, hash);

    if (error || !admin || !valid) {
      await recordAttempt(supabase, { email, ip, success: false });
      return NextResponse.json(
        { ok: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    await recordAttempt(supabase, { email, ip, success: true });

    const token = await createAdminToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    // Secure cookie everywhere except local `next dev` (localhost HTTP).
    // Vercel preview + production are both served over HTTPS.
    const isLocalDev = process.env.NODE_ENV === "development";

    const response = NextResponse.json({ ok: true });
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: !isLocalDev,
      sameSite: "lax",
      maxAge: 60 * 60 * 4, // 4 hours — matches JWT TTL
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
