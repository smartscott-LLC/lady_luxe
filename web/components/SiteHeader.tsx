"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_ORDER, brandSlug } from "@/lib/brand";

type DrawerId = "intimates" | "brands" | "club";

const DRAWERS: { id: DrawerId; label: string; active: string[] }[] = [
  { id: "intimates", label: "Intimates", active: ["/featured", "/private-reserve"] },
  { id: "brands", label: "Brands", active: ["/brands"] },
  { id: "club", label: "The LL Club", active: ["/club"] },
];

const LINKS = [
  { href: "/maison", label: "Maison" },
  { href: "/blog", label: "Journal" },
  { href: "https://formserver.ladyluxeclub.com/forms/lady_luxe", label: "Contact", external: true },
  { href: "/bag", label: "Bag" },
];

const INTIMATES = [
  {
    href: "/featured",
    title: "Featured",
    copy: "The collection in motion — 360° films.",
    img: "/brand/imagery/square-ensemble.webp",
  },
  {
    href: "/private-reserve",
    title: "Private Reserve",
    copy: "Quiet pieces below the velvet rope — always available.",
    img: "/brand/imagery/seal-stamp.webp",
  },
  {
    href: "/ensembles",
    title: "Custom Combinations",
    copy: "Ensembles composed as one gesture — corset, stockings, gloves.",
    img: "/brand/imagery/corset-line-maroon.webp",
  },
];

const CLUB_ACTIONS = [
  { href: "/club", title: "Join the Club — free", copy: "A name and an email. That is the whole form." },
  { href: "/club", title: "Log in", copy: "Welcome back — your circle is where you left it." },
  { href: "/club", title: "Your membership", copy: "Orders, letters and consent, in one place." },
];

/**
 * Shared header on every page. Top-level sections (Intimates, Brands, The LL
 * Club) open a slide-out drawer instead of navigating; the rest are direct
 * links. Navbar collapse is React-managed (no jQuery — the kit's Bootstrap
 * collapse throws when it reads React's internal fiber properties as data
 * attributes). Concierge button kept for visual parity, pending destination.
 */

