// npm run check:marketplace
// Runs the real service functions against the real database and prints pass or
// fail for each ownership, proposal and messaging rule. It creates its own
// throwaway users (marked is_demo) and deletes them at the end.
import "./env";
process.env.EMAIL_LOG = "off";

import { randomUUID } from "node:crypto";
import { pgCode, pool, q, q1 } from "../lib/db";
import type { Actor } from "../lib/services/actor";
import { completeContract, getContract, leaveReview } from "../lib/services/contracts";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/services/errors";
import { closeJob, createJob, getJob, searchJobs } from "../lib/services/jobs";
import {
  getConversation, listMessages, markRead, openConversationForProposal, sendMessage, unreadTotal,
} from "../lib/services/messages";
import { saveProfile } from "../lib/services/profiles";
import {
  acceptProposal, listProposalsForJob, submitProposal, updateProposal, withdrawProposal,
} from "../lib/services/proposals";
import { jobSearchSchema, jobSchema, profileSchema, proposalSchema } from "../lib/validation";

let passed = 0, failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function rejects(p: Promise<unknown>, type: new (...a: never[]) => Error, label: string) {
  try {
    await p;
  } catch (e) {
    if (e instanceof type) return;
    throw new Error(`${label}: expected ${type.name}, got ${e instanceof Error ? e.constructor.name + ": " + e.message : e}`);
  }
  throw new Error(`${label}: expected ${type.name}, but it succeeded`);
}

const tag = randomUUID().slice(0, 8);
async function user(role: "client" | "freelancer" | "admin", name: string): Promise<Actor> {
  const email = `check-${tag}-${name.toLowerCase()}@example.com`;
  const row = await q1<{ id: string }>(
    "INSERT INTO users (name, email, role, is_demo) VALUES ($1, $2, $3, true) RETURNING id",
    [name, email, role],
  );
  return { id: row!.id, name, email, role, isDemo: true };
}
const profile = profileSchema.parse({
  headline: "Check-script freelancer profile", bio: "x".repeat(60), hourlyRate: "5000",
  state: "Lagos", city: "Ikeja", yearsExperience: "2", availability: "available", skills: ["react"],
});
const jobInput = (title: string) => jobSchema.parse({
  title, description: "A job created by the check script to test the rules. ".repeat(2),
  category: "web-dev", budgetType: "fixed", budgetMin: "50000", budgetMax: "100000",
  experienceLevel: "entry", locationType: "remote", state: "", deadline: "", skills: ["react"],
});
const bid = (n: number) => proposalSchema.parse({ coverLetter: "I can do this job well. ".repeat(4), bid: String(n), durationDays: "7" });

