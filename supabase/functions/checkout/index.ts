// Lady Luxe — checkout Edge Function
//
// Cart → priced order → Square payment → order row.
// Square is the processor only; fulfilment is a manual forward to AlterEgo.
//
//   POST /checkout   body: { email, items: [{ sku, quantity }], paymentToken? }
//
// Server-side economics (never trust the client):
//   unit_price  = wholesale_cost * RETAIL_MARKUP            (round to cents)
//   duty        = sum(unit_price * quantity * duty_rate)    (duties prepaid)
//   shipping    = FLAT_SHIPPING_USD, free above FREE_SHIPPING_OVER_USD
//   total       = subtotal - discount + duty + shipping
//
// Modes:
//   dry_run: true          → prices + order row (status 'dry_run'), no charge
//   paymentToken provided  → charges Square (Payments API), order 'paid'
//   neither                → 400
//
// Secrets (project env vars set via dashboard or deploy):
//   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SUPABASE_SERVICE_ROLE implied.
//   The function uses the service-role key from the standard env bindings.

const RETAIL_MARKUP = 2.4;
const FLAT_SHIPPING_USD = 9.95;
const FREE_SHIPPING_OVER_USD = 150;
const CURRENCY = "USD";
const SQUARE_VERSION = "2024-10-17";

// Square environment switch — "sandbox" points the charge at
// connect.squareupsandbox.com with the sandbox token + location.
// Anything else (or unset) is production, so deployed behaviour is unchanged.
const SQUARE_ENV = (Deno.env.get("SQUARE_ENV") ?? "production").trim().toLowerCase();
const SQUARE_API_BASE =
  SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
const squareAccessToken = () =>
  Deno.env.get(
    SQUARE_ENV === "sandbox" ? "SQUARE_SANDBOX_ACCESS_TOKEN" : "SQUARE_ACCESS_TOKEN",
  ) ?? "";
const squareLocationId = () =>
  Deno.env.get(
    SQUARE_ENV === "sandbox" ? "SQUARE_SANDBOX_LOCATION_ID" : "SQUARE_LOCATION_ID",
  ) ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function cents(usd: number): number {
  return Math.round(usd * 100);
}

/* ------------------------------------------------------- the thank-you letter
   The copy mirrors web/lib/mail.ts — keep the two in step when the wording
   changes. Pure typographic luxury: the midnight/amaranth/gold/cream palette,
   serif stacks with Georgia fallbacks (email clients can't load webfonts). */

