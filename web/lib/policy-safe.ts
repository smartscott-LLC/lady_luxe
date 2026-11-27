/**
 * The policy-safe voice — the house's copy through merchant and ad
 * filters without losing the maison.
 *
 * Automated filters (Merchant listings, Pinterest, marketplace
 * listings) aggressively block adult-flagged terms. The rule:
 * hard-flagged items are excluded outright; soft-flagged words are
 * stripped from copy; everything is framed around luxury eveningwear,
 * bridal trousseau, silk loungewear and corsetry.
 *
 * "Provocative" survives: it is the actual name of a house we carry,
 * as legitimate as any fragrance named Obsession.
 */

const HARD_FLAGGED = [
  "erotic",
  "fetish",
  "bdsm",
  "bondage",
  "kinky",
  "slutty",
];

const SOFT_FLAGGED = [
  "erotic",
  "fetish",
  "bdsm",
  "bondage",
  "kinky",
  "slutty",
  "sexy",
  "naughty",
  "seduce",
  "seduction",
  "seduces",
  "seductive",
];

const hardRe = new RegExp(`\\b(${HARD_FLAGGED.join("|")})\\b`, "i");
const softRe = new RegExp(`\\b(${SOFT_FLAGGED.join("|")})\\b`, "gi");

/** true when the text carries a term that gets a listing blocked */
export function containsFlagged(...parts: (string | null | undefined)[]): boolean {
  return hardRe.test(parts.filter(Boolean).join(" "));
}

/** strip soft-flagged words from copy and tidy the seams */
export function sanitizeCopy(text: string): string {
  return text
    .replace(softRe, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** the luxury occasion frame appended to thin descriptions */
export const OCCASION_TAGS =
  "Luxury eveningwear, bridal trousseau, duchesse satin, corsetry and silk loungewear — dispatched plain and discreet from the United Kingdom.";
