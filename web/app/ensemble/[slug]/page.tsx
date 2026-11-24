import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { brandFromSupplierSku, brandSlug } from "@/lib/brand";
import TurntablePlayer, { TurntableMedia } from "@/components/TurntablePlayer";
import styles from "../../product/[slug]/product.module.css";

export const metadata = {
  title: "Ensemble — Lady Luxe",
  description: "A numbered ensemble, composed by the house.",
};

type BundleMedia = {
  url?: string;
  alt?: string;
  type?: string;
  mp4?: string;
  webm?: string;
  poster?: string;
};

type Bundle = {
  sku: string;
  name: string;
  price: number;
  media: BundleMedia[] | null;
  story: string | null;
  pieces: number;
};

async function getBundle(sku: string): Promise<Bundle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bundles")
    .select("sku, name, price, media, story, bundle_items(count)")
    .eq("sku", decodeURIComponent(sku))
    .eq("live", true)
    .maybeSingle();
  if (!data) return null;
  return {
    sku: data.sku,
    name: data.name,
    price: Number(data.price),
    media: Array.isArray(data.media) ? data.media : [],
    story: data.story,
    pieces: (data as any).bundle_items?.[0]?.count ?? 0,
  };
}

function EnsembleView({ bundle }: { bundle: Bundle }) {
  const media = bundle.media ?? [];
  const tt = media.find(
    (m) => m.type === "turntable" && m.mp4,
  ) as TurntableMedia | undefined;
  const img = media.find((m) => m.type === "image")?.url ?? media[0]?.url;
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link className={styles.back} href="/#collection">
          ← The Collection
        </Link>
        <nav className={styles.crumbs}>
          <Link href="/">Lady Luxe</Link>
          <span aria-hidden>—</span>
          <span>{bundle.name}</span>
        </nav>

        <div className={styles.grid}>
          <div className={styles.stageColumn}>
            {tt && tt.mp4 ? (
              <TurntablePlayer
                mp4={tt.mp4}
                webm={tt.webm}
                poster={tt.poster ?? img}
                poses={tt.poses ?? []}
                alt={`${bundle.name} — 360° turntable`}
              />
            ) : (
              img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.hero} src={img} alt={bundle.name} />
              )
            )}
          </div>
          <div className={styles.infoColumn}>
            <p className={styles.brand}>Composed by the house</p>
            <h1 className={styles.name}>{bundle.name}</h1>
            <p className={styles.tag}>
              {bundle.pieces}-piece ensemble · numbered on release
            </p>
            <p className={styles.price}>
              ${bundle.price.toFixed(2)}
              <span className={styles.currency}> USD</span>
            </p>
            {bundle.story && <p className={styles.story}>{bundle.story}</p>}
            <div className={styles.archiveNote}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/imagery/certificate-ensemble.webp"
                alt="Ensemble certificate — numbered and entered in the house record"
                loading="lazy"
              />
              <span>Entered in the house record · numbered on release</span>
            </div>
            <p className={styles.fine}>
              Ensembles are composed by the house and entered in the archive. To request a piece,
              use the Concierge — the Circle sees each release first.
            </p>
            <div className="mt-4">
              <a
                href="https://formserver.ladyluxeclub.com/forms/lady_luxe"
                className="ll-btn ll-btn--solid"
                target="_blank"
                rel="noopener"
              >
                Request via Concierge
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function EnsemblePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <EnsembleLoader params={params} />
    </Suspense>
  );
}

async function EnsembleLoader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await getBundle(slug);
  if (!bundle) notFound();
  return <EnsembleView bundle={bundle} />;
}
