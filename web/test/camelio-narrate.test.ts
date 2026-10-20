import { camelioCard, type CamelioPlay } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { narrate } from '../src/games/camelio/narrate';

const NOMES: Record<string, string> = { p0: 'você', p1: 'Léo', p2: 'Bia', p3: 'Nina' };
const nameOf = (id: string) => NOMES[id] ?? id;

/** Jogada com `color` e `sum` coerentes com a carta (a narração só olha o essencial). */
const jogada = (p: Pick<CamelioPlay, 'by' | 'from' | 'to' | 'card' | 'outcome'>): CamelioPlay => ({
  ...p,
  color: camelioCard(p.card).color,
  sum: 0,
});

// ids do baralho: 22 = vermelho 3, 23 = vermelho 4, 20 = vermelho 2, 0 = verde 1, 47 = bicolor vermelho 3
describe('narração do letreiro', () => {
  it('as frases exatas do protótipo', () => {
    expect(narrate(jogada({ by: 'p1', from: 'open', to: 'p2', card: 22, outcome: 'bust' }), nameOf)).toBe('Léo deu um 3 vermelho pra Bia: Bia estourou!');
    expect(narrate(jogada({ by: 'p0', from: 'deck', to: 'p0', card: 20, outcome: 'scored' }), nameOf)).toBe(
      'você ficou com o 2 vermelho do monte: fechou o vermelho!',
    );
    expect(narrate(jogada({ by: 'p0', from: 'open', to: 'p3', card: 0, outcome: 'none' }), nameOf)).toBe('você deu um 1 verde pra Nina.');
    expect(narrate(jogada({ by: 'p2', from: 'deck', to: 'p0', card: 47, outcome: 'lost' }), nameOf)).toBe(
      'Bia deu o 3 vermelho do monte pra você: você perdeu o ponto do vermelho!',
    );
  });

  it('quando a pessoa fica com a própria carta, a frase não repete o nome', () => {
    expect(narrate(jogada({ by: 'p1', from: 'open', to: 'p1', card: 23, outcome: 'bust' }), nameOf)).toBe('Léo ficou com um 4 vermelho: estourou!');
  });

  it('sem jogada, a frase é vazia', () => {
    expect(narrate(null, nameOf)).toBe('');
  });
});
