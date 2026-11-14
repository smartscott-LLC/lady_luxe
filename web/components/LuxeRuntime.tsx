"use client";

import Script from "next/script";
import { useLuxeBind } from "./useLuxeBind";

/**
 * Owns the Lady Luxe hover-video / marquee engine script and binds it to
 * the static shell (hero card, …) once this subtree has hydrated.
 *
 * Why no timer retries: streamed Suspense content (the collection marquee)
 * is inserted into the DOM before React hydrates it — a blind re-bind in
 * that window writes attributes React never rendered and trips hydration
 * warnings. The marquee binds itself via <LuxeMarquee /> inside its own
 * boundary instead.
 */
export default function LuxeRuntime() {
  useLuxeBind();
  return <Script src="/js/lady-luxe.js" strategy="afterInteractive" />;
}
