import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InboxList } from "@/components/inbox-list";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { listConversations } from "@/lib/services/messages";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading messages" />}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const me = await requireActor("client", "freelancer");
  const conversations = await listConversations(me);
  return (
    <div className="container-page max-w-3xl py-8">
      <PageHeader title="Messages" subtitle="Every conversation is about a job, and only you and the other person can read it." />
      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          action={
            me.role === "client"
              ? <Link href="/client" className="btn btn-primary">Review your proposals</Link>
              : <Link href="/jobs" className="btn btn-primary">Find work</Link>
          }
        >
          {me.role === "client"
            ? "Start a chat from any proposal on your jobs."
            : "Clients start conversations after you send a proposal, so the best way to get one is to apply."}
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <InboxList conversations={conversations} meId={me.id} />
        </div>
      )}
    </div>
  );
}
