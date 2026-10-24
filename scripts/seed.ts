// npm run db:seed
// Creates skills, an admin, 3 clients, 6 freelancers, 10 jobs, proposals, two
// contracts (one active, one completed with reviews) and some conversations.
//
// It goes through the real service functions (createJob, submitProposal,
// acceptProposal, sendMessage...), so the seed data obeys exactly the same rules
// as data created in the app. Safe to run twice: skills and accounts are upserted,
// and the marketplace content is only created when the seed clients have no jobs.
import "./env";
process.env.EMAIL_LOG = "off";

import { hashPassword } from "../lib/auth/password";
import { pool, q, q1 } from "../lib/db";
import type { Actor, Role } from "../lib/services/actor";
import { completeContract, leaveReview } from "../lib/services/contracts";
import { createJob } from "../lib/services/jobs";
import { openConversationForProposal, sendMessage } from "../lib/services/messages";
import { addPortfolioItem, saveProfile } from "../lib/services/profiles";
import { acceptProposal, setProposalStatus, submitProposal } from "../lib/services/proposals";
import { jobSchema, profileSchema, proposalSchema } from "../lib/validation";
import { randomUUID } from "node:crypto";

const SKILLS: [string, string][] = [
  ["react", "React"], ["nextjs", "Next.js"], ["typescript", "TypeScript"], ["nodejs", "Node.js"],
  ["postgresql", "PostgreSQL"], ["tailwind", "Tailwind CSS"], ["flutter", "Flutter"],
  ["react-native", "React Native"], ["laravel", "Laravel"], ["wordpress", "WordPress"],
  ["figma", "Figma"], ["branding", "Branding"], ["illustrator", "Adobe Illustrator"],
  ["ui-ux", "UI/UX design"], ["copywriting", "Copywriting"], ["translation-yoruba", "Yoruba translation"],
  ["translation-hausa", "Hausa translation"], ["translation-igbo", "Igbo translation"],
  ["social-media", "Social media management"], ["seo", "SEO"], ["video-editing", "Video editing"],
  ["motion-graphics", "Motion graphics"], ["excel", "Excel"], ["power-bi", "Power BI"],
  ["python", "Python"], ["data-entry", "Data entry"], ["virtual-assistant", "Virtual assistance"],
  ["bookkeeping", "Bookkeeping"],
];

function need(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 8) throw new Error(`Set ${name} (at least 8 characters) in .env.local before seeding.`);
  return v;
}

