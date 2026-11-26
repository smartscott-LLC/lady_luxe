/**
 * The product feed — one catalog, every shopping platform.
 *
 * Google, Meta, Pinterest, TikTok and Bing all accept the Google-style
 * product attributes; the two routes (products.xml, products.csv) are the
 * dialects. The builder is shared so the price shown to the platforms is
 * always the exact retail_price the storefront charges (verified 0 drift
 * against the checkout's wholesale × 2.4 across all 385 live pieces).
 */

import { brandFromSupplierSku } from "@/lib/brand";
import { serviceSelect } from "@/lib/service-db";

const SITE = "https://www.ladyluxeclub.com";
const LINGERIE = "Apparel & Accessories > Clothing > Underwear & Socks > Lingerie";
const SLEEP = "Apparel & Accessories > Clothing > Sleepwear & Loungewear";

// pieces that exist only to make the ensembles whole — they are sold as
// the set under its LL-ENS-* SKU and are never advertised on their own
const ENSEMBLE_ONLY = new Set([
  "LL-BEAUTYNIGHTBN6612CATHERINE-G",
  "LL-BAL589WHITE-G",
  "LL-BS249BLACK-G",
  "LL-IRALLASTRIDGLOVESWHITE-G",
]);

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  price: number;
  brand: string;
  category: string;
  color: string;
  size: string;
}

function categoryFor(name: string): string {
  const n = name.toLowerCase();
  if (/dress|nightdress|gown|robe|chemise|slip|pyjama|pajama|lounge|kimono|sleep/.test(n)) {
    return SLEEP;
  }
  return LINGERIE;
}

// colour from the name first, then the supplier SKU — Google's apparel
// diagnostics demand one, and "Multicolor" beats an invented colour
const COLOR_WORDS: [RegExp, string][] = [
  [/claret/i, "Burgundy"],
  [/wine/i, "Burgundy"],
  [/bordeaux/i, "Burgundy"],
  [/burgundy/i, "Burgundy"],
  [/black/i, "Black"],
  [/white/i, "White"],
  [/ivory/i, "Ivory"],
  [/cream/i, "Cream"],
  [/\bred\b/i, "Red"],
  [/emerald/i, "Emerald"],
  [/sapphire/i, "Blue"],
  [/\bnavy\b/i, "Navy"],
  [/\broyal\b/i, "Royal Blue"],
  [/\bblue\b/i, "Blue"],
  [/\bpink\b/i, "Pink"],
  [/\brose\b/i, "Rose"],
  [/blush/i, "Blush"],
  [/\bgold\b/i, "Gold"],
  [/silver/i, "Silver"],
  [/grey|gray/i, "Grey"],
  [/purple|violet/i, "Purple"],
  [/lavender/i, "Lavender"],
  [/\bnude\b/i, "Nude"],
  [/beige/i, "Beige"],
  [/champagne/i, "Champagne"],
  [/turquoise/i, "Turquoise"],
  [/\bteal\b/i, "Teal"],
  [/\bolive\b/i, "Olive"],
  [/coral/i, "Coral"],
  [/fuchsia/i, "Fuchsia"],
  [/apricot/i, "Apricot"],
  [/\bmint\b/i, "Mint"],
  [/choco|brown/i, "Brown"],
  [/\baqua\b/i, "Aqua"],
  [/leopard|snake|zebra|animal/i, "Leopard"],
];

function colorFor(name: string, supplierSku: string): string {
  for (const [re, color] of COLOR_WORDS) {
    if (re.test(name)) return color;
  }
  for (const [re, color] of COLOR_WORDS) {
    if (re.test(supplierSku)) return color;
  }
  return "Multicolor";
}

function cleanCopy(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4900);
}

function descriptionFor(
  name: string,
  brand: string,
  story: string,
  sizes: unknown,
): string {
  const written = cleanCopy(story ?? "");
  if (written) return written;
  // factual fallback — nothing invented, only what the row and the flow
  // actually promise
  const list = Array.isArray(sizes) ? (sizes as { size?: string }[]) : [];
  const count = list.length;
  const first = list[0]?.size ?? "";
  const last = list[count - 1]?.size ?? "";
  const range = count > 1 ? ` (from ${first} to ${last})` : count === 1 ? ` (size ${first})` : "";
  return cleanCopy(
    `${name} by ${brand}. Offered in ${count} size${count === 1 ? "" : "s"}${range}. ` +
      `Dispatched plain and discreet from the United Kingdom within 24 hours.`,
  );
}

