import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { startDemo } from "@/app/actions/auth";
import { FreelancerCard, JobCard } from "@/components/cards";
import { ActionButton } from "@/components/form";
import { EmptyState, Skeleton } from "@/components/ui";
import { latestJobs } from "@/lib/services/jobs";
import { topFreelancers } from "@/lib/services/profiles";

export default function Home() {
  return (
    <>
      {/* The purple hero band: part of the 30% purple, alongside the top bar. */}
      <section className="on-bar bg-bar text-on-bar">
        <div className="container-page grid gap-10 pt-10 pb-14 md:grid-cols-[1.3fr_1fr] md:items-center md:pt-16 md:pb-20">
          <div>
            <p className="mb-4 inline-block rounded-full bg-lavender px-3 py-1 text-sm font-bold text-on-lavender">
              For Nigerian businesses and freelancers
            </p>
            <h1 className="font-display text-4xl leading-[1.05] font-semibold text-on-bar sm:text-6xl">
              Good work starts with a good conversation.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-bar-muted">
              Post a job, compare proposals from skilled freelancers, chat before you decide, and hire
              in one click. Every amount in naira, every conversation private.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup?role=client" className="btn btn-on-bar">Post a job</Link>
              <Link href="/jobs" className="btn border-on-bar text-on-bar hover:bg-white/15">Find work</Link>
            </div>
          </div>
          <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20">
            <p className="font-display text-xl font-semibold text-on-bar">Look around first</p>
            <p className="mt-1 mb-4 text-sm text-bar-muted">
              One click gives you a private demo with jobs, proposals and chats already in it. No sign-up.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <ActionButton action={startDemo.bind(null, "client")} label="Try as a client" pendingLabel="Setting up…" className="btn btn-on-bar w-full" />
              <ActionButton action={startDemo.bind(null, "freelancer")} label="Try as a freelancer" pendingLabel="Setting up…" className="btn w-full border-on-bar text-on-bar hover:bg-white/15" />
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-semibold">How Gigroom works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            ["Post your job", "Say what you need, your budget in naira and the skills required. It's live on the job board at once."],
            ["Compare and chat", "Freelancers send proposals with a price and timeline. Shortlist the best and message them before deciding."],
            ["Hire and review", "Accept a proposal and the contract starts. When the work is done, you both leave a review."],
          ].map(([title, body], i) => (
            <li key={title} className="card p-6">
              <span className="grid size-10 place-items-center rounded-full bg-lavender font-display text-lg font-bold text-on-lavender" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface-2 py-14" aria-labelledby="latest">
        <div className="container-page">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="latest" className="text-3xl font-semibold">Latest jobs</h2>
            <Link href="/jobs" className="link">See all jobs →</Link>
          </div>
          <Suspense fallback={<div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}>
            <LatestJobs />
          </Suspense>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="talent">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 id="talent" className="text-3xl font-semibold">Top-rated freelancers</h2>
          <Link href="/freelancers" className="link">Browse talent →</Link>
        </div>
        <Suspense fallback={<div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-52" /><Skeleton className="h-52" /><Skeleton className="h-52" /></div>}>
          <TopFreelancers />
        </Suspense>
      </section>
    </>
  );
}

async function LatestJobs() {
  await connection(); // read fresh from the database on every request
  const jobs = await latestJobs(4);
  if (!jobs.length) return <EmptyState title="No open jobs yet">Be the first to post one.</EmptyState>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {jobs.map((j) => <JobCard key={j.id} job={j} headingLevel={3} />)}
    </div>
  );
}

async function TopFreelancers() {
  await connection();
  const list = await topFreelancers(3);
  if (!list.length) return <EmptyState title="No freelancers yet" />;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {list.map((f) => <FreelancerCard key={f.user_id} f={f} headingLevel={3} />)}
    </div>
  );
}
