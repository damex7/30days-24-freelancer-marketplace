// Contracts (created by acceptProposal) and the reviews left when one ends.
import { pgCode, q, q1, tx, type Queryable } from "../db";
import { link, sendEmail } from "../email";
import { mustBe, type Actor } from "./actor";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { addSystemMessage } from "./messages";

export type ContractView = {
  id: string; job_id: string; job_title: string; status: "active" | "completed" | "cancelled";
  amount_kobo: number; started_at: Date; ended_at: Date | null;
  client_id: string; client_name: string; client_email: string;
  freelancer_id: string; freelancer_name: string; freelancer_email: string;
  duration_days: number; conversation_id: string | null;
};

const CONTRACT_SQL = `
  SELECT k.id, k.job_id, j.title AS job_title, k.status, k.amount_kobo, k.started_at, k.ended_at,
         k.client_id, cu.name AS client_name, cu.email AS client_email,
         k.freelancer_id, fu.name AS freelancer_name, fu.email AS freelancer_email,
         p.duration_days, c.id AS conversation_id
    FROM contracts k
    JOIN jobs j ON j.id = k.job_id
    JOIN proposals p ON p.id = k.proposal_id
    JOIN users cu ON cu.id = k.client_id
    JOIN users fu ON fu.id = k.freelancer_id
    LEFT JOIN conversations c ON c.job_id = k.job_id AND c.freelancer_id = k.freelancer_id`;

/** A contract, visible only to its two parties and admins. */
export async function getContract(actor: Actor | null, contractId: string) {
  const me = mustBe(actor, "client", "freelancer", "admin");
  const k = await q1<ContractView>(
    `${CONTRACT_SQL} WHERE k.id = $1 AND ($3::boolean OR $2 IN (k.client_id, k.freelancer_id))`,
    [contractId, me.id, me.role === "admin"],
  );
  if (!k) throw new NotFoundError("That contract");
  const reviews = await q<{ reviewer_id: string; rating: number; comment: string; created_at: Date }>(
    "SELECT reviewer_id, rating, comment, created_at FROM reviews WHERE contract_id = $1",
    [contractId],
  );
  return {
    contract: k,
    myReview: reviews.find((r) => r.reviewer_id === me.id) ?? null,
    theirReview: reviews.find((r) => r.reviewer_id !== me.id) ?? null,
  };
}

export async function listMyContracts(actor: Actor | null) {
  const me = mustBe(actor, "client", "freelancer");
  return q<ContractView>(
    `${CONTRACT_SQL} WHERE $1 IN (k.client_id, k.freelancer_id)
      ORDER BY (k.status = 'active') DESC, k.started_at DESC`,
    [me.id],
  );
}

/** Lock an active contract I'm part of. */
async function lockMyContract(db: Queryable, actorId: string, contractId: string) {
  const { rows } = await db.query<{ id: string; status: string; job_id: string; client_id: string; freelancer_id: string }>(
    `SELECT id, status, job_id, client_id, freelancer_id FROM contracts
      WHERE id = $1 AND $2 IN (client_id, freelancer_id) FOR UPDATE`,
    [contractId, actorId],
  );
  if (!rows[0]) throw new NotFoundError("That contract");
  if (rows[0].status !== "active") throw new ConflictError("This contract has already ended.");
  return rows[0];
}

async function endContract(actor: Actor, contractId: string, outcome: "completed" | "cancelled") {
  await tx(async (db) => {
    const k = await lockMyContract(db, actor.id, contractId);
    // Only the client confirms the work is done; either side may cancel.
    if (outcome === "completed" && k.client_id !== actor.id)
      throw new ForbiddenError("Only the client can mark a contract as completed.");
    await db.query("UPDATE contracts SET status = $1, ended_at = now() WHERE id = $2", [outcome, contractId]);
    await db.query("UPDATE jobs SET status = 'closed' WHERE id = $1", [k.job_id]);
    const conv = await db.query<{ id: string }>(
      "SELECT id FROM conversations WHERE job_id = $1 AND freelancer_id = $2",
      [k.job_id, k.freelancer_id],
    );
    if (conv.rows[0])
      await addSystemMessage(
        db, conv.rows[0].id,
        outcome === "completed" ? `${actor.name} marked the contract as completed.` : `${actor.name} cancelled the contract.`,
      );
  });
  const { contract: k } = await getContract(actor, contractId);
  const other = actor.id === k.client_id
    ? { email: k.freelancer_email, name: k.freelancer_name }
    : { email: k.client_email, name: k.client_name };
  await sendEmail({
    to: other.email,
    subject: `Contract ${outcome}: "${k.job_title}"`,
    text: `Hi ${other.name},\n\n${actor.name} marked your contract for "${k.job_title}" as ${outcome}.${
      outcome === "completed" ? "\n\nYou can now leave a review." : ""
    }\n\n${link(`/contracts/${contractId}`)}`,
  });
}

export async function completeContract(actor: Actor | null, id: string) {
  await endContract(mustBe(actor, "client"), id, "completed");
}
export async function cancelContract(actor: Actor | null, id: string) {
  await endContract(mustBe(actor, "client", "freelancer"), id, "cancelled");
}

/**
 * Leave a review once a contract is completed. The reviewee is always "the
 * other party", worked out here on the server, never taken from the form, so
 * nobody can post a review about a stranger.
 */
export async function leaveReview(
  actor: Actor | null,
  contractId: string,
  input: { rating: number; comment: string },
) {
  const me = mustBe(actor, "client", "freelancer");
  const k = await q1<{ status: string; client_id: string; freelancer_id: string }>(
    "SELECT status, client_id, freelancer_id FROM contracts WHERE id = $1 AND $2 IN (client_id, freelancer_id)",
    [contractId, me.id],
  );
  if (!k) throw new NotFoundError("That contract");
  if (k.status !== "completed") throw new ConflictError("You can review once the contract is completed.");
  const revieweeId = me.id === k.client_id ? k.freelancer_id : k.client_id;
  try {
    await q(
      "INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5)",
      [contractId, me.id, revieweeId, input.rating, input.comment],
    );
  } catch (e) {
    if (pgCode(e) === "23505") throw new ConflictError("You've already reviewed this contract.");
    throw e;
  }
}
