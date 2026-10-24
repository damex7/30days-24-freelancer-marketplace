// Shared pieces for the two search pages. Filters are a plain GET form, so they
// work without JavaScript and every search is a shareable, bookmarkable URL.
import Link from "next/link";
import type { ReactNode } from "react";
import { hrefWith } from "@/lib/url";

export function FilterSelect({ name, label, value, options, any = "Any" }: {
  name: string; label: string; value?: string; options: readonly { value: string; label: string }[]; any?: string;
}) {
  return (
    <div>
      <label htmlFor={`flt-${name}`} className="label text-sm">{label}</label>
      <select id={`flt-${name}`} name={name} defaultValue={value ?? ""} className="input">
        <option value="">{any}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export type Chip = { key: string; label: string };

/** One chip per active filter, each a link that removes just that filter. */
export function ActiveFilters({ path, current, chips }: { path: string; current: Record<string, string | undefined>; chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-ink-muted">Filters:</span>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={hrefWith(path, current, { [c.key]: undefined, cursor: undefined })}
          className="chip hover:bg-lavender-hover"
          aria-label={`Remove filter: ${c.label}`}
        >
          {c.label} <span aria-hidden="true">✕</span>
        </Link>
      ))}
      <Link href={path} className="text-sm link">Clear all</Link>
    </div>
  );
}

export function SearchLayout({ filters, children }: { filters: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <aside aria-label="Filters">{filters}</aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
