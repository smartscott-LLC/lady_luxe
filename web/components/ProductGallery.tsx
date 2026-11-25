"use client";

import { useState } from "react";
import TurntablePlayer, { TurntableMedia } from "@/components/TurntablePlayer";
import styles from "../app/product/[slug]/product.module.css";

type MediaEntry = {
  type?: string;
  url?: string;
  mp4?: string;
  webm?: string;
  poster?: string;
  alt?: string;
};

/**
 * The product stage: the 360° film when the piece has one, plus every
 * still (front / back / side) as a switchable view — the ensemble pages
 * share this styling through the same module.
 */
export default function ProductGallery({
  media,
  name,
}: {
  media: MediaEntry[];
  name: string;
}) {
  const tt = media.find((m) => m.type === "turntable" && m.mp4) as
    | TurntableMedia
    | undefined;
  const images = media.filter((m) => m.type === "image" && m.url);
  const hasFilm = !!tt;
  const offset = hasFilm ? 1 : 0;
  const viewCount = (hasFilm ? 1 : 0) + images.length;
  const [active, setActive] = useState(0);

  const isFilm = hasFilm && active === 0;
  const imgIndex = active - offset;
  const current = images[imgIndex];

  return (
    <div>
      <div>
        {isFilm && tt ? (
          <TurntablePlayer
            mp4={tt.mp4!}
            webm={tt.webm}
            poster={tt.poster ?? images[0]?.url}
            poses={tt.poses ?? []}
            alt={`${name} — 360° turntable`}
          />
        ) : current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.hero} src={current.url} alt={current.alt ?? name} />
        ) : null}
      </div>

      {viewCount > 1 && (
        <div className={styles.thumbs}>
          {hasFilm && (
            <button
              className={`${styles.thumbBtn}${active === 0 ? ` ${styles.thumbOn}` : ""}`}
              onClick={() => setActive(0)}
              aria-label="Film — 360 degrees"
            >
              <video src={tt!.mp4} muted playsInline preload="none" poster={tt!.poster ?? images[0]?.url} />
            </button>
          )}
          {images.map((m, i) => (
            <button
              key={m.url}
              className={`${styles.thumbBtn}${active === i + offset ? ` ${styles.thumbOn}` : ""}`}
              onClick={() => setActive(i + offset)}
              aria-label={`View ${i + 1 - offset + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
