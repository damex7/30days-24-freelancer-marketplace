import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { adminCloseJobAction, suspendAction, unsuspendAction } from "@/app/actions/admin";
import { ActionButton, Field, Form } from "@/components/form";
import { PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { formatDate, timeAgo } from "@/lib/format";
import { adminAuditLog, adminListJobs, adminListUsers, adminStats } from "@/lib/services/admin";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading admin" />}>
      <Admin {...props} />
    </Suspense>
  );
}

async function Admin({ searchParams }: PageProps<"/admin">) {
  const me = await requireActor("admin");
  const qRaw = (await searchParams).q;
  const q = typeof qRaw === "string" ? qRaw.slice(0, 80) : undefined;
  const [stats, users, jobs, audit] = await Promise.all([adminStats(me), adminListUsers(me, q), adminListJobs(me), adminAuditLog(me)]);

  return (
    <div className="container-page py-8">
      <PageHeader title="Admin" subtitle="Suspend accounts and take down jobs. Private messages are never visible here." />
      <dl className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries({
          Clients: stats.clients, Freelancers: stats.freelancers, "Open jobs": stats.open_jobs, "Proposals (7 days)": stats.proposals_7d,
          "Active contracts": stats.active_contracts, Completed: stats.completed_contracts, "Messages (24 h)": stats.messages_24h, Suspended: stats.suspended,
        }).map(([label, n]) => (
          <div key={label} className="card p-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="font-display text-3xl font-semibold text-brand tabular">{n}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="users" className="mb-12">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="users" className="text-2xl font-semibold">Accounts</h2>
          <form method="get" role="search" className="flex gap-2">
            <label htmlFor="admin-q" className="sr-only">Search accounts</label>
            <input id="admin-q" name="q" type="search" defaultValue={q ?? ""} placeholder="Name or email" className="input w-56" />
            <button className="btn btn-secondary">Search</button>
          </form>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Accounts, newest first</caption>
            <thead className="bg-surface-2 text-ink-muted">
              <tr><th scope="col" className="p-3">Name</th><th scope="col" className="p-3">Role</th><th scope="col" className="p-3">Activity</th><th scope="col" className="p-3">Joined</th><th scope="col" className="p-3">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className={u.suspended_at ? "bg-danger-bg/40" : ""}>
                  <td className="p-3"><span className="font-semibold">{u.name}</span><span className="block text-ink-muted">{u.email}</span></td>
                  <td className="p-3 capitalize">{u.role}{u.suspended_at && <span className="ml-2"><StatusBadge status="cancelled" /></span>}</td>
                  <td className="p-3 tabular">{u.role === "client" ? `${u.jobs} jobs` : u.role === "freelancer" ? `${u.proposals} proposals` : "—"}</td>
                  <td className="p-3">{formatDate(u.created_at)}</td>
                  <td className="p-3">
                    {u.role === "admin" ? null : u.suspended_at ? (
                      <ActionButton action={unsuspendAction.bind(null, u.id)} label="Restore" className="btn btn-secondary btn-sm" />
                    ) : (
                      <details>
                        <summary className="btn btn-danger btn-sm list-none">Suspend…</summary>
                        <div className="mt-2 w-64">
                          <Form action={suspendAction.bind(null, u.id)} submitLabel="Suspend account" submitClassName="btn btn-danger btn-sm">
                            <Field name="reason" label="Reason (kept in the audit log)" />
                          </Form>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="jobs" className="mb-12">
        <h2 id="jobs" className="mb-3 text-2xl font-semibold">Recent jobs</h2>
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <Link href={`/jobs/${j.id}`} className="font-semibold text-brand hover:underline">{j.title}</Link>
                <p className="text-sm text-ink-muted">{j.client_name} · {j.proposals} proposals · {timeAgo(j.created_at)}</p>
              </div>
              <StatusBadge status={j.status} />
              {j.status === "open" && (
                <details>
                  <summary className="btn btn-danger btn-sm list-none">Take down…</summary>
                  <div className="mt-2 w-64">
                    <Form action={adminCloseJobAction.bind(null, j.id)} submitLabel="Close job" submitClassName="btn btn-danger btn-sm">
                      <Field name="reason" label="Reason" />
                    </Form>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="audit">
        <h2 id="audit" className="mb-3 text-2xl font-semibold">Audit log</h2>
        {audit.length === 0 ? <p className="text-ink-muted">No admin actions yet.</p> : (
          <ul className="space-y-1 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface-2 px-3 py-2">
                <span className="font-semibold">{a.actor_name ?? "Deleted admin"}</span> · <code>{a.action}</code> on {a.target_type}{" "}
                <code className="text-xs">{a.target_id.slice(0, 8)}</code>
                {a.details.reason && <> · “{a.details.reason}”</>} · <span className="text-ink-muted">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
