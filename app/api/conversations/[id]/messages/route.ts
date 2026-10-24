// GET  /api/conversations/:id/messages?after=123   new messages (what polling asks for)
// GET  /api/conversations/:id/messages?before=123  an older page
// POST /api/conversations/:id/messages             send { body, nonce }
import { z } from "zod";
import { apiError, json, sameOrigin } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { listMessages, sendMessage } from "@/lib/services/messages";
import { messageSchema, uuidSchema } from "@/lib/validation";

const query = z.object({
  after: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().min(1).optional(),
});

export async function GET(req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    const url = new URL(req.url);
    const q = query.parse({ after: url.searchParams.get("after") ?? undefined, before: url.searchParams.get("before") ?? undefined });
    return json(await listMessages(await currentActor(), id, q));
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    const input = messageSchema.parse(await req.json());
    return json({ message: await sendMessage(await currentActor(), id, input) }, 201);
  } catch (e) {
    return apiError(e);
  }
}
