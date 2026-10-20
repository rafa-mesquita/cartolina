/*
 * A mesa do Tatubum: porta do motor imperativo do protótipo (`prototipo/tatubum/index.html`) como uma "ilha" que o
 * React monta num <div>. A sala manda a visão nova por `update()` (diff do diário pelo `n`, fila de efeitos, desenho)
 * e as jogadas saem por `opts.send(action)` pro servidor (no protótipo iam pras regras locais).
 *
 * Diferenças intencionais em relação ao protótipo: sem menu, bots locais, "derrubar bot" nem velocidade dos bots;
 * `ME` = `you` (null = assistindo); nomes, cores e quem caiu vêm dos assentos; prazos pela hora do servidor
 * (`opts.now()`); no fim só o host vê JOGAR DE NOVO / VOLTAR PRO LOBBY; erro do servidor vira o toast da mesa.
 */
import {
  KITTENS_BICHOS,
  KITTENS_CARD_KINDS,
  KITTENS_CARD_NAMES,
  kittensKindOf,
  type GameAction,
  type KittensAction,
  type KittensCardKind,
  type KittensEvent,
  type KittensPending,
  type KittensPlayKind,
  type KittensView,
  type SeatView,
} from '@cartolina/shared';
import { ART, SOLDADO, VERSO } from './art';
import { Cerrado } from './cerrado';
import { Fx, type At, type Box } from './fx';
import { Sound } from './sounds';
import { Sprites } from './sprites';
import './kittens.css';

export interface MesaOptions {
  /** Manda a ação pro servidor. */
  send(action: GameAction): void;
  /** Hora do servidor (Date.now() + serverOffset). */
  now(): number;
  /** Semente do cerrado (a mesma do lobby: seedOf(code)). */
  seed: number;
}

export interface MesaState {
  view: KittensView;
  you: string | null;
  hostId: string | null;
  seats: SeatView[];
}

export interface Mesa {
  /** Visão nova da sala: redesenha e enfileira os efeitos das entradas novas do diário. */
  update(state: MesaState): void;
  /** Ação recusada pelo servidor: toast + som de erro. */
  error(message: string): void;
  /** Para animações, timers, listeners de janela e o canvas. */
  destroy(): void;
}

// ---------------------------------------------------------------- constantes (só leitura)
/** Id que nunca é de jogador: quem só assiste (`you` null ou fora da partida). */
const SPECTATOR = '\u0000assistindo';

/** Nome do par no diário, pelo bicho. */
const PAIR_LABEL: Partial<Record<KittensCardKind, string>> = {
  mico: 'PAR DE MICO',
  quati: 'PAR DE QUATI',
  tamandua: 'PAR DE TAMANDUÁ',
  preguica: 'PAR DE PREGUIÇA',
  capivara: 'RODA DE CAPIVARA',
};
const PLAY_LABEL: Record<KittensPlayKind, string> = {
  ataque: 'ATAQUE',
  pular: 'PULAR',
  favor: 'FAVOR',
  embaralhar: 'EMBARALHAR',
  espiar: 'ESPIAR',
  par: 'PAR',
  trio: 'TRIO',
  cinco: '5 DIFERENTES',
};
const ACTION_KINDS: readonly string[] = ['ataque', 'pular', 'favor', 'embaralhar', 'espiar'];
const BICHOS: readonly string[] = KITTENS_BICHOS;

/**
 * Cada carta com a cor dela (pedido do Rafa): o fundo é um cerrado em pixel art nessa cor (desenhado em código) e o
 * personagem vem recortado por cima.
 */
const CARD_COLOR: Record<KittensCardKind, string> = {
  tatubum: '#e4572e', cafune: '#f2c14e', nemvem: '#c86fd4', ataque: '#9aa7bd', pular: '#5aa0e6', favor: '#f29bc0',
  embaralhar: '#8d7ae6', espiar: '#3fa7c9', capivara: '#5cc8b8', mico: '#f4a259', quati: '#c79a6a', tamandua: '#b0b8c8', preguica: '#a8bf6a',
};

/** Olho em pixel art (12×8), desenhado com retângulos. */
const EYE_SVG = (() => {
  const rows = [
    '....kkkk....',
    '..kkwwwwkk..',
    '.kwwwppwwwk.',
    'kwwwpppwwwwk',
    'kwwwppppwwwk',
    '.kwwwppwwwk.',
    '..kkwwwwkk..',
    '....kkkk....',
  ];
  const pal: Record<string, string> = { k: '#050510', w: '#fff3e0', p: '#2b6fd6' };
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `<svg viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg">${r}<rect x="5" y="3" width="1" height="1" fill="#ffffff"/></svg>`;
})();

/**
 * Explicação completa de cada carta, que aparece no zoom (pedido do Rafa: na mão fica só o básico).
 * Cada bicho explica o próprio par; o trio e os 5 diferentes valem pra qualquer carta.
 */
const COMBO_TEXT = '<br><b>TRIO</b> (3 cartas iguais de qualquer tipo): você rouba um <b>Desarme</b> de um adversário que tenha.<br><b>5 DIFERENTES</b>: você pega <b>duas cartas</b> que quiser do descarte (do jeito que ele estava antes da jogada), uma de cada vez, no quadro do descarte.<br>Combos podem levar Nem vem!.';
const PAIR_DETAIL: Partial<Record<KittensCardKind, string>> = {
  mico: '<b>PAR DE MICO</b>: <b>todo mundo, menos você, descarta uma carta</b> à escolha, todos ao mesmo tempo (30 segundos; depois vai uma ao acaso). O efeito da carta descartada não vale, e todos veem o que foi pro descarte.',
  quati: '<b>PAR DE QUATI</b>: só você vê a carta de cima do monte e decide se ela fica em cima ou vai pro fundo. Todo mundo sabe se foi pro fundo, ninguém sabe qual era.',
  tamandua: '<b>PAR DE TAMANDUÁ</b>: você compra 2 cartas de cima. Se vier <b>Tatubum</b>, ele vai pro fundo do monte sem você gastar Desarme. A vez continua: depois você ainda compra normalmente.',
  preguica: '<b>PAR DE PREGUIÇA</b>: diga um bicho; você puxa essa carta de um adversário que tenha (sorteado). Se ninguém tiver, procura no monte.',
  capivara: '<b>RODA DE CAPIVARA</b>: todo mundo, menos você, passa uma carta ao acaso pro próximo da vez. Você recebe a do jogador antes de você.',
};
const DETAIL: Partial<Record<KittensCardKind, string>> = {
  tatubum: 'O tatu-bola com o pavio aceso. Comprou esta carta e não tem Desarme? <b>Explodiu</b> e saiu do jogo.<br>Com Desarme, <b>você joga o Desarme</b> (30 segundos, senão ele vai sozinho), o tatu soldado corta o fio e você esconde o Tatubum de volta no monte, onde quiser.<br>O monte tem sempre um Tatubum a menos que o número de jogadores vivos.',
  cafune: 'Você joga na hora em que compra um Tatubum: <b>arraste o Desarme pro tatu</b> (ou clique nele). Tem 30 segundos; se não jogar, ele vai sozinho e o tatu volta pra um lugar sorteado.<br>O tatu soldado corta o fio e você não explode. Aí você escolhe <b>em segredo</b> onde o Tatubum volta no monte (no topo, no fundo, em qualquer posição ou ao acaso) e gasta um turno.<br>Não dá pra jogar Desarme fora dessa hora, nem cancelar com Nem vem!.',
  nemvem: 'Cancela a carta que está no ar, <b>mesmo fora da sua vez</b>.<br>Toda carta jogada fica 5 segundos no ar esperando um Nem vem!, e cada Nem vem! recomeça os 5 segundos.<br>Dá pra dar Nem vem! no Nem vem!: conta quantos foram, número ímpar cancela e par deixa valer.<br>Não cancela o Tatubum nem o Desarme.',
  ataque: 'Termina a sua vez <b>sem comprar</b>, e o próximo joga <b>2 turnos</b> seguidos.<br>Se você estava sob ataque, passa os turnos que você ainda devia + 2 (2 → 4 → 6…).<br>Pode levar Nem vem!.',
  pular: 'Termina um turno seu <b>sem comprar</b> carta.<br>Se você estava sob ataque (devendo 2 turnos), gasta só um deles e continua na vez.<br>Pode levar Nem vem!.',
  favor: 'Escolha um adversário que tenha carta na mão: <b>ele escolhe</b> uma carta dele pra te dar.<br>Só vocês dois veem qual carta foi. Ele tem 30 segundos pra escolher; depois vai uma ao acaso.<br>Pode levar Nem vem!.',
  embaralhar: 'Embaralha o monte inteiro.<br>Bom quando você (ou alguém) espiou e sabe que tem Tatubum em cima, ou quando alguém acabou de esconder um tatu num lugar que você não sabe.<br>Pode levar Nem vem!.',
  espiar: 'Você vê as <b>3 cartas de cima</b> do monte, na ordem, só você.<br>Elas ficam à mostra ao lado do monte até você comprar, a vez passar ou o monte mudar.<br>Pode levar Nem vem!.',
};
const detailOf = (k: KittensCardKind): string => DETAIL[k] ?? `Sozinho não faz nada.<br>${PAIR_DETAIL[k] ?? ''}${COMBO_TEXT}`;

/** Frase curta de cada carta na galeria. */
const ABOUT: Record<KittensCardKind, string> = {
  tatubum: 'Comprou e não tem Desarme? Explodiu, tá fora. Tem sempre um a menos que o número de jogadores.',
  cafune: 'Jogue quando comprar o Tatubum (30 s, senão vai sozinho): o tatu soldado corta o fio e o tatu volta pro monte onde você quiser, em segredo.',
  nemvem: 'Cancela a carta no ar, mesmo fora da sua vez. Dá pra dar Nem vem! no Nem vem!.',
  ataque: 'Termina sua vez sem comprar. O próximo joga 2 turnos (ou os seus + 2, se você estava sob ataque).',
  pular: 'Termina um turno seu sem comprar.',
  favor: 'Um adversário escolhe uma carta da mão dele pra te dar.',
  embaralhar: 'Embaralha o monte. Bom quando você sabe que tem tatu em cima.',
  espiar: 'Você vê as 3 cartas de cima do monte. Só você.',
  capivara: 'Par: todo mundo, menos você, passa uma carta pro próximo.',
  mico: 'Par: todo mundo, menos você, descarta uma carta (o efeito não vale).',
  quati: 'Par: vê a de cima e decide se vai pro fundo.',
  tamandua: 'Par: compra 2; Tatubum vai pro fundo. A vez continua.',
  preguica: 'Par: puxa o bicho que você pedir.',
};

