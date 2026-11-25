"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ttTrack } from "@/lib/tiktok";
import { gaEvent, gaItem } from "@/lib/ga";
import { fbqTrack, fbContent } from "@/lib/meta";

const CART_KEY = "lady-luxe-cart";

export type SizeOption = { sku: string; size: string };

/**
 * Adds the product to the persistent bag (localStorage) and routes to
 * /bag. Pricing is display-only here; the checkout Edge Function
 * re-prices server-side from the database. When the piece carries size
 * variants, a size is required — the chosen variant SKU rides in the
 * cart line and is what the AlterEgo upload fulfils.
 */
export default function AddToBag({
  sku,
  name,
  price,
  sizes,
  image,
}: {
  sku: string;
  name: string;
  price: number;
  sizes?: SizeOption[];
  image?: string;
}) {
  const router = useRouter();
  const [sizeSku, setSizeSku] = useState<string | null>(null);
  const needsSize = !!sizes?.length;
  const chosen = sizes?.find((s) => s.sku === sizeSku) ?? null;

  // Meta ViewContent fires when the piece is on the page
  useEffect(() => {
    import("@/lib/meta").then(({ fbqTrack }) =>
      fbqTrack("ViewContent", {
        content_ids: [sku],
        content_name: name,
        content_type: "product",
        value: price,
        currency: "USD",
      }),
    );
  }, [sku, name, price]);

  const add = () => {
    if (needsSize && !chosen) return;
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: {
        sku: string;
        variant?: string;
        size?: string;
        image?: string;
        name: string;
        price: number;
        quantity: number;
      }[] = raw ? JSON.parse(raw) : [];
      const existing = cart.find(
        (l) => l.sku === sku && l.variant === (chosen?.sku ?? ""),
      );
      if (existing) existing.quantity += 1;
      else
        cart.push({
          sku,
          variant: chosen?.sku,
          size: chosen?.size,
          name,
          price,
          image,
          quantity: 1,
        });
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify([
          {
            sku,
            variant: chosen?.sku,
            size: chosen?.size,
            name,
            price,
            image,
            quantity: 1,
          },
        ]),
      );
    }
    ttTrack("AddToCart", {
      content_id: sku,
      content_name: name,
      content_type: "product",
      quantity: 1,
      value: price,
      currency: "USD",
    });
    gaEvent("add_to_cart", {
      currency: "USD",
      value: price,
      items: [gaItem({ id: chosen?.sku ?? sku, name, quantity: 1, price })],
    });
    fbqTrack("AddToCart", {
      content_ids: [chosen?.sku ?? sku],
      content_name: name,
      content_type: "product",
      value: price,
      currency: "USD",
    });
    router.push("/bag");
  };

  return (
    <div className="add-to-bag-wrap">
      {needsSize && (
        <select
          className="add-to-bag-size"
          value={sizeSku ?? ""}
          onChange={(e) => setSizeSku(e.target.value || null)}
          aria-label="Choose size"
        >
          <option value="" disabled>
            Choose size
          </option>
          {sizes!.map((s) => (
            <option key={s.sku} value={s.sku}>
              {s.size}
            </option>
          ))}
        </select>
      )}
      <button
        className="add-to-bag"
        type="button"
        onClick={add}
        disabled={needsSize && !chosen}
      >
        {needsSize && !chosen ? "Choose a size" : "Add to bag"}
      </button>
    </div>
  );
}
