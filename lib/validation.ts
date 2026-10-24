// Every form, route handler and search parameter is parsed here with Zod.
// The browser's own checks (required, maxLength) are only a convenience: anyone
// can send a request by hand, so the server always validates again.
import { z } from "zod";
import { CATEGORY_VALUES, MAX_FREELANCER_SKILLS, MAX_JOB_SKILLS, STATES } from "./constants";
import { parseNairaToKobo } from "./money";

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} can be at most ${max} characters.`);

/** A naira amount typed by a person, turned into integer kobo without floats. */
const nairaField = (label: string, minNaira = 1) =>
  z.string().transform((v, ctx) => {
    const kobo = parseNairaToKobo(v);
    if (kobo === null) {
      ctx.addIssue({ code: "custom", message: `Enter ${label} as a number, like 150000.` });
      return z.NEVER;
    }
    if (kobo < minNaira * 100) {
      ctx.addIssue({ code: "custom", message: `${label} must be at least ₦${minNaira.toLocaleString("en-NG")}.` });
      return z.NEVER;
    }
    return kobo;
  });

const skillSlugs = (max: number) =>
  z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .min(1, "Pick at least one skill.")
    .max(max, `Pick at most ${max} skills.`)
    .transform((s) => [...new Set(s)]);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const signupSchema = z.object({
  name: text(2, 80, "Your name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use at most 128 characters."),
  role: z.enum(["client", "freelancer"], { error: "Choose whether you're hiring or working." }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
});

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const jobSchema = z
  .object({
    title: text(10, 120, "Title"),
    description: text(50, 5000, "Description"),
    category: z.enum(CATEGORY_VALUES, { error: "Choose a category." }),
    budgetType: z.enum(["fixed", "hourly"], { error: "Choose fixed price or hourly." }),
    budgetMin: nairaField("the minimum budget", 1000),
    budgetMax: nairaField("the maximum budget", 1000),
    experienceLevel: z.enum(["entry", "intermediate", "expert"], { error: "Choose an experience level." }),
    locationType: z.enum(["remote", "hybrid", "onsite"], { error: "Choose where the work happens." }),
    state: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.enum(STATES, { error: "Choose a state." }).nullable()),
    deadline: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.iso.date({ error: "Use a real date." }).nullable()),
    skills: skillSlugs(MAX_JOB_SKILLS),
  })
  .superRefine((v, ctx) => {
    if (v.budgetMax < v.budgetMin)
      ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "The maximum can't be less than the minimum." });
    if (v.locationType !== "remote" && !v.state)
      ctx.addIssue({ code: "custom", path: ["state"], message: "Hybrid and on-site jobs need a state." });
    if (v.deadline) {
      const today = lagosToday();
      if (v.deadline <= today)
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "The deadline must be after today." });
      else if (v.deadline > addDays(today, 365))
        ctx.addIssue({ code: "custom", path: ["deadline"], message: "The deadline must be within a year." });
    }
  });
export type JobInput = z.infer<typeof jobSchema>;

// ── Proposals ────────────────────────────────────────────────────────────────
export const proposalSchema = z.object({
  coverLetter: text(50, 3000, "Cover letter"),
  bid: nairaField("your bid", 500),
  durationDays: z.coerce
    .number({ error: "Enter a number of days." })
    .int("Use whole days.")
    .min(1, "At least 1 day.")
    .max(365, "At most 365 days."),
});
export type ProposalInput = z.infer<typeof proposalSchema>;

// ── Profiles ─────────────────────────────────────────────────────────────────
export const profileSchema = z.object({
  headline: text(10, 100, "Headline"),
  bio: text(50, 2000, "About you"),
  hourlyRate: nairaField("your hourly rate", 500),
  state: z.enum(STATES, { error: "Choose your state." }),
  city: text(2, 60, "City"),
  yearsExperience: z.coerce
    .number({ error: "Enter a number." })
    .int("Use whole years.")
    .min(0, "Can't be negative.")
    .max(50, "At most 50 years."),
  availability: z.enum(["available", "busy", "away"]),
  skills: skillSlugs(MAX_FREELANCER_SKILLS),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const portfolioSchema = z.object({
  title: text(3, 80, "Title"),
  url: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https$/, error: "Use a full https:// link." })),
  description: z.string().trim().max(300, "At most 300 characters."),
});
export type PortfolioInput = z.infer<typeof portfolioSchema>;

// ── Messages and reviews ─────────────────────────────────────────────────────
export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a message first.")
    .max(4000, "Messages can be at most 4,000 characters."),
  nonce: z.uuid(),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  comment: z.string().trim().max(1000, "At most 1,000 characters."),
});

export const uuidSchema = z.uuid();

// ── Search (from the URL) ────────────────────────────────────────────────────
// .catch() means a bad value in the URL falls back to the default instead of
// crashing the page: /jobs?sort=banana just shows the newest jobs.
const optionalText = z.string().trim().max(100).optional().catch(undefined);
const cursorField = z.string().max(200).optional().catch(undefined);

export const jobSearchSchema = z.object({
  q: optionalText,
  category: z.enum(CATEGORY_VALUES).optional().catch(undefined),
  skill: z.string().regex(/^[a-z0-9-]+$/).optional().catch(undefined),
  budgetType: z.enum(["fixed", "hourly"]).optional().catch(undefined),
  experience: z.enum(["entry", "intermediate", "expert"]).optional().catch(undefined),
  location: z.enum(["remote", "hybrid", "onsite"]).optional().catch(undefined),
  minBudget: z.coerce.number().int().min(1).max(1_000_000_000).optional().catch(undefined),
  sort: z.enum(["newest", "budget"]).default("newest").catch("newest"),
  cursor: cursorField,
});
export type JobSearch = z.infer<typeof jobSearchSchema>;

export const freelancerSearchSchema = z.object({
  q: optionalText,
  skill: z.string().regex(/^[a-z0-9-]+$/).optional().catch(undefined),
  state: z.enum(STATES).optional().catch(undefined),
  maxRate: z.coerce.number().int().min(1).max(100_000_000).optional().catch(undefined),
  availability: z.enum(["available", "busy", "away"]).optional().catch(undefined),
  sort: z.enum(["newest", "rate"]).default("newest").catch("newest"),
  cursor: cursorField,
});
export type FreelancerSearch = z.infer<typeof freelancerSearchSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Today's date in Lagos as YYYY-MM-DD (a deadline is a Lagos calendar day). */
export function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** FormData → plain object. Fields listed in `arrays` are read with getAll(). */
export function formToObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = arrays.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? "");
  }
  for (const a of arrays) if (!(a in out)) out[a] = [];
  return out;
}
