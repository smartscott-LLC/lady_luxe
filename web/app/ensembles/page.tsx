import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import LuxeStreamBind from "@/components/LuxeStreamBind";
import styles from "./ensembles.module.css";

/**
 * Ensembles — Custom Combinations. Outfits composed by the house from the
 * catalogs: corset, stockings, garter, panties as one gesture, sold as a
 * set. One order, one number in the archive, and the duties travel together.
 */
async function EnsemblesCollection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bundles")
    .select("sku, name, price, media, story, bundle_items(count)")
    .eq("live", true)
    .neq("sku", "LL-ENS-PETAL") // withdrawn from display — palette clash
    .order("price", { ascending: false });

  const ensembles = data ?? [];
  if (ensembles.length === 0) {
    return (
      <p className={styles.empty}>
        The ensembles are being composed — return shortly.
      </p>
    );
  }

  return (
    <>
      <LuxeStreamBind />
      <p className={styles.count}>
        {ensembles.length} set{ensembles.length === 1 ? "" : "s"} · composed by
        the house · numbered on release
      </p>
      <div className={styles.grid}>
        {ensembles.map((b: any) => {
          const media = Array.isArray(b.media) ? b.media : [];
          const img = media.find((m: any) => m.type === "image")?.url;
          const film = media.find((m: any) => m.type === "turntable" && m.mp4);
          const pieces = b.bundle_items?.[0]?.count ?? 0;
          return (
            <Link key={b.sku} href={`/ensemble/${b.sku}`} className={`ll-video-card ${styles.card}`}>
              <div className={styles.cardMedia}>
                {film ? (
                  <video
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={img}
                  >
                    <source src={film.mp4} type="video/mp4" />
                  </video>
                ) : img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={b.name} className={styles.image} loading="lazy" />
                ) : (
                  <div className={styles.imageEmpty} />
                )}
                <div className="ll-video-card__scrim" />
              </div>
              <span className={styles.pieces}>
                {pieces}-piece set
              </span>
              <span className={styles.name}>{b.name}</span>
              <span className={styles.price}>
                ${Number(b.price).toFixed(2)}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function EnsemblesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Custom Combinations</p>
        <h1 className={styles.title}>Ensembles</h1>
        <p className={styles.sub}>
          Lady Luxe Signature Collections — hand-chosen arrangements,
          masterfully selected for their unrivaled opulence and elegance.
        </p>
        <Suspense
          fallback={
            <p className={styles.empty}>The ensembles are being composed…</p>
          }
        >
          <EnsemblesCollection />
        </Suspense>
      </div>
    </main>
  );
}
