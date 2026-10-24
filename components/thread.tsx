"use client";
// A live chat thread.
//
// New messages arrive by POLLING: every 3 seconds while the tab is visible, the
// browser asks "anything after message #N?" and the server answers with only
// the new rows (an indexed query, usually empty and very cheap). When the tab is
// hidden it slows to every 15 seconds; on errors it backs off up to 30 seconds.
//
// Why polling and not WebSockets? Vercel functions can't hold a socket open, so
// realtime would need an extra paid service (Pusher, Ably, Supabase Realtime).
// For a chat where a few seconds of delay is fine, polling is simpler, free and
// works everywhere. The trade-off: more small requests, and up to 3 seconds of delay.
//
// Sending is optimistic: your message shows at once as "Sending…". Each one has
// a random nonce, so if the network drops and you press Retry, the server
// recognises the same message and never stores it twice.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

export type ThreadMessage = {
  id: number;
  sender_id: string | null;
  kind: "text" | "system";
  body: string;
  created_at: string;
};
type Pending = { nonce: string; body: string; state: "sending" | "failed"; error?: string };

const TZ = "Africa/Lagos";
const dayFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

function mergeById(a: ThreadMessage[], b: ThreadMessage[]) {
  const map = new Map(a.map((m) => [m.id, m]));
  for (const m of b) map.set(m.id, m);
  return [...map.values()].sort((x, y) => x.id - y.id);
}

