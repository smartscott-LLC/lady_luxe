import Link from "next/link";
import NewsletterForm from "@/components/NewsletterForm";

const DESKS = [
  { label: "Owner", email: "owner@ladyluxeclub.com" },
  { label: "Business", email: "business@ladyluxeclub.com" },
  { label: "Services", email: "services@ladyluxeclub.com" },
  { label: "General", email: "info@ladyluxeclub.com" },
];

const MOTTO =
  "Elegance not extravagance, inclusive not exclusive, and encourageable not incorrigible.";

/** Shared footer on every page. */
export default function SiteFooter() {
  return (
    <footer id="contact" className="ll-footer">
      <div className="container">
        <div className="row">
          <div className="col-lg-4 mb-5 mb-lg-0">
            <Link href="/" className="ll-footer-brand mb-4">
              <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
              <span className="ll-script ll-brand-word">Lady Luxe</span>
            </Link>
            <p>
              A maison de couture for the midnight hours. Evening wear in garnet, amaranth and
              gold — cut, finished and archived by hand.
            </p>
            <p className="ll-felipa ll-footer-motto" style={{ color: "var(--ll-gold-soft)", fontSize: ".95rem", lineHeight: 1.8 }}>
              {MOTTO}
            </p>
            <div className="mt-4">
              <a className="ll-social mr-2" href="https://instagram.com/ladyluxeclub" target="_blank" rel="noopener" aria-label="Instagram">
                <i className="fab fa-instagram" />
              </a>
              <a className="ll-social mr-2" href="https://pinterest.com/ladyluxeclub" target="_blank" rel="noopener" aria-label="Pinterest">
                <i className="fab fa-pinterest-p" />
              </a>
              <a className="ll-social" href="https://facebook.com/ladyluxeclub" target="_blank" rel="noopener" aria-label="Facebook">
                <i className="fab fa-facebook-f" />
              </a>
            </div>
          </div>
          <div className="col-lg-3 col-md-4 mb-5 mb-lg-0">
            <h3 className="ll-eyebrow mb-4">Correspondence</h3>
            <ul className="list-unstyled ll-contact ll-contact--page">
              {DESKS.map((desk) => (
                <li key={desk.email}>
                  <span>{desk.label}</span>
                  <a href={`mailto:${desk.email}`}>{desk.email}</a>
                </li>
              ))}
            </ul>
            <p className="mt-3" style={{ color: "rgba(237,231,199,.4)", fontSize: ".8rem" }}>
              Replies within two working days. Always by a person.
            </p>
          </div>
          <div className="col-lg-5 col-md-8">
            <h3 className="ll-eyebrow mb-4">The Private List</h3>
            <p style={{ color: "rgba(237,231,199,.65)", fontSize: ".92rem" }}>
              Collection previews and archive releases, before anyone else. One letter a month —
              lifestyle, fashion notes, new releases &amp; member perks.
            </p>
            <NewsletterForm />
            <p className="mt-3" style={{ fontSize: ".85rem" }}>
              <Link href="/blog" style={{ color: "var(--ll-gold-soft)" }}>
                From the Journal →
              </Link>
            </p>
          </div>
        </div>
        <hr />
        <div className="ll-footer-crest">
          <img src="/brand/imagery/crest-ivory.webp" alt="Lady Luxe crest" loading="lazy" />
        </div>
        <div className="ll-footer-bottom">
          <span>© 2026 Lady Luxe. All rights reserved.</span>
          <span>
            <Link href="/returns">Returns &amp; Delivery</Link>
            {" · "}
            <Link href="/maison">The Maison</Link>
            {" · "}
            <Link href="/club">The Club</Link>
          </span>
          <span>Cut for the midnight hours · Finished with care</span>
        </div>
      </div>
    </footer>
  );
}
