import {
  KITTENS_BICHOS,
  KITTENS_CARD_NAMES,
  PLAYER_COLORS,
  createRoom,
  isKittensRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type GameAction,
  type KittensEvent,
  type KittensRoomView, type KittensState,
  type Room,
} from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fxSrc from '../src/games/kittens/fx.ts?raw';
import { createMesa, type Mesa } from '../src/games/kittens/mesa';
import mesaSrc from '../src/games/kittens/mesa.ts?raw';

/**
 * Todo o CSS do site (texto), lido do disco: o vitest esvazia CSS importado (mesmo com `?raw`). O `node:fs` vem por
 * import dinâmico pra não pôr os tipos do Node no projeto web inteiro.
 */
async function siteCss(): Promise<Record<string, string>> {
  const name = 'node:fs';
  const fs = (await import(/* @vite-ignore */ name)) as {
    readdirSync(dir: string, opts: { recursive: true }): string[];
    readFileSync(file: string, enc: 'utf8'): string;
  };
  const src = `${(import.meta as ImportMeta & { dirname: string }).dirname}/../src`;
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(src, { recursive: true })) {
    const rel = String(f).replace(/\\/g, '/');
    if (rel.endsWith('.css')) out[rel] = fs.readFileSync(`${src}/${rel}`, 'utf8');
  }
  return out;
}

/** jsdom não desenha: contexto 2D de mentira e `toDataURL` fixo (como em kittens-art.test.ts). */
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '#000000',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
      createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof realGetContext;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,x';
  vi.useFakeTimers();
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Sala de Tatubum começada com `n` jogadores p0…; o p0 (host) é o da vez. */
function started(n = 3): Room {
  let room = createRoom('ABCD', 0, 'kittens');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  const res = roomAction(room, 'p0', { type: 'start' }, mulberry32(7), 0);
  if (!res.ok) throw new Error(res.error);
  // Quem começa é sorteado; os testes fixam a vez no p0 (host).
  return { ...res.room, game: { ...(res.room.game as KittensState), current: 'p0' } };
}

function viewOf(room: Room, me: string | null): KittensRoomView {
  const v = roomView(room, me);
  if (!isKittensRoomView(v)) throw new Error('esperava sala de Tatubum');
  return v;
}

function mount(): { root: HTMLElement; mesa: Mesa; sent: GameAction[] } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sent: GameAction[] = [];
  const mesa = createMesa(root, { send: (a) => sent.push(a), now: () => Date.now(), seed: 7 });
  return { root, mesa, sent };
}

const toMesa = (v: KittensRoomView) => ({ view: v.game, you: v.you, hostId: v.hostId, seats: v.seats });
const buttonByText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

/**
 * Partida no meio (o p0 já comprou), vista por `me`, com a vez no p1 e nada no ar: a primeira visão não anima nada
 * (entra direto na mesa), e o teste pode mexer na visão à vontade.
 */
function midGame(me: string): KittensRoomView {
  const res = roomAction(started(3), 'p0', { type: 'draw' }, mulberry32(1), 0);
  if (!res.ok) throw new Error(res.error);
  const v = viewOf(res.room, me);
  v.game = { ...v.game, current: 'p1', owed: 1, alive: ['p0', 'p1', 'p2'], pending: null, choice: null, peek: null };
  return v;
}

/** Clique numa carta da mão (aperta e solta sem arrastar). */
function clickCard(root: HTMLElement, id: string): void {
  root.querySelector<HTMLElement>(`#hand .kt-card[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
  window.dispatchEvent(new MouseEvent('pointerup'));
}

/** Arrasta uma carta da mão e solta em cima de `onto` (o jsdom não tem `elementsFromPoint`: ele aponta pra `onto`). */
function dragCard(root: HTMLElement, id: string, onto: Element): void {
  const doc = document as unknown as { elementsFromPoint?: (x: number, y: number) => Element[] };
  const had = doc.elementsFromPoint;
  doc.elementsFromPoint = () => [onto];
  try {
    root.querySelector<HTMLElement>(`#hand .kt-card[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 40 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 40, clientY: 40 }));
  } finally {
    if (had) doc.elementsFromPoint = had;
    else delete doc.elementsFromPoint;
  }
}

