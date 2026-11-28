import Link from "next/link";
import styles from "./privacy.module.css";

/**
 * The Privacy Policy — the maison's data conduct, in plain terms.
 * It matches what the house actually does: member records on our
 * database, payments by Square (card data never touches our servers),
 * letters delivered by Resend, and the three analytics pixels
 * (Meta, Google Analytics 4, TikTok) carried by the site.
 */
export const metadata = {
  title: "Privacy Policy — Lady Luxe",
  description:
    "What Lady Luxe collects, why, and how it is protected and removed — member records, the Private List, payments by Square, and the analytics that keep the house discoverable.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The House Rules</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.sub}>
          A house that keeps its clients&rsquo; confidences keeps their trust.
          This page says plainly what we collect, why, and how it is
          protected — and how to have it erased.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What we collect</h2>
          <div className={styles.text}>
            <ul className={styles.list}>
              <li>
                <strong>Orders:</strong> your email, the pieces ordered, the
                order total and the shipping address — so the parcel reaches
                you and the receipt is honest.
              </li>
              <li>
                <strong>The Club:</strong> your email, display name and
                consent choices. If you use the Fitting Room, your
                measurements are kept on your member file, for your eyes and
                your mannequin only.
              </li>
              <li>
                <strong>The Private List:</strong> your email address and the
                list you joined from.
              </li>
              <li>
                <strong>The room itself:</strong> anonymous analytics — pages
                seen, pieces viewed, carts begun — through Meta Pixel, Google
                Analytics 4, Google Tag Manager and the TikTok pixel. These
                set cookies in your browser; your browser can refuse them.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What we never collect</h2>
          <div className={styles.text}>
            <p>
              Card numbers never touch our servers. Payments run entirely on
              Square&rsquo;s rails — we see only the last four digits, the
              receipt and the payment reference. We do not sell, rent or
              trade your details, and we do not share them with advertisers
              beyond the analytics above.
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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your rights, your levers</h2>
          <div className={styles.text}>
            <p>
              Every letter carries an unsubscribe link — one click and the
              letters stop. Your consent choices live on the{" "}
              <Link href="/club">Club page</Link>, where you may change them
              at any time. To correct or erase anything else — your member
              record, your measurements, your order history — write to{" "}
              <a href="mailto:info@ladyluxeclub.com">info@ladyluxeclub.com</a>{" "}
              and we will act within thirty days, with a reply from a person.
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
          <h2 className={styles.sectionTitle}>Where the data lives</h2>
          <div className={styles.text}>
            <p>
              Member records, orders and subscriptions are kept on our
              managed database with access restricted to the house. Returns
              and remedies are described on the{" "}
              <Link href="/returns">Returns &amp; Delivery</Link> page.
            </p>
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
