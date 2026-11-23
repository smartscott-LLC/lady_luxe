"use client";

import { useEffect } from "react";

type LadyLuxe = {
  bindHoverVideos?: (root: Document) => void;
  bindReveals?: (root: Document) => void;
};

/**
 * Calls window.LadyLuxe.bindHoverVideos(document) as soon as the engine
 * script is available. Only ever runs from an effect — i.e. after the
 * surrounding tree has hydrated — so the engine's DOM writes can never
 * land on streamed-but-unhydrated HTML. Polls briefly in case the engine
 * file is still in flight.
 *
 * `arm` is for binders that live INSIDE a streamed sentinel region
 * (data-ll-sentinel): it stamps <html data-ll-armed> right before the
 * bind, telling the engine this region is now hydrated and safe to arm.
 */
export function useLuxeBind(opts?: { arm?: boolean }) {
  useEffect(() => {
    const w = window as unknown as { LadyLuxe?: LadyLuxe };
    const bind = (): boolean => {
      if (w.LadyLuxe?.bindHoverVideos) {
        if (opts?.arm) {
          document.documentElement.setAttribute("data-ll-armed", "");
        }
        w.LadyLuxe.bindHoverVideos(document);
        w.LadyLuxe.bindReveals?.(document);
        return true;
      }
      return false;
    };
    if (bind()) return;
    const timer = setInterval(() => {
      if (bind()) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, []);
}
