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

interface CartItem {
  sku: string;
  quantity: number;
}

interface PricedLine {
  product_id: string;
  sku: string;
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

    const priced: PricedLine[] = [];
    for (const item of items) {
      const row = bySku.get(item.sku);
      const qty = Math.floor(Number(item.quantity));
      if (!row || row.status !== "live" || !qty || qty < 1 || qty > 10) {
        return json(
          { error: `invalid cart item: ${item.sku} (unknown or out of range)` },
          400,
        );
      }
      const unit = Math.round(Number(row.wholesale_cost) * RETAIL_MARKUP * 100) / 100;
      priced.push({
        product_id: row.id,
        sku: row.sku,
        name: row.name,
        unit_price: unit,
        quantity: qty,
        duty_rate: Number(row.duty_rate) || 0,
      });
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
