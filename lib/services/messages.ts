// Messaging. A conversation belongs to exactly two people: a job's client and a
// freelancer who sent a proposal for that job. Every function here starts by
// proving the actor is one of those two people. Nobody else, not even an admin,
// can read a conversation: private messages stay private.
import { rateLimit } from "../auth/rate-limit";
import { pool, q, q1, tx, type Queryable } from "../db";
import { link, sendEmail } from "../email";
import { mustBe, type Actor } from "./actor";
import { ConflictError, NotFoundError } from "./errors";

export type Message = {
  id: number;
  sender_id: string | null;
  kind: "text" | "system";
  body: string;
  created_at: Date;
};

const MSG_COLUMNS = "id, sender_id, kind, body, created_at";

/**
 * Create the conversation for (job, freelancer) if it doesn't exist yet, plus a
 * participant row for each side. ON CONFLICT makes it safe to call twice at the
 * same time: both calls end up with the same conversation.
 */
export async function ensureConversation(
  db: Queryable, jobId: string, clientId: string, freelancerId: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO conversations (job_id, client_id, freelancer_id) VALUES ($1, $2, $3)
     ON CONFLICT (job_id, freelancer_id) DO UPDATE SET job_id = EXCLUDED.job_id
     RETURNING id`,
    [jobId, clientId, freelancerId],
  );
  const id = rows[0]!.id;
  await db.query(
    `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
     ON CONFLICT DO NOTHING`,
    [id, clientId, freelancerId],
  );
  return id;
}

/** Adds a "system" line to a thread, e.g. "Contract started". */
export async function addSystemMessage(db: Queryable, conversationId: string, body: string) {
  await db.query("INSERT INTO messages (conversation_id, kind, body) VALUES ($1, 'system', $2)", [conversationId, body]);
  await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
}

/**
 * Only a client can START a conversation, and only with someone who applied to
 * one of their jobs. Freelancers can't cold-message clients, which stops spam.
 * Once it exists, both sides can write freely.
 */
export async function openConversationForProposal(actor: Actor | null, proposalId: string): Promise<string> {
  const client = mustBe(actor, "client");
  return tx(async (db) => {
    const { rows } = await db.query<{ job_id: string; freelancer_id: string; status: string }>(
      `SELECT p.job_id, p.freelancer_id, p.status FROM proposals p JOIN jobs j ON j.id = p.job_id
        WHERE p.id = $1 AND j.client_id = $2`,
      [proposalId, client.id],
    );
    const p = rows[0];
    if (!p) throw new NotFoundError("That proposal");
    if (p.status === "withdrawn") throw new ConflictError("This proposal was withdrawn.");
    return ensureConversation(db, p.job_id, client.id, p.freelancer_id);
  });
}

/** Proves the actor is in the conversation. Anyone else gets "not found". */
async function assertParticipant(actorId: string, conversationId: string, db: Queryable = pool()) {
  const row = await q1<{ last_read_message_id: number }>(
    "SELECT last_read_message_id FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2",
    [conversationId, actorId],
    db,
  );
  if (!row) throw new NotFoundError("That conversation");
  return row;
}

export async function listConversations(actor: Actor | null) {
  const me = mustBe(actor, "client", "freelancer");
  return q<{
    id: string; job_id: string; job_title: string; last_message_at: Date;
    other_id: string; other_name: string;
    last_body: string | null; last_kind: string | null; last_sender_id: string | null; unread: number;
  }>(
    `SELECT c.id, c.job_id, j.title AS job_title, c.last_message_at,
            other.id AS other_id, other.name AS other_name,
            lm.body AS last_body, lm.kind AS last_kind, lm.sender_id AS last_sender_id,
            (SELECT count(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.id > me.last_read_message_id
                AND m.sender_id IS DISTINCT FROM $1)::int AS unread
       FROM conversation_participants me
       JOIN conversations c ON c.id = me.conversation_id
       JOIN jobs j ON j.id = c.job_id
       JOIN users other ON other.id = CASE WHEN c.client_id = $1 THEN c.freelancer_id ELSE c.client_id END
       LEFT JOIN LATERAL (
         SELECT body, kind, sender_id FROM messages m
          WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1
       ) lm ON true
      WHERE me.user_id = $1
      ORDER BY c.last_message_at DESC`,
    [me.id],
  );
}

export async function getConversation(actor: Actor | null, conversationId: string) {
  const me = mustBe(actor, "client", "freelancer");
  const { last_read_message_id } = await assertParticipant(me.id, conversationId);
  const conv = await q1<{
    id: string; job_id: string; job_title: string; job_status: string;
    client_id: string; freelancer_id: string; other_id: string; other_name: string;
    proposal_id: string | null; proposal_status: string | null; contract_id: string | null;
  }>(
    `SELECT c.id, c.job_id, j.title AS job_title, j.status AS job_status, c.client_id, c.freelancer_id,
            other.id AS other_id, other.name AS other_name,
            p.id AS proposal_id, p.status AS proposal_status,
            (SELECT k.id FROM contracts k WHERE k.job_id = c.job_id AND k.freelancer_id = c.freelancer_id) AS contract_id
       FROM conversations c
       JOIN jobs j ON j.id = c.job_id
       JOIN users other ON other.id = CASE WHEN c.client_id = $2 THEN c.freelancer_id ELSE c.client_id END
       LEFT JOIN proposals p ON p.job_id = c.job_id AND p.freelancer_id = c.freelancer_id
      WHERE c.id = $1`,
    [conversationId, me.id],
  );
  if (!conv) throw new NotFoundError("That conversation");
  return { ...conv, lastReadId: last_read_message_id };
}

/**
 * Messages in a thread. With `after`, only newer messages (what polling asks
 * for). With `before`, an older page. Otherwise the latest 50.
 * Always returned oldest-first, ready to display.
 */
export async function listMessages(
  actor: Actor | null,
  conversationId: string,
  opts: { after?: number; before?: number; limit?: number } = {},
): Promise<{ messages: Message[]; hasOlder: boolean }> {
  const me = mustBe(actor, "client", "freelancer");
  await assertParticipant(me.id, conversationId);
  const limit = Math.min(opts.limit ?? 50, 100);
  if (opts.after !== undefined) {
    const messages = await q<Message>(
      `SELECT ${MSG_COLUMNS} FROM messages WHERE conversation_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
      [conversationId, opts.after, limit],
    );
    return { messages, hasOlder: false };
  }
  // Newest page first (DESC + LIMIT uses the index), then flip to oldest-first.
  const rows = await q<Message>(
    `SELECT ${MSG_COLUMNS} FROM messages
      WHERE conversation_id = $1 ${opts.before !== undefined ? "AND id < $3" : ""}
      ORDER BY id DESC LIMIT $2`,
    opts.before !== undefined ? [conversationId, limit + 1, opts.before] : [conversationId, limit + 1],
  );
  return { messages: rows.slice(0, limit).reverse(), hasOlder: rows.length > limit };
}

