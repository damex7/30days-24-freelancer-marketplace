// Money is always integer kobo (₦1 = 100 kobo). Floats can't represent 0.1
// exactly, so ₦0.10 + ₦0.20 would not equal ₦0.30. Integers always add up.

const fmt = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});
const fmtExact = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** 1500000 → "₦15,000". Kobo are shown only when they aren't zero. */
export function naira(kobo: number): string {
  return kobo % 100 === 0 ? fmt.format(kobo / 100) : fmtExact.format(kobo / 100);
}

/**
 * Parse what a person types ("150,000", "₦150000.50") into kobo WITHOUT going
 * through a float: split on the decimal point and treat each side as digits.
 * Returns null for anything that isn't a valid amount.
 */
export function parseNairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = Number(m[1]);
  const fraction = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

/** Kobo back to a plain naira string for a form field ("150000" or "150000.50"). */
export function koboToInput(kobo: number): string {
  const whole = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}