const TIMER = '<span class="timer" data-timer></span>';
/** Legendas dos modos de escolha (par de Preguiça pede bicho, Favor pede adversário). */
const ASK_CAPTION = 'Que bicho você quer puxar?';
const TARGET_CAPTION = 'Escolha um adversário <span class="timer">↑</span>';

/** O palco do protótipo (o menu e o painel de teste saíram; a galeria abre pelo botão da barra de cima). */
const TEMPLATE = `
<div id="stage">
  <canvas id="bg"></canvas>
  <div id="topbar">
    <div id="logo">TATUBUM</div>
    <div id="turn"></div>
    <div id="topright">
      <button type="button" class="kt-btn small ghost" id="cards"><span>AS CARTAS</span></button>
      <button type="button" class="kt-btn small ghost" id="sound"><span>SOM: SIM</span></button>
    </div>
  </div>
  <div id="seats"></div>
  <div id="board">
    <div id="caption"></div>
    <div id="table">
      <div class="slot" id="deck"><div class="stack"></div><div class="label"></div></div>
      <div id="future"></div>
      <div class="slot" id="air"></div>
      <div id="bar"></div>
      <div class="slot" id="discard"><div class="label">descarte</div></div>
      <button type="button" id="eye" title="Ver todas as cartas do descarte"></button>
    </div>
    <div id="log"></div>
    <div id="hand"></div>
    <div id="actions"></div>
    <div id="panel"></div>
    <div id="viewer"></div>
    <div id="toast"></div>
  </div>
  <div id="gallery" hidden></div>
  <div id="pile" hidden></div>
  <div id="over" hidden></div>
  <div id="fxlayer"></div>
  <canvas id="particles"></canvas>
</div>`;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
/** Id pra seletor de atributo (CSS.escape; o jsdom não tem, aí escapa à mão). */
const cssId = (s: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
const kindOf = (id: string): KittensCardKind | null => kittensKindOf(id);
const cardName = (k: KittensCardKind): string => KITTENS_CARD_NAMES[k].toUpperCase();
/** Nome (em maiúsculas) da carta de um id; "UMA CARTA" se o id não é de carta. */
const cardNameOf = (id: string): string => {
  const k = kindOf(id);
  return k ? cardName(k) : 'UMA CARTA';
};

// ---------------------------------------------------------------- tipos internos
interface PlayReq {
  cards: string[];
  target?: string;
  ask?: KittensCardKind;
}
type Mode = { type: 'target'; play: PlayReq; kind: KittensPlayKind } | { type: 'ask'; play: PlayReq };
type DropTarget =
  | { type: 'tatu'; el: Element }
  | { type: 'seat'; p: string; el: Element }
  | { type: 'table'; el: Element }
  | { type: 'hand'; el: Element };
interface Drag {
  id: string;
  x0: number;
  y0: number;
  moved: boolean;
  ghost: HTMLElement | null;
  ids: string[];
  hover: Element | null;
}
type Timer = ReturnType<typeof setTimeout>;
interface TatuFx {
  big: HTMLElement;
  sp: Timer | null;
  cx: number;
}

export function createMesa(root: HTMLElement, opts: MesaOptions): Mesa {
  // O CSS da mesa é escopado em `.kittens .kt-mesa`: se o React montou fora de um `.kittens`, o root vira um.
  const addedKittens = !root.closest('.kittens');
  if (addedKittens) root.classList.add('kittens');
  const wrap = document.createElement('div');
  wrap.className = 'kt-mesa';
  wrap.innerHTML = TEMPLATE;
  root.appendChild(wrap);

  const $ = <T extends Element = HTMLElement>(sel: string): T => {
    const el = wrap.querySelector<T>(sel);
    if (!el) throw new Error(`mesa: ${sel} não existe`);
    return el;
  };
  const q = (sel: string): HTMLElement | null => wrap.querySelector<HTMLElement>(sel);
  const handCard = (id: string): HTMLElement | null => q(`#hand .kt-card[data-id="${cssId(id)}"]`);
  const stage = $('#stage');

  // ---------------------------------------------------------------- timers (todos limpos no destroy)
  let destroyed = false;
  const timeouts = new Set<Timer>();
  const intervals = new Set<Timer>();
  function later(fn: () => void, ms: number): Timer | null {
    if (destroyed) return null;
    const t = setTimeout(() => {
      timeouts.delete(t);
      fn();
    }, ms);
    timeouts.add(t);
    return t;
  }
  function cancel(t: Timer | null): void {
    if (!t) return;
    clearTimeout(t);
    timeouts.delete(t);
  }
  function every(fn: () => void, ms: number): Timer | null {
    if (destroyed) return null;
    const t = setInterval(fn, ms);
    intervals.add(t);
    return t;
  }
  function stopEvery(t: Timer | null): void {
    if (!t) return;
    clearInterval(t);
    intervals.delete(t);
  }
  /** Espera da fila de efeitos (no destroy ela some e a fila para ali). */
  const wait = (ms: number): Promise<void> => new Promise((r) => { later(r, ms); });

  // ---------------------------------------------------------------- jogadores (vêm da sala)
  let ME = SPECTATOR;
  let hostId: string | null = null;
  let seats: SeatView[] = [];
  let players: string[] = [];
  let view: KittensView | null = null;

  const seatOf = (p: string): SeatView | undefined => seats.find((s) => s.id === p);
  /** Nome pra pôr no HTML (escapado); "Você" pra quem está nesta tela. */
  const nameOf = (p: string): string => (p === ME ? 'Você' : esc(seatOf(p)?.name ?? p));
  const upName = (p: string): string => (p === ME ? 'VOCÊ' : esc((seatOf(p)?.name ?? p).toUpperCase()));
  const colorOf = (p: string): string => seatOf(p)?.color ?? '#9fb0d8';
  /** Quem só assiste (entrou depois ou não tem lugar): mesa só de leitura. */
  const spectating = (): boolean => !players.includes(ME);
  /** Os outros jogadores na ordem da vez a partir de você (você → assentos da esquerda pra direita → você). */
  function others(): string[] {
    const i = players.indexOf(ME);
    return i < 0 ? [...players] : [...players.slice(i + 1), ...players.slice(0, i)];
  }
  const act = (a: KittensAction): void => opts.send(a);

  // ---------------------------------------------------------------- palco
  // A altura manda; a largura cresce até a do espaço da mesa (sem faixas vazias nos lados), como no Diquisti.
  let scale = 1;
  let stageW = 1440;
  let bgWidth = 0;
  function fit(): void {
    if (destroyed) return;
    const W = wrap.clientWidth || window.innerWidth;
    const H = wrap.clientHeight || window.innerHeight;
    scale = H / 900;
    stageW = W / scale;
    if (stageW < 1440) { scale = W / 1440; stageW = 1440; }
    stageW = Math.round(stageW);
    stage.style.width = stageW + 'px';
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    const p = $<HTMLCanvasElement>('#particles');
    p.width = Math.ceil(stageW / 4);
    p.height = 225;
    // O cerrado é redesenhado só quando a largura muda bastante (o resize dispara muito).
    const w = Math.round((180 * stageW) / 900);
    if (Math.abs(w - bgWidth) > 2) { bgWidth = w; Cerrado.start($<HTMLCanvasElement>('#bg'), opts.seed, w); }
    // O bloco central cresce com a tela (até 1760), pra mesa e mão aproveitarem a largura.
    $('#board').style.setProperty('--bw', Math.min(stageW, 1760) + 'px');
    if (view) { renderSeats(); renderHand(); }
  }
  Fx.init(stage, $('#fxlayer'), $<HTMLCanvasElement>('#particles'), () => scale);

  // ---------------------------------------------------------------- fila de efeitos
  /** Um efeito: `run` anima; `skip` é o que fica dele quando a fila é pulada (a linha do diário, o quadro do descarte). */
  interface QueueItem {
    run: () => Promise<void>;
    skip?: () => void;
  }
  const queue: QueueItem[] = [];
  let running = false;
  function enqueue(item: QueueItem): void {
    queue.push(item);
    if (!running) void runQueue();
  }
  async function runQueue(): Promise<void> {
    running = true;
    while (queue.length && !destroyed) {
      try { await queue.shift()!.run(); } catch (e) { if (!destroyed) console.error(e); }
    }
    running = false;
    if (destroyed) return;
    settle();
  }
  /**
   * A fila esvaziou (ou foi pulada): nada fica escondido esperando um efeito. Cartas chegando e a carta no ar
   * aparecem, o tatu grande só fica enquanto alguém tem que jogar o Desarme e, no fim sem festa (ninguém sobrou),
   * os botões aparecem.
   */
  function settle(): void {
    if (destroyed || !view) return;
    arriving.clear();
    airHidden = false;
    if (view.choice?.kind === 'tatu') showTatu();
    else if (tatuFx) clearTatu();
    if (view.phase === 'gameover' && overStage !== 'full') overStage = 'full';
    render();
  }
  /**
   * Pula os efeitos que estão esperando (aba escondida, fila atrasada, buraco no diário depois de reconectar):
   * só as linhas do diário entram, sem animação, e a mesa mostra a visão de agora. O efeito que já está rodando
   * termina sozinho.
   */
  function fastForward(items: QueueItem[]): void {
    for (const it of [...queue.splice(0), ...items]) {
      try { it.skip?.(); } catch (e) { console.error(e); }
    }
    holdPanel = running && holdPanel;
    settle();
    sayState();
  }
  /** Fila maior que isso quando chega visão nova = atrasada demais: pula. */
  const MAX_BACKLOG = 4;
  /** Uma visão só com mais entradas novas que isso (ex.: voltou depois de muito tempo) também é pulada. */
  const MAX_BATCH = 12;
  const onVisibility = (): void => { if (document.hidden && queue.length) fastForward([]); };

  // ---------------------------------------------------------------- estado da tela
  let lastN = -1;
  let selected = new Set<string>();
  let mode: Mode | null = null;
  const arriving = new Set<string>();
  let airHidden = false;
  let captionText = '';
  let lastTic = 0;
  /** O Tatubum grande tremendo no meio da mesa enquanto quem comprou não joga o Desarme. */
  let tatuFx: TatuFx | null = null;
  /** Fim de jogo: 'hidden' → 'title' (só o nome, durante os fogos) → 'full' (fundo escuro e botões). */
  let overStage: 'hidden' | 'title' | 'full' = 'hidden';
  /** Quadro do descarte: aberto? aberto pra escolher dos 5 diferentes? */
  let pileOpen = false;
  let pileForPick = false;
  let pileKey = '';
  /** Quantas o 5 diferentes mandou pegar no começo (pra dizer "mais uma" só na segunda). */
  let cincoFirst = 2;
  const logLines: { text: string; cls: string }[] = [];
  /** Fundo de cada tipo de carta (cerrado na cor dela), desenhado uma vez. */
  const sceneCache = new Map<KittensCardKind, string>();
  /** Bichinho de cada cor já desenhado (URL pronta). */
  const critterUrls = new Map<string, string>();
  /** Jogada mandada pro servidor e ainda sem resposta (não manda de novo com clique duplo). */
  let inFlight = false;

  function onState(next: KittensView): void {
    const prev = view;
    const rects = handRects();
    view = next;
    const v = next;
    // A resposta da jogada chegou (ou a vez andou): o pedido não está mais no ar.
    inFlight = false;
    // Partida nova (JOGAR DE NOVO, ou lobby e começar de novo): o diário recomeça do zero (senão as jogadas novas
    // ficariam sem animação).
    if (prev && prev.phase !== 'playing' && v.phase === 'playing') { lastN = -1; logLines.length = 0; outBy = null; clearTatu(); closePile(true); }
    noteOut(v.log);
    // Primeira visão no meio da partida (recarregou a página, voltou pra sala): mostra como está, sem repetir as animações.
    if (!prev && v.phase !== 'lobby' && v.log.length) {
      for (const e of v.log.slice(-14)) logLines.push({ text: textOf(e.ev, null), cls: logClass(e.ev) });
      lastN = v.log[v.log.length - 1]!.n;
      if (v.phase === 'gameover') overStage = 'full';
      render();
      if (v.choice?.kind === 'tatu') showTatu();
      const c = v.choice;
      if (c?.kind === 'cinco' && c.who === ME) { cincoFirst = c.left; openPile(); }
      sayChoice();
      return;
    }
    const seenN = lastN;
    const fresh = v.log.filter((e) => e.n > lastN);
    if (v.log.length) lastN = v.log[v.log.length - 1]!.n;
    for (const id of v.hand) if (!prev || !prev.hand.includes(id)) arriving.add(id);
    if (fresh.some((e) => e.ev.t === 'play' || e.ev.t === 'nope')) airHidden = true;
    for (const id of [...selected]) if (!v.hand.includes(id)) selected.delete(id);
    if (v.phase !== 'playing' || v.current !== ME || v.pending || v.choice) mode = null;
    if (prev && prev.current !== ME && v.current === ME && v.phase === 'playing') Sound.play('turn');
    render();

    const items: QueueItem[] = [];
    if (v.phase === 'playing' && (!prev || prev.phase !== 'playing')) items.push({ run: () => dealAnim() });
    for (const e of fresh) {
      items.push({ run: () => animate(e.ev, prev, rects, v), skip: () => pushLog(textOf(e.ev, prev?.pending), logClass(e.ev)) });
    }
    // 5 diferentes: o quadro do descarte abre sozinho pra você escolher (depois que a jogada chega no descarte).
    const c = v.choice;
    if (c?.kind === 'cinco' && c.who === ME && !myCinco(prev)) {
      cincoFirst = c.left;
      const open = () => { if (myCinco(view)) openPile(); };
      items.push({ run: async () => open(), skip: open });
    }
    // Fila atrasada não pode esconder a mesa de agora: aba escondida (o navegador segura os timers), fila longa
    // demais ou buraco no diário (reconectou e perdeu entradas) → só o diário, sem animação.
    const gap = seenN >= 0 && fresh.length > 0 && fresh[0]!.n > seenN + 1;
    if (document.hidden || gap || queue.length > MAX_BACKLOG || items.length > MAX_BATCH) { fastForward(items); return; }
    for (const it of items) enqueue(it);
    // Carta que apareceu sem efeito nenhum pra trazê-la não pode ficar escondida.
    if (!running && !queue.length && (arriving.size || airHidden)) settle();
  }

  /** Classe da linha do diário: explosão em vermelho, o que envolve você em amarelo. */
  const logClass = (ev: KittensEvent): string => (ev.t === 'boom' ? 'bad' : involves(ev, ME) ? 'me' : '');

  /** Como você saiu da partida (pra mão dizer "explodiu" ou "saiu"); fica até a próxima partida. */
  let outBy: 'boom' | 'left' | null = null;
  function noteOut(log: KittensView['log']): void {
    for (const e of log) if ((e.ev.t === 'boom' || e.ev.t === 'left') && e.ev.by === ME) outBy = e.ev.t;
  }

  function handRects(): Record<string, Box> {
    const out: Record<string, Box> = {};
    wrap.querySelectorAll<HTMLElement>('#hand .kt-card').forEach((el) => { if (el.dataset.id) out[el.dataset.id] = Fx.box(el); });
    return out;
  }

  // ---------------------------------------------------------------- desenho das cartas
  function sceneUrl(k: KittensCardKind): string {
    let url = sceneCache.get(k);
    if (!url) { url = Cerrado.scene(56, 78, 7 + k.length * 13, CARD_COLOR[k]); sceneCache.set(k, url); }
    return url;
  }

  function cardEl(id: string | null, { back = false }: { back?: boolean } = {}): HTMLElement {
    const el = document.createElement('div');
    const k = id ? kindOf(id) : null;
    if (back || !id || !k) {
      el.className = 'kt-card back flow-back';
      el.innerHTML = `<img class="back-art" src="${VERSO}" alt="">`;
      return el;
    }
    const st = Sprites.style[k];
    el.className = 'kt-card ' + k;
    el.dataset.id = id;
    el.style.backgroundImage = 'url(' + sceneUrl(k) + ')';
    // A faixa do topo é sempre um tom mais escuro do fundo da carta (pedido do Rafa).
    const band = Sprites.shade(CARD_COLOR[k], -0.25);
    // Todas as cartas têm arte do Flow com o fundo recortado; os sprites ficam só de reserva.
    const flow = ART[k];
    const art = flow ? `<img class="art flow" src="${flow}" alt="">` : `<img class="art" src="${Sprites.card(k).url}" alt="">`;
    el.innerHTML = `<div class="band" style="background:${band}"></div>${art}<div class="kt-name">${cardName(k)}</div><div class="kt-hint">${st.hint}</div>`;
    return el;
  }

  // ---------------------------------------------------------------- render
  function render(): void {
    if (!view || destroyed) return;
    renderTop();
    renderSeats();
    renderTable();
    renderHand();
    renderActions();
    renderPanel();
    renderLog();
    renderOver();
    renderPile();
    syncTatu();
    $('#caption').innerHTML = captionText;
    tickTimers();
  }

  /** A escolha aberta é sua? (no par de Mico, "sua" = você ainda tem que descartar) */
  function choiceIsMine(c: KittensView['choice']): boolean {
    if (!c) return false;
    return c.kind === 'mico' ? c.waiting.includes(ME) : c.who === ME;
  }
  const myCinco = (v: KittensView | null): boolean => v?.choice?.kind === 'cinco' && v.choice.who === ME;

  /** A legenda de cada escolha aberta (com o relógio quando é você quem escolhe), ou null. */
  function choicePrompt(): string | null {
    const c = view?.choice;
    if (!c || view?.phase !== 'playing') return null;
    switch (c.kind) {
      case 'tatu':
        return c.who === ME ? `JOGUE O DESARME! ${TIMER}` : `${nameOf(c.who)} está desarmando…`;
      case 'cafune':
        return c.who === ME ? null : `${nameOf(c.who)} está escondendo o tatu no monte…`;
      case 'mico':
        if (c.waiting.includes(ME)) return `DESCARTE UMA CARTA (o efeito não vale) ${TIMER}`;
        return c.by === ME ? 'Todo mundo descartando…' : `Descartando pro par de Mico de ${nameOf(c.by)}…`;
      case 'cinco':
        if (c.who === ME) return `${c.left === 2 ? 'Pegue DUAS do descarte' : cincoFirst === 2 ? 'Pegue MAIS UMA do descarte' : 'Pegue UMA do descarte'} ${TIMER}`;
        return `${nameOf(c.who)} vai pegar ${c.left === 2 ? 'duas' : cincoFirst === 2 ? 'mais uma' : 'uma'} do descarte…`;
    }
    return null;
  }
  function sayChoice(): void {
    const p = choicePrompt();
    if (p) say(p);
  }
  /** Legenda da situação de agora (depois de pular a fila): a escolha aberta, ou de quem é a vez. */
  function sayState(): void {
    const v = view;
    if (!v) return;
    const p = choicePrompt();
    if (p) say(p);
    else if (v.phase === 'playing' && v.current) say(v.current === ME ? 'Sua vez! Jogue cartas ou compre.' : `Vez de ${nameOf(v.current)}`);
    else say('');
  }

  function renderTop(): void {
    const v = view;
    if (!v) return;
    if (v.phase !== 'playing' || !v.current) { $('#turn').innerHTML = ''; return; }
    const who = v.current === ME ? '<b>SUA VEZ</b>' : `vez de <b>${upName(v.current)}</b>`;
    const meNext = orderFromCurrent(ME) === 1 ? '<span class="owed">· VOCÊ É O PRÓXIMO</span>' : '';
    $('#turn').innerHTML = who + (v.owed > 1 ? `<span class="owed">· ${v.owed} TURNOS</span>` : '') + meNext;
  }

  function seatPos(i: number, n: number): { x: number; y: number } {
    // Os outros jogadores em arco no topo, usando a largura toda do palco.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const margin = 210;
    const x = margin + t * (stageW - 2 * margin);
    const y = 18 + (1 - Math.sin(t * Math.PI)) * 34;
    return { x, y };
  }

  function renderSeats(): void {
    const v = view;
    if (!v) return;
    const list = others();
    const box = $('#seats');
    box.innerHTML = '';
    list.forEach((p, i) => {
      const { x, y } = seatPos(i, list.length);
      const el = document.createElement('div');
      el.className = 'kt-seat';
      el.dataset.p = p;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      const dead = v.phase !== 'lobby' && !v.alive.includes(p);
      if (dead) el.classList.add('dead');
      if (v.winner === p) el.classList.add('winner');
      if (v.current === p) el.classList.add('turn');
      if (mode?.type === 'target' && validTarget(p)) {
        el.classList.add('targetable');
        el.onclick = () => chooseTarget(p);
      }
      // Ordem da vez: PRÓXIMO no que joga depois de quem está na vez, número nos outros.
      const k = orderFromCurrent(p);
      const order = dead || k < 1 ? '' : k === 1 ? '<div class="order next">PRÓXIMO</div>' : `<div class="order">${k + 1}º</div>`;
      if (k === 1) el.classList.add('next');
      const n = v.handCounts[p] ?? 0;
      const thinking = v.phase === 'playing' && v.current === p && !dead && !v.pending && !v.choice;
      const c = v.choice;
      const choosing = c && !dead && (c.kind === 'mico' ? c.waiting.includes(p) : c.who === p);
      const chipText = c?.kind === 'mico' ? 'descartando…' : c?.kind === 'tatu' ? 'desarmando…' : 'escolhendo…';
      // "caiu…": a conexão do assento caiu (o servidor espera 30 s antes de tirar do jogo).
      const chip = choosing ? `<div class="chip">${chipText}</div>`
        : seatOf(p)?.connected === false && !dead ? '<div class="chip">caiu…</div>'
        : thinking ? '<div class="chip think">pensando…</div>' : '';
      // Leque de versinhos (até 9) + o número grande: dá pra ver de longe quantas cartas cada um tem.
      const shown = Math.min(n, 9);
      const fan = Array.from({ length: shown }, (_, j) => `<i style="rotate:${(j - (shown - 1) / 2) * 9}deg"></i>`).join('');
      el.innerHTML = `${order}<img class="tatu kt-critter" alt="">
        <div class="who">${nameOf(p)}</div>
        ${dead ? '<div class="count out">FORA</div>' : `<div class="count"><span class="fan">${fan}</span><b>${n}</b></div>`}${chip}`;
      // O bichinho em pixel art: na primeira vez fica pronto num instante; depois a URL já resolvida entra direto
      // (sem piscar a cada redesenho dos assentos).
      const img = el.querySelector('img');
      const color = colorOf(p);
      const known = critterUrls.get(color);
      if (known && img) img.src = known;
      else void Sprites.critter(color).then((url) => { if (url) { critterUrls.set(color, url); if (img) img.src = url; } });
      box.appendChild(el);
    });
    // Setinhas no sentido da vez: você → assentos da esquerda pra direita → você de novo.
    if (v.phase !== 'playing') return;
    const pts = list.map((_, i) => seatPos(i, list.length));
    const arrow = (x: number, y: number, label = '') => {
      const a = document.createElement('div');
      a.className = 'turnflow';
      a.innerHTML = label ? label.replace('›', '<b>›</b>') : '<b>›</b>';
      a.style.left = x + 'px';
      a.style.top = y + 'px';
      box.appendChild(a);
    };
    for (let i = 0; i + 1 < pts.length; i++) arrow((pts[i]!.x + pts[i + 1]!.x) / 2, (pts[i]!.y + pts[i + 1]!.y) / 2 + 40);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first && last && !spectating()) {
      arrow(first.x - 120, first.y + 40, 'VOCÊ ›');
      arrow(last.x + 120, last.y + 40, '› VOCÊ');
    }
  }

  /** Quantas vezes a vez anda até chegar em `p` (0 = está na vez, 1 = próximo); -1 se fora. */
  function orderFromCurrent(p: string): number {
    const v = view;
    if (!v || v.phase !== 'playing' || !v.current || !v.alive.includes(p)) return -1;
    const cur = v.current;
    const ring = players.filter((x) => v.alive.includes(x) || x === cur);
    const i = ring.indexOf(cur);
    return (ring.indexOf(p) - i + ring.length) % ring.length;
  }

  function seatEl(p: string): HTMLElement | null {
    for (const el of wrap.querySelectorAll<HTMLElement>('.kt-seat')) if (el.dataset.p === p) return el;
    return null;
  }
  function anchorOf(p: string): HTMLElement {
    if (p === ME) return $('#hand');
    return seatEl(p)?.querySelector<HTMLElement>('.tatu') ?? $('#deck');
  }

  function renderTable(): void {
    const v = view;
    if (!v) return;
    const deck = $('#deck');
    const stack = $('#deck .stack');
    stack.innerHTML = '';
    const layers = Math.min(5, Math.ceil(v.drawCount / 6));
    for (let i = 0; i < layers; i++) {
      const b = cardEl(null, { back: true });
      b.style.transform = `translate(${-i * 3}px, ${-i * 3}px)`;
      stack.appendChild(b);
    }
    $('#deck .label').textContent = `monte ${v.drawCount} · ${v.tatusInDraw} tatu${v.tatusInDraw === 1 ? '' : 's'}`;
    deck.classList.toggle('mine', canDraw());
    deck.onclick = () => { if (canDraw()) draw(); };

    const fut = $('#future');
    fut.innerHTML = '';
    if (v.peek) {
      fut.innerHTML = '<div class="kt-ftag">O FUTURO ↓</div>';
      v.peek.forEach((id) => fut.appendChild(cardEl(id)));
    }

    const air = $('#air');
    air.innerHTML = '';
    if (v.pending && !airHidden) {
      const cards = [...v.pending.play.cards, ...v.pending.nopes.map((n) => n.card)];
      cards.forEach((id, i) => {
        const c = cardEl(id);
        c.style.transform = `translate(${(i - (cards.length - 1) / 2) * 16}px, ${-i * 4}px) rotate(${(i % 2 ? 6 : -5)}deg)`;
        air.appendChild(c);
      });
    } else if (!v.pending) {
      air.innerHTML = `<div class="empty">${v.current === ME && v.phase === 'playing' ? 'jogue<br>aqui' : ''}</div>`;
    }

    const disc = $('#discard');
    disc.querySelectorAll('.kt-card').forEach((c) => c.remove());
    v.discard.slice(-3).forEach((id, i, arr) => {
      const c = cardEl(id);
      c.style.transform = `rotate(${(i - arr.length + 1) * 7 + 3}deg)`;
      disc.appendChild(c);
    });
    disc.onclick = () => openPile();
    const eye = $('#eye');
    if (!eye.firstChild) eye.innerHTML = EYE_SVG + '<b></b>';
    $('#eye b').textContent = String(v.discard.length);
    eye.classList.toggle('pick', myCinco(v) && !pileOpen);
    eye.onclick = () => openPile();
    renderBar();
  }

  function renderBar(): void {
    const bar = $('#bar');
    const p = view?.pending;
    if (!p) { bar.innerHTML = ''; return; }
    const left = Math.max(0, Math.ceil((p.resolvesAt - opts.now()) / 1000));
    if (left !== lastTic && left > 0) { lastTic = left; if (left <= 3) Sound.play('tic'); }
    bar.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < left ? 'on' : ''}${i === left - 1 ? ' last' : ''}"></i>`).join('');
  }

  function tickTimers(): void {
    if (!view || destroyed) return;
    renderBar();
    const c = view.choice;
    const left = c ? Math.max(0, Math.ceil((c.deadline - opts.now()) / 1000)) + 's' : '';
    wrap.querySelectorAll('[data-timer]').forEach((t) => { t.textContent = left; });
  }

  function renderHand(): void {
    const v = view;
    if (!v) return;
    const hand = $('#hand');
    hand.innerHTML = '';
    hand.classList.toggle('myturn', v.phase === 'playing' && v.current === ME && !v.pending && !v.choice);
    const c = v.choice;
    // Favor e descarte do Mico: a carta clicada sai da mão (contorno vermelho); Tatubum: só o Desarme acende.
    hand.classList.toggle('giving', (c?.kind === 'favor' && c.who === ME) || (c?.kind === 'mico' && c.waiting.includes(ME)));
    hand.classList.toggle('defusing', c?.kind === 'tatu' && c.who === ME);
    if (v.phase === 'playing' && spectating()) {
      hand.innerHTML = '<div class="dead">VOCÊ ESTÁ ASSISTINDO</div>';
      return;
    }
    if (v.phase === 'playing' && !v.alive.includes(ME)) {
      // Quem caiu e foi tirado do jogo (`left`) não explodiu.
      const out = outBy === 'boom' ? 'VOCÊ EXPLODIU' : outBy === 'left' ? 'VOCÊ SAIU DA PARTIDA' : 'VOCÊ ESTÁ FORA';
      hand.innerHTML = `<div class="dead">${out} · AGORA SÓ ASSISTE</div>`;
      return;
    }
    const order = orderedHand();
    const n = order.length;
    const hw = hand.clientWidth || 940;
    const step = Math.min(118, (hw - 112) / Math.max(1, n - 1));
    const width = step * (n - 1) + 112;
    order.forEach((id, i) => {
      const el = cardEl(id);
      el.style.left = (hw - width) / 2 + i * step + 'px';
      el.style.zIndex = String(i);
      if (selected.has(id)) el.classList.add('sel');
      if (arriving.has(id)) el.classList.add('arriving');
      el.onpointerdown = (e) => startDrag(e, id);
      el.ondblclick = () => { if (!canDraw()) return; selected = new Set([id]); playSelected(); };
      el.onmouseleave = () => zoom(null);
      hand.appendChild(el);
    });
  }

  // ---------------------------------------------------------------- ordem da mão e arrastar (como no Diquisti)
  /** A ordem da mão é só daqui do PC: as cartas novas entram no fim. */
  let handOrder: string[] = [];
  function orderedHand(): string[] {
    const hand = view?.hand ?? [];
    handOrder = [...handOrder.filter((id) => hand.includes(id)), ...hand.filter((id) => !handOrder.includes(id))];
    return handOrder;
  }

  let drag: Drag | null = null;
  /** Só o Favor pede um adversário (o par de Mico faz todo mundo descartar); par de Preguiça pede um bicho. */
  const needsTarget = (kind: KittensPlayKind): boolean => kind === 'favor';
  const needsAsk = (kind: KittensPlayKind, ids: string[]): boolean => kind === 'par' && kindOf(ids[0] ?? '') === 'preguica';

  function stagePoint(e: PointerEvent): { x: number; y: number } {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  /** Onde o ponteiro está: o tatu do Desarme, um assento, a mesa ou a mão (ou nada). */
  function dropTarget(e: PointerEvent): DropTarget | null {
    if (typeof document.elementsFromPoint !== 'function') return null;
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      if (!wrap.contains(el)) continue;
      if (el.classList.contains('bigcard') && el.classList.contains('live')) return { type: 'tatu', el };
      const seat = el.closest<HTMLElement>('.kt-seat');
      if (seat) return { type: 'seat', p: seat.dataset.p ?? '', el: seat };
      if (el.closest('#table')) return { type: 'table', el: $('#table') };
      if (el.closest('#hand')) return { type: 'hand', el: $('#hand') };
    }
    return null;
  }

  function startDrag(e: PointerEvent, id: string): void {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { id, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, ids: [id], hover: null };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragCancel);
  }
  function stopDragListeners(): void {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragCancel);
  }
  /** Tira o fantasma e devolve a mão como estava. */
  function dropGhost(d: Drag): void {
    d.ghost?.remove();
    d.hover?.classList.remove('drop');
    stage.classList.remove('dragging');
    wrap.querySelectorAll('#hand .kt-card.dragging').forEach((c) => c.classList.remove('dragging'));
  }
  /** O navegador tomou o ponteiro (rolagem, gesto, alerta): o arrasto acaba sem jogar nada. */
  function onDragCancel(): void {
    stopDragListeners();
    const d = drag;
    drag = null;
    if (!d) return;
    dropGhost(d);
    render();
  }

  function onDragMove(e: PointerEvent): void {
    const d = drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    if (!d.moved) {
      d.moved = true;
      // Arrastar uma carta da seleção leva a seleção inteira (par, trio, 5 diferentes).
      d.ids = selected.has(d.id) && selected.size > 1 ? orderedHand().filter((x) => selected.has(x)) : [d.id];
      const g = cardEl(d.id);
      g.classList.add('ghost');
      if (d.ids.length > 1) g.dataset.n = String(d.ids.length);
      $('#fxlayer').appendChild(g);
      d.ghost = g;
      d.ids.forEach((x) => handCard(x)?.classList.add('dragging'));
      stage.classList.add('dragging');
      zoom(null);
      Sound.play('select');
    }
    const p = stagePoint(e);
    if (d.ghost) d.ghost.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -60%) rotate(-4deg) scale(1.08)`;
    const t = dropTarget(e);
    const el = t && t.type !== 'hand' ? t.el : null;
    if (d.hover !== el) {
      d.hover?.classList.remove('drop');
      el?.classList.add('drop');
      d.hover = el;
    }
  }

  function onDragEnd(e: PointerEvent): void {
    stopDragListeners();
    const d = drag;
    drag = null;
    if (!d) return;
    if (!d.moved) { clickCard(d.id); return; }
    dropGhost(d);
    const t = dropTarget(e);
    if (!t) { render(); return; }
    if (t.type === 'hand') { reorder(d.ids, e); return; }
    dropPlay(d.ids, t);
  }

  /** Solta dentro da mão: as cartas arrastadas entram onde o ponteiro está. */
  function reorder(ids: string[], e: PointerEvent): void {
    const x = stagePoint(e).x;
    const rest = orderedHand().filter((id) => !ids.includes(id));
    let at = 0;
    for (const id of rest) {
      const el = handCard(id);
      if (el && Fx.box(el).x < x) at++;
    }
    handOrder = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
    Sound.play('select');
    renderHand();
  }

  /** Solta na mesa ou num adversário: joga (ou dá o Favor, ou dá Nem vem!). */
  function dropPlay(ids: string[], t: DropTarget): void {
    const v = view;
    if (!v) return;
    const c = v.choice;
    if (c?.kind === 'favor' && c.who === ME) {
      if (ids.length === 1) act({ type: 'choose', card: ids[0] });
      render();
      return;
    }
    // Comprou o Tatubum: só o Desarme, solto no tatu (ou na mesa).
    if (c?.kind === 'tatu' && c.who === ME) {
      if (ids.length === 1 && kindOf(ids[0]!) === 'cafune') playDefuse(ids[0]);
      else { toast('Agora só o Desarme!'); Sound.play('error'); }
      render();
      return;
    }
    // Par de Mico: a carta solta na mesa vai pro descarte (o efeito não vale).
    if (c?.kind === 'mico' && c.waiting.includes(ME)) {
      if (ids.length === 1) act({ type: 'choose', card: ids[0] });
      else { toast('Descarte uma carta só.'); Sound.play('error'); }
      render();
      return;
    }
    if (v.pending && ids.length === 1 && kindOf(ids[0]!) === 'nemvem') { nope(); return; }
    selected = new Set(ids);
    const kind = selectedPlay();
    if (!kind) { toast('Essas cartas não formam jogada.'); Sound.play('error'); render(); return; }
    if (needsAsk(kind, ids)) {
      mode = { type: 'ask', play: { cards: ids } };
      captionText = ASK_CAPTION;
      render();
      return;
    }
    if (needsTarget(kind)) {
      mode = { type: 'target', play: { cards: ids }, kind };
      if (t.type === 'seat' && validTarget(t.p)) { chooseTarget(t.p); return; }
      captionText = TARGET_CAPTION;
      render();
      return;
    }
    send({ cards: ids });
  }

  // ---------------------------------------------------------------- jogada de quem está nesta tela
  function canDraw(): boolean {
    const v = view;
    return !!v && v.phase === 'playing' && v.current === ME && v.alive.includes(ME) && !v.pending && !v.choice;
  }

  function clickCard(id: string): void {
    const v = view;
    if (!v) return;
    const c = v.choice;
    if ((c?.kind === 'favor' && c.who === ME) || (c?.kind === 'mico' && c.waiting.includes(ME))) {
      act({ type: 'choose', card: id });
      return;
    }
    if (c?.kind === 'tatu' && c.who === ME) {
      if (kindOf(id) === 'cafune') playDefuse(id);
      else { toast('Agora só o Desarme!'); Sound.play('error'); }
      return;
    }
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    mode = null;
    Sound.play('select');
    render();
  }

  /** O que as cartas escolhidas formam (espelho de play.ts, só pra mostrar o botão certo). */
  function selectedPlay(): KittensPlayKind | null {
    const kinds = [...selected].map(kindOf);
    const k0 = kinds[0];
    if (!k0) return null;
    const same = kinds.every((k) => k === k0);
    if (kinds.length === 1) return ACTION_KINDS.includes(k0) ? (k0 as KittensPlayKind) : null;
    if (kinds.length === 2 && same && BICHOS.includes(k0)) return 'par';
    if (kinds.length === 3 && same) return 'trio';
    if (kinds.length === 5 && new Set(kinds).size === 5 && kinds.every((k) => k !== null)) return 'cinco';
    return null;
  }

  function validTarget(p: string): boolean {
    const v = view;
    return !!v && p !== ME && v.alive.includes(p) && (v.handCounts[p] ?? 0) > 0;
  }

  function playSelected(): void {
    const kind = selectedPlay();
    if (!kind) return;
    const play: PlayReq = { cards: [...selected] };
    if (needsAsk(kind, play.cards)) {
      mode = { type: 'ask', play };
      captionText = ASK_CAPTION;
      render();
      return;
    }
    if (needsTarget(kind)) {
      mode = { type: 'target', play, kind };
      captionText = TARGET_CAPTION;
      render();
      return;
    }
    send(play);
  }

  function chooseTarget(p: string): void {
    if (mode?.type !== 'target') return;
    send({ ...mode.play, target: p });
  }

  /**
   * A jogada vai pro servidor. A seleção e o modo ficam até a resposta: a visão nova tira da seleção as cartas que
   * saíram da mão (e o modo, com a carta no ar); se ele recusar, `error()` desfaz o modo e a seleção continua lá.
   */
  function send(play: PlayReq): void {
    if (inFlight) return;
    inFlight = true;
    captionText = '';
    act({ type: 'play', ...play });
    render();
  }

  function draw(): void {
    act({ type: 'draw' });
  }

  /** Joga o Desarme (o pedido, ou o primeiro da mão) no Tatubum que você comprou. */
  function playDefuse(id?: string): void {
    const c = view?.choice;
    if (c?.kind !== 'tatu' || c.who !== ME) return;
    const card = id ?? view?.hand.find((x) => kindOf(x) === 'cafune');
    if (card) act({ type: 'choose', card });
  }

  function nope(): void {
    act({ type: 'nope' });
  }

  function renderActions(): void {
    const v = view;
    if (!v) return;
    const box = $('#actions');
    box.innerHTML = '';
    if (v.phase !== 'playing' || !v.alive.includes(ME)) return;
    const myNopes = v.hand.filter((c) => kindOf(c) === 'nemvem').length;
    if (v.pending && myNopes) {
      const b = button(`NEM VEM! (${myNopes})`, nope);
      b.id = 'nope';
      box.appendChild(b);
    }
    const c = v.choice;
    if (c?.kind === 'tatu' && c.who === ME) {
      box.appendChild(hint('arraste o Desarme pro tatu (ou clique nele)'));
      box.appendChild(button('JOGAR DESARME', () => playDefuse(), 'yellow'));
    } else if (c?.kind === 'mico' && c.waiting.includes(ME)) {
      box.appendChild(hint('clique numa carta (ou arraste pra mesa) pra descartar'));
    } else if (myCinco(v) && !pileOpen) {
      box.appendChild(hint('escolha no quadro do descarte'));
      box.appendChild(button('VER O DESCARTE', () => openPile(), 'yellow'));
    }
    if (v.current === ME && !v.pending && !v.choice) {
      const kind = selectedPlay();
      if (mode?.type === 'ask') {
        box.appendChild(hint('escolha o bicho no painel'));
      } else if (mode?.type === 'target') {
        box.appendChild(hint('clique num adversário'));
        box.appendChild(button('CANCELAR', () => { mode = null; captionText = ''; render(); }, 'ghost'));
      } else if (selected.size) {
        const b = button(kind ? `JOGAR ${PLAY_LABEL[kind]}` : 'NÃO FORMA JOGADA', playSelected);
        if (!kind) b.disabled = true;
        box.appendChild(b);
      } else {
        box.appendChild(hint('escolha cartas pra jogar ou'));
      }
      box.appendChild(button('COMPRAR', draw, 'yellow'));
    }
  }

  function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kt-btn ' + cls;
    b.innerHTML = `<span>${label}</span>`;
    b.onclick = onClick;
    return b;
  }
  function hint(text: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'kt-hint';
    d.textContent = text;
    return d;
  }

  // ---------------------------------------------------------------- painéis de escolha
  let cafunePos = 0;
  /** Enquanto o tatu soldado desarma a bomba, o painel de esconder o tatu espera. */
  let holdPanel = false;
  /** O que está desenhado no painel: só redesenha quando muda (senão o render arrancaria o slider da mão). */
  let panelKey = '';
  function panelKeyOf(v: KittensView): string {
    if (holdPanel) return '';
    const m = mode;
    if (m?.type === 'ask') return `ask:${m.play.cards.join(',')}`;
    const c = v.choice;
    // Desarme e descarte do Mico usam a legenda (a mesa fica livre pra soltar a carta); 5 diferentes usa o quadro do descarte.
    if (!c || !choiceIsMine(c)) return '';
    if (c.kind === 'cafune') return `cafune:${c.who}:${c.deadline}:${v.drawCount}`;
    if (c.kind === 'favor') return `favor:${c.to}:${c.deadline}`;
    if (c.kind === 'quati') return `quati:${c.card ?? ''}:${c.deadline}`;
    return '';
  }
  function renderPanel(): void {
    const v = view;
    if (!v) return;
    const panel = $('#panel');
    const key = panelKeyOf(v);
    if (key === panelKey) { tickTimers(); return; }
    panelKey = key;
    panel.innerHTML = '';
    if (!key) return;
    const c = v.choice;
    const m = mode;
    if (m?.type === 'ask') {
      panel.innerHTML = '<h2>QUE BICHO VOCÊ PUXA?</h2><p>Vem de um adversário que tenha; se ninguém tiver, do monte.</p><div class="kt-row"></div>';
      const row = $('#panel .kt-row');
      KITTENS_BICHOS.forEach((k) => {
        row.appendChild(button(cardName(k), () => send({ ...m.play, ask: k }), 'small'));
      });
      row.appendChild(button('CANCELAR', () => { mode = null; captionText = ''; render(); }, 'small ghost'));
      return;
    }
    if (!c) return;
    if (c.kind === 'cafune') {
      const max = v.drawCount;
      cafunePos = Math.min(cafunePos, max);
      panel.innerHTML = `<h2>UFA! ONDE ESCONDER O TATU? ${TIMER}</h2><p>Só você vai saber. O monte tem ${max} carta${max === 1 ? '' : 's'}.</p>
        <div class="pos"></div><input type="range" min="0" max="${max}" step="1" value="${cafunePos}"><div class="kt-row"></div>`;
      const pos = $('#panel .pos');
      const label = (n: number) => (n === 0 ? 'no topo (o próximo compra!)' : n === max ? 'no fundo' : `${n + 1}ª carta de cima`);
      pos.textContent = label(cafunePos);
      const range = $<HTMLInputElement>('#panel input');
      range.oninput = () => { cafunePos = Number(range.value); pos.textContent = label(cafunePos); };
      const row = $('#panel .kt-row');
      row.appendChild(button('ESCONDER AQUI', () => act({ type: 'choose', position: cafunePos }), 'yellow'));
      row.appendChild(button('NO TOPO', () => act({ type: 'choose', position: 0 }), 'small'));
      row.appendChild(button('NO FUNDO', () => act({ type: 'choose', position: max }), 'small'));
      row.appendChild(button('ALEATÓRIO', () => act({ type: 'choose', position: 'random' }), 'small ghost'));
    } else if (c.kind === 'favor') {
      panel.innerHTML = `<h2>FAVOR PRA ${upName(c.to)} ${TIMER}</h2><p>Clique numa carta da sua mão pra dar.</p>`;
    } else if (c.kind === 'quati') {
      panel.innerHTML = `<h2>A CARTA DE CIMA ${TIMER}</h2><p>Só você vê. Fica em cima ou vai pro fundo?</p><div class="cards"></div><div class="kt-row"></div>`;
      if (c.card) $('#panel .cards').appendChild(cardEl(c.card));
      const row = $('#panel .kt-row');
      row.appendChild(button('FICA EM CIMA', () => act({ type: 'choose', keep: true }), 'small'));
      row.appendChild(button('PRO FUNDO', () => act({ type: 'choose', keep: false }), 'yellow'));
    }
    tickTimers();
  }

  // ---------------------------------------------------------------- quadro do descarte (olho) e 5 diferentes
  function openPile(): void {
    if (!view || view.phase === 'lobby') return;
    pileOpen = true;
    pileForPick = myCinco(view);
    pileKey = '';
    Sound.play('select');
    render();
  }
  function closePile(silent = false): void {
    pileOpen = false;
    pileForPick = false;
    pileKey = '';
    const pile = $('#pile');
    pile.hidden = true;
    pile.innerHTML = '';
    if (!silent && view) render();
  }
  /**
   * Todas as cartas do descarte, da mais nova pra mais velha. Na escolha dos 5 diferentes, só as que estavam no
   * descarte antes da jogada (e continuam lá) acendem; um clique pega a carta.
   */
  function renderPile(): void {
    const pile = $('#pile');
    const v = view;
    if (!pileOpen || !v || v.phase === 'lobby') { if (pileOpen) closePile(true); return; }
    const c = v.choice;
    const pick = c?.kind === 'cinco' && c.who === ME ? c : null;
    // Aberto pra escolher: fecha sozinho quando a escolha acaba.
    if (!pick && pileForPick) { closePile(true); return; }
    if (pick) pileForPick = true;
    const key = JSON.stringify([v.discard, pick && pick.options, pick && pick.left]);
    if (key === pileKey && !pile.hidden) return;
    pileKey = key;
    const scroll = pile.querySelector('.grid')?.scrollTop ?? 0;
    const cards = [...v.discard].reverse();
    const title = !pick ? 'O DESCARTE'
      : pick.left === 2 ? 'PEGUE DUAS DO DESCARTE' : cincoFirst === 2 ? 'PEGUE MAIS UMA' : 'PEGUE UMA DO DESCARTE';
    const sub = pick
      ? 'Clique numa carta acesa. As apagadas foram pro descarte depois da sua jogada.'
      : `${cards.length} carta${cards.length === 1 ? '' : 's'}, da mais nova pra mais velha.`;
    pile.innerHTML = `<div class="box"><h2>${title}${pick ? ' ' + TIMER : ''}</h2><p class="psub">${sub}</p><div class="grid"></div><div class="foot"><div class="note">ESC ou clique fora pra fechar</div></div></div>`;
    const grid = $('#pile .grid');
    cards.forEach((id) => {
      const el = cardEl(id);
      if (pick) {
        if (pick.options.includes(id)) {
          el.classList.add('pickable');
          el.onclick = () => act({ type: 'choose', card: id });
        } else el.classList.add('off');
      }
      grid.appendChild(el);
    });
    if (!cards.length) grid.innerHTML = '<div class="none">O descarte está vazio.</div>';
    $('#pile .foot').appendChild(button('FECHAR', () => closePile(), 'small ghost'));
    grid.scrollTop = scroll;
    pile.hidden = false;
    tickTimers();
  }
  $('#pile').addEventListener('click', (e) => { if (e.target === $('#pile')) closePile(); });

  // ---------------------------------------------------------------- diário
  function involves(ev: KittensEvent, p: string): boolean {
    return ('by' in ev && ev.by === p) || ('to' in ev && ev.to === p) || ('from' in ev && ev.from === p);
  }
  /** "Você" só com maiúscula no começo da frase. */
  function textOf(ev: KittensEvent, prevPending: KittensPending | null | undefined): string {
    return rawText(ev, prevPending).replace(/(?!^)Você/g, 'você');
  }
  function rawText(ev: KittensEvent, prevPending: KittensPending | null | undefined): string {
    const n = (p: string) => nameOf(p);
    switch (ev.t) {
      case 'play': return `${n(ev.by)} jogou ${PLAY_LABEL[ev.play]}${ev.target ? ' em ' + n(ev.target) : ''}${ev.ask ? ', pedindo ' + cardName(ev.ask) : ''}`;
      case 'nope': return `${n(ev.by)}: NEM VEM!`;
      case 'resolved': {
        // "Sua RODA", "Seu PAR": a roda de capivara é a única feminina.
        const whose = (label: string) => (ev.by === ME ? `${label.startsWith('RODA') ? 'Sua' : 'Seu'} ${label}` : `${label} de ${n(ev.by)}`);
        if (ev.canceled) return `${whose(PLAY_LABEL[ev.play])} foi cancelado`;
        const pairKind = kindOf(prevPending?.play.cards[0] ?? '');
        const texts: Record<KittensPlayKind, string> = {
          ataque: `${whose(PLAY_LABEL.ataque)} valeu!`,
          pular: `${n(ev.by)} pulou`,
          embaralhar: `${n(ev.by)} embaralhou o monte`,
          espiar: `${n(ev.by)} espiou o futuro`,
          favor: `${prevPending?.play.target ? n(prevPending.play.target) : 'alguém'} vai dar uma carta pra ${n(ev.by)}`,
          par: `${whose((pairKind && PAIR_LABEL[pairKind]) ?? 'PAR')} valeu!`,
          trio: `${whose('TRIO')} valeu!`,
          cinco: `${n(ev.by)} vai pegar duas do descarte`,
        };
        return texts[ev.play];
      }
      case 'draw': return ev.card ? `Você comprou ${cardNameOf(ev.card)}` : `${n(ev.by)} comprou uma carta`;
      case 'tatu': return `${n(ev.by)} comprou o TATUBUM!`;
      case 'cafune': return `${n(ev.by)} jogou o DESARME!`;
      case 'discarded': return `${n(ev.by)} descartou ${cardNameOf(ev.card)}`;
      case 'hid': return `${n(ev.by)} escondeu o tatu no monte`;
      case 'boom': return `${n(ev.by)} EXPLODIU!`;
      case 'left': return `${n(ev.by)} caiu e saiu do jogo`;
      case 'gave': return ev.card ? `${n(ev.from)} deu ${cardNameOf(ev.card)} pra ${n(ev.to)}` : `${n(ev.from)} deu uma carta pra ${n(ev.to)}`;
      case 'picked': return `${n(ev.by)} pegou ${ev.card ? cardNameOf(ev.card) : 'uma carta'} do descarte`;
      case 'delayed': return ev.moved ? `${n(ev.by)} mandou a carta de cima pro fundo` : `${n(ev.by)} deixou a carta de cima onde estava`;
      case 'buried': return `${n(ev.by)} mandou ${ev.tatus === 1 ? 'um TATUBUM' : 'dois TATUBUNS'} pro fundo!`;
      case 'called':
        if (!ev.card) return `Ninguém tinha ${cardName(ev.ask)}, nem o monte`;
        return ev.from ? `${n(ev.by)} puxou ${cardName(ev.ask)} de ${n(ev.from)}` : `${n(ev.by)} puxou ${cardName(ev.ask)} do monte`;
      case 'passed': return ev.card ? `${n(ev.from)} passou ${cardNameOf(ev.card)} pra ${n(ev.to)}` : `${n(ev.from)} passou uma carta pra ${n(ev.to)}`;
      case 'grabbed': return ev.from ? `${n(ev.by)} roubou o DESARME de ${n(ev.from)}!` : 'Ninguém tinha Desarme pra roubar';
      case 'win': return `${n(ev.by)} sobreviveu e venceu!`;
    }
    return '';
  }
  function pushLog(text: string, cls = ''): void {
    logLines.push({ text, cls });
    if (logLines.length > 14) logLines.shift();
    renderLog();
  }
  function renderLog(): void {
    $('#log').innerHTML = '<div class="h">DIÁRIO</div>' + logLines.map((l) => `<p class="${l.cls}">${l.text}</p>`).join('');
  }

  function say(text: string): void {
    captionText = text;
    $('#caption').innerHTML = text;
  }

  // ---------------------------------------------------------------- animações (dirigidas pelo diário)
  async function dealAnim(): Promise<void> {
    if (!view) return;
    say('Distribuindo as cartas…');
    Sound.play('shuffle');
    const deck = $('#deck .stack');
    const targets = players.filter((p) => p !== ME);
    for (let r = 0; r < 2; r++) {
      for (const p of targets) {
        void Fx.fly({ node: cardEl(null, { back: true }), from: deck, to: anchorOf(p), dur: 260, scaleTo: 0.4 });
        await wait(45);
      }
    }
    // Depois de cada espera a mão pode ter sido redesenhada: o elemento é buscado de novo (o antigo já saiu do DOM).
    const flights = [...view.hand].map((id, i) => wait(i * 110).then(async () => {
      const el = handCard(id);
      if (!el) { arriving.delete(id); return; }
      Sound.play('draw');
      await Fx.fly({ node: cardEl(null, { back: true }), from: deck, to: el, dur: 320, flipTo: cardEl(id) });
      arriving.delete(id);
      handCard(id)?.classList.remove('arriving');
    }));
    await Promise.all(flights);
    const cur = view.current;
    if (cur) say(cur === ME ? 'Sua vez! Jogue cartas ou compre.' : `Vez de ${nameOf(cur)}`);
  }

  /**
   * Efeito de uma entrada do diário. `prev` é a visão de antes da leva que trouxe a entrada e `evView` a visão que
   * veio com ela (a `view` de agora pode já estar outras jogadas à frente).
   */
  async function animate(ev: KittensEvent, prev: KittensView | null, rects: Record<string, Box>, evView: KittensView): Promise<void> {
    if (!view) return;
    const text = textOf(ev, prev?.pending);
    pushLog(text, logClass(ev));
    const air = $('#air');
    switch (ev.t) {
      case 'play': {
        say(text);
        Sound.play('card');
        // As cartas da jogada: a carta no ar da visão que trouxe o evento (se for desta jogada).
        const cards = evView.pending?.by === ev.by ? evView.pending.play.cards : [];
        const from = (id: string): At => (ev.by === ME && rects[id] ? rects[id]! : anchorOf(ev.by));
        await Promise.all(cards.map((id, i) => wait(i * 70).then(() => Fx.fly({ node: cardEl(id), from: from(id), to: air, dur: 420, rot: (i % 2 ? 6 : -5), trail: '#f2c14e' }))));
        airHidden = false;
        renderTable();
        if (ev.play === 'ataque') Fx.sparks(air);
        break;
      }
      case 'nope': {
        say(text);
        airHidden = false;
        renderTable();
        Sound.play('nope');
        Fx.flash('#e4572e', 140);
        await Fx.stamp(air, 'NEM VEM!');
        break;
      }
      case 'resolved': {
        const pend = prev?.pending;
        const cards = pend ? [...pend.play.cards, ...pend.nopes.map((x) => x.card)] : [];
        if (ev.canceled) {
          say(`✗ ${text}`);
          Sound.play('error');
          await Fx.cross(air);
        } else {
          say(text);
          if (ev.play === 'ataque') {
            Sound.play('attack');
            Fx.slash(air);
            const next = view.current;
            if (next) {
              const s = next === ME ? $('#hand') : seatEl(next);
              s?.classList.add('hit');
              later(() => s?.classList.remove('hit'), 600);
              const at: At | null = next === ME ? { x: 650, y: 600 } : s ? Fx.box(s) : null;
              if (at) void Fx.pop(`${view.owed} TURNOS!`, at, { size: 34, hold: 500, color: '#e4572e' });
            }
          } else if (ev.play === 'pular') Sound.play('skip');
          else if (ev.play === 'embaralhar') {
            Sound.play('shuffle');
            $('#deck').classList.add('shuffling');
            Fx.glitter($('#deck .stack'), '#c9a8ee');
            later(() => $('#deck').classList.remove('shuffling'), 800);
          } else if (ev.play === 'espiar') {
            Sound.play('peek');
            Fx.glitter($('#deck .stack'));
            if (ev.by === ME) say('O FUTURO: as 3 de cima estão ao lado do monte');
            else void Fx.icon(Sprites.card('espiar').url, $('#deck .stack'), { size: 110 });
          }
        }
        await Promise.all(cards.map((id) => Fx.fly({ node: cardEl(id), from: air, to: $('#discard'), dur: 320 })));
        await wait(250);
        // A jogada abriu uma escolha (Mico, 5 diferentes…): a legenda diz quem faz o quê.
        sayChoice();
        break;
      }
      case 'draw': {
        Sound.play('draw');
        if (ev.by === ME && ev.card) {
          say(text);
          const el = handCard(ev.card);
          await Fx.fly({ node: cardEl(null, { back: true }), from: $('#deck .stack'), to: el ?? $('#hand'), dur: 420, flipTo: cardEl(ev.card) });
          arriving.delete(ev.card);
          handCard(ev.card)?.classList.remove('arriving');
        } else {
          await Fx.fly({ node: cardEl(null, { back: true }), from: $('#deck .stack'), to: anchorOf(ev.by), dur: 380, scaleTo: 0.45 });
        }
        if (view.current === ME && !view.pending && !view.choice) say('Sua vez! Jogue cartas ou compre.');
        break;
      }
      case 'tatu': {
        // Comprou o Tatubum e tem Desarme: o tatu fica tremendo no meio da mesa até o Desarme ser jogado (à mão).
        say(`${nameOf(ev.by)} comprou o… TATUBUM!`);
        showTatu();
        // Se o Desarme já foi (prazo vencido, bot rápido), a pausa é curta.
        await wait(view.choice?.kind === 'tatu' ? 1000 : 450);
        sayChoice();
        break;
      }
      case 'cafune': {
        // O Desarme foi jogado: voa até o tatu, o tatu soldado entra andando, corta o fio e o pavio apaga.
        const t = showTatu();
        const cx = t.cx;
        holdPanel = true;
        renderPanel();
        say(text);
        const now = view;
        const used = ev.by === ME ? prev?.hand.find((x) => kindOf(x) === 'cafune' && !now.hand.includes(x)) : undefined;
        const from: At = used && rects[used] ? rects[used]! : anchorOf(ev.by);
        Sound.play('card');
        await Fx.fly({ node: cardEl(used ?? 'cafune-0'), from, to: { x: cx, y: 470 }, dur: 420, rot: -6, trail: '#f2c14e' });
        await defuseWalk(cx);
        stopEvery(t.sp);
        t.big.classList.remove('shaking', 'live');
        Sound.play('cafune');
        Fx.hearts({ x: cx, y: 470 });
        // Já escondido (o prazo venceu e foi tudo sozinho)? O UFA! é rápido.
        const quick = !(view.choice?.kind === 'cafune' && view.choice.who === ev.by);
        await Fx.pop('UFA!', { x: cx, y: 260 }, { size: 60, hold: quick ? 300 : 700, color: '#ff8fab' });
        clearTatu();
        holdPanel = false;
        renderPanel();
        sayChoice();
        break;
      }
      case 'boom': {
        clearTatu();
        say(`${nameOf(ev.by)} comprou o… TATUBUM!`);
        const cx = stageW / 2;
        const big = cardEl('tatubum-0');
        big.classList.add('bigcard', 'shaking');
        big.style.left = cx + 'px';
        big.style.top = '470px';
        $('#fxlayer').appendChild(big);
        Sound.play('fuse');
        const sp = every(() => Fx.sparks({ x: cx + 15, y: 340 }), 120);
        await wait(1100);
        stopEvery(sp);
        big.remove();
        Sound.play('boom');
        Fx.flash('#fff3c4', 220);
        Fx.shake(600, 14);
        Fx.boom({ x: cx, y: 470 });
        say(text);
        await Fx.pop('BUM!', { x: cx, y: 450 }, { size: 150, hold: 900, color: '#e4572e' });
        break;
      }
      case 'discarded': {
        // Par de Mico: a carta vai à mostra de quem descartou pro descarte.
        say(text);
        Sound.play('card');
        const from: At = ev.by === ME && rects[ev.card] ? rects[ev.card]! : anchorOf(ev.by);
        await Fx.fly({ node: cardEl(ev.card), from, to: $('#discard'), dur: 440, rot: 8, scaleFrom: ev.by === ME ? 1 : 0.5, trail: '#f4a259' });
        await wait(120);
        sayChoice();
        break;
      }
      case 'hid': {
        say(text);
        Sound.play('card');
        await Fx.fly({ node: cardEl(null, { back: true }), from: anchorOf(ev.by), to: $('#deck .stack'), dur: 420, scaleFrom: 0.6 });
        break;
      }
      case 'left': {
        say(text);
        Sound.play('error');
        await wait(600);
        break;
      }
      case 'gave':
      case 'passed':
      case 'called':
      case 'grabbed':
      case 'picked': {
        say(text);
        Sound.play('give');
        const card = ev.card;
        if ((ev.t === 'called' || ev.t === 'grabbed') && !ev.card) { await wait(700); break; }
        let from: At;
        if (ev.t === 'picked') from = $('#discard');
        else if (ev.t === 'called' && !ev.from) from = $('#deck .stack');
        else {
          const src = ev.from ?? '';
          from = src === ME && card && rects[card] ? rects[card]! : anchorOf(src);
        }
        const toP = ev.t === 'picked' || ev.t === 'called' || ev.t === 'grabbed' ? ev.by : ev.to;
        const target = toP === ME && card ? handCard(card) ?? $('#hand') : anchorOf(toP);
        await Fx.fly({ node: cardEl(card, { back: !card }), from, to: target, dur: ev.t === 'passed' ? 360 : 520, trail: '#ff8fab' });
        if (card) { arriving.delete(card); handCard(card)?.classList.remove('arriving'); }
        if (ev.t === 'picked') sayChoice();
        break;
      }
      case 'delayed':
      case 'buried': {
        say(text);
        Sound.play('card');
        if (ev.t === 'buried' || ev.moved) {
          const deck = $('#deck .stack');
          const from = ev.t === 'buried' ? anchorOf(ev.by) : deck;
          await Fx.fly({ node: ev.t === 'buried' ? cardEl('tatubum-0') : cardEl(null, { back: true }), from, to: deck, dur: 520 });
        } else {
          await wait(500);
        }
        break;
      }
      case 'win': {
        // Um texto grande só (o do quadro do fim, que entra pulando); os botões vêm depois dos fogos.
        say(text);
        Sound.play('win');
        clearTatu();
        overStage = 'title';
        renderOver();
        Fx.fireworks({ x: stageW / 2, y: 420 });
        await wait(2400);
        overStage = 'full';
        renderOver();
        break;
      }
    }
  }

  /**
   * Desarme (pedido do Rafa): o tatu soldado (arte do Flow, fundo recortado) entra andando pela esquerda até a carta
   * do Tatubum no centro, corta o fio com o alicate (faísca + "clic") e sai andando de volta.
   */
  async function defuseWalk(cx: number): Promise<void> {
    const s = document.createElement('img');
    s.src = SOLDADO;
    s.className = 'soldier walking';
    $('#fxlayer').appendChild(s);
    const y = 500; // pés na altura da base da carta grande
    const stop = cx - 205; // o alicate (lado direito do soldado) encosta na carta
    const at = (x: number, flip = 1) => `translate(${x}px, ${y}px) translate(-50%, -100%) scaleX(${flip})`;
    const walk = (from: number, to: number, flip: number, ms: number): Promise<unknown> =>
      Fx.REDUCED || document.hidden || typeof s.animate !== 'function'
        ? Promise.resolve()
        : s.animate([{ transform: at(from, flip) }, { transform: at(to, flip) }], { duration: ms, easing: 'steps(14, end)', fill: 'forwards' }).finished.catch(() => {});
    s.style.transform = at(-140);
    await Promise.race([walk(-140, stop, 1, 1300), wait(1500)]);
    s.classList.remove('walking');
    s.style.transform = at(stop);
    // corta o fio
    await wait(250);
    s.classList.add('snip');
    Sound.play('snip');
    Fx.glitter({ x: stop + 80, y: 430 }, '#ffffff');
    Fx.sparks({ x: stop + 80, y: 430 });
    await wait(450);
    s.classList.remove('snip');
    // missão cumprida: vira e volta
    void (async () => {
      s.classList.add('walking');
      await Promise.race([walk(stop, -160, -1, 1100), wait(1300)]);
      s.remove();
    })();
  }

  /** O Tatubum grande no meio da mesa (cria uma vez; o Desarme e o soldado usam o mesmo). */
  function showTatu(): TatuFx {
    if (tatuFx) return tatuFx;
    const cx = stageW / 2;
    const big = cardEl('tatubum-0');
    big.classList.add('bigcard', 'shaking');
    big.style.left = cx + 'px';
    big.style.top = '470px';
    big.onclick = () => playDefuse();
    $('#fxlayer').appendChild(big);
    Sound.play('fuse');
    let k = 0;
    // Faíscas do pavio sem parar e o chiado de novo de tempos em tempos, enquanto o Desarme não vem.
    const sp = every(() => {
      Fx.sparks({ x: cx + 15, y: 340 });
      if (++k % 14 === 0 && view?.choice?.kind === 'tatu') Sound.play('fuse');
    }, 120);
    tatuFx = { big, sp, cx };
    syncTatu();
    return tatuFx;
  }
  /** O tatu aceita o Desarme (soltar ou clicar) só de quem comprou, enquanto a escolha está aberta. */
  function syncTatu(): void {
    const c = view?.choice;
    if (tatuFx) tatuFx.big.classList.toggle('live', c?.kind === 'tatu' && c.who === ME);
  }
  function clearTatu(): void {
    if (!tatuFx) return;
    stopEvery(tatuFx.sp);
    tatuFx.big.remove();
    tatuFx = null;
  }

  // ---------------------------------------------------------------- fim
  /** Quadro do fim: só aparece pela festa da vitória (fila de efeitos), nunca direto do render. */
  function renderOver(): void {
    const over = $('#over');
    const v = view;
    if (v?.phase !== 'gameover') {
      overStage = 'hidden';
      over.hidden = true;
      over.innerHTML = '';
      delete over.dataset.for;
      over.classList.remove('dim');
      return;
    }
    if (overStage === 'hidden') { over.hidden = true; return; }
    if (!over.querySelector('.biglogo')) {
      const title = v.winner === ME ? 'VOCÊ SOBREVIVEU!' : v.winner ? upName(v.winner) + ' SOBREVIVEU!' : 'FIM';
      over.innerHTML = `<div class="biglogo popin" style="font-size:44px">${title}</div>`;
      delete over.dataset.for;
    }
    over.hidden = false;
    over.classList.toggle('dim', overStage === 'full');
    // Só o host recomeça ou volta pro lobby; os outros esperam. Se o host muda com o quadro aberto (o host saiu),
    // a parte de baixo é refeita pra quem é o host agora.
    const isHost = hostId !== null && hostId === ME;
    const forWhom = isHost ? 'host' : 'guest';
    if (overStage === 'full' && over.dataset.for !== forWhom) {
      over.querySelectorAll('.kt-btn, .sub').forEach((el) => el.remove());
      over.dataset.for = forWhom;
      if (isHost) {
        over.appendChild(button('JOGAR DE NOVO', () => act({ type: 'again' }), 'yellow'));
        over.appendChild(button('VOLTAR PRO LOBBY', () => act({ type: 'lobby' })));
      } else {
        const w = document.createElement('div');
        w.className = 'sub';
        w.textContent = 'esperando o host…';
        over.appendChild(w);
      }
    }
  }

  // ---------------------------------------------------------------- barra de cima: som e galeria
  const soundLabel = () => { $('#sound span').textContent = Sound.muted ? 'SOM: NÃO' : 'SOM: SIM'; };
  soundLabel();
  $('#sound').onclick = () => { Sound.toggle(); soundLabel(); };

  function onKey(e: KeyboardEvent): void {
    const tgt = e.target;
    if (tgt instanceof HTMLElement && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
    const gallery = $('#gallery');
    if (e.key === 'Escape' && !gallery.hidden) { gallery.hidden = true; return; }
    if (e.key === 'Escape' && pileOpen) { closePile(); return; }
    // Com a galeria ou o quadro do descarte aberto, os atalhos da mesa (espaço, N, Enter) ficam parados.
    if (!gallery.hidden || pileOpen) return;
    if (!view || view.phase !== 'playing' || spectating()) return;
    if (e.key === 'n' || e.key === 'N') nope();
    if (e.key === ' ' && canDraw()) { e.preventDefault(); draw(); }
    if (e.key === 'Enter') playSelected();
    if (e.key === 'Escape') { mode = null; selected.clear(); render(); }
  }

  let toastTimer: Timer | null = null;
  function toast(text: string): void {
    $('#toast').textContent = text;
    cancel(toastTimer);
    toastTimer = later(() => { $('#toast').textContent = ''; }, 2200);
  }

  // ---------------------------------------------------------------- zoom (rodinha, como no Diquisti)
  let zoomed: string | null = null;
  function zoom(id: string | null): void {
    if (id === zoomed) return;
    zoomed = id;
    const v = $('#viewer');
    v.innerHTML = '';
    const k = id ? kindOf(id) : null;
    if (!id || !k) return;
    const big = document.createElement('div');
    big.className = 'vcard';
    big.appendChild(cardEl(id));
    const txt = document.createElement('div');
    txt.className = 'vtext';
    txt.innerHTML = `<h3>${cardName(k)}</h3><p>${detailOf(k)}</p>`;
    v.append(big, txt);
    Sound.play('zoom');
  }
  function onWheel(e: WheelEvent): void {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // No quadro do descarte a rodinha rola a lista (o zoom lá é passar o mouse).
    if (t.closest('#pile')) return;
    const card = t.closest<HTMLElement>('.kt-card[data-id]');
    if (!card) { zoom(null); return; }
    e.preventDefault();
    zoom(e.deltaY < 0 ? card.dataset.id ?? null : null);
  }

  // ---------------------------------------------------------------- galeria das cartas
  $('#cards').onclick = () => {
    const g = $('#gallery');
    g.innerHTML = '<h2>AS CARTAS</h2><div class="grid"></div><div class="foot"><p>Combos: PAR só de bichos (cada um faz uma coisa) · TRIO de qualquer carta rouba um Desarme · 5 DIFERENTES pega DUAS do descarte. Toda carta jogada fica 5 s no ar pra alguém dar Nem vem!. O olho ao lado do descarte mostra todas as cartas da pilha.</p></div>';
    const grid = $('#gallery .grid');
    KITTENS_CARD_KINDS.forEach((k, i) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.appendChild(cardEl(`${k}-${i}`));
      const p = document.createElement('p');
      p.innerHTML = `<b>${cardName(k)}</b>${ABOUT[k]}`;
      item.appendChild(p);
      grid.appendChild(item);
    });
    $('#gallery .foot').appendChild(button('VOLTAR', () => { g.hidden = true; }, 'yellow'));
    g.hidden = false;
    Sound.play('select');
  };

  // ---------------------------------------------------------------- liga tudo
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  stage.addEventListener('wheel', onWheel, { passive: false });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(root);
  fit();
  // Relógios (barrinha do Nem vem! e prazos das escolhas): a hora é a do servidor.
  every(tickTimers, 100);

  return {
    update(s: MesaState): void {
      if (destroyed) return;
      const me = s.you ?? SPECTATOR;
      if (me !== ME) outBy = null;
      ME = me;
      hostId = s.hostId;
      seats = s.seats;
      players = s.view.players;
      onState(s.view);
    },
    error(message: string): void {
      if (destroyed) return;
      // Jogada recusada: o modo (alvo, bicho) e a legenda dele não valem mais; a seleção fica pra tentar de novo.
      inFlight = false;
      if (mode || captionText === ASK_CAPTION || captionText === TARGET_CAPTION) {
        mode = null;
        if (captionText === ASK_CAPTION || captionText === TARGET_CAPTION) captionText = '';
        render();
      }
      toast(message);
      Sound.play('error');
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      queue.length = 0;
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
      for (const t of intervals) clearInterval(t);
      intervals.clear();
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      stopDragListeners();
      stage.removeEventListener('wheel', onWheel);
      ro?.disconnect();
      drag = null;
      Cerrado.stop();
      Fx.dispose();
      wrap.remove();
      if (addedKittens) root.classList.remove('kittens');
    },
  };
}
