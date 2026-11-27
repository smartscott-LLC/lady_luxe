import { Suspense } from "react";
import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { createClient } from "@/utils/supabase/server";
import HeroVideo from "@/components/HeroVideo";
import FeaturedCarousel, { FeaturedItem } from "@/components/FeaturedCarousel";
import BrandMarquee from "@/components/BrandMarquee";
import LuxeStreamBind from "@/components/LuxeStreamBind";
import OpenDrawerButton from "@/components/OpenDrawerButton";
import { BRAND_ORDER, brandFromSupplierSku, brandSlug } from "@/lib/brand";

export const metadata = {
  title: "Lady Luxe — Maison de Couture",
  description:
    "A maison de couture for the midnight hours. Evening wear in garnet, amaranth and gold — composed, numbered and archived by the house.",
};

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function latestPost() {
  try {
    const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
    const posts = files
      .map((f) => {
        const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8");
        const { data } = matter(raw);
        return {
          slug: f.replace(/\.md$/, ""),
          title: data.title ?? f,
          category: data.category ?? "Journal",
          metaDescription: data.metaDescription ?? "",
          cover: data.cover ?? "",
          date: data.date ?? "",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    return posts[0] ?? null;
  } catch {
    return null;
  }
}

const MOTTO =
  "Elegance not extravagance, inclusive not exclusive, and encourageable not incorrigible.";

const MAISON = [
  {
    title: "The Ensembles",
    href: "/ensembles",
    art: "/brand/imagery/corset-line-refined.webp",
    copy: "Corset, stockings, gloves — composed as one gesture. The house dresses the whole look, so you never have to assemble it.",
  },
  {
    title: "Numbered & Archived",
    href: "/ensembles",
    art: "/brand/imagery/seal-numbered.webp",
    copy: "Every ensemble is numbered on release and entered in the house record. When the number is gone, it's gone.",
  },
  {
    title: "The Circle",
    href: "/club",
    art: "/brand/imagery/monogram-gold.webp",
    copy: "Members of the Circle see each release first. Sign-ups are open — membership is free, always.",
  },
];

async function getFeaturedFilms(): Promise<FeaturedItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("sku, name, retail_price, media")
    .eq("status", "live")
    .gte("retail_price", 65)
    .contains("media", JSON.stringify([{ type: "turntable" }]))
    .order("retail_price", { ascending: false })
    .limit(24);

  const items: FeaturedItem[] = (data ?? []).map((p: any) => {
    const media = Array.isArray(p.media) ? p.media : [];
    const tt = media.find((m: any) => m.type === "turntable") ?? {};
    const image = media.find((m: any) => m.type === "image") ?? {};
    return {
      sku: p.sku,
      name: p.name,
      price: Number(p.retail_price) || 0,
      poster: tt.poster ?? image.url ?? null,
      mp4: tt.mp4,
      webm: tt.webm,
    };
  }).filter((f) => f.mp4);

  // the priciest twelve opened the carousel and they read gaudy — move
  // them to the back so the first impression is the next tier
  return [...items.slice(12), ...items.slice(0, 12)];
}

async function FeaturedFilms() {
  const items = await getFeaturedFilms();
  if (items.length === 0) return null;
  return (
    <section id="featured" aria-label="Featured films" className="section pt-5 ll-reveal">
      <LuxeStreamBind />
      <div className="container text-center">
        <p className="ll-eyebrow mb-2">Featured</p>
        <h2 className="ll-script" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)" }}>
          In Motion
        </h2>
        <p style={{ color: "var(--ll-cream-70)", fontWeight: 300 }}>
          Hover a piece — the film plays. Click to meet it properly.
        </p>
        <FeaturedCarousel items={items} />
        <div className="mt-4">
          <Link href="/featured" className="ll-btn">
            All Featured Pieces
          </Link>
        </div>
      </div>
    </section>
  );
}

async function getEnsembles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bundles")
    .select("sku, name, price, media, story, bundle_items(count)")
    .eq("live", true)
    .neq("sku", "LL-ENS-PETAL") // the petal palette clashes on the midnight band — withdrawn from the marquee
    .order("price", { ascending: false });

  if (error) return [];
  return data.map((b) => ({
    sku: b.sku,
    name: b.name,
    price: b.price,
    img: Array.isArray(b.media) ? b.media[0]?.url ?? "" : "",
    story: b.story,
    pieces: b.bundle_items?.[0]?.count ?? 0,
  }));
}

