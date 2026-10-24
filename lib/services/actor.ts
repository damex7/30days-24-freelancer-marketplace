// The "acting user" that every service function receives as its first argument.
// Services never read cookies themselves; the caller passes who is asking.
// That keeps permission checks in one layer and lets the check script call the
// same functions as different people.
export type Role = "client" | "freelancer" | "admin";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isDemo: boolean;
};

import { ForbiddenError } from "./errors";

export function mustBe(actor: Actor | null, ...roles: Role[]): Actor {
  if (!actor) throw new ForbiddenError("Please log in first.");
  if (!roles.includes(actor.role)) {
    throw new ForbiddenError(
      roles.length === 1 && roles[0] === "client"
        ? "Only client accounts can do this."
        : roles.length === 1 && roles[0] === "freelancer"
          ? "Only freelancer accounts can do this."
          : "You can't do that with this account.",
    );
  }
  return actor;
}
