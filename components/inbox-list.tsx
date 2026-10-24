import Link from "next/link";
import { timeAgo } from "@/lib/format";
import type { listConversations } from "@/lib/services/messages";
import { Avatar } from "./cards";

type Conv = Awaited<ReturnType<typeof listConversations>>[number];

export function InboxList({ conversations, meId, activeId }: { conversations: Conv[]; meId: string; activeId?: string }) {
  return (
    <ul className="divide-y divide-line" aria-label="Conversations">
      {conversations.map((c) => {
        const preview = c.last_body
          ? `${c.last_kind === "system" ? "" : c.last_sender_id === meId ? "You: " : ""}${c.last_body}`
          : "No messages yet";
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <Link
              href={`/messages/${c.id}`}
              aria-current={active ? "page" : undefined}
              className={`flex gap-3 px-4 py-3 hover:bg-lavender ${active ? "bg-lavender text-on-lavender" : c.unread ? "bg-surface-2" : ""}`}
            >
              <Avatar name={c.other_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{c.other_name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{timeAgo(c.last_message_at)}</span>
                </span>
                <span className="block truncate text-xs text-ink-muted">{c.job_title}</span>
                <span className={`block truncate text-sm ${c.unread ? "font-semibold text-ink" : "text-ink-muted"}`}>{preview}</span>
              </span>
              {c.unread > 0 && (
                <span className="self-center rounded-full bg-brand px-2 text-xs leading-5 font-bold text-on-brand tabular">
                  {c.unread}<span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
