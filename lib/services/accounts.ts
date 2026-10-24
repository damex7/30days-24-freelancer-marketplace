// Sign-up and login rules. Session cookies are handled by the caller.
import { pgCode, q1 } from "../db";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Role } from "./actor";
import { ConflictError, RuleError } from "./errors";

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: Exclude<Role, "admin">; // nobody can sign up as admin; the seed creates one
}): Promise<{ id: string; role: Role }> {
  const hash = await hashPassword(input.password);
  try {
    const row = await q1<{ id: string; role: Role }>(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, role`,
      [input.name, input.email, hash, input.role],
    );
    return row!;
  } catch (e) {
    // The UNIQUE constraint on email is the real guard against duplicate accounts,
    // even if two sign-ups with the same email arrive at the same moment.
    if (pgCode(e) === "23505") throw new RuleError("An account with this email already exists.", "email");
    throw e;
  }
}

export async function checkLogin(email: string, password: string): Promise<{ id: string; role: Role }> {
  const user = await q1<{ id: string; role: Role; password_hash: string | null; suspended_at: Date | null }>(
    "SELECT id, role, password_hash, suspended_at FROM users WHERE email = $1",
    [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  // Same message for "no such email" and "wrong password", so the form can't be
  // used to find out who has an account.
  if (!user || !ok) throw new RuleError("That email and password don't match.");
  if (user.suspended_at) throw new ConflictError("This account has been suspended. Contact support.");
  return { id: user.id, role: user.role };
}
