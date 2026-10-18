#!/usr/bin/env node
/**
 * Fotos do Retratim: lê p001…p100 (.jpg, .jpeg, .png ou .webp) de uma pasta, recorta no centro pra 4:3 exato e grava
 * em web/public/pictures/fotos/:
 *   pNNN.webp        1200×900 (zoom e revelação)
 *   pNNN-thumb.webp   480×360 (grade e galeria)
 * e reescreve web/src/games/pictures/photos-ready.ts com os ids importados.
 *
 * Uso: npm run pictures:fotos -- <pasta>
 *
 * O baralho (qual id é de qual tema) mora em shared/src/games/pictures/photos.ts; aqui só importa o nome do arquivo.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/pictures/fotos');
const READY = join(ROOT, 'web/src/games/pictures/photos-ready.ts');
/** Tamanho do baralho (PICTURES_DECK). */
const COUNT = 100;
// qualidade 75 + effort 6 na cheia: ~125 KB por foto (com 80 ia pra ~165 KB, e o granulado de celular não melhora)
const SIZES = [
  { suffix: '', width: 1200, height: 900, quality: 75 },
  { suffix: '-thumb', width: 480, height: 360, quality: 75 },
];
const EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const arg = process.argv[2];
if (!arg) {
  console.error('uso: npm run pictures:fotos -- <pasta com p001.jpg … p100.jpg>');
  process.exit(1);
}
const src = resolve(arg);
if (!existsSync(src) || !statSync(src).isDirectory()) {
  console.error(`não é uma pasta: ${src}`);
  process.exit(1);
}

// acha o arquivo de cada id (sem diferenciar maiúscula; .jpg antes de .png antes de .webp)
const files = new Map(readdirSync(src).map((f) => [f.toLowerCase(), f]));
const ids = Array.from({ length: COUNT }, (_, i) => `p${String(i + 1).padStart(3, '0')}`);
const found = ids.map((id) => {
  const name = EXTS.map((ext) => files.get(id + ext)).find(Boolean);
  return { id, file: name ? join(src, name) : null };
});
const missing = found.filter((f) => !f.file).map((f) => f.id);
if (missing.length === COUNT) {
  console.error(`nenhuma foto p001…p${COUNT} (${EXTS.join(', ')}) em ${src}`);
  process.exit(1);
}
if (missing.length) {
  console.error(`faltam ${missing.length} foto(s) em ${src}: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^p\d{3}(-thumb)?\.webp$/.test(f)) rmSync(join(OUT, f));

let bytes = 0;
for (const [i, { id, file }] of found.entries()) {
  for (const s of SIZES) {
    const out = join(OUT, `${id}${s.suffix}.webp`);
    // recorte central pra 4:3 exato (a saída do Flow é 1200×896: perde uns pixels nas laterais)
    const info = await sharp(file)
      .rotate()
      .resize(s.width, s.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: s.quality, effort: 6 })
      .toFile(out);
    bytes += info.size;
  }
  if ((i + 1) % 10 === 0) console.log(`${i + 1}/${COUNT}`);
}

writeFileSync(
  READY,
  `// Gerado por \`npm run pictures:fotos\` (scripts/pictures-fotos.mjs). Não editar à mão.\n` +
    `/** Ids que têm foto real em web/public/pictures/fotos/ (<id>.webp e <id>-thumb.webp). */\n` +
    `export const PICTURES_PHOTOS_READY: ReadonlySet<string> = new Set([\n` +
    ids.map((id) => `  '${id}',\n`).join('') +
    `]);\n`,
);
console.log(`${COUNT} fotos em web/public/pictures/fotos (${(bytes / 1024 / 1024).toFixed(1)} MB) · photos-ready.ts atualizado`);
