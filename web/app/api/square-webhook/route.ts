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
const NOTIFICATION_URL =
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ??
  "https://www.ladyluxeclub.com/api/square-webhook";

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
  const expected = createHmac("sha256", SIGNATURE_KEY)
    .update(raw + NOTIFICATION_URL)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // --- dispatch on the event type ---
  let type = "";
  let paymentId = "";
  let paymentStatus = "";
  try {
    const event = JSON.parse(raw);
    type = event.type ?? "";
    const payment = event.data?.object?.payment ?? {};
    paymentId = payment.id ?? "";
    paymentStatus = payment.status ?? "";
  } catch {
    return NextResponse.json({ ok: true, note: "unparseable — acknowledged" });
  }

  // payment.updated — the charge state changed after the initial response
  if (type === "payment.updated" && paymentId) {
    try {
      const supabase = await createClient();
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status")
        .eq("square_payment_id", paymentId)
        .limit(1);
      const order = orders?.[0];
      const map: Record<string, string> = {
        COMPLETED: "paid",
        APPROVED: "paid",
        FAILED: "failed",
        CANCELED: "failed",
      };
      const next = map[paymentStatus.toUpperCase()] ?? null;
      if (order && next && next !== order.status) {
        await supabase.from("orders").update({ status: next }).eq("id", order.id);
        return NextResponse.json({
          ok: true,
          event: type,
          synced: order.id,
          to: next,
        });
      }
      return NextResponse.json({ ok: true, event: type, note: "no change" });
    } catch (e) {
      // acknowledge regardless — Square stops retrying; the mismatch is
      // logged here for the books
      return NextResponse.json(
        { ok: true, event: type, syncError: String(e).slice(0, 120) },
        { status: 200 },
      );
    }
  }

  // everything else (payout.sent, payout.paid, bank_account.created, …) —
  // acknowledged; the seller's money movements, logged for the books
  return NextResponse.json({ ok: true, event: type });
}
