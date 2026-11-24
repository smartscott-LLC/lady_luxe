"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ttTrack } from "@/lib/tiktok";
import { gaEvent, gaItem } from "@/lib/ga";
import styles from "./checkout.module.css";

type CartLine = { sku: string; name: string; price: number; quantity: number };
type OrderResult = {
  order_id: string;
  total: number;
  duty: number;
  shipping: number;
  receipt_url?: string;
};

const CART_KEY = "lady-luxe-cart";
// Sandbox app ids (sandbox-sq0idb-…) need the sandbox SDK build; production
// app ids use the production build. Picking by prefix keeps both honest.
const SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const SQUARE_LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
const SQUARE_SDK_URL = SQUARE_APP_ID.startsWith("sandbox-")
  ? "https://sandbox.web.squarecdn.com/v1/square.js"
  : "https://web.squarecdn.com/v1/square.js";

declare global {
  interface Window {
    Square?: {
      payments: (
        appId: string,
        locationId: string,
      ) => Promise<{
        card: (opts?: Record<string, unknown>) => Promise<{
          attach: (el: Element | string) => Promise<void>;
          tokenize: () => Promise<{
            status: string;
            token?: string;
            errors?: unknown[];
          }>;
        }>;
      }>;
    };
  }
}

function loadSquareSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) return resolve();
    const existing = document.querySelector(`script[src="${SQUARE_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = SQUARE_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Square SDK failed to load"));
    document.head.appendChild(script);
  });
}

function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "card-loading" | "ready" | "submitting" | "paid" | "error"
  >("idle");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<{
    tokenize: () => Promise<{ status: string; token?: string; errors?: unknown[] }>;
  } | null>(null);
  const attachGenRef = useRef(0);

  useEffect(() => {
    const lines = readCart();
    setCart(lines);
    if (lines.length > 0) {
      const items = lines.map((l) =>
        gaItem({ id: l.sku, name: l.name, quantity: l.quantity, price: l.price }),
      );
      ttTrack("InitiateCheckout", {
        content_type: "product",
        quantity: lines.reduce((s, l) => s + l.quantity, 0),
        value: lines.reduce((s, l) => s + l.price * l.quantity, 0),
        currency: "USD",
      });
      gaEvent("begin_checkout", {
        currency: "USD",
        value: lines.reduce((s, l) => s + l.price * l.quantity, 0),
        items,
      });
    }
    setLoaded(true);
  }, []);

  // Flow gate: direct-URL visitors with an empty bag are guided back to
  // /bag instead of staring at a dead end. The paid confirmation is exempt —
  // the bag is empty by then. (The financial area itself is server-gated:
  // the Edge Function re-prices and requires a real Square token, so the
  // URL alone exposes nothing.)
  useEffect(() => {
    if (loaded && status !== "paid" && cart.length === 0) {
      router.replace("/bag");
    }
  }, [loaded, status, cart.length, router]);

  // Mount the Square card form only once the bag has items — an empty-bag
  // visit never spins up a card form at all.
  useEffect(() => {
    if (!loaded || cart.length === 0) return;
    // each effect run gets a generation; stale runs drop out after every
    // await, so StrictMode / remounts can never mount a second card form
    const gen = ++attachGenRef.current;
    let disposed = false;
    (async () => {
      try {
        setStatus((s) => (s === "idle" ? "card-loading" : s));
        await loadSquareSdk();
        if (gen !== attachGenRef.current) return;
        const payments = await window.Square!.payments(
          SQUARE_APP_ID,
          SQUARE_LOCATION_ID,
        );
        if (gen !== attachGenRef.current) return;
        const card = await payments.card({});
        if (gen !== attachGenRef.current) return;
        await card.attach("#card-container");
        if (gen !== attachGenRef.current || disposed) return;
        cardRef.current = card;
        setStatus("ready");
      } catch (err) {
        if (gen !== attachGenRef.current || disposed) return;
        setError(
          "Card form could not load. " +
            (SQUARE_APP_ID
              ? String(err)
              : "NEXT_PUBLIC_SQUARE_APP_ID / NEXT_PUBLIC_SQUARE_LOCATION_ID are not set in web/.env.local."),
        );
        setStatus("error");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [loaded, cart.length]);

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const shipping = subtotal >= 150 || subtotal === 0 ? 0 : 9.95;

  const setQty = (sku: string, quantity: number) => {
    const next = cart
      .map((l) => (l.sku === sku ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  };

  const submit = useCallback(async () => {
    setError(null);
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid email for the receipt.");
      return;
    }
    if (!cardRef.current) {
      setError("Card form is not ready yet.");
      return;
    }
    setStatus("submitting");
    try {
      const tokenize = await cardRef.current.tokenize();
      if (tokenize.status !== "OK" || !tokenize.token) {
        setStatus("ready");
        setError("Card could not be verified. Check the details and retry.");
        return;
      }
      const resp = await fetch(
        process.env.NEXT_PUBLIC_CHECKOUT_URL ??
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/checkout`,
        {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            paymentToken: tokenize.token,
            items: cart.map((l) => ({
              sku: l.sku,
              quantity: l.quantity,
            })),
          }),
        },
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Payment was not accepted.");
      setCart([]);
      localStorage.removeItem(CART_KEY);
      setResult(data);
      setStatus("paid");
      const items = cart.map((l) =>
        gaItem({ id: l.sku, name: l.name, quantity: l.quantity, price: l.price }),
      );
      ttTrack("PlaceAnOrder", {
        content_type: "product",
        quantity: cart.reduce((s, l) => s + l.quantity, 0),
        value: data.total,
        currency: "USD",
      });
      ttTrack("CompletePayment", {
        content_type: "product",
        value: data.total,
        currency: "USD",
      });
      gaEvent("purchase", {
        transaction_id: data.order_id,
        currency: "USD",
        value: data.total,
        items,
      });
    } catch (err) {
      setStatus("ready");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, [cart, email]);

  if (status === "paid" && result) {
    return (
      <main className={styles.page}>
        <div className={styles.done}>
          <h1>Thank you</h1>
          <p>
            Order <strong>{result.order_id.slice(0, 8)}</strong> is confirmed —
            ${result.total.toFixed(2)} charged. Duties ($
            {result.duty.toFixed(2)}) were prepaid by Lady Luxe.
          </p>
          {result.receipt_url && (
            <a href={result.receipt_url} target="_blank" rel="noreferrer">
              View your Square receipt
            </a>
          )}
          <p className={styles.fine}>
            Your order is forwarded to our atelier for fulfilment. Tracking
            follows by email.
          </p>
          <Link href="/" className={styles.continue}>
            Continue browsing
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Lady Luxe · Secure Checkout</p>
        <h1 className={styles.title}>Checkout</h1>

        {cart.length === 0 ? (
          <p className={styles.empty}>
            Your bag is empty.{" "}
            <Link href="/" className={styles.link}>
              Browse the collection
            </Link>
          </p>
        ) : (
          <div className={styles.grid}>
            <div className={styles.lines}>
              {cart.map((l) => (
                <div key={l.sku} className={styles.line}>
                  <div>
                    <p className={styles.lineName}>{l.name}</p>
                    <p className={styles.linePrice}>
                      ${l.price.toFixed(2)} × {l.quantity}
                    </p>
                  </div>
                  <div className={styles.qty}>
                    <button onClick={() => setQty(l.sku, l.quantity - 1)}>
                      −
                    </button>
                    <button onClick={() => setQty(l.sku, l.quantity + 1)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className={styles.totals}>
                <p>
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </p>
                <p>
                  <span>Shipping &amp; Handling</span>
                  <span>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
                </p>
                <p className={styles.duty}>
                  <span>Duties (prepaid by Lady Luxe)</span>
                  <span>collected at checkout</span>
                </p>
              </div>

              <div className={styles.arrives}>
                <img
                  src="/brand/imagery/packaging-box.webp"
                  alt="The Lady Luxe gift box — black box, garnet ribbon, house seal"
                  loading="lazy"
                />
                <img
                  src="/brand/imagery/packaging-bag.webp"
                  alt="The Lady Luxe carrying bag — corset emblem in gold"
                  loading="lazy"
                />
                <p>
                  Every order leaves the house like this — grosgrain ribbon,
                  the house seal, and gold-monogrammed tissue.
                </p>
              </div>
            </div>

            <div className={styles.panel}>
              <label className={styles.label}>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.email}
                  placeholder="you@example.com"
                />
              </label>
              <div id="card-container" className={styles.cardBox} />
              {error && <p className={styles.error}>{error}</p>}
              <button
                className={styles.pay}
                onClick={submit}
                disabled={status !== "ready"}
              >
                {status === "submitting"
                  ? "Processing…"
                  : status === "card-loading"
                    ? "Loading card form…"
                    : `Pay $${(subtotal + shipping).toFixed(2)}`}
              </button>
              <p className={styles.fine}>
                Duties &amp; import charges are prepaid by Lady Luxe — shown on
                your receipt, never re-billed.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
