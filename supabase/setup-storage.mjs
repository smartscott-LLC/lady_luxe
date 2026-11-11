/**
 * Lady Luxe — Supabase storage provisioning (idempotent)
 * Creates public buckets and uploads all brand assets.
 * Run: node supabase/setup-storage.mjs   (reads ../.env)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const BUCKETS = [
  { name: 'brand',  public: true, files: 'brand',        exts: /\.(webp|png|ico|jpg)$/ },
  { name: 'fonts',  public: true, files: 'brand/fonts',  exts: /\.woff2$/ },
  { name: 'videos', public: true, files: 'brand/videos', exts: /\.mp4$/ },
  { name: 'images', public: true, files: null, exts: null },  // product imagery lands here
];

for (const b of BUCKETS) {
  const { error } = await admin.storage.createBucket(b.name, { public: b.public });
  if (error && !error.message.includes('already exists')) throw error;
  console.log(`bucket "${b.name}" ready (${b.public ? 'public' : 'private'})`);

  if (!b.files) continue;
  const files = readdirSync(b.files).filter(f => b.exts.test(f));
  for (const f of files) {
    const { error: upErr } = await admin.storage
      .from(b.name)
      .upload(f, readFileSync(`${b.files}/${f}`), {
        contentType: mimeFor(f),
        upsert: true,
        cacheControl: '31536000',   // immutable assets — 1y cache
      });
    if (upErr && !upErr.message.includes('The resource already exists')) throw upErr;
    console.log(`  ↑ ${b.name}/${f}`);
  }
}

function mimeFor(f) {
  if (f.endsWith('.webp')) return 'image/webp';
  if (f.endsWith('.png'))  return 'image/png';
  if (f.endsWith('.ico'))  return 'image/x-icon';
  if (f.endsWith('.jpg'))  return 'image/jpeg';
  if (f.endsWith('.woff2')) return 'font/woff2';
  if (f.endsWith('.mp4'))  return 'video/mp4';
  return 'application/octet-stream';
}

console.log(`\nDone. Public base: ${env.SUPABASE_URL}/storage/v1/object/public/`);
