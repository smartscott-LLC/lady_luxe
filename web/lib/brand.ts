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
  ["SOH", "Shirley of Hollywood"],
  ["PROVOCATIVE", "Provocative"],
  ["PROPR", "Provocative"],
  ["GRACYA", "Gracya"],
  ["IRALL", "Irall"],
  ["ROZA", "Roza"],
  ["YES", "YesX"],
  ["ME", "Me Seduce"],
  ["CON", "Confidante"],
];

export function brandFromSupplierSku(supplierSku: string): string {
  const sku = (supplierSku || "").toUpperCase();
  if (IRALL_EROTIC_SKUS.has(sku)) return "Irall Erotic";
  for (const [prefix, label] of PREFIXES) {
    if (sku.startsWith(prefix)) return label;
  }
  return "Lady Luxe";
}

/** URL slug for a brand: "Irall Erotic" → "irall-erotic" */
export function brandSlug(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Irall Erotic pieces carry the plain IRALL supplier prefix (the supplier
// does not mark the line in the SKU), so the line's own SKUs are pinned here
// — from irall-erotic-inventory.json — to attribute them to the right house.
export const IRALL_EROTIC_SKUS = new Set([
  "IRALLBRISTOLSET-G",
  "IRALLCORASETBLACK-G",
  "IRALLHOSHIKOIDGOWNPINK-G",
  "IRALLJAYLA-G",
  "IRALLJOYSETBLACK-G",
  "IRALLJOYSETRED-G",
  "IRALLKASUMIIDGOWNBLUE-G",
  "IRALLKIRASET-G",
  "IRALLMIRABELLESET-G",
  "IRALLPHEOBESET-G",
  "IRALLRIOSETBLACK-G",
  "IRALLRIOSETRED-G",
  "IRALLSALMASET-G",
  "IRALLTIASET-G",
]);

/** Inverse of brandFromSupplierSku: brand label → AlterEgo supplier-SKU prefix. */
export function supplierPrefixForBrand(brand: string): string | null {
  for (const [prefix, label] of PREFIXES) {
    if (label === brand) return prefix;
  }
  return null;
}

/** Rest lookup for a brand: prefix like (most) or exact SKUs (Irall Erotic). */
export function brandSkuLookup(brand: string): {
  mode: "prefix" | "exact";
  values: string[];
} {
  if (brand === "Irall Erotic") {
    return { mode: "exact", values: [...IRALL_EROTIC_SKUS] };
  }
  const prefix = supplierPrefixForBrand(brand);
  return prefix ? { mode: "prefix", values: [prefix] } : { mode: "prefix", values: [brand.toUpperCase()] };
}
