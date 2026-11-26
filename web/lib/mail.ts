/**
 * Lady Luxe mail — Resend.
 *
 * The brand shell is pure typographic luxury (no images): the midnight /
 * amaranth / gold / cream palette from luxe-all.css, serif stacks with
 * Georgia fallbacks — email clients can't load the house webfonts.
 *
 * Three letters live here:
 *   orderEmail        — the thank-you, sent by the checkout Edge Function
 *                       (same copy pasted there; this file is the web-side
 *                       mirror for previews)
 *   clubWelcomeEmail  — the welcome letter on Club signup
 *   newsletterConfirm — The Private List confirmation + unsubscribe
 *
 * Everything sendable carries a List-Unsubscribe header; the marketing
 * letters carry a visible unsubscribe link too.
 */

const SITE = "https://www.ladyluxeclub.com";
const FROM_ORDER = "Lady Luxe Atelier <orders@ladyluxeclub.com>";
const FROM_LETTERS = "Lady Luxe <letters@ladyluxeclub.com>";
const REPLY_TO = "info@ladyluxeclub.com";

// the palette, mirrored from luxe-all.css
const MIDNIGHT = "#30001A";
const AMARANTH = "#660428";
const GOLD = "#D4AF37";
const GOLD_SOFT = "#E8C558";
const CREAM = "#EDE7C7";
const CREAM_DIM = "rgba(237,231,199,.55)";
const HAIRLINE = "rgba(212,175,55,.35)";

const SERIF = "'Felipa', Georgia, 'Times New Roman', serif";
const BODY_FONT = "Georgia, 'Times New Roman', serif";

