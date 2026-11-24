/**
 * TikTok Pixel event helper. The base pixel loads in app/layout.tsx
 * (Events Manager ID DC2EGKJC77U6OQMIG9SG); these calls no-op gracefully
 * when the pixel hasn't loaded (blocked, offline, prerender).
 */
export type TtqEvent =
  | "AddToCart"
  | "InitiateCheckout"
  | "PlaceAnOrder"
  | "CompletePayment";

export function ttTrack(event: TtqEvent, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const ttq = (
    window as unknown as {
      ttq?: { track?: (e: string, p?: Record<string, unknown>) => void };
    }
  ).ttq;
  ttq?.track?.(event, params);
}
