"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

const ITEMS: Record<"client" | "freelancer", Item[]> = {
  client: [
    { href: "/client", label: "Overview", icon: "▦" },
    { href: "/client/jobs/new", label: "Post a job", icon: "＋" },
    { href: "/messages", label: "Messages", icon: "✉" },
    { href: "/freelancers", label: "Find talent", icon: "⌕" },
  ],
  freelancer: [
    { href: "/freelancer", label: "Overview", icon: "▦" },
    { href: "/freelancer/profile", label: "My profile", icon: "☺" },
    { href: "/messages", label: "Messages", icon: "✉" },
    { href: "/jobs", label: "Find work", icon: "⌕" },
  ],
};

/**
 * The dashboard sidebar: solid purple (part of the 30%). On phones it becomes a
 * horizontal strip of tabs under the top bar. aria-current marks the page you're on.
 */
export function DashNav({ role }: { role: "client" | "freelancer" }) {
  return <DashNavView role={role} path={usePathname()} />;
}

/** The same nav without the active state, shown while the pathname streams in. */
export function DashNavView({ role, path }: { role: "client" | "freelancer"; path: string | null }) {
  return (
    <nav aria-label={`${role === "client" ? "Client" : "Freelancer"} dashboard`} className="on-bar bg-bar text-on-bar lg:min-h-full lg:rounded-3xl lg:p-3">
      <p className="hidden px-3 pt-2 pb-3 text-xs font-bold tracking-widest text-bar-muted uppercase lg:block">
        {role === "client" ? "Hiring" : "Working"}
      </p>
      <ul className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:p-0">
        {ITEMS[role].map((it) => {
          const active = path === it.href;
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap lg:rounded-xl lg:text-base ${
                  active ? "bg-lavender text-on-lavender" : "hover:bg-white/15"
                }`}
              >
                <span aria-hidden="true" className="w-4 text-center">{it.icon}</span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
