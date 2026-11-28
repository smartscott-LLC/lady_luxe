import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { brandFromSupplierSku } from "@/lib/brand";
import styles from "./products.module.css";

export const metadata: Metadata = {
  title: "The Collection — Lady Luxe",
  description:
    "The full Lady Luxe collection: luxury eveningwear, bridal trousseau, corsetry and silk loungewear — every live piece of the house on one page, dispatched plain and discreet from the UK.",
};

async function ProductsGrid() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("sku, name, supplier_sku, retail_price, media")
    .eq("status", "live")
    .order("created_at", { ascending: false });

  const products = data ?? [];

  return (
    <>
      <p className={styles.count}>{products.length} pieces · newest first</p>
      <div className={styles.grid}>
        {products.map((p) => {
          const media = Array.isArray(p.media) ? p.media : [];
          const image = media.find((mm: any) => mm.type === "image" && mm.url)?.url;
          const brand = brandFromSupplierSku(p.supplier_sku ?? "");
          const retail = Number(p.retail_price) || 0;
          return (
            <Link key={p.sku} href={`/product/${p.sku}`} className={styles.card}>
              <div className={styles.media}>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={p.name} loading="lazy" />
                ) : (
                  <div className={styles.mediaEmpty} />
                )}
              </div>
              <span className={styles.body}>
                <span className={styles.brand}>{brand}</span>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.price}>
                  ${retail.toFixed(2)} <span className={styles.usd}>USD</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/**
 * The full catalog on one page — every live piece of the house, newest
 * first. The grid streams from the live floor; the copy stays
 * policy-safe for the filters.
 */
export default function ProductsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The Maison</p>
        <h1 className={styles.title}>The Collection</h1>
        <p className={styles.sub}>
          Every live piece of the house on one page — eveningwear, corsetry
          and loungewear from the houses we carry, each dispatched within 24
          hours in plain, discreet packaging.
        </p>
        <Suspense fallback={<p className={styles.empty}>Opening the collection…</p>}>
          <ProductsGrid />
        </Suspense>
        <Link href="/" className={styles.back}>
          ← Back to the maison
        </Link>
      </div>
    </main>
  );
}
