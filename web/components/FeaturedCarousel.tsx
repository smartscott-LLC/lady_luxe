"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./FeaturedCarousel.module.css";

export type FeaturedItem = {
  sku: string;
  name: string;
  price: number;
  poster: string | null;
  mp4: string;
  webm?: string;
};

/**
 * Featured carousel — 5-visible film row, center enlarged.
 * Auto-advances; hover pauses the sweep and plays the hovered film;
 * click goes to the product. Films are the 360° turntables.
 */
export default function FeaturedCarousel({ items }: { items: FeaturedItem[] }) {
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const count = items.length;

  // auto-advance every 3s while not hovering
  useEffect(() => {
    if (hovering !== null || count < 2) return;
    const t = setInterval(() => setActive((a) => (a + 1) % count), 3000);
    return () => clearInterval(t);
  }, [hovering, count]);

  const play = (i: number) => {
    setHovering(i);
    const v = videoRefs.current[i];
    if (v) v.play().catch(() => {});
  };

  const stop = (i: number) => {
    setHovering(null);
    const v = videoRefs.current[i];
    if (v) v.pause(); // pause, never reset
    // no delay after unhover: advance immediately, then the 3s cadence resumes
    setActive((a) => (a + 1) % count);
  };

  const offset = (i: number) => {
    let d = i - active;
    if (count > 2 && d > count / 2) d -= count;
    if (count > 2 && d < -count / 2) d += count;
    return d;
  };

  if (count === 0) return null;

  return (
    <div className={styles.stage}>
      <div className={styles.track}>
        {items.map((item, i) => {
          const d = offset(i);
          const dist = Math.abs(d);
          const cls = [
            styles.card,
            d === 0 ? styles.center : "",
            dist >= 1 ? styles.near : "",
            dist >= 2 ? styles.far : "",
            dist >= 3 ? styles.hidden : "",
          ].join(" ");
          return (
            <div
              key={item.sku}
              className={cls}
              style={{ ["--d" as string]: d }}
              onMouseEnter={() => play(i)}
              onMouseLeave={() => stop(i)}
            >
              <Link
                href={`/product/${item.sku}`}
                className={styles.cardLink}
                aria-label={`${item.name} — $${item.price.toFixed(2)}`}
              >
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className={styles.film}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={item.poster ?? undefined}
                >
                  <source src={item.mp4} type="video/mp4" />
                  {item.webm ? <source src={item.webm} type="video/webm" /> : null}
                </video>
                <span className={styles.label}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.price}>${item.price.toFixed(2)}</span>
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
