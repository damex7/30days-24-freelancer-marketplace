// Freelancer profiles, portfolio items, and the /freelancers directory.
import { MAX_PORTFOLIO_ITEMS, PAGE_SIZE } from "../constants";
import { q, q1, tx } from "../db";
import type { FreelancerSearch, PortfolioInput, ProfileInput } from "../validation";
import { mustBe, type Actor } from "./actor";
import { decodeCursor, encodeCursor } from "./cursor";
import { ConflictError, NotFoundError, RuleError } from "./errors";

export type FreelancerCard = {
  user_id: string;
  name: string;
  headline: string;
  hourly_rate_kobo: number;
  state: string;
  city: string;
  availability: "available" | "busy" | "away";
  years_experience: number;
  created_at: Date;
  skills: { slug: string; name: string }[];
  avg_rating: number | null;
  review_count: number;
  completed_jobs: number;
};

// Ratings are an aggregate over the reviews table, computed when read. With an
// index on reviews (reviewee_id) this is fast for the few dozen cards on a page.
// At real scale you'd store the average on the profile and update it in the same
// transaction as each new review.
const CARD_COLUMNS = `
  fp.user_id, u.name, fp.headline, fp.hourly_rate_kobo, fp.state, fp.city, fp.availability,
  fp.years_experience, fp.created_at,
  COALESCE((SELECT json_agg(json_build_object('slug', s.slug, 'name', s.name) ORDER BY s.name)
              FROM freelancer_skills fs JOIN skills s ON s.id = fs.skill_id
             WHERE fs.freelancer_id = fp.user_id), '[]') AS skills,
  r.avg_rating, COALESCE(r.review_count, 0) AS review_count,
  (SELECT count(*)::int FROM contracts k WHERE k.freelancer_id = fp.user_id AND k.status = 'completed') AS completed_jobs`;

const CARD_FROM = `
  FROM freelancer_profiles fp
  JOIN users u ON u.id = fp.user_id AND u.suspended_at IS NULL
  LEFT JOIN LATERAL (
    SELECT round(avg(rating), 1)::float8 AS avg_rating, count(*)::int AS review_count
      FROM reviews WHERE reviewee_id = fp.user_id
  ) r ON true`;

/** The /freelancers directory: one query, keyset pagination, as with jobs. */
export async function searchFreelancers(s: FreelancerSearch) {
  const params: unknown[] = [];
  const p = (v: unknown) => `$${params.push(v)}`;
  const where = ["NOT u.is_demo"]; // demo profiles are reachable by link only
  if (s.q) where.push(`fp.search @@ websearch_to_tsquery('english', ${p(s.q)})`);
  if (s.state) where.push(`fp.state = ${p(s.state)}`);
  if (s.availability) where.push(`fp.availability = ${p(s.availability)}`);
  if (s.maxRate) where.push(`fp.hourly_rate_kobo <= ${p(s.maxRate * 100)}`);
  if (s.skill)
    where.push(`EXISTS (SELECT 1 FROM freelancer_skills fs JOIN skills sk ON sk.id = fs.skill_id
                        WHERE fs.freelancer_id = fp.user_id AND sk.slug = ${p(s.skill)})`);

  const cursor = decodeCursor(s.cursor);
  let order: string;
  if (s.sort === "rate") {
    if (cursor && Number.isFinite(Number(cursor[0])))
      where.push(`(fp.hourly_rate_kobo, fp.user_id) > (${p(Number(cursor[0]))}, ${p(cursor[1])}::uuid)`);
    order = "fp.hourly_rate_kobo, fp.user_id";
  } else {
    if (cursor && !Number.isNaN(Date.parse(cursor[0])))
      where.push(`(fp.created_at, fp.user_id) < (${p(cursor[0])}::timestamptz, ${p(cursor[1])}::uuid)`);
    order = "fp.created_at DESC, fp.user_id DESC";
  }

  const rows = await q<FreelancerCard>(
    `SELECT ${CARD_COLUMNS} ${CARD_FROM} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${PAGE_SIZE + 1}`,
    params,
  );
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor(s.sort === "rate" ? [String(last.hourly_rate_kobo), last.user_id] : [last.created_at.toISOString(), last.user_id])
      : null;
  return { freelancers: page, nextCursor };
}

export async function topFreelancers(limit = 3) {
  return q<FreelancerCard>(
    `SELECT ${CARD_COLUMNS} ${CARD_FROM} WHERE NOT u.is_demo
      ORDER BY r.avg_rating DESC NULLS LAST, r.review_count DESC NULLS LAST, fp.created_at DESC LIMIT $1`,
    [limit],
  );
}

