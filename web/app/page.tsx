import HeroVideo from "@/components/HeroVideo";
import LuxeRuntime from "@/components/LuxeRuntime";
import NewsletterForm from "@/components/NewsletterForm";

const COLLECTION = [
  {
    name: "Garnet Drift",
    tag: "Silk evening wrap",
    price: "$1,250",
    video: "/brand/videos/clip-1-garnet-drift.mp4",
  },
  {
    name: "Crimson Spiral",
    tag: "Duchesse satin gown",
    price: "$2,890",
    video: "/brand/videos/clip-2-crimson-spiral.mp4",
  },
  {
    name: "Noir Rose",
    tag: "Velvet opera coat",
    price: "$1,975",
    video: "/brand/videos/clip-3-noir-rose.mp4",
  },
  {
    name: "Gold Veil",
    tag: "Hand-embroidered veil",
    price: "$3,400",
    video: "/brand/videos/clip-4-gold-veil.mp4",
  },
  {
    name: "Midnight Peony",
    tag: "Crepe halter gown",
    price: "$2,150",
    still: "/brand/stills/midnight-peony.jpg",
  },
  {
    name: "Noir Amour",
    tag: "Draped velvet column",
    price: "$2,480",
    still: "/brand/stills/noir-amour.jpg",
  },
];

const DESKS = [
  { label: "Owner", email: "owner@ladyluxeclub.com" },
  { label: "Business", email: "business@ladyluxeclub.com" },
  { label: "Services", email: "services@ladyluxeclub.com" },
  { label: "General", email: "info@ladyluxeclub.com" },
];

const MAISON = [
  {
    title: "The Ensembles",
    copy: "Corset, stockings, gloves — composed as one gesture. The house dresses the whole look, so you never have to assemble it.",
  },
  {
    title: "Numbered & Archived",
    copy: "Every ensemble is numbered on release and entered in the house record. When the number is gone, it is gone.",
  },
  {
    title: "The Circle",
    copy: "Members of the Circle see each release first — early access, private pricing, and first refusal on numbered pieces.",
  },
];

