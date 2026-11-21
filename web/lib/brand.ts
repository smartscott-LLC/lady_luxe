// Shared brand mapping — single source of truth for supplier-SKU → brand label.
// AlterEgo supplier SKUs are brand-prefixed: BEAUTYNIGHT…, YES…, GRACYA…, etc.

export const BRAND_ORDER = [
  "Beauty Night",
  "YesX",
  "Gracya",
  "Irall",
  "Irall Erotic",
  "Provocative",
  "Shirley of Hollywood",
  "Roza",
  "Black Secret",
] as const;

const PREFIXES: [string, string][] = [
  ["BEAUTYNIGHT", "Beauty Night"],
  ["IRALLEROTIC", "Irall Erotic"],
  ["BLACKSECRET", "Black Secret"],
  ["SHIRLEYOFHOLLYWOOD", "Shirley of Hollywood"],
  ["PROVOCATIVE", "Provocative"],
  ["GRACYA", "Gracya"],
  ["IRALL", "Irall"],
  ["ROZA", "Roza"],
  ["YES", "YesX"],
];

export function brandFromSupplierSku(supplierSku: string): string {
  const sku = (supplierSku || "").toUpperCase();
  for (const [prefix, label] of PREFIXES) {
    if (sku.startsWith(prefix)) return label;
  }
  return "Lady Luxe";
}

/** URL slug for a brand: "Irall Erotic" → "irall-erotic" */
export function brandSlug(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Inverse of brandFromSupplierSku: brand label → AlterEgo supplier-SKU prefix. */
export function supplierPrefixForBrand(brand: string): string | null {
  for (const [prefix, label] of PREFIXES) {
    if (label === brand) return prefix;
  }
  return null;
}