describe('mesa do Tatubum', () => {
  it('desenha a mão e os assentos e manda COMPRAR pro servidor', () => {
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(root.querySelectorAll('#hand .kt-card')).toHaveLength(8);
    const seats = [...root.querySelectorAll<HTMLElement>('.kt-seat')];
    expect(seats.map((s) => s.dataset.p)).toEqual(['p1', 'p2']);
    expect(seats.map((s) => s.querySelector('.who')?.textContent)).toEqual(['P1', 'P2']);
    expect(root.querySelector('.kt-seat .order.next')?.textContent).toBe('PRÓXIMO');
    expect(root.querySelector('#turn')?.textContent).toContain('SUA VEZ');

    buttonByText(root, 'COMPRAR')!.click();
    expect(sent).toEqual([{ type: 'draw' }]);
    mesa.destroy();
  });

  it('Ataque acumulado: os turnos que faltam aparecem na sua mão e no assento de quem está na vez', () => {
    const mine = midGame('p0');
    mine.game = { ...mine.game, current: 'p0', owed: 3 };
    const { root, mesa } = mount();
    mesa.update(toMesa(mine));
    expect(root.querySelector('#hand .kt-owedtag')?.textContent).toContain('FALTAM 3 TURNOS');
    mesa.destroy();

    const theirs = midGame('p0');
    theirs.game = { ...theirs.game, current: 'p1', owed: 2 };
    const other = mount();
    other.mesa.update(toMesa(theirs));
    expect(other.root.querySelector('.kt-seat[data-p="p1"] .kt-owed')?.textContent).toBe('2 TURNOS');
    expect(other.root.querySelector('.kt-seat[data-p="p2"] .kt-owed')).toBeNull();
    expect(other.root.querySelector('#hand .kt-owedtag')).toBeNull();
    other.mesa.destroy();
  });

  it('nomes vão escapados pro HTML', () => {
    let room = started(2);
    room = { ...room, seats: room.seats.map((s) => (s.id === 'p1' ? { ...s, name: '<b>x</b>' } : s)) };
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p0')));
    expect(root.querySelector('.kt-seat .who')?.innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
    mesa.destroy();
  });

  it('quem assiste não tem mão nem botões', () => {
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(started(3), null)));
    expect(root.querySelectorAll('#hand .kt-card')).toHaveLength(0);
    expect(root.querySelector('#hand')?.textContent).toContain('ASSISTINDO');
    expect(buttonByText(root, 'COMPRAR')).toBeUndefined();
    expect(root.querySelectorAll('.kt-seat')).toHaveLength(3);
    mesa.destroy();
  });

  it('erro do servidor vira o toast da mesa', () => {
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(started(2), 'p0')));
    mesa.error('Não é a sua vez.');
    expect(root.querySelector('#toast')?.textContent).toBe('Não é a sua vez.');
    vi.advanceTimersByTime(2300);
    expect(root.querySelector('#toast')?.textContent).toBe('');
    mesa.destroy();
  });

  it('entrando no meio da partida, o diário aparece sem repetir as animações', () => {
    let room = started(2);
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p1')));
    expect(root.querySelector('#log')?.textContent).toContain('P0 comprou uma carta');
    expect(root.querySelector('#caption')?.textContent).not.toContain('Distribuindo');
    mesa.destroy();
  });

  it('a fila de efeitos roda a distribuição e a compra sem erro', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let room = started(2);
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p0')));
    await vi.advanceTimersByTimeAsync(3000);
    expect(root.querySelector('#caption')?.textContent).toContain('Sua vez');
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    mesa.update(toMesa(viewOf(room, 'p0')));
    await vi.advanceTimersByTimeAsync(3000);
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log).toMatch(/Você comprou|comprou o TATUBUM|EXPLODIU/);
    expect(root.querySelectorAll('#hand .kt-card.arriving')).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('destroy limpa timers, listeners e o DOM', () => {
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    mesa.error('oi');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    mesa.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(root.innerHTML).toBe('');
    // teclado (espaço = comprar) não chega mais na mesa
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(sent).toEqual([]);
    // update depois do destroy não quebra nem desenha
    mesa.update(toMesa(viewOf(started(3), 'p0')));
    expect(root.innerHTML).toBe('');
  });

  it('par de Preguiça: o painel mostra os bichos e o clique manda a jogada com o pedido', () => {
    const v = viewOf(started(3), 'p0');
    const pair = ['preguica-90', 'preguica-91'];
    v.game.hand = [...pair, ...v.game.hand.slice(2)];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    // clique (aperta e solta sem arrastar) nas duas Preguiças
    for (const id of pair) {
      root.querySelector<HTMLElement>(`#hand .kt-card[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    }
    buttonByText(root, 'JOGAR PAR')!.click();
    const row = root.querySelector('#panel .kt-row');
    expect(row).not.toBeNull();
    const names = [...row!.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(names).toEqual([...KITTENS_BICHOS.map((k) => KITTENS_CARD_NAMES[k].toUpperCase()), 'CANCELAR']);
    expect(root.querySelector('#caption')?.textContent).toContain('Que bicho');

    buttonByText(root, KITTENS_CARD_NAMES.mico.toUpperCase())!.click();
    expect(sent).toEqual([{ type: 'play', cards: pair, ask: 'mico' }]);
    // Até o servidor responder, a seleção continua (e não manda de novo); a legenda do modo sai.
    expect(root.querySelectorAll('#hand .kt-card.sel')).toHaveLength(2);
    expect(root.querySelector('#caption')?.textContent).toBe('');
    buttonByText(root, KITTENS_CARD_NAMES.quati.toUpperCase())!.click();
    expect(sent).toHaveLength(1);
    // Recusou: o painel do bicho fecha, a seleção fica pra tentar de novo.
    mesa.error('Não pode.');
    expect(root.querySelector('#panel')?.innerHTML).toBe('');
    expect(root.querySelectorAll('#hand .kt-card.sel')).toHaveLength(2);
    mesa.destroy();
  });

  it('fim de jogo: só o host tem os botões, e eles aparecem se o host mudar', () => {
    let room = started(3);
    const res = roomAction(room, 'p0', { type: 'draw' }, mulberry32(1), 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    const over = (me: string, hostId: string) => {
      const s = toMesa(viewOf(room, me));
      return { ...s, hostId, view: { ...s.view, phase: 'gameover' as const, winner: 'p2', current: null, pending: null, choice: null } };
    };
    const host = mount();
    host.mesa.update(over('p0', 'p0'));
    expect(buttonByText(host.root, 'JOGAR DE NOVO')).toBeDefined();
    expect(buttonByText(host.root, 'VOLTAR PRO LOBBY')).toBeDefined();
    host.root.querySelector<HTMLButtonElement>('#over .kt-btn')!.click();
    expect(host.sent).toEqual([{ type: 'again' }]);
    host.mesa.destroy(); // uma mesa por vez (os ids do palco são da página)

    const guest = mount();
    guest.mesa.update(over('p1', 'p0'));
    expect(buttonByText(guest.root, 'JOGAR DE NOVO')).toBeUndefined();
    expect(guest.root.querySelector('#over .sub')?.textContent).toContain('esperando o host');
    // O host saiu e o p1 virou host com o quadro aberto: a parte de baixo é refeita.
    guest.mesa.update(over('p1', 'p1'));
    expect(buttonByText(guest.root, 'JOGAR DE NOVO')).toBeDefined();
    expect(guest.root.querySelector('#over .sub')).toBeNull();
    expect(guest.root.querySelectorAll('#over .kt-btn')).toHaveLength(2);
    guest.mesa.destroy();
  });

  it('buraco no diário (reconectou): pula a fila e mostra a mão sem esperar animação', () => {
    let room = started(3);
    const step = (p: string, seed: number) => {
      const res = roomAction(room, p, { type: 'draw' }, mulberry32(seed), 0);
      if (!res.ok) throw new Error(res.error);
      room = res.room;
    };
    step('p0', 1);
    const { root, mesa } = mount();
    mesa.update(toMesa(viewOf(room, 'p1'))); // primeira visão no meio da partida
    const lastN = viewOf(room, 'p1').game.log.at(-1)!.n;
    const before = root.querySelectorAll('#hand .kt-card').length;
    step('p1', 2);
    const later = toMesa(viewOf(room, 'p1'));
    const drew = later.view.log.filter((e) => e.n > lastN);
    expect(drew.length).toBeGreaterThan(0);
    // Uma entrada perdida no meio: a primeira nova não é a seguinte da última vista.
    const gapped = { ...later, view: { ...later.view, log: [...later.view.log.filter((e) => e.n <= lastN), { n: lastN + 5, ev: drew.at(-1)!.ev }] } };
    mesa.update(gapped);
    // Sem avançar o relógio: nada escondido esperando efeito.
    expect(root.querySelectorAll('#hand .kt-card.arriving')).toHaveLength(0);
    if (later.view.alive.includes('p1')) expect(root.querySelectorAll('#hand .kt-card').length).toBe(later.view.hand.length);
    expect(later.view.hand.length).toBeGreaterThanOrEqual(before);
    expect(root.querySelector('#log')?.textContent).toMatch(/Você comprou|comprou o TATUBUM|EXPLODIU/);
    expect(root.querySelector('.flying')).toBeNull();
    mesa.destroy();
  });

  it('Mau-olhado pede um adversário (até um sem carta) e manda o alvo', () => {
    const v = midGame('p1');
    v.game.hand = ['olhado-90', ...v.game.hand];
    v.game.handCounts = { ...v.game.handCounts, p2: 0 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    clickCard(root, 'olhado-90');
    buttonByText(root, 'JOGAR MAU-OLHADO')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('Escolha um adversário');
    // Diferente do Favor, quem está sem carta também pode levar o olhado.
    const p2 = root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!;
    expect(p2.classList.contains('targetable')).toBe(true);
    p2.click();
    expect(sent).toEqual([{ type: 'play', cards: ['olhado-90'], target: 'p2' }]);
    mesa.destroy();
  });

  it('Mau-olhado arrastado pra um adversário vai com ele de alvo', () => {
    const v = midGame('p1');
    v.game.hand = ['olhado-90', ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    dragCard(root, 'olhado-90', root.querySelector('.kt-seat[data-p="p0"]')!);
    expect(sent).toEqual([{ type: 'play', cards: ['olhado-90'], target: 'p0' }]);
    mesa.destroy();
  });

  it('par de Tucano pede um adversário (até um sem carta), clicando ou soltando no assento; Boto + Tucano também', () => {
    const v = midGame('p1');
    v.game.hand = ['tucano-90', 'tucano-91', 'boto-92', ...v.game.hand];
    v.game.handCounts = { ...v.game.handCounts, p2: 0 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    clickCard(root, 'tucano-90');
    clickCard(root, 'tucano-91');
    buttonByText(root, 'JOGAR PAR')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('Escolha um adversário');
    const p2 = root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!;
    expect(p2.classList.contains('targetable')).toBe(true);
    p2.click();
    expect(sent).toEqual([{ type: 'play', cards: ['tucano-90', 'tucano-91'], target: 'p2' }]);
    mesa.error('Não pode.');
    // Boto + Tucano solto num assento: vai com ele de alvo (a seleção continuou depois da recusa).
    clickCard(root, 'tucano-91');
    clickCard(root, 'boto-92');
    dragCard(root, 'tucano-90', root.querySelector('.kt-seat[data-p="p0"]')!);
    expect(sent[1]).toEqual({ type: 'play', cards: ['tucano-90', 'boto-92'], target: 'p0' });
    mesa.destroy();
  });

  it('par de 2 Botos virando Tucano pede o adversário depois do bicho', () => {
    const v = midGame('p1');
    const pair = ['boto-90', 'boto-91'];
    v.game.hand = [...pair, ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    for (const id of pair) clickCard(root, id);
    buttonByText(root, 'JOGAR PAR')!.click();
    buttonByText(root, KITTENS_CARD_NAMES.tucano.toUpperCase())!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('Escolha um adversário');
    root.querySelector<HTMLElement>('.kt-seat[data-p="p0"]')!.click();
    expect(sent).toEqual([{ type: 'play', cards: pair, as: 'tucano', target: 'p0' }]);
    mesa.destroy();
  });

  it('vez pulada (Tucano): PULA no assento, faixa na sua mão, dica do assento e o diário', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    v.game.skips = { p2: 2, p0: 1 };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-skip')?.textContent).toBe('PULA ×2');
    expect(root.querySelector('.kt-seat[data-p="p0"] .kt-skip')?.textContent).toBe('PULA');
    expect(root.querySelector('#hand .kt-skiptag')).toBeNull();
    let n = v.game.log.at(-1)!.n;
    const next = (patch: Partial<KittensRoomView['game']>, ...evs: KittensEvent[]) => {
      v.game = { ...v.game, ...patch, log: [...v.game.log, ...evs.map((ev) => ({ n: ++n, ev }))] };
      mesa.update(toMesa(v));
    };
    // p0 joga o Tucano em você; depois a sua vez é pulada e a do p2 também (em cadeia).
    next({ skips: { p2: 2, p0: 1, p1: 1 }, current: 'p0' }, { t: 'tucano', by: 'p0', target: 'p1' });
    expect(root.querySelector('#hand .kt-skiptag')?.textContent).toContain('SUA PRÓXIMA VEZ VAI SER PULADA');
    await vi.advanceTimersByTimeAsync(3000);
    next({ skips: { p2: 1, p0: 1 }, current: 'p0' }, { t: 'skipped', who: 'p1' }, { t: 'skipped', who: 'p2' });
    await vi.advanceTimersByTimeAsync(4000);
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log).toContain('P0 jogou o TUCANO em você: a sua próxima vez vai ser pulada');
    expect(log).toContain('Você perdeu uma vez (TUCANO)');
    expect(log).toContain('P2 perdeu uma vez (TUCANO)');
    expect(root.querySelector('#hand .kt-skiptag')).toBeNull();
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-skip')?.textContent).toBe('PULA');
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-skip')?.getAttribute('title')).toContain('a próxima vez pulada');
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('zoom e galeria do Tucano dizem só o que a carta faz', () => {
    const v = midGame('p1');
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    root.querySelector<HTMLElement>('#cards')!.click();
    const item = [...root.querySelectorAll('#gallery .item')].find((el) => el.querySelector('.kt-card')?.getAttribute('data-id')?.startsWith('tucano-'));
    expect(item?.textContent).toContain('TUCANO');
    expect(item?.textContent).toContain('a próxima vez de um adversário é pulada');
    mesa.destroy();
  });

  it('par de 2 Botos abre o painel do bicho e manda o `as` (Preguiça ainda pede o bicho puxado)', () => {
    const v = midGame('p1');
    const pair = ['boto-90', 'boto-91'];
    v.game.hand = [...pair, ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    for (const id of pair) clickCard(root, id);
    buttonByText(root, 'JOGAR PAR')!.click();
    expect(root.querySelector('#panel h2')?.textContent).toBe('QUE BICHO O BOTO VIRA?');
    expect(root.querySelector('#caption')?.textContent).toContain('Boto vira');
    const names = [...root.querySelectorAll('#panel .kt-row button')].map((b) => b.textContent?.trim());
    expect(names).toEqual([...KITTENS_BICHOS.map((k) => KITTENS_CARD_NAMES[k].toUpperCase()), 'CANCELAR']);
    buttonByText(root, 'QUATI')!.click();
    expect(sent).toEqual([{ type: 'play', cards: pair, as: 'quati' }]);
    // Recusou: tenta de novo virando Preguiça; aí vem o painel do bicho puxado.
    mesa.error('Não pode.');
    buttonByText(root, 'JOGAR PAR')!.click();
    buttonByText(root, KITTENS_CARD_NAMES.preguica.toUpperCase())!.click();
    expect(root.querySelector('#panel h2')?.textContent).toBe('QUE BICHO VOCÊ PUXA?');
    buttonByText(root, KITTENS_CARD_NAMES.mico.toUpperCase())!.click();
    expect(sent[1]).toEqual({ type: 'play', cards: pair, as: 'preguica', ask: 'mico' });
    mesa.destroy();
  });

  it('Boto com um bicho é o par daquele bicho (sem painel); com ação não forma jogada', () => {
    const v = midGame('p1');
    v.game.hand = ['boto-90', 'quati-91', 'ataque-92', ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    clickCard(root, 'boto-90');
    clickCard(root, 'ataque-92');
    expect(buttonByText(root, 'NÃO FORMA JOGADA')?.disabled).toBe(true);
    clickCard(root, 'ataque-92');
    clickCard(root, 'quati-91');
    buttonByText(root, 'JOGAR PAR')!.click();
    expect(sent).toEqual([{ type: 'play', cards: ['boto-90', 'quati-91'] }]);
    mesa.destroy();
  });

  it('Feitiço: o painel mostra a carta de baixo e os botões mandam `keep`', () => {
    const v = midGame('p1');
    v.game.choice = { kind: 'feitico', who: 'p1', deadline: Date.now() + 30_000, card: 'tatubum-9' };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#panel h2')?.textContent).toContain('O FEITIÇO PUXOU DO FUNDO:');
    expect(root.querySelector('#panel .cards .kt-card')?.getAttribute('data-id')).toBe('tatubum-9');
    // É um Tatubum: o painel avisa que ficar com ele é comprar o Tatubum.
    expect(root.querySelector('#panel .kt-warn')?.textContent).toContain('TATUBUM');
    buttonByText(root, 'FICAR COM ELA')!.click();
    buttonByText(root, 'PÔR NO TOPO')!.click();
    expect(sent).toEqual([{ type: 'choose', keep: true }, { type: 'choose', keep: false }]);
    mesa.destroy();

    // Os outros só veem que alguém está escolhendo (sem a carta).
    const w = midGame('p2');
    w.game.choice = { kind: 'feitico', who: 'p1', deadline: Date.now() + 30_000, card: null };
    const other = mount();
    other.mesa.update(toMesa(w));
    expect(other.root.querySelector('#panel')?.innerHTML).toBe('');
    expect(other.root.querySelector('#caption')?.textContent).toContain('P1 está vendo a carta de baixo do monte');
    other.mesa.destroy();
  });

  it('Tatu Latidor: o Latidor grande late e quem tem que se defender joga o Desarme à mão', () => {
    const v = midGame('p1');
    v.game.hand = ['cafune-90', ...v.game.hand.filter((id) => !id.startsWith('cafune'))];
    v.game.choice = { kind: 'latido', who: 'p1', by: 'p0', deadline: Date.now() + 30_000 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    const big = root.querySelector<HTMLElement>('.bigcard');
    expect(big?.dataset.id).toBe('latido-0');
    expect(big?.classList.contains('live')).toBe(true);
    expect(root.querySelector('#hand')?.classList.contains('defusing')).toBe(true);
    expect(root.querySelector('#caption')?.textContent).toContain('JOGUE O DESARME');
    // Outra carta não vale; o Desarme (clique) vai.
    const other = v.game.hand.find((id) => !id.startsWith('cafune'))!;
    clickCard(root, other);
    expect(sent).toEqual([]);
    expect(root.querySelector('#toast')?.textContent).toBe('Agora só o Desarme!');
    clickCard(root, 'cafune-90');
    expect(sent).toEqual([{ type: 'choose', card: 'cafune-90' }]);
    // Arrastar o Desarme pro Latidor também vai.
    dragCard(root, 'cafune-90', big!);
    expect(sent[1]).toEqual({ type: 'choose', card: 'cafune-90' });
    mesa.destroy();

    const w = midGame('p2');
    w.game.choice = { kind: 'latido', who: 'p1', by: 'p0', deadline: Date.now() + 30_000 };
    const watcher = mount();
    watcher.mesa.update(toMesa(w));
    expect(watcher.root.querySelector('#caption')?.textContent).toContain('P1 está se defendendo do Latidor');
    expect(watcher.root.querySelector('.bigcard')?.classList.contains('live')).toBe(false);
    expect(watcher.root.querySelector('.kt-seat[data-p="p1"] .chip')?.textContent).toBe('se defendendo…');
    watcher.mesa.destroy();
  });

  it('cego: a mão vira versos (fichas), dá pra jogar às cegas e o Nem vem! vai pela ficha arrastada', () => {
    const v = midGame('p1');
    v.game.blind = ['p1', 'p2'];
    v.game.hand = ['?0', '?1', '?2'];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    const cards = [...root.querySelectorAll<HTMLElement>('#hand .kt-card')];
    expect(cards.map((c) => c.dataset.id)).toEqual(['?0', '?1', '?2']);
    expect(cards.every((c) => c.classList.contains('back') && c.classList.contains('kt-token'))).toBe(true);
    expect(root.querySelector('#hand .kt-blindtag')?.textContent).toContain('VOCÊ ESTÁ CEGO!');
    // Quem mais está cego ganha o olho roxo no assento.
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-cursed')).not.toBeNull();
    expect(root.querySelector('.kt-seat[data-p="p0"] .kt-cursed')).toBeNull();
    // Zoom numa ficha: só o verso.
    cards[1]!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(root.querySelector('#viewer h3')?.textContent).toBe('CARTA VIRADA');
    clickCard(root, '?1');
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    expect(sent).toEqual([]);
    buttonByText(root, 'SEM ALVO')!.click();
    expect(sent).toEqual([{ type: 'play', cards: ['?1'] }]);
    mesa.destroy();

    // Carta no ar: sem botão nem tecla N; a ficha arrastada pra mesa vai como o Nem vem!.
    const w = midGame('p1');
    w.game.blind = ['p1'];
    w.game.hand = ['?0', '?1'];
    w.game.current = 'p0';
    w.game.pending = { by: 'p0', play: { kind: 'ataque', cards: ['ataque-1'], target: null, ask: null, as: null }, nopes: [], resolvesAt: Date.now() + 5000 };
    const m2 = mount();
    m2.mesa.update(toMesa(w));
    expect(m2.root.querySelector('#nope')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(m2.sent).toEqual([]);
    dragCard(m2.root, '?1', m2.root.querySelector('#table')!);
    expect(m2.sent).toEqual([{ type: 'nope', card: '?1', at: 0, on: 'ataque-1' }]);
    m2.mesa.destroy();
  });

  it('Nem vem! manda o que você viu (at/on); atrasado, a carta continua na mão e aparece o aviso', () => {
    const v = midGame('p1');
    v.game.current = 'p0';
    v.game.hand = ['nemvem-7', 'mico-7'];
    // Já tem um Nem vem! (do p2) na carta no ar, dado há 2,5 s (passou a espera de 2 s).
    v.game.pending = {
      by: 'p0',
      play: { kind: 'ataque', cards: ['ataque-1'], target: null, ask: null, as: null },
      nopes: [{ by: 'p2', card: 'nemvem-8' }],
      resolvesAt: Date.now() + 2500,
    };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    const want = { type: 'nope', at: 1, on: 'ataque-1' };
    // Botão, tecla N e o Nem vem! arrastado pra mesa: todos mandam `at` e `on`.
    root.querySelector<HTMLButtonElement>('#nope')!.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    dragCard(root, 'nemvem-7', root.querySelector('#table')!);
    expect(sent).toEqual([want, want, want]);
    // O servidor recusa (alguém deu Nem vem! antes): o aviso aparece e o Nem vem! continua na mão, visível.
    mesa.error('Alguém deu Nem vem! antes de você: sua carta voltou pra mão.');
    expect(root.querySelector('#toast')?.textContent).toBe('Alguém deu Nem vem! antes de você: sua carta voltou pra mão.');
    const card = root.querySelector<HTMLElement>('#hand .kt-card[data-id="nemvem-7"]');
    expect(card).not.toBeNull();
    expect(card!.classList.contains('dragging')).toBe(false);
    expect(root.querySelector('#nope')).not.toBeNull();
    mesa.destroy();
  });

  it.each(['desktop', 'phone'] as const)(
    'espera de 2 s depois de um Nem vem! (%s): botão apagado com o tempo; N e arrastar não fazem nada; depois volta',
    async (layout) => {
      const v = midGame('p1');
      v.game.current = 'p0';
      v.game.hand = ['nemvem-7', 'mico-7'];
      // O p2 acabou de dar Nem vem! (a janela recomeçou agora).
      v.game.pending = {
        by: 'p0',
        play: { kind: 'ataque', cards: ['ataque-1'], target: null, ask: null, as: null },
        nopes: [{ by: 'p2', card: 'nemvem-8' }],
        resolvesAt: Date.now() + 5000,
      };
      const { root, mesa, sent } = mount();
      if (layout === 'phone') mesa.setLayout('phone');
      mesa.update(toMesa(v));
      const btn = () => root.querySelector<HTMLButtonElement>('#nope')!;
      expect(btn().disabled).toBe(true);
      expect(btn().textContent).toBe('NEM VEM! 2s');
      btn().click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      dragCard(root, 'nemvem-7', root.querySelector('#table')!);
      expect(sent).toEqual([]);
      expect(root.querySelector('#toast')?.textContent).toContain('Espere');
      expect(root.querySelector('#hand .kt-card[data-id="nemvem-7"]')).not.toBeNull();
      // A barrinha do Nem vem! continua correndo.
      expect(root.querySelectorAll('#bar i.on').length).toBe(5);
      await vi.advanceTimersByTimeAsync(1100);
      expect(btn().textContent).toBe('NEM VEM! 1s');
      expect(btn().disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(btn().disabled).toBe(false);
      expect(btn().textContent).toBe('NEM VEM! (1)');
      expect(root.querySelectorAll('#bar i.on').length).toBe(3);
      btn().click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      expect(sent).toEqual([
        { type: 'nope', at: 1, on: 'ataque-1' },
        { type: 'nope', at: 1, on: 'ataque-1' },
      ]);
      mesa.destroy();
    },
  );

  it('descarte: passar o mouse na de cima dá zoom; no quadro do olho, o painel diz o que a carta faz', () => {
    const v = midGame('p1');
    v.game.discard = ['ataque-7', 'favor-7'];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const top = root.querySelector<HTMLElement>('#discard .kt-card[data-id="favor-7"]')!;
    top.dispatchEvent(new MouseEvent('mouseenter'));
    expect(root.querySelector('#viewer')?.textContent).toContain('FAVOR');
    top.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root.querySelector('#viewer')?.textContent).toBe('');
    root.querySelector<HTMLElement>('#eye')!.click();
    const info = () => root.querySelector('#pile .pinfo')?.textContent ?? '';
    expect(info()).toContain('Passe o mouse');
    root.querySelector<HTMLElement>('#pile .kt-card[data-id="ataque-7"]')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(info()).toContain('ATAQUE');
    expect(info()).toContain('sem comprar');
    mesa.destroy();
  });

  it('par de Mico: depois do último descarte, o quadro abre pra quem jogou pegar uma das descartadas', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    const deadline = Date.now() + 30_000;
    v.game.discard = ['ataque-7', 'mico-80', 'mico-81', 'pular-5'];
    v.game.choice = { kind: 'mico', by: 'p1', waiting: ['p2'], discarded: ['pular-5'], deadline };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#caption')?.textContent).toContain('Todo mundo descartando');
    expect(root.querySelector<HTMLElement>('#pile')!.hidden).toBe(true);
    // O P2 descarta o último: abre a pegada (a escolha dos 5 diferentes, com `from: 'mico'`).
    const n = v.game.log.at(-1)!.n;
    const pick = { kind: 'cinco' as const, who: 'p1', options: ['pular-5', 'espiar-5'], left: 1, deadline: Date.now() + 30_000, from: 'mico' as const };
    const after = {
      ...v,
      game: { ...v.game, discard: [...v.game.discard, 'espiar-5'], choice: pick, log: [...v.game.log, { n: n + 1, ev: { t: 'discarded', by: 'p2', card: 'espiar-5' } as KittensEvent }] },
    };
    mesa.update(toMesa(after));
    await vi.advanceTimersByTimeAsync(3000);
    const pile = root.querySelector<HTMLElement>('#pile')!;
    expect(pile.hidden).toBe(false);
    expect(pile.querySelector('h2')?.textContent).toContain('PEGUE UMA DAS DESCARTADAS');
    expect(pile.querySelector('.psub')?.textContent).toContain('descartadas no seu par de Mico');
    // Só as descartadas no par acendem; o que já estava no descarte fica apagado.
    const lit = [...pile.querySelectorAll<HTMLElement>('.kt-card.pickable')].map((el) => el.dataset.id).sort();
    expect(lit).toEqual(['espiar-5', 'pular-5']);
    expect(pile.querySelector('.kt-card[data-id="ataque-7"]')!.classList.contains('off')).toBe(true);
    expect(pile.querySelector('.kt-card[data-id="mico-80"]')!.classList.contains('off')).toBe(true);
    expect(root.querySelector('#caption')?.textContent).toContain('Pegue UMA das descartadas');
    pile.querySelector<HTMLElement>('.kt-card[data-id="espiar-5"]')!.click();
    expect(sent).toEqual([{ type: 'choose', card: 'espiar-5' }]);
    // Pegou: o quadro fecha sozinho.
    const done = { ...after, game: { ...after.game, discard: after.game.discard.filter((c) => c !== 'espiar-5'), hand: [...after.game.hand, 'espiar-5'], choice: null, log: [...after.game.log, { n: n + 2, ev: { t: 'picked', by: 'p1', card: 'espiar-5' } as KittensEvent }] } };
    mesa.update(toMesa(done));
    await vi.advanceTimersByTimeAsync(3000);
    expect(pile.hidden).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();

    // Os outros leem quem vai pegar, e o quadro não abre pra eles.
    const w = midGame('p2');
    w.game.choice = { ...pick };
    const other = mount();
    other.mesa.update(toMesa(w));
    expect(other.root.querySelector('#caption')?.textContent).toContain('P1 vai pegar uma das descartadas');
    expect(other.root.querySelector<HTMLElement>('#pile')!.hidden).toBe(true);
    other.mesa.destroy();
    errors.mockRestore();
  });

  it('par de Mico: a galeria e o zoom dizem que depois você pega uma das descartadas', () => {
    const v = midGame('p1');
    v.game.discard = ['mico-7'];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    root.querySelector<HTMLElement>('#cards')!.click();
    const item = [...root.querySelectorAll('#gallery .item')].find((el) => el.querySelector('.kt-card')?.getAttribute('data-id')?.startsWith('mico-'));
    expect(item?.textContent).toContain('todo mundo, menos você, descarta uma carta');
    expect(item?.textContent).toContain('depois você pega uma delas');
    root.querySelector<HTMLElement>('#eye')!.click();
    root.querySelector<HTMLElement>('#pile .kt-card[data-id="mico-7"]')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(root.querySelector('#pile .pinfo')?.textContent).toContain('você pega uma das cartas descartadas');
    mesa.destroy();
  });

  it('o Tatu Latidor na frente de cada um aparece no assento e ao lado da sua mão', () => {
    const v = midGame('p1');
    v.game.front = { p0: [], p1: ['latido-1'], p2: ['latido-0'] };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#front .kt-card[data-id="latido-1"]')).not.toBeNull();
    expect(root.querySelector('#front')?.textContent).toContain('NA SUA FRENTE');
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-front .kt-card[data-id="latido-0"]')).not.toBeNull();
    expect(root.querySelector('.kt-seat[data-p="p0"] .kt-front')).toBeNull();
    mesa.destroy();
  });

  it('efeitos das cartas novas rodam e vão pro diário (latido, olhado, cura, feitiço, par com Boto)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    let n = v.game.log.at(-1)!.n;
    const next = (patch: Partial<KittensRoomView['game']>, ...evs: KittensEvent[]) => {
      const cur = { ...v, game: { ...v.game, ...patch, log: [...v.game.log, ...evs.map((ev) => ({ n: ++n, ev }))] } };
      v.game = cur.game;
      mesa.update(toMesa(cur));
    };
    next({ blind: ['p1'], hand: v.game.hand.map((_, i) => `?${i}`) }, { t: 'cursed', by: 'p0', target: 'p1' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(root.querySelector('#hand .kt-blindtag')).not.toBeNull();
    next(
      { front: { p0: ['latido-0'], p1: [], p2: [] } },
      { t: 'barked', by: 'p0', target: null },
      { t: 'conjured', by: 'p2', kept: false },
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(root.querySelector('.kt-seat[data-p="p0"] .kt-front .kt-card.arriving')).toBeNull();
    next(
      {
        current: 'p0',
        pending: { by: 'p0', play: { kind: 'par', cards: ['boto-1', 'quati-2'], target: null, ask: null, as: 'quati' }, nopes: [], resolvesAt: Date.now() + 5000 },
      },
      { t: 'play', by: 'p0', play: 'par', target: null, ask: null, as: 'quati' },
    );
    await vi.advanceTimersByTimeAsync(3000);
    next({ blind: [], hand: ['espiar-50'], pending: null }, { t: 'cured', by: 'p1' }, { t: 'draw', by: 'p1', card: 'espiar-50' });
    await vi.advanceTimersByTimeAsync(3000);
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log).toContain('Você ficou CEGO até comprar uma carta');
    expect(log).toContain('O TATU LATIDOR ficou na frente de P0');
    expect(log).toContain('P2 pôs a carta de baixo no topo do monte');
    expect(log).toContain('P0 jogou PAR DE QUATI (com Boto)');
    expect(log).toContain('Você voltou a enxergar');
    expect(root.querySelector('#hand .kt-blindtag')).toBeNull();
    expect(root.querySelectorAll('#hand .kt-card.arriving')).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('Boto + Preguiça é par de Preguiça: pede o bicho puxado (`ask`)', () => {
    const v = midGame('p1');
    const pair = ['boto-90', 'preguica-91'];
    v.game.hand = [...pair, ...v.game.hand];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    for (const id of pair) clickCard(root, id);
    buttonByText(root, 'JOGAR PAR')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#panel h2')?.textContent).toBe('QUE BICHO VOCÊ PUXA?');
    buttonByText(root, KITTENS_CARD_NAMES.quati.toUpperCase())!.click();
    expect(sent).toEqual([{ type: 'play', cards: pair, ask: 'quati' }]);
    mesa.destroy();
  });

  it('cego com 1 ficha: JOGAR ÀS CEGAS pergunta o alvo (adversário ou SEM ALVO); solta num assento vai com o alvo', () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1', '?2'];
    v.game.handCounts = { ...v.game.handCounts, p2: 0 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    clickCard(root, '?1');
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('SE PRECISAR DE ALVO, EM QUEM?');
    // Não dá pra saber se é Favor ou Mau-olhado: qualquer adversário vivo (até sem carta) vale.
    const p2 = root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!;
    expect(p2.classList.contains('targetable')).toBe(true);
    p2.click();
    expect(sent).toEqual([{ type: 'play', cards: ['?1'], target: 'p2' }]);
    // Recusou: tenta de novo sem alvo.
    mesa.error('Assim não forma jogada.');
    expect(root.querySelector('#caption')?.textContent).toBe('');
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    buttonByText(root, 'SEM ALVO')!.click();
    expect(sent[1]).toEqual({ type: 'play', cards: ['?1'] });
    mesa.error('Assim não forma jogada.');
    // Ficha solta num adversário: vai direto com ele de alvo.
    dragCard(root, '?2', root.querySelector('.kt-seat[data-p="p0"]')!);
    expect(sent[2]).toEqual({ type: 'play', cards: ['?2'], target: 'p0' });
    mesa.destroy();
  });

  it('cego com 2 fichas: JOGAR ÀS CEGAS pergunta o alvo (par de Tucano) e depois o bicho (vai em `ask` e `as`) ou PULAR', () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1', '?2'];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    clickCard(root, '?0');
    clickCard(root, '?2');
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    expect(sent).toEqual([]);
    // Podem ser um par de Tucano: primeiro o alvo (ou SEM ALVO), depois o bicho.
    expect(root.querySelector('#caption')?.textContent).toContain('SE PRECISAR DE ALVO, EM QUEM?');
    root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#panel h2')?.textContent).toBe('SE FOR PREGUIÇA OU BOTO, QUAL BICHO?');
    buttonByText(root, 'PULAR')!.click();
    expect(sent).toEqual([{ type: 'play', cards: ['?0', '?2'], target: 'p2' }]);
    mesa.error('Assim não forma jogada.');
    sent.length = 0;
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    buttonByText(root, 'SEM ALVO')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toBe('SE FOR PREGUIÇA OU BOTO, QUAL BICHO?');
    expect(root.querySelector('#panel h2')?.textContent).toBe('SE FOR PREGUIÇA OU BOTO, QUAL BICHO?');
    const names = [...root.querySelectorAll('#panel .kt-row button')].map((b) => b.textContent?.trim());
    expect(names).toEqual([...KITTENS_BICHOS.map((k) => KITTENS_CARD_NAMES[k].toUpperCase()), 'PULAR', 'CANCELAR']);
    buttonByText(root, KITTENS_CARD_NAMES.mico.toUpperCase())!.click();
    expect(sent).toEqual([{ type: 'play', cards: ['?0', '?2'], ask: 'mico', as: 'mico' }]);
    mesa.error('Assim não forma jogada.');
    expect(root.querySelector('#panel')?.innerHTML).toBe('');
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    buttonByText(root, 'SEM ALVO')!.click();
    buttonByText(root, 'PULAR')!.click();
    expect(sent[1]).toEqual({ type: 'play', cards: ['?0', '?2'] });
    mesa.destroy();
  });

  it('cego: o Mau-olhado de novo (mesmo tamanho de mão) desfaz a seleção das fichas', () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1', '?2'];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    clickCard(root, '?1');
    expect(root.querySelectorAll('#hand .kt-card.sel')).toHaveLength(1);
    const n = v.game.log.at(-1)!.n;
    mesa.update(toMesa({ ...v, game: { ...v.game, log: [...v.game.log, { n: n + 1, ev: { t: 'cursed', by: 'p0', target: 'p1' } }] } }));
    expect(root.querySelectorAll('#hand .kt-card.sel')).toHaveLength(0);
    expect(buttonByText(root, 'JOGAR ÀS CEGAS')).toBeUndefined();
    mesa.destroy();
  });

  it('cego se defendendo do Latidor: qualquer ficha (clique, arrasto ou o botão) vai como o Desarme', () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1', '?2'];
    v.game.choice = { kind: 'latido', who: 'p1', by: 'p0', deadline: Date.now() + 30_000 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#hand')?.classList.contains('giving')).toBe(true);
    expect(root.querySelector('#hand')?.classList.contains('defusing')).toBe(false);
    expect(root.querySelector('#caption')?.textContent).toContain('Solte uma carta virada no Latidor');
    clickCard(root, '?2');
    expect(sent).toEqual([{ type: 'choose', card: '?2' }]);
    dragCard(root, '?1', root.querySelector('.bigcard')!);
    expect(sent[1]).toEqual({ type: 'choose', card: '?1' });
    buttonByText(root, 'JOGAR DESARME')!.click();
    expect(sent[2]).toEqual({ type: 'choose', card: '?0' });
    mesa.destroy();
  });

  it('sem Desarme pro Latidor: a explosão diz que foi o Latidor (não um Tatubum comprado)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const n = v.game.log.at(-1)!.n;
    const log = [...v.game.log, { n: n + 1, ev: { t: 'barked', by: 'p1', target: 'p2' } as KittensEvent }, { n: n + 2, ev: { t: 'boom', by: 'p2' } as KittensEvent }];
    mesa.update(toMesa({ ...v, game: { ...v.game, alive: ['p0', 'p1'], log } }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector('#caption')?.textContent).toBe('P2 não tinha Desarme pro Latidor…');
    expect(root.querySelector<HTMLElement>('.bigcard')?.dataset.id).toBe('latido-0');
    await vi.advanceTimersByTimeAsync(4000);
    expect(root.querySelector('#log')?.textContent).toContain('P2 EXPLODIU!');
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('Latidor com vários se defendendo: um de cada vez, o Latidor grande late pra cada um', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    const hand = ['cafune-90', 'latido-1', ...v.game.hand.filter((id) => !id.startsWith('cafune'))];
    v.game = { ...v.game, hand, front: { p0: [], p1: [], p2: ['latido-2'] } };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    let n = v.game.log.at(-1)!.n;
    const next = (patch: Partial<KittensRoomView['game']>, ...evs: KittensEvent[]) => {
      v.game = { ...v.game, ...patch, log: [...v.game.log, ...evs.map((ev) => ({ n: ++n, ev }))] };
      mesa.update(toMesa(v));
    };
    const deadline = Date.now() + 30_000;
    // p0 jogou: primeiro o p2 (Latidor na frente) se defende…
    next({ current: 'p0', discard: [...v.game.discard, 'latido-0'], choice: { kind: 'latido', who: 'p2', by: 'p0', deadline } }, { t: 'barked', by: 'p0', target: 'p2' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('#caption')?.textContent).toContain('P2 está se defendendo do Latidor');
    // …e depois é a sua vez (o Latidor da sua mão).
    next(
      { front: { p0: [], p1: [], p2: [] }, discard: [...v.game.discard, 'cafune-5', 'latido-2'], choice: { kind: 'latido', who: 'p1', by: 'p0', deadline } },
      { t: 'cafune', by: 'p2' },
      { t: 'barked', by: 'p0', target: 'p1' },
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(root.querySelector<HTMLElement>('.bigcard[data-id^="latido"]')?.classList.contains('live')).toBe(true);
    expect(root.querySelector('#caption')?.textContent).toContain('JOGUE O DESARME');
    next(
      { hand: hand.filter((id) => id !== 'cafune-90' && id !== 'latido-1'), discard: [...v.game.discard, 'cafune-90', 'latido-1'], choice: null },
      { t: 'cafune', by: 'p1' },
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(root.querySelector('.bigcard')).toBeNull();
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log.match(/tinha TATU LATIDOR/g)).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('pulou a fila depois de um latido: o Desarme de um Tatubum comprado depois não vira o do Latidor', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const v = midGame('p1');
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    let n = v.game.log.at(-1)!.n;
    const next = (patch: Partial<KittensRoomView['game']>, ev: KittensEvent, skip = 1) => {
      n += skip;
      v.game = { ...v.game, ...patch, log: [...v.game.log, { n, ev }] };
      mesa.update(toMesa(v));
    };
    const deadline = Date.now() + 30_000;
    next({ current: 'p0', choice: { kind: 'latido', who: 'p2', by: 'p0', deadline } }, { t: 'barked', by: 'p0', target: 'p2' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector<HTMLElement>('.bigcard')?.dataset.id).toBe('latido-0');
    // Reconectou e perdeu entradas: o Desarme do P2 contra o Latidor chega pulado.
    next({ choice: null }, { t: 'cafune', by: 'p2' }, 5);
    expect(root.querySelector('.bigcard')).toBeNull();
    // Depois o P2 compra um Tatubum e joga o Desarme: é o tatu de sempre (com o soldado), sem Latidor.
    next({ current: 'p2', choice: { kind: 'tatu', who: 'p2', deadline } }, { t: 'tatu', by: 'p2' });
    await vi.advanceTimersByTimeAsync(1500);
    next({ choice: { kind: 'cafune', who: 'p2', deadline } }, { t: 'cafune', by: 'p2' });
    await vi.advanceTimersByTimeAsync(50);
    expect(root.querySelector('.bigcard[data-id^="latido"]')).toBeNull();
    expect(root.querySelector('.bigcard[data-id^="tatubum"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(600);
    expect(root.querySelector('.soldier')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(errors).not.toHaveBeenCalled();
    mesa.destroy();
    errors.mockRestore();
  });

  it('cego: puxou da Preguiça ou roubou o Desarme sem ver a carta, o diário diz de quem', async () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1'];
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const n = v.game.log.at(-1)!.n;
    const log = [
      ...v.game.log,
      { n: n + 1, ev: { t: 'called', by: 'p1', ask: 'mico', from: 'p2', card: null } as KittensEvent },
      { n: n + 2, ev: { t: 'grabbed', by: 'p1', from: 'p0', card: null } as KittensEvent },
    ];
    mesa.update(toMesa({ ...v, game: { ...v.game, hand: ['?0', '?1', '?2', '?3'], log } }));
    await vi.advanceTimersByTimeAsync(3000);
    const text = root.querySelector('#log')?.textContent ?? '';
    expect(text).toContain('Você puxou um bicho de P2');
    expect(text).not.toContain('Ninguém tinha');
    expect(text).toContain('Você roubou o DESARME de P0');
    mesa.destroy();
  });

  it('trio de Favor pede um adversário com carta (clicando ou soltando a seleção num assento) e manda o alvo', () => {
    const v = midGame('p1');
    v.game.hand = ['favor-90', 'favor-91', 'favor-92', ...v.game.hand];
    v.game.handCounts = { ...v.game.handCounts, p2: 0 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    for (const id of ['favor-90', 'favor-91', 'favor-92']) clickCard(root, id);
    buttonByText(root, 'JOGAR TRIO')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('Escolha um adversário');
    // Como o Favor sozinho: quem está sem carta não pode ser o alvo.
    expect(root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!.classList.contains('targetable')).toBe(false);
    const p0 = root.querySelector<HTMLElement>('.kt-seat[data-p="p0"]')!;
    expect(p0.classList.contains('targetable')).toBe(true);
    p0.click();
    expect(sent).toEqual([{ type: 'play', cards: ['favor-90', 'favor-91', 'favor-92'], target: 'p0' }]);
    // Recusou: a seleção continua; arrastada pra um assento, vai com ele de alvo.
    mesa.error('Não deu.');
    dragCard(root, 'favor-91', root.querySelector('.kt-seat[data-p="p0"]')!);
    expect(sent[1]).toEqual({ type: 'play', cards: ['favor-90', 'favor-91', 'favor-92'], target: 'p0' });
    mesa.destroy();
  });

  it('cego com 3 fichas: pergunta o alvo (podem ser 3 Favores)', () => {
    const v = midGame('p1');
    v.game.blind = ['p1'];
    v.game.hand = ['?0', '?1', '?2', '?3'];
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    for (const id of ['?0', '?1', '?2']) clickCard(root, id);
    buttonByText(root, 'JOGAR ÀS CEGAS')!.click();
    expect(sent).toEqual([]);
    expect(root.querySelector('#caption')?.textContent).toContain('SE PRECISAR DE ALVO, EM QUEM?');
    root.querySelector<HTMLElement>('.kt-seat[data-p="p2"]')!.click();
    expect(sent).toEqual([{ type: 'play', cards: ['?0', '?1', '?2'], target: 'p2' }]);
    mesa.destroy();
  });

  it('trio de Favor contra você: o painel diz quantas faltam e cada clique dá uma carta', () => {
    const v = midGame('p1');
    const hand = ['ataque-90', 'pular-91', 'espiar-92', 'mico-93'];
    v.game.hand = hand;
    v.game.choice = { kind: 'favor', who: 'p1', to: 'p0', left: 3, deadline: Date.now() + 30_000 };
    const { root, mesa, sent } = mount();
    mesa.update(toMesa(v));
    expect(root.querySelector('#panel h2')?.textContent).toContain('DÊ 3 CARTAS PRA P0');
    expect(root.querySelector('#caption')?.textContent).toContain('DÊ 3 CARTAS PRA P0');
    expect(root.querySelector('#hand')!.classList.contains('giving')).toBe(true);
    clickCard(root, 'pular-91');
    expect(sent).toEqual([{ type: 'choose', card: 'pular-91' }]);
    // Deu uma: a escolha continua aberta com 2.
    const after = { ...v, game: { ...v.game, hand: hand.filter((c) => c !== 'pular-91'), choice: { ...v.game.choice, left: 2 } } };
    mesa.update(toMesa(after));
    expect(root.querySelector('#panel h2')?.textContent).toContain('MAIS 2 CARTAS PRA P0');
    expect(root.querySelector('#hand')!.classList.contains('giving')).toBe(true);
    clickCard(root, 'mico-93');
    expect(sent[1]).toEqual({ type: 'choose', card: 'mico-93' });
    const last = { ...after, game: { ...after.game, hand: ['ataque-90', 'espiar-92'], choice: { ...v.game.choice, left: 1 } } };
    mesa.update(toMesa(last));
    expect(root.querySelector('#panel h2')?.textContent).toContain('MAIS UMA CARTA PRA P0');
    dragCard(root, 'espiar-92', root.querySelector('#table')!);
    expect(sent[2]).toEqual({ type: 'choose', card: 'espiar-92' });
    mesa.destroy();
  });

  it('trio de Favor: os outros leem quantas cartas vão; o Favor sozinho continua "FAVOR PRA"', () => {
    const choice = { kind: 'favor' as const, who: 'p1', to: 'p0', left: 3, deadline: Date.now() + 30_000 };
    const other = midGame('p2');
    other.game.choice = choice;
    const a = mount();
    a.mesa.update(toMesa(other));
    expect(a.root.querySelector('#caption')?.textContent).toContain('P1 vai dar 3 cartas pra P0');
    a.mesa.destroy();
    const receiver = midGame('p0');
    receiver.game.choice = choice;
    const b = mount();
    b.mesa.update(toMesa(receiver));
    expect(b.root.querySelector('#caption')?.textContent).toContain('P1 vai dar 3 cartas pra você');
    b.mesa.destroy();
    const single = midGame('p1');
    single.game.choice = { ...choice, left: 1 };
    const c = mount();
    c.mesa.update(toMesa(single));
    expect(c.root.querySelector('#panel h2')?.textContent).toContain('FAVOR PRA P0');
    c.mesa.destroy();
  });

  it('trio de Favor que valeu: o diário diz quantas cartas vão de verdade (a mão toda, se tiver menos de 3)', async () => {
    const v = midGame('p2');
    const play = { kind: 'trio' as const, cards: ['favor-1', 'favor-2', 'favor-3'], target: 'p1', ask: null, as: 'favor' as const };
    v.game = {
      ...v.game,
      current: 'p0',
      handCounts: { ...v.game.handCounts, p1: 2 },
      pending: { by: 'p0', play, nopes: [], resolvesAt: Date.now() + 5000 },
    };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const n = v.game.log.at(-1)?.n ?? 0;
    const choice = { kind: 'favor' as const, who: 'p1', to: 'p0', left: 2, deadline: Date.now() + 30_000 };
    const ev: KittensEvent = { t: 'resolved', by: 'p0', play: 'trio', canceled: false };
    mesa.update(toMesa({ ...v, game: { ...v.game, pending: null, choice, log: [...v.game.log, { n: n + 1, ev }] } }));
    await vi.advanceTimersByTimeAsync(3000);
    const log = root.querySelector('#log')?.textContent ?? '';
    expect(log).toContain('P1 vai dar 2 cartas pra P0');
    expect(log).not.toContain('vai dar 3 cartas');
    mesa.destroy();
  });

  it('a espiada continua ao lado do monte depois que a vez passa, e encolhe quando a de cima é comprada', async () => {
    const v = midGame('p0');
    v.game = { ...v.game, current: 'p0', peek: ['mico-71', 'pular-72', 'quati-73'], peekers: ['p0'] };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const future = () => [...root.querySelectorAll<HTMLElement>('#future .kt-card')].map((el) => el.dataset.id);
    expect(future()).toEqual(['mico-71', 'pular-72', 'quati-73']);
    // A vez passou pro p1 (Pular, por exemplo): a espiada fica.
    const n = v.game.log.at(-1)?.n ?? 0;
    const passed = { ...v.game, current: 'p1', log: [...v.game.log, { n: n + 1, ev: { t: 'resolved', by: 'p0', play: 'pular', canceled: false } as KittensEvent }] };
    mesa.update(toMesa({ ...v, game: passed }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(future()).toEqual(['mico-71', 'pular-72', 'quati-73']);
    expect(root.querySelector('#future')?.textContent).toContain('O FUTURO');
    // O p1 comprou a de cima: some só ela.
    const drawn = { ...passed, current: 'p2', peek: ['pular-72', 'quati-73'], log: [...passed.log, { n: n + 2, ev: { t: 'draw', by: 'p1', card: null } as KittensEvent }] };
    mesa.update(toMesa({ ...v, game: drawn }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(future()).toEqual(['pular-72', 'quati-73']);
    mesa.destroy();
  });

  it('quem tem espiada à mostra ganha o olhinho no assento (sem mostrar as cartas)', () => {
    const v = midGame('p0');
    v.game = { ...v.game, peek: null, peekers: ['p1'] };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const eye = root.querySelector<HTMLElement>('.kt-seat[data-p="p1"] .kt-peeked');
    expect(eye).not.toBeNull();
    expect(eye!.title).toContain('espiou');
    expect(root.querySelector('.kt-seat[data-p="p2"] .kt-peeked')).toBeNull();
    expect(root.querySelectorAll('#future .kt-card')).toHaveLength(0);
    // Os dois espiaram: os dois assentos têm o olhinho.
    mesa.update(toMesa({ ...v, game: { ...v.game, peekers: ['p1', 'p2'] } }));
    expect(root.querySelectorAll('.kt-seat .kt-peeked')).toHaveLength(2);
    mesa.destroy();
  });

  it('espiada com mais de 3 cartas (Feitiço pondo no topo, pedido do Rafa, 2026-10-21): mostra todas, encavaladas no espaço das 3', async () => {
    const v = midGame('p0');
    const four = ['tatubum-70', 'mico-71', 'pular-72', 'quati-73'];
    v.game = { ...v.game, current: 'p0', peek: four, peekers: ['p0'] };
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    const fut = root.querySelector<HTMLElement>('#future')!;
    expect([...fut.querySelectorAll<HTMLElement>('.kt-card')].map((el) => el.dataset.id)).toEqual(four);
    expect(fut.style.getPropertyValue('--fut-gaps')).toBe('3');
    // Com 3 ou menos, o passo de sempre (64px no computador).
    mesa.update(toMesa({ ...v, game: { ...v.game, peek: four.slice(1) } }));
    expect(fut.style.getPropertyValue('--fut-gaps')).toBe('2');
    const css = Object.values(await siteCss()).join('\n');
    expect(css).toContain('.kittens .kt-mesa #future .kt-card { transform: scale(.38); transform-origin: left top; margin-bottom: calc(128px / var(--fut-gaps, 2) - 160px); }');
    mesa.destroy();
  });

  it('zoom e galeria do Espiar dizem só o que a carta faz', () => {
    expect(mesaSrc).toContain(
      "espiar: 'Você vê as 3 cartas de cima do monte, só você. Elas ficam à mostra pra você até serem compradas ou o monte mudar de ordem; se quem mexe é você (Feitiço, Desarme, Quati), continua vendo o que sabe.'",
    );
    expect(mesaSrc).toContain('Elas ficam à mostra pra você até serem compradas ou o monte mudar de ordem.<br>Se quem muda a ordem é você, continua vendo o que sabe:');
    expect(mesaSrc).toContain('com o tatu nela se ele cair no meio ou logo abaixo dela.<br>Pode levar Nem vem!.');
    expect(mesaSrc).not.toContain('a vez passar ou o monte mudar');
  });

  it('zoom do Favor e dos bichos explicam o trio de Favor (só o que a carta faz)', () => {
    expect(mesaSrc).toContain('<b>Três Favores juntos</b>: o adversário escolhido te dá <b>3 cartas</b>');
    expect(mesaSrc).toContain('(3 Favores: o adversário escolhido te dá 3 cartas)');
    expect(mesaSrc).toContain('TRIO de qualquer carta rouba um Desarme (3 FAVORES: o escolhido te dá 3 cartas)');
  });

  it('a dica do Latidor na frente de alguém usa o nome sem escapar', () => {
    const v = midGame('p1');
    v.game.front = { p0: ['latido-0'], p1: [], p2: [] };
    const s = toMesa(v);
    const seats = s.seats.map((x) => (x.id === 'p0' ? { ...x, name: 'Ana & <Bia>' } : x));
    const { root, mesa } = mount();
    mesa.update({ ...s, seats });
    expect(root.querySelector<HTMLElement>('.kt-seat[data-p="p0"] .kt-front')?.title).toBe('Na frente de Ana & <Bia>');
    mesa.destroy();
  });

  it('nenhuma regra sem escopo do CSS do site pega classe da mesa', async () => {
    // Classes que a mesa desenha (mesa toda, galeria, painel) + as que o código cria nas animações.
    const v = viewOf(started(3), 'p0');
    const { root, mesa } = mount();
    mesa.update(toMesa(v));
    root.querySelector<HTMLButtonElement>('#cards')!.click();
    const mine = new Set<string>();
    root.querySelectorAll('*').forEach((el) => el.classList.forEach((c) => mine.add(c)));
    const code = mesaSrc + '\n' + fxSrc;
    for (const m of code.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`$]+)/g)) m[1]!.split(/\s+/).filter(Boolean).forEach((c) => mine.add(c));
    for (const m of code.matchAll(/classList\.(?:add|toggle)\(([^)]*)\)/g)) for (const s of m[1]!.matchAll(/'([\w-]+)'/g)) mine.add(s[1]!);
    mesa.destroy();

    const css = await siteCss();
    expect(css['table/table.css']).toContain('.card');
    expect(mine.has('kt-card') && mine.has('kt-seat') && mine.has('flying')).toBe(true);
    const leaks: string[] = [];
    for (const [file, text] of Object.entries(css).filter(([f]) => !f.endsWith('kittens.css'))) {
      const rules = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of rules.matchAll(/([^{}@;]+)\{/g)) {
        for (const sel of m[1]!.split(',').map((s) => s.trim())) {
          // Sem os parênteses (:not(.x), :where(...)): só as classes que o seletor exige.
          const classes = [...sel.replace(/\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)].map((x) => x[1]!);
          // Pega um elemento da mesa se TODA classe do seletor existe na mesa (ancestrais incluídos).
          if (classes.length && classes.every((c) => mine.has(c))) leaks.push(`${file}: ${sel}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
