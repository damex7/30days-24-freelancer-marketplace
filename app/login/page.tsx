import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { login } from "@/app/actions/auth";
import { Field, Form } from "@/components/form";
import { PageSkeleton } from "@/components/ui";
import { currentActor, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Login {...props} />
    </Suspense>
  );
}

async function Login({ searchParams }: PageProps<"/login">) {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor.role));
  const next = (await searchParams).next;
  return (
    <div className="container-page grid max-w-md py-12">
      <h1 className="text-4xl font-semibold">Welcome back</h1>
      <p className="mt-2 mb-8 text-ink-muted">
        New here? <Link className="link" href="/signup">Create an account</Link>
      </p>
      <div className="card p-6">
        <Form action={login} submitLabel="Log in" pendingLabel="Logging in…">
          {typeof next === "string" && <input type="hidden" name="next" value={next} />}
          <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" />
          <Field name="password" label="Password" type="password" autoComplete="current-password" />
        </Form>
      </div>
    </div>
  );
}
