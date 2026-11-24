import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import SiteHeader, { SiteHeaderFallback } from "@/components/SiteHeader";
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
        <link rel="stylesheet" href="/css/luxe-all.css?v=6" />
      </head>
      <body>
        {/* Shared navigation — every page carries the header and footer.
            usePathname suspends on dynamic routes (params unknown at build),
            so the boundary prerenders the identical bar without the active
            highlight and the real header streams in. */}
        <Suspense fallback={<SiteHeaderFallback />}>
          <SiteHeader />
        </Suspense>
        {children}
        <SiteFooter />
        {/* Kit vendor bundle — jQuery → Popper → Bootstrap → Headroom → kit init.
            The Lady Luxe engine is loaded by <LuxeRuntime /> (single owner). */}
        <Script src="/js/kit.bundle.js" strategy="afterInteractive" />
        {/* TikTok Pixel — base code (Events Manager, "tiktok_pixel") */}
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=o||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('DC2EGKJC77U6OQMIG9SG');
ttq.page();
}(window, document, 'ttq');`}
        </Script>
        <LuxeRuntime />
      </body>
    </html>
  );
}
