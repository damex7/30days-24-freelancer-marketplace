"use client";
// The form kit. <Form> runs a Server Action with useActionState and shares the
// result with every field through context, so each field can show its own error
// (linked with aria-describedby) and keep what the person typed after an error.
// On error, a summary at the top receives focus so screen readers announce it.
import { createContext, use, useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { idle, type ActionState } from "@/lib/action-state";

type Ctx = { state: ActionState };
const FormCtx = createContext<Ctx>({ state: idle });

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const LABELS: Record<string, string> = {};

export function Form({
  action, children, submitLabel, pendingLabel = "Saving…", className = "", submitClassName = "btn btn-primary",
  footer,
}: {
  action: Action;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, idle);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") summary.current?.focus();
  }, [state]);

  const fieldErrors = Object.entries(state.fieldErrors ?? {}).filter(([, v]) => v?.length);
  return (
    <FormCtx value={{ state }}>
      {/* noValidate: the server is the source of truth for errors, and its
          messages appear in one consistent, accessible place. */}
      <form action={formAction} noValidate className={`space-y-5 ${className}`}>
        {state.status === "error" && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="rounded-xl border-2 border-danger bg-danger-bg p-4 text-ink"
          >
            <p className="font-bold text-danger">{state.message}</p>
            {fieldErrors.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {fieldErrors.map(([name, errs]) => (
                  <li key={name}>
                    <a className="link" href={`#f-${name}`}>
                      {LABELS[name] ? `${LABELS[name]}: ` : ""}
                      {errs![0]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {state.status === "success" && state.message && (
          <p role="status" className="rounded-xl bg-ok-bg p-3 font-semibold text-ok">
            ✓ {state.message}
          </p>
        )}
        {children}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} pendingLabel={pendingLabel} className={submitClassName} />
          {footer}
        </div>
      </form>
    </FormCtx>
  );
}

export function SubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function useField(name: string, defaultValue?: string | string[]) {
  const { state } = use(FormCtx);
  const error = state.fieldErrors?.[name]?.[0];
  const value = state.values && name in state.values ? state.values[name] : defaultValue;
  return { error, value, id: `f-${name}`, errorId: `f-${name}-error`, hintId: `f-${name}-hint` };
}

function describedBy(...ids: (string | false | undefined)[]) {
  const s = ids.filter(Boolean).join(" ");
  return s || undefined;
}

function FieldShell({ id, label, hint, hintId, error, errorId, children, optional }: {
  id: string; label: string; hint?: string; hintId: string; error?: string; errorId: string; children: ReactNode; optional?: boolean;
}) {
  LABELS[id.slice(2)] = label;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {optional && <span className="font-normal text-ink-muted">(optional)</span>}
      </label>
      {children}
      {hint && <p id={hintId} className="hint">{hint}</p>}
      {error && (
        <p id={errorId} className="field-error">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </div>
  );
}

type InputProps = {
  name: string; label: string; hint?: string; optional?: boolean; defaultValue?: string;
  type?: string; autoComplete?: string; inputMode?: "numeric" | "decimal" | "email" | "text";
  placeholder?: string; maxLength?: number; prefix?: string;
};

export function Field({ name, label, hint, optional, defaultValue, type = "text", prefix, ...rest }: InputProps) {
  const f = useField(name, defaultValue);
  const input = (
    <input
      id={f.id}
      name={name}
      type={type}
      // key: when the server sends values back, re-mount so the field shows them.
      key={String(f.value ?? "")}
      defaultValue={typeof f.value === "string" ? f.value : undefined}
      aria-invalid={f.error ? true : undefined}
      aria-describedby={describedBy(hint && f.hintId, f.error && f.errorId)}
      required={!optional}
      className={`input ${prefix ? "pl-8" : ""}`}
      {...rest}
    />
  );
  return (
    <FieldShell {...f} label={label} hint={hint} optional={optional}>
      {prefix ? (
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-ink-muted">{prefix}</span>
          {input}
        </div>
      ) : input}
    </FieldShell>
  );
}

export function TextArea({ name, label, hint, optional, defaultValue, maxLength, rows = 6, placeholder }: InputProps & { rows?: number }) {
  const f = useField(name, defaultValue);
  return (
    <FieldShell {...f} label={label} hint={hint} optional={optional}>
      <textarea
        id={f.id}
        name={name}
        key={String(f.value ?? "")}
        defaultValue={typeof f.value === "string" ? f.value : undefined}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={describedBy(hint && f.hintId, f.error && f.errorId)}
        required={!optional}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className="input"
      />
    </FieldShell>
  );
}

export function Select({ name, label, hint, optional, defaultValue, options, placeholder }: {
  name: string; label: string; hint?: string; optional?: boolean; defaultValue?: string;
  options: readonly { value: string; label: string }[]; placeholder?: string;
}) {
  const f = useField(name, defaultValue);
  return (
    <FieldShell {...f} label={label} hint={hint} optional={optional}>
      <select
        id={f.id}
        name={name}
        key={String(f.value ?? "")}
        defaultValue={typeof f.value === "string" ? f.value : ""}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={describedBy(hint && f.hintId, f.error && f.errorId)}
        required={!optional}
        className="input"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

/** Radio cards, used for "I want to hire / I want to work" and budget type. */
export function RadioGroup({ name, legend, options, defaultValue }: {
  name: string; legend: string; defaultValue?: string;
  options: { value: string; label: string; description?: string }[];
}) {
  const f = useField(name, defaultValue);
  LABELS[name] = legend;
  return (
    <fieldset id={f.id} tabIndex={-1} aria-describedby={f.error ? f.errorId : undefined}>
      <legend className="label">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2" key={String(f.value ?? "")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-3 rounded-xl border-[1.5px] border-line-strong p-3 hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-lavender has-[:checked]:text-on-lavender"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={f.value === o.value} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              <span className="block font-semibold">{o.label}</span>
              {o.description && <span className="block text-sm text-ink-muted">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {f.error && <p id={f.errorId} className="field-error"><span aria-hidden="true">⚠</span> {f.error}</p>}
    </fieldset>
  );
}

/** Skill picker: checkboxes styled as lavender tags. Works with keyboard and screen readers. */
export function SkillPicker({ name = "skills", legend, skills, defaultValue = [], max }: {
  name?: string; legend: string; skills: { slug: string; name: string }[]; defaultValue?: string[]; max: number;
}) {
  const f = useField(name, defaultValue);
  const chosen = new Set(Array.isArray(f.value) ? f.value : []);
  LABELS[name] = legend;
  return (
    <fieldset id={f.id} tabIndex={-1} aria-describedby={describedBy(f.hintId, f.error && f.errorId)}>
      <legend className="label">{legend}</legend>
      <p id={f.hintId} className="hint mb-2">Choose up to {max}.</p>
      <div className="flex flex-wrap gap-2" key={[...chosen].join(",")}>
        {skills.map((s) => (
          <label
            key={s.slug}
            className="group cursor-pointer rounded-full border border-line-strong px-3 py-1 text-sm font-semibold text-ink hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-lavender has-[:checked]:text-on-lavender has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
          >
            <input type="checkbox" name={name} value={s.slug} defaultChecked={chosen.has(s.slug)} className="sr-only" />
            <span aria-hidden="true" className="mr-1 hidden group-has-[:checked]:inline">✓</span>
            {s.name}
          </label>
        ))}
      </div>
      {f.error && <p id={f.errorId} className="field-error"><span aria-hidden="true">⚠</span> {f.error}</p>}
    </fieldset>
  );
}

/**
 * A single-button form for actions like "Shortlist", "Withdraw" or "Log out".
 * Errors appear right next to the button. `confirm` asks first for anything
 * that can't be undone.
 */
export function ActionButton({
  action, label, pendingLabel, className = "btn btn-secondary btn-sm", confirm, hidden,
}: {
  action: Action; label: string; pendingLabel?: string; className?: string; confirm?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, idle);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton label={label} pendingLabel={pendingLabel ?? `${label}…`} className={className} />
      {state.status === "error" && (
        <p role="alert" className="field-error mt-0 max-w-xs">{state.message}</p>
      )}
    </form>
  );
}
