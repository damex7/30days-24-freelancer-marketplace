import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { currentActor, homeFor } from "@/lib/auth/session";
import { unreadTotal } from "@/lib/services/messages";
import { ActionButton } from "./form";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { MessagesLink } from "./unread-badge";

export function Header() {
  return (
    <header className="on-bar bg-bar text-on-bar">
      <div className="container-page flex min-h-16 flex-wrap items-center gap-x-2 sm:flex-nowrap sm:gap-4">
        <Link href="/" className="mr-1 flex items-center gap-2 rounded-lg font-display text-xl font-semibold" aria-label="Gigroom home">
          <LogoMark className="size-8 text-on-bar" />
          <span>Gigroom</span>
        </Link>
        <nav aria-label="Main" className="order-last -mt-1 flex w-full items-center pb-2 sm:order-none sm:mt-0 sm:w-auto sm:pb-0 gap-0.5 text-sm font-semibold whitespace-nowrap sm:gap-1 sm:text-[0.95rem]">
          <Link href="/jobs" className="rounded-full px-2 py-2 hover:bg-white/15 sm:px-3">Find work</Link>
          <Link href="/freelancers" className="rounded-full px-2 py-2 hover:bg-white/15 sm:px-3">Find talent</Link>
        </nav>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {/* The session is read per request, so this part streams in behind a
              Suspense boundary while the rest of the header is instant. */}
          <Suspense fallback={<span className="block h-10 w-24 rounded-full bg-white/10" aria-hidden="true" />}>
            <UserNav />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
    </header>
  );
}

async function UserNav() {
  const actor = await currentActor();
  if (!actor) {
    return (
      <>
        <Link href="/login" className="rounded-full px-2 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/15 sm:px-3 sm:text-base">Log in</Link>
        <Link href="/signup" className="btn btn-on-bar btn-sm hidden sm:inline-flex">Sign up</Link>
      </>
    );
  }
  const unread = await unreadTotal(actor);
  return (
    <>
      {actor.role !== "admin" && <MessagesLink initial={unread} />}
      <details className="relative">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full px-2 font-semibold hover:bg-white/15 [&::-webkit-details-marker]:hidden">
          <span className="grid size-8 place-items-center rounded-full bg-lavender text-sm font-bold text-on-lavender" aria-hidden="true">
            {actor.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="sr-only">Account menu for {actor.name}</span>
          <span aria-hidden="true" className="text-xs">▾</span>
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-surface p-2 text-ink shadow-lg">
          <p className="px-3 pt-1 pb-2 text-sm text-ink-muted">
            Signed in as <span className="font-semibold text-ink">{actor.name}</span>
            <span className="block capitalize">{actor.role} account</span>
          </p>
          <Link href={homeFor(actor.role)} className="block rounded-lg px-3 py-2 font-semibold hover:bg-lavender">Dashboard</Link>
          {actor.role === "freelancer" && (
            <Link href={`/freelancers/${actor.id}`} className="block rounded-lg px-3 py-2 font-semibold hover:bg-lavender">My public profile</Link>
          )}
          {actor.role === "client" && (
            <Link href="/client/jobs/new" className="block rounded-lg px-3 py-2 font-semibold hover:bg-lavender">Post a job</Link>
          )}
          <div className="mt-1 border-t border-line px-1 pt-2">
            <ActionButton action={logout} label="Log out" pendingLabel="Logging out…" className="btn btn-ghost btn-sm w-full justify-start" />
          </div>
        </div>
      </details>
    </>
  );
}

async function DemoBanner() {
  const actor = await currentActor();
  if (!actor?.isDemo) return null;
  return (
    <div className="bg-lavender text-on-lavender">
      <p className="container-page py-2 text-sm font-semibold">
        <span aria-hidden="true">✦ </span>
        You&apos;re in a private demo as a {actor.role}. Everything here is yours to try and is deleted after 24 hours.
      </p>
    </div>
  );
}
