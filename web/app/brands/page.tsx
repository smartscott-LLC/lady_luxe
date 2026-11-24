import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { BRAND_ORDER, brandFromSupplierSku, brandSlug, brandSkuLookup, IRALL_EROTIC_SKUS } from "@/lib/brand";
import styles from "./brands.module.css";

/** Counts live products per brand, straight from the database. */
async function BrandIndex() {
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

  const brands = BRAND_ORDER.filter((b) => (counts.get(b) ?? 0) > 0);

  return (
    <div className={styles.grid}>
      {brands.map((brand) => (
        <Link
          key={brand}
          href={`/brands?b=${brandSlug(brand)}`}
          className={styles.card}
        >
          <span className={styles.brandName}>{brand}</span>
          <span className={styles.count}>
            {counts.get(brand)} piece{counts.get(brand) === 1 ? "" : "s"}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Product grid for one brand (?b=<slug>) — the house's full live floor. */
async function BrandProducts({ brand }: { brand: string }) {
  const supabase = await createClient();
  const lookup = brandSkuLookup(brand);
  let query = supabase
    .from("products")
    .select("sku, name, supplier_sku, retail_price, media")
    .eq("status", "live");

  query =
    lookup.mode === "exact"
      ? query.in("supplier_sku", lookup.values)
      : query.like("supplier_sku", `${lookup.values[0]}%`);

  // the Irall Erotic pieces share the plain IRALL prefix — keep them off
  // the Irall floor so each house shows its own line
  if (brand === "Irall") {
    for (const eroticSku of IRALL_EROTIC_SKUS) {
      query = query.neq("supplier_sku", eroticSku);
    }
  }

  const { data } = await query.order("retail_price", { ascending: false });

  const products = data ?? [];

  if (products.length === 0) {
    return (
      <p className={styles.empty}>
        The {brand} floor is being dressed — the Circle hears first when it
        opens. <Link href="/club">Join the Club</Link> to hear the moment it does.
      </p>
    );
  }

  return (
    <div className={styles.productGrid}>
      {products.map((p) => {
        const media = Array.isArray(p.media) ? p.media : [];
        const image = media.find((m: any) => m.type === "image")?.url;
        const retail = Number(p.retail_price) || 0;
        return (
          <Link key={p.sku} href={`/product/${p.sku}`} className={styles.productCard}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={p.name} className={styles.productImage} />
            ) : (
              <div className={`${styles.productImage} ${styles.productImageEmpty}`} />
            )}
            <span className={styles.productName}>{p.name}</span>
            <span className={styles.productPrice}>${retail.toFixed(2)}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The Houses We Carry</p>
        <h1 className={styles.title}>Brands</h1>
        <p className={styles.sub}>
          Each house is chosen for the way it drapes the midnight hours.
        </p>
        <Suspense fallback={<p className={styles.empty}>Opening the collection…</p>}>
          <BrandsInner searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function BrandsInner({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  const { b } = await searchParams;
  if (!b) return <BrandIndex />;
  const brand = BRAND_ORDER.find(
    (label) => brandSlug(label) === b.toLowerCase(),
  );
  if (!brand) return <BrandIndex />;
  return (
    <>
      <Link href="/brands" className={styles.back}>
        ← All houses
      </Link>
      <BrandProducts brand={brand} />
    </>
  );
}
