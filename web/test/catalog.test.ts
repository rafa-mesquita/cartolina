import { GAMES, GAME_IDS } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { CATALOG, catalogEntry } from '../src/games/catalog';

describe('catálogo de jogos do site', () => {
  it('tem uma entrada por jogo do registro, na ordem do registro', () => {
    expect(CATALOG.map((g) => g.id)).toEqual([...GAME_IDS]);
  });

  it('o histórico segue o registro', () => {
    for (const g of CATALOG) expect(g.hasHistory).toBe(GAMES[g.id].recordsHistory);
  });

  it('DITU jogável; Diquisti (o Dixit) ainda não', () => {
    expect(catalogEntry('ito')?.name).toBe('DITU');
    expect(catalogEntry('ito')?.playable).toBe(true);
    expect(catalogEntry('dixit')?.name).toBe('Diquisti');
    expect(catalogEntry('dixit')?.playable).toBe(false);
    expect(catalogEntry('xyz')).toBeNull();
  });
});