const MAIL_SITE = "https://www.ladyluxeclub.com";
const MAIL_FROM = "Lady Luxe Atelier <orders@ladyluxeclub.com>";
const MAIL_REPLY_TO = "info@ladyluxeclub.com";
const M_GOLD = "#D4AF37";
const M_GOLD_SOFT = "#E8C558";
const M_CREAM = "#EDE7C7";
const M_CREAM_DIM = "rgba(237,231,199,.55)";
const M_MIDNIGHT = "#30001A";
const M_AMARANTH = "#660428";
const M_HAIRLINE = "rgba(212,175,55,.35)";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const moneh = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function orderThankYouHtml(o: {
  orderId: string;
  lines: { name: string; variant?: string | null; quantity: number; unit_price: number }[];
  subtotal: number;
  shipping: number;
  duty: number;
  total: number;
  receiptUrl?: string | null;
}): string {
  const rows = o.lines
    .map(
      (l) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${M_HAIRLINE};font-size:14px;">
    ${esc(l.name)}${l.variant ? `<br><span style="color:${M_CREAM_DIM};font-size:12px;">Size ${esc(l.variant)}</span>` : ""}
  </td>
  <td align="center" style="padding:10px 0;border-bottom:1px solid ${M_HAIRLINE};font-size:14px;color:${M_CREAM_DIM};">×${l.quantity}</td>
  <td align="right" style="padding:10px 0;border-bottom:1px solid ${M_HAIRLINE};font-size:14px;color:${M_GOLD_SOFT};">${moneh(l.unit_price * l.quantity)}</td>
</tr>`,
    )
    .join("\n");

  const content = `
    Dear Madame,
    <div style="padding-top:14px;font-family:'Felipa',Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:1px;color:${M_GOLD_SOFT};">Thank you — your order is confirmed.</div>
    <div style="padding-top:10px;">Your pieces are being prepared and will leave our house within 24 hours, in plain, discreet packaging. Royal Mail, DPD or FedEx will carry them to your door, and a tracking note will follow the moment they are dispatched.</div>
    <div style="height:1px;background:${M_HAIRLINE};margin:22px 0;"></div>
    <div style="color:${M_CREAM_DIM};font-size:12px;letter-spacing:2px;">ORDER Nº ${o.orderId.slice(0, 8).toUpperCase()}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding-top:10px;">
      ${rows}
      <tr><td style="padding:10px 0;font-size:14px;color:${M_CREAM_DIM};">Subtotal</td><td></td><td align="right" style="padding:10px 0;font-size:14px;">${moneh(o.subtotal)}</td></tr>
      <tr><td style="padding:2px 0;font-size:14px;color:${M_CREAM_DIM};">Shipping${o.shipping === 0 ? " — complimentary" : ""}</td><td></td><td align="right" style="padding:2px 0;font-size:14px;">${o.shipping === 0 ? "—" : moneh(o.shipping)}</td></tr>
      ${o.duty > 0 ? `<tr><td style="padding:2px 0;font-size:14px;color:${M_CREAM_DIM};">Duties prepaid</td><td></td><td align="right" style="padding:2px 0;font-size:14px;">${moneh(o.duty)}</td></tr>` : ""}
      <tr><td style="padding:12px 0;font-size:15px;color:${M_GOLD};letter-spacing:1px;">TOTAL</td><td></td><td align="right" style="padding:12px 0;font-size:16px;color:${M_GOLD_SOFT};">${moneh(o.total)}</td></tr>
    </table>
    ${o.receiptUrl ? `<div style="padding-top:8px;font-size:13px;">Your payment receipt: <a href="${o.receiptUrl}" style="color:${M_GOLD_SOFT};">view receipt</a></div>` : ""}
    <div style="height:1px;background:${M_HAIRLINE};margin:22px 0;"></div>
    <div style="color:${M_CREAM_DIM};font-size:13px;">Every parcel leaves in an unmarked box — the maison's name appears on nothing but the piece inside. If anything is not as it should be, write to us and we will make it right.</div>
    <div style="padding-top:6px;color:${M_GOLD_SOFT};font-style:italic;">With love, the Lady Luxe Maison</div>
  `;

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1b0910;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b0910;">
<tr><td align="center" style="padding:36px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:linear-gradient(165deg,${M_MIDNIGHT} 0%,${M_AMARANTH} 100%);background-color:${M_MIDNIGHT};">
  <tr><td style="padding:40px 44px 8px;" align="center">
    <div style="font-family:'Felipa',Georgia,serif;font-size:30px;letter-spacing:6px;color:${M_GOLD};">LADY LUXE</div>
    <div style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:${M_CREAM_DIM};padding-top:4px;">Maison de Couture</div>
  </td></tr>
  <tr><td style="padding:18px 44px 0;"><div style="height:1px;background:${M_HAIRLINE};"></div></td></tr>
  <tr><td style="padding:30px 44px 8px;font-family:Georgia,serif;color:${M_CREAM};font-size:15px;line-height:1.75;">
    ${content}
  </td></tr>
  <tr><td style="padding:10px 44px 0;"><div style="height:1px;background:${M_HAIRLINE};"></div></td></tr>
  <tr><td style="padding:20px 44px 40px;font-family:Georgia,serif;font-size:11px;line-height:1.7;color:${M_CREAM_DIM};">
    Lady Luxe · Maison de Couture · 700 E 8th St., Unit 14E, Kansas City, MO 64106 · Dispatched from the United Kingdom<br>
    Questions, requests, anything at all — write to <a href="mailto:${MAIL_REPLY_TO}" style="color:${M_GOLD_SOFT};text-decoration:none;">${MAIL_REPLY_TO}</a> · <a href="${MAIL_SITE}" style="color:${M_GOLD_SOFT};text-decoration:none;">${MAIL_SITE.replace("https://", "")}</a>
  </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendOrderThankYou(o: {
  email: string;
  orderId: string;
  lines: { name: string; variant?: string | null; quantity: number; unit_price: number }[];
  subtotal: number;
  shipping: number;
  duty: number;
  total: number;
  receiptUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [o.email],
      subject: `Your Lady Luxe order Nº ${o.orderId.slice(0, 8).toUpperCase()} — confirmed`,
      html: orderThankYouHtml(o),
      reply_to: MAIL_REPLY_TO,
    }),
  });
  const body = (await resp.json().catch(() => ({}))) as { message?: string };
  if (!resp.ok) {
    return { ok: false, error: body.message ?? `resend ${resp.status}` };
  }
  return { ok: true };
}

interface CartItem {
  sku: string;
  variant?: string;
  quantity: number;
}

interface PricedLine {
  product_id: string | null;
  bundle_id?: string | null;
  sku: string;
  variant?: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  duty_rate: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const email: string | undefined = body?.email;
    const items: CartItem[] = Array.isArray(body?.items) ? body.items : [];
    const paymentToken: string | undefined = body?.paymentToken;
    const dryRun: boolean = body?.dry_run === true;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "valid email required" }, 400);
    }
    if (items.length === 0) return json({ error: "cart is empty" }, 400);
    if (!dryRun && !paymentToken) {
      return json({ error: "paymentToken required (or dry_run: true)" }, 400);
    }

    // 1. Price the cart from the database — never from client input.
    const env = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const key = (
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      ""
    ).trim();
    const skus = items.map((i) => i.sku);
    const rest = await fetch(
      `${env}/rest/v1/products?sku=in.(${skus.map((s) => `"${s}"`).join(",")})&select=id,sku,name,wholesale_cost,duty_rate,status`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!rest.ok) {
      return json({ error: "price lookup failed", detail: await rest.text() }, 502);
    }
    const rows: any[] = await rest.json();
    const bySku = new Map(rows.map((r) => [r.sku, r]));

    // ensemble SKUs price from the bundles table — the set ships as one
    // order line, and bundle_items carries the pieces for the upload sheet
    const bundleSkus = skus.filter((s) => !bySku.has(s));
    const bundlesBySku = new Map<string, any>();
    if (bundleSkus.length) {
      const brest = await fetch(
        `${env}/rest/v1/bundles?sku=in.(${bundleSkus.map((s) => `"${s}"`).join(",")})&select=id,sku,name,price,live`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (brest.ok) {
        for (const b of (await brest.json()) as any[]) {
          if (b.live) bundlesBySku.set(b.sku, b);
        }
      }
    }

    const priced: PricedLine[] = [];
    for (const item of items) {
      const row = bySku.get(item.sku);
      const bundle = bundlesBySku.get(item.sku);
      const qty = Math.floor(Number(item.quantity));
      if (!row && !bundle) {
        return json(
          { error: `invalid cart item: ${item.sku} (unknown or out of range)` },
          400,
        );
      }
      if (!qty || qty < 1 || qty > 10) {
        return json(
          { error: `invalid cart item: ${item.sku} (quantity out of range)` },
          400,
        );
      }
      if (row && row.status === "live") {
        const unit = Math.round(Number(row.wholesale_cost) * RETAIL_MARKUP * 100) / 100;
        priced.push({
          product_id: row.id,
          sku: row.sku,
          variant: item.variant ?? null,
          name: row.name,
          unit_price: unit,
          quantity: qty,
          duty_rate: Number(row.duty_rate) || 0,
        });
      } else if (bundle) {
        priced.push({
          product_id: null,
          bundle_id: bundle.id,
          sku: bundle.sku,
          variant: null,
          name: bundle.name,
          unit_price: Number(bundle.price),
          quantity: qty,
          duty_rate: 0,
        });
      } else {
        return json(
          { error: `invalid cart item: ${item.sku} (unknown or out of range)` },
          400,
        );
      }
    }

    // 2. Totals — duties are prepaid by Lady Luxe, shown as their own line.
    const subtotal = priced.reduce(
      (sum, l) => sum + Math.round(l.unit_price * l.quantity * 100) / 100,
      0,
    );
    const duty = Math.round(
      priced.reduce((sum, l) => sum + l.unit_price * l.quantity * l.duty_rate, 0) *
        100,
    ) / 100;
    const shipping =
      subtotal >= FREE_SHIPPING_OVER_USD ? 0 : FLAT_SHIPPING_USD;
    const discount = 0;
    const total =
      Math.round((subtotal - discount + duty + shipping) * 100) / 100;

    // 3. Order row first (idempotency key for Square = this order id).
    const orderResp = await fetch(`${env}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email,
        kind: "retail",
        subtotal,
        discount,
        shipping,
        duty,
        total,
        currency: CURRENCY,
        status: "pending",
        meta: { priced, mode: dryRun ? "dry_run" : "square" },
      }),
    });
    if (!orderResp.ok) {
      return json({ error: "order insert failed", detail: await orderResp.text() }, 502);
    }
    const order = (await orderResp.json())[0];

    const itemRows = priced.map((l) => ({
      order_id: order.id,
      product_id: l.product_id,
      bundle_id: l.bundle_id ?? null,
      name: l.name,
      unit_price: l.unit_price,
      quantity: l.quantity,
    }));
    await fetch(`${env}/rest/v1/order_items`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(itemRows),
    });

    if (dryRun) {
      return json({
        mode: "dry_run",
        order_id: order.id,
        subtotal,
        discount,
        shipping,
        duty,
        total,
        currency: CURRENCY,
        lines: priced.map((l) => ({
          sku: l.sku,
          name: l.name,
          unit_price: l.unit_price,
          quantity: l.quantity,
        })),
      });
    }

    // 4. Charge Square (env-selected). Payments API, idempotent by order id.
    const payResp = await fetch(`${SQUARE_API_BASE}/v2/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${squareAccessToken()}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_id: paymentToken,
        idempotency_key: order.id,
        amount_money: { amount: cents(total), currency: CURRENCY },
        location_id: squareLocationId(),
        autocomplete: true,
        note: `Lady Luxe order ${order.id}`,
        statement_description_identifier: "ladyluxeclub.com",
      }),
    });
    const pay = await payResp.json();
    if (!payResp.ok || pay?.errors?.length) {
      // Release the pending order row — nothing charged.
      await fetch(`${env}/rest/v1/orders?id=eq.${order.id}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      await fetch(`${env}/rest/v1/order_items?order_id=eq.${order.id}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      return json(
        { error: "square payment rejected", detail: pay?.errors ?? pay },
        402,
      );
    }

    // 5. Confirm the order.
    await fetch(`${env}/rest/v1/orders?id=eq.${order.id}`, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "paid",
        square_payment_id: pay?.payment?.id ?? null,
        square_order_id: pay?.payment?.order_id ?? null,
        meta: { priced, mode: "square", receipt: pay?.payment?.receipt_url },
      }),
    });

    // 6. The thank-you letter — best effort: a mail outage must never
    //    stand between the member and their confirmation.
    const mail = await sendOrderThankYou({
      email,
      orderId: order.id,
      lines: priced,
      subtotal,
      shipping,
      duty,
      total,
      receiptUrl: pay?.payment?.receipt_url ?? null,
    });
    if (!mail.ok) console.log("order email:", mail.error);

    return json({
      mode: "paid",
      order_id: order.id,
      square_payment_id: pay?.payment?.id,
      receipt_url: pay?.payment?.receipt_url,
      subtotal,
      shipping,
      duty,
      total,
      currency: CURRENCY,
    });
  } catch (err) {
    return json({ error: "checkout failed", detail: String(err) }, 500);
  }
});
