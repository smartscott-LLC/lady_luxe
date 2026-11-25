import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { brandFromSupplierSku, brandSlug } from "@/lib/brand";
import ProductGallery from "@/components/ProductGallery";
import AddToBag from "@/components/AddToBag";
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
  retail_price: number | null;
  duty_rate: number;
  media: ProductMedia[] | null;
  story: string | null;
  sizes: { sku: string; size: string }[] | null;
};

async function getProduct(slug: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "sku, name, tag, supplier_sku, wholesale_cost, retail_price, duty_rate, media, story, sizes"
    )
    .eq("sku", decodeURIComponent(slug))
    .eq("status", "live")
    .maybeSingle();
  return (data as Product) ?? null;
}

function ProductView({
  product,
  from,
}: {
  product: Product;
  from?: string;
}) {
  const media = Array.isArray(product.media) ? product.media : [];
  const images = media.filter((m) => m.type === "image" && m.url);
  const retail = Number(product.retail_price) || Number(product.wholesale_cost) * RETAIL_MARKUP;
  const brand = brandFromSupplierSku(product.supplier_sku);
  const fromFeatured = from === "featured";
  const backHref = fromFeatured ? "/featured" : `/brands?b=${brandSlug(brand)}`;
  const backLabel = fromFeatured ? "← Back to Featured" : `← Back to ${brand}`;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description:
      product.story ??
      product.tag ??
      `${product.name} — composed, numbered and archived by the house.`,
    brand: { "@type": "Brand", name: brandFromSupplierSku(product.supplier_sku) },
    image: images.slice(0, 4).map((m) => m.url),
    offers: {
      "@type": "Offer",
      url: `https://www.ladyluxeclub.com/product/${encodeURIComponent(product.sku)}`,
      priceCurrency: "USD",
      price: retail.toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <div className={styles.inner}>
        <Link className={styles.back} href={backHref}>
          {backLabel}
        </Link>
        <nav className={styles.crumbs}>
          <Link href="/">Lady Luxe</Link>
          <span aria-hidden>—</span>
          <Link href={`/brands?b=${brandSlug(brand)}`}>{brand}</Link>
          <span aria-hidden>—</span>
          <span>{product.name}</span>
        </nav>

        <div className={styles.grid}>
          <div className={styles.stageColumn}>
            <ProductGallery media={product.media ?? []} name={product.name} />
          </div>

          <div className={styles.infoColumn}>
            <p className={styles.brand}>{brand}</p>
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

            <AddToBag
              sku={product.sku}
              name={product.name}
              price={retail}
              sizes={product.sizes ?? undefined}
            />
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ProductLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Data access (params + Supabase) lives inside the Suspense boundary so the route can prerender. */
async function ProductLoader({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const product = await getProduct(slug);
  if (!product) notFound();
  return <ProductView product={product} from={from} />;
}
