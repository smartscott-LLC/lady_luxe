/**
 * Service-role REST access for the mail routes (bypasses RLS).
 * SUPABASE_URL + SUPABASE_SECRET_KEY are server-side env vars — never
 * surfaced to the browser.
 */

const URL_ = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SECRET_KEY ?? "";

export function serviceReady(): boolean {
  return Boolean(URL_ && KEY);
}

export async function serviceSelect<T = Record<string, unknown>>(
  table: string,
  query: string,
): Promise<T[] | null> {
  try {
    const resp = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T[];
  } catch {
    return null;
  }
}

export async function servicePatch(
  table: string,
  query: string,
  body: object,
): Promise<boolean> {
  try {
    const resp = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
