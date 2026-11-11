"use client";

import { useEffect, useRef } from "react";

/**
 * The hero backdrop film. React has a long-standing quirk where the `muted`
 * attribute isn't rendered as a DOM attribute, which silently blocks
 * autoplay — so we force it imperatively.
 */
export default function HeroVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {
      /* autoplay refusal: the fade overlay still carries the hero */
    });
  }, [src]);

  /* eslint-disable jsx-a11y/media-has-caption */
  return (
    <video
      ref={ref}
      autoPlay
      loop
      playsInline
      preload="auto"
      src={src}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
