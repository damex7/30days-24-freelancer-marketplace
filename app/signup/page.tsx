import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signup } from "@/app/actions/auth";
import { Field, Form, RadioGroup } from "@/components/form";
import { PageSkeleton } from "@/components/ui";
import { currentActor, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage(props: PageProps<"/signup">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Signup {...props} />
    </Suspense>
  );
}

async function Signup({ searchParams }: PageProps<"/signup">) {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor.role));
  const role = (await searchParams).role;
  return (
    <div className="container-page grid max-w-lg py-12">
      <h1 className="text-4xl font-semibold">Join Gigroom</h1>
      <p className="mt-2 mb-8 text-ink-muted">
        Already have an account? <Link className="link" href="/login">Log in</Link>
      </p>
      <div className="card p-6">
        <Form action={signup} submitLabel="Create account" pendingLabel="Creating your account…">
          <RadioGroup
            name="role"
            legend="I want to…"
            defaultValue={role === "client" || role === "freelancer" ? role : undefined}
            options={[
              { value: "client", label: "Hire freelancers", description: "Post jobs and review proposals." },
              { value: "freelancer", label: "Find work", description: "Build a profile and send proposals." },
            ]}
          />
          <Field name="name" label="Full name" autoComplete="name" />
          <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
          <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." />
        </Form>
        <p className="mt-4 text-sm text-ink-muted">
          One account is either a client or a freelancer. To do both, use two emails.
        </p>
      </div>
    </div>
  );
}
