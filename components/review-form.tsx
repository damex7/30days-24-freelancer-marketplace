import { reviewAction } from "@/app/actions/contracts";
import { Form, RadioGroup, TextArea } from "./form";

export function ReviewForm({ contractId, otherName }: { contractId: string; otherName: string }) {
  return (
    <Form action={reviewAction.bind(null, contractId)} submitLabel="Publish review" pendingLabel="Publishing…">
      <RadioGroup
        name="rating"
        legend={`How was working with ${otherName}?`}
        options={[
          { value: "5", label: "★★★★★ Excellent" },
          { value: "4", label: "★★★★ Good" },
          { value: "3", label: "★★★ Okay" },
          { value: "2", label: "★★ Poor" },
          { value: "1", label: "★ Very poor" },
        ]}
      />
      <TextArea name="comment" label="Your review" optional rows={4} maxLength={1000} hint="Public on their profile. Be specific and fair." />
    </Form>
  );
}
