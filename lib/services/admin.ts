// Admin tools. Admins can see accounts, jobs and contracts and can suspend
// people or close jobs. They can NOT read private conversations.
import { q, q1, tx } from "../db";
import { mustBe, type Actor } from "./actor";
import { ConflictError, NotFoundError, RuleError } from "./errors";

async function audit(db: { query: (t: string, p: unknown[]) => Promise<unknown> }, actorId: string, action: string, targetType: string, targetId: string, details: object = {}) {
  await db.query(
    "INSERT INTO audit_events (actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)",
    [actorId, action, targetType, targetId, JSON.stringify(details)],
  );
}

export async function adminStats(actor: Actor | null) {
  mustBe(actor, "admin");
  return (await q1<{
    clients: number; freelancers: number; open_jobs: number; proposals_7d: number;
    active_contracts: number; completed_contracts: number; messages_24h: number; suspended: number;
  }>(
    `SELECT
       (SELECT count(*) FROM users WHERE role = 'client' AND NOT is_demo)::int AS clients,
       (SELECT count(*) FROM users WHERE role = 'freelancer' AND NOT is_demo)::int AS freelancers,
       (SELECT count(*) FROM jobs WHERE status = 'open')::int AS open_jobs,
       (SELECT count(*) FROM proposals WHERE created_at > now() - interval '7 days')::int AS proposals_7d,
       (SELECT count(*) FROM contracts WHERE status = 'active')::int AS active_contracts,
       (SELECT count(*) FROM contracts WHERE status = 'completed')::int AS completed_contracts,
       (SELECT count(*) FROM messages WHERE created_at > now() - interval '24 hours')::int AS messages_24h,
       (SELECT count(*) FROM users WHERE suspended_at IS NOT NULL)::int AS suspended`,
  ))!;
}

export async function adminListUsers(actor: Actor | null, search?: string) {
  mustBe(actor, "admin");
  return q<{ id: string; name: string; email: string; role: string; suspended_at: Date | null; created_at: Date; jobs: number; proposals: number }>(
    `SELECT u.id, u.name, u.email, u.role, u.suspended_at, u.created_at,
            (SELECT count(*) FROM jobs WHERE client_id = u.id)::int AS jobs,
            (SELECT count(*) FROM proposals WHERE freelancer_id = u.id)::int AS proposals
       FROM users u
      WHERE NOT u.is_demo AND ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
      ORDER BY u.created_at DESC LIMIT 50`,
    [search || null],
  );
}

export async function adminListJobs(actor: Actor | null) {
  mustBe(actor, "admin");
  return q<{ id: string; title: string; status: string; created_at: Date; client_name: string; proposals: number }>(
    `SELECT j.id, j.title, j.status, j.created_at, u.name AS client_name,
            (SELECT count(*) FROM proposals p WHERE p.job_id = j.id)::int AS proposals
       FROM jobs j JOIN users u ON u.id = j.client_id
      WHERE NOT u.is_demo ORDER BY j.created_at DESC LIMIT 30`,
  );
}

export async function adminAuditLog(actor: Actor | null) {
  mustBe(actor, "admin");
  return q<{ id: number; action: string; target_type: string; target_id: string; details: Record<string, string>; created_at: Date; actor_name: string | null }>(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.name AS actor_name
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 30`,
  );
}

/**
 * Suspend an account: they're logged out everywhere (sessions deleted), can't
 * log in again, disappear from the directory, and their open jobs close.
 * Nothing is deleted, so it can be undone.
 */
export async function suspendUser(actor: Actor | null, userId: string, reason: string) {
  const admin = mustBe(actor, "admin");
  if (userId === admin.id) throw new RuleError("You can't suspend yourself.");
  if (reason.trim().length < 5) throw new RuleError("Give a reason (at least 5 characters).", "reason");
  await tx(async (db) => {
    const { rows } = await db.query<{ role: string; suspended_at: Date | null }>(
      "SELECT role, suspended_at FROM users WHERE id = $1 AND NOT is_demo FOR UPDATE",
      [userId],
    );
    const u = rows[0];
    if (!u) throw new NotFoundError("That account");
    if (u.role === "admin") throw new RuleError("Admins can't be suspended here.");
    if (u.suspended_at) throw new ConflictError("This account is already suspended.");
    await db.query("UPDATE users SET suspended_at = now() WHERE id = $1", [userId]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await db.query(
      `UPDATE proposals SET status = 'declined', decided_at = now()
        WHERE status IN ('submitted', 'shortlisted') AND job_id IN (SELECT id FROM jobs WHERE client_id = $1 AND status = 'open')`,
      [userId],
    );
    await db.query("UPDATE jobs SET status = 'closed' WHERE client_id = $1 AND status = 'open'", [userId]);
    await audit(db, admin.id, "user.suspend", "user", userId, { reason: reason.trim() });
  });
}

export async function unsuspendUser(actor: Actor | null, userId: string) {
  const admin = mustBe(actor, "admin");
  await tx(async (db) => {
    const { rowCount } = await db.query(
      "UPDATE users SET suspended_at = NULL WHERE id = $1 AND suspended_at IS NOT NULL",
      [userId],
    );
    if (!rowCount) throw new NotFoundError("That suspended account");
    await audit(db, admin.id, "user.unsuspend", "user", userId);
  });
}

/** Take down a job that breaks the rules. Pending proposals are declined. */
export async function adminCloseJob(actor: Actor | null, jobId: string, reason: string) {
  const admin = mustBe(actor, "admin");
  if (reason.trim().length < 5) throw new RuleError("Give a reason (at least 5 characters).", "reason");
  await tx(async (db) => {
    const { rowCount } = await db.query("UPDATE jobs SET status = 'closed' WHERE id = $1 AND status = 'open'", [jobId]);
    if (!rowCount) throw new ConflictError("That job isn't open.");
    await db.query(
      "UPDATE proposals SET status = 'declined', decided_at = now() WHERE job_id = $1 AND status IN ('submitted', 'shortlisted')",
      [jobId],
    );
    await audit(db, admin.id, "job.close", "job", jobId, { reason: reason.trim() });
  });
}
