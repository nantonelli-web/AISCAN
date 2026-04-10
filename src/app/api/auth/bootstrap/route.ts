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
  const slug = `ws-${userId.slice(0, 8)}`;

  const { data: ws, error: wsErr } = await admin
    .from("mait_workspaces")
    .insert({ name: workspaceName, slug })
    .select("id")
    .single();

  if (wsErr || !ws) {
    return NextResponse.json(
      { error: wsErr?.message ?? "Workspace creation failed" },
      { status: 500 }
    );
  }

  const { error: userErr } = await admin.from("mait_users").insert({
    id: userId,
    email,
    name,
    role: "admin",
    workspace_id: ws.id,
  });

  if (userErr) {
    await admin.from("mait_workspaces").delete().eq("id", ws.id);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  return NextResponse.json({ workspaceId: ws.id });
}
