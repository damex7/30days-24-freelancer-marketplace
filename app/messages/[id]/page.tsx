import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/cards";
import { InboxList } from "@/components/inbox-list";
import { Thread } from "@/components/thread";
import { PageSkeleton, StatusBadge } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/errors";
import { getConversation, listConversations, listMessages } from "@/lib/services/messages";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Conversation" };

export default function ConversationPage(props: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading conversation" />}>
      <Conversation {...props} />
    </Suspense>
  );
}

async function Conversation({ params }: PageProps<"/messages/[id]">) {
  const me = await requireActor("client", "freelancer");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let conv, page, inbox;
  try {
    // getConversation proves I'm one of the two participants; anyone else gets a 404.
    conv = await getConversation(me, id);
    [page, inbox] = await Promise.all([listMessages(me, id), listConversations(me)]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const jobHref = me.role === "client" ? `/client/jobs/${conv.job_id}` : `/jobs/${conv.job_id}`;

  return (
    <div className="container-page py-4 sm:py-6">
      <div className="card grid h-[calc(100dvh-9rem)] min-h-[26rem] overflow-hidden lg:grid-cols-[20rem_1fr]">
        <aside className="hidden overflow-y-auto border-r border-line lg:block" aria-label="All conversations">
          <h2 className="border-b border-line px-4 py-3 text-lg font-semibold">Messages</h2>
          <InboxList conversations={inbox} meId={me.id} activeId={id} />
        </aside>
        <section className="flex min-h-0 flex-col" aria-labelledby="chat-title">
          <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
            <Link href="/messages" className="btn btn-ghost btn-sm px-2 lg:hidden" aria-label="Back to all conversations">←</Link>
            <Avatar name={conv.other_name} size="sm" />
            <div className="min-w-0 flex-1">
              <h1 id="chat-title" className="truncate font-sans text-base font-bold text-ink">
                {me.role === "client" ? (
                  <Link href={`/freelancers/${conv.other_id}`} className="hover:underline">{conv.other_name}</Link>
                ) : conv.other_name}
              </h1>
              <Link href={jobHref} className="block truncate text-sm text-brand hover:underline">{conv.job_title}</Link>
            </div>
            {conv.contract_id ? (
              <Link href={`/contracts/${conv.contract_id}`} className="btn btn-soft btn-sm">Contract</Link>
            ) : conv.proposal_status ? (
              <StatusBadge status={conv.proposal_status} />
            ) : null}
          </header>
          <Thread
            conversationId={conv.id}
            meId={me.id}
            otherName={conv.other_name}
            lastReadId={conv.lastReadId}
            initialHasOlder={page.hasOlder}
            initial={page.messages.map((m) => ({ ...m, created_at: new Date(m.created_at).toISOString() }))}
          />
        </section>
      </div>
    </div>
  );
}
