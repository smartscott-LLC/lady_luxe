import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { brandFromSupplierSku } from "@/lib/brand";
import styles from "./private-reserve.module.css";

/** Private Reserve — every piece under $65, all houses, one collection. */
async function PrivateCollection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("sku, name, supplier_sku, retail_price, media")
    .eq("status", "live")
    .lt("retail_price", 65)
    .order("retail_price", { ascending: false });

  const products = data ?? [];
  if (products.length === 0) {
    return <p className={styles.empty}>The reserve is being dressed — return shortly.</p>;
  }

  return (
    <>
      <p className={styles.count}>
        {products.length} piece{products.length === 1 ? "" : "s"} · all houses ·
        same atelier, softer numbers
      </p>
      <div className={styles.grid}>
        {products.map((p: any) => {
          const media = Array.isArray(p.media) ? p.media : [];
          const image = media.find((m: any) => m.type === "image")?.url;
          return (
            <Link key={p.sku} href={`/product/${p.sku}`} className={styles.card}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={p.name} className={styles.image} />
              ) : (
                <div className={`${styles.image} ${styles.imageEmpty}`} />
              )}
              <span className={styles.brand}>{brandFromSupplierSku(p.supplier_sku)}</span>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.price}>${Number(p.retail_price).toFixed(2)}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function PrivateReservePage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Member of the House? Same houses, softer numbers.</p>
        <h1 className={styles.title}>Private Reserve</h1>
        <p className={styles.sub}>
          The privately priced side of the maison — every piece under $65,
          gathered from all the houses we carry. Nothing is discounted; it is
          simply the gentler ledger.
        </p>
        <Suspense fallback={<p className={styles.empty}>Opening the reserve…</p>}>
          <PrivateCollection />
        </Suspense>
        <Link href="/" className={styles.back}>
          ← Return to the Maison
        </Link>
      </div>
    </main>
  );
}
