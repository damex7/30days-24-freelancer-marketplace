// Demo mode (the Day 20 pattern): one click gives a visitor their OWN small
// world, with no password. Everything is marked is_demo, hidden from the public
// board and directory, and deleted after 24 hours. Because every foreign key to
// users cascades, deleting the demo users removes all of it in one statement.
import { randomBytes } from "node:crypto";
import { q, tx, type Queryable } from "../db";
import { naira } from "../money";

const DAY = "24 hours";

/** Remove demo worlds older than a day. Safe to run any time, any number of times. */
export async function cleanupDemoData(): Promise<number> {
  const rows = await q("DELETE FROM users WHERE is_demo AND created_at < now() - $1::interval RETURNING id", [DAY]);
  return rows.length;
}

async function demoUser(db: Queryable, role: "client" | "freelancer", name: string, tag: string) {
  // example.com addresses are never emailed (see lib/email.ts), and Paystack-style
  // validators accept them, unlike .invalid, which caused trouble on Day 20.
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (name, email, role, is_demo) VALUES ($1, $2, $3, true) RETURNING id`,
    [name, `demo+${tag}-${randomBytes(5).toString("hex")}@example.com`, role],
  );
  return rows[0]!.id;
}

async function demoProfile(db: Queryable, userId: string, p: {
  headline: string; bio: string; rate: number; state: string; city: string; years: number; skills: string[];
}) {
  await db.query(
    `INSERT INTO freelancer_profiles (user_id, headline, bio, hourly_rate_kobo, state, city, years_experience)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, p.headline, p.bio, p.rate * 100, p.state, p.city, p.years],
  );
  await db.query(
    "INSERT INTO freelancer_skills SELECT $1, id FROM skills WHERE slug = ANY($2::text[])",
    [userId, p.skills],
  );
}

async function demoJob(db: Queryable, clientId: string, j: {
  title: string; description: string; category: string; min: number; max: number; skills: string[]; status?: string;
}) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO jobs (client_id, title, description, category, budget_type, budget_min_kobo, budget_max_kobo,
                       experience_level, location_type, status)
     VALUES ($1, $2, $3, $4, 'fixed', $5, $6, 'intermediate', 'remote', $7) RETURNING id`,
    [clientId, j.title, j.description, j.category, j.min * 100, j.max * 100, j.status ?? "open"],
  );
  const id = rows[0]!.id;
  await db.query("INSERT INTO job_skills SELECT $1, id FROM skills WHERE slug = ANY($2::text[])", [id, j.skills]);
  return id;
}

async function demoProposal(db: Queryable, jobId: string, freelancerId: string, bid: number, days: number, letter: string, status = "submitted") {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO proposals (job_id, freelancer_id, cover_letter, bid_kobo, duration_days, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [jobId, freelancerId, letter, bid * 100, days, status],
  );
  return rows[0]!.id;
}

async function demoChat(db: Queryable, jobId: string, clientId: string, freelancerId: string, lines: [string, string][], readByBoth = false) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO conversations (job_id, client_id, freelancer_id) VALUES ($1, $2, $3) RETURNING id",
    [jobId, clientId, freelancerId],
  );
  const id = rows[0]!.id;
  await db.query(
    "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
    [id, clientId, freelancerId],
  );
  let minutesAgo = lines.length * 7;
  for (const [sender, body] of lines) {
    await db.query(
      `INSERT INTO messages (conversation_id, sender_id, kind, body, created_at)
       VALUES ($1, $2, CASE WHEN $2::uuid IS NULL THEN 'system' ELSE 'text' END, $3, now() - make_interval(mins => $4))`,
      [id, sender || null, body, minutesAgo],
    );
    minutesAgo -= 7;
  }
  if (readByBoth) {
    await db.query(
      "UPDATE conversation_participants SET last_read_message_id = (SELECT max(id) FROM messages WHERE conversation_id = $1) WHERE conversation_id = $1",
      [id],
    );
  }
  return id;
}

const LETTER = (who: string, pitch: string) =>
  `Good day! I'm ${who}. ${pitch} I'll share progress every two days on this chat, and you'll get the source files at the end. Happy to start this week.`;

