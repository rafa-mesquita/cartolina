import { act, renderHook } from '@testing-library/react';
import type { DixitRoomView } from '@cartolina/shared';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { usePlays } from '../src/games/dixit/usePlays';
import type { ConnStatus, GameConn } from '../src/net/connection';
import { dixitView, othersOf, started, stateOf, told, voting } from './dixit-fixtures';

type Conn = GameConn & { sendAction: Mock<GameConn['sendAction']>; onError: Mock<GameConn['onError']> };
const conn = (): Conn => ({
  sendAction: vi.fn<GameConn['sendAction']>(),
  sendActivity: vi.fn(),
  sendCursor: vi.fn(),
  sendPing: vi.fn(),
  onFx: vi.fn(() => () => {}),
  onError: vi.fn<GameConn['onError']>(() => () => {}),
});

function setup(view: DixitRoomView) {
  const c = conn();
  const onError = vi.fn<(message: string) => void>();
  const hook = renderHook((p: { view: DixitRoomView; status: ConnStatus }) => usePlays({ view: p.view, conn: c, status: p.status, onError }), {
    initialProps: { view, status: 'joined' as ConnStatus },
  });
  const fail = (code: string, message = code) => act(() => c.onError.mock.calls[0]![0](code, message));
  return { c, onError, hook, fail };
}

describe('jogadas da mesa (usePlays)', () => {
  it('troca de fase zera as pendentes e o "mandado"', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const { hook } = setup(dixitView(room, p));
    act(() => hook.result.current.play(stateOf(room).hands[p]![0]!, null, ''));
    expect(hook.result.current.pending).toHaveLength(1);
    expect(hook.result.current.sent).toBe(true);
    expect(hook.result.current.canPlay).toBe(false);
    hook.rerender({ view: dixitView(voting(4), p), status: 'joined' });
    expect(hook.result.current.pending).toEqual([]);
    expect(hook.result.current.sent).toBe(false);
  });

  it('na partida de 3, a recusa depois do envio devolve as duas cartas; o eco do confirm não avisa de novo', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const [a, b] = stateOf(room).hands[p]! as [string, string];
    const { c, hook, fail, onError } = setup(dixitView(room, p));
    act(() => hook.result.current.play(a, { x: 1, y: 2 }, ''));
    expect(c.sendAction).not.toHaveBeenCalled();
    expect(hook.result.current.sent).toBe(false);
    act(() => hook.result.current.play(b, null, ''));
    expect(c.sendAction.mock.calls.map((x) => x[0])).toEqual([{ type: 'submit', cardIds: [a, b] }, { type: 'confirm' }]);
    expect(hook.result.current.away).toEqual([a, b]);
    fail('unknown_card', 'carta?');
    fail('nothing_chosen', 'escolha antes');
    expect(hook.result.current.pending).toEqual([]);
    expect(hook.result.current.sent).toBe(false);
    expect(hook.result.current.canPlay).toBe(true);
    expect(onError.mock.calls).toEqual([['carta?']]);
    // a próxima recusa (de outra coisa) avisa normalmente
    fail('not_host', 'só o host');
    expect(onError).toHaveBeenLastCalledWith('só o host');
  });

  it('rede de segurança: com a jogada mandada, um código típico de jogada devolve mesmo com o contador zerado', () => {
    const room = told(4);
    const p = othersOf(room)[0]!;
    const view = dixitView(room, p);
    const { hook, fail, onError } = setup(view);
    act(() => hook.result.current.play(stateOf(room).hands[p]![0]!, null, ''));
    // a conexão caiu: o contador zera, mas a jogada continua marcada como mandada até reconectar
    hook.rerender({ view, status: 'reconnecting' });
    fail('not_host'); // código que não é de jogada: nada muda
    expect(hook.result.current.sent).toBe(true);
    fail('wrong_count');
    expect(hook.result.current.pending).toEqual([]);
    expect(hook.result.current.sent).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('erro de outra ação com 1 pendente na partida de 3 não mexe nela', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const { hook, fail } = setup(dixitView(room, p));
    act(() => hook.result.current.play(stateOf(room).hands[p]![0]!, null, ''));
    fail('not_host');
    expect(hook.result.current.pending).toHaveLength(1);
  });

  it('reconexão zera as pendentes', () => {
    const room = told(3);
    const p = othersOf(room)[0]!;
    const view = dixitView(room, p);
    const { hook } = setup(view);
    act(() => hook.result.current.play(stateOf(room).hands[p]![0]!, null, ''));
    hook.rerender({ view, status: 'reconnecting' });
    expect(hook.result.current.pending).toHaveLength(1);
    hook.rerender({ view, status: 'joined' });
    expect(hook.result.current.pending).toEqual([]);
  });

  it('o ponto do narrador continua quando a fase vira escolha; o tell não sai duas vezes', () => {
    const room = started(4);
    const st = stateOf(room).storyteller!;
    const card = stateOf(room).hands[st]![0]!;
    const { c, hook, fail } = setup(dixitView(room, st));
    expect(hook.result.current.telling).toBe(true);
    act(() => hook.result.current.play(card, { x: 400, y: 300 }, 'luar'));
    expect(c.sendAction).toHaveBeenCalledWith({ type: 'tell', cardId: card, clue: 'luar' });
    expect(hook.result.current.pending).toEqual([]);
    expect(hook.result.current.canPlay).toBe(false);
    act(() => hook.result.current.play(card, null, 'luar'));
    expect(c.sendAction).toHaveBeenCalledTimes(1);
    fail('paused');
    expect(hook.result.current.canPlay).toBe(true);
    hook.rerender({ view: dixitView(told(4, 'luar'), st), status: 'joined' });
    expect(hook.result.current.dropPoints).toEqual({ [card]: { x: 400, y: 300 } });
  });
});
