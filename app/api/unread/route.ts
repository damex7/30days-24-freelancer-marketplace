// GET /api/unread → { unread: number } for the header badge.
import { connection } from "next/server";
import { apiError, json } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { unreadTotal } from "@/lib/services/messages";

export async function GET() {
  await connection(); // per-request, never prerendered at build time
  try {
    return json({ unread: await unreadTotal(await currentActor()) });
  } catch (e) {
    return apiError(e);
  }
}
