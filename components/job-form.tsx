import { CATEGORIES, EXPERIENCE, LOCATION_TYPES, MAX_JOB_SKILLS, STATES } from "@/lib/constants";
import { koboToInput } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";
import type { JobCard } from "@/lib/services/jobs";
import { Field, Form, RadioGroup, Select, SkillPicker, TextArea } from "./form";

export function JobForm({ action, skills, job, submitLabel }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  skills: { slug: string; name: string }[];
  job?: JobCard;
  submitLabel: string;
}) {
  return (
    <Form action={action} submitLabel={submitLabel} pendingLabel="Saving…">
      <Field name="title" label="Job title" maxLength={120} defaultValue={job?.title} hint="10–120 characters, e.g. “Logo and Instagram templates for a fashion label”." />
      <TextArea name="description" label="Describe the work" rows={8} maxLength={5000} defaultValue={job?.description} hint="What needs doing, what you'll provide, and what a great result looks like. At least 50 characters." />
      <div className="grid gap-5 sm:grid-cols-2">
        <Select name="category" label="Category" options={CATEGORIES} placeholder="Choose a category" defaultValue={job?.category} />
        <Select name="experienceLevel" label="Experience needed" options={EXPERIENCE} placeholder="Choose a level" defaultValue={job?.experience_level ?? "intermediate"} />
      </div>
      <RadioGroup
        name="budgetType"
        legend="How will you pay?"
        defaultValue={job?.budget_type ?? "fixed"}
        options={[
          { value: "fixed", label: "Fixed price", description: "One price for the whole job." },
          { value: "hourly", label: "Hourly", description: "Pay for the hours worked." },
        ]}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="budgetMin" label="Budget from" prefix="₦" inputMode="decimal" defaultValue={job ? koboToInput(job.budget_min_kobo) : undefined} />
        <Field name="budgetMax" label="Budget up to" prefix="₦" inputMode="decimal" defaultValue={job ? koboToInput(job.budget_max_kobo) : undefined} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Select name="locationType" label="Where" options={LOCATION_TYPES} defaultValue={job?.location_type ?? "remote"} />
        <Select name="state" label="State" optional options={STATES.map((s) => ({ value: s, label: s }))} placeholder="Not needed for remote" defaultValue={job?.state ?? ""} hint="Required for hybrid and on-site jobs." />
        <Field name="deadline" label="Deadline" type="date" optional defaultValue={job?.deadline ?? ""} />
      </div>
      <SkillPicker legend="Skills needed" skills={skills} max={MAX_JOB_SKILLS} defaultValue={job?.skills.map((s) => s.slug)} />
    </Form>
  );
}
