import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { budgetText } from "@/components/cards";
import { EmptyState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import { listMyContracts } from "@/lib/services/contracts";
import { listClientJobs } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Client dashboard" };

export default function ClientHome() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your dashboard" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const me = await requireActor("client");
  const [jobs, contracts] = await Promise.all([listClientJobs(me), listMyContracts(me)]);
  const open = jobs.filter((j) => j.status === "open");
  const toReview = jobs.reduce((n, j) => n + j.new_count, 0);
  const active = contracts.filter((c) => c.status === "active");

  return (
    <>
      <PageHeader
        eyebrow="Client dashboard"
        title={`Hello, ${me.name.split(" ")[0]}`}
        actions={<Link href="/client/jobs/new" className="btn btn-primary">Post a job</Link>}
      />
      <dl className="mb-8 grid grid-cols-3 gap-3">
        {[
          ["Open jobs", open.length],
          ["New proposals", toReview],
          ["Active contracts", active.length],
        ].map(([label, n]) => (
          <div key={label} className="card p-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="font-display text-3xl font-semibold text-brand tabular">{n}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="my-jobs">
        <h2 id="my-jobs" className="mb-3 text-2xl font-semibold">Your jobs</h2>
        {jobs.length === 0 ? (
          <EmptyState title="You haven't posted a job yet" action={<Link href="/client/jobs/new" className="btn btn-primary">Post your first job</Link>}>
            Describe the work and your budget. Freelancers will start sending proposals.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id} className={`card flex flex-wrap items-center gap-4 p-4 ${j.new_count ? "border-l-4 border-l-brand" : ""}`}>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/client/jobs/${j.id}`} className="text-lg font-semibold text-brand hover:underline">{j.title}</Link>
                    <StatusBadge status={j.status} />
                  </div>
                  <p className="text-sm text-ink-muted">
                    <span className="tabular">{budgetText(j)}</span> · posted {timeAgo(j.created_at)}
                  </p>
                </div>
                <p className="text-sm tabular">
                  <span className="font-bold">{j.total}</span> proposal{j.total === 1 ? "" : "s"}
                  {j.new_count > 0 && <span className="ml-2 chip">{j.new_count} new</span>}
                  {j.shortlisted > 0 && <span className="ml-2 text-ink-muted">{j.shortlisted} shortlisted</span>}
                </p>
                {j.contract_id ? (
                  <Link className="btn btn-secondary btn-sm" href={`/contracts/${j.contract_id}`}>View contract</Link>
                ) : (
                  <Link className="btn btn-soft btn-sm" href={`/client/jobs/${j.id}`}>Review proposals</Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-contracts" className="mt-10">
        <h2 id="my-contracts" className="mb-3 text-2xl font-semibold">Contracts</h2>
        {contracts.length === 0 ? (
          <p className="text-ink-muted">When you hire someone, the contract appears here.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {contracts.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/contracts/${c.id}`} className="font-semibold text-brand hover:underline">{c.job_title}</Link>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">With {c.freelancer_name} · <span className="tabular">{naira(c.amount_kobo)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
