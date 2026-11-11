#!/usr/bin/env node
/**
 * Artes do Mandacaru (geradas no Google Flow) → web/public/mandacaru/.
 *
 * Uso: npm run mandacaru:artes -- <pasta>
 * A pasta tem imagens com estes nomes (.jpg, .png, .webp ou .img); processa as que existirem:
 *   fundo                         → fundo.webp (a pintura atrás da mesa, 16:9)
 *   forest hills pasture fields mountains desert
 *                                 → terrenos/<id>.webp (quadradas, 512×512; o código recorta no hexágono)
 *   carcara casa vila feira       → pecas/<nome>.webp (fundo liso tirado, beirada suave)
 *   wood brick leather beans stone → recursos/<id>.webp (fundo liso tirado)
 *   vaqueiro mutirao chuva atravessador point-<n>
 *                                 → cordeis/<nome>.webp (fundo liso tirado)
 *
 * O recorte do fundo preenche a partir da borda tudo que é parecido com a cor da borda (mediana), sem furar
 * partes de dentro da mesma cor (como o Tatubum fez com as artes dele).
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/mandacaru');
const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'];
const PIECES = ['carcara', 'casa', 'vila', 'feira'];
const RESOURCES = ['wood', 'brick', 'leather', 'beans', 'stone'];
const CORDEIS = ['vaqueiro', 'mutirao', 'chuva', 'atravessador', 'point-1', 'point-2', 'point-3', 'point-4', 'point-5'];
const TOLERANCE = 34;

const arg = process.argv[2];
if (!arg) {
  console.error('uso: npm run mandacaru:artes -- <pasta>');
  process.exit(1);
}
const src = resolve(arg);
const files = readdirSync(src).filter((f) => /\.(png|jpe?g|webp|img)$/i.test(f));
const fileOf = (name) => {
  const f = files.find((x) => x.slice(0, -extname(x).length) === name);
  return f ? join(src, f) : null;
};

/** PNG com o fundo liso transparente e cortado rente à figura. */
async function cutout(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rgb = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(rgb(x), rgb((h - 1) * w + x));
  for (let y = 0; y < h; y++) edge.push(rgb(y * w), rgb(y * w + w - 1));
  const med = [0, 1, 2].map((c) => edge.map((p) => p[c]).sort((a, b) => a - b)[edge.length >> 1]);
  const dist = (i) => {
    const p = rgb(i);
    return Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]);
  };
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const i = stack.pop();
    if (bg[i] || dist(i) > TOLERANCE) continue;
    bg[i] = 1;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const x = i % w;
    const y = (i / w) | 0;
    const nearBg = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (nearBg) data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(((dist(i) - TOLERANCE * 0.6) / (TOLERANCE * 1.4)) * 255)));
  }
  return sharp(await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim().png().toBuffer());
}

async function piece(name, dir, size) {
  const file = fileOf(name);
  if (!file) return;
  mkdirSync(join(OUT, dir), { recursive: true });
  const img = await cutout(file);
  await img.resize(size, size, { fit: 'inside' }).webp({ quality: 85, alphaQuality: 90 }).toFile(join(OUT, dir, `${name}.webp`));
  console.log(`${dir}/${name}.webp`);
}

mkdirSync(OUT, { recursive: true });
const fundo = fileOf('fundo');
if (fundo) {
  await sharp(fundo).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(OUT, 'fundo.webp'));
  console.log('fundo.webp');
}
for (const t of TERRAINS) {
  const file = fileOf(t);
  if (!file) continue;
  mkdirSync(join(OUT, 'terrenos'), { recursive: true });
  await sharp(file).resize(512, 512, { fit: 'cover' }).webp({ quality: 80 }).toFile(join(OUT, 'terrenos', `${t}.webp`));
  console.log(`terrenos/${t}.webp`);
}
for (const p of PIECES) await piece(p, 'pecas', 384);
for (const r of RESOURCES) await piece(r, 'recursos', 256);
for (const c of CORDEIS) await piece(c, 'cordeis', 384);
