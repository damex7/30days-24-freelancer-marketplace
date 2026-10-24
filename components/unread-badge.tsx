"use client";
// The Messages link in the header, with a live unread count. It polls a small
// JSON route every 20 seconds while the tab is visible (and not at all when it's
// hidden), so a new message shows up without refreshing the page.
import Link from "next/link";
import { useEffect, useState } from "react";

export function MessagesLink({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/unread", { cache: "no-store" });
          if (res.ok) setCount(((await res.json()) as { unread: number }).unread);
        } catch {}
      }
      if (!stopped) timer = setTimeout(tick, 20_000);
    }
    timer = setTimeout(tick, 20_000);
    // A thread page fires this after marking messages read, so the badge updates at once.
    const onRead = () => void tick();
    window.addEventListener("gigroom:read", onRead);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("gigroom:read", onRead);
    };
  }, []);
  return (
    <Link
      href="/messages"
      className="relative inline-flex min-h-10 items-center gap-2 rounded-full px-3 font-semibold text-on-bar hover:bg-white/15"
      aria-label={count ? `Messages, ${count} unread` : "Messages"}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4V5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">Messages</span>
      {count > 0 && (
        <span className="min-w-5 rounded-full bg-lavender px-1.5 text-center text-xs leading-5 font-bold text-on-lavender tabular">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
