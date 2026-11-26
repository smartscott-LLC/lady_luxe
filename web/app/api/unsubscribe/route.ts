import { NextResponse } from "next/server";
import { serviceReady, serviceSelect, servicePatch } from "@/lib/service-db";

/**
 * Unsubscribe — one link serves both lists.
 *
 * GET  ?token=…&list=…  → a branded confirm page (never acts on GET —
 *                          email scanners prefetch links, and a silent
 *                          GET-unsubscribe would unlist people who never
 *                          clicked).
 * POST ?token=…&list=…  → the leave itself. Accepts the confirm page's
 *                          form POST and the RFC 8058 one-click POST the
 *                          List-Unsubscribe header invites (form body
 *                          `List-Unsubscribe=One-Click`).
 *
 * token matches subscribers.token (newsletter) or members.token (club
 * letters); whichever row carries it decides the treatment.
 */

const MIDNIGHT = "#30001A";
const AMARANTH = "#660428";
const GOLD = "#D4AF37";
const GOLD_SOFT = "#E8C558";
const CREAM = "#EDE7C7";
const CREAM_DIM = "rgba(237,231,199,.55)";
const HAIRLINE = "rgba(212,175,55,.35)";

function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Lady Luxe</title></head>
<body style="margin:0;background:#1b0910;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b0910;">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:linear-gradient(165deg,${MIDNIGHT} 0%,${AMARANTH} 100%);background-color:${MIDNIGHT};">
<tr><td style="padding:36px 40px 6px;" align="center">
<div style="font-family:Georgia,serif;font-size:26px;letter-spacing:6px;color:${GOLD};">LADY LUXE</div>
<div style="font-style:italic;font-size:12px;color:${CREAM_DIM};padding-top:4px;">Maison de Couture</div>
</td></tr>
<tr><td style="padding:16px 40px 0;"><div style="height:1px;background:${HAIRLINE};"></div></td></tr>
<tr><td style="padding:26px 40px 10px;color:${CREAM};font-size:15px;line-height:1.75;">${bodyHtml}</td></tr>
<tr><td style="padding:14px 40px 36px;color:${CREAM_DIM};font-size:11px;line-height:1.7;">
<div style="height:1px;background:${HAIRLINE};margin-bottom:14px;"></div>
Questions — write to <a href="mailto:info@ladyluxeclub.com" style="color:${GOLD_SOFT};text-decoration:none;">info@ladyluxeclub.com</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "your address";
  const shown = user.slice(0, 2);
  return `${shown}${"·".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

async function resolveToken(
  token: string,
): Promise<{ list: "newsletter" | "club"; email: string; unsubscribed_at?: string | null } | null> {
  const subs = await serviceSelect<{ email: string; unsubscribed_at: string | null }>(
    "subscribers",
    `select=email,unsubscribed_at&token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  if (subs?.[0]) {
    return { list: "newsletter", email: subs[0].email, unsubscribed_at: subs[0].unsubscribed_at };
  }
  const members = await serviceSelect<{ email: string }>(
    "members",
    `select=email&token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  if (members?.[0]) return { list: "club", email: members[0].email };
  return null;
}

export async function GET(request: Request) {
  if (!serviceReady()) {
    return new NextResponse(
      page("Quiet moment", "<div>The list is resting — try again shortly.</div>"),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") ?? "").trim();
  if (!token) {
    return new NextResponse(
      page("Unsubscribe", "<div>This link is missing its key.</div>"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const target = await resolveToken(token);
  if (!target) {
    return new NextResponse(
      page(
        "Link expired",
        `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">This link has already been used or has expired.</div>
         <div style="padding-top:10px;">Nothing further will arrive from that address.</div>`,
      ),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  if (target.unsubscribed_at) {
    return new NextResponse(
      page(
        "The Private List",
        `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">You are already off the list.</div>
         <div style="padding-top:10px;">The monthly letter will not arrive to <strong>${maskEmail(target.email)}</strong> — that leave was taken.</div>`,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const isClub = target.list === "club";
  const masked = maskEmail(target.email);
  const heading = isClub
    ? "Turning off the Club letters?"
    : "Leaving the Private List?";
  const detail = isClub
    ? `This silences the promotional letters to <strong>${masked}</strong>. Your membership stays exactly as it is — orders, tiers and history untouched.`
    : `This removes <strong>${masked}</strong> from the monthly letter. One click, no ceremony.`;
  const small = isClub
    ? ""
    : `<div style="padding-top:8px;color:${CREAM_DIM};font-size:12px;">Your address leaves the list entirely — we keep nothing.</div>`;

  return new NextResponse(
    page(
      isClub ? "Club letters" : "The Private List",
      `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">${heading}</div>
       <div style="padding-top:10px;">${detail}</div>${small}
       <form method="post" action="/api/unsubscribe?token=${encodeURIComponent(token)}&list=${target.list}" style="padding-top:22px;">
         <button type="submit" style="color:${MIDNIGHT};background:${GOLD};border:0;padding:12px 30px;font-family:Georgia,serif;font-size:13px;letter-spacing:3px;cursor:pointer;">CONFIRM</button>
       </form>`,
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  if (!serviceReady()) {
    return new NextResponse(
      page("Quiet moment", "<div>The list is resting — try again shortly.</div>"),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  // the token arrives via the query string (both our form and the
  // one-click POST hit the exact URL from the header); the body may add
  // context but the query is authoritative
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") ?? "").trim();
  const listHint = searchParams.get("list");

  let target: {
    list: "newsletter" | "club";
    email: string;
    unsubscribed_at?: string | null;
  } | null = null;
  if (token) {
    target = await resolveToken(token);
    if (target && listHint && listHint !== target.list) {
      // the hint disagrees with the row — trust the row
      target = { ...target, list: target.list };
    }
  }
  if (!target) {
    return new NextResponse(
      page(
        "Link expired",
        `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">This link has already been used or has expired.</div>
         <div style="padding-top:10px;">Nothing further will arrive from that address.</div>`,
      ),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  if (target.unsubscribed_at) {
    return new NextResponse(
      page(
        "The Private List",
        `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">You are already off the list.</div>
         <div style="padding-top:10px;">The monthly letter will not arrive to <strong>${maskEmail(target.email)}</strong> — that leave was taken.</div>`,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const now = new Date().toISOString();
  if (target.list === "newsletter") {
    await servicePatch("subscribers", `token=eq.${encodeURIComponent(token)}`, {
      unsubscribed_at: now,
    });
    return new NextResponse(
      page(
        "The Private List",
        `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">It is done.</div>
         <div style="padding-top:10px;">The Private List will not write again. The door stays open — the <a href="https://www.ladyluxeclub.com" style="color:${GOLD_SOFT};text-decoration:none;">maison</a> receives you whenever you wish to return.</div>`,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  await servicePatch("members", `token=eq.${encodeURIComponent(token)}`, {
    marketing_consent: false,
  });
  return new NextResponse(
    page(
      "Club letters",
      `<div style="font-size:22px;color:${GOLD_SOFT};letter-spacing:1px;">The letters are silenced.</div>
       <div style="padding-top:10px;">Your membership remains — orders, tiers and history untouched. The <a href="https://www.ladyluxeclub.com/club" style="color:${GOLD_SOFT};text-decoration:none;">Club page</a> holds the switch if you ever wish them back.</div>`,
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
