import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import SiteHeader, { SiteHeaderFallback } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import LuxeRuntime from "@/components/LuxeRuntime";
import BackToTop from "@/components/BackToTop";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ladyluxeclub.com"),
  title: "Lady Luxe — Maison de Couture",
  description:
    "A maison de couture for the midnight hours. Evening wear in garnet, amaranth and gold — cut, finished and archived by hand.",
  openGraph: {
    type: "website",
    siteName: "Lady Luxe",
    title: "Lady Luxe — Maison de Couture",
    description:
      "Evening wear in garnet, amaranth and gold — composed, numbered and archived by the house.",
    locale: "en_US",
    url: "https://www.ladyluxeclub.com",
    images: [
      {
        url: "/brand/imagery/campaign-chaise.webp",
        width: 1536,
        height: 864,
        alt: "The Lady Luxe autumn campaign — garnet silk on the chaise",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lady Luxe — Maison de Couture",
    description:
      "Evening wear in garnet, amaranth and gold — composed, numbered and archived by the house.",
    images: ["/brand/imagery/campaign-chaise.webp"],
  },
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
        <link rel="stylesheet" href="/css/luxe-all.css?v=10" />
      </head>
      <body>
        {/* Google Tag Manager — no-JS fallback must sit right after <body> */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KFQSK3TH"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* Organization structured data — house identity for the index */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Lady Luxe",
              url: "https://www.ladyluxeclub.com",
              logo: "https://www.ladyluxeclub.com/brand/lady-luxe-emblem.webp",
              description:
                "A maison de couture for the midnight hours — evening wear composed, numbered and archived by the house.",
              slogan: "Elegance not extravagance",
              sameAs: [
                "https://instagram.com/ladyluxeclub",
                "https://pinterest.com/ladyluxeclub",
                "https://facebook.com/ladyluxeclub",
              ],
            }),
          }}
        />
        {/* Shared navigation — every page carries the header and footer.
            usePathname suspends on dynamic routes (params unknown at build),
            so the boundary prerenders the identical bar without the active
            highlight and the real header streams in. */}
        <Suspense fallback={<SiteHeaderFallback />}>
          <SiteHeader />
        </Suspense>
        {children}
        <SiteFooter />
        <BackToTop />
        {/* Kit vendor bundle — jQuery → Popper → Bootstrap → Headroom → kit init.
            The Lady Luxe engine is loaded by <LuxeRuntime /> (single owner). */}
        <Script src="/js/kit.bundle.js" strategy="afterInteractive" />
        {/* Google Tag Manager (GTM-KFQSK3TH) — canonical container loader */}
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KFQSK3TH');`}
        </Script>
        {/* GA4 (G-Z5RTHM0XWR) — stream loader + config */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-Z5RTHM0XWR"
          strategy="afterInteractive"
        />
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-Z5RTHM0XWR');`}
        </Script>
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
