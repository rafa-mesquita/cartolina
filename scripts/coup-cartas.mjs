#!/usr/bin/env node
/**
 * Artes do Cúpi: recorta cada imagem no centro para 2:3 (a proporção da carta) e grava em WebP 600×900
 * como web/public/coup/cartas/<personagem>.webp (duke, assassin, captain, ambassador, contessa).
 *
 * Uso: npm run coup:cartas -- <pasta>   (a pasta tem duke.jpg, assassin.jpg, captain.jpg, ambassador.jpg e contessa.jpg;
 *                                        também aceita .png e .webp)
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/coup/cartas');
const CHARACTERS = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
const W = 600;
const H = 900;

const arg = process.argv[2];
if (!arg) {
  console.error('uso: npm run coup:cartas -- <pasta>');
  process.exit(1);
}
const src = resolve(arg);
const files = readdirSync(src).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const fileOf = (c) => files.find((f) => f.slice(0, -extname(f).length) === c);
const missing = CHARACTERS.filter((c) => !fileOf(c));
if (missing.length > 0) {
  console.error(`faltam imagens: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const c of CHARACTERS) {
  const file = join(src, fileOf(c));
  if (!existsSync(file)) throw new Error(`arquivo não existe: ${file}`);
  const img = sharp(file);
  const { width = 0, height = 0 } = await img.metadata();
  // recorte central para 2:3: corta as laterais (imagem mais larga) ou o topo/base (mais alta)
  const crop = width / height > W / H
    ? { width: Math.round((height * W) / H), height, left: Math.round((width - (height * W) / H) / 2), top: 0 }
    : { width, height: Math.round((width * H) / W), left: 0, top: Math.round((height - (width * H) / W) / 2) };
  await img.extract(crop).resize(W, H).webp({ quality: 78 }).toFile(join(OUT, `${c}.webp`));
  console.log(`${c}.webp`);
}
