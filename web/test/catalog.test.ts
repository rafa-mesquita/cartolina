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

  it('Retratim (o Pictures) aparece na estante e já dá pra jogar', () => {
    const entry = catalogEntry('pictures');
    expect(entry?.name).toBe('Retratim');
    expect(entry?.players).toBe('3 a 6 pessoas');
    expect(entry?.playable).toBe(true);
    expect(entry?.hasHistory).toBe(false);
  });

  it('Tatubum (o Exploding Kittens) aparece na estante e dá pra jogar', () => {
    const entry = catalogEntry('kittens');
    expect(entry?.name).toBe('Tatubum');
    expect(entry?.players).toBe('2 a 8 pessoas');
    expect(entry?.playable).toBe(true);
    expect(entry?.hasHistory).toBe(true);
    expect(entry?.mobile).toBe(false);
  });

  it('Cúpi (o Coup) aparece na estante e já dá pra jogar, no computador e no celular', () => {
    const entry = catalogEntry('coup');
    expect(entry?.name).toBe('Cúpi');
    expect(entry?.players).toBe('2 a 6 pessoas');
    expect(entry?.playable).toBe(true);
    expect(entry?.mobile).toBe(true);
    expect(entry?.hasHistory).toBe(true);
  });

  it('DITU e Cúpi funcionam no celular; Diquisti e Retratim ainda não', () => {
    expect(catalogEntry('ito')?.mobile).toBe(true);
    expect(catalogEntry('coup')?.mobile).toBe(true);
    expect(catalogEntry('dixit')?.mobile).toBe(false);
    expect(catalogEntry('pictures')?.mobile).toBe(false);
  });
});
