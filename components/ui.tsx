// Small presentational pieces shared by many pages.
import Link from "next/link";
import type { ReactNode } from "react";

const STATUS: Record<string, { label: string; icon: string; cls: string }> = {
  submitted: { label: "New", icon: "●", cls: "bg-surface-2 text-ink border border-line-strong" },
  shortlisted: { label: "Shortlisted", icon: "★", cls: "bg-lavender text-on-lavender" },
  accepted: { label: "Hired", icon: "✓", cls: "bg-ok-bg text-ok" },
  declined: { label: "Declined", icon: "✕", cls: "bg-danger-bg text-danger" },
  withdrawn: { label: "Withdrawn", icon: "↩", cls: "bg-surface-2 text-ink-muted border border-line" },
  open: { label: "Open", icon: "●", cls: "bg-ok-bg text-ok" },
  in_progress: { label: "In progress", icon: "◆", cls: "bg-lavender text-on-lavender" },
  closed: { label: "Closed", icon: "■", cls: "bg-surface-2 text-ink-muted border border-line" },
  active: { label: "Active", icon: "◆", cls: "bg-lavender text-on-lavender" },
  completed: { label: "Completed", icon: "✓", cls: "bg-ok-bg text-ok" },
  cancelled: { label: "Cancelled", icon: "✕", cls: "bg-danger-bg text-danger" },
  available: { label: "Available now", icon: "●", cls: "bg-ok-bg text-ok" },
  busy: { label: "Busy", icon: "◆", cls: "bg-warn-bg text-warn" },
  away: { label: "Away", icon: "○", cls: "bg-surface-2 text-ink-muted border border-line" },
};

/** A status pill. The word and the icon carry the meaning; colour is only extra. */
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, icon: "●", cls: "bg-surface-2 text-ink" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (!count || rating === null) return <span className="text-sm text-ink-muted">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span aria-hidden="true" className="text-brand">★</span>
      <span className="font-bold tabular">{rating.toFixed(1)}</span>
      <span className="text-ink-muted">({count} review{count === 1 ? "" : "s"})</span>
      <span className="sr-only">: rated {rating.toFixed(1)} out of 5</span>
    </span>
  );
}

export function SkillTags({ skills, linkTo }: { skills: { slug: string; name: string }[]; linkTo?: "jobs" | "freelancers" }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
      {skills.map((s) => (
        <li key={s.slug}>
          {linkTo ? (
            <Link className="chip" href={`/${linkTo}?skill=${s.slug}`}>{s.name}</Link>
          ) : (
            <span className="chip">{s.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 p-8 text-center">
      <p className="font-display text-xl font-semibold text-brand">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-semibold text-ink-muted">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-2 text-ink-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** The loading state for a whole page while its data streams in. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="container-page py-8" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton className="mb-3 h-9 w-2/3 max-w-md" />
      <Skeleton className="mb-8 h-5 w-1/2 max-w-sm" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
