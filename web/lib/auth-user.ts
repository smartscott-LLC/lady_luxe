/**
 * Session-token → member email. The fitting/consent surfaces accept the
 * caller's own Supabase access token and resolve it through GoTrue, so a
 * member can only ever act on their own record.
 */

export async function tokenEmail(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const base = process.env.SUPABASE_URL ?? "";
  try {
    const resp = await fetch(`${base}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_SECRET_KEY ?? "",
      },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { email?: string };
    return user.email ?? null;
  } catch {
    return null;
  }
}
