import { NextResponse } from "next/server";
import { sendNewsletterConfirm } from "@/lib/mail";
import { serviceReady, serviceSelect, servicePatch } from "@/lib/service-db";

/**
 * The Private List confirmation.
 *
 * POST { email }
 *
 * The caller must already be a subscriber row (the NewsletterForm inserts
 * first, then asks for the letter — a forged call for an unlisted address
 * finds no row and gets no email). The row's private token becomes the
 * unsubscribe link.
 */
export async function POST(request: Request) {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const subs = await serviceSelect<{
    token: string;
    unsubscribed_at: string | null;
  }>(
    "subscribers",
    `select=token,unsubscribed_at&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  const sub = subs?.[0];
  if (!sub) {
    return NextResponse.json({ ok: true, sent: false, note: "not on the list" });
  }
  if (sub.unsubscribed_at) {
    return NextResponse.json({ ok: true, sent: false, note: "unsubscribed" });
  }

  const result = await sendNewsletterConfirm(email, sub.token);

  // the confirmation email doubles as the row's engagement mark
  await servicePatch(
    "subscribers",
    `email=eq.${encodeURIComponent(email)}`,
    { confirmed_at: new Date().toISOString() },
  );

  return NextResponse.json({ ok: true, sent: result.ok, error: result.error ?? null });
}
