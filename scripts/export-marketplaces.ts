/**
 * The marketplace cross-listing export — Poshmark (Boutique) and eBay
 * (New With Tags).
 *
 * Query: the top 15 highest-margin pieces among the House Ensembles and
 * the Shirley of Hollywood robes/corsets. Margin = retail minus true
 * cost (an ensemble costs the sum of its pieces' wholesale).
 *
 * Copy rules: keyword-first titles ≤ 80 chars; descriptions of 350–500
 * characters carrying fabric, included pieces, condition NWT and care —
 * and never an off-platform URL (marketplace rules). The policy-safe
 * sanitizer strips adult-flagged words before anything leaves the house.
 *
 * Run:  npx tsx scripts/export-marketplaces.ts   (env: SUPABASE_URL,
 * SUPABASE_SECRET_KEY — `set -a && source .env && set +a` first)
 */

import { writeFileSync, mkdirSync } from "fs";

const BASE = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const SITE = "https://www.ladyluxeclub.com";

const HDRS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest<T>(path: string): Promise<T[]> {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: HDRS });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T[];
}

interface Media {
  type?: string;
  url?: string;
}
interface Piece {
  id: string;
  sku: string;
  name: string;
  supplier_sku: string;
  wholesale_cost: number;
  retail_price: number;
  media: Media[] | null;
  story: string | null;
}

