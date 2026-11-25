"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import styles from "./bag.module.css";

type CartLine = {
  sku: string;
  variant?: string;
  size?: string;
  image?: string;
  name: string;
  price: number;
  quantity: number;
};
type SizeOption = { sku: string; size: string };
type PricedLine = CartLine & { image?: string; duty_rate: number };

const CART_KEY = "lady-luxe-cart";
const RETAIL_MARKUP = 2.4;
const FREE_SHIPPING_OVER = 150;
const FLAT_SHIPPING = 9.95;

/**
 * The Bag — a standalone review-and-adjust step before checkout.
 * Quantities are stored locally; prices and duty are re-fetched from
 * Supabase so the displayed totals always match what checkout charges.
 */
export default function BagPage() {
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [priced, setPriced] = useState<PricedLine[] | null>(null);

  // hydrate the bag
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart: CartLine[] = raw ? JSON.parse(raw) : [];
      setLines(cart);
    } catch {
      setLines([]);
    }
  }, []);

  // when cart hydrates, re-price each line from the database + fetch a hero image
  useEffect(() => {
    if (!lines || lines.length === 0) return setPriced([]);
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const skus = lines.map((l) => l.sku);
      const { data } = await supabase
        .from("products")
        .select("sku, wholesale_cost, duty_rate, media, status")
        .in("sku", skus);
      const bySku = new Map((data ?? []).map((r: any) => [r.sku, r]));
      if (cancelled) return;
      const next = lines.map((l) => {
        const row = bySku.get(l.sku);
        const wholesale = row ? Number(row.wholesale_cost) : l.price;
        const media = Array.isArray(row?.media) ? row.media : [];
        const image = row
          ? media.find((m: any) => m.type === "image")?.url
          : l.image;
        return {
          ...l,
          price: Math.round(wholesale * RETAIL_MARKUP * 100) / 100,
          image,
          duty_rate: row ? Number(row.duty_rate) : 0.087,
        };
      });
      setPriced(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const update = (next: CartLine[]) => {
    setLines(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  };

  const setQty = (sku: string, variant: string | undefined, qty: number) => {
    if (!lines) return;
    const match = (l: CartLine) =>
      l.sku === sku && (l.variant ?? "") === (variant ?? "");
    update(
      lines
        .map((l) => (match(l) ? { ...l, quantity: Math.max(0, Math.min(10, qty)) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const display = priced ?? [];
  const subtotal = display.reduce((s, l) => s + l.price * l.quantity, 0);
  const duty = display.reduce((s, l) => s + l.price * l.quantity * l.duty_rate, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : FLAT_SHIPPING;
  const total = subtotal + duty + shipping;

  if (lines === null || priced === null) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.empty}>Opening your bag…</p>
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Your Bag</h1>
          <p className={styles.empty}>
            Nothing in the bag yet.{" "}
            <Link href="/" className={styles.link}>
              Browse the collection
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.back}>
          ← Continue Browsing
        </Link>
        <h1 className={styles.title}>Your Bag</h1>

        <div className={styles.grid}>
          <div className={styles.lines}>
            {display.map((l) => (
              <div key={l.sku} className={styles.line}>
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image} alt={l.name} className={styles.thumb} />
                ) : (
                  <div className={`${styles.thumb} ${styles.thumbEmpty}`} />
                )}
                <div className={styles.lineInfo}>
                  <p className={styles.lineName}>{l.name}</p>
                  {l.size && <p className={styles.lineSize}>Size {l.size}</p>}
                  <p className={styles.linePrice}>${l.price.toFixed(2)} USD</p>
                  <div className={styles.qty}>
                    <button onClick={() => setQty(l.sku, l.variant, l.quantity - 1)} aria-label="decrease">−</button>
                    <span className={styles.qtyNum}>{l.quantity}</span>
                    <button onClick={() => setQty(l.sku, l.variant, l.quantity + 1)} aria-label="increase">+</button>
                    <button
                      className={styles.remove}
                      onClick={() => setQty(l.sku, l.variant, 0)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className={styles.lineTotal}>${(l.price * l.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <aside className={styles.panel}>
            <h2 className={styles.panelTitle}>The Sum</h2>
            <div className={styles.rows}>
              <p><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></p>
              <p>
                <span>Shipping &amp; Handling</span>
                <span>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
              </p>
              <p className={styles.dutyRow}>
                <span>Duties (prepaid by Lady Luxe)</span>
                <span>${duty.toFixed(2)}</span>
              </p>
              <p className={styles.totalRow}>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </p>
            </div>
            <Link href="/checkout" className={styles.cta}>
              Proceed to Checkout →
            </Link>
            <Link href="/" className={styles.continue}>
              Continue browsing
            </Link>
            <p className={styles.fine}>
              Duties &amp; import charges are prepaid by Lady Luxe — shown here,
              charged once, never re-billed.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
