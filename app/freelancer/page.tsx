import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import { listMyContracts } from "@/lib/services/contracts";
import { getMyProfile } from "@/lib/services/profiles";
import { listMyProposals } from "@/lib/services/proposals";

export const metadata: Metadata = { title: "Freelancer dashboard" };

export default function FreelancerHome() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading your dashboard" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const me = await requireActor("freelancer");
  const [{ profile }, proposals, contracts] = await Promise.all([getMyProfile(me), listMyProposals(me), listMyContracts(me)]);
  const live = proposals.filter((p) => p.status === "submitted" || p.status === "shortlisted");
  const earned = contracts.filter((c) => c.status === "completed").reduce((n, c) => n + c.amount_kobo, 0);

  return (
    <>
      <PageHeader
        eyebrow="Freelancer dashboard"
        title={`Hello, ${me.name.split(" ")[0]}`}
        actions={<Link href="/jobs" className="btn btn-primary">Find work</Link>}
      />
      {!profile && (
        <div className="mb-8 rounded-2xl border-2 border-brand bg-lavender p-5 text-on-lavender">
          <p className="font-display text-xl font-semibold">Finish your profile to start applying</p>
          <p className="mt-1">Clients read your profile before anything else. It takes about three minutes.</p>
          <Link href="/freelancer/profile" className="btn btn-primary mt-4">Complete my profile</Link>
        </div>
      )}
      <dl className="mb-8 grid grid-cols-3 gap-3">
        {[
          ["Live proposals", String(live.length)],
          ["Active contracts", String(contracts.filter((c) => c.status === "active").length)],
          ["Earned", naira(earned)],
        ].map(([label, v]) => (
          <div key={label} className="card p-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="font-display text-2xl font-semibold text-brand tabular sm:text-3xl">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="contracts">
        <h2 id="contracts" className="mb-3 text-2xl font-semibold">Contracts</h2>
        {contracts.length === 0 ? (
          <p className="text-ink-muted">When a client hires you, the contract appears here.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {contracts.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/contracts/${c.id}`} className="font-semibold text-brand hover:underline">{c.job_title}</Link>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">For {c.client_name} · <span className="tabular">{naira(c.amount_kobo)}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="proposals" className="mt-10">
        <h2 id="proposals" className="mb-3 text-2xl font-semibold">Your proposals</h2>
        {proposals.length === 0 ? (
          <EmptyState title="No proposals yet" action={<Link href="/jobs" className="btn btn-primary">Browse open jobs</Link>}>
            Find a job that fits your skills and send your first proposal.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <Link href={`/jobs/${p.job_id}`} className="font-semibold text-brand hover:underline">{p.job_title}</Link>
                  <p className="text-sm text-ink-muted">
                    {p.client_name} · <span className="tabular">{naira(p.bid_kobo)}</span> in {p.duration_days} days · sent {timeAgo(p.created_at)}
                  </p>
                </div>
                <StatusBadge status={p.status} />
                {p.conversation_id && <Link href={`/messages/${p.conversation_id}`} className="btn btn-soft btn-sm">Chat</Link>}
                {p.contract_id && <Link href={`/contracts/${p.contract_id}`} className="btn btn-secondary btn-sm">Contract</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
