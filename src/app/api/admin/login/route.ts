import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminToken } from "@/lib/admin-jwt";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: admin, error } = await supabase
      .from("mait_admins")
      .select("id, email, password_hash, name, role")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (error || !admin) {
      return NextResponse.json(
        { ok: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

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
