"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, valuesOf, type ActionState } from "@/lib/action-state";
import { currentActor } from "@/lib/auth/session";
import { closeJob, createJob, updateJob } from "@/lib/services/jobs";
import { acceptProposal, setProposalStatus, submitProposal, updateProposal, withdrawProposal } from "@/lib/services/proposals";
import { openConversationForProposal } from "@/lib/services/messages";
import { formToObject, jobSchema, proposalSchema, uuidSchema } from "@/lib/validation";

// Ids arrive via .bind() from a Server Component, but a Server Action is a
// public endpoint: anyone can call it with any id. So ids are validated, and
// every service checks ownership itself.
const id = (v: string) => uuidSchema.parse(v);

export async function createJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd, ["skills"]);
  let jobId: string;
  try {
    const input = jobSchema.parse(formToObject(fd, ["skills"]));
    jobId = await createJob(await currentActor(), input);
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(`/client/jobs/${jobId}?posted=1`);
}

export async function updateJobAction(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd, ["skills"]);
  try {
    await updateJob(await currentActor(), id(jobId), jobSchema.parse(formToObject(fd, ["skills"])));
  } catch (e) {
    return toActionError(e, values);
  }
  redirect(`/client/jobs/${jobId}`);
}

export async function closeJobAction(jobId: string): Promise<ActionState> {
  try {
    await closeJob(await currentActor(), id(jobId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function submitProposalAction(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    await submitProposal(await currentActor(), id(jobId), proposalSchema.parse(Object.fromEntries(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Proposal sent. The client will be notified by email." };
}

export async function updateProposalAction(proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = valuesOf(fd);
  try {
    await updateProposal(await currentActor(), id(proposalId), proposalSchema.parse(Object.fromEntries(fd)));
  } catch (e) {
    return toActionError(e, values);
  }
  refresh();
  return { status: "success", message: "Proposal updated.", values };
}

export async function withdrawProposalAction(proposalId: string): Promise<ActionState> {
  try {
    await withdrawProposal(await currentActor(), id(proposalId));
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function decideProposalAction(proposalId: string, decision: "shortlisted" | "declined"): Promise<ActionState> {
  try {
    await setProposalStatus(await currentActor(), id(proposalId), decision === "declined" ? "declined" : "shortlisted");
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  return { status: "success" };
}

export async function acceptProposalAction(proposalId: string): Promise<ActionState> {
  let contractId: string;
  try {
    contractId = await acceptProposal(await currentActor(), id(proposalId));
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/contracts/${contractId}?hired=1`);
}

export async function messageFreelancerAction(proposalId: string): Promise<ActionState> {
  let conversationId: string;
  try {
    conversationId = await openConversationForProposal(await currentActor(), id(proposalId));
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/messages/${conversationId}`);
}
