/**
 * GA4 event helper (Measurement ID G-Z5RTHM0XWR, loaded in app/layout.tsx).
 * Safe no-op when the tag hasn't loaded. GA4 naming + ecommerce params.
 */
export function gaEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
    .gtag;
  if (typeof gtag === "function") gtag("event", event, params);
}

/** GA4 items array entry for ecommerce events. */
export function gaItem(item: {
  id: string;
  name: string;
  quantity: number;
  price: number;
}) {
  return {
    item_id: item.id,
    item_name: item.name,
    quantity: item.quantity,
    price: item.price,
  };
}
