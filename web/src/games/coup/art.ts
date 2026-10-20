import { COUP_CHARACTERS, type CoupCharacter } from '@cartolina/shared';

const KNOWN: ReadonlySet<string> = new Set<string>(COUP_CHARACTERS);

/**
 * Arte do personagem em `web/public/coup/cartas/` (gerada no Flow por `npm run coup:cartas`), relativa à base do site.
 * O id vem do servidor e entra numa URL: só passam os 5 personagens (outro id é erro, não vira caminho).
 */
export function characterArtUrl(c: CoupCharacter): string {
  if (!KNOWN.has(c)) throw new RangeError(`personagem desconhecido: ${String(c)}`);
  return `${import.meta.env.BASE_URL}coup/cartas/${c}.webp`;
}

let preloaded = false;
/** Baixa as 5 artes uma vez (quando a mesa monta), pra a carta não aparecer vazia no primeiro momento/dúvida. */
export function preloadCharacterArt(): void {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const c of COUP_CHARACTERS) {
    const img = new Image();
    img.decoding = 'async';
    img.src = characterArtUrl(c);
  }
}
