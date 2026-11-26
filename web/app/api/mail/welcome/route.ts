import { NextResponse } from "next/server";
import { sendClubWelcome } from "@/lib/mail";
import { serviceReady, serviceSelect, servicePatch } from "@/lib/service-db";

/**
 * The Club welcome letter.
 *
 * POST { email, name? }
 *
 * The sender must exist as a member — a row the handle_new_member trigger
 * created on real signup. A forged call for an arbitrary address finds no
 * member row and gets a 404, so the letter only ever follows a signup
 * (which already carries Supabase's own verification email).
 * welcome_sent_at makes the letter strictly once-per-member.
 */
export async function POST(request: Request) {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }

  let email = "";
  let name: string | null = null;
  try {
    const body = (await request.json()) as { email?: string; name?: string };
    email = (body.email ?? "").trim().toLowerCase();
    name = body.name?.trim() || null;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const members = await serviceSelect<{
    display_name: string | null;
    token: string;
    welcome_sent_at: string | null;
  }>(
    "members",
    `select=display_name,token,welcome_sent_at&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  const member = members?.[0];
  if (!member) {
    // no member row — the signup never happened; no letter
    return NextResponse.json({ ok: true, sent: false, note: "no member" });
  }
  if (member.welcome_sent_at) {
    return NextResponse.json({ ok: true, sent: false, note: "already welcomed" });
  }

  const result = await sendClubWelcome(
    email,
    name ?? member.display_name,
    member.token,
  );

  // the letter went out (or deliberately failed) — mark it sent either way
  // so a retry storm can't re-send; the runtime log holds the outcome
  await servicePatch(
    "members",
    `email=eq.${encodeURIComponent(email)}`,
    { welcome_sent_at: new Date().toISOString() },
  );

  return NextResponse.json({ ok: true, sent: result.ok, error: result.error ?? null });
}