async function getMarqueeProducts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("sku, name, retail_price, media")
    .eq("status", "live")
    .gte("retail_price", 65)
    .contains("media", JSON.stringify([{ type: "turntable" }]))
    .order("retail_price", { ascending: false })
    .limit(6);
  return (data ?? []).map((p: any) => {
    const media = Array.isArray(p.media) ? p.media : [];
    const tt = media.find((m: any) => m.type === "turntable") ?? {};
    const image = media.find((m: any) => m.type === "image") ?? {};
    return {
      sku: p.sku,
      name: p.name,
      price: Number(p.retail_price) || 0,
      img: tt.poster ?? image.url ?? "",
      pieces: 0,
      isProduct: true,
    };
  });
}

const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

export default function Home() {
  return (
    <main>
      {/* ===================== HERO ===================== */}
      <section className="ll-hero" aria-label="Lady Luxe — introduction">
        <div className="ll-hero-backdrop">
          <HeroVideo src="/brand/videos/hero-atelier-b.mp4" />
        </div>
        <div className="container position-relative" style={{ zIndex: 2 }}>
          <div className="ll-hero-stack">
            <p className="ll-eyebrow mb-3">Maison de Couture</p>
            <h1 className="ll-script ll-display mb-2">Lady Luxe</h1>
            <p className="ll-felipa ll-sub mb-4">
              Evening wear cut from garnet silk, duchesse satin &amp; hand-embroidered gold.
            </p>
            <div className="ll-divider" style={{ maxWidth: "22rem", marginLeft: 0 }}>
              <span />
            </div>
            <p className="lead mb-5">
              Every piece is chosen, composed and numbered by the house — ensembles made for
              rooms with low light and long memories.
            </p>
            <OpenDrawerButton
              drawer="intimates"
              className="ll-btn ll-btn--solid mr-3 mb-3 mb-md-0"
            >
              Explore the Collection
            </OpenDrawerButton>
            <Link href="/maison" className="ll-btn mb-3 mb-md-0">
              The Maison
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== FEATURED FILMS ===================== */}
      <Suspense fallback={<div style={{ minHeight: "30rem" }} />}>
        <FeaturedFilms />
      </Suspense>

      {/* ===================== THE HOUSES (BRAND MARQUEE) ===================== */}
      <Suspense fallback={<MarqueeFallback />}>
        <HousesMarquee />
      </Suspense>

      {/* ===================== COLLECTION MARQUEE ===================== */}
      <Suspense fallback={<MarqueeFallback />}>
        <CollectionMarquee />
      </Suspense>

      {/* ===================== ATELIER INTERLUDE ===================== */}
      <section className="ll-band ll-reveal" aria-label="Inside the atelier">
        <img
          src="/brand/imagery/campaign-chaise.webp"
          alt="The Lady Luxe autumn campaign — garnet silk on the chaise"
          loading="lazy"
        />
        <div className="ll-band__scrim" aria-hidden />
        <div className="ll-band__caption container">
          <p className="ll-eyebrow mb-1">Inside the Maison</p>
          <p className="ll-felipa">Cut, finished and archived by hand.</p>
        </div>
      </section>

      {/* ===================== MAISON ===================== */}
      <section id="maison" className="section section-lg ll-reveal" aria-label="The maison">
        <div className="container">
          <div className="row justify-content-center text-center mb-5">
            <div className="col-lg-8">
              <p className="ll-eyebrow mb-3">Est. MMXXV</p>
              <h2 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
                The Maison
              </h2>
              <div className="ll-divider"><span /></div>
              <p className="ll-felipa" style={{ color: "var(--ll-gold-soft)", fontSize: "1.15rem", lineHeight: 1.9 }}>
                {MOTTO}
              </p>
              <p className="lead">A small house, on purpose. Three disciplines, one standard.</p>
            </div>
          </div>
          <div className="row">
            {MAISON.map((card) => (
              <div className="col-md-4 mb-4 mb-md-0" key={card.title}>
                <Link href={card.href} className="ll-journal-card d-block">
                  <img className="ll-discipline-art" src={card.art} alt="" loading="lazy" />
                  <h3 className="ll-felipa h5">{card.title}</h3>
                  <p>{card.copy}</p>
                </Link>
              </div>
            ))}
          </div>
          <div className="text-center mt-5">
            <Link href="/maison" className="ll-btn">
              Discover the Maison
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== FROM THE JOURNAL ===================== */}
      <Suspense fallback={null}>
        <JournalTeaser />
      </Suspense>
    </main>
  );
}

