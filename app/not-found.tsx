import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page grid max-w-xl py-20 text-center">
      <p className="font-display text-7xl font-semibold text-lavender-hover" aria-hidden="true">404</p>
      <h1 className="mt-2 text-3xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-ink-muted">It may have been removed, or it may belong to someone else&apos;s account.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link className="btn btn-primary" href="/">Go home</Link>
        <Link className="btn btn-secondary" href="/jobs">Browse jobs</Link>
      </div>
    </div>
  );
}