export async function sendMessage(
  actor: Actor | null,
  conversationId: string,
  input: { body: string; nonce: string },
): Promise<Message> {
  const me = mustBe(actor, "client", "freelancer");
  await assertParticipant(me.id, conversationId);
  if (!(await rateLimit(`msg:${me.id}`, 30, 60))) {
    throw new ConflictError("You're sending messages too fast. Wait a minute and try again.");
  }

  const { message, created } = await tx(async (db) => {
    // The nonce makes sending idempotent: if the browser retries the same
    // message (a slow network, a double tap), the second insert does nothing
    // and we return the message that's already there.
    const { rows } = await db.query<Message>(
      `INSERT INTO messages (conversation_id, sender_id, body, client_nonce) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, client_nonce) DO NOTHING RETURNING ${MSG_COLUMNS}`,
      [conversationId, me.id, input.body, input.nonce],
    );
    if (!rows[0]) {
      const existing = await db.query<Message>(
        `SELECT ${MSG_COLUMNS} FROM messages WHERE sender_id = $1 AND client_nonce = $2 AND conversation_id = $3`,
        [me.id, input.nonce, conversationId],
      );
      if (!existing.rows[0]) throw new ConflictError("That message id was already used.");
      return { message: existing.rows[0], created: false };
    }
    await db.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
    // You've obviously read your own message.
    await db.query(
      `UPDATE conversation_participants SET last_read_message_id = GREATEST(last_read_message_id, $3)
        WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, me.id, rows[0].id],
    );
    return { message: rows[0], created: true };
  });

  if (created) await notifyRecipient(me, conversationId, message);
  return message;
}

/**
 * Email the other person, but only for the FIRST unread message. If they
 * haven't opened the thread since, more messages don't send more emails.
 * That's the difference between a useful alert and an inbox full of noise.
 */
async function notifyRecipient(sender: Actor, conversationId: string, message: Message) {
  const r = await q1<{ email: string; name: string; unread: number; job_title: string }>(
    `SELECT u.email, u.name, j.title AS job_title,
            (SELECT count(*) FROM messages m
              WHERE m.conversation_id = cp.conversation_id AND m.id > cp.last_read_message_id
                AND m.sender_id IS DISTINCT FROM cp.user_id)::int AS unread
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       JOIN conversations c ON c.id = cp.conversation_id
       JOIN jobs j ON j.id = c.job_id
      WHERE cp.conversation_id = $1 AND cp.user_id <> $2`,
    [conversationId, sender.id],
  );
  if (!r || r.unread !== 1) return;
  const preview = message.body.length > 200 ? `${message.body.slice(0, 200)}…` : message.body;
  await sendEmail({
    to: r.email,
    subject: `New message from ${sender.name} about "${r.job_title}"`,
    text: `Hi ${r.name},\n\n${sender.name} sent you a message:\n\n"${preview}"\n\nReply here: ${link(`/messages/${conversationId}`)}\n\nYou won't get another email for this chat until you've read it.`,
  });
}

/** Move my read pointer forward (never backward) to the newest message I've seen. */
export async function markRead(actor: Actor | null, conversationId: string, upToId: number) {
  const me = mustBe(actor, "client", "freelancer");
  await q(
    `UPDATE conversation_participants
        SET last_read_message_id = GREATEST(
              last_read_message_id,
              LEAST($3, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = $1)))
      WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, me.id, upToId],
  );
}

/** Total unread messages across all my conversations, for the header badge. */
export async function unreadTotal(actor: Actor | null): Promise<number> {
  if (!actor || actor.role === "admin") return 0;
  const row = await q1<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM conversation_participants cp
       JOIN messages m ON m.conversation_id = cp.conversation_id
      WHERE cp.user_id = $1 AND m.id > cp.last_read_message_id AND m.sender_id IS DISTINCT FROM $1`,
    [actor.id],
  );
  return row?.n ?? 0;
}