function sanitize(s: string): string {
  return s
    .replace(/\b(erotic|fetish|bdsm|bondage|kinky|slutty|sexy|naughty|seduction|seductive|seduces)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

function titleCase90(s: string): string {
  return s.length <= 80 ? s : s.slice(0, 77).replace(/[\s,—-]+$/, "") + "…";
}

function categoryPath(name: string): string {
  const n = name.toLowerCase();
  if (/corset|basque|bustier/.test(n)) return "Clothing > Women > Lingerie > Corsets & Bustiers";
  if (/robe|peignoir|gown|dressing/.test(n)) return "Clothing > Women > Lingerie > Robes & Slips";
  if (/chemise|nightdress|slip|pyjama|pajama/.test(n)) return "Clothing > Women > Lingerie > Nightdresses & Sleepshirts";
  return "Clothing > Women > Lingerie > Lingerie Sets";
}

function care(): string {
  return "Care: hand wash cold, lay flat to dry — the lace and satin will outlast the night.";
}

function padTo350(s: string): string {
  const filler =
    " A house piece in the luxury eveningwear register — bridal trousseau, duchesse satin, corsetry and silk loungewear, dispatched plain and discreet from the United Kingdom.";
  let out = s.trim();
  while (out.length < 350) {
    out += filler;
  }
  // end on a whole sentence or word, never mid-word
  if (out.length > 500) {
    const cut = out.lastIndexOf(". ", 497);
    out = (cut > 340 ? out.slice(0, cut + 1) : out.slice(0, out.lastIndexOf(" ", 497)));
  }
  return out.trim();
}

interface Row {
  SKU: string;
  SEO_Title_80_Chars: string;
  Marketplace_Description: string;
  Category_Path: string;
  Retail_Price: string;
  Primary_Image_URL: string;
  Gallery_Image_URLs: string;
}

async function main() {
  // 1. the live ensembles with their pieces' true cost
  const bundles = await rest<{
    id: string;
    sku: string;
    name: string;
    price: number;
    media: Media[] | null;
    story: string | null;
  }>("bundles?select=id,sku,name,price,media,story&live=eq.true&order=price.desc");

  const bi = await rest<{ bundle_id: string; product_id: string }>(
    "bundle_items?select=bundle_id,product_id",
  );
  const allPieceIds = [...new Set(bi.map((b) => b.product_id).filter(Boolean))];
  const pieceRows = allPieceIds.length
    ? await rest<Piece>(
        `products?id=in.(${allPieceIds.map((s) => `"${s}"`).join(",")})&select=id,sku,name,wholesale_cost`,
      )
    : [];
  const costById = new Map(pieceRows.map((p) => [p.id, Number(p.wholesale_cost) || 0]));
  const nameById = new Map(pieceRows.map((p) => [p.id, p.name]));
  const skuById = new Map(pieceRows.map((p) => [p.id, p.sku]));

  const bundleCost = new Map<string, number>();
  const bundlePieces = new Map<string, string[]>();
  for (const b of bi) {
    const cost = costById.get(b.product_id) ?? 0;
    bundleCost.set(b.bundle_id, (bundleCost.get(b.bundle_id) ?? 0) + cost);
    const n = nameById.get(b.product_id);
    if (n) bundlePieces.set(b.bundle_id, [...(bundlePieces.get(b.bundle_id) ?? []), n]);
  }

  interface Candidate {
    sku: string;
    name: string;
    price: number;
    cost: number;
    margin: number;
    media: Media[] | null;
    story: string | null;
    pieces: string[] | null;
    kind: "ensemble" | "soh";
  }

  const candidates: Candidate[] = bundles.map((b) => ({
    sku: b.sku,
    name: b.name,
    price: Number(b.price),
    cost: bundleCost.get(b.id) ?? 0,
    margin: Number(b.price) - (bundleCost.get(b.id) ?? 0),
    media: b.media,
    story: b.story,
    pieces: bundlePieces.get(b.id) ?? null,
    kind: "ensemble" as const,
  }));

  // 2. the Shirley of Hollywood robes and corsets
  const soh = await rest<Piece>(
    "products?select=sku,name,supplier_sku,wholesale_cost,retail_price,media,story&status=eq.live&or=(supplier_sku.ilike.SOH*,supplier_sku.ilike.SHIRLEYOFHOLLYWOOD*)&order=retail_price.desc",
  );
  for (const p of soh) {
    const n = p.name.toLowerCase();
    if (!/robe|corset|peignoir|gown|basque|bustier/.test(n)) continue;
    candidates.push({
      sku: p.sku,
      name: p.name,
      price: Number(p.retail_price),
      cost: Number(p.wholesale_cost) || 0,
      margin: Number(p.retail_price) - (Number(p.wholesale_cost) || 0),
      media: p.media,
      story: p.story,
      pieces: null,
      kind: "soh" as const,
    });
  }

  // 3. the top 15 by true margin
  const top = candidates.sort((a, b) => b.margin - a.margin).slice(0, 15);

  const rows: Row[] = top.map((c) => {
    const images = (c.media ?? []).filter((mm) => mm.type === "image" && mm.url).map((mm) => mm.url as string);
    const pieceLine = c.pieces?.length
      ? ` Includes ${c.pieces.length} pieces: ${c.pieces.join(", ")}.`
      : "";
    const fabricFrame =
      "Duchesse satin, sheer lace and garnet tones — composed by the house, numbered on release.";
    const storyBit = c.story ? sanitize(c.story).slice(0, 260) : fabricFrame;
    let desc = sanitize(
      `${c.name}. ${storyBit}${pieceLine} Condition: New with tags (NWT) — original packaging, never worn. ${care()}`,
    );
    if (desc.length < 350) desc = padTo350(desc);
    if (desc.length > 500) {
      const cut = desc.lastIndexOf(" ", 497);
      desc = desc.slice(0, cut > 340 ? cut : 497).trimEnd() + "…";
    }
    const color = (c.name.match(/(black|white|red|burgundy|claret|ivory|cream|navy|purple|lavender|pink|gold)/i)?.[0] ?? "").toLowerCase();
    const typeWord = c.kind === "ensemble" ? "Ensemble" : /corset|basque|bustier/.test(c.name.toLowerCase()) ? "Corset" : /robe|peignoir|gown|dressing/.test(c.name.toLowerCase()) ? "Robe" : "Set";
    // keyword-first, no doubled color, no supplier codes
    const cleanName = sanitize(c.name)
      .replace(/\bS0H-IA\b|\bSoH-IA\b|[A-Z]{1,4}-IA\b/g, "")
      .replace(new RegExp(`\\b${color ? color : "(?!x)x"}\\b`, "i"), "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*—\s*/, " — ")
      .trim();
    const colorWord = color ? color[0].toUpperCase() + color.slice(1) + " " : "";
    const seoTitle = titleCase90(sanitize(`${colorWord}${typeWord} — ${cleanName} | NWT Lady Luxe`));
    return {
      SKU: c.sku,
      SEO_Title_80_Chars: seoTitle,
      Marketplace_Description: desc,
      Category_Path: categoryPath(c.name),
      Retail_Price: Number(c.price).toFixed(2),
      Primary_Image_URL: images[0] ?? "",
      Gallery_Image_URLs: images.slice(1, 5).join(";"),
    };
  });

  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const HEADERS = ["SKU", "SEO_Title_80_Chars", "Marketplace_Description", "Category_Path", "Retail_Price", "Primary_Image_URL", "Gallery_Image_URLs"];
  const csv = [HEADERS.join(","), ...rows.map((r) => HEADERS.map((h) => cell(String(r[h as keyof Row]))).join(","))].join("\n");

  mkdirSync("exports", { recursive: true });
  writeFileSync("exports/marketplace-export.csv", csv, "utf-8");
  console.log(`exports/marketplace-export.csv — ${rows.length} listings (top margin $${Math.round(top[0]?.margin ?? 0)})`);
  for (const r of rows) console.log(`  ${r.SKU}  $${r.Retail_Price}  ${r.SEO_Title_80_Chars.slice(0, 60)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
