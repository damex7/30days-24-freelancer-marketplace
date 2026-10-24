"use server";
import { refresh } from "next/cache";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { cancelContract, completeContract, leaveReview } from "@/lib/services/contracts";
import { reviewSchema, uuidSchema } from "@/lib/validation";

export async function completeContractAction(contractId: string): Promise<ActionState> {
  try {
    await completeContract(await currentActor(), uuidSchema.parse(contractId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function cancelContractAction(contractId: string): Promise<ActionState> {
  try {
    await cancelContract(await currentActor(), uuidSchema.parse(contractId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function reviewAction(contractId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    await leaveReview(await currentActor(), uuidSchema.parse(contractId), reviewSchema.parse(Object.fromEntries(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Thanks! Your review is published." };
}
