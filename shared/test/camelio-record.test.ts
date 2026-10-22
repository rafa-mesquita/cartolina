import { describe, expect, it } from 'vitest';
import { camelioMatchId, pendingCamelioRecord } from '../src/games/camelio/record';
import type { CamelioPlay, CamelioState } from '../src/games/camelio/types';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { C, playing } from './camelio-helpers';

const ANA = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO = { name: 'Caio', color: PLAYER_COLORS[2] };

/** Sala de Cama-Leão com Ana, Beto e Caio (p0…p2), já com o jogo no estado dado. */
function roomWith(game: CamelioState, names = ['Ana', 'Beto', 'Caio']): Room {
  let room = createRoom('CAMA', 0, 'camelio');
  names.forEach((name, i) => {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  });
  return { ...room, runStartedAt: 500, game };
}

const play = (p: Partial<CamelioPlay>): CamelioPlay => ({
  by: 'p0',
  from: 'deck',
  to: 'p0',
  card: C.verde1,
  outcome: 'none',
  color: 'verde',
  sum: 1,
  ...p,
});

/** Fim por meta: Beto (p1) chegou a 3 cores; Ana deu o 5 do vermelho pra ele. */
function over(): CamelioState {
  return playing(3, {
    phase: 'over',
    match: 2,
    turn: null,
    // Ana: amarelo pontuado (2 + 3) e o azul 1 na mesa; Caio: verde 1 + verde 3 na mesa, nada pontuado.
    table: { p0: [C.azul1], p1: [], p2: [C.verde1, C.verde3] },
    scored: { p0: [C.amarelo2, C.amarelo3], p1: [C.vermelho2, C.vermelho3, C.verde2, C.verde3, C.azul2, C.azul3], p2: [] },
    winners: ['p1'],
    endReason: 'target',
    log: [
      play({ by: 'p0', to: 'p1', from: 'open', card: C.vermelho3, color: 'vermelho', outcome: 'scored', sum: 5 }),
      play({ by: 'p2', to: 'p2', card: C.vermelho4, color: 'vermelho', outcome: 'bust', sum: 7 }),
      play({ by: 'p1', to: 'p0', card: C.amarelo3, color: 'amarelo', outcome: 'none', sum: 3 }),
    ],
  });
}

describe('registro da partida do Cama-Leão', () => {
  it('partida no meio ou no lobby não grava', () => {
    expect(pendingCamelioRecord(roomWith(playing(3)), 9000, 'x')).toBeNull();
    expect(pendingCamelioRecord(roomWith(playing(3, { phase: 'lobby', match: 0 })), 9000, 'x')).toBeNull();
  });

  it('partida terminada vira registro com pessoas, vencedores por posição, placar e jogadas', () => {
    const room = roomWith(over());
    const got = pendingCamelioRecord(room, 9000, 'id-1');
    expect(got?.key).toBe('CAMA-500-2');
    expect(got?.key).toBe(camelioMatchId(room, over()));
    const r = got!.record;
    expect(r).toMatchObject({ id: 'id-1', matchId: 'CAMA-500-2', roomCode: 'CAMA', playedAt: 9000, target: 3, endReason: 'target' });
    expect(r.players).toEqual([ANA, BETO, CAIO]);
    expect(r.winners).toEqual([1]);
    expect(r.final).toEqual([
      { colors: ['amarelo'], spheres: 1 },
      { colors: ['vermelho', 'verde', 'azul'], spheres: 0 },
      { colors: [], spheres: 4 },
    ]);
    expect(r.plays).toEqual([
      { by: 0, to: 1, from: 'open', card: { color: 'vermelho', spheres: 3, kind: 'normal' }, outcome: 'scored', sum: 5 },
      { by: 2, to: 2, from: 'deck', card: { color: 'vermelho', spheres: 4, kind: 'normal' }, outcome: 'bust', sum: 7 },
      { by: 1, to: 0, from: 'deck', card: { color: 'amarelo', spheres: 3, kind: 'normal' }, outcome: 'none', sum: 3 },
    ]);
  });

  it('esferas na mesa de uma cor já pontuada não contam no placar', () => {
    const amarelo2b = 9; // o segundo amarelo 2 do baralho (o primeiro já está pontuado)
    const s = { ...over(), table: { p0: [C.azul1, amarelo2b], p1: [], p2: [] } };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')!.record.final[0]).toEqual({ colors: ['amarelo'], spheres: 1 });
  });

  it('carta bicolor guarda o tipo e a cor de verdade', () => {
    const s = { ...over(), log: [play({ card: C.bicVermelho3, color: 'vermelho', sum: 3 })] };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')!.record.plays[0]!.card).toEqual({ color: 'vermelho', spheres: 3, kind: 'bicolor' });
  });

  it('vitória dividida guarda os dois', () => {
    const s = { ...over(), winners: ['p0', 'p2'], endReason: 'deck' as const };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')!.record).toMatchObject({ winners: [0, 2], endReason: 'deck' });
  });

  it('partida já gravada (mesma chave) não grava de novo; a próxima partida grava', () => {
    const room = { ...roomWith(over()), recordedRevealKey: 'CAMA-500-2' };
    expect(pendingCamelioRecord(room, 1, 'x')).toBeNull();
    expect(pendingCamelioRecord({ ...room, game: { ...over(), match: 3 } }, 1, 'x')?.key).toBe('CAMA-500-3');
  });

  it('partida com bot não grava', () => {
    expect(pendingCamelioRecord(roomWith(over(), ['Ana', 'Bot Zé', 'Caio']), 1, 'x')).toBeNull();
  });

  it('jogador sem assento: não grava (defesa)', () => {
    const s = { ...over(), players: ['p0', 'p1', 'p9'] };
    expect(pendingCamelioRecord(roomWith(s), 1, 'x')).toBeNull();
  });
});