/** A public profile page: card, bio, portfolio and reviews received. */
export async function getFreelancerProfile(userId: string) {
  const card = await q1<FreelancerCard & { bio: string }>(
    `SELECT ${CARD_COLUMNS}, fp.bio ${CARD_FROM} WHERE fp.user_id = $1`,
    [userId],
  );
  if (!card) throw new NotFoundError("That freelancer");
  const [portfolio, reviews] = await Promise.all([
    q<{ id: string; title: string; url: string; description: string }>(
      "SELECT id, title, url, description FROM portfolio_items WHERE freelancer_id = $1 ORDER BY created_at",
      [userId],
    ),
    q<{ rating: number; comment: string; created_at: Date; reviewer_name: string; job_title: string }>(
      `SELECT r.rating, r.comment, r.created_at, u.name AS reviewer_name, j.title AS job_title
         FROM reviews r JOIN users u ON u.id = r.reviewer_id
         JOIN contracts k ON k.id = r.contract_id JOIN jobs j ON j.id = k.job_id
        WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [userId],
    ),
  ]);
  return { profile: card, portfolio, reviews };
}

/** My own profile for the edit form (null if I haven't made one yet). */
export async function getMyProfile(actor: Actor | null) {
  const me = mustBe(actor, "freelancer");
  const profile = await q1<{
    headline: string; bio: string; hourly_rate_kobo: number; state: string; city: string;
    years_experience: number; availability: string; skills: string[];
  }>(
    `SELECT headline, bio, hourly_rate_kobo, state, city, years_experience, availability,
            ARRAY(SELECT s.slug FROM freelancer_skills fs JOIN skills s ON s.id = fs.skill_id
                   WHERE fs.freelancer_id = fp.user_id) AS skills
       FROM freelancer_profiles fp WHERE user_id = $1`,
    [me.id],
  );
  const portfolio = await q<{ id: string; title: string; url: string; description: string }>(
    "SELECT id, title, url, description FROM portfolio_items WHERE freelancer_id = $1 ORDER BY created_at",
    [me.id],
  );
  return { profile, portfolio };
}

/** Create or update my profile and replace my skills, in one transaction. */
export async function saveProfile(actor: Actor | null, input: ProfileInput) {
  const me = mustBe(actor, "freelancer");
  await tx(async (db) => {
    // INSERT ... ON CONFLICT: the first save creates the row, later saves update it.
    await db.query(
      `INSERT INTO freelancer_profiles (user_id, headline, bio, hourly_rate_kobo, state, city, years_experience, availability)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET headline = EXCLUDED.headline, bio = EXCLUDED.bio,
         hourly_rate_kobo = EXCLUDED.hourly_rate_kobo, state = EXCLUDED.state, city = EXCLUDED.city,
         years_experience = EXCLUDED.years_experience, availability = EXCLUDED.availability`,
      [me.id, input.headline, input.bio, input.hourlyRate, input.state, input.city, input.yearsExperience, input.availability],
    );
    await db.query("DELETE FROM freelancer_skills WHERE freelancer_id = $1", [me.id]);
    const res = await db.query(
      "INSERT INTO freelancer_skills (freelancer_id, skill_id) SELECT $1, id FROM skills WHERE slug = ANY($2::text[])",
      [me.id, input.skills],
    );
    if (res.rowCount !== input.skills.length) throw new RuleError("One of those skills doesn't exist.", "skills");
  });
}

export async function addPortfolioItem(actor: Actor | null, input: PortfolioInput) {
  const me = mustBe(actor, "freelancer");
  await tx(async (db) => {
    // Lock my profile row so two quick "add" clicks can't both pass the count check.
    const { rows } = await db.query("SELECT 1 FROM freelancer_profiles WHERE user_id = $1 FOR UPDATE", [me.id]);
    if (!rows[0]) throw new RuleError("Save your profile first.");
    const { rows: c } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM portfolio_items WHERE freelancer_id = $1",
      [me.id],
    );
    if ((c[0]?.n ?? 0) >= MAX_PORTFOLIO_ITEMS)
      throw new ConflictError(`You can show up to ${MAX_PORTFOLIO_ITEMS} portfolio items.`);
    await db.query(
      "INSERT INTO portfolio_items (freelancer_id, title, url, description) VALUES ($1, $2, $3, $4)",
      [me.id, input.title, input.url, input.description],
    );
  });
}

export async function removePortfolioItem(actor: Actor | null, itemId: string) {
  const me = mustBe(actor, "freelancer");
  const rows = await q("DELETE FROM portfolio_items WHERE id = $1 AND freelancer_id = $2 RETURNING id", [itemId, me.id]);
  if (!rows[0]) throw new NotFoundError("That portfolio item");
}
