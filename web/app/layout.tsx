import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import LuxeRuntime from "@/components/LuxeRuntime";

export const metadata: Metadata = {
  title: "Lady Luxe — Maison de Couture",
  description:
    "A maison de couture for the midnight hours. Evening wear in garnet, amaranth and gold — cut, finished and archived by hand.",
  icons: {
    icon: [{ url: "/brand/favicon.ico" }, { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/brand/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Kit typography (Nunito fallback for un-themed kit components) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700&display=swap"
        />
        {/* Font Awesome (icons) — webfonts resolve relative to this path */}
        <link
          rel="stylesheet"
          href="/vendor/@fortawesome/fontawesome-free/css/all.min.css"
        />
        {/* Combined brand + kit stylesheet: neumorphism → brand → theme (bump v on brand edits) */}
        <link rel="stylesheet" href="/css/luxe-all.css?v=4" />
      </head>
      <body>
        {/* Shared navigation — every page carries the header and footer */}
        <SiteHeader />
        {children}
        <SiteFooter />
        {/* Kit vendor bundle — jQuery → Popper → Bootstrap → Headroom → kit init.
            The Lady Luxe engine is loaded by <LuxeRuntime /> (single owner). */}
        <Script src="/js/kit.bundle.js" strategy="afterInteractive" />
        <LuxeRuntime />
      </body>
    </html>
  );
}
