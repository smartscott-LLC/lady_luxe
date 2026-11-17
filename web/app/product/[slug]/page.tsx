import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import TurntablePlayer, { TurntableMedia } from "@/components/TurntablePlayer";
import styles from "./product.module.css";

const RETAIL_MARKUP = 2.4;

type ProductMedia = {
  alt?: string;
  url?: string;
  type: "image" | "turntable" | string;
  mp4?: string;
  webm?: string;
  poster?: string;
  poses?: { angle: number; label?: string; time_s: number }[];
};

type Product = {
  sku: string;
  name: string;
  tag: string | null;
  supplier_sku: string;
  wholesale_cost: number;
  duty_rate: number;
  media: ProductMedia[] | null;
  story: string | null;
};

async function getProduct(slug: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "sku, name, tag, supplier_sku, wholesale_cost, duty_rate, media, story"
    )
    .eq("sku", decodeURIComponent(slug))
    .eq("status", "live")
    .maybeSingle();
  return (data as Product) ?? null;
}

function ProductView({ product }: { product: Product }) {
  const media = Array.isArray(product.media) ? product.media : [];
  const images = media.filter((m) => m.type === "image" && m.url);
  const turntable = media.find(
    (m) => m.type === "turntable" && m.mp4
  ) as TurntableMedia | undefined;
  const retail = Number(product.wholesale_cost) * RETAIL_MARKUP;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.crumbs}>
          <Link href="/">Lady Luxe</Link>
          <span aria-hidden>—</span>
          <span>{product.name}</span>
        </nav>

        <div className={styles.grid}>
          <div className={styles.stageColumn}>
            {turntable && turntable.mp4 ? (
              <TurntablePlayer
                mp4={turntable.mp4}
                webm={turntable.webm}
                poster={turntable.poster ?? images[0]?.url}
                poses={turntable.poses ?? []}
                alt={`${product.name} — 360° turntable`}
              />
            ) : (
              images[0]?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.hero}
                  src={images[0].url}
                  alt={images[0].alt ?? product.name}
                />
              )
            )}
          </div>

          <div className={styles.infoColumn}>
            <p className={styles.brand}>Beauty Night</p>
            <h1 className={styles.name}>{product.name}</h1>
            {product.tag && <p className={styles.tag}>{product.tag}</p>}

            <p className={styles.price}>
              ${retail.toFixed(2)}
              <span className={styles.currency}> USD</span>
            </p>

            <div className={styles.badges}>
              <span className={styles.badge}>Duties prepaid</span>
              <span className={styles.badge}>Ships discreetly</span>
            </div>

            {product.story && (
              <p className={styles.story}>{product.story}</p>
            )}

            <button className={styles.cta} type="button" disabled>
              Add to bag — checkout arriving
            </button>
            <p className={styles.fine}>
              Duties &amp; import charges are prepaid by Lady Luxe — the price
              above is the price.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ProductView product={product} />
    </Suspense>
  );
}
