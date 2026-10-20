import { camelioCard, type CamelioPlay } from '@cartolina/shared';

/**
 * Frase do letreiro pra uma jogada (spec §5.4). Porte de `prototipo/cama-leao/narrate.js`.
 * `nameOf(id)` dá o nome de quem aparece na frase; no site, "você" pra `view.you` e o nome do assento pros outros.
 */
export function narrate(last: CamelioPlay | null, nameOf: (id: string) => string): string {
  if (!last) return '';
  const card = camelioCard(last.card);
  const by = nameOf(last.by);
  const fromDeck = last.from === 'deck';
  const what = `${fromDeck ? 'o' : 'um'} ${card.spheres} ${card.color}${fromDeck ? ' do monte' : ''}`;
  const self = last.to === last.by;
  const head = self ? `${by} ficou com ${what}` : `${by} deu ${what} pra ${nameOf(last.to)}`;
  const who = self ? '' : `${nameOf(last.to)} `;
  switch (last.outcome) {
    case 'scored':
      return `${head}: ${who}fechou o ${card.color}!`;
    case 'bust':
      return `${head}: ${who}estourou!`;
    case 'lost':
      return `${head}: ${who}perdeu o ponto do ${card.color}!`;
    default:
      return `${head}.`;
  }
}
