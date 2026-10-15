import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomConnection, type SocketLike } from '../src/net/connection';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  messages() {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as { t: string; [k: string]: unknown });
  }
}

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const last = () => FakeSocket.all[FakeSocket.all.length - 1]!;
const made: RoomConnection[] = [];

function make() {
  const conn = new RoomConnection({
    url: 'ws://s/rooms/ABCD/ws',
    token: TOKEN,
    name: 'Ana',
    color: '#8EC5FF',
    createSocket: (url) => new FakeSocket(url),
  });
  made.push(conn);
  conn.start();
  return conn;
}

function becomeVisible() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('RoomConnection', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    // conexões de testes anteriores não podem reagir a eventos de documento nos seguintes
    made.splice(0).forEach((c) => c.stop());
    vi.useRealTimers();
  });

  it('abre o socket e manda join ao conectar', () => {
    const conn = make();
    expect(last().url).toBe('ws://s/rooms/ABCD/ws');
    expect(conn.getSnapshot().status).toBe('connecting');
    last().open();
    expect(conn.getSnapshot().status).toBe('joining');
    expect(last().messages()).toEqual([{ t: 'join', token: TOKEN, name: 'Ana', color: '#8EC5FF' }]);
  });

  it('welcome e state atualizam o snapshot e avisam assinantes', () => {
    const conn = make();
    const spy = vi.fn();
    conn.subscribe(spy);
    last().open();
    last().receive({ t: 'welcome', playerId: 'p1', code: 'ABCD' });
    last().receive({ t: 'state', room: { code: 'ABCD', you: 'p1' } });
    const snap = conn.getSnapshot();
    expect(snap.status).toBe('joined');
    expect(snap.playerId).toBe('p1');
    expect(snap.view).toEqual({ code: 'ABCD', you: 'p1' });
    expect(spy).toHaveBeenCalled();
  });

  it('erro de entrada vira join_failed e retryJoin tenta de novo no mesmo socket', () => {
    const conn = make();
    last().open();
    last().receive({ t: 'error', code: 'color_taken', message: 'Essa cor já foi escolhida.' });
    expect(conn.getSnapshot()).toMatchObject({ status: 'join_failed', joinError: 'color_taken' });
    conn.retryJoin('Ana', '#FF8FAB');
    expect(FakeSocket.all).toHaveLength(1);
    expect(last().messages().at(-1)).toEqual({ t: 'join', token: TOKEN, name: 'Ana', color: '#FF8FAB' });
    expect(conn.getSnapshot()).toMatchObject({ status: 'joining', joinError: null });
  });

  it('outros erros vão para onError sem mudar o status', () => {
    const conn = make();
    const onError = vi.fn();
    conn.onError(onError);
    last().open();
    last().receive({ t: 'welcome', playerId: 'p1', code: 'ABCD' });
    last().receive({ t: 'error', code: 'not_host', message: 'Só o host pode fazer isso.' });
    expect(onError).toHaveBeenCalledWith('not_host', 'Só o host pode fazer isso.');
    expect(conn.getSnapshot().status).toBe('joined');
  });

  it('fx vai para onFx; pong é ignorado', () => {
    const conn = make();
    const onFx = vi.fn();
    conn.onFx(onFx);
    last().open();
    last().receive('pong');
    last().receive({ t: 'fx.ping', from: 'p2', x: 0.5, y: 0.5 });
    expect(onFx).toHaveBeenCalledTimes(1);
    expect(onFx).toHaveBeenCalledWith({ t: 'fx.ping', from: 'p2', x: 0.5, y: 0.5 });
  });

  it('reconecta com backoff exponencial e zera ao conseguir abrir', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    expect(conn.getSnapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop(1006);
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(3);
    last().open();
    last().drop(1006);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it('não reconecta quando substituído por outra aba ou quando a sala sumiu', () => {
    const a = make();
    last().open();
    last().drop(4000);
    expect(a.getSnapshot().status).toBe('replaced');
    const b = make();
    last().open();
    last().drop(4004);
    expect(b.getSnapshot().status).toBe('gone');
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('manda ping a cada 15 s enquanto aberto', () => {
    make();
    last().open();
    vi.advanceTimersByTime(15_000);
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(1);
    vi.advanceTimersByTime(15_000);
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(2);
  });

  it('cursor: o primeiro sai na hora, os seguintes no máximo a ~30 Hz com o valor mais recente', () => {
    const conn = make();
    last().open();
    const cursor = (x: number) => ({ zone: 'table' as const, x, y: 0.5, drag: null });
    conn.sendCursor(cursor(0.1));
    conn.sendCursor(cursor(0.2));
    conn.sendCursor(cursor(0.3));
    expect(last().messages().filter((m) => m.t === 'fx.cursor').map((m) => m.x)).toEqual([0.1]);
    vi.advanceTimersByTime(34);
    expect(last().messages().filter((m) => m.t === 'fx.cursor').map((m) => m.x)).toEqual([0.1, 0.3]);
  });

  it('stop fecha e não reconecta; ações só saem com o socket aberto', () => {
    const conn = make();
    conn.sendAction({ type: 'start' });
    expect(last().sent).toEqual([]);
    last().open();
    conn.sendAction({ type: 'start' });
    expect(last().messages().at(-1)).toEqual({ t: 'action', action: { type: 'start' } });
    conn.stop();
    expect(last().closedWith).toBe(1000);
    last().drop(1000);
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('ao voltar para a aba, reconecta na hora em vez de esperar o backoff', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    expect(conn.getSnapshot().status).toBe('reconnecting');
    expect(FakeSocket.all).toHaveLength(1);
    becomeVisible();
    expect(FakeSocket.all).toHaveLength(2);
    // o timer de 1 s pendente foi cancelado: não abre um terceiro socket
    vi.advanceTimersByTime(5_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('ao voltar para a aba com o socket aberto, manda um ping para detectar conexão morta', () => {
    make();
    last().open();
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(0);
    becomeVisible();
    expect(last().sent.filter((s) => s === 'ping')).toHaveLength(1);
  });

  it('ping da volta à aba sem nenhuma resposta em 5 s: trata como socket morto e reconecta', () => {
    const conn = make();
    last().open();
    const dead = last();
    becomeVisible();
    expect(dead.sent.filter((s) => s === 'ping')).toHaveLength(1);
    vi.advanceTimersByTime(4_999);
    expect(conn.getSnapshot().status).toBe('joining');
    vi.advanceTimersByTime(1);
    expect(conn.getSnapshot().status).toBe('reconnecting');
    expect(dead.closedWith).not.toBeNull();
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all).toHaveLength(2);
    // o socket descartado não pode mais mexer no estado
    dead.drop(1006);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('qualquer mensagem (pong) dentro de 5 s cancela o prazo', () => {
    const conn = make();
    last().open();
    becomeVisible();
    vi.advanceTimersByTime(2_000);
    last().receive('pong');
    vi.advanceTimersByTime(10_000);
    expect(conn.getSnapshot().status).toBe('joining');
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('retryJoin com o socket caído e retry pendente abre só um socket novo', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    expect(conn.getSnapshot().status).toBe('reconnecting');
    conn.retryJoin('Bia', '#FF8FAB');
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('retryJoin com socket ainda conectando descarta o antigo (sem socket órfão)', () => {
    const conn = make();
    const first = last();
    conn.retryJoin('Bia', '#FF8FAB');
    expect(first.closedWith).toBe(1000);
    expect(FakeSocket.all).toHaveLength(2);
    first.open(); // o descartado não pode mandar join nem mexer no estado
    expect(first.sent).toEqual([]);
  });

  it('start duas vezes não abre dois sockets; depois de stop pode recomeçar do zero', () => {
    const conn = make();
    conn.start();
    expect(FakeSocket.all).toHaveLength(1);
    last().open();
    last().drop(1006);
    conn.stop();
    conn.start();
    expect(FakeSocket.all).toHaveLength(2);
    expect(conn.getSnapshot()).toMatchObject({ status: 'connecting', joinError: null });
  });

  it('start zera o backoff', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    vi.advanceTimersByTime(1_000);
    last().drop(1006); // attempt = 2 -> próximo atraso seria 4 s
    conn.stop();
    conn.start();
    last().drop(1006);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it('ignora JSON que não é objeto e mensagens desconhecidas (só fx.* chega nos ouvintes de fx)', () => {
    const conn = make();
    const onFx = vi.fn();
    const onError = vi.fn();
    conn.onFx(onFx);
    conn.onError(onError);
    last().open();
    last().receive('null');
    last().receive('42');
    last().receive('"oi"');
    last().receive({ t: 'algo.estranho' });
    last().receive({});
    expect(onFx).not.toHaveBeenCalled();
    expect(conn.getSnapshot().status).toBe('joining');
    last().receive({ t: 'fx.activity', from: 'p2', activity: 'typing' });
    expect(onFx).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('erro de entrada vira join_failed sem repassar para onError', () => {
    const conn = make();
    const onError = vi.fn();
    conn.onError(onError);
    last().open();
    last().receive({ t: 'error', code: 'room_full', message: 'Sala cheia.' });
    expect(conn.getSnapshot().status).toBe('join_failed');
    expect(onError).not.toHaveBeenCalled();
  });

  it('depois de stop, voltar para a aba não faz nada', () => {
    const conn = make();
    last().open();
    last().drop(1006);
    conn.stop();
    becomeVisible();
    expect(FakeSocket.all).toHaveLength(1);
  });
});
