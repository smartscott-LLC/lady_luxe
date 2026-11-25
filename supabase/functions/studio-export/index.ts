// Lady Luxe — studio-export Edge Function
//
// The owner's upload-sheet engine: gathers every PAID order not yet on an
// upload sheet, derives the AlterEgo order lines (size-encoded supplier
// SKUs for products; the component pieces derived from bundle_items for
// ensembles), emits the cart-upload CSV in AlterEgo's template format,
// records the sheet, and returns the CSV for download.
//
//   POST /studio-export   (Authorization: the owner's session JWT)
//
// Access is locked to the studio allowlist. Written with string
// concatenation only (no template literals) so the source survives
// inline deployment.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMINS = (
  Deno.env.get("STUDIO_ADMINS") ?? "ss.helixsphereai@gmail.com"
)
  .split(",")
  .map(function (s) { return s.trim().toLowerCase(); });

function csvResponse(text) {
  return new Response(text, {
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=alterego-upload.csv",
    },
  });
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async function (req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const env = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const key = (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    ""
  ).trim();

  // --- the owner lock: the session's email must be on the allowlist ---
  const authHeader = req.headers.get("Authorization") ?? "";
  let email = "";
  try {
    const userResp = await fetch(env + "/auth/v1/user", {
      headers: { Authorization: authHeader, apikey: key },
    });
    if (userResp.ok) {
      const user = await userResp.json();
      email = (user.email ?? "").toLowerCase();
    }
  } catch (_e) {
    // fall through to the denial
  }
  if (!email || !ADMINS.includes(email)) {
    return jsonResponse({ error: "studio access denied" }, 403);
  }

  try {
    // --- the paid orders not yet on a sheet ---
    const ordersResp = await fetch(
      env + "/rest/v1/orders?status=eq.paid&select=id,email,total,created_at,meta&order=created_at.asc",
      { headers: { apikey: key, Authorization: "Bearer " + key } },
    );
    const allOrders = await ordersResp.json();

    const sheetsResp = await fetch(
      env + "/rest/v1/upload_sheets?select=order_ids&order=created_at.desc&limit=200",
      { headers: { apikey: key, Authorization: "Bearer " + key } },
    );
    const sheets = await sheetsResp.json();
    const already = new Set();
    for (const s of sheets) {
      for (const id of s.order_ids ?? []) already.add(id);
    }

    const pending = allOrders.filter(function (o) { return !already.has(o.id); });
    if (pending.length === 0) {
      return csvResponse("Item SKU,Item quantity\n");
    }

    // --- derive the AlterEgo lines ---
    const productSkus = [];
    const bundleIds = [];
    for (const o of pending) {
      for (const line of o.meta?.priced ?? []) {
        if (line.bundle_id) bundleIds.push(line.bundle_id);
        else productSkus.push(line.sku);
      }
    }

    // the products' variant order-SKUs: the supplier's own per-size SKUs
    // when the feed has them, else parent-base + size
    const skuList = productSkus.map(function (s) { return '"' + s + '"'; }).join(",");
    const prodResp = await fetch(
      env + "/rest/v1/products?sku=in.(" + skuList + ")&select=sku,supplier_sku,sizes",
      { headers: { apikey: key, Authorization: "Bearer " + key } },
    );
    const prodRows = await prodResp.json();
    const orderSkuByLine = new Map(); // "<parent>::<size>" or the parent -> the order SKU
    for (const p of prodRows) {
      const supplier = (p.supplier_sku ?? "").toUpperCase();
      const base = supplier.replace(/-G$/, "");
      const sizes = p.sizes ?? [];
      if (sizes.length === 0) {
        orderSkuByLine.set("__only__" + p.sku, supplier);
        continue;
      }
      for (const v of sizes) {
        const orderSku = v.sku && v.sku.toUpperCase().startsWith(base)
          ? v.sku
          : base + v.size;
        orderSkuByLine.set(p.sku + "::" + v.size, orderSku);
      }
    }

    // the bundles' pieces: the supplier order-SKUs derived from bundle_items
    const biResp = await fetch(
      env + "/rest/v1/bundle_items?select=bundle_id,product_id&bundle_id=in.(" +
        bundleIds.map(function (s) { return '"' + s + '"'; }).join(",") + ")",
      { headers: { apikey: key, Authorization: "Bearer " + key } },
    );
    const biRows = await biResp.json();
    const pieceProductIds = [];
    for (const bi of biRows) {
      if (bi.product_id) pieceProductIds.push(bi.product_id);
    }
    const pieceOrderSkus = new Map(); // bundle id -> [order SKU per piece]
    if (pieceProductIds.length) {
      const pr = await fetch(
        env + "/rest/v1/products?id=in.(" +
          pieceProductIds.map(function (s) { return '"' + s + '"'; }).join(",") +
          ")&select=id,sku,supplier_sku,sizes",
        { headers: { apikey: key, Authorization: "Bearer " + key } },
      );
      const prows = await pr.json();
      const byId = new Map(prows.map(function (p) { return [p.id, p]; }));
      for (const bi of biRows) {
        const p = byId.get(bi.product_id);
        if (!p) continue;
        const supplier = (p.supplier_sku ?? "").toUpperCase();
        const base = supplier.replace(/-G$/, "");
        const sizes = p.sizes ?? [];
        const orderSkus = [];
        if (sizes.length === 0) {
          orderSkus.push(supplier);
        } else {
          for (const v of sizes) {
            orderSkus.push(
              v.sku && v.sku.toUpperCase().startsWith(base) ? v.sku : base + v.size
            );
          }
        }
        pieceOrderSkus.set(bi.bundle_id, orderSkus);
      }
    }

    // --- build the CSV ---
    const rows = ["Item SKU,Item quantity"];
    let itemCount = 0;
    for (const o of pending) {
      for (const line of o.meta?.priced ?? []) {
        const qty = line.quantity ?? 1;
        if (line.bundle_id) {
          const orderSkus = pieceOrderSkus.get(line.bundle_id) ?? [];
          for (const psku of orderSkus) {
            rows.push(psku + "," + qty);
            itemCount += qty;
          }
        } else {
          const orderSku =
            orderSkuByLine.get(line.sku + "::" + line.variant) ??
            orderSkuByLine.get("__only__" + line.sku) ??
            line.variant ??
            line.sku;
          rows.push(orderSku + "," + qty);
          itemCount += qty;
        }
      }
    }
    const csvText = rows.join("\n") + "\n";

    // --- the branded invoice slip per order (printed for the parcel) ---
    const invoices = [];
    for (const o of pending) {
      let displayName = o.email;
      try {
        const mresp = await fetch(
          env + "/rest/v1/members?email=eq." + encodeURIComponent(o.email) + "&select=display_name&limit=1",
          { headers: { apikey: key, Authorization: "Bearer " + key } },
        );
        const mrows = await mresp.json();
        if (mrows.length && mrows[0].display_name) displayName = mrows[0].display_name;
      } catch (_e) {
        // keep the email as the fallback name
      }
      const itemRowsHtml = [];
      let subtotal = 0;
      for (const line of o.meta?.priced ?? []) {
        const qty = line.quantity ?? 1;
        subtotal += (line.unit_price ?? 0) * qty;
        let sizeLabel = "";
        if (line.variant) {
          const base = (line.sku ?? "").toUpperCase().replace(/-G$/, "");
          const vs = (line.variant ?? "").toUpperCase();
          sizeLabel = vs.startsWith(base) ? vs.slice(base.length).replace(/^-/, "") : line.variant;
        }
        itemRowsHtml.push(
          '<tr><td>' + line.name + '</td><td style="text-align:center">' +
          (sizeLabel || "&mdash;") + '</td><td style="text-align:center">' + qty +
          '</td><td style="text-align:right">$' + (line.unit_price ?? 0).toFixed(2) + "</td></tr>"
        );
      }
      const total = o.total ?? subtotal;
      const orderShort = (o.id ?? "").slice(0, 8);
      const orderDate = (o.created_at ?? "").slice(0, 10);
      const html =
        '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<title>Lady Luxe — Invoice ' + orderShort + '</title><style>' +
        'body { font-family: Georgia, "Times New Roman", serif; color: #2a2226; margin: 48px; }' +
        '.head { text-align: center; border-bottom: 2px solid #d4af37; padding-bottom: 20px; margin-bottom: 24px; }' +
        '.brand { font-family: "Snell Roundhand", "Brush Script MT", cursive; font-size: 38px; color: #8a1c3c; margin: 0; }' +
        '.tag { letter-spacing: 3px; text-transform: uppercase; font-size: 10px; color: #b8955a; margin-top: 6px; }' +
        '.meta { margin: 18px 0; font-size: 14px; line-height: 1.6; }' +
        'table { width: 100%; border-collapse: collapse; margin: 18px 0; }' +
        'th { text-align: left; border-bottom: 1.5px solid #d4af37; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #6b5d4f; padding: 8px 6px; }' +
        'td { padding: 10px 6px; border-bottom: 1px solid #eee5d8; font-size: 14px; }' +
        '.totals td { border-bottom: none; padding: 4px 6px; }' +
        '.grand td { border-top: 1.5px solid #d4af37; font-weight: bold; font-size: 16px; color: #8a1c3c; }' +
        '.thanks { margin-top: 30px; font-style: italic; text-align: center; color: #8a1c3c; line-height: 1.7; }' +
        '.foot { margin-top: 24px; font-size: 10px; letter-spacing: 1px; color: #a09a8e; text-align: center; text-transform: uppercase; }' +
        '</style></head><body>' +
        '<div class="head"><p class="brand">Lady Luxe</p><p class="tag">Elegance not extravagance</p></div>' +
        '<p class="meta">Order <strong>' + orderShort + '</strong> &nbsp;&middot;&nbsp; ' + orderDate +
        '<br/>Prepared for <strong>' + displayName + '</strong> &nbsp;&middot;&nbsp; ' + o.email + '</p>' +
        '<table><thead><tr><th>Item</th><th style="text-align:center">Size</th>' +
        '<th style="text-align:center">Qty</th><th style="text-align:right">Price</th></tr></thead><tbody>' +
        itemRowsHtml.join("") +
        '</tbody></table>' +
        '<table class="totals"><tbody>' +
        '<tr><td></td><td></td><td></td><td style="text-align:right">Subtotal $' + subtotal.toFixed(2) + '</td></tr>' +
        '<tr><td></td><td></td><td></td><td style="text-align:right">Duties &amp; import charges — prepaid by Lady Luxe</td></tr>' +
        '<tr class="grand"><td></td><td></td><td></td><td style="text-align:right">Total charged $' + Number(total).toFixed(2) + '</td></tr>' +
        '</tbody></table>' +
        '<p class="thanks">Thank you for choosing Lady Luxe.<br/>' +
        'Every piece was inspected, wrapped with care and sent with our compliments.<br/>' +
        'Should anything be less than perfect, write to info@ladyluxeclub.com — a person will answer.</p>' +
        '<p class="foot">Lady Luxe · ladyluxeclub.com · included with our compliments</p>' +
        '</body></html>';
      invoices.push({ order_id: o.id, email: o.email, html: html });
    }

    // --- record the sheet ---
    const sheetResp = await fetch(env + "/rest/v1/upload_sheets", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        order_ids: pending.map(function (o) { return o.id; }),
        emails: pending.map(function (o) { return o.email; }),
        order_count: pending.length,
        item_count: itemCount,
        status: "generated",
        csv_content: csvText,
        invoices: invoices,
        created_by: email,
      }),
    });
    if (!sheetResp.ok) {
      return jsonResponse(
        { error: "sheet record failed", detail: await sheetResp.text() },
        502
      );
    }

    return csvResponse(csvText);
  } catch (err) {
    return jsonResponse({ error: "studio export failed", detail: String(err) }, 500);
  }
});
