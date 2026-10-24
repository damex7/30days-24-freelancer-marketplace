// POST /api/conversations/:id/read  { upTo: <message id> }
// Moves my read pointer forward. Called when new messages are on screen.
import { z } from "zod";
import { apiError, json, sameOrigin } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { markRead } from "@/lib/services/messages";
import { uuidSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: RouteContext<"/api/conversations/[id]/read">) {
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    const { upTo } = z.object({ upTo: z.number().int().min(0) }).parse(await req.json());
    await markRead(await currentActor(), id, upTo);
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
