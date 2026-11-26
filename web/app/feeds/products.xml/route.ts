import { fetchFeedItems, toXml } from "@/lib/product-feed";

/**
 * Google-format product feed (RSS 2.0 + g: namespace) — the dialect Google
 * Merchant Center, Meta Catalog, Pinterest, TikTok and Bing all accept.
 * Served with CDN cache headers so the platforms' hourly pulls never
 * touch the database more than once an hour.
 */
export async function GET() {
  const items = await fetchFeedItems();
  return new Response(toXml(items), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
