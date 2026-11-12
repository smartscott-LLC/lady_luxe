/**
 * Lady Luxe — upload intake payload (products/bundles with local media files)
 * Reads supabase/intake-payload.json, uploads media to buckets, upserts rows.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const payload = JSON.parse(readFileSync(new URL('intake-payload.json', import.meta.url), 'utf8'));

function mime(f) {
  if (f.endsWith('.png')) return 'image/png';
  if (f.endsWith('.webp')) return 'image/webp';
  if (f.endsWith('.mov')) return 'video/quicktime';
  if (f.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

async function uploadMedia(media, sku) {
  const out = [];
  for (const m of media) {
    const file = m.file;
    const buf = readFileSync(file);
    const ext = file.split('.').pop().toLowerCase();
    const bucket = m.type === 'video' ? 'videos' : 'images';
    const base = file.split('/').pop().replace(/\.[^.]+$/, '');
    const path = `${bucket === 'videos' ? 'films' : 'stills'}/${base}.${ext}`;
    const { error } = await admin.storage.from(bucket).upload(path, buf, {
      contentType: mime(file), upsert: true, cacheControl: '31536000',
    });
    if (error && !error.message.includes('The resource already exists')) throw error;
    out.push({
      type: m.type,
      url: `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
      angle: m.angle || undefined,
      alt: m.alt || sku,
    });
  }
  return out;
}

// products
const prodRows = [];
for (const p of payload.products) {
  const media = await uploadMedia(p.media, p.supplier_sku);
  prodRows.push({
    sku: p.sku, supplier_sku: p.supplier_sku, supplier: p.supplier || 'alterego',
    name: p.name, tag: p.tag || null,
    wholesale_cost: p.wholesale_cost ?? null, duty_rate: p.duty_rate ?? 0.087,
    price: p.price ?? null, status: 'live',
    media, story: p.story || null,
  });
  console.log(`  product ${p.sku} — media: ${media.length}`);
}
{
  const { error } = await admin.from('products').upsert(prodRows, { onConflict: 'sku' });
  if (error) throw error;
}
console.log(`products upserted: ${prodRows.length}`);

// bundles
const bundleRows = [];
const itemLinks = [];
for (const b of payload.bundles) {
  const media = await uploadMedia(b.media, b.sku.replace('LL-ENS-', ''));
  bundleRows.push({
    sku: b.sku, name: b.name, price: b.price ?? null,
    set_factor: b.set_factor ?? 0.94, live: !!b.live,
    media, story: b.story || null,
  });
  for (const sku of b.pieces) itemLinks.push({ bundle_sku: b.sku, product_sku: sku });
  console.log(`  bundle ${b.sku} — media: ${media.length}`);
}
{
  const { error } = await admin.from('bundles').upsert(bundleRows, { onConflict: 'sku' });
  if (error) throw error;
}

// link bundles ↔ products + collection
const { data: prods } = await admin.from('products').select('id,sku');
const { data: bunds } = await admin.from('bundles').select('id,sku');
const { data: cols } = await admin.from('collections').select('id,slug');
const prodId = Object.fromEntries(prods.map(p => [p.sku, p.id]));
const bundId = Object.fromEntries(bunds.map(b => [b.sku, b.id]));
const colId = Object.fromEntries(cols.map(c => [c.slug, c.id]));

const links = itemLinks
  .map(l => ({ bundle_id: bundId[l.bundle_sku], product_id: prodId[l.product_sku] }))
  .filter(l => l.bundle_id && l.product_id);
if (links.length) {
  const { error } = await admin.from('bundle_items').upsert(links, { onConflict: 'bundle_id,product_id' });
  if (error) throw error;
}
// assign collections where the product entry requested one
for (const p of payload.products) {
  const slug = p.collection;
  if (slug && colId[slug] && prodId[p.sku]) {
    await admin.from('products').update({ collection_id: colId[slug] }).eq('sku', p.sku);
  }
}
for (const b of payload.bundles) {
  const slug = b.collection;
  if (slug && colId[slug] && bundId[b.sku]) {
    await admin.from('bundles').update({ collection_id: colId[slug] }).eq('sku', b.sku);
  }
}
console.log(`bundle links: ${links.length} | collection assignments done`);
console.log('\nIntake complete.');
