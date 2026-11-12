"use client";

import Script from "next/script";
import { useEffect } from "react";

/**
 * Loads the Lady Luxe hover-video / marquee engine after hydration.
 * The engine binds on DOMContentLoaded, which has usually already fired
 * by the time Next hydrates — so we also bind explicitly once it's loaded.
 */
export default function LuxeRuntime() {
  useEffect(() => {
    const bind = () => {
      const w = window as unknown as {
        LadyLuxe?: { bindHoverVideos?: (root: Document) => void };
      };
      w.LadyLuxe?.bindHoverVideos?.(document);
    };
    bind();
    const t1 = setTimeout(bind, 300);
    const t2 = setTimeout(bind, 1200);
    const t3 = setTimeout(bind, 3000); // streamed Suspense content lands late
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return <Script src="/js/lady-luxe.js" strategy="afterInteractive" />;
}
