/**
 * Lady Luxe — mirror AlterEgo product imagery into our Supabase images bucket,
 * then repoint products/bundles media to our CDN URLs.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const catalog = JSON.parse(readFileSync(new URL('launch-catalog.json', import.meta.url), 'utf8'));

async function fetchImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (LadyLuxe catalog sync)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let ext = 'jpg';
  if (type.includes('png')) ext = 'png';
  else if (type.includes('webp')) ext = 'webp';
  else if (type.includes('gif')) ext = 'gif';
  return { buf, ext, type };
}

const jobs = [];
for (const p of catalog.products) jobs.push({ key: p.sku, url: p.image, name: p.name });
for (const b of catalog.bundles) jobs.push({ key: b.sku, url: b.image, name: b.name });

const cdnBySku = {};
let ok = 0, fail = [];

for (const job of jobs) {
  try {
    const { buf, ext, type } = await fetchImage(job.url);
    const path = `${job.key}.${ext}`;
    const { error } = await admin.storage.from('images').upload(path, buf, {
      contentType: type, upsert: true, cacheControl: '31536000',
    });
    if (error && !error.message.includes('The resource already exists')) throw error;
    cdnBySku[job.key] = `${env.SUPABASE_URL}/storage/v1/object/public/images/${path}`;
    ok++;
    console.log(`  ✓ ${path} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    fail.push(`${job.key}: ${e.message} [${job.url}]`);
    console.log(`  ✗ ${job.key}: ${e.message}`);
  }
}

// repoint media to our CDN — send parsed arrays, NOT JSON strings (jsonb columns)
for (const p of catalog.products) {
  if (cdnBySku[p.sku]) {
    const media = [{ type: 'image', url: cdnBySku[p.sku], alt: p.name }];
    await admin.from('products').update({ media }).eq('sku', p.sku);
  }
}
for (const b of catalog.bundles) {
  if (cdnBySku[b.sku]) {
    const media = [{ type: 'image', url: cdnBySku[b.sku], alt: b.name }];
    await admin.from('bundles').update({ media }).eq('sku', b.sku);
  }
}

// public storefront copy for bundles (no trade language)
const stories = {
  'LL-ENS-MIDNIGHT': 'Full lace ensemble in deepest black — push-up bra, brief, suspender belt and chemise, composed as one gesture.',
  'LL-ENS-GARNET': 'The Mehendi line in deep claret — push-up bra, brief, suspender belt and matching chemise.',
  'LL-ENS-NOIR': 'The Lagerta line in black — soft-cup bra, brief and suspender belt.',
  'LL-ENS-NOIRNO22': 'Sculpted black lace — push-up bra, brief and suspender belt.',
  'LL-ENS-PETAL': "Caryca's blush lace — soft-cup bra, brief and suspender belt in powder pink.",
};
for (const b of catalog.bundles) {
  if (stories[b.sku]) await admin.from('bundles').update({ story: stories[b.sku] }).eq('sku', b.sku);
}

console.log(`\nmirrored: ${ok}/${jobs.length} → images bucket` + (fail.length ? ` | FAILED: ${fail.length}` : ''));
if (fail.length) { console.log(fail.join('\n')); process.exitCode = 2; }
