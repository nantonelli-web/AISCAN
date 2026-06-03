import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLLECTION_ITEM_TABLE,
  COLLECTION_ITEM_TYPES,
  type CollectionItemType,
} from "@/lib/collections/item-types";
import { logger } from "@/lib/logger";

/**
 * Add/remove a polymorphic item (any channel creative) to/from a
 * collection. Supersedes the ads-only /api/collections/[id]/ads route.
 */

const addSchema = z.object({
  item_type: z.enum(COLLECTION_ITEM_TYPES as [string, ...string[]]),
  item_id: z.string().uuid(),
});

async function collectionInWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  collectionId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("mait_collections")
    .select("workspace_id")
    .eq("id", collectionId)
    .single();
  return data?.workspace_id === workspaceId;
}

/** Verifica che la riga sorgente esista nel workspace, nella tabella
 *  del tipo. Polimorfico: niente FK, validiamo a runtime. */
async function itemInWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  itemType: CollectionItemType,
  itemId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await admin
    .from(COLLECTION_ITEM_TABLE[itemType])
    .select("workspace_id")
    .eq("id", itemId)
    .single();
  return data?.workspace_id === workspaceId;
}

async function resolveWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", userId)
    .single();
  return data?.workspace_id ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "item_type + item_id required" },
      { status: 400 },
    );
  }
  const itemType = parsed.data.item_type as CollectionItemType;

  const workspaceId = await resolveWorkspace(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const admin = createAdminClient();
  const [collOk, itemOk] = await Promise.all([
    collectionInWorkspace(admin, id, workspaceId),
    itemInWorkspace(admin, itemType, parsed.data.item_id, workspaceId),
  ]);
  if (!collOk || !itemOk)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("mait_collection_items")
    .upsert(
      { collection_id: id, item_type: itemType, item_id: parsed.data.item_id },
      { onConflict: "collection_id,item_type,item_id" },
    );
  if (error) {
    logger.error(
      "Failed to add collection item",
      {
        channel: "collections/items",
        event: "add.failed",
        workspaceId,
        userId: user.id,
        collectionId: id,
      },
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const itemType = url.searchParams.get("item_type");
  const itemId = url.searchParams.get("item_id");
  if (!itemType || !itemId || !(itemType in COLLECTION_ITEM_TABLE)) {
    return NextResponse.json(
      { error: "item_type + item_id required" },
      { status: 400 },
    );
  }

  const workspaceId = await resolveWorkspace(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const admin = createAdminClient();
  if (!(await collectionInWorkspace(admin, id, workspaceId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("mait_collection_items")
    .delete()
    .eq("collection_id", id)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) {
    logger.error(
      "Failed to remove collection item",
      {
        channel: "collections/items",
        event: "remove.failed",
        workspaceId,
        userId: user.id,
        collectionId: id,
      },
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
