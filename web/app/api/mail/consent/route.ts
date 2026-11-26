import { NextResponse } from "next/server";
import { serviceReady, serviceSelect, servicePatch } from "@/lib/service-db";

/**
 * Consent sync — one intent, two surfaces.
 *
 * POST { email, consent: boolean }
 * Authorization: Bearer <the member's Supabase access token>
 *
 * The token must name the same address as the body: consent belongs to its
 * owner only. The member row must exist (real signup, via the trigger).
 *
 * consent=true  → the address joins the Private List (source "club",
 *                 idempotent upsert; a previous leave is cleared — this
 *                 toggle IS a fresh, explicit opt-in) and the member row's
 *                 consent flips true.
 * consent=false → the address is marked off the monthly letter and the
 *                 member row's consent flips false. Membership untouched.
 *
 * The Club page calls this after signup-with-consent (first login) and on
 * the consent toggle; the members row and the list can never drift.
 */

async function tokenEmail(request: Request): Promise<string | null> {
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

export async function POST(request: Request) {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }

  let email = "";
  let consent: boolean | null = null;
  try {
    const body = (await request.json()) as { email?: string; consent?: boolean };
    email = (body.email ?? "").trim().toLowerCase();
    consent = typeof body.consent === "boolean" ? body.consent : null;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!email || consent === null) {
    return NextResponse.json({ error: "email and consent required" }, { status: 400 });
  }

  // consent is the member's own — the session token must name the address
  const owner = await tokenEmail(request);
  if (!owner || owner.trim().toLowerCase() !== email) {
    return NextResponse.json({ error: "not the consent owner" }, { status: 403 });
  }

  const members = await serviceSelect("members", `select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!members || members.length === 0) {
    return NextResponse.json({ ok: true, synced: false, note: "no member" });
  }

  if (consent) {
    // idempotent upsert — an existing row is cleared of a past leave
    // because this toggle is a fresh, explicit opt-in by the owner of it
    const up = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/subscribers?on_conflict=email`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY ?? "",
          Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY ?? ""}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          email,
          source: "club",
          unsubscribed_at: null,
          confirmed_at: new Date().toISOString(),
        }),
      },
    );
    if (!up.ok) {
      return NextResponse.json(
        { error: "list sync failed", detail: (await up.text()).slice(0, 160) },
        { status: 502 },
      );
    }
    await servicePatch("members", `email=eq.${encodeURIComponent(email)}`, {
      marketing_consent: true,
    });
    return NextResponse.json({ ok: true, synced: true, on: true });
  }

  await servicePatch("subscribers", `email=eq.${encodeURIComponent(email)}`, {
    unsubscribed_at: new Date().toISOString(),
  });
  await servicePatch("members", `email=eq.${encodeURIComponent(email)}`, {
    marketing_consent: false,
  });
  return NextResponse.json({ ok: true, synced: true, on: false });
}
