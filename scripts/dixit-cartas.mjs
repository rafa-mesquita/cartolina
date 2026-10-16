#!/usr/bin/env node
/**
 * Arte do Dixit: recorta cada imagem no centro para 2:3 (a proporção da carta), grava em WebP 600×900
 * como web/public/dixit/cards/d001.webp, d002.webp… e atualiza DIXIT_DECK_SIZE no shared.
 *
 * Uso:
 *   npm run dixit:cartas -- <pasta>          imagens da pasta, em ordem alfabética
 *   npm run dixit:cartas -- <lista.json>     [{ "file": "caminho.jpg", "tema": "baleia" }, …] na ordem das cartas
 *
 * Também grava web/public/dixit/cards/cartas.json (id → tema → arquivo de origem).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/dixit/cards');
const DECK = join(ROOT, 'shared/src/games/dixit/deck.ts');
const W = 600;
const H = 900;

const arg = process.argv[2];
if (!arg) {
  console.error('uso: npm run dixit:cartas -- <pasta | lista.json>');
  process.exit(1);
}
const src = resolve(arg);
const entries = statSync(src).isDirectory()
  ? readdirSync(src)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort()
      .map((f) => ({ file: join(src, f), tema: basename(f, extname(f)) }))
  : JSON.parse(readFileSync(src, 'utf8')).map((e) => ({ file: resolve(dirname(src), e.file), tema: e.tema ?? '' }));
if (entries.length === 0) {
  console.error('nenhuma imagem encontrada');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^d\d{3}\.webp$/.test(f)) rmSync(join(OUT, f));

const manifest = [];
for (const [i, e] of entries.entries()) {
  if (!existsSync(e.file)) throw new Error(`arquivo não existe: ${e.file}`);
  const id = `d${String(i + 1).padStart(3, '0')}`;
  const img = sharp(e.file);
  const { width = 0, height = 0 } = await img.metadata();
  // recorte central para 2:3: corta as laterais (imagem mais larga) ou o topo/base (mais alta)
  const crop = width / height > W / H
    ? { width: Math.round((height * W) / H), height, left: Math.round((width - (height * W) / H) / 2), top: 0 }
    : { width, height: Math.round((width * H) / W), left: 0, top: Math.round((height - (width * H) / W) / 2) };
  await img.extract(crop).resize(W, H).webp({ quality: 78 }).toFile(join(OUT, `${id}.webp`));
  manifest.push({ id, tema: e.tema, origem: basename(e.file) });
  if ((i + 1) % 10 === 0) console.log(`${i + 1}/${entries.length}`);
}
writeFileSync(join(OUT, 'cartas.json'), `[\n${manifest.map((m) => ' ' + JSON.stringify(m)).join(',\n')}\n]\n`);

const deck = readFileSync(DECK, 'utf8');
const next = deck.replace(/export const DIXIT_DECK_SIZE = \d+;/, `export const DIXIT_DECK_SIZE = ${entries.length};`);
if (next === deck && !deck.includes(`DIXIT_DECK_SIZE = ${entries.length};`)) throw new Error('não achei DIXIT_DECK_SIZE em deck.ts');
writeFileSync(DECK, next);
console.log(`${entries.length} cartas em web/public/dixit/cards · DIXIT_DECK_SIZE = ${entries.length}`);