function DrawerContent({ id, onClose }: { id: DrawerId; onClose: () => void }) {
  if (id === "intimates") {
    return (
      <>
        <p className="ll-eyebrow mb-1">The Collection</p>
        <h2 className="ll-script ll-drawer-title">Intimates</h2>
        <div>
          {INTIMATES.map((e) => (
            <Link key={e.href + e.title} href={e.href} className="ll-drawer-entry" onClick={onClose}>
              <img src={e.img} alt="" loading="lazy" />
              <span>
                <span className="ll-drawer-entry-title">{e.title}</span>
                <span className="ll-drawer-entry-copy">{e.copy}</span>
              </span>
            </Link>
          ))}
          <a
            className="ll-drawer-entry"
            href="https://formserver.ladyluxeclub.com/forms/lady_luxe"
            target="_blank"
            rel="noopener"
            onClick={onClose}
          >
            <img src="/brand/imagery/lookbook-autumn.webp" alt="" loading="lazy" />
            <span>
              <span className="ll-drawer-entry-title">The Autumn Edit</span>
              <span className="ll-drawer-entry-copy">The lookbook — request it, and it arrives by email.</span>
            </span>
          </a>
        </div>
        <p className="ll-drawer-fine">
          Each piece is numbered on release and entered in the house record.
          When the number is gone, it&rsquo;s gone.
        </p>
      </>
    );
  }
  if (id === "brands") {
    return (
      <>
        <p className="ll-eyebrow mb-1">The Houses We Carry</p>
        <h2 className="ll-script ll-drawer-title">Brands</h2>
        <ul className="ll-drawer-brands">
          {BRAND_ORDER.map((b) => (
            <li key={b}>
              <Link href={`/brands?b=${brandSlug(b)}`} className="ll-drawer-brand" onClick={onClose}>
                {b}
              </Link>
            </li>
          ))}
        </ul>
        <p className="ll-drawer-fine">
          A considered edit of nine European houses — each one cut for the
          midnight hours.
        </p>
      </>
    );
  }
  return (
    <>
      <img className="ll-drawer-hero" src="/brand/imagery/portrait-archived.webp" alt="" loading="lazy" />
      <p className="ll-eyebrow mb-1">The LL Club</p>
      <h2 className="ll-script ll-drawer-title">The Circle</h2>
      <div>
        {CLUB_ACTIONS.map((a) => (
          <Link key={a.title} href={a.href} className="ll-drawer-entry" onClick={onClose}>
            <span>
              <span className="ll-drawer-entry-title">{a.title}</span>
              <span className="ll-drawer-entry-copy">{a.copy}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="ll-drawer-fine">
        No card on file, ever. The Private List — one letter a month,
        lifestyle, fashion notes, new releases &amp; member perks.
      </p>
    </>
  );
}

function NavDrawer({ drawer, onClose }: { drawer: DrawerId; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const label = DRAWERS.find((d) => d.id === drawer)?.label ?? "Navigation";
  return (
    <>
      <div className="ll-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="ll-drawer" role="dialog" aria-modal="true" aria-label={label}>
        <button className="ll-drawer-close" onClick={onClose} aria-label="Close navigation">
          <i className="fas fa-times" aria-hidden />
        </button>
        <DrawerContent id={drawer} onClose={onClose} />
      </aside>
    </>
  );
}

/** Presentational nav — pathname as a prop so a static fallback can render it. */
function HeaderNav({ pathname }: { pathname: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerId | null>(null);

  const closeMenu = () => setMenuOpen(false);
  const openDrawer = (id: DrawerId) => {
    closeMenu();
    setDrawer(id);
  };

  // route changes (back button etc.) close any open drawer
  useEffect(() => {
    setDrawer(null);
  }, [pathname]);

  return (
    <header className="header-global">
      <nav
        id="navbar-main"
        aria-label="Primary navigation"
        className={`navbar navbar-main navbar-expand-xl headroom navbar-light navbar-transparent${menuOpen ? " navbar-open" : ""}`}
      >
        <div className="container">
          <Link className="navbar-brand" href="/">
            <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
            <span className="ll-script ll-brand-word">Lady Luxe</span>
          </Link>
          <div
            className={`navbar-collapse collapse${menuOpen ? " show" : ""}`}
            id="navbar_global"
          >
            <div className="navbar-collapse-header">
              <div className="row">
                <div className="col-6 collapse-brand">
                  <Link href="/" className="navbar-brand" onClick={closeMenu}>
                    <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
                    <span className="ll-script">Lady Luxe</span>
                  </Link>
                </div>
                <div className="col-6 collapse-close">
                  <button
                    className="fas fa-times"
                    onClick={closeMenu}
                    aria-label="Toggle navigation"
                    style={{ background: "none", border: "none", color: "var(--ll-gold)", fontSize: "1.2rem", cursor: "pointer" }}
                  />
                </div>
              </div>
            </div>
            <ul className="navbar-nav navbar-nav-hover align-items-xl-center ml-xl-auto">
              {DRAWERS.map((d) => {
                const active = pathname !== null && d.active.includes(pathname);
                return (
                  <li className="nav-item" key={d.id}>
                    <button
                      className={`nav-link ll-nav-trigger${active ? " active" : ""}`}
                      onClick={() => openDrawer(d.id)}
                      aria-haspopup="true"
                      aria-expanded={drawer === d.id}
                    >
                      {d.label}
                      <i className="fas fa-angle-down ll-nav-caret" aria-hidden />
                    </button>
                  </li>
                );
              })}
              {LINKS.map((l) => {
                const active = pathname !== null && !l.external && pathname === l.href;
                const cls = `nav-link${active ? " active" : ""}`;
                return (
                  <li className="nav-item" key={l.href}>
                    {l.external ? (
                      <a className={cls} href={l.href} target="_blank" rel="noopener" onClick={closeMenu}>
                        {l.label}
                      </a>
                    ) : (
                      <Link className={cls} href={l.href} onClick={closeMenu}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                );
              })}
              <li className="nav-item d-xl-block ml-xl-4">
                <a
                  href="#"
                  className="btn btn-primary"
                  onClick={(e) => { e.preventDefault(); closeMenu(); }}
                >
                  <span className="mr-1"><i className="fas fa-feather-alt" /></span> Concierge
                </a>
              </li>
            </ul>
          </div>
          <button
            className="navbar-toggler ml-2"
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-controls="navbar_global"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
        </div>
      </nav>
      {drawer && <NavDrawer drawer={drawer} onClose={() => setDrawer(null)} />}
    </header>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  return <HeaderNav pathname={pathname} />;
}

/**
 * Prerender fallback for routes whose params aren't known at build time
 * (/ensemble/[slug], /product/[slug]). Cache Components: usePathname
 * suspends there, so the Suspense boundary in app/layout.tsx renders this
 * identical bar minus the active-link highlight, and the real header
 * streams in without layout shift.
 */
export function SiteHeaderFallback() {
  return <HeaderNav pathname={null} />;
}
