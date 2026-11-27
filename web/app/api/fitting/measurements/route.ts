import { NextResponse } from "next/server";
import { serviceReady, serviceSelect, servicePatch } from "@/lib/service-db";
import { tokenEmail } from "@/lib/auth-user";

/**
 * The Concierge's measurement book — the member's own numbers for the
 * fitting room, saved to their member record and read back by it.
 *
 * GET  (Authorization: the member's access token) → their measurements
 * POST { bust, waist, hip, height?, braSize? }      → saved, theirs only
 *
 * The token must name the member; nobody writes to anyone else's book.
 * These are presentation inputs for the private mannequin — they are
 * never presented as a fit prediction.
 */

export async function GET(request: Request) {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }
  const email = await tokenEmail(request);
  if (!email) {
    return NextResponse.json({ error: "not signed in" }, { status: 403 });
  }
  const rows = await serviceSelect<{ measurements: Record<string, unknown> }>(
    "members",
    `select=measurements&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  return NextResponse.json({
    measurements: rows?.[0]?.measurements ?? {},
  });
}

export async function POST(request: Request) {
  if (!serviceReady()) {
    return NextResponse.json({ error: "service not configured" }, { status: 500 });
  }
  const email = await tokenEmail(request);
  if (!email) {
    return NextResponse.json({ error: "not signed in" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // only the honest fields, only sane ranges — inches, US-first
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : undefined;
  };
  const measurements: Record<string, number | string> = {};
  const bust = num(body.bust, 26, 60);
  const waist = num(body.waist, 18, 55);
  const hip = num(body.hip, 28, 70);
  const height = num(body.height, 48, 84);
  if (bust !== undefined) measurements.bust = bust;
  if (waist !== undefined) measurements.waist = waist;
  if (hip !== undefined) measurements.hip = hip;
  if (height !== undefined) measurements.height = height;
  if (typeof body.braSize === "string" && body.braSize.trim().length <= 10) {
    measurements.braSize = body.braSize.trim();
  }
  if (Object.keys(measurements).length === 0) {
    return NextResponse.json({ error: "no valid measurements" }, { status: 400 });
  }

  const ok = await servicePatch(
    "members",
    `email=eq.${encodeURIComponent(email)}`,
    { measurements },
  );
  if (!ok) {
    return NextResponse.json({ error: "save failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, measurements });
}
