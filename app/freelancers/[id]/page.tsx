import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/cards";
import { EmptyState, PageSkeleton, SkillTags, Stars, StatusBadge } from "@/components/ui";
import { currentActor } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { naira } from "@/lib/money";
import { NotFoundError } from "@/lib/services/errors";
import { getFreelancerProfile } from "@/lib/services/profiles";
import { uuidSchema } from "@/lib/validation";

export default function ProfilePage(props: PageProps<"/freelancers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading profile" />}>
      <Profile {...props} />
    </Suspense>
  );
}

async function Profile({ params }: PageProps<"/freelancers/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const actor = await currentActor();
  let data;
  try {
    data = await getFreelancerProfile(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { profile: f, portfolio, reviews } = data;
  const isMe = actor?.id === f.user_id;

  return (
    <div className="container-page py-8">
      <div className="card overflow-hidden">
        <div className="h-20 bg-bar sm:h-24" aria-hidden="true" />
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-8">
          <div className="rounded-full ring-4 ring-surface"><Avatar name={f.name} size="lg" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{f.name}</h1>
            <p className="text-ink-muted">{f.city}, {f.state} · {f.years_experience} year{f.years_experience === 1 ? "" : "s"} experience</p>
          </div>
          <StatusBadge status={f.availability} />
          {isMe && <Link href="/freelancer/profile" className="btn btn-secondary btn-sm">Edit profile</Link>}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="font-display text-2xl text-brand">{f.headline}</p>
          <div className="mt-4 whitespace-pre-line">{f.bio}</div>

          <h2 className="mt-10 mb-4 text-2xl font-semibold">Portfolio</h2>
          {portfolio.length === 0 ? (
            <p className="text-ink-muted">No portfolio items yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {portfolio.map((p) => (
                <li key={p.id} className="card p-4">
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="link">
                    {p.title} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {p.description && <p className="mt-1 text-sm text-ink-muted">{p.description}</p>}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-10 mb-4 text-2xl font-semibold">Reviews</h2>
          {reviews.length === 0 ? (
            <EmptyState title="No reviews yet">Reviews appear after a client marks a contract as completed.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r, i) => (
                <li key={i} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{r.job_title}</span>
                    <span className="text-brand" aria-label={`${r.rating} out of 5 stars`}>
                      {"★".repeat(r.rating)}<span className="text-line-strong">{"★".repeat(5 - r.rating)}</span>
                    </span>
                  </div>
                  {r.comment && <p className="mt-2">“{r.comment}”</p>}
                  <p className="mt-2 text-sm text-ink-muted">{r.reviewer_name} · {formatDate(r.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card space-y-3 p-5">
            <p className="text-sm text-ink-muted">Hourly rate</p>
            <p className="font-display text-3xl font-semibold text-brand tabular">{naira(f.hourly_rate_kobo)}<span className="text-base text-ink-muted">/hr</span></p>
            <Stars rating={f.avg_rating} count={f.review_count} />
            <p className="text-sm text-ink-muted">{f.completed_jobs} completed contract{f.completed_jobs === 1 ? "" : "s"}</p>
            {!actor && <Link href="/signup?role=client" className="btn btn-primary w-full">Hire on Gigroom</Link>}
            {actor?.role === "client" && <Link href="/client/jobs/new" className="btn btn-primary w-full">Post a job to invite proposals</Link>}
          </div>
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Skills</h2>
            <SkillTags skills={f.skills} linkTo="freelancers" />
          </div>
        </aside>
      </div>
    </div>
  );
}