/** A client's demo: two jobs, proposals from three demo freelancers, a chat and an active contract. */
export async function startClientDemo(): Promise<string> {
  await cleanupDemoData();
  return tx(async (db) => {
    const me = await demoUser(db, "client", "Demo Client", "client");
    const f1 = await demoUser(db, "freelancer", "Zainab Musa (demo)", "f1");
    const f2 = await demoUser(db, "freelancer", "Chuka Eze (demo)", "f2");
    const f3 = await demoUser(db, "freelancer", "Tolu Adeyemi (demo)", "f3");
    await demoProfile(db, f1, { headline: "Brand designer for food and fashion businesses", bio: "I design logos, packaging and Instagram templates for small Nigerian brands. Six years of work for bakeries, boutiques and restaurants in Kano and Abuja.", rate: 9000, state: "Kano", city: "Kano", years: 6, skills: ["figma", "branding", "illustrator"] });
    await demoProfile(db, f2, { headline: "Next.js developer who ships fast landing pages", bio: "I build fast, accessible websites with Next.js and Tailwind. I've launched over 40 sites for SMEs in Lagos and Enugu, all with WhatsApp ordering built in.", rate: 15000, state: "Enugu", city: "Enugu", years: 5, skills: ["nextjs", "react", "tailwind"] });
    await demoProfile(db, f3, { headline: "Copywriter for menus, websites and adverts", bio: "I write clear, warm copy that sells: menus, website text, radio adverts and Instagram captions in English and Yoruba for Lagos businesses.", rate: 6000, state: "Lagos", city: "Ikeja", years: 4, skills: ["copywriting", "social-media"] });

    const job = await demoJob(db, me, {
      title: "Landing page and menu design for my Abuja bakery",
      description: "We're opening a second branch of our bakery in Wuse 2 and need a one-page website with our menu, prices, opening hours and a WhatsApp order button. We also need the menu designed for print. Please show similar work.",
      category: "web-dev", min: 150000, max: 350000, skills: ["nextjs", "figma"],
    });
    await demoProposal(db, job, f2, 280000, 10, LETTER("Chuka", "I've built six bakery and restaurant sites with WhatsApp ordering, so I know exactly what you need."), "shortlisted");
    await demoProposal(db, job, f1, 200000, 7, LETTER("Zainab", "I'll design your print menu and a matching page layout your developer can build from."));
    await demoProposal(db, job, f3, 90000, 5, LETTER("Tolu", "I'll write all the menu descriptions and website text so your cakes sound as good as they taste."));
    await demoChat(db, job, me, f2, [
      [f2, "Good afternoon! Thanks for shortlisting me. Do you already have photos of the cakes, or should I plan for a photoshoot?"],
      [me, "We have photos from our first branch. Can the WhatsApp button send the order details automatically?"],
      [f2, "Yes. The button opens WhatsApp with the items and the total already typed in, so your staff just confirm. I can show you a live example from a client in Enugu."],
    ]);

    // A second job that's already in progress, with Zainab hired.
    const job2 = await demoJob(db, me, {
      title: "New logo and packaging labels for our bakery",
      description: "We need a fresh logo and labels for our cake boxes and bread bags. Warm, friendly, and easy to print in one colour for cheaper printing.",
      category: "design", min: 80000, max: 150000, skills: ["branding", "illustrator"], status: "in_progress",
    });
    const p2 = await demoProposal(db, job2, f1, 120000, 7, LETTER("Zainab", "Bakery branding is my favourite kind of project; I'll give you three logo directions in the first three days."), "accepted");
    await db.query(
      "INSERT INTO contracts (job_id, proposal_id, client_id, freelancer_id, amount_kobo) VALUES ($1, $2, $3, $4, $5)",
      [job2, p2, me, f1, 120000 * 100],
    );
    await demoChat(db, job2, me, f1, [
      ["", `Demo Client hired Zainab Musa (demo) for ${naira(12000000)}. Contract started.`],
      [f1, "Here's the plan: three logo directions by Wednesday, then labels once you pick one."],
      [me, "Perfect, thank you!"],
    ], true);
    return me;
  });
}

/** A freelancer's demo: a profile, a shortlisted proposal with a chat, and a finished contract to review. */
export async function startFreelancerDemo(): Promise<string> {
  await cleanupDemoData();
  return tx(async (db) => {
    const me = await demoUser(db, "freelancer", "Demo Freelancer", "freelancer");
    const client = await demoUser(db, "client", "Hauwa Bello (demo)", "c1");
    await demoProfile(db, me, {
      headline: "Social media manager for growing Nigerian brands",
      bio: "I plan content calendars, design posts in Canva and Figma, and run Instagram and TikTok accounts for fashion and food brands. My clients usually double their reach in three months.",
      rate: 7000, state: "Lagos", city: "Yaba", years: 3, skills: ["social-media", "copywriting", "figma"],
    });
    await db.query(
      "INSERT INTO portfolio_items (freelancer_id, title, url, description) VALUES ($1, $2, $3, $4)",
      [me, "Instagram relaunch for a Yaba thrift store", "https://example.com/portfolio/thrift", "Grew followers from 2k to 11k in four months."],
    );

    const job = await demoJob(db, client, {
      title: "Social media manager for a Kano textile brand",
      description: "We sell adire and atampa fabrics online and need someone to run our Instagram and TikTok for three months: content calendar, captions, simple designs and replying to comments.",
      category: "marketing", min: 120000, max: 250000, skills: ["social-media", "copywriting"],
    });
    await demoProposal(db, job, me, 180000, 90, LETTER("the Demo Freelancer", "I've managed pages for two fabric sellers and know which posts make people order."), "shortlisted");
    await demoChat(db, job, client, me, [
      [client, "Hello! I liked your proposal. Can you post in Hausa as well as English?"],
      [me, "Yes, I can. I'd plan two Hausa posts a week to start and see how they perform."],
      [client, "Great. Can you send two sample captions for our new atampa collection?"],
    ]);

    // A finished contract: the client already reviewed you; you can review back.
    const job2 = await demoJob(db, client, {
      title: "Write 20 product descriptions for our online fabric store",
      description: "Short, vivid descriptions for 20 fabrics on our website: colour, feel, best use, and care instructions.",
      category: "writing", min: 30000, max: 60000, skills: ["copywriting"], status: "closed",
    });
    const p2 = await demoProposal(db, job2, me, 45000, 5, LETTER("the Demo Freelancer", "Product copy that helps customers picture the fabric is exactly what I write."), "accepted");
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO contracts (job_id, proposal_id, client_id, freelancer_id, amount_kobo, status, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', now() - interval '9 days', now() - interval '2 days') RETURNING id`,
      [job2, p2, client, me, 45000 * 100],
    );
    await db.query(
      "INSERT INTO reviews (contract_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, 5, $4)",
      [rows[0]!.id, client, me, "Fast, careful and the descriptions sold out two fabrics in a week. Will hire again."],
    );
    await demoChat(db, job2, client, me, [
      ["", `Hauwa Bello (demo) hired Demo Freelancer for ${naira(4500000)}. Contract started.`],
      [me, "All 20 descriptions are in the shared document. Let me know if you'd like any changes."],
      [client, "They're lovely. Marking the contract complete now."],
      ["", "Hauwa Bello (demo) marked the contract as completed."],
    ], true);
    return me;
  });
}
