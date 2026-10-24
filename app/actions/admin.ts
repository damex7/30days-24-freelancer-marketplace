"use server";
import { refresh } from "next/cache";
import { toActionError, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { adminCloseJob, suspendUser, unsuspendUser } from "@/lib/services/admin";
import { uuidSchema } from "@/lib/validation";

const reason = (fd: FormData) => String(fd.get("reason") ?? "");

export async function suspendAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await suspendUser(await currentActor(), uuidSchema.parse(userId), reason(fd));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success", message: "Account suspended." };
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  try {
    await unsuspendUser(await currentActor(), uuidSchema.parse(userId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function adminCloseJobAction(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await adminCloseJob(await currentActor(), uuidSchema.parse(jobId), reason(fd));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success", message: "Job closed." };
}
