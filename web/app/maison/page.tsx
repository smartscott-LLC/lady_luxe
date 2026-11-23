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
    copy: "Corset, stockings, gloves — composed as one gesture. The house dresses the whole look, so you never have to assemble it. Each ensemble is styled from a single point of view, not assembled from a catalog.",
  },
  {
    title: "Numbered & Archived",
    copy: "Every ensemble is numbered on release and entered in the house record. When the number is gone, it's gone. The archive is the promise: what you buy is documented, what is documented is real.",
  },
  {
    title: "The Circle",
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

        <div className="row mb-5">
          {DISCIPLINES.map((card) => (
            <div className="col-md-4 mb-4 mb-md-0" key={card.title}>
              <article className="ll-journal-card h-100">
                <h3 className="ll-felipa h5">{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            </div>
          ))}
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
