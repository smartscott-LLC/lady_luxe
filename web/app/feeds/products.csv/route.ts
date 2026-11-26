import { fetchFeedItems, toCsv } from "@/lib/product-feed";

/**
 * CSV product feed — the second dialect for platforms that prefer it
 * (Pinterest, TikTok, some Meta importers). Same items, same price,
 * same builder as the XML.
 */
export async function GET() {
  const items = await fetchFeedItems();
  return new Response(toCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
