import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { addPortfolioAction, removePortfolioAction, saveProfileAction } from "@/app/actions/profile";
import { ActionButton, Field, Form, Select, SkillPicker, TextArea } from "@/components/form";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { MAX_FREELANCER_SKILLS, MAX_PORTFOLIO_ITEMS, STATES } from "@/lib/constants";
import { koboToInput } from "@/lib/money";
import { listSkills } from "@/lib/services/jobs";
import { getMyProfile } from "@/lib/services/profiles";

export const metadata: Metadata = { title: "My profile" };

export default function ProfileEditPage(props: PageProps<"/freelancer/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileEdit {...props} />
    </Suspense>
  );
}

async function ProfileEdit({ searchParams }: PageProps<"/freelancer/profile">) {
  const me = await requireActor("freelancer");
  const [{ profile, portfolio }, skills, sp] = await Promise.all([getMyProfile(me), listSkills(), searchParams]);
  return (
    <div className="max-w-3xl">
      {sp.welcome && (
        <p role="status" className="mb-6 rounded-2xl bg-lavender p-4 font-semibold text-on-lavender">
          Welcome to Gigroom! Fill in your profile so clients can find you.
        </p>
      )}
      <PageHeader
        title="My profile"
        subtitle="This is what clients see before they read your proposals."
        actions={profile ? <Link href={`/freelancers/${me.id}`} className="btn btn-secondary btn-sm">View public profile</Link> : undefined}
      />
      <div className="card p-5 sm:p-6">
        <Form action={saveProfileAction} submitLabel="Save profile">
          <Field name="headline" label="Headline" maxLength={100} defaultValue={profile?.headline} hint="One line about what you do, e.g. “Brand designer for food businesses”." />
          <TextArea name="bio" label="About you" rows={7} maxLength={2000} defaultValue={profile?.bio} hint="Your experience, the clients you've helped, and how you work. 50–2,000 characters." />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="hourlyRate" label="Hourly rate" prefix="₦" inputMode="decimal" defaultValue={profile ? koboToInput(profile.hourly_rate_kobo) : undefined} />
            <Field name="yearsExperience" label="Years of experience" inputMode="numeric" defaultValue={profile ? String(profile.years_experience) : undefined} />
            <Select name="state" label="State" options={STATES.map((s) => ({ value: s, label: s }))} placeholder="Choose your state" defaultValue={profile?.state} />
            <Field name="city" label="City or area" defaultValue={profile?.city} />
          </div>
          <Select
            name="availability"
            label="Availability"
            defaultValue={profile?.availability ?? "available"}
            options={[
              { value: "available", label: "Available now" },
              { value: "busy", label: "Busy, but open to offers" },
              { value: "away", label: "Away" },
            ]}
          />
          <SkillPicker legend="Your skills" skills={skills} max={MAX_FREELANCER_SKILLS} defaultValue={profile?.skills} />
        </Form>
      </div>

      <section aria-labelledby="portfolio" className="mt-10">
        <h2 id="portfolio" className="mb-1 text-2xl font-semibold">Portfolio</h2>
        <p className="mb-4 text-ink-muted">Links to work you&apos;re proud of: websites, Behance, YouTube, Google Drive. Up to {MAX_PORTFOLIO_ITEMS}.</p>
        {portfolio.length > 0 && (
          <ul className="mb-6 space-y-3">
            {portfolio.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="link">{p.title}</a>
                  {p.description && <p className="text-sm text-ink-muted">{p.description}</p>}
                </div>
                <ActionButton action={removePortfolioAction.bind(null, p.id)} label="Remove" className="btn btn-ghost btn-sm" confirm={`Remove “${p.title}”?`} />
              </li>
            ))}
          </ul>
        )}
        {!profile ? (
          <p className="text-ink-muted">Save your profile first, then add portfolio items.</p>
        ) : portfolio.length < MAX_PORTFOLIO_ITEMS ? (
          <div className="card p-5">
            <h3 className="mb-4 text-lg font-semibold">Add an item</h3>
            <Form action={addPortfolioAction} submitLabel="Add to portfolio" submitClassName="btn btn-secondary">
              <Field name="title" label="Title" maxLength={80} />
              <Field name="url" label="Link" type="url" inputMode="text" placeholder="https://" />
              <TextArea name="description" label="Short description" optional rows={3} maxLength={300} />
            </Form>
          </div>
        ) : null}
      </section>
    </div>
  );
}
