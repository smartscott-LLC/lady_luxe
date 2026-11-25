"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import styles from "./studio.module.css";

const ADMINS = ["ss.helixsphereai@gmail.com"];

type Sheet = {
  id: string;
  sheet_no: number;
  created_at: string;
  order_count: number;
  item_count: number;
  status: string;
  csv_content: string;
  emails: string[];
};

/**
 * The Studio — the owner's fulfilment desk. Generates the AlterEgo
 * cart-upload sheet from every paid order not yet exported, and keeps the
 * sheet history. Locked to the studio allowlist.
 */
export default function StudioPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const supabase = createClient();
  const allowed = email !== null && ADMINS.includes(email.toLowerCase());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? "");
      setLoading(false);
    });
  }, [supabase]);

  const loadSheets = useCallback(async () => {
    const { data } = await supabase
      .from("upload_sheets")
      .select("*")
      .order("sheet_no", { ascending: false })
      .limit(50);
    setSheets((data as Sheet[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (allowed) loadSheets();
  }, [allowed, loadSheets]);

  const download = (sheet: Sheet) => {
    const blob = new Blob([sheet.csv_content], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alterego-upload-${sheet.sheet_no}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/studio-export`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const text = await resp.text();
      if (!resp.ok) {
        setMsg("Export failed: " + text.slice(0, 120));
      } else {
        const blob = new Blob([text], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "alterego-upload.csv";
        a.click();
        URL.revokeObjectURL(a.href);
        setMsg("Sheet generated and downloaded.");
        await loadSheets();
      }
    } catch (e) {
      setMsg("Export failed: " + String(e).slice(0, 120));
    }
    setBusy(false);
  };

  const markSubmitted = async (id: string) => {
    await supabase.from("upload_sheets").update({ status: "submitted" }).eq("id", id);
    await loadSheets();
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.dim}>Opening the studio…</p>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <p className={styles.dim}>The studio is locked.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.back}>
          ← Back
        </Link>
        <p className={styles.eyebrow}>The Studio</p>
        <h1 className={styles.title}>Fulfilment Desk</h1>

        <button className={styles.cta} onClick={generate} disabled={busy}>
          {busy ? "Preparing…" : "Generate the Upload Sheet"}
        </button>
        {msg && <p className={styles.msg}>{msg}</p>}

        <h2 className={styles.h2}>Sheet History</h2>
        {(sheets ?? []).length === 0 ? (
          <p className={styles.dim}>No sheets yet — the first export starts the ledger.</p>
        ) : (
          <div className={styles.list}>
            {(sheets ?? []).map((s) => (
              <div key={s.id} className={styles.sheet}>
                <div>
                  <p className={styles.sheetNo}>Sheet #{s.sheet_no}</p>
                  <p className={styles.meta}>
                    {s.created_at.slice(0, 10)} · {s.order_count} order
                    {s.order_count === 1 ? "" : "s"} · {s.item_count} items ·{" "}
                    <span className={s.status === "submitted" ? styles.done : styles.dim}>
                      {s.status}
                    </span>
                  </p>
                  {s.emails?.length > 0 && (
                    <p className={styles.emails}>{s.emails.join(", ")}</p>
                  )}
                </div>
                <div className={styles.actions}>
                  <button className={styles.ghost} onClick={() => download(s)}>
                    Download CSV
                  </button>
                  {s.status !== "submitted" && (
                    <button
                      className={styles.ghost}
                      onClick={() => markSubmitted(s.id)}
                    >
                      Mark submitted
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
