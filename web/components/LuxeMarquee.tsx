"use client";

import { useLuxeBind } from "./useLuxeBind";

/**
 * Hydration sentinel for streamed dynamic sections (the collection
 * marquee, marked data-ll-sentinel in page.tsx). Rendered INSIDE the
 * Suspense boundary it serves, so its effect can only fire once React
 * has hydrated that boundary. It then stamps <html data-ll-armed> —
 * the engine's green light to bind cards inside sentinel regions —
 * and binds. Until then, binds from the static shell (LuxeRuntime)
 * deliberately skip sentinel regions.
 */
export default function LuxeMarquee() {
  useLuxeBind({ arm: true });
  return null;
}
