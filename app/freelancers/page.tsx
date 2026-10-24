import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FreelancerCard } from "@/components/cards";
import { ActiveFilters, FilterSelect, SearchLayout, type Chip } from "@/components/filters";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { STATES } from "@/lib/constants";
import { listSkills } from "@/lib/services/jobs";
import { searchFreelancers } from "@/lib/services/profiles";
import { firstValues, hrefWith } from "@/lib/url";
import { freelancerSearchSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Find talent" };

const AVAILABILITY = [
  { value: "available", label: "Available now" },
  { value: "busy", label: "Busy" },
  { value: "away", label: "Away" },
];

export default function FreelancersPage(props: PageProps<"/freelancers">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading freelancers" />}>
      <Freelancers {...props} />
    </Suspense>
  );
}

async function Freelancers({ searchParams }: PageProps<"/freelancers">) {
  const s = freelancerSearchSchema.parse(firstValues(await searchParams));
  const [{ freelancers, nextCursor }, skills] = await Promise.all([searchFreelancers(s), listSkills()]);
  const current: Record<string, string | undefined> = {
    q: s.q, skill: s.skill, state: s.state, maxRate: s.maxRate?.toString(), availability: s.availability,
    sort: s.sort === "newest" ? undefined : s.sort,
  };
  const chips: Chip[] = [
    s.q && { key: "q", label: `“${s.q}”` },
    s.skill && { key: "skill", label: skills.find((k) => k.slug === s.skill)?.name ?? s.skill },
    s.state && { key: "state", label: s.state },
    s.maxRate && { key: "maxRate", label: `Up to ₦${s.maxRate.toLocaleString("en-NG")}/hr` },
    s.availability && { key: "availability", label: AVAILABILITY.find((a) => a.value === s.availability)!.label },
  ].filter(Boolean) as Chip[];

  return (
    <div className="container-page py-8">
      <PageHeader title="Find talent" subtitle="Skilled freelancers across Nigeria, with honest reviews from real contracts." />
      <SearchLayout
        filters={
          <form method="get" action="/freelancers" className="card space-y-4 p-4" role="search" aria-label="Filter freelancers">
            <div>
              <label htmlFor="flt-q" className="label text-sm">Keywords</label>
              <input id="flt-q" name="q" type="search" defaultValue={s.q ?? ""} placeholder="e.g. brand designer" className="input" />
            </div>
            <FilterSelect name="skill" label="Skill" value={s.skill} options={skills.map((k) => ({ value: k.slug, label: k.name }))} />
            <FilterSelect name="state" label="State" value={s.state} options={STATES.map((st) => ({ value: st, label: st }))} />
            <FilterSelect name="availability" label="Availability" value={s.availability} options={AVAILABILITY} />
            <div>
              <label htmlFor="flt-rate" className="label text-sm">Hourly rate up to (₦)</label>
              <input id="flt-rate" name="maxRate" inputMode="numeric" pattern="[0-9]*" defaultValue={s.maxRate ?? ""} className="input" />
            </div>
            <FilterSelect name="sort" label="Sort by" value={s.sort} any="Newest first" options={[{ value: "rate", label: "Lowest rate" }]} />
            <button className="btn btn-primary w-full">Show freelancers</button>
          </form>
        }
      >
        <ActiveFilters path="/freelancers" current={current} chips={chips} />
        <p role="status" className="mb-4 text-sm font-semibold text-ink-muted">
          {freelancers.length === 0 ? "No freelancers match" : `Showing ${freelancers.length}${nextCursor ? "+" : ""} freelancer${freelancers.length === 1 ? "" : "s"}`}
        </p>
        {freelancers.length === 0 ? (
          <EmptyState title="Nobody matches these filters" action={chips.length ? <Link className="btn btn-secondary" href="/freelancers">Clear all filters</Link> : undefined}>
            {chips.length ? `Try removing “${chips.at(-1)!.label}”.` : "Freelancers appear here once they finish their profile."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {freelancers.map((f) => <FreelancerCard key={f.user_id} f={f} />)}
          </div>
        )}
        <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-3">
          {s.cursor && <Link className="btn btn-secondary" href={hrefWith("/freelancers", current, {})}>← Back to first page</Link>}
          {nextCursor && <Link className="btn btn-primary" href={hrefWith("/freelancers", current, { cursor: nextCursor })}>Next page →</Link>}
        </nav>
      </SearchLayout>
    </div>
  );
}
