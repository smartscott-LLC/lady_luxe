"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import styles from "./club.module.css";

type Member = {
  display_name: string | null;
  email: string | null;
  tier: string;
  marketing_consent: boolean;
};

const supabase = createClient();

/**
 * The LL Club — free membership.
 * Join with basic info + optional consent to promotional emails.
 * No card on file, ever.
 */
export default function ClubPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    consent: true,
  });
  const [member, setMember] = useState<Member | null>(null);
  const [orders, setOrders] = useState<
    { id: string; created_at: string; total: number; status: string }[]
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // session + member bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setMember(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const email = session.user.email ?? "";
      const m = await supabase
        .from("members")
        .select("display_name, email, tier, marketing_consent")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (m.data) setMember(m.data);
      else
        setMember({
          display_name:
            session.user.user_metadata?.display_name ?? email.split("@")[0],
          email,
          tier: "member",
          marketing_consent:
            session.user.user_metadata?.marketing_consent === true,
        });
      const o = await supabase
        .from("orders")
        .select("id, created_at, total, status")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(10);
      setOrders((o.data as any[]) ?? []);
    })();
  }, [session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            display_name: form.displayName || form.email.split("@")[0],
            marketing_consent: form.consent,
          },
        },
      });
      setBusy(false);
      if (error) return setErr(error.message);
      if (!data.session) {
        setMsg(
          "Welcome to the Club — check your email to confirm the address, then log in."
        );
      }
      // session (if email confirmation disabled) lands via onAuthStateChange
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      setBusy(false);
      if (error) return setErr(error.message);
      // session lands via onAuthStateChange
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const toggleConsent = async () => {
    if (!member) return;
    const next = !member.marketing_consent;
    setMember({ ...member, marketing_consent: next });
    await supabase
      .from("members")
      .update({ marketing_consent: next })
      .eq("user_id", session.user.id);
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.empty}>Opening the Club…</p>
      </main>
    );
  }

  // ===== MEMBER DASHBOARD =====
  if (session && session.user) {
    const email = session.user.email ?? "";
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <Link href="/" className={styles.back}>
            ← Back
          </Link>
          <div className={styles.bannerWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.banner}
              src="/brand/imagery/loungewear-header.webp"
              alt=""
            />
          </div>
          <img
            className={styles.crest}
            src="/brand/imagery/atelier-vip.webp"
            alt="Private Atelier — Lady Luxe, new collection preview"
          />
          <p className={styles.eyebrow}>The LL Club</p>
          <h1 className={styles.title}>
            Welcome{member?.display_name ? `, ${member.display_name}` : ""} ✦
          </h1>
          <p className={styles.sub}>
            {member?.tier === "member"
              ? "Member of the house — first refusal on numbered pieces lands here first."
              : ""}
          </p>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Your Membership</h2>
            <p className={styles.line}>
              <span>Email</span> <span>{email}</span>
            </p>
            <p className={styles.line}>
              <span>Newsletter consent</span>{" "}
              <button className={styles.consentBtn} onClick={toggleConsent}>
                {member?.marketing_consent
                  ? "Subscribed — you'll get the letters"
                  : "Not subscribed — click to join the list"}
              </button>
            </p>
            <p className={styles.line}>
              <span>No card on file</span> <span>✓</span>
            </p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Your Orders</h2>
            {orders.length === 0 ? (
              <p className={styles.line}>
                <span>No orders yet</span>{" "}
                <Link href="/" className={styles.link}>
                  Browse the collection
                </Link>
              </p>
            ) : (
              orders.map((o) => (
                <p key={o.id} className={styles.line}>
                  <span>
                    {o.created_at.slice(0, 10)} · {o.status}
                  </span>
                  <span>${Number(o.total).toFixed(2)}</span>
                </p>
              ))
            )}
          </div>

          <button className={styles.ghost} onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  // ===== JOIN / LOG IN =====
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.back}>
          ← Back
        </Link>
        <div className={styles.bannerWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.banner}
            src="/brand/imagery/loungewear-header.webp"
            alt=""
          />
        </div>
        <img
          className={styles.crest}
          src="/brand/imagery/atelier-vip.webp"
          alt="Private Atelier — Lady Luxe, new collection preview"
        />
        <p className={styles.eyebrow}>The LL Club</p>
        <h1 className={styles.title}>
          {mode === "signup" ? "Join the Club" : "Welcome back"}
        </h1>
        <p className={styles.sub}>
          Free to join · basic info · optional consent for our letters · no card
          on file, ever.
        </p>

        <div className={styles.card}>
          <div className={styles.tabs}>
            <button
              className={mode === "signup" ? styles.tabOn : styles.tab}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
            <button
              className={mode === "login" ? styles.tabOn : styles.tab}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
          </div>

          <form onSubmit={submit} className={styles.form}>
            {mode === "signup" && (
              <label className={styles.label}>
                Name
                <input
                  className={styles.input}
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="e.g. Vivienne Hart"
                  autoComplete="name"
                />
              </label>
            )}
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={6}
              />
            </label>

            {mode === "signup" && (
              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                />
                <span>
                  Send me promotional emails (optional) — the Private List
                  letters, new pieces and member pricing.
                </span>
              </label>
            )}

            {err && <p className={styles.error}>{err}</p>}
            {msg && <p className={styles.success}>{msg}</p>}

            <button className={styles.cta} disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "signup"
                  ? "Join the Club — free"
                  : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}


