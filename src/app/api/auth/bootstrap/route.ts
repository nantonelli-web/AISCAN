import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(120),
  workspaceName: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { userId, email, name, workspaceName } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mait_bootstrap_user", {
    p_user_id: userId,
    p_email: email,
    p_name: name,
    p_workspace_name: workspaceName,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
