import Link from "next/link";
import styles from "./returns.module.css";

/**
 * Returns & Delivery — the maison's terms in the house voice.
 * The operative rules: written notice inside 24 hours for damages or
 * shortages, pieces signed for as DAMAGED, no return without written
 * authorisation, unsealed packaging is non-returnable, and carrier
 * traces run their full course before a replacement or refund.
 */
export const metadata = {
  title: "Returns & Delivery — Lady Luxe",
  description:
    "How Lady Luxe handles returns, damages and delivery issues — written notice inside 24 hours, discreet parcels, carriers traced to resolution.",
};

export default function ReturnsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The House Rules</p>
        <h1 className={styles.title}>Returns &amp; Delivery</h1>
        <p className={styles.sub}>
          Every piece leaves the house within 24 hours, in plain, discreet
          packaging. If anything is less than perfect, this is how we make it
          right — quickly, quietly, and in writing.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>A piece not as it should be</h2>
          <div className={styles.text}>
            <p>
              In the rare circumstance that a piece arrives damaged or your
              order falls short, write to{" "}
              <a href="mailto:info@ladyluxeclub.com">info@ladyluxeclub.com</a>{" "}
              <strong>within 24 hours of receipt</strong> — your order number,
              the piece in question, and what went wrong. A photograph helps us
              act immediately.
            </p>
            <p>
              If a parcel arrives visibly damaged, please{" "}
              <strong>sign for it as “DAMAGED”</strong> — the carrier’s record
              is what protects your claim.
            </p>
            <p>
              Once we hear from you, we will reply with written instructions
              for what happens next.{" "}
              <strong>
                No piece may be returned without that written authorisation
              </strong>{" "}
              — it is how we keep the trail clean and your remedy fast.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Returns we cannot accept</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>Pieces that left the house in perfect condition and arrived as intended</li>
              <li>Styles that have been discontinued</li>
              <li>Pieces that have been worn, washed or otherwise made unsaleable</li>
              <li>Pieces whose original packaging has been unsealed or broken</li>
            </ul>
            <p style={{ marginTop: "1rem" }}>
              For hygiene, lingerie returns ask one thing of every piece: that
              it comes home as it left — unworn, unwashed, in its original
              unbroken packaging.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>When a parcel goes missing</h2>
          <div className={styles.text}>
            <p>
              In the unlikely event an order disappears in transit, write to us
              with <strong>your order number and tracking details</strong>. We
              open the trace with the carrier on your behalf and follow their
              procedures to resolution — a replacement or refund follows the
              moment the carrier’s trace concludes.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Refunds</h2>
          <div className={styles.text}>
            <p>
              Approved returns are refunded promptly to the original payment
              method once the piece is back in our hands and checked. Shipping
              charges are handled case by case — a fault in the piece is never
              your cost to carry.
            </p>
            <p>
              Approved returns travel to the returns desk:{" "}
              <strong>
                Lady Luxe, 700 E 8th St., Unit 14E, Kansas City, MO 64106, USA
              </strong>{" "}
              — the full instructions arrive with your written authorisation.
            </p>
          </div>
        </section>

        <div className={styles.rule} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Delivery, as promised</h2>
          <div className={styles.text}>
            <p>
              Orders leave the house the same day when placed before 1pm UK
              time, Monday to Friday — carried by Royal Mail, DPD or FedEx, in
              plain unmarked boxes. A tracking note follows the moment your
              piece is dispatched, and shipping is a flat $9.95 — complimentary
              above $150.
            </p>
            <p>
              Questions at any step —{" "}
              <a href="mailto:info@ladyluxeclub.com">info@ladyluxeclub.com</a>.
              A person answers, always.
            </p>
          </div>
        </section>

        <p className={styles.text} style={{ marginTop: "2rem" }}>
          Nothing in this page limits your statutory rights.
        </p>

        <Link href="/" className={styles.back}>
          ← Back to the maison
        </Link>
      </div>
    </main>
  );
}
