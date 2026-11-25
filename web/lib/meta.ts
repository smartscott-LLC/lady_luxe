/**
 * Meta Pixel event helper (Pixel ID 2270741986825617, loaded in
 * app/layout.tsx). Safe no-op when the pixel hasn't loaded (blocked,
 * offline, prerender).
 */
export type FbqEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export function fbqTrack(event: FbqEvent, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (
    window as unknown as {
      fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    }
  ).fbq;
  if (typeof fbq === "function") fbq("track", event, params);
}

/** Meta contents array entry for commerce events. */
export function fbContent(item: { id: string; quantity: number }) {
  return { id: item.id, quantity: item.quantity };
}
