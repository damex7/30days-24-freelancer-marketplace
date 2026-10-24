import Link from "next/link";
import { categoryLabel, experienceLabel, locationLabel } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import type { JobCard as Job } from "@/lib/services/jobs";
import type { FreelancerCard as Freelancer } from "@/lib/services/profiles";
import { SkillTags, Stars, StatusBadge } from "./ui";

export function budgetText(j: { budget_type: string; budget_min_kobo: number; budget_max_kobo: number }) {
  const range = j.budget_min_kobo === j.budget_max_kobo
    ? naira(j.budget_min_kobo)
    : `${naira(j.budget_min_kobo)} – ${naira(j.budget_max_kobo)}`;
  return j.budget_type === "hourly" ? `${range} / hr` : range;
}

export function JobCard({ job, headingLevel = 2 }: { job: Job; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="card relative flex flex-col gap-3 p-5 transition-colors hover:border-brand">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        <span>{categoryLabel(job.category)}</span>
        <span aria-hidden="true">·</span>
        <span>Posted {timeAgo(job.created_at)}</span>
        {job.status !== "open" && <StatusBadge status={job.status} />}
      </div>
      <H className="text-xl font-semibold">
        {/* The ::after makes the whole card clickable while keeping one link for screen readers. */}
        <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 after:rounded-2xl hover:underline">
          {job.title}
        </Link>
      </H>
      <p className="line-clamp-2 text-ink-muted">{job.description}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-bold text-ink tabular">{budgetText(job)}</span>
        <span>{experienceLabel(job.experience_level)}</span>
        <span>{locationLabel(job.location_type)}{job.state ? `, ${job.state}` : ""}</span>
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
        <SkillTags skills={job.skills} />
        <span className="text-sm text-ink-muted tabular">
          {job.proposal_count} proposal{job.proposal_count === 1 ? "" : "s"}
        </span>
      </div>
    </article>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "size-20 text-2xl" : size === "sm" ? "size-9 text-sm" : "size-12 text-base";
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-brand font-display font-semibold text-on-brand ${cls}`}>
      {initials(name)}
    </span>
  );
}

export function FreelancerCard({ f, headingLevel = 2 }: { f: Freelancer; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="card relative flex flex-col gap-3 p-5 transition-colors hover:border-brand">
      <div className="flex items-start gap-3">
        <Avatar name={f.name} />
        <div className="min-w-0">
          <H className="text-lg font-semibold">
            <Link href={`/freelancers/${f.user_id}`} className="after:absolute after:inset-0 after:rounded-2xl hover:underline">
              {f.name}
            </Link>
          </H>
          <p className="text-sm text-ink-muted">{f.city}, {f.state}</p>
        </div>
        <div className="ml-auto"><StatusBadge status={f.availability} /></div>
      </div>
      <p className="font-semibold text-ink">{f.headline}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-bold tabular">{naira(f.hourly_rate_kobo)}/hr</span>
        <Stars rating={f.avg_rating} count={f.review_count} />
        {f.completed_jobs > 0 && <span className="text-ink-muted">{f.completed_jobs} job{f.completed_jobs === 1 ? "" : "s"} done</span>}
      </div>
      <div className="relative z-10"><SkillTags skills={f.skills.slice(0, 5)} /></div>
    </article>
  );
}
