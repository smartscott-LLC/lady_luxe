import Link from "next/link";

export const metadata = {
  title: "The Maison — Lady Luxe",
  description:
    "A small house, on purpose. Elegance not extravagance, inclusive not exclusive — the disciplines and the standard behind Lady Luxe.",
};

const MOTTO =
  "Elegance not extravagance, inclusive not exclusive, and encourageable not incorrigible.";

const DISCIPLINES = [
  {
    title: "The Ensembles",
    href: "/ensembles",
    art: "/brand/imagery/corset-line-refined.webp",
    copy: "Corset, stockings, gloves — composed as one gesture. The house dresses the whole look, so you never have to assemble it. Each ensemble is styled from a single point of view, not assembled from a catalog.",
  },
  {
    title: "Numbered & Archived",
    href: "/ensembles",
    art: "/brand/imagery/seal-numbered.webp",
    copy: "Every ensemble is numbered on release and entered in the house record. When the number is gone, it's gone. The archive is the promise: what you buy is documented, what is documented is real.",
  },
  {
    title: "The Circle",
    href: "/club",
    art: "/brand/imagery/monogram-gold.webp",
    copy: "Members of the Circle see each release first — early access, private pricing, and first refusal on numbered pieces. Membership is free; the only requirement is a name and an email.",
  },
];

export default function MaisonPage() {
  return (
    <main className="section section-lg">
      <div className="container">
        <div className="text-center mb-5">
          <p className="ll-eyebrow mb-2">Est. MMXXV</p>
          <h1 className="ll-script" style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.8rem)" }}>
            The Maison
          </h1>
          <div className="ll-divider"><span /></div>
          <p className="ll-felipa" style={{ fontSize: "1.25rem", color: "var(--ll-gold-soft)", maxWidth: "46rem", margin: "0 auto" }}>
            {MOTTO}
          </p>
        </div>

        <div className="row justify-content-center mb-5">
          <div className="col-lg-8 text-center">
            <p className="lead" style={{ color: "var(--ll-cream-70)" }}>
              A small house, on purpose. We carry a considered edit of evening wear — garnet silk,
              duchesse satin, hand-embroidered gold — and we compose it into ensembles rather than
              selling pieces in isolation. Three disciplines govern the work:
            </p>
          </div>
        </div>

        <figure className="ll-maison-banner mb-5 ll-reveal">
          <img
            src="/brand/imagery/campaign-robe.webp"
            alt="The Lady Luxe campaign — white silk robe, garnet ribbon, morning light"
            loading="lazy"
          />
        </figure>

        <div className="row mb-5">
          {DISCIPLINES.map((card) => (
            <div className="col-md-4 mb-4 mb-md-0" key={card.title}>
              <Link href={card.href} className="ll-journal-card d-block h-100">
                <img className="ll-discipline-art" src={card.art} alt="" loading="lazy" />
                <h3 className="ll-felipa h5">{card.title}</h3>
                <p>{card.copy}</p>
              </Link>
            </div>
          ))}
        </div>

        {/* ===================== THE HOUSE EXPERIENCE ===================== */}
        <div className="row justify-content-center mb-4 ll-reveal">
          <div className="col-lg-8 text-center">
            <p className="ll-eyebrow mb-2">The Gift Presentation</p>
            <h2 className="ll-script" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)" }}>
              Cut, wrapped &amp; sealed
            </h2>
            <p className="lead" style={{ color: "var(--ll-cream-70)" }}>
              Our signature gift presentation — grosgrain ribbon, the house
              seal, tissue monogrammed in gold — is being prepared for the
              house, and will be offered as an addition to any order. Until
              then, every piece travels in its maker&rsquo;s own packaging,
              dressed just as carefully.
            </p>
          </div>
        </div>
        <div className="row justify-content-center mb-5 ll-reveal">
          <div className="col-md-5 mb-3 mb-md-0">
            <img
              className="ll-maison-duo"
              src="/brand/imagery/packaging-box.webp"
              alt="The Lady Luxe gift box — black box, garnet ribbon, house seal"
              loading="lazy"
            />
          </div>
          <div className="col-md-5">
            <img
              className="ll-maison-duo"
              src="/brand/imagery/packaging-bag.webp"
              alt="The Lady Luxe carrying bag — corset emblem in gold"
              loading="lazy"
            />
          </div>
        </div>

        {/* ===================== CORRESPONDENCE ===================== */}
        <div className="row justify-content-center mb-5 ll-reveal">
          <div className="col-lg-9">
            <div className="ll-maison-correspondence">
              <img
                src="/brand/imagery/stationery-flatlay.webp"
                alt="House correspondence — garnet card, sealed envelope, letterhead"
                loading="lazy"
              />
              <div>
                <p className="ll-eyebrow mb-1">Correspondence</p>
                <p className="ll-felipa" style={{ color: "var(--ll-cream-70)", fontSize: "1.02rem", lineHeight: 1.7, marginBottom: "1rem" }}>
                  Every reply is written by a person, on the house letterhead —
                  sealed, and sent within two working days.
                </p>
                <a
                  href="https://formserver.ladyluxeclub.com/forms/lady_luxe"
                  className="ll-btn"
                  target="_blank"
                  rel="noopener"
                >
                  Write to the House
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="row justify-content-center text-center">
          <div className="col-lg-8">
            <p className="ll-felipa" style={{ fontSize: "1.1rem", color: "var(--ll-cream-70)" }}>
              The house keeps a small floor by design — fewer rooms, each one lit.
            </p>
            <div className="mt-4">
              <Link href="/featured" className="ll-btn ll-btn--solid mr-3 mb-3 mb-md-0">
                See the Collection in Motion
              </Link>
              <Link href="/club" className="ll-btn mb-3 mb-md-0">
                Join the Circle
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
