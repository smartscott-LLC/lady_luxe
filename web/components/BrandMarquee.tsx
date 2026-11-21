"use client";

import Link from "next/link";
import styles from "./BrandMarquee.module.css";

/**
 * Seamless logo marquee — pauses on hover, every logo links to /brands.
 *
 * In Plasmic: drop logo images (or any content) into the `children` slot.
 * The component duplicates the row for an infinite loop; the loop is fully
 * CSS so it is smooth and cheap.
 */
export default function BrandMarquee({
  children,
  speed = 32,
  href = "/brands",
  reverse = false,
}: {
  children?: React.ReactNode;
  speed?: number;
  href?: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={styles.wrap}
      style={{ ["--marquee-speed" as string]: `${speed}s` }}
      data-ll-brand-marquee
    >
      <div className={`${styles.track} ${reverse ? styles.reverse : ""}`}>
        <div className={styles.group}>{children}</div>
        <div className={styles.group} aria-hidden="true">
          {children}
        </div>
      </div>
      <Link href={href} className={styles.overlayLink} aria-label="View all brands" />
    </div>
  );
}