export default function Home() {
  return (
    <>
      {/* ===================== NAVIGATION ===================== */}
      <header className="header-global">
        <nav
          id="navbar-main"
          aria-label="Primary navigation"
          className="navbar navbar-main navbar-expand-lg navbar-theme-primary headroom navbar-light navbar-transparent"
        >
          <div className="container position-relative">
            <a className="navbar-brand" href="/">
              <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
              <span className="ll-script ll-brand-word">Lady Luxe</span>
            </a>
            <div className="navbar-collapse collapse" id="navbar_global">
              <div className="navbar-collapse-header">
                <div className="row">
                  <div className="col-6 collapse-brand">
                    <a href="/" className="navbar-brand">
                      <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
                      <span className="ll-script">Lady Luxe</span>
                    </a>
                  </div>
                  <div className="col-6 collapse-close">
                    <a
                      href="#navbar_global"
                      className="fas fa-times"
                      data-toggle="collapse"
                      data-target="#navbar_global"
                      aria-controls="navbar_global"
                      aria-expanded="false"
                      title="close"
                      aria-label="Toggle navigation"
                    />
                  </div>
                </div>
              </div>
              <ul className="navbar-nav navbar-nav-hover align-items-lg-center ml-lg-auto">
                <li className="nav-item">
                  <a className="nav-link active" href="/">
                    Home
                  </a>
                </li>
                <li className="nav-item">
                  <a className="nav-link" href="#collection" data-scroll>
                    Collection
                  </a>
                </li>
                <li className="nav-item">
                  <a className="nav-link" href="#maison" data-scroll>
                    Maison
                  </a>
                </li>
                <li className="nav-item">
                  <a className="nav-link" href="#contact" data-scroll>
                    Contact
                  </a>
                </li>
                <li className="nav-item d-lg-block ml-lg-4">
                  <a href="#contact" className="btn btn-primary" data-scroll>
                    <span className="mr-1">
                      <i className="fas fa-feather-alt" />
                    </span>{" "}
                    Book a Fitting
                  </a>
                </li>
              </ul>
            </div>
            <button
              className="navbar-toggler ml-2"
              type="button"
              data-toggle="collapse"
              data-target="#navbar_global"
              aria-controls="navbar_global"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon" />
            </button>
          </div>
        </nav>
      </header>

      <main>
        {/* ===================== HERO ===================== */}
        <section className="ll-hero" aria-label="Lady Luxe — introduction">
          <div className="ll-hero-backdrop">
            <HeroVideo src="/brand/videos/hero-atelier-b.mp4" />
          </div>
          <div className="ll-hero-fade" />
          <div className="container position-relative" style={{ zIndex: 2 }}>
            <p className="ll-eyebrow mb-3">Maison de Couture</p>
            <h1 className="ll-script ll-display mb-2">Lady Luxe</h1>
            <p className="ll-felipa ll-sub mb-4">
              Evening wear cut from garnet silk, duchesse satin &amp; hand-embroidered gold.
            </p>
            <div className="ll-divider" style={{ maxWidth: "22rem", marginLeft: 0 }}>
              <span />
            </div>
            <p className="lead mb-5">
              Every piece is chosen, composed and numbered by the house — ensembles made for
              rooms with low light and long memories.
            </p>
            <a href="#collection" className="ll-btn ll-btn--solid mr-3 mb-3 mb-md-0" data-scroll>
              Explore the Collection
            </a>
            <a href="#maison" className="ll-btn mb-3 mb-md-0" data-scroll>
              The Maison
            </a>
          </div>
        </section>

        {/* ===================== COLLECTION MARQUEE ===================== */}
        <section
          id="collection"
          className="ll-marquee-section ll-marquee--collection"
          aria-label="Current collection"
        >
          <div className="container text-center mb-5">
            <p className="ll-eyebrow mb-3">Autumn — Winter</p>
            <h2 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
              The Midnight Collection
            </h2>
            <p className="ll-felipa mt-3" style={{ color: "var(--ll-cream-70)" }}>
              Each piece captured in motion. Hover a card to watch the cloth move.
            </p>
          </div>
          <div className="ll-marquee">
            <div className="ll-marquee__track">
              <div className="ll-marquee__group">
                {COLLECTION.map((piece) => (
                  <a key={piece.name} className="ll-video-card" href="#collection">
                    <div className="ll-video-card__media">
                      {"video" in piece && piece.video ? (
                        <video preload="none" muted playsInline loop src={piece.video} />
                      ) : (
                        <img src={piece.still} alt={`${piece.name} — ${piece.tag}`} loading="lazy" />
                      )}
                      <div className="ll-video-card__scrim" />
                    </div>
                    <span className="ll-video-card__hint">
                      {"video" in piece && piece.video ? "Hover to reveal" : "Hover to view"}
                    </span>
                    <div className="ll-video-card__info">
                      <div>
                        <p className="ll-video-card__name">{piece.name}</p>
                        <p className="ll-video-card__tag">{piece.tag}</p>
                      </div>
                      <span className="ll-video-card__price">{piece.price}</span>
                    </div>
                    {"video" in piece && piece.video ? (
                      <div className="ll-video-card__progress">
                        <i />
                      </div>
                    ) : null}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="container text-center mt-5">
            <a href="#contact" className="ll-btn" data-scroll>
              Request the Lookbook
            </a>
          </div>
        </section>

        {/* ===================== MAISON ===================== */}
        <section id="maison" className="section section-lg" aria-label="The maison">
          <div className="container">
            <div className="row justify-content-center text-center mb-5">
              <div className="col-lg-8">
                <p className="ll-eyebrow mb-3">Est. MMXXV</p>
                <h2 className="ll-script" style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>
                  The Maison
                </h2>
                <div className="ll-divider">
                  <span />
                </div>
                <p className="lead">A small house, on purpose. Three disciplines, one standard.</p>
              </div>
            </div>
            <div className="row">
              {MAISON.map((card) => (
                <div className="col-md-4 mb-4 mb-md-0" key={card.title}>
                  <article className="ll-journal-card">
                    <h3 className="ll-felipa h5">{card.title}</h3>
                    <p>{card.copy}</p>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ===================== FOOTER ===================== */}
      <footer id="contact" className="ll-footer">
        <div className="container">
          <div className="row">
            <div className="col-lg-4 mb-5 mb-lg-0">
              <a href="/" className="ll-footer-brand mb-4">
                <img className="ll-emblem" src="/brand/lady-luxe-emblem.webp" alt="Lady Luxe emblem" />
                <span className="ll-script ll-brand-word">Lady Luxe</span>
              </a>
              <p>
                A maison de couture for the midnight hours. Evening wear in garnet, amaranth and
                gold — cut, finished and archived by hand.
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
                Collection previews and archive releases, before anyone else. Two letters a
                season, no more.
              </p>
              <NewsletterForm />
            </div>
          </div>
          <hr />
          <div className="ll-footer-bottom">
            <span>© 2026 Lady Luxe. All rights reserved.</span>
            <span>Cut for the midnight hours · Finished with care</span>
          </div>
        </div>
      </footer>

      <LuxeRuntime />
    </>
  );
}
