import { createClient } from "@/utils/supabase/server";
import { brandFromSupplierSku } from "@/lib/brand";
import { categoryFor } from "@/lib/product-feed";
import { containsFlagged, sanitizeCopy, OCCASION_TAGS } from "@/lib/policy-safe";

/**
 * The Pinterest-safe catalog feed — /api/feeds/pinterest.csv
 *
 * Zero-budget organic discovery lives or dies on the automated filters:
 * everything here is sanitized to the luxury frame (eveningwear, bridal
 * trousseau, corsetry, silk loungewear) and hard-flagged items are
 * excluded outright. The ensembles ride at the top; the bridal pieces,
 * corsets and long robes follow.
 *
 * Headers are Pinterest's expected column set, row 1, exact order.
 */

const SITE = "https://www.ladyluxeclub.com";

interface PinItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  price: number;
  brand: string;
  category: string;
}

const INCLUDE_RE = /robe|corset|bridal|peignoir|gown/i;

export async function GET() {
  const supabase = await createClient();

  // the house ensembles — the signature looks, always included
  const { data: bundleRows } = await supabase
    .from("bundles")
    .select("sku, name, price, media, story")
    .eq("live", true)
    .order("price", { ascending: false });

  // the pieces: bridal, corsets, long robes
  const { data: productRows } = await supabase
    .from("products")
    .select("sku, name, supplier_sku, retail_price, media, story")
    .eq("status", "live")
    .or(
      "name.ilike.%robe%,name.ilike.%gown%,name.ilike.%corset%,name.ilike.%bridal%,name.ilike.%peignoir%",
    )
    .order("retail_price", { ascending: false });

  const items: PinItem[] = [];

  for (const b of bundleRows ?? []) {
    const media = Array.isArray(b.media) ? (b.media as { type?: string; url?: string }[]) : [];
    const image = media.find((mm) => mm.type === "image" && mm.url)?.url ?? "";
    if (!image || containsFlagged(b.name, b.story)) continue;
    items.push({
      id: b.sku,
      title: sanitizeCopy(b.name),
      description:
        sanitizeCopy(b.story || `${b.name} by Lady Luxe — the complete look, styled as one.`) +
        " " +
        OCCASION_TAGS,
      link: `${SITE}/ensemble/${b.sku}`,
      image,
      price: Number(b.price),
      brand: "Lady Luxe",
      category: "Apparel & Accessories > Clothing > Underwear & Socks > Lingerie",
    });
  }

  for (const p of productRows ?? []) {
    const media = Array.isArray(p.media) ? (p.media as { type?: string; url?: string }[]) : [];
    const image = media.find((mm) => mm.type === "image" && mm.url)?.url ?? "";
    const brand = brandFromSupplierSku(p.supplier_sku ?? "");
    if (!image) continue;
    if (containsFlagged(brand, p.name)) continue; // erotic-named houses and pieces stay off Pinterest
    items.push({
      id: p.sku,
      title: sanitizeCopy(p.name),
      description:
        sanitizeCopy(p.story || `${p.name} by ${brand}.`) + " " + OCCASION_TAGS,
      link: `${SITE}/product/${p.sku}`,
      image,
      price: Number(p.retail_price),
      brand,
      category: categoryFor(p.name),
    });
  }

  const HEADERS = [
    "id", "title", "description", "link", "image_link",
    "price", "availability", "condition", "brand",
    "google_product_category", "product_type", "adult",
  ];
  const cell = (v: string) => `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const rows = items.map((it) =>
    [
      it.id,
      it.title,
      it.description,
      it.link,
      it.image,
      `${it.price.toFixed(2)} USD`,
      "in stock",
      "new",
      it.brand,
      it.category,
      `${it.brand} > ${it.category.split("> ").pop()}`,
      "false",
    ]
      .map(cell)
      .join(","),
  );
  const body = [HEADERS.join(","), ...rows].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