async function fetchProductItems(): Promise<FeedItem[]> {
  const rows =
    (await serviceSelect<{
      sku: string;
      name: string;
      retail_price: string | number;
      media: unknown;
      story: string;
      sizes: unknown;
      supplier_sku: string;
    }>(
      "products",
      "select=sku,name,retail_price,media,story,sizes,supplier_sku&status=eq.live&order=created_at.desc",
    )) ?? [];

  const items: FeedItem[] = [];
  for (const row of rows) {
    if (ENSEMBLE_ONLY.has(row.sku)) continue; // sold only as part of a set
    const media = Array.isArray(row.media) ? (row.media as { type?: string; url?: string }[]) : [];
    const image =
      media.find((m) => m.type === "image" && m.url)?.url ??
      media.find((m) => m.url)?.url ??
      "";
    if (!image) continue; // a listing without an image is refused by every platform
    const brand = brandFromSupplierSku(row.supplier_sku ?? "");
    const sizes = Array.isArray(row.sizes) ? (row.sizes as { size?: string }[]) : [];
    const supplierSku = row.supplier_sku ?? "";
    items.push({
      id: row.sku,
      title: cleanCopy(row.name),
      description: descriptionFor(row.name, brand, row.story, row.sizes),
      link: `${SITE}/product/${row.sku}`,
      image,
      price: Number(row.retail_price),
      brand,
      category: categoryFor(row.name),
      color: colorFor(row.name, supplierSku),
      size: sizes[0]?.size ?? "One Size",
    });
  }
  return items;
}

/**
 * The feed roster — the ensembles first (the house's signature sets,
 * advertised under their LL-ENS-* SKU), then every individually sold
 * piece. Pieces that exist only inside ensembles are not here.
 */
export async function fetchFeedItems(): Promise<FeedItem[]> {
  const [ensembles, products] = await Promise.all([
    fetchEnsembleItems(),
    fetchProductItems(),
  ]);
  return [...ensembles, ...products];
}

/**
 * The ensembles — the house's own sets, advertised under their LL-ENS-*
 * SKU with the set price. The pieces they contain stay off the feed when
 * they exist only to make the set whole (ENSEMBLE_ONLY).
 */
async function fetchEnsembleItems(): Promise<FeedItem[]> {
  const rows =
    (await serviceSelect<{
      sku: string;
      name: string;
      price: string | number;
      media: unknown;
      story: string;
    }>("bundles", "select=sku,name,price,media,story&live=eq.true&order=price.desc")) ?? [];

  const items: FeedItem[] = [];
  for (const row of rows) {
    const media = Array.isArray(row.media) ? (row.media as { type?: string; url?: string }[]) : [];
    const image =
      media.find((m) => m.type === "image" && m.url)?.url ??
      media.find((m) => m.url)?.url ??
      "";
    if (!image) continue;
    const written = cleanCopy(row.story ?? "");
    items.push({
      id: row.sku,
      title: cleanCopy(row.name),
      description:
        written ||
        cleanCopy(
          `${row.name} by Lady Luxe — the full set, styled as one. Dispatched plain and discreet from the United Kingdom within 24 hours.`,
        ),
      link: `${SITE}/ensemble/${row.sku}`,
      image,
      price: Number(row.price),
      brand: "Lady Luxe",
      category: LINGERIE,
      color: "Multicolor",
      size: "One Size",
    });
  }
  return items;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toXml(items: FeedItem[]): string {
  const entries = items
    .map(
      (it) => `<item>
<g:id>${xmlEscape(it.id)}</g:id>
<g:title>${xmlEscape(it.title)}</g:title>
<g:description>${xmlEscape(it.description)}</g:description>
<g:link>${xmlEscape(it.link)}</g:link>
<g:image_link>${xmlEscape(it.image)}</g:image_link>
<g:condition>new</g:condition>
<g:availability>in stock</g:availability>
<g:price>${it.price.toFixed(2)} USD</g:price>
<g:brand>${xmlEscape(it.brand)}</g:brand>
<g:google_product_category>${xmlEscape(it.category)}</g:google_product_category>
<g:product_type>${xmlEscape(it.brand)}</g:product_type>
<g:identifier_exists>no</g:identifier_exists>
<g:age_group>adult</g:age_group>
<g:gender>female</g:gender>
<g:color>${xmlEscape(it.color)}</g:color>
<g:size>${xmlEscape(it.size)}</g:size>
</item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Lady Luxe — Maison de Couture</title>
<link>${SITE}</link>
<description>Luxury lingerie, dispatched plain and discreet from the United Kingdom.</description>
${entries}
</channel>
</rss>`;
}

export function toCsv(items: FeedItem[]): string {
  const HEADERS = [
    "id", "title", "description", "link", "image_link",
    "condition", "availability", "price", "brand",
    "google_product_category", "product_type", "identifier_exists",
    "age_group", "gender", "color", "size",
  ];
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = items.map((it) =>
    [
      it.id, it.title, it.description, it.link, it.image,
      "new", "in stock", `${it.price.toFixed(2)} USD`, it.brand,
      it.category, it.brand, "no",
      "adult", "female", it.color, it.size,
    ]
      .map(cell)
      .join(","),
  );
  return [HEADERS.join(","), ...rows].join("\n");
}
