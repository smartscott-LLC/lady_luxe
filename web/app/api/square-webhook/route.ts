import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Square webhook receiver.
 *
 * Verifies Square's HMAC-SHA256 signature (square-webhook-signature-key),
 * then handles the events that matter:
 *   payment.updated  — syncs the payment state onto our orders
 *   payout.* / bank_account.created — acknowledged (the seller's money
 *   movements; Square stops retrying once we answer 200)
 *
 * Square signs: HMAC-SHA256(request body + notification URL, the
 * signature key from the developer dashboard).
 */

const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
// Square bakes the notification URL into the HMAC — the receiver must
// verify against the same URL the dashboard configures. Every plausible
// form is tried (the two domains, with and without the trailing slash).
const NOTIFICATION_URLS = [
  "https://www.ladyluxeclub.com/api/square-webhook",
  "https://www.ladyluxeclub.com/api/square-webhook/",
  "https://ladyluxe.club/api/square-webhook",
  "https://ladyluxe.club/api/square-webhook/",
];
const DEBUG_WEBHOOK = process.env.SQUARE_WEBHOOK_DEBUG === "1";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature") ?? "";

  if (!SIGNATURE_KEY) {
    return NextResponse.json(
      { error: "webhook key not configured" },
      { status: 500 },
    );
  }
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }
  // the signature bakes in the notification URL — try every form; if none
  // verify and debug is on, log what arrived for comparison
  let verified = false;
  const candidates: string[] = [];
  for (const url of NOTIFICATION_URLS) {
    const expected = createHmac("sha256", SIGNATURE_KEY)
      .update(raw + url)
      .digest("base64");
    candidates.push(expected);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      verified = true;
      break;
    }
  }
  if (!verified) {
    if (DEBUG_WEBHOOK) {
      console.log(
        "[square-webhook] signature mismatch — received:",
        signature,
        "body-sha256:",
        createHmac("sha256", SIGNATURE_KEY).update(raw).digest("base64"),
        "candidates:",
        JSON.stringify(candidates),
      );
    }
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // --- dispatch on the event type ---
  // a webhook receiver answers 200 to everything it accepted — an event
  // that surprises us is logged, never a 500 that re-triggers the storm
  let type = "";
  let paymentId = "";
  let paymentStatus = "";
  try {
    const event = JSON.parse(raw);
    type = event.type ?? "";
    const payment = event.data?.object?.payment ?? {};
    paymentId = payment.id ?? "";
    paymentStatus = payment.status ?? "";
  } catch (parseErr) {
    console.log(
      "[square-webhook] parse failed:",
      String(parseErr).slice(0, 120),
    );
    return NextResponse.json({ ok: true, note: "parse failed — acknowledged" });
  }

  // payment.updated — the charge state changed after the initial response
  if (type === "payment.updated" && paymentId) {
    try {
      const supabase = await createClient();
      const { data: orders, error: qErr } = await supabase
        .from("orders")
        .select("id, status")
        .eq("square_payment_id", paymentId)
        .limit(1);
      if (qErr) throw new Error(qErr.message);
      const order = orders?.[0];
      const map: Record<string, string> = {
        COMPLETED: "paid",
        APPROVED: "paid",
        FAILED: "failed",
        CANCELED: "failed",
      };
      const next = map[paymentStatus.toUpperCase()] ?? null;
      if (order && next && next !== order.status) {
        const { error: upErr } = await supabase
          .from("orders")
          .update({ status: next })
          .eq("id", order.id);
        if (upErr) throw new Error(upErr.message);
        return NextResponse.json({
          ok: true,
          event: type,
          synced: order.id,
          to: next,
        });
      }
      return NextResponse.json({ ok: true, event: type, note: "no change" });
    } catch (syncErr) {
      console.log(
        "[square-webhook] sync failed:",
        String(syncErr).slice(0, 160),
      );
      return NextResponse.json(
        { ok: true, event: type, syncError: String(syncErr).slice(0, 120) },
        { status: 200 },
      );
    }
  }

  // everything else (payout.*, bank_account.*, customer.*,
  // online_checkout.*…) — acknowledged; the seller's money movements and
  // account settings, logged for the books
  return NextResponse.json({ ok: true, event: type });
}
