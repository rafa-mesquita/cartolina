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
  type KittensRoomView,
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
  return res.room;
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
    v.game.choice = { kind: 'latido', who: 'p1', deadline: Date.now() + 30_000 };
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
    w.game.choice = { kind: 'latido', who: 'p1', deadline: Date.now() + 30_000 };
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
    expect(m2.sent).toEqual([{ type: 'nope', card: '?1' }]);
    m2.mesa.destroy();
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