export function unsubscribeUrl(token: string, list: "newsletter" | "club"): string {
  return `${SITE}/api/unsubscribe?token=${token}&list=${list}`;
}

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  from: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        reply_to: REPLY_TO,
        headers: opts.headers,
      }),
    });
    const body = (await resp.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!resp.ok) {
      return { ok: false, error: body.message ?? `resend ${resp.status}` };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

/* ------------------------------------------------------------------ shell */

function shell(
  preheader: string,
  contentHtml: string,
  footerHtml: string,
): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1b0910;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b0910;">
<tr><td align="center" style="padding:36px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:linear-gradient(165deg,${MIDNIGHT} 0%,${AMARANTH} 100%);background-color:${MIDNIGHT};">
  <tr><td style="padding:40px 44px 8px;" align="center">
    <div style="font-family:${SERIF};font-size:30px;letter-spacing:6px;color:${GOLD};">LADY LUXE</div>
    <div style="font-family:${BODY_FONT};font-style:italic;font-size:13px;color:${CREAM_DIM};padding-top:4px;">Maison de Couture</div>
  </td></tr>
  <tr><td style="padding:18px 44px 0;">
    <div style="height:1px;background:${HAIRLINE};"></div>
  </td></tr>
  <tr><td style="padding:30px 44px 8px;font-family:${BODY_FONT};color:${CREAM};font-size:15px;line-height:1.75;">
    ${contentHtml}
  </td></tr>
  <tr><td style="padding:10px 44px 0;">
    <div style="height:1px;background:${HAIRLINE};"></div>
  </td></tr>
  <tr><td style="padding:20px 44px 40px;font-family:${BODY_FONT};font-size:11px;line-height:1.7;color:${CREAM_DIM};">
    ${footerHtml}
  </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const goldRule = `<div style="height:1px;background:${HAIRLINE};margin:22px 0;"></div>`;

function signOff(): string {
  return `<div style="padding-top:6px;color:${GOLD_SOFT};font-style:italic;">With love, the Lady Luxe Maison</div>`;
}

function greet(name?: string | null): string {
  return name ? `Dear ${escapeHtml(name)},` : `Dear Madame,`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const footerBrand = `Lady Luxe · Maison de Couture · 700 E 8th St., Unit 14E, Kansas City, MO 64106 · Dispatched from the United Kingdom<br>
Questions, requests, anything at all — write to <a href="mailto:${REPLY_TO}" style="color:${GOLD_SOFT};text-decoration:none;">${REPLY_TO}</a>`;

function unsubFooter(reason: string, url: string): string {
  return `${footerBrand}<br><br>${reason}<br>
<a href="${url}" style="color:${GOLD_SOFT};text-decoration:underline;">Unsubscribe</a>`;
}

/* ------------------------------------------------------------- templates */

export interface OrderEmailItem {
  name: string;
  variant?: string | null;
  quantity: number;
  unit_price: number;
}

export interface OrderEmailData {
  orderId: string;
  email: string;
  name?: string | null;
  items: OrderEmailItem[];
  subtotal: number;
  shipping: number;
  duty: number;
  total: number;
  receiptUrl?: string | null;
}

export function orderHtml(o: OrderEmailData): string {
  const rows = o.items
    .map(
      (it) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;">
    ${escapeHtml(it.name)}${
      it.variant ? `<br><span style="color:${CREAM_DIM};font-size:12px;">Size ${escapeHtml(it.variant)}</span>` : ""
    }
  </td>
  <td align="center" style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${CREAM_DIM};">×${it.quantity}</td>
  <td align="right" style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${GOLD_SOFT};">${money(it.unit_price * it.quantity)}</td>
</tr>`,
    )
    .join("\n");

  const content = `
    ${greet(o.name)}
    <div style="padding-top:14px;font-family:${SERIF};font-size:24px;letter-spacing:1px;color:${GOLD_SOFT};">Thank you — your order is confirmed.</div>
    <div style="padding-top:10px;">Your pieces are being prepared and will leave our house within 24 hours, in plain, discreet packaging. Royal Mail, DPD or FedEx will carry them to your door, and a tracking note will follow the moment they are dispatched.</div>
    ${goldRule}
    <div style="color:${CREAM_DIM};font-size:12px;letter-spacing:2px;">ORDER Nº ${o.orderId.slice(0, 8).toUpperCase()}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding-top:10px;">
      ${rows}
      <tr><td style="padding:10px 0;font-size:14px;color:${CREAM_DIM};">Subtotal</td><td></td><td align="right" style="padding:10px 0;font-size:14px;">${money(o.subtotal)}</td></tr>
      <tr><td style="padding:2px 0;font-size:14px;color:${CREAM_DIM};">Shipping${o.shipping === 0 ? " — complimentary" : ""}</td><td></td><td align="right" style="padding:2px 0;font-size:14px;">${o.shipping === 0 ? "—" : money(o.shipping)}</td></tr>
      ${o.duty > 0 ? `<tr><td style="padding:2px 0;font-size:14px;color:${CREAM_DIM};">Duties prepaid</td><td></td><td align="right" style="padding:2px 0;font-size:14px;">${money(o.duty)}</td></tr>` : ""}
      <tr><td style="padding:12px 0;font-size:15px;color:${GOLD};letter-spacing:1px;">TOTAL</td><td></td><td align="right" style="padding:12px 0;font-size:16px;color:${GOLD_SOFT};">${money(o.total)}</td></tr>
    </table>
    ${o.receiptUrl ? `<div style="padding-top:8px;font-size:13px;">Your payment receipt: <a href="${o.receiptUrl}" style="color:${GOLD_SOFT};">view receipt</a></div>` : ""}
    ${goldRule}
    <div style="color:${CREAM_DIM};font-size:13px;">Every parcel leaves in an unmarked box — the maison's name appears on nothing but the piece inside. If anything is not as it should be, write to us and we will make it right.</div>
    ${signOff()}
  `;
  return shell(
    "Your order is confirmed — dispatched within 24 hours, in plain discreet packaging.",
    content,
    footerBrand,
  );
}

export function clubWelcomeHtml(name?: string | null, unsubUrl?: string): string {
  const content = `
    ${greet(name)}
    <div style="padding-top:14px;font-family:${SERIF};font-size:26px;letter-spacing:1px;color:${GOLD_SOFT};">Welcome to the Club.</div>
    <div style="padding-top:10px;">Your membership places you closest to the maison — the first word of new arrivals, private letters between the collections, and pieces held aside before they reach the open floor.</div>
    <div style="padding-top:10px;">The Club costs nothing and asks little: no card is kept on file, and everything about your membership — your letters, your consent, your orders — lives in one quiet place.</div>
    <div style="padding-top:22px;">
      <a href="${SITE}/club" style="color:${MIDNIGHT};background:${GOLD};padding:12px 28px;text-decoration:none;font-family:${BODY_FONT};font-size:13px;letter-spacing:3px;">ENTER THE CLUB</a>
    </div>
    ${signOff()}
  `;
  return shell(
    "Welcome to the Lady Luxe Club — first word of new arrivals, private letters, nothing owed.",
    content,
    unsubUrl
      ? unsubFooter(
          "You receive this because a Club account was opened with this address.",
          unsubUrl,
        )
      : footerBrand,
  );
}

export function newsletterConfirmHtml(unsubUrl: string): string {
  const content = `
    Dear Madame,
    <div style="padding-top:14px;font-family:${SERIF};font-size:26px;letter-spacing:1px;color:${GOLD_SOFT};">You are on the Private List.</div>
    <div style="padding-top:10px;">One letter a month — the pieces arriving, the stories behind them, and the occasions worth dressing for. Nothing more arrives from us than that.</div>
    <div style="padding-top:10px;color:${CREAM_DIM};">We keep your address to ourselves. Always.</div>
    ${signOff()}
  `;
  return shell(
    "Welcome to the Private List — one letter a month, nothing more.",
    content,
    unsubFooter("You receive this because this address joined the Private List.", unsubUrl),
  );
}

/* ------------------------------------------------------- sendable wrappers */

export async function sendOrderEmail(o: OrderEmailData) {
  return sendMail({
    to: o.email,
    from: FROM_ORDER,
    subject: `Your Lady Luxe order Nº ${o.orderId.slice(0, 8).toUpperCase()} — confirmed`,
    html: orderHtml(o),
  });
}

export async function sendClubWelcome(
  email: string,
  name?: string | null,
  memberToken?: string | null,
) {
  const unsubUrl = memberToken ? unsubscribeUrl(memberToken, "club") : undefined;
  return sendMail({
    to: email,
    from: FROM_LETTERS,
    subject: "Welcome to the Lady Luxe Club",
    html: clubWelcomeHtml(name, unsubUrl),
    headers: unsubUrl
      ? {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
}

export async function sendNewsletterConfirm(email: string, token: string) {
  const url = unsubscribeUrl(token, "newsletter");
  return sendMail({
    to: email,
    from: FROM_LETTERS,
    subject: "The Private List — your place is kept",
    html: newsletterConfirmHtml(url),
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
