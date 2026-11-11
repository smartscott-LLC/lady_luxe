"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * "The Private List" — writes straight to public.subscribers.
 * Graceful when the schema hasn't been applied yet (shows a written-note
 * fallback instead of breaking the page).
 */
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setState("busy");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("subscribers")
        .insert({ email: email.trim(), source: "site" });

      if (error) {
        if (error.code === "23505") {
          setState("done");
          setMsg("You are already on the list — see you in the next letter.");
          return;
        }
        throw error;
      }
      setState("done");
      setMsg("Welcome to the Private List.");
    } catch {
      setState("error");
      setMsg(
        "The letters are being re-inked. Write to info@ladyluxeclub.com and we will add you by hand."
      );
    }
  }

  /* eslint-disable jsx-a11y/no-autofocus */
  return (
    <form className="ll-newsletter mt-4" onSubmit={onSubmit} noValidate>
      <div className="input-group">
        <input
          type="email"
          className="form-control"
          placeholder="Your email address"
          aria-label="Email address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "busy" || state === "done"}
        />
        <div className="input-group-append">
          <button className="btn btn-primary" type="submit" disabled={state === "busy"}>
            {state === "busy" ? "Inking…" : state === "done" ? "Joined ✓" : "Join"}
          </button>
        </div>
      </div>
      <small className="d-block mt-3" style={{ color: "rgba(237,231,199,.45)" }}>
        {state === "done" || state === "error"
          ? msg
          : "We keep your address to ourselves. Always."}
      </small>
    </form>
  );
}
