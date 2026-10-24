"use server";
import { refresh } from "next/cache";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { addPortfolioItem, removePortfolioItem, saveProfile } from "@/lib/services/profiles";
import { formToObject, portfolioSchema, profileSchema, uuidSchema } from "@/lib/validation";

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd, ["skills"]);
  try {
    await saveProfile(await currentActor(), profileSchema.parse(formToObject(fd, ["skills"])));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Profile saved. Clients can now find you.", values };
}

export async function addPortfolioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    await addPortfolioItem(await currentActor(), portfolioSchema.parse(Object.fromEntries(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Added to your portfolio." };
}

export async function removePortfolioAction(itemId: string): Promise<ActionState> {
  try {
    await removePortfolioItem(await currentActor(), uuidSchema.parse(itemId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}