/* ===================== FROM THE JOURNAL =====================
   Latest post + link to the full journal. */
async function JournalTeaser() {
  const post = latestPost();
  return (
    <section className="section pb-5 ll-reveal" aria-label="From the journal">
      <LuxeStreamBind />
      <div className="container">
        <div className="row justify-content-center text-center mb-4">
          <div className="col-lg-8">
            <p className="ll-eyebrow mb-2">The Private List</p>
            <h2 className="ll-script" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)" }}>
              From the Journal
            </h2>
            <p style={{ color: "var(--ll-cream-70)", fontWeight: 300 }}>
              One letter a month — lifestyle, fashion notes, new releases &amp; member perks.
            </p>
          </div>
        </div>
        {post && (
          <div className="row justify-content-center mb-4">
            <div className="col-lg-8">
              <Link href={`/blog/${post.slug}`} className="ll-journal-card d-block">
                <div className="row align-items-center">
                  {post.cover && (
                    <div className="col-md-5 mb-3 mb-md-0">
                      <img
                        src={post.cover}
                        alt=""
                        loading="lazy"
                        style={{
                          width: "100%",
                          display: "block",
                          borderRadius: ".5rem",
                          aspectRatio: "3 / 2",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}
                  <div className={post.cover ? "col-md-7" : "col-12"}>
                    <p className="ll-eyebrow mb-2" style={{ fontSize: ".65rem" }}>{post.category}</p>
                    <h3 className="ll-felipa h4">{post.title}</h3>
                    <p style={{ color: "var(--ll-cream-70)", marginBottom: 0 }}>{post.metaDescription}</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}
        <div className="text-center">
          <Link href="/blog" className="ll-btn">
            Read the Journal
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ===================== COLLECTION (dynamic) =====================
   Fetched live from Supabase. Under cacheComponents, dynamic data
   belongs inside a Suspense boundary — the shell renders instantly
   and the marquee streams in when the catalog answers. */
function MarqueeFallback() {
  return (
    <section
      id="collection"
      className="ll-marquee-section ll-marquee--collection ll-reveal"
      aria-label="Current collection"
    >
      <div className="container text-center mb-5">
        <p className="ll-eyebrow mb-3">Autumn — Winter</p>
        <h2 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
          The Midnight Collection
        </h2>
        <p className="ll-felipa mt-3" style={{ color: "var(--ll-cream-70)" }}>
          The collection is being dressed…
        </p>
      </div>
      <div className="ll-marquee" style={{ minHeight: "420px" }} />
    </section>
  );
}

async function HousesMarquee() {
  /* the marquee streams only the houses that actually carry pieces —
     a house whose floor is empty (retired, re-curated) doesn't advertise
     an empty room */
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("supplier_sku")
    .eq("status", "live");
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const brand = brandFromSupplierSku(r.supplier_sku);
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  const houses = BRAND_ORDER.filter((b) => (counts.get(b) ?? 0) > 0);
  if (houses.length === 0) return null;
  return (
    <section
      aria-label="The houses we carry"
      className="section pb-0 ll-marquee-section ll-marquee--houses ll-reveal"
    >
      <div className="container text-center">
        <p className="ll-eyebrow mb-2">The Houses We Carry</p>
        <BrandMarquee speed={44}>
          {houses.map((b) => (
            <Link
              key={b}
              href={`/brands?b=${brandSlug(b)}`}
              className="ll-brand-logo"
              style={{
                fontFamily: "var(--ll-font-display)",
                fontWeight: 700,
                fontSize: "clamp(1.7rem, 2.6vw, 2.4rem)",
                letterSpacing: ".14em",
                color: "var(--ll-gold-soft)",
                textDecoration: "none",
              }}
            >
              {b}
            </Link>
          ))}
        </BrandMarquee>
      </div>
    </section>
  );
}

async function CollectionMarquee() {
  const [ensembles, products] = await Promise.all([getEnsembles(), getMarqueeProducts()]);
  const cards = [
    ...ensembles.map((e) => ({ ...e, isProduct: false })),
    ...products,
  ];

  return (
    <section
      id="collection"
      className="ll-marquee-section ll-marquee--collection ll-reveal"
      aria-label="Current collection"
      data-ll-sentinel="1"
    >
      <div className="container text-center mb-5">
        <p className="ll-eyebrow mb-3">Autumn — Winter</p>
        <h2 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
          The Midnight Collection
        </h2>
        <p className="ll-felipa mt-3" style={{ color: "var(--ll-cream-70)" }}>
          {cards.length} pieces, each composed by the house. Hover a card to meet it.
        </p>
      </div>
      <div className="ll-marquee">
        <div className="ll-marquee__track">
          {/* two groups: the visible set + its seamless loop twin, both SSR'd.
              lady-luxe.js leaves a two-group track untouched (zero DOM writes),
              so a bind is hydration-safe whenever it fires. */}
          {[false, true].map((twin) => (
            <div
              key={twin ? "clone" : "primary"}
              className="ll-marquee__group"
              aria-hidden={twin || undefined}
            >
              {cards.length === 0 && (
                <p className="lead px-4" style={{ color: "var(--ll-cream-70)" }}>
                  The collection is being dressed — return shortly.
                </p>
              )}
              {cards.map((c) => (
                <Link
                  key={c.sku}
                  className="ll-video-card"
                  href={c.isProduct ? `/product/${c.sku}` : `/ensemble/${c.sku}`}
                  tabIndex={twin ? -1 : undefined}
                >
                  <div className="ll-video-card__media">
                    {c.img && <img src={c.img} alt={twin ? "" : c.name} loading="lazy" />}
                    <div className="ll-video-card__scrim" />
                  </div>
                  {!twin && (
                    <span className="ll-video-card__hint">
                      {c.isProduct ? "Numbered piece" : `${c.pieces}-piece ensemble`}
                    </span>
                  )}
                  <div className="ll-video-card__info">
                    <div>
                      <p className="ll-video-card__name">{c.name}</p>
                      <p className="ll-video-card__tag">
                        {c.isProduct ? "Ready to wear · composed by the house" : "Composed by the house"}
                      </p>
                    </div>
                    <span className="ll-video-card__price">{money(c.price)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="container text-center mt-5">
        <Link
          href="https://formserver.ladyluxeclub.com/forms/lady_luxe"
          className="ll-btn"
          target="_blank"
          rel="noopener"
        >
          Request the Lookbook
        </Link>
      </div>
    </section>
  );
}
