import type { MetadataRoute } from "next";

const BASE = "https://www.ladyluxeclub.com";

/** robots.txt — the pay flow stays out of the index, everything else is fair game. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/checkout", "/api/", "/studio"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
