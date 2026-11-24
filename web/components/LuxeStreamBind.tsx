"use client";

import { useLuxeBind } from "./useLuxeBind";

/**
 * Hydration sentinel for streamed dynamic sections that carry .ll-reveal
 * (the featured carousel, the journal teaser). Rendered INSIDE its
 * Suspense boundary, so its effect fires only after React has hydrated
 * that boundary — re-running the engine bind for content that arrived
 * after the shell's one-time bind. Without this, a slow cold connection
 * delivers the islands after LuxeRuntime's bind and their reveal
 * wrappers are never observed: the carousel renders at opacity 0 until
 * the next client navigation.
 */
export default function LuxeStreamBind() {
  useLuxeBind();
  return null;
}
