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

  it('o texto de jogadores vem do registro', () => {
    for (const g of CATALOG) expect(g.players).toBe(`${GAMES[g.id].minPlayers} a ${GAMES[g.id].maxPlayers} pessoas`);
  });

  it('DITU e Diquisti (o Dixit) jogáveis; id desconhecido não existe', () => {
    expect(catalogEntry('ito')?.name).toBe('DITU');
    expect(catalogEntry('ito')?.playable).toBe(true);
    expect(catalogEntry('dixit')?.name).toBe('Diquisti');
    expect(catalogEntry('dixit')?.playable).toBe(true);
    expect(catalogEntry('xyz')).toBeNull();
  });

  it('DITU funciona no celular; Diquisti ainda não (etapa 2)', () => {
    expect(catalogEntry('ito')?.mobile).toBe(true);
    expect(catalogEntry('dixit')?.mobile).toBe(false);
  });
});
