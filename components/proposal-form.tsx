import { submitProposalAction, updateProposalAction } from "@/app/actions/jobs";
import { koboToInput } from "@/lib/money";
import { Field, Form, TextArea } from "./form";

export function ProposalForm({ jobId, existing, budgetHint }: {
  jobId: string;
  existing?: { id: string; cover_letter: string; bid_kobo: number; duration_days: number };
  budgetHint: string;
}) {
  const action = existing ? updateProposalAction.bind(null, existing.id) : submitProposalAction.bind(null, jobId);
  return (
    <Form action={action} submitLabel={existing ? "Update proposal" : "Send proposal"} pendingLabel="Sending…">
      <Field
        name="bid"
        label="Your price"
        prefix="₦"
        inputMode="decimal"
        defaultValue={existing ? koboToInput(existing.bid_kobo) : undefined}
        hint={`The client's budget: ${budgetHint}.`}
      />
      <Field
        name="durationDays"
        label="How many days you need"
        inputMode="numeric"
        defaultValue={existing ? String(existing.duration_days) : undefined}
      />
      <TextArea
        name="coverLetter"
        label="Cover letter"
        rows={8}
        maxLength={3000}
        defaultValue={existing?.cover_letter}
        hint="50–3,000 characters. Say how you'd do the work and show similar work you've done."
      />
    </Form>
  );
}