export function Thread({
  conversationId, meId, otherName, initial, initialHasOlder, lastReadId,
}: {
  conversationId: string; meId: string; otherName: string;
  initial: ThreadMessage[]; initialHasOlder: boolean; lastReadId: number;
}) {
  const [messages, setMessages] = useState(initial);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unreadFrom] = useState(lastReadId); // where the "New messages" divider goes
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(initial.at(-1)?.id ?? 0);
  const stickToBottom = useRef(true);
  const base = `/api/conversations/${conversationId}`;
  const router = useRouter();

  const markRead = useCallback(
    async (upTo: number) => {
      if (document.visibilityState !== "visible" || upTo <= 0) return;
      try {
        await fetch(`${base}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upTo }),
        });
        window.dispatchEvent(new Event("gigroom:read")); // refresh the header badge
      } catch {}
    },
    [base],
  );

  // Mark as read on open.
  useEffect(() => {
    if (lastIdRef.current > lastReadId) void markRead(lastIdRef.current);
  }, [lastReadId, markRead]);

  // The polling loop.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let failures = 0;
    const controller = new AbortController();

    async function poll() {
      try {
        const res = await fetch(`${base}/messages?after=${lastIdRef.current}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const { messages: fresh } = (await res.json()) as { messages: ThreadMessage[] };
        failures = 0;
        if (fresh.length) {
          lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id));
          setMessages((prev) => mergeById(prev, fresh));
          router.refresh(); // update the conversation list beside the thread
          const theirs = fresh.filter((m) => m.sender_id !== meId);
          if (theirs.length) {
            const last = theirs.at(-1)!;
            setAnnouncement(
              last.kind === "system" ? last.body : `New message from ${otherName}: ${last.body.slice(0, 120)}`,
            );
            void markRead(lastIdRef.current);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        failures++;
      }
      if (stopped) return;
      const visible = document.visibilityState === "visible";
      const delay = Math.min((visible ? 3000 : 15000) * 2 ** failures, 30000);
      timer = setTimeout(poll, delay);
    }

    // Coming back to the tab: check straight away instead of waiting.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void poll();
      }
    };
    timer = setTimeout(poll, 3000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [base, meId, otherName, markRead, router]);

  // Keep the view pinned to the newest message unless you've scrolled up to read.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);
  function onScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function deliver(p: Pending) {
    setPending((list) => list.map((x) => (x.nonce === p.nonce ? { ...x, state: "sending", error: undefined } : x)));
    try {
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: p.body, nonce: p.nonce }),
      });
      const data = (await res.json()) as { message?: ThreadMessage; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Couldn't send. Check your connection.");
      const sent = data.message;
      lastIdRef.current = Math.max(lastIdRef.current, sent.id);
      setMessages((prev) => mergeById(prev, [sent]));
      setPending((list) => list.filter((x) => x.nonce !== p.nonce));
      router.refresh();
    } catch (e) {
      const error = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't send. Check your connection.";
      setPending((list) => list.map((x) => (x.nonce === p.nonce ? { ...x, state: "failed", error } : x)));
      setAnnouncement(`Message not sent. ${error}`);
    }
  }

  function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const p: Pending = { nonce: crypto.randomUUID(), body, state: "sending" };
    setPending((list) => [...list, p]);
    setDraft("");
    stickToBottom.current = true;
    void deliver(p);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a new line. isComposing protects keyboards
    // that build characters in steps (e.g. some phone keyboards).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(`${base}/messages?before=${first.id}`, { cache: "no-store" });
      const data = (await res.json()) as { messages: ThreadMessage[]; hasOlder: boolean };
      stickToBottom.current = false;
      setMessages((prev) => mergeById(data.messages, prev));
      setHasOlder(data.hasOlder);
      // Keep the message you were looking at in the same place on screen.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  let lastDay = "";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" tabIndex={0} aria-label={`Conversation with ${otherName}`}>
        {hasOlder && (
          <div className="mb-4 text-center">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="btn btn-ghost btn-sm">
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && pending.length === 0 && (
          <p className="py-10 text-center text-ink-muted">No messages yet. Say hello to {otherName}.</p>
        )}
        <ol className="space-y-2">
          {messages.map((m) => {
            const day = dayFmt.format(new Date(m.created_at));
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.sender_id === meId;
            const showUnread = m.id === messages.find((x) => x.id > unreadFrom && x.sender_id !== meId)?.id && unreadFrom > 0;
            return (
              <li key={m.id}>
                {showDay && (
                  <p className="my-4 text-center text-xs font-bold tracking-wide text-ink-muted uppercase">{day}</p>
                )}
                {showUnread && (
                  <p className="my-3 flex items-center gap-2 text-xs font-bold text-brand">
                    <span className="h-px flex-1 bg-brand" aria-hidden="true" /> New messages <span className="h-px flex-1 bg-brand" aria-hidden="true" />
                  </p>
                )}
                {m.kind === "system" ? (
                  <p className="mx-auto max-w-md rounded-full bg-surface-2 px-4 py-1.5 text-center text-sm text-ink-muted">
                    <span aria-hidden="true">✦ </span>{m.body}
                  </p>
                ) : (
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    {/* Your bubbles are purple, theirs lavender: the 30/10 split in miniature. */}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 sm:max-w-[70%] ${mine ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-lavender text-on-lavender"}`}>
                      <p className="sr-only">{mine ? "You" : otherName}:</p>
                      <p className="break-words whitespace-pre-wrap">{m.body}</p>
                      <p className={`mt-0.5 text-right text-[0.7rem] ${mine ? "opacity-80" : "text-ink-muted"}`}>
                        <time dateTime={m.created_at}>{timeFmt.format(new Date(m.created_at))}</time>
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={p.nonce} className="flex flex-col items-end">
              <div className={`max-w-[85%] rounded-2xl rounded-br-md px-4 py-2 sm:max-w-[70%] ${p.state === "failed" ? "border-2 border-danger bg-danger-bg text-ink" : "bg-brand/70 text-on-brand"}`}>
                <p className="break-words whitespace-pre-wrap">{p.body}</p>
                <p className="mt-0.5 text-right text-[0.7rem]">{p.state === "sending" ? "Sending…" : "Not sent"}</p>
              </div>
              {p.state === "failed" && (
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-sm">
                  <span className="text-danger">{p.error}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void deliver(p)}>Retry</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending((l) => l.filter((x) => x.nonce !== p.nonce))}>Discard</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface p-3">
        <label htmlFor="composer" className="sr-only">Message {otherName}</label>
        <textarea
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={`Message ${otherName}…`}
          aria-describedby="composer-hint"
          className="input max-h-40 min-h-11 flex-1 resize-none py-2.5 [field-sizing:content]"
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
          Send
        </button>
        <p id="composer-hint" className="sr-only">Press Enter to send, Shift and Enter for a new line.</p>
      </form>
    </div>
  );
}
