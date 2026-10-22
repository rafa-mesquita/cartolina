import { describe, expect, it } from 'vitest';
import type { CamelioMatchRecord, CamelioRecordPlay } from '../src/games/camelio/record';
import { summarizeCamelioHistory } from '../src/games/camelio/summary';
import { PLAYER_COLORS } from '../src/players';

const ANA = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO = { name: 'Caio', color: PLAYER_COLORS[2] };

const p = (by: number, to: number, outcome: CamelioRecordPlay['outcome']): CamelioRecordPlay => ({
  by,
  to,
  from: 'deck',
  card: { color: 'verde', spheres: 2, kind: 'normal' },
  outcome,
  sum: 5,
});

function match(i: number, players: CamelioMatchRecord['players'], winners: number[], plays: CamelioRecordPlay[] = []): CamelioMatchRecord {
  return {
    id: `m${i}`,
    matchId: `R-1-${i}`,
    roomCode: 'R',
    playedAt: 1000 + i,
    target: 3,
    endReason: 'target',
    players,
    winners,
    final: players.map(() => ({ colors: [], spheres: 0 })),
    plays,
  };
}

describe('estatísticas da galera do Cama-Leão', () => {
  it('sem partidas: galera vazia e nenhum título', () => {
    expect(summarizeCamelioHistory([])).toEqual({ galera: [], domador: null, sabotador: null, palhaco: null, papaiNoel: null });
  });

  it('galera: vitórias e partidas de todo mundo, por vitórias, depois menos partidas, depois nome', () => {
    const s = summarizeCamelioHistory([
      match(1, [ANA, BETO], [0]),
      match(2, [ANA, BETO, CAIO], [2]),
      match(3, [ANA, BETO], [0, 1]), // dividida: 1 pra cada
    ]);
    expect(s.galera).toEqual([
      { ...ANA, wins: 2, matches: 3 },
      { ...CAIO, wins: 1, matches: 1 },
      { ...BETO, wins: 1, matches: 3 },
    ]);
    expect(s.domador).toEqual({ holders: [ANA], count: 2 });
  });

  it('sabotador, palhaço e Papai Noel saem das jogadas', () => {
    const s = summarizeCamelioHistory([
      match(1, [ANA, BETO, CAIO], [1], [
        p(0, 1, 'bust'), // Ana sabota Beto
        p(0, 2, 'lost'), // Ana sabota Caio
        p(1, 1, 'bust'), // Beto palhaço
        p(2, 2, 'lost'), // Caio palhaço
        p(2, 2, 'bust'), // Caio palhaço de novo
        p(1, 0, 'scored'), // Beto Papai Noel
        p(0, 0, 'scored'), // fechar na própria mesa não é presente
        p(2, 0, 'none'),
      ]),
    ]);
    expect(s.sabotador).toEqual({ holders: [ANA], count: 2 });
    expect(s.palhaco).toEqual({ holders: [CAIO], count: 2 });
    expect(s.papaiNoel).toEqual({ holders: [BETO], count: 1 });
  });

  it('empate no título mostra todos, em ordem alfabética', () => {
    const s = summarizeCamelioHistory([match(1, [BETO, ANA], [0, 1], [p(0, 1, 'scored'), p(1, 0, 'scored')])]);
    expect(s.domador).toEqual({ holders: [ANA, BETO], count: 1 });
    expect(s.papaiNoel).toEqual({ holders: [ANA, BETO], count: 1 });
  });

  it('a cor é a da partida mais recente', () => {
    const anaNova = { name: 'Ana', color: PLAYER_COLORS[3] };
    const s = summarizeCamelioHistory([match(2, [anaNova, BETO], [0]), match(1, [ANA, BETO], [0])]);
    expect(s.galera[0]).toEqual({ ...anaNova, wins: 2, matches: 2 });
  });
});
