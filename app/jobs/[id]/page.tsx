import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { withdrawProposalAction } from "@/app/actions/jobs";
import { budgetText } from "@/components/cards";
import { ActionButton } from "@/components/form";
import { ProposalForm } from "@/components/proposal-form";
import { PageSkeleton, SkillTags, StatusBadge } from "@/components/ui";
import { currentActor } from "@/lib/auth/session";
import { categoryLabel, experienceLabel, locationLabel } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/format";
import { naira } from "@/lib/money";
import { NotFoundError } from "@/lib/services/errors";
import { getJob } from "@/lib/services/jobs";
import { uuidSchema } from "@/lib/validation";

export default function JobPage(props: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading job" />}>
      <Job {...props} />
    </Suspense>
  );
}

async function load(id: string) {
  const actor = await currentActor();
  if (!uuidSchema.safeParse(id).success) notFound();
  try {
    return { actor, ...(await getJob(actor, id)) };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

async function Job({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { actor, job, isOwner, myProposal } = await load(id);
  const editable = myProposal && ["submitted", "shortlisted"].includes(myProposal.status) && job.status === "open";

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link className="link" href="/jobs">← All jobs</Link></nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <article>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{categoryLabel(job.category)}</span>
            <span aria-hidden="true">·</span>
            <span>Posted {timeAgo(job.created_at)} by {job.client_name}</span>
            <StatusBadge status={job.status} />
          </div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{job.title}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface-2 p-4 sm:grid-cols-4">
            <div><dt className="text-sm text-ink-muted">Budget</dt><dd className="font-bold tabular">{budgetText(job)}</dd></div>
            <div><dt className="text-sm text-ink-muted">Level</dt><dd className="font-semibold">{experienceLabel(job.experience_level)}</dd></div>
            <div><dt className="text-sm text-ink-muted">Location</dt><dd className="font-semibold">{locationLabel(job.location_type)}{job.state ? `, ${job.state}` : ""}</dd></div>
            <div><dt className="text-sm text-ink-muted">Deadline</dt><dd className="font-semibold">{job.deadline ? formatDate(job.deadline) : "Flexible"}</dd></div>
          </dl>
          <h2 className="mt-8 mb-3 text-xl font-semibold">About the job</h2>
          <div className="space-y-3 whitespace-pre-line">{job.description}</div>
          <h2 className="mt-8 mb-3 text-xl font-semibold">Skills needed</h2>
          <SkillTags skills={job.skills} linkTo="jobs" />
          <p className="mt-8 text-sm text-ink-muted">{job.proposal_count} proposal{job.proposal_count === 1 ? "" : "s"} so far.</p>
        </article>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Apply">
          <div className="card p-5">
            {isOwner ? (
              <>
                <h2 className="text-xl font-semibold">This is your job</h2>
                <p className="mt-2 mb-4 text-ink-muted">Review proposals, shortlist, chat and hire.</p>
                <Link className="btn btn-primary w-full" href={`/client/jobs/${job.id}`}>Manage proposals</Link>
              </>
            ) : myProposal ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">Your proposal</h2>
                  <StatusBadge status={myProposal.status} />
                </div>
                {editable ? (
                  <>
                    <ProposalForm jobId={job.id} existing={myProposal} budgetHint={budgetText(job)} />
                    <div className="mt-4 border-t border-line pt-4">
                      <ActionButton
                        action={withdrawProposalAction.bind(null, myProposal.id)}
                        label="Withdraw proposal"
                        className="btn btn-danger btn-sm"
                        confirm="Withdraw this proposal? You can't send another one for this job."
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-ink-muted">
                    You bid <span className="font-bold text-ink">{naira(myProposal.bid_kobo)}</span> for {myProposal.duration_days} days.
                    {myProposal.status === "accepted" && " You were hired. Open your dashboard to see the contract."}
                  </p>
                )}
              </>
            ) : job.status !== "open" ? (
              <p className="text-ink-muted">This job is no longer taking proposals.</p>
            ) : actor?.role === "freelancer" ? (
              <>
                <h2 className="mb-4 text-xl font-semibold">Send a proposal</h2>
                <ProposalForm jobId={job.id} budgetHint={budgetText(job)} />
              </>
            ) : actor ? (
              <p className="text-ink-muted">Only freelancer accounts can send proposals.</p>
            ) : (
              <>
                <h2 className="text-xl font-semibold">Interested?</h2>
                <p className="mt-2 mb-4 text-ink-muted">Create a free freelancer account to send a proposal.</p>
                <div className="flex flex-col gap-2">
                  <Link className="btn btn-primary" href="/signup?role=freelancer">Join as a freelancer</Link>
                  <Link className="btn btn-secondary" href={`/login?next=/jobs/${job.id}`}>Log in</Link>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
