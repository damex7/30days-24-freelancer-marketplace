"use server";
// Thin Server Actions: parse with Zod, call a service, set the cookie, redirect.
import { redirect } from "next/navigation";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp, endSession, homeFor, startSession } from "@/lib/auth/session";
import { checkLogin, registerUser } from "@/lib/services/accounts";
import { startClientDemo, startFreelancerDemo } from "@/lib/services/demo";
import { loginSchema, signupSchema } from "@/lib/validation";

/** Only allow redirects to our own pages (never to another site). */
function safeNext(v: FormDataEntryValue | null, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export async function signup(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  let home: string;
  try {
    if (!(await rateLimit(`signup:${await clientIp()}`, 10, 3600)))
      return { status: "error", message: "Too many sign-ups from this network. Try again in an hour.", values };
    const input = signupSchema.parse(Object.fromEntries(fd));
    const user = await registerUser(input);
    await startSession(user.id);
    home = user.role === "freelancer" ? "/freelancer/profile?welcome=1" : "/client/jobs/new?welcome=1";
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(home);
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  let target: string;
  try {
    const input = loginSchema.parse(Object.fromEntries(fd));
    // Limit by email AND by network: slows down password guessing on one account
    // and spraying many accounts from one place.
    const ip = await clientIp();
    const okEmail = await rateLimit(`login:${input.email}`, 8, 900);
    const okIp = await rateLimit(`login-ip:${ip}`, 40, 900);
    if (!okEmail || !okIp)
      return { status: "error", message: "Too many attempts. Wait 15 minutes and try again.", values };
    const user = await checkLogin(input.email, input.password);
    await startSession(user.id);
    target = safeNext(fd.get("next"), homeFor(user.role));
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(target);
}

export async function logout(): Promise<ActionState> {
  await endSession();
  redirect("/");
}

export async function startDemo(kind: "client" | "freelancer"): Promise<ActionState> {
  try {
    if (!(await rateLimit(`demo:${await clientIp()}`, 10, 3600)))
      return { status: "error", message: "Too many demos from this network. Try again later." };
    const userId = kind === "client" ? await startClientDemo() : await startFreelancerDemo();
    await startSession(userId);
  } catch (e) {
    return toActionError(e);
  }
  redirect(kind === "client" ? "/client" : "/freelancer");
}
