import type { Metadata } from "next";
import { Suspense } from "react";
import { createJobAction } from "@/app/actions/jobs";
import { JobForm } from "@/components/job-form";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { listSkills } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Post a job" };

export default function NewJobPage(props: PageProps<"/client/jobs/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewJob {...props} />
    </Suspense>
  );
}

async function NewJob({ searchParams }: PageProps<"/client/jobs/new">) {
  await requireActor("client");
  const [skills, sp] = await Promise.all([listSkills(), searchParams]);
  return (
    <div className="max-w-3xl">
      {sp.welcome && (
        <p role="status" className="mb-6 rounded-2xl bg-lavender p-4 font-semibold text-on-lavender">
          Welcome to Gigroom! Start by posting your first job.
        </p>
      )}
      <PageHeader title="Post a job" subtitle="It goes live on the job board as soon as you post it." />
      <div className="card p-5 sm:p-6">
        <JobForm action={createJobAction} skills={skills} submitLabel="Post job" />
      </div>
    </div>
  );
}
