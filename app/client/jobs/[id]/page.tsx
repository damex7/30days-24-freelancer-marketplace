import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  acceptProposalAction, closeJobAction, decideProposalAction, messageFreelancerAction,
} from "@/app/actions/jobs";
import { Avatar, budgetText } from "@/components/cards";
import { ActionButton } from "@/components/form";
import { EmptyState, PageHeader, PageSkeleton, Stars, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import { NotFoundError } from "@/lib/services/errors";
import { getOwnJobForEdit } from "@/lib/services/jobs";
import { listProposalsForJob } from "@/lib/services/proposals";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Manage job" };

export default function ManageJobPage(props: PageProps<"/client/jobs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading proposals" />}>
      <ManageJob {...props} />
    </Suspense>
  );
}

async function ManageJob({ params, searchParams }: PageProps<"/client/jobs/[id]">) {
  const me = await requireActor("client");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let job, proposals;
  try {
    // Both calls check that this job is MINE. Another client's job id is a 404.
    [job, proposals] = await Promise.all([getOwnJobForEdit(me, id), listProposalsForJob(me, id)]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const sp = await searchParams;
  const open = job.status === "open";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link className="link" href="/client">← Dashboard</Link></nav>
      {sp.posted && (
        <p role="status" className="mb-6 rounded-2xl bg-lavender p-4 font-semibold text-on-lavender">
          ✓ Your job is live. You&apos;ll get an email when proposals arrive.
        </p>
      )}
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><StatusBadge status={job.status} /> <span className="tabular">{budgetText(job)}</span></span>}
        title={job.title}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" href={`/jobs/${job.id}`}>View public page</Link>
            {open && <Link className="btn btn-secondary btn-sm" href={`/client/jobs/${job.id}/edit`}>Edit</Link>}
            {open && (
              <ActionButton
                action={closeJobAction.bind(null, job.id)}
                label="Close job"
                className="btn btn-danger btn-sm"
                confirm="Close this job without hiring? Pending proposals will be declined."
              />
            )}
          </>
        }
      />

      <h2 className="mb-3 text-2xl font-semibold">
        Proposals <span className="font-sans text-base font-semibold text-ink-muted tabular">({proposals.length})</span>
      </h2>
      {proposals.length === 0 ? (
        <EmptyState title="No proposals yet">
          Freelancers usually reply within a day. Share the public page to reach more people.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {proposals.map((p) => {
            const pending = open && (p.status === "submitted" || p.status === "shortlisted");
            return (
              <li key={p.id} className={`card p-5 ${p.status === "shortlisted" ? "border-brand" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar name={p.freelancer_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/freelancers/${p.freelancer_id}`} className="text-lg font-semibold text-brand hover:underline">
                        {p.freelancer_name}
                      </Link>
                      <StatusBadge status={p.status} />
                    </div>
                    {p.headline && <p className="text-sm text-ink-muted">{p.headline}</p>}
                    <div className="mt-1"><Stars rating={p.avg_rating} count={p.review_count} /></div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-semibold text-brand tabular">{naira(p.bid_kobo)}</p>
                    <p className="text-sm text-ink-muted">in {p.duration_days} day{p.duration_days === 1 ? "" : "s"} · {timeAgo(p.created_at)}</p>
                  </div>
                </div>
                <details className="mt-3 rounded-xl bg-surface-2 p-3">
                  <summary className="cursor-pointer font-semibold text-brand">Read cover letter</summary>
                  <p className="mt-2 whitespace-pre-line">{p.cover_letter}</p>
                </details>
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  {pending && (
                    <ActionButton
                      action={acceptProposalAction.bind(null, p.id)}
                      label={`Hire for ${naira(p.bid_kobo)}`}
                      pendingLabel="Hiring…"
                      className="btn btn-primary btn-sm"
                      confirm={`Hire ${p.freelancer_name} for ${naira(p.bid_kobo)}? Other proposals will be declined.`}
                    />
                  )}
                  {p.conversation_id ? (
                    <Link href={`/messages/${p.conversation_id}`} className="btn btn-soft btn-sm">Open chat</Link>
                  ) : p.status !== "declined" ? (
                    <ActionButton action={messageFreelancerAction.bind(null, p.id)} label="Message" pendingLabel="Opening…" className="btn btn-soft btn-sm" />
                  ) : null}
                  {pending && p.status === "submitted" && (
                    <ActionButton action={decideProposalAction.bind(null, p.id, "shortlisted")} label="Shortlist" className="btn btn-secondary btn-sm" />
                  )}
                  {pending && (
                    <ActionButton
                      action={decideProposalAction.bind(null, p.id, "declined")}
                      label="Decline"
                      className="btn btn-ghost btn-sm"
                      confirm={`Decline ${p.freelancer_name}'s proposal? They'll get a polite email.`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
