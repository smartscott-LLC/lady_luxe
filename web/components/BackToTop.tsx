"use client";

import { useEffect, useState } from "react";

/**
 * Back-to-top — a quiet gold control that fades in after the first
 * screens of scrolling, on every page. Respects reduced motion.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <button
      className={`ll-back-top${visible ? " ll-back-top--on" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
    >
      ↑
    </button>
  );
}