async function upsertUser(email: string, name: string, role: Role, password: string): Promise<Actor> {
  const hash = await hashPassword(password);
  const row = await q1<{ id: string }>(
    `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [email, name, role, hash],
  );
  return { id: row!.id, name, email, role, isDemo: false };
}

// Forms send text, so seed values go through the same Zod schemas as the forms.
const job = (v: Record<string, unknown>) => jobSchema.parse({ locationType: "remote", state: "", deadline: "", experienceLevel: "intermediate", budgetType: "fixed", ...v });
const proposal = (coverLetter: string, bid: number, durationDays: number) =>
  proposalSchema.parse({ coverLetter, bid: String(bid), durationDays: String(durationDays) });
const say = (actor: Actor, conv: string, body: string) => sendMessage(actor, conv, { body, nonce: randomUUID() });

async function main() {
  const userPw = need("SEED_USER_PASSWORD");
  const adminPw = need("SEED_ADMIN_PASSWORD");

  for (const [slug, name] of SKILLS) {
    await q("INSERT INTO skills (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name", [slug, name]);
  }
  console.log(`skills: ${SKILLS.length}`);

  await upsertUser("admin@example.com", "Gigroom Admin", "admin", adminPw);
  const ngozi = await upsertUser("ngozi.client@example.com", "Ngozi Okafor", "client", userPw);
  const bello = await upsertUser("bello.client@example.com", "Bello Ibrahim", "client", userPw);
  const funke = await upsertUser("funke.client@example.com", "Funke Adebayo", "client", userPw);
  const amaka = await upsertUser("amaka.dev@example.com", "Amaka Nwosu", "freelancer", userPw);
  const yusuf = await upsertUser("yusuf.design@example.com", "Yusuf Garba", "freelancer", userPw);
  const seun = await upsertUser("seun.writer@example.com", "Seun Ogunleye", "freelancer", userPw);
  const ifeoma = await upsertUser("ifeoma.data@example.com", "Ifeoma Obi", "freelancer", userPw);
  const musa = await upsertUser("musa.video@example.com", "Musa Danjuma", "freelancer", userPw);
  const kemi = await upsertUser("kemi.mobile@example.com", "Kemi Alade", "freelancer", userPw);
  console.log("accounts: 1 admin, 3 clients, 6 freelancers");

  const existing = await q1<{ n: number }>("SELECT count(*)::int AS n FROM jobs WHERE client_id = ANY($1::uuid[])", [[ngozi.id, bello.id, funke.id]]);
  if ((existing?.n ?? 0) > 0) {
    console.log("Marketplace content already seeded. Nothing else to do.");
    return;
  }

  // ── Freelancer profiles ──
  const profiles: [Actor, Record<string, unknown>, [string, string, string][]][] = [
    [amaka, { headline: "Full-stack Next.js developer for Nigerian startups", bio: "I build web apps with Next.js, TypeScript and PostgreSQL: dashboards, marketplaces and Paystack checkouts. Seven years in, I've shipped products for fintech and logistics startups in Lagos and Abuja.", hourlyRate: "20000", state: "Lagos", city: "Lekki", yearsExperience: "7", availability: "available", skills: ["nextjs", "react", "typescript", "postgresql", "nodejs", "tailwind"] },
      [["Logistics tracking dashboard", "https://example.com/amaka/logistics", "Live delivery tracking for 300 riders in Lagos."], ["School fees portal", "https://example.com/amaka/fees", "Paystack payments and receipts for a group of schools in Abuja."]]],
    [yusuf, { headline: "Brand identity and UI designer", bio: "I design logos, brand systems and app interfaces in Figma. I've worked with restaurants, fashion labels and fintech teams, and I always deliver print-ready files and a simple brand guide.", hourlyRate: "12000", state: "Kaduna", city: "Kaduna", yearsExperience: "5", availability: "available", skills: ["figma", "branding", "illustrator", "ui-ux"] },
      [["Suya spot rebrand", "https://example.com/yusuf/suya", "Logo, menu and signage for a Kaduna grill house."]]],
    [seun, { headline: "Copywriter and Yoruba translator", bio: "I write website copy, product descriptions and adverts that sound like a real person, and translate between English and Yoruba for brands, NGOs and churches. Clear, warm and always on time.", hourlyRate: "6000", state: "Oyo", city: "Ibadan", yearsExperience: "6", availability: "busy", skills: ["copywriting", "translation-yoruba", "seo", "social-media"] }, []],
    [ifeoma, { headline: "Data analyst: Excel, Power BI and Python", bio: "I turn messy sales sheets into clean dashboards. Excel automation, Power BI reports and Python data cleaning for retailers, NGOs and microfinance banks across the South-East.", hourlyRate: "10000", state: "Enugu", city: "Enugu", yearsExperience: "4", availability: "available", skills: ["excel", "power-bi", "python", "data-entry"] },
      [["Microfinance loan dashboard", "https://example.com/ifeoma/loans", "Power BI dashboard tracking repayments across 12 branches."]]],
    [musa, { headline: "Video editor for YouTube, adverts and events", bio: "I edit YouTube videos, TikTok adverts and wedding highlights with clean motion graphics. Fast turnaround, captions included, and I work well from rough phone footage.", hourlyRate: "8000", state: "Abuja (FCT)", city: "Gwarinpa", yearsExperience: "5", availability: "available", skills: ["video-editing", "motion-graphics", "social-media"] }, []],
    [kemi, { headline: "Flutter developer for Android and iOS apps", bio: "I build mobile apps in Flutter with Firebase or a REST backend: delivery apps, booking apps and internal tools. I care about apps working well on cheap Android phones and slow networks.", hourlyRate: "18000", state: "Rivers", city: "Port Harcourt", yearsExperience: "6", availability: "away", skills: ["flutter", "react-native", "ui-ux"] }, []],
  ];
  for (const [actor, data, items] of profiles) {
    await saveProfile(actor, profileSchema.parse(data));
    for (const [title, url, description] of items) await addPortfolioItem(actor, { title, url, description });
  }
  console.log("profiles: 6");

  // ── Jobs ──
  const jShop = await createJob(ngozi, job({ title: "Build an online store for my Lagos fashion brand", description: "I sell ankara dresses and bags on Instagram and want a proper online store: product pages, sizes, Paystack checkout and delivery fees by state. I'd like to manage products myself.", category: "web-dev", budgetMin: "400000", budgetMax: "900000", experienceLevel: "expert", skills: ["nextjs", "react", "postgresql"] }));
  const jLogo = await createJob(ngozi, job({ title: "Logo and Instagram templates for a fashion label", description: "We need a modern logo for our ankara fashion brand plus 10 Instagram post templates in Figma that our team can edit. Bold colours, but still elegant.", category: "design", budgetMin: "100000", budgetMax: "250000", skills: ["figma", "branding"] }));
  const jVideo = await createJob(ngozi, job({ title: "Edit 8 short TikTok adverts from phone footage", description: "We'll send raw phone videos of our models trying on dresses. We need eight 20–30 second TikTok adverts with captions, music and our logo at the end.", category: "video", budgetMin: "60000", budgetMax: "150000", experienceLevel: "entry", skills: ["video-editing"] }));
  const jApp = await createJob(bello, job({ title: "Flutter delivery app for our Kano logistics company", description: "Riders need an Android app to see assigned deliveries, update status and capture proof of delivery photos. It must work on cheap phones and keep working when the network drops.", category: "mobile-dev", budgetMin: "1200000", budgetMax: "2500000", experienceLevel: "expert", locationType: "hybrid", state: "Kano", skills: ["flutter", "ui-ux"] }));
  const jDash = await createJob(bello, job({ title: "Power BI dashboard for delivery performance", description: "We export deliveries from our system as Excel every week. We want a Power BI dashboard showing on-time rate, deliveries per rider and failed deliveries by area.", category: "data", budgetMin: "150000", budgetMax: "300000", skills: ["power-bi", "excel"] }));
  const jHausa = await createJob(bello, job({ title: "Translate our rider handbook into Hausa", description: "A 25-page rider handbook (safety, customer service, using the app) needs translating from English into clear, everyday Hausa that riders will actually understand.", category: "writing", budgetMin: "50000", budgetMax: "120000", skills: ["translation-hausa"] }));
  const jSite = await createJob(funke, job({ title: "Website copy for an Ibadan private school", description: "We're relaunching our school website and need all the copy: home page, about us, admissions, fees and FAQs. Warm and trustworthy for parents. About 2,000 words.", category: "writing", budgetMin: "60000", budgetMax: "120000", skills: ["copywriting", "seo"] }));
  const jVa = await createJob(funke, job({ title: "Virtual assistant for admissions season (3 months)", description: "Answer parents' WhatsApp and email enquiries, book school tours, and keep our admissions spreadsheet up to date. About 20 hours a week, Monday to Friday.", category: "admin-support", budgetType: "hourly", budgetMin: "2000", budgetMax: "3500", experienceLevel: "entry", skills: ["virtual-assistant", "excel"] }));
  const jFees = await createJob(funke, job({ title: "School fees payment portal with Paystack", description: "Parents should log in, see what they owe per child and term, pay with Paystack and download receipts. The bursar needs a page to see who has paid.", category: "web-dev", budgetMin: "600000", budgetMax: "1200000", experienceLevel: "expert", skills: ["nextjs", "typescript", "postgresql"] }));
  const jSales = await createJob(funke, job({ title: "Clean up five years of sales records in Excel", description: "We have messy Excel files of uniform and book sales since 2021. We need them cleaned, combined into one workbook and summarised by year and item.", category: "data", budgetMin: "40000", budgetMax: "90000", experienceLevel: "entry", skills: ["excel", "data-entry"] }));
  console.log("jobs: 10");

  // ── Proposals ──
  const pAmakaShop = await submitProposal(amaka, jShop, proposal("Hello Ngozi! I've built two fashion stores with Paystack and delivery fees by state, so I know the details that matter: size variants, low-stock alerts and order emails. I'll give you an admin page to manage products yourself.", 750000, 21));
  await submitProposal(kemi, jShop, proposal("Hi! I mostly build mobile apps, but I can build your store as a web app too, then reuse the same backend for an Android app later if you want one. I'll keep the checkout simple.", 600000, 30));
  const pYusufLogo = await submitProposal(yusuf, jLogo, proposal("Good day! Fashion branding is a favourite of mine. I'll give you three logo directions in three days, then 10 editable Instagram templates in Figma with your fonts and colours.", 180000, 10));
  const pMusaVideo = await submitProposal(musa, jVideo, proposal("Hi Ngozi, phone footage is exactly what I work with every day. I'll add captions, trending music and an animated logo ending. First two adverts in 48 hours for your feedback.", 120000, 7));
  await submitProposal(kemi, jApp, proposal("Hello! I've built two rider apps in Flutter that work offline: deliveries are saved on the phone and sync when the network returns. Proof-of-delivery photos are compressed so they upload on 3G.", 2200000, 45));
  const pIfeomaDash = await submitProposal(ifeoma, jDash, proposal("Hi Bello! I built a similar Power BI dashboard for a microfinance bank. I'll connect to your weekly Excel export so the dashboard refreshes with one click.", 220000, 10));
  const pSeunSite = await submitProposal(seun, jSite, proposal("Good day! I've written websites for two schools in Ibadan. Parents want three things answered fast: fees, safety and results. I'll put those up front, in warm, simple English.", 95000, 7));
  await submitProposal(amaka, jFees, proposal("Hello! I built a school fees portal for a group of schools in Abuja with Paystack, per-term fees and PDF receipts. I can adapt that experience and have a first version in three weeks.", 1000000, 30));
  await submitProposal(ifeoma, jSales, proposal("Hi! Cleaning messy sales records is my everyday work. I'll standardise item names, remove duplicates and give you one workbook with a summary sheet and charts.", 70000, 5));
  console.log("proposals: 9");

  // ── Decisions, chats and contracts ──
  await setProposalStatus(ngozi, pAmakaShop, "shortlisted");
  const c1 = await openConversationForProposal(ngozi, pAmakaShop);
  await say(ngozi, c1, "Hi Amaka, thanks for your proposal. Can customers pay on delivery as well as with Paystack?");
  await say(amaka, c1, "Yes, I'd add pay on delivery as an option you can switch on per state, since it's risky for faraway orders.");
  await say(ngozi, c1, "That's exactly what I need. Can you share the link to one of the fashion stores?");

  // Active contract: Yusuf designing Ngozi's logo.
  const k1 = await acceptProposal(ngozi, pYusufLogo);
  const c2 = await openConversationForProposal(ngozi, pYusufLogo);
  await say(yusuf, c2, "Thanks for hiring me! Please send any brands you like the look of, and your Instagram handle.");
  void k1;

  // Completed contract with reviews both ways: Ifeoma's dashboard for Bello.
  const k2 = await acceptProposal(bello, pIfeomaDash);
  const c3 = await openConversationForProposal(bello, pIfeomaDash);
  await say(ifeoma, c3, "The dashboard is ready. I've shared the file and a two-minute video showing how to refresh it.");
  await say(bello, c3, "This is brilliant. Our managers already love the on-time chart.");
  await completeContract(bello, k2);
  await leaveReview(bello, k2, { rating: 5, comment: "Ifeoma understood our data immediately and the dashboard is now used in every Monday meeting." });
  await leaveReview(ifeoma, k2, { rating: 5, comment: "Clear brief, quick feedback and paid on time. A pleasure to work with." });

  // Another completed contract so Musa has a review too.
  const k3 = await acceptProposal(ngozi, pMusaVideo);
  await completeContract(ngozi, k3);
  await leaveReview(ngozi, k3, { rating: 4, comment: "Great adverts and fast. One video needed a second round of edits, but he fixed it the same day." });

  // Seun is shortlisted; Funke hasn't messaged yet.
  await setProposalStatus(funke, pSeunSite, "shortlisted");
  console.log("conversations: 3, contracts: 3 (1 active, 2 completed), reviews: 3");
  console.log("\nDone. Log in with any account above using SEED_USER_PASSWORD (admin uses SEED_ADMIN_PASSWORD).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
