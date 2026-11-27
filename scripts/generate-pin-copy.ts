/**
 * The Pinterest pin batch — three unique pins per piece of The Midnight
 * Collection, pulling the static photography and the "In Motion"
 * turntable previews alike.
 *
 * Boards rotate across the three targets. Copy is keyword-first,
 * policy-safe (lib/policy-safe rules inline here — the script runs
 * outside the Next tree), and every pin lands on the piece's own page.
 *
 * Run:  npx tsx scripts/generate-pin-copy.ts   (env: SUPABASE_URL,
 * SUPABASE_SECRET_KEY — `set -a && source .env && set +a` first)
 */

import { writeFileSync, mkdirSync } from "fs";

const BASE = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY ?? "";
const SITE = "https://www.ladyluxeclub.com";
const HDRS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const BOARDS = [
  "Bridal Trousseau & Wedding Night",
  "Luxury Silk & Satin Eveningwear",
  "Vintage Corsetry & Boudoir Inspiration",
];

const HOOKS = [
  {
    board: 0,
    title: (n: string) => `The Wedding Night Look — ${n} | Lady Luxe`,
    desc: (n: string, color: string) =>
      `Pinterest-perfect bridal trousseau: the ${color.toLowerCase()} ${n}, composed for the night the whole evening was written for. Satin, lace and a silhouette that reads couture — pin it to the trousseau board and open the piece when the date draws near. Dispatched plain and discreet from the UK.`,
  },
  {
    board: 1,
    title: (n: string) => `${n} — Luxury Silk & Satin Eveningwear`,
    desc: (n: string, color: string) =>
      `Luxury silk and satin eveningwear, cut for the midnight hours: the ${color.toLowerCase()} ${n}. In motion on the maison's turntable, worn like a gown rather than underwear. Eveningwear framing, duchesse satin finish, dispatched in discreet packaging.`,
  },
  {
    board: 2,
    title: (n: string) => `Vintage Corsetry & Boudoir Inspiration — ${n}`,
    desc: (n: string, color: string) =>
      `Vintage corsetry and boudoir inspiration, remade for today: the ${color.toLowerCase()} ${n} from The Midnight Collection. Vintage lace lines, a modern cut, and a turntable preview that shows the piece the way a mirror would. Boudoir inspiration for the discerning pinner.`,
  },
];

function sanitize(s: string): string {
  return s
    .replace(/\b(erotic|fetish|bdsm|bondage|kinky|slutty|sexy|naughty|seduction|seductive|seduces)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

async function rest<T>(path: string): Promise<T[]> {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: HDRS });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T[];
}

interface Media {
  type?: string;
  url?: string;
  mp4?: string;
}
interface Piece {
  sku: string;
  name: string;
  media: Media[] | null;
  story: string | null;
}

async function main() {
  // the collection: slug 'midnight'
  const cols = await rest<{ id: string; name: string }>(
    "collections?select=id,name&slug=eq.midnight",
  );
  if (!cols[0]) throw new Error("The Midnight Collection not found");
  const pieces = await rest<Piece>(
    `products?select=sku,name,media,story&collection_id=eq.${cols[0].id}&status=eq.live&order=retail_price.desc`,
  );
  console.log(`The Midnight Collection: ${pieces.length} live pieces`);

  const pins: Record<string, unknown>[] = [];
  for (const p of pieces) {
    const images = (p.media ?? []).filter((mm) => mm.type === "image" && mm.url).map((mm) => mm.url as string);
    const film = (p.media ?? []).find((mm) => mm.type === "turntable" && mm.mp4)?.mp4 ?? null;
    const color = (p.name.match(/(black|white|red|burgundy|claret|ivory|cream|navy|purple|lavender|pink|gold|blue)/i)?.[0] ?? "midnight").toLowerCase();
    const dest = `${SITE}/product/${p.sku}?from=pinterest`;

    HOOKS.forEach((hook, v) => {
      const assetUrl =
        v === 2 && film ? film : images[v % Math.max(1, images.length)] ?? images[0] ?? "";
      const assetType = assetUrl.endsWith(".mp4") ? "video" : "image";
      const seoDesc = sanitize(hook.desc(sanitize(p.name), color)).slice(0, 290);
      pins.push({
        piece: p.name,
        sku: p.sku,
        variation: v + 1,
        board_name: BOARDS[hook.board],
        title: sanitize(hook.title(sanitize(p.name))),
        seo_description: seoDesc,
        destination_url: dest,
        asset_url: assetUrl,
        asset_type: assetType,
      });
    });
  }

  mkdirSync("exports", { recursive: true });
  writeFileSync("exports/pinterest-pins.json", JSON.stringify(pins, null, 2), "utf-8");
  console.log(`exports/pinterest-pins.json — ${pins.length} pins (${pieces.length} pieces × 3)`);
  for (const p of pins.slice(0, 3)) {
    console.log(`  [${p.board_name}] ${p.title} → ${p.asset_type}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
