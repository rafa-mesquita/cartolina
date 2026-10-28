import { describe, expect, it } from 'vitest';
import type { KittensMatchRecord, KittensPerson } from '../src/games/kittens/record';
import { KITTENS_RATE_MIN_MATCHES, KITTENS_STATS_MIN_MATCHES, KITTENS_TOP_PEOPLE, summarizeKittensHistory } from '../src/games/kittens/summary';
import { PLAYER_COLORS } from '../src/players';

const P = (name: string, i: number): KittensPerson => ({ name, color: PLAYER_COLORS[i]! });
const ANA = P('Ana', 0);
const BETO = P('Beto', 1);
const CAIO = P('Caio', 2);
const DUDA = P('Duda', 3);
const ELI = P('Eli', 4);

let seq = 0;
/** Partida: `players` na ordem dos assentos, o vencedor, quem saiu (na ordem) e os Nem vem! de cada um (padrão 0). */
function match(
  players: KittensPerson[],
  winner: KittensPerson,
  exits: KittensPerson[],
  nopes: Record<string, number> = {},
  playedAt = ++seq,
): KittensMatchRecord {
  return {
    id: `m${playedAt}`,
    matchId: `TATU-1-${playedAt}`,
    roomCode: 'TATU',
    playedAt,
    players,
    exits: exits.map((who) => ({ who, how: 'boom' })),
    winner,
    perPlayer: players.map((who) => ({ who, nopes: nopes[who.name] ?? 0, defuses: 0 })),
  };
}

const times = (n: number, make: () => KittensMatchRecord) => Array.from({ length: n }, make);

describe('estatísticas da galera do Tatubum', () => {
  it('pontos de partida: top 3, mínimo de 3 partidas (10 na % de vitórias)', () => {
    expect(KITTENS_TOP_PEOPLE).toBe(3);
    expect(KITTENS_STATS_MIN_MATCHES).toBe(3);
    expect(KITTENS_RATE_MIN_MATCHES).toBe(10);
  });

  it('sem partidas: quadros vazios', () => {
    expect(summarizeKittensHistory([])).toEqual({ bestRate: [], mostWins: [], firstOut: [], nopeKings: [] });
  });

  it('quem tem menos de 3 partidas só entra em "mais vitórias" (que não tem mínimo)', () => {
    const s = summarizeKittensHistory([match([ANA, BETO], ANA, [BETO], { Ana: 3 }), match([ANA, BETO], ANA, [BETO], { Ana: 1 })]);
    expect(s).toEqual({ bestRate: [], mostWins: [{ name: 'Ana', color: ANA.color, count: 2, matches: 2, rate: 1 }], firstOut: [], nopeKings: [] });
  });

  it('maior % de vitórias (só com 10 partidas ou mais) e mais vitórias no geral', () => {
    const ms = [
      ...times(6, () => match([ANA, BETO, DUDA], ANA, [BETO, DUDA])),
      ...times(3, () => match([ANA, BETO, DUDA], BETO, [ANA, DUDA])),
      match([ANA, BETO, DUDA], DUDA, [ANA, BETO]),
      ...times(9, () => match([CAIO, ELI], CAIO, [ELI])),
    ];
    // Ana 6 de 10, Beto 3 de 10, Duda 1 de 10; Caio 9 de 9 (fora da %: 9 partidas); Eli 0 de 9.
    const s = summarizeKittensHistory(ms);
    expect(s.bestRate).toEqual([
      { name: 'Ana', color: ANA.color, count: 6, matches: 10, rate: 0.6 },
      { name: 'Beto', color: BETO.color, count: 3, matches: 10, rate: 0.3 },
      { name: 'Duda', color: DUDA.color, count: 1, matches: 10, rate: 0.1 },
    ]);
    expect(s.mostWins.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Caio', 9, 9],
      ['Ana', 6, 10],
      ['Beto', 3, 10],
    ]);
  });

  it('mais vitórias: empate desempata pela % e depois pelo nome', () => {
    const ms = [
      ...times(3, () => match([ANA, BETO], ANA, [BETO])),
      ...times(3, () => match([ANA, BETO], BETO, [ANA])),
      ...times(3, () => match([CAIO, DUDA], CAIO, [DUDA])),
      ...times(3, () => match([CAIO, DUDA], DUDA, [CAIO])),
      ...times(2, () => match([ELI, ANA], ELI, [ANA])),
    ];
    // Ana 3/8, Beto 3/6 = 50%, Caio 3/6, Duda 3/6, Eli 2/2 (menos vitórias).
    const s = summarizeKittensHistory(ms);
    expect(s.mostWins.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Beto', 3, 6],
      ['Caio', 3, 6],
      ['Duda', 3, 6],
    ]);
  });

  it('quem explode primeiro: vezes que foi o 1º a sair (explodiu ou caiu); empate pela proporção, depois o nome', () => {
    const left = (m: KittensMatchRecord): KittensMatchRecord => ({ ...m, exits: m.exits.map((e, i) => (i === 0 ? { ...e, how: 'left' } : e)) });
    const ms = [
      match([ANA, BETO, CAIO], ANA, [BETO, CAIO]),
      left(match([ANA, BETO, CAIO], ANA, [BETO, CAIO])),
      match([ANA, BETO, CAIO], BETO, [CAIO, ANA]),
      match([ANA, BETO, CAIO, DUDA], ANA, [CAIO, DUDA, BETO]),
      match([ANA, BETO, CAIO, DUDA], CAIO, [DUDA, ANA, BETO]),
      match([ANA, BETO, CAIO, DUDA], CAIO, [DUDA, BETO, ANA]),
    ];
    // Beto: 2 vezes em 6; Caio: 2 em 6; Duda: 2 em 3; Ana: 0 (fora).
    const s = summarizeKittensHistory(ms);
    expect(s.firstOut.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Duda', 2, 3],
      ['Beto', 2, 6],
      ['Caio', 2, 6],
    ]);
  });

  it('rei do Nem vem!: média por partida; só os 3 primeiros; ninguém com zero', () => {
    const ms = times(3, () => match([ANA, BETO, CAIO, DUDA, ELI], ANA, [BETO, CAIO, DUDA, ELI], { Ana: 1, Beto: 3, Caio: 2, Duda: 2 }));
    ms.push(match([DUDA, ANA], DUDA, [ANA], { Duda: 4 }));
    const s = summarizeKittensHistory(ms);
    // Duda: 10 em 4 = 2,5; Beto: 9 em 3 = 3; Caio: 6 em 3 = 2; Ana: 3 em 4; Eli: 0 (fora).
    expect(s.nopeKings).toEqual([
      { name: 'Beto', color: BETO.color, count: 9, matches: 3, rate: 3 },
      { name: 'Duda', color: DUDA.color, count: 10, matches: 4, rate: 2.5 },
      { name: 'Caio', color: CAIO.color, count: 6, matches: 3, rate: 2 },
    ]);
  });

  it('a pessoa é o nome; o bichinho é o da partida mais recente (pela data, não pela ordem da lista)', () => {
    const anaNew = { ...ANA, color: PLAYER_COLORS[5]! };
    const ms = [match([anaNew, BETO], anaNew, [BETO], {}, 1000), ...times(3, () => match([ANA, BETO], ANA, [BETO]))];
    const s = summarizeKittensHistory(ms);
    expect(s.mostWins[0]).toEqual({ name: 'Ana', color: anaNew.color, count: 4, matches: 4, rate: 1 });
  });
});
