"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/featured", label: "Featured" },
  { href: "/maison", label: "Maison" },
  { href: "/private-reserve", label: "Private Reserve" },
  { href: "/brands", label: "Brands" },
  { href: "/blog", label: "Journal" },
  { href: "/club", label: "The LL Club" },
  { href: "https://formserver.ladyluxeclub.com/forms/lady_luxe", label: "Contact", external: true },
  { href: "/bag", label: "Bag" },
];

/**
 * Shared header on every page. Navbar collapse is React-managed (no jQuery
 * dependency — the kit's Bootstrap collapse throws when it reads React's
 * internal fiber properties as data attributes). Concierge button kept for
 * visual parity but disconnected (dangling) pending its final destination.
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="header-global">
      <nav
        id="navbar-main"
        aria-label="Primary navigation"
        className={`navbar navbar-main navbar-expand-xl headroom navbar-light navbar-transparent${menuOpen ? " navbar-open" : ""}`}
      >
        <div className="container position-relative">
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
              {LINKS.map((l) => {
                const active = !l.external && pathname === l.href;
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
    </header>
  );
}
