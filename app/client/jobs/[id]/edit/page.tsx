import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { updateJobAction } from "@/app/actions/jobs";
import { JobForm } from "@/components/job-form";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/errors";
import { getOwnJobForEdit, listSkills } from "@/lib/services/jobs";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit job" };

export default function EditJobPage(props: PageProps<"/client/jobs/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditJob {...props} />
    </Suspense>
  );
}

async function EditJob({ params }: PageProps<"/client/jobs/[id]/edit">) {
  const me = await requireActor("client");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let job;
  try {
    job = await getOwnJobForEdit(me, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const skills = await listSkills();
  return (
    <div className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link className="link" href={`/client/jobs/${id}`}>← Back to the job</Link></nav>
      <PageHeader title="Edit job" />
      {job.status !== "open" ? (
        <EmptyState title="This job can't be edited">Only open jobs can be changed.</EmptyState>
      ) : (
        <div className="card p-5 sm:p-6">
          <JobForm action={updateJobAction.bind(null, id)} skills={skills} job={job} submitLabel="Save changes" />
        </div>
      )}
    </div>
  );
}
