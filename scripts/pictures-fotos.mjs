#!/usr/bin/env node
/**
 * Fotos do Retratim: lê p001…p150 (.jpg, .jpeg, .png ou .webp) de uma pasta, recorta no centro pra 4:3 exato e grava
 * em web/public/pictures/fotos/:
 *   pNNN.webp        1200×900 (zoom e revelação)
 *   pNNN-thumb.webp   480×360 (grade e galeria)
 * e reescreve web/src/games/pictures/photos-ready.ts com os ids que têm foto.
 *
 * Uso: npm run pictures:fotos -- <pasta> [--from N]
 *   --from N  importa só de pN em diante (ex.: --from 101 pras fotos novas) e não mexe nas que já estão lá.
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
const COUNT = 150;
// qualidade 75 + effort 6 na cheia: ~125 KB por foto (com 80 ia pra ~165 KB, e o granulado de celular não melhora)
const SIZES = [
  { suffix: '', width: 1200, height: 900, quality: 75 },
  { suffix: '-thumb', width: 480, height: 360, quality: 75 },
];
const EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const arg = process.argv[2];
const fromAt = process.argv.indexOf('--from');
const FROM = fromAt > 0 ? Number(process.argv[fromAt + 1]) : 1;
if (!arg || !Number.isInteger(FROM) || FROM < 1 || FROM > COUNT) {
  console.error(`uso: npm run pictures:fotos -- <pasta com p001.jpg … p${COUNT}.jpg> [--from N]`);
  process.exit(1);
}
const src = resolve(arg);
if (!existsSync(src) || !statSync(src).isDirectory()) {
  console.error(`não é uma pasta: ${src}`);
  process.exit(1);
}

// acha o arquivo de cada id (sem diferenciar maiúscula; .jpg antes de .png antes de .webp)
const files = new Map(readdirSync(src).map((f) => [f.toLowerCase(), f]));
const idOf = (n) => `p${String(n).padStart(3, '0')}`;
const ids = Array.from({ length: COUNT - FROM + 1 }, (_, i) => idOf(FROM + i));
const found = ids.map((id) => {
  const name = EXTS.map((ext) => files.get(id + ext)).find(Boolean);
  return { id, file: name ? join(src, name) : null };
});
const missing = found.filter((f) => !f.file).map((f) => f.id);
if (missing.length === ids.length) {
  console.error(`nenhuma foto ${ids[0]}…${ids.at(-1)} (${EXTS.join(', ')}) em ${src}`);
  process.exit(1);
}
if (missing.length) {
  console.error(`faltam ${missing.length} foto(s) em ${src}: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
// sem --from é a importação completa (limpa tudo); com --from, só substitui as do intervalo
for (const f of readdirSync(OUT)) {
  const m = f.match(/^p(\d{3})(-thumb)?\.webp$/);
  if (m && Number(m[1]) >= FROM) rmSync(join(OUT, f));
}

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
  if ((i + 1) % 10 === 0) console.log(`${i + 1}/${ids.length}`);
}

const ready = Array.from({ length: COUNT }, (_, i) => idOf(i + 1)).filter(
  (id) => existsSync(join(OUT, `${id}.webp`)) && existsSync(join(OUT, `${id}-thumb.webp`)),
);
writeFileSync(
  READY,
  `// Gerado por \`npm run pictures:fotos\` (scripts/pictures-fotos.mjs). Não editar à mão.\n` +
    `/** Ids que têm foto real em web/public/pictures/fotos/ (<id>.webp e <id>-thumb.webp). */\n` +
    `export const PICTURES_PHOTOS_READY: ReadonlySet<string> = new Set([\n` +
    ready.map((id) => `  '${id}',\n`).join('') +
    `]);\n`,
);
console.log(
  `${ids.length} fotos (${ids[0]}…${ids.at(-1)}) em web/public/pictures/fotos (${(bytes / 1024 / 1024).toFixed(1)} MB)` +
    ` · photos-ready.ts com ${ready.length}`,
);
