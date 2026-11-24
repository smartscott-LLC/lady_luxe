import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import FeaturedCarousel, { FeaturedItem } from "@/components/FeaturedCarousel";
import LuxeStreamBind from "@/components/LuxeStreamBind";

export const metadata = {
  title: "Featured — Lady Luxe",
  description:
    "The pieces in motion — every featured film from the house, one continuous gallery. Hover to play, click to meet it properly.",
};

async function FeaturedGrid() {
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
    const image = media.find((m: any) => m.type === "image");
    return {
      sku: p.sku,
      name: p.name,
      price: Number(p.retail_price) || 0,
      poster: tt.poster ?? image?.url ?? null,
      mp4: tt.mp4,
      webm: tt.webm,
    };
  }).filter((f: FeaturedItem) => f.mp4);

  if (items.length === 0) {
    return (
      <p className="lead" style={{ color: "var(--ll-cream-70)" }}>
        The films are being prepared — return shortly.
      </p>
    );
  }

  return (
    <>
      <LuxeStreamBind />
      <FeaturedCarousel items={items} />
      <div className="row mt-5">
        {items.map((item) => (
          <div className="col-md-4 col-lg-3 mb-4" key={item.sku}>
            <Link
              href={`/product/${item.sku}`}
              className="ll-video-card d-block"
              style={{
                padding: 0,
                overflow: "hidden",
                borderRadius: "10px",
                border: "1px solid var(--ll-gold-25)",
              }}
            >
              <div className="ll-video-card__media" style={{ position: "relative", paddingTop: "133%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <video
                  muted
                  loop
                  playsInline
                  preload="none"
                  poster={item.poster ?? ""}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                >
                  <source src={item.mp4} type="video/mp4" />
                  {item.webm ? <source src={item.webm} type="video/webm" /> : null}
                </video>
                <div className="ll-video-card__scrim" />
                <div className="ll-video-card__progress"><i /></div>
              </div>
              <div style={{ padding: "1rem 1.2rem" }}>
                <p className="ll-felipa mb-1" style={{ fontSize: "1.02rem" }}>{item.name}</p>
                <p className="ll-gold-text mb-0" style={{ fontFamily: "var(--ll-font-body)", fontSize: ".9rem" }}>
                  ${item.price.toFixed(2)}
                </p>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

export default function FeaturedPage() {
  return (
    <main className="section section-lg">
      <div className="container">
        <div className="text-center mb-5">
          <p className="ll-eyebrow mb-2">Featured</p>
          <h1 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
            In Motion
          </h1>
          <div className="ll-divider"><span /></div>
          <p className="lead" style={{ color: "var(--ll-cream-70)" }}>
            Every featured film from the house — hover a piece, the film plays. Click to meet it properly.
          </p>
        </div>
        <Suspense fallback={<div style={{ minHeight: "30rem" }} />}>
          <FeaturedGrid />
        </Suspense>
      </div>
    </main>
  );
}
