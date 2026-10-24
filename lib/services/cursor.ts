// Keyset cursors are [sort value, id] encoded as URL-safe base64 JSON.
// They're opaque to the person; a tampered cursor just decodes to null.
export function encodeCursor(parts: [string, string]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): [string, string] | null {
  if (!cursor) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(v) && v.length === 2 &&
      typeof v[0] === "string" && typeof v[1] === "string" &&
      /^[0-9a-f-]{36}$/.test(v[1]) && v[0].length < 40
    ) {
      return [v[0], v[1]];
    }
  } catch {}
  return null;
}
