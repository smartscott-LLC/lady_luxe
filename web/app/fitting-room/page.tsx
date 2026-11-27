"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import styles from "./fitting-room.module.css";

// the canvas never renders on the server
const FittingAvatar = dynamic(() => import("@/components/fitting/FittingAvatar"), {
  ssr: false,
  loading: () => (
    <div className={styles.stageLoading}>Dressing the form…</div>
  ),
});

type Measurements = {
  bust: number;
  waist: number;
  hip: number;
  height: number;
  braSize?: string;
};

type RailGarment = {
  id: string;
  name: string;
  source_type: string;
  glb_url: string;
};

const DEFAULTS: Measurements = { bust: 34, waist: 26, hip: 36, height: 66 };

export default function FittingRoomPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [m, setM] = useState<Measurements>(DEFAULTS);
  const [token, setToken] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [rail, setRail] = useState<RailGarment[]>([]);
  const [worn, setWorn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        router.replace("/club");
        return;
      }
      setSignedIn(true);
      setToken(session.access_token);
      setEmail(session.user.email ?? "");
      // the member's book, read back
      try {
        const resp = await fetch("/api/fitting/measurements", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resp.ok) {
          const body = (await resp.json()) as { measurements: Partial<Measurements> };
          setM({ ...DEFAULTS, ...body.measurements } as Measurements);
        }
      } catch {
        // the defaults stand until the member sets their own
      }
      // the garment rail — what hangs in the room today
      try {
        const resp = await fetch("/api/fitting/garments");
        if (resp.ok) {
          const body = (await resp.json()) as { garments: RailGarment[] };
          setRail(body.garments);
        }
      } catch {
        // the rail stays empty rather than breaking the room
      }
      setReady(true);
    })();
  }, [router]);

  const save = useCallback(async () => {
    setSaveState("busy");
    try {
      const resp = await fetch("/api/fitting/measurements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(m),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [token, m]);

  if (!signedIn) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.empty}>Opening the fitting room…</p>
        </div>
      </main>
    );
  }

  const set = (k: keyof Measurements) => (v: number) =>
    setM((prev) => ({ ...prev, [k]: v }));

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The Concierge</p>
        <h1 className={styles.title}>The Fitting Room</h1>
        <p className={styles.sub}>
          Your private mannequin, {email ? email.split("@")[0] : ""} — proportions
          from your own measurements, wearing the house&rsquo;s signature looks.
          A presentation of style, prepared for you alone.
        </p>

        <div className={styles.grid}>
          <div className={styles.stage}>
            {ready && (
              <FittingAvatar
                m={m}
                mode="stand"
                garmentUrl={worn ? rail.find((g) => g.id === worn)?.glb_url ?? null : null}
              />
            )}
            <span className={styles.stageNote}>
              Drag to turn the room · scroll to step closer
            </span>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Your Measurements</h2>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Bust</span>
                <output>{m.bust}&Prime;</output>
              </div>
              <input
                className={styles.slider}
                type="range"
                min={28}
                max={52}
                step={0.5}
                value={m.bust}
                onChange={(e) => set("bust")(Number(e.target.value))}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Waist</span>
                <output>{m.waist}&Prime;</output>
              </div>
              <input
                className={styles.slider}
                type="range"
                min={20}
                max={48}
                step={0.5}
                value={m.waist}
                onChange={(e) => set("waist")(Number(e.target.value))}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Hips</span>
                <output>{m.hip}&Prime;</output>
              </div>
              <input
                className={styles.slider}
                type="range"
                min={30}
                max={60}
                step={0.5}
                value={m.hip}
                onChange={(e) => set("hip")(Number(e.target.value))}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Height</span>
                <output>{m.height}&Prime;</output>
              </div>
              <input
                className={styles.slider}
                type="range"
                min={54}
                max={76}
                step={0.5}
                value={m.height}
                onChange={(e) => set("height")(Number(e.target.value))}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span>Bra size, if you wish it on file</span>
              </div>
              <div className={styles.braRow}>
                <input
                  className={styles.braInput}
                  type="text"
                  placeholder="e.g. 34C"
                  value={m.braSize ?? ""}
                  onChange={(e) =>
                    setM((prev) => ({ ...prev, braSize: e.target.value }))
                  }
                  maxLength={10}
                />
              </div>
            </div>

            <button className={styles.save} onClick={save} disabled={saveState === "busy"}>
              {saveState === "busy"
                ? "Inking the book…"
                : saveState === "saved"
                  ? "Saved to your member file ✓"
                  : "Save to your member file"}
            </button>
            <p className={styles.msg}>
              {saveState === "error"
                ? "The book resisted — try once more, or write to info@ladyluxeclub.com."
                : ""}
            </p>

            <p className={styles.note}>
              These numbers dress your private mannequin and nothing else. They
              are never a promise of fit — the piece you receive should be
              chosen with your own knowledge of yourself. Source photos are
              never kept: the render is delivered, the original is not stored.
            </p>

            <p className={styles.comingSoon}>
              <strong>The Atelier Rail.</strong> Pieces that exist only on
              your mannequin — never sold, never repeated. Choose one and
              she wears it; choose none and she stands bare.
            </p>
            {rail.length > 0 && (
              <div className={styles.rail}>
                <button
                  className={`${styles.railItem} ${worn === null ? styles.railItemOn : ""}`}
                  onClick={() => setWorn(null)}
                >
                  Bare form
                </button>
                {rail.map((g) => (
                  <button
                    key={g.id}
                    className={`${styles.railItem} ${worn === g.id ? styles.railItemOn : ""}`}
                    onClick={() => setWorn(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            <Link href="/club" className={styles.back}>
              ← Back to the Club
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
