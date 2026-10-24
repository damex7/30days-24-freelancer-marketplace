// Proposals: a freelancer applies to a job; the job's client shortlists,
// declines or accepts. Accepting creates a contract.
//
//   submitted ──► shortlisted ──► accepted   (creates the contract)
//       │              │
//       ├──────────────┴──► declined          (by the client, or when the job closes)
//       └──────────────┴──► withdrawn         (by the freelancer)
import { rateLimit } from "../auth/rate-limit";
import { pgCode, q, q1, tx, type Queryable } from "../db";
import { link, sendEmail } from "../email";
import { naira } from "../money";
import type { ProposalInput } from "../validation";
import { mustBe, type Actor } from "./actor";
import { ConflictError, NotFoundError, RuleError } from "./errors";
import { addSystemMessage, ensureConversation } from "./messages";

const EDITABLE = ["submitted", "shortlisted"];

export async function submitProposal(actor: Actor | null, jobId: string, input: ProposalInput): Promise<string> {
  const me = mustBe(actor, "freelancer");
  const profile = await q1("SELECT 1 FROM freelancer_profiles WHERE user_id = $1", [me.id]);
  if (!profile) throw new RuleError("Finish your profile before sending proposals. Clients will read it first.");
  if (!(await rateLimit(`proposal:${me.id}`, 20, 3600))) {
    throw new ConflictError("You've sent a lot of proposals in the last hour. Try again later.");
  }

  const { proposalId, job } = await tx(async (db) => {
    // FOR SHARE: other proposals can be submitted at the same time, but the
    // client can't close the job or accept someone (both take FOR UPDATE) until
    // we've finished. So we never add a proposal to a job that just closed.
    const { rows } = await db.query<{ status: string; title: string; client_email: string; client_name: string }>(
      `SELECT j.status, j.title, u.email AS client_email, u.name AS client_name
         FROM jobs j JOIN users u ON u.id = j.client_id WHERE j.id = $1 FOR SHARE OF j`,
      [jobId],
    );
    const job = rows[0];
    if (!job) throw new NotFoundError("That job");
    if (job.status !== "open") throw new ConflictError("This job is no longer taking proposals.");
    try {
      const ins = await db.query<{ id: string }>(
        `INSERT INTO proposals (job_id, freelancer_id, cover_letter, bid_kobo, duration_days)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [jobId, me.id, input.coverLetter, input.bid, input.durationDays],
      );
      return { proposalId: ins.rows[0]!.id, job };
    } catch (e) {
      // UNIQUE (job_id, freelancer_id): a double-click can't create two proposals.
      if (pgCode(e) === "23505") throw new ConflictError("You've already sent a proposal for this job.");
      throw e;
    }
  });

  await sendEmail({
    to: job.client_email,
    subject: `New proposal for "${job.title}"`,
    text: `Hi ${job.client_name},\n\n${me.name} sent a proposal: ${naira(input.bid)} in ${input.durationDays} day(s).\n\nReview it here: ${link(`/client/jobs/${jobId}`)}`,
  });
  return proposalId;
}

/** Lock my own proposal (and its job). Someone else's proposal is "not found". */
async function lockOwnProposal(db: Queryable, freelancerId: string, proposalId: string) {
  const { rows } = await db.query<{ id: string; status: string; job_id: string; job_status: string }>(
    `SELECT p.id, p.status, p.job_id, j.status AS job_status
       FROM proposals p JOIN jobs j ON j.id = p.job_id
      WHERE p.id = $1 AND p.freelancer_id = $2 FOR UPDATE OF p, j`,
    [proposalId, freelancerId],
  );
  if (!rows[0]) throw new NotFoundError("That proposal");
  return rows[0];
}

export async function updateProposal(actor: Actor | null, proposalId: string, input: ProposalInput) {
  const me = mustBe(actor, "freelancer");
  await tx(async (db) => {
    const p = await lockOwnProposal(db, me.id, proposalId);
    if (!EDITABLE.includes(p.status) || p.job_status !== "open")
      throw new ConflictError("This proposal can't be changed any more.");
    await db.query(
      "UPDATE proposals SET cover_letter = $1, bid_kobo = $2, duration_days = $3 WHERE id = $4",
      [input.coverLetter, input.bid, input.durationDays, proposalId],
    );
  });
}

export async function withdrawProposal(actor: Actor | null, proposalId: string) {
  const me = mustBe(actor, "freelancer");
  await tx(async (db) => {
    const p = await lockOwnProposal(db, me.id, proposalId);
    if (!EDITABLE.includes(p.status)) throw new ConflictError("This proposal can't be withdrawn now.");
    await db.query("UPDATE proposals SET status = 'withdrawn', decided_at = now() WHERE id = $1", [proposalId]);
  });
}

/**
 * Lock a proposal AND its job, but only if the job belongs to this client.
 * `j.client_id = $2` is the ownership check; there's no separate "can they?" step
 * that could be forgotten. Locking both rows means two tabs accepting two
 * different proposals for the same job run one after the other, never together.
 */
async function lockProposalForClient(db: Queryable, clientId: string, proposalId: string) {
  const { rows } = await db.query<{
    id: string; status: string; job_id: string; job_status: string; job_title: string;
    freelancer_id: string; bid_kobo: number; freelancer_email: string; freelancer_name: string;
  }>(
    `SELECT p.id, p.status, p.job_id, j.status AS job_status, j.title AS job_title,
            p.freelancer_id, p.bid_kobo, f.email AS freelancer_email, f.name AS freelancer_name
       FROM proposals p
       JOIN jobs j ON j.id = p.job_id
       JOIN users f ON f.id = p.freelancer_id
      WHERE p.id = $1 AND j.client_id = $2
        FOR UPDATE OF p, j`,
    [proposalId, clientId],
  );
  if (!rows[0]) throw new NotFoundError("That proposal");
  return rows[0];
}

export async function setProposalStatus(
  actor: Actor | null,
  proposalId: string,
  status: "shortlisted" | "declined",
) {
  const client = mustBe(actor, "client");
  const p = await tx(async (db) => {
    const p = await lockProposalForClient(db, client.id, proposalId);
    if (p.job_status !== "open") throw new ConflictError("This job is no longer open.");
    if (!EDITABLE.includes(p.status)) throw new ConflictError("This proposal has already been decided.");
    await db.query(
      `UPDATE proposals SET status = $1, decided_at = CASE WHEN $1 = 'declined' THEN now() END WHERE id = $2`,
      [status, proposalId],
    );
    return p;
  });
  if (status === "declined") {
    await sendEmail({
      to: p.freelancer_email,
      subject: `Update on your proposal for "${p.job_title}"`,
      text: `Hi ${p.freelancer_name},\n\nThe client has decided not to go ahead with your proposal for "${p.job_title}". Thank you for applying.\n\nFind more work: ${link("/jobs")}`,
    });
  }
}

/**
 * Accept one proposal. Everything happens in one transaction:
 *   1. lock the proposal and its job (ownership checked in the same query)
 *   2. mark it accepted, decline the other pending proposals, mark the job in progress
 *   3. create the contract, copying the bid as the agreed amount
 *   4. open (or reuse) the conversation and post "Contract started" in it
 * If anything fails, none of it happens. And even if the locking were removed,
 * the database would still refuse a second accept: proposals_one_accepted_per_job
 * and contracts.job_id UNIQUE both allow only one per job.
 */
export async function acceptProposal(actor: Actor | null, proposalId: string): Promise<string> {
  const client = mustBe(actor, "client");
  const { contractId, p, conversationId } = await tx(async (db) => {
    const p = await lockProposalForClient(db, client.id, proposalId);
    if (p.job_status !== "open") throw new ConflictError("You've already hired for this job.");
    if (!EDITABLE.includes(p.status)) throw new ConflictError("This proposal can't be accepted.");

    await db.query("UPDATE proposals SET status = 'accepted', decided_at = now() WHERE id = $1", [proposalId]);
    await db.query(
      `UPDATE proposals SET status = 'declined', decided_at = now()
        WHERE job_id = $1 AND id <> $2 AND status IN ('submitted', 'shortlisted')`,
      [p.job_id, proposalId],
    );
    await db.query("UPDATE jobs SET status = 'in_progress' WHERE id = $1", [p.job_id]);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO contracts (job_id, proposal_id, client_id, freelancer_id, amount_kobo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [p.job_id, proposalId, client.id, p.freelancer_id, p.bid_kobo],
    );
    const conversationId = await ensureConversation(db, p.job_id, client.id, p.freelancer_id);
    await addSystemMessage(db, conversationId, `${client.name} hired ${p.freelancer_name} for ${naira(p.bid_kobo)}. Contract started.`);
    return { contractId: rows[0]!.id, p, conversationId };
  });

  await sendEmail({
    to: p.freelancer_email,
    subject: `You're hired: "${p.job_title}"`,
    text: `Congratulations ${p.freelancer_name}!\n\n${client.name} accepted your proposal for "${p.job_title}" at ${naira(p.bid_kobo)}.\n\nContract: ${link(`/contracts/${contractId}`)}\nChat: ${link(`/messages/${conversationId}`)}`,
  });
  return contractId;
}

/** All proposals for one of MY jobs, with each freelancer's profile summary. */
export async function listProposalsForJob(actor: Actor | null, jobId: string) {
  const client = mustBe(actor, "client");
  const owns = await q1("SELECT 1 FROM jobs WHERE id = $1 AND client_id = $2", [jobId, client.id]);
  if (!owns) throw new NotFoundError("That job");
  return q<{
    id: string; status: string; cover_letter: string; bid_kobo: number; duration_days: number;
    created_at: Date; freelancer_id: string; freelancer_name: string; headline: string | null;
    hourly_rate_kobo: number | null; state: string | null; avg_rating: number | null;
    review_count: number; conversation_id: string | null;
  }>(
    `SELECT p.id, p.status, p.cover_letter, p.bid_kobo, p.duration_days, p.created_at,
            u.id AS freelancer_id, u.name AS freelancer_name,
            fp.headline, fp.hourly_rate_kobo, fp.state,
            r.avg_rating, COALESCE(r.review_count, 0) AS review_count,
            c.id AS conversation_id
       FROM proposals p
       JOIN users u ON u.id = p.freelancer_id
       LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT round(avg(rating), 1)::float8 AS avg_rating, count(*)::int AS review_count
           FROM reviews WHERE reviewee_id = u.id
       ) r ON true
       LEFT JOIN conversations c ON c.job_id = p.job_id AND c.freelancer_id = p.freelancer_id
      WHERE p.job_id = $1 AND p.status <> 'withdrawn'
      ORDER BY CASE p.status WHEN 'accepted' THEN 0 WHEN 'shortlisted' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END,
               p.created_at`,
    [jobId],
  );
}

/** A freelancer's own proposals, newest first. */
export async function listMyProposals(actor: Actor | null) {
  const me = mustBe(actor, "freelancer");
  return q<{
    id: string; status: string; bid_kobo: number; duration_days: number; created_at: Date;
    job_id: string; job_title: string; job_status: string; client_name: string;
    conversation_id: string | null; contract_id: string | null;
  }>(
    `SELECT p.id, p.status, p.bid_kobo, p.duration_days, p.created_at,
            j.id AS job_id, j.title AS job_title, j.status AS job_status, u.name AS client_name,
            c.id AS conversation_id, k.id AS contract_id
       FROM proposals p
       JOIN jobs j ON j.id = p.job_id
       JOIN users u ON u.id = j.client_id
       LEFT JOIN conversations c ON c.job_id = p.job_id AND c.freelancer_id = p.freelancer_id
       LEFT JOIN contracts k ON k.proposal_id = p.id
      WHERE p.freelancer_id = $1
      ORDER BY p.created_at DESC`,
    [me.id],
  );
}
