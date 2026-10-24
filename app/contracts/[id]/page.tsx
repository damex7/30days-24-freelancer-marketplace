import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelContractAction, completeContractAction } from "@/app/actions/contracts";
import { Avatar } from "@/components/cards";
import { ActionButton } from "@/components/form";
import { ReviewForm } from "@/components/review-form";
import { PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { homeFor, requireActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { naira } from "@/lib/money";
import { getContract } from "@/lib/services/contracts";
import { NotFoundError } from "@/lib/services/errors";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Contract" };

export default function ContractPage(props: PageProps<"/contracts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading contract" />}>
      <Contract {...props} />
    </Suspense>
  );
}

function ReviewBlock({ title, review }: { title: string; review: { rating: number; comment: string; created_at: Date } }) {
  return (
    <div className="rounded-xl bg-surface-2 p-4">
      <p className="text-sm font-semibold text-ink-muted">{title}</p>
      <p className="mt-1 text-brand" aria-label={`${review.rating} out of 5 stars`}>
        {"★".repeat(review.rating)}<span className="text-line-strong">{"★".repeat(5 - review.rating)}</span>
      </p>
      {review.comment && <p className="mt-1">“{review.comment}”</p>}
      <p className="mt-1 text-xs text-ink-muted">{formatDate(review.created_at)}</p>
    </div>
  );
}

async function Contract({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const me = await requireActor();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let data;
  try {
    data = await getContract(me, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { contract: k, myReview, theirReview } = data;
  const sp = await searchParams;
  const iAmClient = me.id === k.client_id;
  const isParty = iAmClient || me.id === k.freelancer_id;
  const otherName = iAmClient ? k.freelancer_name : k.client_name;

  return (
    <div className="container-page max-w-4xl py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link className="link" href={homeFor(me.role)}>← Dashboard</Link></nav>
      {sp.hired && (
        <p role="status" className="mb-6 rounded-2xl bg-lavender p-4 font-semibold text-on-lavender">
          ✓ You hired {k.freelancer_name}. They&apos;ve been told by email, and the chat is open.
        </p>
      )}
      <PageHeader eyebrow={<StatusBadge status={k.status} />} title={k.job_title} />

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <section className="card p-5" aria-labelledby="terms">
          <h2 id="terms" className="mb-4 text-xl font-semibold">Terms</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-ink-muted">Agreed amount</dt><dd className="font-display text-2xl font-semibold text-brand tabular">{naira(k.amount_kobo)}</dd></div>
            <div><dt className="text-sm text-ink-muted">Timeline</dt><dd className="font-semibold">{k.duration_days} days</dd></div>
            <div><dt className="text-sm text-ink-muted">Started</dt><dd className="font-semibold">{formatDate(k.started_at)}</dd></div>
            <div><dt className="text-sm text-ink-muted">{k.status === "active" ? "Status" : "Ended"}</dt><dd className="font-semibold">{k.ended_at ? formatDate(k.ended_at) : "In progress"}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-ink-muted">
            The amount was copied from the proposal when it was accepted, so it can&apos;t change afterwards.
            Payments are arranged directly between you for now.
          </p>
          {isParty && k.status === "active" && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              {iAmClient && (
                <ActionButton
                  action={completeContractAction.bind(null, k.id)}
                  label="Mark as completed"
                  className="btn btn-primary btn-sm"
                  confirm="Mark this contract as completed? You'll both be able to leave reviews."
                />
              )}
              <ActionButton
                action={cancelContractAction.bind(null, k.id)}
                label="Cancel contract"
                className="btn btn-danger btn-sm"
                confirm="Cancel this contract? This can't be undone."
              />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {[
            { role: "Client", name: k.client_name },
            { role: "Freelancer", name: k.freelancer_name, href: `/freelancers/${k.freelancer_id}` },
          ].map((p) => (
            <div key={p.role} className="card flex items-center gap-3 p-4">
              <Avatar name={p.name} size="sm" />
              <div>
                <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{p.role}</p>
                {p.href ? <Link href={p.href} className="font-semibold text-brand hover:underline">{p.name}</Link> : <p className="font-semibold">{p.name}</p>}
              </div>
            </div>
          ))}
          {isParty && k.conversation_id && (
            <Link href={`/messages/${k.conversation_id}`} className="btn btn-soft w-full">Open chat with {otherName}</Link>
          )}
        </aside>
      </div>

      {k.status === "completed" && (
        <section className="card mt-6 p-5" aria-labelledby="reviews">
          <h2 id="reviews" className="mb-4 text-xl font-semibold">Reviews</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {isParty ? (
              <>
                {myReview ? <ReviewBlock title="Your review" review={myReview} /> : <ReviewForm contractId={k.id} otherName={otherName} />}
                {theirReview ? (
                  <ReviewBlock title={`${otherName}'s review of you`} review={theirReview} />
                ) : (
                  <p className="text-ink-muted">{otherName} hasn&apos;t left a review yet.</p>
                )}
              </>
            ) : (
              <>
                {theirReview && <ReviewBlock title="Review" review={theirReview} />}
                {myReview && <ReviewBlock title="Review" review={myReview} />}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
