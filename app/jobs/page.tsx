import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { JobCard } from "@/components/cards";
import { ActiveFilters, FilterSelect, SearchLayout, type Chip } from "@/components/filters";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { CATEGORIES, EXPERIENCE, LOCATION_TYPES, categoryLabel, experienceLabel, locationLabel } from "@/lib/constants";
import { listSkills, searchJobs } from "@/lib/services/jobs";
import { firstValues, hrefWith } from "@/lib/url";
import { jobSearchSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Find work" };

export default function JobsPage(props: PageProps<"/jobs">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading jobs" />}>
      <Jobs {...props} />
    </Suspense>
  );
}

async function Jobs({ searchParams }: PageProps<"/jobs">) {
  const raw = firstValues(await searchParams);
  // Everything comes from the URL, validated. Bad values fall back to defaults.
  const s = jobSearchSchema.parse(raw);
  const [{ jobs, nextCursor }, skills] = await Promise.all([searchJobs(s), listSkills()]);
  const current: Record<string, string | undefined> = {
    q: s.q, category: s.category, skill: s.skill, budgetType: s.budgetType, experience: s.experience,
    location: s.location, minBudget: s.minBudget?.toString(), sort: s.sort === "newest" ? undefined : s.sort,
  };
  const chips: Chip[] = [
    s.q && { key: "q", label: `“${s.q}”` },
    s.category && { key: "category", label: categoryLabel(s.category) },
    s.skill && { key: "skill", label: skills.find((k) => k.slug === s.skill)?.name ?? s.skill },
    s.budgetType && { key: "budgetType", label: s.budgetType === "fixed" ? "Fixed price" : "Hourly" },
    s.experience && { key: "experience", label: experienceLabel(s.experience) },
    s.location && { key: "location", label: locationLabel(s.location) },
    s.minBudget && { key: "minBudget", label: `Budget ≥ ₦${s.minBudget.toLocaleString("en-NG")}` },
  ].filter(Boolean) as Chip[];

  return (
    <div className="container-page py-8">
      <PageHeader title="Find work" subtitle="Open jobs from Nigerian businesses. Newest first." />
      <SearchLayout
        filters={
          <form method="get" action="/jobs" className="card space-y-4 p-4" role="search" aria-label="Filter jobs">
            <div>
              <label htmlFor="flt-q" className="label text-sm">Keywords</label>
              <input id="flt-q" name="q" type="search" defaultValue={s.q ?? ""} placeholder="e.g. logo, Flutter, Excel" className="input" />
            </div>
            <FilterSelect name="category" label="Category" value={s.category} options={CATEGORIES} />
            <FilterSelect name="skill" label="Skill" value={s.skill} options={skills.map((k) => ({ value: k.slug, label: k.name }))} />
            <details className="group" open={Boolean(s.budgetType || s.experience || s.location || s.minBudget)}>
              <summary className="cursor-pointer font-semibold text-brand">More filters</summary>
              <div className="mt-3 space-y-4">
                <FilterSelect name="budgetType" label="Budget type" value={s.budgetType} options={[{ value: "fixed", label: "Fixed price" }, { value: "hourly", label: "Hourly" }]} />
                <FilterSelect name="experience" label="Experience level" value={s.experience} options={EXPERIENCE} />
                <FilterSelect name="location" label="Location" value={s.location} options={LOCATION_TYPES} />
                <div>
                  <label htmlFor="flt-min" className="label text-sm">Budget at least (₦)</label>
                  <input id="flt-min" name="minBudget" inputMode="numeric" pattern="[0-9]*" defaultValue={s.minBudget ?? ""} className="input" />
                </div>
              </div>
            </details>
            <FilterSelect name="sort" label="Sort by" value={s.sort} any="Newest first" options={[{ value: "budget", label: "Highest budget" }]} />
            <button className="btn btn-primary w-full">Show jobs</button>
          </form>
        }
      >
        <ActiveFilters path="/jobs" current={current} chips={chips} />
        <p role="status" className="mb-4 text-sm font-semibold text-ink-muted">
          {jobs.length === 0 ? "No jobs match" : `Showing ${jobs.length}${nextCursor ? "+" : ""} job${jobs.length === 1 ? "" : "s"}`}
          {s.cursor ? " (next page)" : ""}
        </p>
        {jobs.length === 0 ? (
          <EmptyState
            title="No jobs match these filters"
            action={chips.length ? <Link className="btn btn-secondary" href="/jobs">Clear all filters</Link> : undefined}
          >
            {chips.length ? `Try removing “${chips.at(-1)!.label}”, or search with fewer words.` : "Check back soon: new jobs are posted every day."}
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        )}
        <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-3">
          {s.cursor && <Link className="btn btn-secondary" href={hrefWith("/jobs", current, {})}>← Back to first page</Link>}
          {nextCursor && <Link className="btn btn-primary" href={hrefWith("/jobs", current, { cursor: nextCursor })}>Next page →</Link>}
        </nav>
      </SearchLayout>
    </div>
  );
}
