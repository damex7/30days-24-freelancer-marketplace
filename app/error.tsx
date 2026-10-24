"use client";
// Shown when a page throws, most often because the database can't be reached.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page grid max-w-xl py-20 text-center" role="alert">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-ink-muted">
        We couldn&apos;t load this page. It&apos;s usually a brief connection problem with the database.
      </p>
      <div className="mt-6">
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  );
}
