// Jobs: posting, editing, closing, and the public job board search.
import { PAGE_SIZE } from "../constants";
import { q, q1, tx, type Queryable } from "../db";
import type { JobInput, JobSearch } from "../validation";
import { mustBe, type Actor } from "./actor";
import { decodeCursor, encodeCursor } from "./cursor";
import { ConflictError, NotFoundError, RuleError } from "./errors";

export type JobCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget_type: "fixed" | "hourly";
  budget_min_kobo: number;
  budget_max_kobo: number;
  experience_level: string;
  location_type: string;
  state: string | null;
  deadline: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: Date;
  client_id: string;
  client_name: string;
  skills: { slug: string; name: string }[];
  proposal_count: number;
};

// One SELECT list shared by every job query, so cards always have the same shape.
const JOB_COLUMNS = `
  j.id, j.title, j.description, j.category, j.budget_type, j.budget_min_kobo, j.budget_max_kobo,
  j.experience_level, j.location_type, j.state, to_char(j.deadline, 'YYYY-MM-DD') AS deadline,
  j.status, j.created_at, j.client_id, u.name AS client_name,
  COALESCE((SELECT json_agg(json_build_object('slug', s.slug, 'name', s.name) ORDER BY s.name)
              FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = j.id), '[]') AS skills,
  (SELECT count(*)::int FROM proposals p WHERE p.job_id = j.id AND p.status <> 'withdrawn') AS proposal_count`;

/**
 * The public job board. ONE query, built from the filters. User input only
 * ever goes into the params array ($1, $2...); the SQL text is made of fixed
 * fragments, so there's no way to inject SQL through a search box.
 *
 * Pagination is keyset ("give me the 12 jobs after this one"), not OFFSET.
 * OFFSET 1200 makes Postgres read and throw away 1,200 rows, and if a new job is
 * posted while you're paging, everything shifts and you see a job twice. A
 * cursor of (sort value, id) is fast at any depth and stable.
 */
export async function searchJobs(s: JobSearch) {
  const params: unknown[] = [];
  const p = (v: unknown) => `$${params.push(v)}`;
  // Demo visitors' jobs stay out of the public board (they're only for that visitor).
  const where = ["j.status = 'open'", "NOT u.is_demo"];

  if (s.q) where.push(`j.search @@ websearch_to_tsquery('english', ${p(s.q)})`);
  if (s.category) where.push(`j.category = ${p(s.category)}`);
  if (s.budgetType) where.push(`j.budget_type = ${p(s.budgetType)}`);
  if (s.experience) where.push(`j.experience_level = ${p(s.experience)}`);
  if (s.location) where.push(`j.location_type = ${p(s.location)}`);
  // minBudget is in naira in the URL; the column is kobo.
  if (s.minBudget) where.push(`j.budget_max_kobo >= ${p(s.minBudget * 100)}`);
  if (s.skill)
    where.push(`EXISTS (SELECT 1 FROM job_skills js JOIN skills sk ON sk.id = js.skill_id
                        WHERE js.job_id = j.id AND sk.slug = ${p(s.skill)})`);

  // The tie-breaker (id) makes the order total: two jobs with the same budget
  // still have a fixed order, so no job is skipped or repeated between pages.
  const cursor = decodeCursor(s.cursor);
  let order: string;
  if (s.sort === "budget") {
    if (cursor) where.push(`(j.budget_max_kobo, j.id) < (${p(Number(cursor[0]) || 0)}, ${p(cursor[1])}::uuid)`);
    order = "j.budget_max_kobo DESC, j.id DESC";
  } else {
    if (cursor && !Number.isNaN(Date.parse(cursor[0]))) where.push(`(j.created_at, j.id) < (${p(cursor[0])}::timestamptz, ${p(cursor[1])}::uuid)`);
    order = "j.created_at DESC, j.id DESC";
  }

  // Ask for one extra row: if it comes back, there's a next page.
  const rows = await q<JobCard>(
    `SELECT ${JOB_COLUMNS} FROM jobs j JOIN users u ON u.id = j.client_id
      WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${PAGE_SIZE + 1}`,
    params,
  );
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor(s.sort === "budget" ? [String(last.budget_max_kobo), last.id] : [last.created_at.toISOString(), last.id])
      : null;
  return { jobs: page, nextCursor };
}

export async function latestJobs(limit = 4) {
  return q<JobCard>(
    `SELECT ${JOB_COLUMNS} FROM jobs j JOIN users u ON u.id = j.client_id
      WHERE j.status = 'open' AND NOT u.is_demo ORDER BY j.created_at DESC, j.id DESC LIMIT $1`,
    [limit],
  );
}

/**
 * One job, as `viewer` is allowed to see it. Open jobs are public. Once a job
 * is filled or closed, only its client, an admin, or a freelancer who sent a
 * proposal can still open it; for everyone else it's "not found".
 */
export async function getJob(viewer: Actor | null, jobId: string) {
  const job = await q1<JobCard>(
    `SELECT ${JOB_COLUMNS} FROM jobs j JOIN users u ON u.id = j.client_id WHERE j.id = $1`,
    [jobId],
  );
  if (!job) throw new NotFoundError("That job");
  const isOwner = viewer?.id === job.client_id;
  let myProposal: { id: string; status: string; bid_kobo: number; duration_days: number; cover_letter: string } | null = null;
  if (viewer?.role === "freelancer") {
    myProposal = await q1(
      "SELECT id, status, bid_kobo, duration_days, cover_letter FROM proposals WHERE job_id = $1 AND freelancer_id = $2",
      [jobId, viewer.id],
    );
  }
  if (job.status !== "open" && !isOwner && viewer?.role !== "admin" && !myProposal) {
    throw new NotFoundError("That job");
  }
  return { job, isOwner, myProposal };
}