async function main() {
  console.log("\nGigroom rule checks\n");
  const clientA = await user("client", "ClientA");
  const clientB = await user("client", "ClientB");
  const admin = await user("admin", "Admin");
  const free: Actor[] = [];
  for (let i = 0; i < 10; i++) {
    const f = await user("freelancer", `Free${i}`);
    await saveProfile(f, profile);
    free.push(f);
  }
  const [f0, f1, f2] = free as [Actor, Actor, Actor];
  const jobA = await createJob(clientA, jobInput(`Check job A ${tag}`));

  // ── Proposals ──
  const p0 = await submitProposal(f0, jobA, bid(60000));
  await check("a second proposal from the same freelancer is rejected", () =>
    rejects(submitProposal(f0, jobA, bid(70000)), ConflictError, "duplicate"));
  await check("a client account can't send a proposal", () =>
    rejects(submitProposal(clientB, jobA, bid(70000)), ForbiddenError, "client proposing"));
  await check("a freelancer can't edit another freelancer's proposal (not found)", () =>
    rejects(updateProposal(f1, p0, bid(1000)), NotFoundError, "edit other's proposal"));
  await check("another client can't see the proposals for my job (not found)", () =>
    rejects(listProposalsForJob(clientB, jobA), NotFoundError, "list other's proposals"));
  await check("another client can't accept a proposal on my job (not found)", () =>
    rejects(acceptProposal(clientB, p0), NotFoundError, "accept other's proposal"));

  // ── Messaging ──
  await check("a freelancer can't start a conversation (only clients can)", () =>
    rejects(openConversationForProposal(f0 as Actor, p0), ForbiddenError, "freelancer opening chat"));
  const conv = await openConversationForProposal(clientA, p0);
  await check("opening the same conversation twice returns the same one", async () => {
    const again = await openConversationForProposal(clientA, p0);
    assert(again === conv, "got a different conversation id");
  });
  await check("an outsider can't read a conversation (not found)", () =>
    rejects(getConversation(f1, conv), NotFoundError, "outsider reading"));
  await check("an outsider can't post in a conversation (not found)", () =>
    rejects(sendMessage(f1, conv, { body: "hi", nonce: randomUUID() }), NotFoundError, "outsider posting"));
  await check("an admin can't read private messages", () =>
    rejects(listMessages(admin, conv), ForbiddenError, "admin reading"));
  await check("sending the same message twice (same nonce) stores it once", async () => {
    const nonce = randomUUID();
    const a = await sendMessage(clientA, conv, { body: "Hello from A", nonce });
    const b = await sendMessage(clientA, conv, { body: "Hello from A", nonce });
    assert(a.id === b.id, "two different messages were stored");
    const n = await q1<{ n: number }>("SELECT count(*)::int AS n FROM messages WHERE client_nonce = $1", [nonce]);
    assert(n?.n === 1, `expected 1 row, found ${n?.n}`);
  });
  await check("unread count goes up for the other person and back to 0 after reading", async () => {
    const before = await unreadTotal(f0);
    const m = await sendMessage(clientA, conv, { body: "Are you free this week?", nonce: randomUUID() });
    assert((await unreadTotal(f0)) === before + 1, "unread didn't go up");
    assert((await unreadTotal(clientA)) === 0, "sender has unread messages from themselves");
    await markRead(f0, conv, m.id);
    assert((await unreadTotal(f0)) === 0, "unread didn't reset");
  });
  await check("polling with ?after returns only newer messages", async () => {
    const { messages } = await listMessages(f0, conv);
    const last = messages.at(-1)!;
    const m = await sendMessage(f0, conv, { body: "Yes I am", nonce: randomUUID() });
    const { messages: newer } = await listMessages(clientA, conv, { after: last.id });
    assert(newer.length === 1 && newer[0]!.id === m.id, `expected just the new message, got ${newer.length}`);
  });
  await check("the database refuses a message from a non-participant (composite FK)", async () => {
    try {
      await q("INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, 'sneaky')", [conv, f1.id]);
    } catch (e) {
      if (pgCode(e) === "23503") return;
      throw e;
    }
    throw new Error("the insert succeeded");
  });

  // ── Accepting: the race ──
  const raceProposals: string[] = [];
  for (const f of free) if (f !== f0) raceProposals.push(await submitProposal(f, jobA, bid(65000)));
  await check("10 simultaneous accepts on the same job create exactly 1 contract", async () => {
    const results = await Promise.allSettled([p0, ...raceProposals].map((id) => acceptProposal(clientA, id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const contracts = await q1<{ n: number }>("SELECT count(*)::int AS n FROM contracts WHERE job_id = $1", [jobA]);
    const accepted = await q1<{ n: number }>("SELECT count(*)::int AS n FROM proposals WHERE job_id = $1 AND status = 'accepted'", [jobA]);
    assert(ok === 1, `${ok} accepts succeeded`);
    assert(contracts?.n === 1, `${contracts?.n} contracts exist`);
    assert(accepted?.n === 1, `${accepted?.n} accepted proposals`);
  });
  await check("after hiring, the other proposals are declined and the job is in progress", async () => {
    const job = await q1<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [jobA]);
    const pending = await q1<{ n: number }>("SELECT count(*)::int AS n FROM proposals WHERE job_id = $1 AND status IN ('submitted','shortlisted')", [jobA]);
    assert(job?.status === "in_progress", `job is ${job?.status}`);
    assert(pending?.n === 0, `${pending?.n} still pending`);
  });
  const late = await user("freelancer", "Late");
  await saveProfile(late, profile);
  await check("no new proposals on a job that's no longer open", () =>
    rejects(submitProposal(late, jobA, bid(50000)), ConflictError, "late proposal"));

  const contract = await q1<{ id: string; freelancer_id: string }>("SELECT id, freelancer_id FROM contracts WHERE job_id = $1", [jobA]);
  const hired = free.find((f) => f.id === contract!.freelancer_id)!;
  const outsider = free.find((f) => f.id !== hired.id)!;
  await check("a stranger can't open the contract (not found)", () =>
    rejects(getContract(outsider, contract!.id), NotFoundError, "outsider contract"));
  await check("the database refuses a contract whose client doesn't own the job (composite FK)", async () => {
    const jobB = await createJob(clientB, jobInput(`Check job B ${tag}`));
    const pb = await submitProposal(f2.id === hired.id ? f0 : f2, jobB, bid(55000));
    try {
      await q(
        "INSERT INTO contracts (job_id, proposal_id, client_id, freelancer_id, amount_kobo) SELECT job_id, id, $2, freelancer_id, 100 FROM proposals WHERE id = $1",
        [pb, clientA.id],
      );
    } catch (e) {
      if (pgCode(e) === "23503") return;
      throw e;
    }
    throw new Error("the insert succeeded");
  });

  // ── Completing and reviews ──
  await check("reviews are refused while the contract is still active", () =>
    rejects(leaveReview(clientA, contract!.id, { rating: 5, comment: "" }), ConflictError, "early review"));
  await check("only the client can mark a contract completed", () =>
    rejects(completeContract(hired, contract!.id), ForbiddenError, "freelancer completing"));
  await completeContract(clientA, contract!.id);
  await check("each side can review once after completion", async () => {
    await leaveReview(clientA, contract!.id, { rating: 5, comment: "Great" });
    await leaveReview(hired, contract!.id, { rating: 4, comment: "Good client" });
    await rejects(leaveReview(clientA, contract!.id, { rating: 1, comment: "again" }), ConflictError, "second review");
  });

  // ── Visibility and search ──
  await check("a closed job disappears for strangers but not for its client", async () => {
    const jobC = await createJob(clientB, jobInput(`Check job C ${tag}`));
    await closeJob(clientB, jobC);
    await rejects(getJob(outsider, jobC), NotFoundError, "stranger viewing closed job");
    const mine = await getJob(clientB, jobC);
    assert(mine.isOwner, "owner couldn't open it");
  });
  await check("withdrawing a proposal works only for its author", async () => {
    const jobD = await createJob(clientB, jobInput(`Check job D ${tag}`));
    const pd = await submitProposal(outsider, jobD, bid(51000));
    await rejects(withdrawProposal(hired, pd), NotFoundError, "withdraw other's");
    await withdrawProposal(outsider, pd);
  });
  await check("keyset pages never repeat a job", async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const { jobs, nextCursor } = await searchJobs(jobSearchSchema.parse({ cursor }));
      for (const j of jobs) {
        assert(!seen.has(j.id), `job ${j.id} appeared twice`);
        seen.add(j.id);
      }
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    assert(seen.size > 0, "no jobs found; run npm run db:seed first");
  });
  await check("a tampered cursor or bad sort in the URL doesn't crash search", async () => {
    await searchJobs(jobSearchSchema.parse({ cursor: "not-a-cursor", sort: "banana", minBudget: "abc" }));
  });

  // Clean up: every foreign key to users cascades, so this removes everything above.
  await q("DELETE FROM users WHERE email LIKE $1", [`check-${tag}-%`]);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
