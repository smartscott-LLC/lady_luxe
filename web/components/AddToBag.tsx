"use client";

import { useRouter } from "next/navigation";

const CART_KEY = "lady-luxe-cart";

/**
 * Adds the product to the persistent bag (localStorage) and routes to
 * /checkout. Pricing is display-only here; the checkout Edge Function
 * re-prices server-side from the database.
 */
export default function AddToBag({
  sku,
  name,
  price,
}: {
  sku: string;
  name: string;
  price: number;
}) {
  const router = useRouter();

  const add = () => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: { sku: string; name: string; price: number; quantity: number }[] =
        raw ? JSON.parse(raw) : [];
      const existing = cart.find((l) => l.sku === sku);
      if (existing) existing.quantity += 1;
      else cart.push({ sku, name, price, quantity: 1 });
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify([{ sku, name, price, quantity: 1 }]),
      );
    }
    router.push("/bag");
  };

  return (
    <button className="add-to-bag" type="button" onClick={add}>
      Add to bag
    </button>
  );
}