/** Replace a job's skills. Unknown slugs are an error, not silently dropped. */
async function setJobSkills(db: Queryable, jobId: string, slugs: string[]) {
  await db.query("DELETE FROM job_skills WHERE job_id = $1", [jobId]);
  const res = await db.query(
    "INSERT INTO job_skills (job_id, skill_id) SELECT $1, id FROM skills WHERE slug = ANY($2::text[])",
    [jobId, slugs],
  );
  if (res.rowCount !== slugs.length) throw new RuleError("One of those skills doesn't exist.", "skills");
}

const jobParams = (i: JobInput) => [
  i.title, i.description, i.category, i.budgetType, i.budgetMin, i.budgetMax,
  i.experienceLevel, i.locationType, i.state, i.deadline,
];

export async function createJob(actor: Actor | null, input: JobInput): Promise<string> {
  const client = mustBe(actor, "client");
  // The job and its skills are written together, or not at all.
  return tx(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO jobs (title, description, category, budget_type, budget_min_kobo, budget_max_kobo,
                         experience_level, location_type, state, deadline, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [...jobParams(input), client.id],
    );
    const id = rows[0]!.id;
    await setJobSkills(db, id, input.skills);
    return id;
  });
}

/**
 * Lock the job row and check ownership in the SAME statement. `client_id = $2`
 * is the ownership check: someone else's job id simply finds no row, which we
 * report as "not found". FOR UPDATE makes a second edit or an accept wait until
 * this transaction finishes, so they can't interleave.
 */
async function lockOwnJob(db: Queryable, clientId: string, jobId: string) {
  const { rows } = await db.query<{ id: string; status: string; title: string }>(
    "SELECT id, status, title FROM jobs WHERE id = $1 AND client_id = $2 FOR UPDATE",
    [jobId, clientId],
  );
  if (!rows[0]) throw new NotFoundError("That job");
  return rows[0];
}

export async function updateJob(actor: Actor | null, jobId: string, input: JobInput) {
  const client = mustBe(actor, "client");
  await tx(async (db) => {
    const job = await lockOwnJob(db, client.id, jobId);
    if (job.status !== "open") throw new ConflictError("Only open jobs can be edited.");
    await db.query(
      `UPDATE jobs SET title = $1, description = $2, category = $3, budget_type = $4,
              budget_min_kobo = $5, budget_max_kobo = $6, experience_level = $7,
              location_type = $8, state = $9, deadline = $10
        WHERE id = $11`,
      [...jobParams(input), jobId],
    );
    await setJobSkills(db, jobId, input.skills);
  });
}

/** Close an open job without hiring. Pending proposals are declined. */
export async function closeJob(actor: Actor | null, jobId: string) {
  const client = mustBe(actor, "client");
  await tx(async (db) => {
    const job = await lockOwnJob(db, client.id, jobId);
    if (job.status !== "open") throw new ConflictError("This job is already closed.");
    await db.query("UPDATE jobs SET status = 'closed' WHERE id = $1", [jobId]);
    await db.query(
      `UPDATE proposals SET status = 'declined', decided_at = now()
        WHERE job_id = $1 AND status IN ('submitted', 'shortlisted')`,
      [jobId],
    );
  });
}

/** A client's own jobs with proposal counts by status, for their dashboard. */
export async function listClientJobs(actor: Actor | null) {
  const client = mustBe(actor, "client");
  return q<{
    id: string; title: string; status: string; created_at: Date; budget_type: string;
    budget_min_kobo: number; budget_max_kobo: number;
    total: number; new_count: number; shortlisted: number; contract_id: string | null;
  }>(
    `SELECT j.id, j.title, j.status, j.created_at, j.budget_type, j.budget_min_kobo, j.budget_max_kobo,
            count(p.id) FILTER (WHERE p.status <> 'withdrawn')::int AS total,
            count(p.id) FILTER (WHERE p.status = 'submitted')::int AS new_count,
            count(p.id) FILTER (WHERE p.status = 'shortlisted')::int AS shortlisted,
            (SELECT c.id FROM contracts c WHERE c.job_id = j.id) AS contract_id
       FROM jobs j LEFT JOIN proposals p ON p.job_id = j.id
      WHERE j.client_id = $1
      GROUP BY j.id ORDER BY j.created_at DESC`,
    [client.id],
  );
}

/** The job's current values, for the edit form. Owner only. */
export async function getOwnJobForEdit(actor: Actor | null, jobId: string) {
  const client = mustBe(actor, "client");
  const job = await q1<JobCard>(
    `SELECT ${JOB_COLUMNS} FROM jobs j JOIN users u ON u.id = j.client_id WHERE j.id = $1 AND j.client_id = $2`,
    [jobId, client.id],
  );
  if (!job) throw new NotFoundError("That job");
  return job;
}

export async function listSkills() {
  return q<{ slug: string; name: string }>("SELECT slug, name FROM skills ORDER BY name");
}
