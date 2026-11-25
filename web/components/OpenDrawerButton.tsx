"use client";

import type { ReactNode } from "react";

/**
 * A button that opens one of the header's nav drawers (Intimates, Brands,
 * The Circle) from anywhere on the page — the drawer state lives in the
 * SiteHeader, which listens for this event.
 */
export default function OpenDrawerButton({
  drawer,
  className,
  children,
}: {
  drawer: "intimates" | "brands" | "club";
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "top",
        lineHeight: "inherit",
      }}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("ll-open-drawer", { detail: { drawer } }),
        )
      }
    >
      {children}
    </button>
  );
}
