import type { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { createClient } from "@/utils/supabase/server";

const BASE = "https://www.ladyluxeclub.com";

/**
 * Sitemap for ladyluxeclub.com — static routes, journal posts, and the live
 * catalog (products + ensembles) straight from Supabase, generated with each
 * build (Vercel redeploys on every push, so the map stays current).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    "",
    "/featured",
    "/maison",
    "/private-reserve",
    "/brands",
    "/blog",
    "/club",
  ].map((p) => ({
    url: `${BASE}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));

  // journal posts (frontmatter dates)
  const posts: MetadataRoute.Sitemap = [];
  try {
    const dir = path.join(process.cwd(), "content", "blog");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const { data } = matter(fs.readFileSync(path.join(dir, f), "utf-8"));
      const date = typeof data.date === "string" ? data.date : "";
      posts.push({
        url: `${BASE}/blog/${f.replace(/\.md$/, "")}`,
        lastModified: date ? new Date(date) : new Date(),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // journal dir unreadable — statics still ship
  }

  // live catalog
  let catalog: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const [{ data: products }, { data: bundles }] = await Promise.all([
      supabase.from("products").select("sku").eq("status", "live"),
      supabase.from("bundles").select("sku").eq("live", true),
    ]);
    catalog = [
      ...(products ?? []).map((p: { sku: string }) => ({
        url: `${BASE}/product/${encodeURIComponent(p.sku)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...(bundles ?? []).map((b: { sku: string }) => ({
        url: `${BASE}/ensemble/${encodeURIComponent(b.sku)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // Supabase unreachable — statics + journal still ship
  }

  return [...statics, ...posts, ...catalog];
}
