import Link from "next/link";
import styles from "./privacy.module.css";

/**
 * The Privacy Policy — ported from the house's own template (the club
 * cheeky document) and rewritten to reflect THIS app: the Lady Luxe
 * storefront. Every line describes what actually happens here —
 * orders on Supabase, payments on Square, letters by Resend, the
 * three analytics pixels, the measurement book on the member record.
 */
export const metadata = {
  title: "Privacy Policy — Lady Luxe",
  description:
    "What the House knows, what it does not do, and how to have it erased — the Lady Luxe privacy policy in plain terms.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The House Rules</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.sub}>
          What the House knows, what it does with it, and what it will never
          do — in plain terms.
        </p>

        <p className={styles.note}>
          <strong>A living document</strong> — refined as the house grows.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What we collect</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>
                <strong>Account basics:</strong> email and password (via
                Supabase Auth), your display name if you choose one.
              </li>
              <li>
                <strong>Orders:</strong> the pieces ordered, the order total,
                and the shipping address you give us — so the parcel reaches
                you and the receipt is honest.
              </li>
              <li>
                <strong>The Private List:</strong> your email address, the
                list you joined from, and your consent choice.
              </li>
              <li>
                <strong>The Fitting Room:</strong> your measurements, kept on
                your member file. They dress your private mannequin and are
                visible to you alone.
              </li>
              <li>
                <strong>Usage basics:</strong> pages seen, pieces viewed,
                carts begun — through Meta Pixel, Google Analytics 4, Google
                Tag Manager and the TikTok pixel. These set cookies in your
                browser; your browser can refuse them.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What we do NOT do</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>
                We do <strong>not sell</strong> personal data. Not now, not
                ever.
              </li>
              <li>We do not share your details with advertisers.</li>
              <li>
                Card numbers never touch our servers — payments run entirely
                on Square&rsquo;s rails, and we see only the receipt and the
                last four digits.
              </li>
              <li>We do not train anything on your data.</li>
              <li>We do not message you on anyone&rsquo;s behalf but the house.</li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Why we collect it</h2>
          <div className={styles.text}>
            <p>
              To run the store (orders, payments, fulfilment), to deliver the
              letters you asked for (the Private List), to keep the doors
              open and the room safe (analytics, security), and to stay
              legal (financial records, refunds, duties).
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your rights</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>
                <strong>See it:</strong> request a copy of what we hold.
              </li>
              <li>
                <strong>Fix it:</strong> your consent choices and
                measurements live on the <Link href="/club">Club page</Link>.
              </li>
              <li>
                <strong>Stop the letters:</strong> every letter carries an
                unsubscribe link — one click, and it stops.
              </li>
              <li>
                <strong>Delete it:</strong> write to{" "}
                <a href="mailto:info@ladyluxeclub.com">info@ladyluxeclub.com</a>{" "}
                and your record is erased within thirty days.
              </li>
              <li>
                <strong>Complain:</strong> to us first, always — and you keep
                your rights under applicable law (e.g., GDPR/CCPA).
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Consent</h2>
          <div className={styles.text}>
            <p>
              The newsletter consent has its own checkbox at signup — separate,
              explicit, and reversible on the Club page at any time. You tick
              it; that&rsquo;s the whole transaction. Un-tick it and the
              letters, and the member discount that rides on them, stop.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Where you must be of age</h2>
          <div className={styles.text}>
            <p>
              The house is for adults. We do not knowingly collect details
              from anyone under eighteen; if one reaches us, it is removed on
              discovery.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>The houses we work with</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>Supabase — the database and storage under the maison</li>
              <li>Square — payment processing and receipts</li>
              <li>Resend — delivery of our letters and confirmations</li>
              <li>Meta, Google and TikTok — the analytics pixels described above</li>
            </ul>
          </div>
        </section>

        <p className={styles.text} style={{ marginTop: "2rem" }}>
          Questions about anything on this page —{" "}
          <a href="mailto:info@ladyluxeclub.com">info@ladyluxeclub.com</a>.
          The Lady Luxe house: 700 E 8th St., Unit 14E, Kansas City, MO
          64106, USA.
        </p>

        <Link href="/" className={styles.back}>
          ← Back to the maison
        </Link>
      </div>
    </main>
  );
}
