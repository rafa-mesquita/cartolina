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
  KITTENS_ACTION_KINDS,
  KITTENS_BICHOS,
  KITTENS_CARD_KINDS,
  KITTENS_CARD_NAMES,
  KITTENS_WILD,
  kittensIsBicho,
  kittensKindOf,
  kittensNopable,
  kittensNopeCooldownUntil,
  kittensTokenIndex,
  type GameAction,
  type KittensAction,
  type KittensCardKind,
  type KittensEvent,
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
  /** Layout da tela: 'phone' = celular em pé (coluna da altura da tela, sem a escala fixa de 1440×900). */
  layout?: MesaLayout;
}

/** O layout que o React escolhe (`useLayout()`): computador (palco 1440×900 escalado) ou celular em pé. */
export type MesaLayout = 'phone' | 'desktop';

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
  /** Troca o layout (computador ↔ celular em pé) sem recriar a mesa. */
  setLayout(layout: MesaLayout): void;
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
  tucano: 'PAR DE TUCANO',
  latido: 'PAR DE LATIDORES',
  capivara: 'RODA DE CAPIVARA',
};
const PLAY_LABEL: Record<KittensPlayKind, string> = {
  ataque: 'ATAQUE',
  pular: 'PULAR',
  favor: 'FAVOR',
  embaralhar: 'EMBARALHAR',
  espiar: 'ESPIAR',
  latido: 'TATU LATIDOR',
  olhado: 'MAU-OLHADO',
  feitico: 'FEITIÇO',
  par: 'PAR',
  trio: 'TRIO',
  cinco: '4 BICHOS DIFERENTES',
};
const ACTION_KINDS: readonly string[] = KITTENS_ACTION_KINDS;

/**
 * Cada carta com a cor dela (pedido do Rafa): o fundo é um cerrado em pixel art nessa cor (desenhado em código) e o
 * personagem vem recortado por cima. As cartas novas usam a cor do fundo da arte do Flow.
 */
const CARD_COLOR: Record<KittensCardKind, string> = {
  tatubum: '#e4572e', cafune: '#f2c14e', nemvem: '#c86fd4', ataque: '#9aa7bd', pular: '#5aa0e6', favor: '#f29bc0',
  embaralhar: '#8d7ae6', espiar: '#3fa7c9', capivara: '#5cc8b8', mico: '#f4a259', quati: '#c79a6a', tamandua: '#b0b8c8', preguica: '#a8bf6a',
  tucano: '#3b5bc4', latido: '#b5653a', olhado: '#5b3f9e', feitico: '#2f8f6b', boto: '#d65d8f',
};

/** Pixel art em SVG (um retângulo por pixel): `rows` com uma letra por pixel, `pal` = cor de cada letra. */
function pixelSvg(rows: readonly string[], pal: Record<string, string>, extra = ''): string {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `<svg viewBox="0 0 ${rows[0]!.length} ${rows.length}" xmlns="http://www.w3.org/2000/svg">${r}${extra}</svg>`;
}

/** Olho em pixel art (12×8). */
const EYE_SVG = pixelSvg(
  ['....kkkk....', '..kkwwwwkk..', '.kwwwppwwwk.', 'kwwwpppwwwwk', 'kwwwppppwwwk', '.kwwwppwwwk.', '..kkwwwwkk..', '....kkkk....'],
  { k: '#050510', w: '#fff3e0', p: '#2b6fd6' },
  '<rect x="5" y="3" width="1" height="1" fill="#ffffff"/>',
);
/** Mau-olhado: olho roxo com pupila em fenda e brilhinhos (marca de quem está cego). */
const CURSE_SVG = pixelSvg(
  ['s............s', '.....kkkk.....', '...kkwwwwkk...', '..kwwppppwwk..', '.kwwppkkppwwk.', '.kwwppkkppwwk.', '..kwwppppwwk..', '...kkwwwwkk...', '.....kkkk.....', '.s..........s.'],
  { k: '#1a0f2e', w: '#e9dcff', p: '#8a4fe0', s: '#c86fd4' },
);
const CURSE_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(CURSE_SVG);
/** Tucano em pixel art (16×10, de lado, bico grande): o efeito do par de Tucano e a marca de quem vai ter a vez pulada. */
const TUCANO_SVG = pixelSvg(
  ['....kkkk........', '...kbbbbk.......', '..kbbwwwbkkkkk..', '..kbwwkwbyyyyok.', '..kbwwwwbyyooook', '..kbbwwbkkkkkkk.', '..kbbbbbk.......', '...kbbbbk.......', '....kbbk........', '.....kk.........'],
  { k: '#050510', b: '#1c1f3a', w: '#fff3e0', y: '#f2c14e', o: '#e4572e' },
);
const TUCANO_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(TUCANO_SVG);

/**
 * Explicação completa de cada carta, que aparece no zoom (pedido do Rafa: na mão fica só o básico).
 * Cada bicho explica o próprio par; o trio vale pra qualquer carta e os 4 diferentes pra qualquer bicho.
 */
const COMBO_TEXT = '<br><b>TRIO</b> (3 cartas iguais de qualquer tipo): você rouba um <b>Desarme</b> de um adversário que tenha (3 Favores: o adversário escolhido te dá 3 cartas).<br><b>4 BICHOS DIFERENTES</b> (só bichos; o Boto conta como um): você pega <b>duas cartas</b> que quiser do descarte (do jeito que ele estava antes da jogada), uma de cada vez, no quadro do descarte. <b>Não aceita Nem vem!</b>.<br>Par e trio podem levar Nem vem!.';
const PAIR_DETAIL: Partial<Record<KittensCardKind, string>> = {
  mico: '<b>PAR DE MICO</b>: <b>todo mundo, menos você, descarta uma carta</b> à escolha, todos ao mesmo tempo (30 segundos; depois vai uma ao acaso). O efeito da carta descartada não vale, e todos veem o que foi pro descarte.<br>Depois <b>você pega uma das cartas descartadas</b> pra sua mão, no quadro do descarte (30 segundos; depois vai uma ao acaso).',
  quati: '<b>PAR DE QUATI</b>: só você vê a carta de cima do monte e decide se ela fica em cima ou vai pro fundo. Todo mundo sabe se foi pro fundo, ninguém sabe qual era.',
  tamandua: '<b>PAR DE TAMANDUÁ</b>: você compra 2 cartas de cima. Se vier <b>Tatubum</b>, ele vai pro fundo do monte sem você gastar Desarme. A vez continua: depois você ainda compra normalmente.',
  preguica: '<b>PAR DE PREGUIÇA</b>: diga um bicho; você puxa essa carta de um adversário que tenha (sorteado). Se ninguém tiver, procura no monte; nem no monte, pega do descarte. Às vezes (30%) puxa <b>dois</b>, cada um nessa mesma ordem.',
  capivara: '<b>RODA DE CAPIVARA</b>: todo mundo, menos você, passa uma carta ao acaso pro próximo da vez. Você recebe a do jogador antes de você.',
  tucano: '<b>PAR DE TUCANO</b>: escolha um adversário (mesmo sem carta na mão). A sua vez acaba <b>sem você comprar</b> (sob ataque, gasta só um dos turnos), e a <b>próxima vez dele é pulada</b>: quando a vez chegar nele, ele não joga nem compra (se estiver devendo 2 turnos de um Ataque, perde um deles). Duas vezes no mesmo jogador, pula duas vezes.',
  boto: 'O <b>BOTO</b> é o bicho coringa e vale por qualquer bicho:<br><b>Boto + um bicho</b> = o par daquele bicho (Boto + Quati = PAR DE QUATI).<br><b>Dois Botos</b> = o par do bicho que você escolher.<br>Com carta de ação não forma par. No <b>trio</b> ele completa bichos iguais (2 Micos + Boto), e 3 Botos também é trio. Nos <b>4 bichos diferentes</b> conta como um bicho a mais (só um Boto). No par de Preguiça, um Boto na mão de alguém não conta como o bicho pedido.',
};
const DETAIL: Partial<Record<KittensCardKind, string>> = {
  tatubum: 'O tatu-bola com o pavio aceso. Comprou esta carta e não tem Desarme? <b>Explodiu</b> e saiu do jogo.<br>Com Desarme, <b>você joga o Desarme</b> (30 segundos, senão ele vai sozinho), o tatu soldado corta o fio e você esconde o Tatubum de volta no monte, onde quiser.<br>O monte tem sempre um Tatubum a menos que o número de jogadores vivos.',
  cafune: 'Você joga na hora em que compra um Tatubum: <b>arraste o Desarme pro tatu</b> (ou clique nele). Tem 30 segundos; se não jogar, ele vai sozinho e o tatu volta pra um lugar sorteado.<br>O tatu soldado corta o fio e você não explode. Aí você escolhe <b>em segredo</b> onde o Tatubum volta no monte (no topo, no fundo, em qualquer posição ou ao acaso) e gasta um turno.<br>Não dá pra jogar Desarme fora dessa hora, nem cancelar com Nem vem!.',
  nemvem: 'Cancela a carta que está no ar, <b>mesmo fora da sua vez</b>.<br>Toda carta jogada fica 5 segundos no ar esperando um Nem vem!, e cada Nem vem! recomeça os 5 segundos.<br>Dá pra dar Nem vem! no Nem vem!: conta quantos foram, número ímpar cancela e par deixa valer.<br>Depois de um Nem vem!, o próximo só pode vir 2 segundos depois.<br>Não cancela o Tatubum nem o Desarme.',
  ataque: 'Termina a sua vez <b>sem comprar</b>, e o próximo joga <b>2 turnos</b> seguidos.<br>Se você estava sob ataque, passa os turnos que você ainda devia + 2 (2 → 4 → 6…).<br>Pode levar Nem vem!.',
  pular: 'Termina um turno seu <b>sem comprar</b> carta.<br>Se você estava sob ataque (devendo 2 turnos), gasta só um deles e continua na vez.<br>Pode levar Nem vem!.',
  favor: 'Escolha um adversário que tenha carta na mão: <b>ele escolhe</b> uma carta dele pra te dar.<br>Só vocês dois veem qual carta foi. Ele tem 30 segundos pra escolher; depois vai uma ao acaso.<br><b>Três Favores juntos</b>: o adversário escolhido te dá <b>3 cartas</b> (a mão toda, se tiver menos), escolhidas por ele, uma de cada vez.<br>Pode levar Nem vem!.',
  embaralhar: 'Embaralha o monte inteiro.<br>Pode levar Nem vem!.',
  espiar: 'Você vê as <b>3 cartas de cima</b> do monte, só você.<br>Elas ficam à mostra pra você até serem compradas ou o monte mudar de ordem.<br>Se quem muda a ordem é você, continua vendo o que sabe: a carta que você põe no topo com o Feitiço (em cima das que você já via) ou deixa no topo com o Quati fica à mostra pra você; escondendo o tatu com o Desarme (sem ser ao acaso), a sua espiada continua, com o tatu nela se ele cair no meio ou logo abaixo dela.<br>Pode levar Nem vem!.',
  latido: 'Tem <b>um por jogador</b> na partida, e nenhum vem na mão inicial: estão todos no monte. Quando você joga um, <b>todo mundo que tiver Tatu Latidor</b> (na mão ou na frente dele) tem que <b>jogar um Desarme</b>, um de cada vez, na ordem da vez a partir de você (30 segundos cada, senão vai sozinho). O Desarme e <b>todos os Latidores dele</b> vão pro descarte. Sem Desarme, <b>explode</b>.<br>Se ninguém mais tiver Latidor, o seu fica <b>na sua frente</b>, à vista de todos: quando outro for jogado, você também tem que se defender.<br>Não gasta a sua vez. Pode levar Nem vem!.<br><b>PAR DE LATIDORES</b>: escolha um adversário (com ou sem Latidor); só ele tem que <b>jogar um Desarme</b> (30 segundos, senão vai sozinho), e os Latidores dele ficam onde estão. Sem Desarme, <b>explode</b>. Não gasta a sua vez.',
  olhado: 'Escolha um adversário (mesmo sem carta na mão): a mão dele é <b>embaralhada</b> e ele <b>fica cego</b>, vendo só o verso das próprias cartas, até <b>comprar</b> uma carta.<br>Cego, ele joga às cegas: escolhe cartas viradas sem saber quais são (se não formarem jogada, voltam pra mão).<br>Pode levar Nem vem!.',
  feitico: 'Só você vê a <b>carta de baixo</b> do monte e escolhe (30 segundos):<br><b>FICAR COM ELA</b>: é como comprar (se for Tatubum, é comprar o Tatubum: Desarme ou explode).<br><b>PÔR NO TOPO</b>: ela vai pra cima do monte.<br>Nos dois casos <b>acaba o seu turno</b>. Se o tempo acabar, ela vai pro topo.<br>Pode levar Nem vem!.',
};
const detailOf = (k: KittensCardKind): string => DETAIL[k] ?? `Sozinho não faz nada.<br>${PAIR_DETAIL[k] ?? ''}${COMBO_TEXT}`;

/** Frase curta de cada carta na galeria. */
const ABOUT: Record<KittensCardKind, string> = {
  tatubum: 'Comprou e não tem Desarme? Explodiu, tá fora. Tem sempre um a menos que o número de jogadores.',
  cafune: 'Jogue quando comprar o Tatubum (30 s, senão vai sozinho): o tatu soldado corta o fio e o tatu volta pro monte onde você quiser, em segredo.',
  nemvem: 'Cancela a carta no ar, mesmo fora da sua vez. Dá pra dar Nem vem! no Nem vem!. Depois de um Nem vem!, o próximo só pode vir 2 segundos depois.',
  ataque: 'Termina sua vez sem comprar. O próximo joga 2 turnos (ou os seus + 2, se você estava sob ataque).',
  pular: 'Termina um turno seu sem comprar.',
  favor: 'Um adversário escolhe uma carta da mão dele pra te dar. Três Favores juntos: ele te dá 3.',
  embaralhar: 'Embaralha o monte inteiro.',
  espiar: 'Você vê as 3 cartas de cima do monte, só você. Elas ficam à mostra pra você até serem compradas ou o monte mudar de ordem; se quem mexe é você (Feitiço, Desarme, Quati), continua vendo o que sabe.',
  capivara: 'Par: todo mundo, menos você, passa uma carta pro próximo.',
  mico: 'Par: todo mundo, menos você, descarta uma carta (o efeito não vale); depois você pega uma delas.',
  quati: 'Par: vê a de cima e decide se vai pro fundo.',
  tamandua: 'Par: compra 2; Tatubum vai pro fundo. A vez continua.',
  preguica: 'Par: puxa o bicho que você pedir (às vezes, dois).',
  tucano: 'Par: sua vez acaba sem comprar e a próxima vez de um adversário é pulada.',
  latido: 'Todo mundo que tiver Latidor (na mão ou na frente) joga um Desarme ou explode, um de cada vez. Ninguém tem: fica na sua frente. Par: o adversário escolhido joga um Desarme ou explode.',
  olhado: 'Um adversário fica cego até comprar: a mão dele vira e ele joga às cegas.',
  feitico: 'Você vê a carta de baixo do monte: fica com ela (é comprar) ou põe no topo. Acaba o turno.',
  boto: 'Coringa: com um bicho forma o par dele; dois Botos, o par que você escolher. Completa trios.',
};

const TIMER = '<span class="timer" data-timer></span>';
/** Legendas dos modos de escolha (par de Preguiça pede bicho, par de 2 Botos pede o bicho, Favor e Mau-olhado pedem adversário). */
const ASK_CAPTION = 'Que bicho você quer puxar?';
const AS_CAPTION = 'Que bicho o Boto vira?';
const TARGET_CAPTION = 'Escolha um adversário <span class="timer">↑</span>';
/** Cego: depois de JOGAR ÀS CEGAS, o que uma carta escondida poderia pedir (1 ficha: alvo; 2 fichas: o bicho). */
const BLIND_TARGET_CAPTION = 'SE PRECISAR DE ALVO, EM QUEM? <span class="timer">↑</span>';
const BLIND_BICHO_CAPTION = 'SE FOR PREGUIÇA OU BOTO, QUAL BICHO?';
const MODE_CAPTIONS: readonly string[] = [ASK_CAPTION, AS_CAPTION, TARGET_CAPTION, BLIND_TARGET_CAPTION, BLIND_BICHO_CAPTION];

/** O que uma jogada forma e o bicho que ela vale (par/trio). */
interface PlayGuess {
  kind: KittensPlayKind;
  /** Par: o bicho (null no par de 2 Botos, que ainda pede qual); trio: o tipo das iguais; null no resto. */
  as: KittensCardKind | null;
}
/**
 * Espelho de `playKindOf` (shared/src/games/kittens/play.ts), só pra mostrar o botão certo e pedir o que falta: ação
 * sozinha, par só de bichos (o Boto faz as vezes de qualquer um), trio de 3 iguais (o Boto completa bichos), 4 bichos
 * diferentes (o Boto conta como um). Fichas do cego (`?i`) não têm tipo: aí `null` (quem decide é o servidor).
 */
function guessPlay(ids: readonly string[]): PlayGuess | null {
  const kinds = ids.map((id) => kittensKindOf(id));
  if (!kinds.length || kinds.some((k) => k === null)) return null;
  const ks = kinds as KittensCardKind[];
  const plain = ks.filter((k) => k !== KITTENS_WILD);
  const wild = ks.length - plain.length;
  const same = plain.every((k) => k === plain[0]);
  if (ks.length === 1) return ACTION_KINDS.includes(ks[0]!) ? { kind: ks[0] as KittensPlayKind, as: null } : null;
  if (ks.length === 2) {
    if (wild === 2) return { kind: 'par', as: null };
    if (ks.every((k) => k === 'latido')) return { kind: 'par', as: 'latido' };
    return same && kittensIsBicho(plain[0]!) ? { kind: 'par', as: plain[0]! } : null;
  }
  if (ks.length === 3) {
    if (wild === 0) return same ? { kind: 'trio', as: ks[0]! } : null;
    if (wild === 3) return { kind: 'trio', as: KITTENS_WILD };
    return same && kittensIsBicho(plain[0]!) ? { kind: 'trio', as: plain[0]! } : null;
  }
  if (ks.length === 4 && new Set(ks).size === 4 && ks.every((k) => k === KITTENS_WILD || kittensIsBicho(k))) return { kind: 'cinco', as: null };
  return null;
}
/**
 * Favor, trio de Favor (o escolhido dá 3 cartas), Mau-olhado e par de Tucano (também com Boto) pedem um adversário. `as`
 * é o bicho que o par vale (no par de 2 Botos, o escolhido no painel).
 */
const needsTarget = (g: PlayGuess): boolean => g.kind === 'favor' || g.kind === 'olhado' || isFavorTrio(g) || isTucanoPair(g) || isLatidoPair(g);
/** Par de Latidores: pede um adversário vivo (com ou sem Latidor), que joga um Desarme ou explode. */
const isLatidoPair = (g: { kind: KittensPlayKind; as: KittensCardKind | null }): boolean => g.kind === 'par' && g.as === 'latido';
/** Par de Tucano: pede um adversário vivo (com ou sem carta na mão). */
const isTucanoPair = (g: { kind: KittensPlayKind; as: KittensCardKind | null }): boolean => g.kind === 'par' && g.as === 'tucano';
/** 3 Favores: pede alvo com carta na mão, como o Favor sozinho (espelho de `kittensIsFavorPlay`). */
const isFavorTrio = (g: { kind: KittensPlayKind; as: KittensCardKind | null }): boolean => g.kind === 'trio' && g.as === 'favor';
/** "UMA CARTA", "3 CARTAS". */
const cardsCount = (n: number): string => (n === 1 ? 'UMA CARTA' : `${n} CARTAS`);
/** Ficha do cego (`?0`, `?1`…): uma carta da mão que ele não sabe qual é. */
const isToken = (id: string | null): boolean => id !== null && kittensTokenIndex(id) !== null;
/** "PAR DE QUATI", e "(com Boto)" quando o Boto fez as vezes do bicho. */
function pairName(as: KittensCardKind | null, cards: readonly string[] | undefined): string {
  const base = (as && PAIR_LABEL[as]) ?? 'PAR';
  return cards?.some((c) => kittensKindOf(c) === KITTENS_WILD) ? `${base} (com Boto)` : base;
}

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
      <button type="button" class="kt-btn small ghost" id="diary" aria-haspopup="dialog"><span>DIÁRIO</span></button>
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
      <div id="banners"></div>
    </div>
    <div id="log"></div>
    <button type="button" id="lastline" aria-haspopup="dialog"></button>
    <div id="front"></div>
    <div id="hand"></div>
    <div id="actions"></div>
    <div id="panel"></div>
    <div id="viewer"></div>
    <div id="toast"></div>
  </div>
  <div id="scrim"></div>
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
  as?: KittensCardKind;
}
type Mode =
  | { type: 'target'; play: PlayReq; kind: KittensPlayKind }
  | { type: 'ask'; play: PlayReq }
  /** Par de 2 Botos: falta dizer que bicho ele vira. */
  | { type: 'as'; play: PlayReq }
  /**
   * Cego com 1, 2 ou 3 fichas: se as cartas pedirem alvo (Favor, Mau-olhado, par de Tucano, 3 Favores), em quem (ou sem
   * alvo). Com 2, depois vem o bicho (`blindBicho`).
   */
  | { type: 'blindTarget'; play: PlayReq }
  /** Cego com 2 fichas: se forem par de Preguiça ou 2 Botos, o bicho (vai em `ask` e `as`; ou pula). */
  | { type: 'blindBicho'; play: PlayReq };
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
  /**
   * Toque longo (dedo): a carta levantou. Soltar sem mexer abre o zoom; mexer arrasta pra qualquer lado (inclusive de
   * lado, pra mudar a ordem da mão, sem a mão rolar).
   */
  lifted: boolean;
  /** O ponteiro (dedo/mouse) do arrasto: os outros dedos na tela não mexem nele. */
  pointerId: number;
}
/** Id do ponteiro (eventos de mouse sem `pointerId`, como nos testes, contam como o mouse: 1). */
const pidOf = (e: PointerEvent): number => e.pointerId ?? 1;
type Timer = ReturnType<typeof setTimeout>;
/** Onde fica a carta grande do meio da mesa (o tatu, o Latidor, o BUM): centro e o tamanho relativo (1 no computador). */
interface BigAt {
  cx: number;
  cy: number;
  /** Fator dos deslocamentos dos efeitos em volta da carta grande (no celular ela é menor). */
  k: number;
}
interface TatuFx extends BigAt {
  big: HTMLElement;
  sp: Timer | null;
}
/** O Tatu Latidor grande latindo no meio da mesa enquanto quem tem que se defender não joga o Desarme. */
interface BarkFx extends BigAt {
  big: HTMLElement;
  woof: Timer | null;
}

/**
 * Celular em pé: o palco fica na escala 1 (1 px do palco = 1 px da tela), pra fonte de pixel (Press Start 2P, VT323)
 * cair em tamanho inteiro e ficar nítida. Só abaixo desta largura ele encolhe (escala = largura / PHONE_MIN_W).
 */
const PHONE_MIN_W = 360;
/**
 * Celular baixo (o Safari com as barras deixa ~660 de altura num celular de 844): abaixo disto, o layout compacto
 * (kt-short).
 */
const PHONE_SHORT_H = 760;
/** Nem o compacto cabe abaixo desta altura: aí o palco encolhe (escala = altura / PHONE_MIN_H). */
const PHONE_MIN_H = 640;
/** Tamanho da carta grande do meio no celular, em relação à do computador (lá ela é 2×; aqui até 1,3×, veja bigAt). */
const PHONE_K = 0.65;
/** Distância entre as cartas da mão no celular: a carta (112) + 6 de folga, sem uma cobrir a outra (a mão rola). */
const PHONE_STEP = 118;
/** Tocar e segurar numa carta: na mão ela levanta (soltar abre o zoom; arrastar muda a ordem); fora dela, zoom. */
const LONG_PRESS_MS = 400;
/** Arrastando uma carta perto da borda da mão (celular): a mão rola sozinha pra esse lado. */
const EDGE_PX = 40;

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
  /** Nome sem escapar (pra propriedades do DOM, como `title`). */
  const rawName = (p: string): string => (p === ME ? 'Você' : seatOf(p)?.name ?? p);
  const upName = (p: string): string => (p === ME ? 'VOCÊ' : esc((seatOf(p)?.name ?? p).toUpperCase()));
  const colorOf = (p: string): string => seatOf(p)?.color ?? '#9fb0d8';
  /** Quem só assiste (entrou depois ou não tem lugar): mesa só de leitura. */
  const spectating = (): boolean => !players.includes(ME);
  /** Você está cego pelo Mau-olhado: a mão chega como fichas `?i` e você joga às cegas. */
  const blindMe = (): boolean => !!view && view.blind.includes(ME);
  /** Par de Tucano: quantas vezes de `p` ainda vão ser puladas (visão de servidor antigo, sem `skips`: nenhuma). */
  const skipsOf = (v: KittensView, p: string): number => {
    const skips = v.skips as KittensView['skips'] | undefined;
    return skips && Object.hasOwn(skips, p) ? skips[p]! : 0;
  };
  /** "Sua vez" da legenda (cego: lembra que dá pra comprar pra voltar a ver). */
  /** Quantos turnos você ainda deve (Ataque acumula), na legenda da sua vez. */
  const owedText = (): string => ((view?.owed ?? 1) > 1 ? ` Faltam ${view!.owed} turnos seus (contando este).` : '');
  const yourTurn = (): string => (blindMe() ? `Sua vez!${owedText()} Você está CEGO: jogue às cegas ou compre pra voltar a ver.` : `Sua vez!${owedText()} Jogue cartas ou compre.`);
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
  let stageH = 900;
  let bgWidth = 0;
  // Celular em pé: o palco vira uma coluna do tamanho da tela (classe kt-phone), na escala 1 (veja PHONE_MIN_W).
  let layout: MesaLayout = opts.layout ?? 'desktop';
  const phone = (): boolean => layout === 'phone';
  /** Texto de ajuda no jeito do aparelho: no celular (sem mouse) "clique" vira "toque". */
  const tx = (s: string): string => (phone() ? s.replace(/\bclique\b/g, 'toque').replace(/\bClique\b/g, 'Toque') : s);
  stage.classList.toggle('kt-phone', phone());
  function fit(): void {
    if (destroyed) return;
    const W = wrap.clientWidth || window.innerWidth;
    const H = wrap.clientHeight || window.innerHeight;
    if (phone()) {
      scale = Math.min(1, W / PHONE_MIN_W, H / PHONE_MIN_H);
      stageW = Math.round(W / scale);
      stageH = Math.round(H / scale);
      stage.classList.toggle('kt-short', stageH < PHONE_SHORT_H);
      stage.style.width = stageW + 'px';
      stage.style.height = stageH + 'px';
      stage.style.transform = `scale(${scale})`;
      const pc = $<HTMLCanvasElement>('#particles');
      pc.width = Math.ceil(stageW / 4);
      pc.height = Math.ceil(stageH / 4);
      // O cerrado fica na proporção da tela em pé (o canvas cobre o palco com object-fit: cover).
      const w = Math.max(120, Math.round((180 * stageW) / stageH));
      if (Math.abs(w - bgWidth) > 2) { bgWidth = w; Cerrado.start($<HTMLCanvasElement>('#bg'), opts.seed, w); }
      if (view) { renderSeats(); renderHand(); }
      return;
    }
    stageH = 900;
    stage.style.height = '';
    stage.classList.remove('kt-short');
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
  Fx.init(stage, $('#fxlayer'), $<HTMLCanvasElement>('#particles'), () => scale, clampToSeats);
  /**
   * Celular: a fileira dos adversários rola pro lado; um adversário fora da tela vira a borda visível da fileira (a
   * carta voa até a beirada da tela, e não pra fora dela).
   */
  function clampToSeats(el: Element, b: Box): Box {
    if (!phone() || !el.closest('.kt-seat')) return b;
    const row = $('#seats');
    const r = row.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    if (!r.width) return b;
    const left = (r.left - st.left) / scale + 30;
    const right = (r.right - st.left) / scale - 30;
    return { ...b, x: Math.min(right, Math.max(left, b.x)) };
  }
  /**
   * Celular: rola a fileira dos adversários (na hora, sem animação) até `p` aparecer inteiro, pra quem está no efeito
   * (o alvo do Favor, quem comprou, quem explodiu…) ficar na tela.
   */
  function revealSeat(el: HTMLElement): void {
    if (!phone()) return;
    const row = $('#seats');
    const r = row.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (!r.width) return;
    if (e.left < r.left) row.scrollLeft -= (r.left - e.left) / scale + 10;
    else if (e.right > r.right) row.scrollLeft += (e.right - r.right) / scale + 10;
  }
  /**
   * Onde fica a carta grande do meio (o tatu do Desarme, o Latidor, o BUM): no computador, o ponto fixo de sempre do
   * palco; no celular, o centro da mesa (que muda com a altura da tela), com a carta menor.
   */
  function bigAt(): BigAt {
    if (!phone()) return { cx: stageW / 2, cy: 470, k: 1 };
    const b = Fx.box($('#table'));
    // A carta grande cabe na altura da mesa (no celular baixo ela encolhe, até a metade da do computador). O CSS lê o
    // tamanho dela (e o do tatu soldado) em --kt-big.
    const k = b.h ? Math.min(PHONE_K, Math.max(0.5, (b.h - 12) / (2 * 156))) : PHONE_K;
    stage.style.setProperty('--kt-big', String(2 * k));
    return { cx: b.w ? b.x : stageW / 2, cy: b.h ? b.y : stageH / 2, k };
  }
  /** Tamanho dos textos que pulam (BUM!, UFA!, AU AU!): no celular, múltiplos de 8 (a letra de pixel nítida, e cabe). */
  const popPx = (desktop: number, ph: number): number => (phone() ? ph : desktop);
  /** Onde os efeitos "em você" aparecem: no computador, acima da mão; no celular, no meio da mão. */
  const mineAt = (y: number): At => (phone() ? Fx.box($('#hand')) : { x: stageW / 2, y });

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
    frontHidden.clear();
    airHidden = false;
    if (view.choice?.kind === 'tatu') showTatu();
    else if (tatuFx) clearTatu();
    if (view.choice?.kind === 'latido') showBark();
    else if (barkFx) clearBark();
    // Sem defesa do Latidor nem Feitiço abertos, as marcas não valem mais (senão uma animação de depois as herdaria).
    if (view.choice?.kind !== 'latido') barkAt = null;
    if (view.choice?.kind !== 'feitico') conjureFrom = null;
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
    // Os efeitos pulados (o Desarme contra o Latidor, a compra do Feitiço) não vão limpar essas marcas.
    barkAt = null;
    conjureFrom = null;
    settle();
    sayState();
  }
  /** Fila maior que isso quando chega visão nova = atrasada demais: pula. */
  const MAX_BACKLOG = 4;
  /** Uma visão só com mais entradas novas que isso (ex.: voltou depois de muito tempo) também é pulada. */
  const MAX_BATCH = 12;
  const onVisibility = (): void => {
    if (!document.hidden) return;
    // Rede de segurança: sem o pointerup (aba trocada no meio do arrasto), a mão ficaria sem redesenhar.
    if (drag) onDragCancel();
    if (queue.length) fastForward([]);
  };

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
  /** O Tatu Latidor grande latindo enquanto quem tem que se defender não joga o Desarme. */
  let barkFx: BarkFx | null = null;
  /** Quem levou o latido agora há pouco (se o próximo efeito for a explosão dele, ela é do Latidor, não de um Tatubum). */
  let barkAt: string | null = null;
  /** O último latido foi de um par de Latidores (a defesa leva só o Desarme: os Latidores do alvo ficam). */
  let barkPair = false;
  /** Quem ficou com a carta do Feitiço: a compra seguinte dele sai do FUNDO do monte. */
  let conjureFrom: string | null = null;
  /** Cartas que acabaram de ir pra frente de alguém: escondidas até o voo chegar. */
  const frontHidden = new Set<string>();
  /** Fim de jogo: 'hidden' → 'title' (só o nome, durante os fogos) → 'full' (fundo escuro e botões). */
  let overStage: 'hidden' | 'title' | 'full' = 'hidden';
  /** Quadro do descarte: aberto? aberto pra escolher dos 4 bichos diferentes? */
  let pileOpen = false;
  let pileForPick = false;
  let pileKey = '';
  /** Quantas os 4 bichos diferentes mandaram pegar no começo (pra dizer "mais uma" só na segunda). */
  let cincoFirst = 2;
  /** Quantas o Favor aberto mandou dar no começo (1; 3 no trio de Favor), pra dizer "MAIS 2" depois da primeira. */
  let favorFirst = 1;
  const logLines: { text: string; cls: string }[] = [];
  /** Fundo de cada tipo de carta (cerrado na cor dela), desenhado uma vez. */
  const sceneCache = new Map<KittensCardKind, string>();
  /** Bichinho de cada cor já desenhado (URL pronta). */
  const critterUrls = new Map<string, string>();
  /** Jogada mandada pro servidor e ainda sem resposta (não manda de novo com clique duplo). */
  let inFlight = false;

  function onState(next: KittensView): void {
    const prev = view;
    const rects = cardRects();
    view = next;
    const v = next;
    // A resposta da jogada chegou (ou a vez andou): o pedido não está mais no ar.
    inFlight = false;
    // Favor que acabou de abrir (o trio de Favor abre com 3): guarda quantas eram, pra dizer "MAIS 2" depois.
    const fc = v.choice?.kind === 'favor' ? v.choice : null;
    const pc = prev?.choice?.kind === 'favor' ? prev.choice : null;
    if (fc && (!pc || pc.deadline !== fc.deadline || pc.who !== fc.who)) favorFirst = fc.left;
    // Partida nova (JOGAR DE NOVO, ou lobby e começar de novo): o diário recomeça do zero (senão as jogadas novas
    // ficariam sem animação).
    if (prev && prev.phase !== 'playing' && v.phase === 'playing') {
      lastN = -1; logLines.length = 0; outBy = null; barkAt = null; conjureFrom = null;
      clearTatu(); clearBark(); closePile(true);
    }
    noteOut(v.log);
    // Primeira visão no meio da partida (recarregou a página, voltou pra sala): mostra como está, sem repetir as animações.
    if (!prev && v.phase !== 'lobby' && v.log.length) {
      for (const e of v.log.slice(-14)) logLines.push({ text: textOf(e.ev, null), cls: logClass(e.ev) });
      lastN = v.log[v.log.length - 1]!.n;
      if (v.phase === 'gameover') overStage = 'full';
      render();
      if (v.choice?.kind === 'tatu') showTatu();
      if (v.choice?.kind === 'latido') showBark();
      const c = v.choice;
      if (c?.kind === 'cinco' && c.who === ME) { cincoFirst = c.left; openPile(); }
      sayChoice();
      return;
    }
    const seenN = lastN;
    const fresh = v.log.filter((e) => e.n > lastN);
    if (v.log.length) lastN = v.log[v.log.length - 1]!.n;
    // Ficou cego ou voltou a ver: a mão inteira troca de ids (fichas ↔ cartas) sem nada chegar; só a carta comprada voa.
    const flipped = !!prev && prev.blind.includes(ME) !== v.blind.includes(ME);
    if (flipped) {
      for (const e of fresh) if (e.ev.t === 'draw' && e.ev.by === ME && e.ev.card && v.hand.includes(e.ev.card)) arriving.add(e.ev.card);
    } else {
      for (const id of v.hand) if (!prev || !prev.hand.includes(id)) arriving.add(id);
    }
    // Carta que acabou de ir pra frente de alguém (Tatu Latidor) aparece quando o voo chega.
    for (const p of v.players) for (const id of v.front[p] ?? []) if (prev && !(prev.front[p] ?? []).includes(id)) frontHidden.add(id);
    if (fresh.some((e) => e.ev.t === 'play' || e.ev.t === 'nope')) airHidden = true;
    for (const id of [...selected]) if (!v.hand.includes(id)) selected.delete(id);
    // Cego: as fichas andam quando uma carta sai ou chega, ou quando o Mau-olhado embaralha de novo (a ficha ?2 pode ser
    // outra carta agora, mesmo com a mão do mesmo tamanho): a seleção, a ordem da mão e a jogada pela metade não valem mais.
    const handMoved = !!prev && (prev.hand.length !== v.hand.length || prev.hand.some((id, i) => v.hand[i] !== id));
    if (flipped || (v.blind.includes(ME) && prev && (handMoved || fresh.some((e) => involves(e.ev, ME))))) {
      selected.clear();
      handOrder = [];
      if (mode) dropMode();
    }
    if (v.phase !== 'playing' || v.current !== ME || v.pending || v.choice) mode = null;
    if (prev && prev.current !== ME && v.current === ME && v.phase === 'playing') Sound.play('turn');
    render();

    const items: QueueItem[] = [];
    if (v.phase === 'playing' && (!prev || prev.phase !== 'playing')) items.push({ run: () => dealAnim() });
    for (const e of fresh) {
      items.push({ run: () => animate(e.ev, prev, rects, v), skip: () => pushLog(textOf(e.ev, prev, playCardsOf(e.ev, v)), logClass(e.ev)) });
    }
    // 4 bichos diferentes e o fim do par de Mico: o quadro do descarte abre sozinho pra você escolher (depois que a jogada, ou
    // o último descarte do Mico, chega no descarte).
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

  /** Onde está cada carta da mão e as da frente de cada um (de onde as animações saem, antes do redesenho). */
  function cardRects(): Record<string, Box> {
    const out: Record<string, Box> = {};
    wrap.querySelectorAll<HTMLElement>('#hand .kt-card, #front .kt-card, .kt-seat .kt-front .kt-card').forEach((el) => { if (el.dataset.id) out[el.dataset.id] = Fx.box(el); });
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
      // Ficha do cego (Mau-olhado): o verso, mas é uma carta da mão (dá pra escolher, arrastar e dar zoom).
      if (!back && isToken(id)) {
        el.classList.add('kt-token');
        el.dataset.id = id!;
      }
      return el;
    }
    const st = Sprites.style[k];
    el.className = 'kt-card ' + k;
    el.dataset.id = id;
    el.style.backgroundImage = 'url(' + sceneUrl(k) + ')';
    // A faixa do topo é sempre um tom mais escuro do fundo da carta (pedido do Rafa).
    const band = Sprites.shade(CARD_COLOR[k], -0.25);
    // Todas as cartas têm arte do Flow com o fundo recortado (o que não é carta, como a ficha do cego, é verso, acima).
    el.innerHTML = `<div class="band" style="background:${band}"></div><img class="art flow" src="${ART[k]}" alt=""><div class="kt-name">${cardName(k)}</div><div class="kt-hint">${st.hint}</div>`;
    return el;
  }

  // ---------------------------------------------------------------- render
  function render(): void {
    if (!view || destroyed) return;
    renderTop();
    renderSeats();
    renderTable();
    renderFront();
    renderHand();
    renderActions();
    renderPanel();
    renderLog();
    renderOver();
    renderPile();
    syncTatu();
    setCaption(captionText);
    tickTimers();
    syncSheets();
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
        // Fim do par de Mico: quem jogou pega uma das descartadas.
        if (c.from === 'mico') return c.who === ME ? `Pegue UMA das descartadas ${TIMER}` : `${nameOf(c.who)} vai pegar uma das descartadas…`;
        if (c.who === ME) return `${c.left === 2 ? 'Pegue DUAS do descarte' : cincoFirst === 2 ? 'Pegue MAIS UMA do descarte' : 'Pegue UMA do descarte'} ${TIMER}`;
        return `${nameOf(c.who)} vai pegar ${c.left === 2 ? 'duas' : cincoFirst === 2 ? 'mais uma' : 'uma'} do descarte…`;
      case 'latido':
        if (c.who !== ME) return `${nameOf(c.who)} está se defendendo ${c.pair ? 'do par de Latidores' : 'do Latidor'}…`;
        return blindMe() ? `AU AU! Solte uma carta virada no Latidor (vai o seu Desarme) ${TIMER}` : `AU AU! JOGUE O DESARME! ${TIMER}`;
      case 'feitico':
        return c.who === ME ? null : `${nameOf(c.who)} está vendo a carta de baixo do monte…`;
      case 'favor': {
        // Favor sozinho: o painel de quem dá basta (e a legenda da jogada fica). Trio de Favor: diz quantas faltam.
        if (favorFirst <= 1) return null;
        if (c.who === ME) return `${favorGiveTitle(c.to, c.left)} ${TIMER}`;
        const more = c.left < favorFirst ? 'mais ' : '';
        return `${nameOf(c.who)} vai dar ${more}${cardsCount(c.left).toLowerCase()} pra ${c.to === ME ? 'você' : nameOf(c.to)}…`;
      }
    }
    return null;
  }
  /** Quem dá o Favor: "FAVOR PRA CAIO"; no trio, "DÊ 3 CARTAS PRA CAIO" e depois "MAIS 2 CARTAS PRA CAIO". */
  function favorGiveTitle(to: string, left: number): string {
    if (favorFirst <= 1) return `FAVOR PRA ${upName(to)}`;
    return `${left < favorFirst ? 'MAIS' : 'DÊ'} ${cardsCount(left)} PRA ${upName(to)}`;
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
    else if (v.phase === 'playing' && v.current) say(v.current === ME ? yourTurn() : `Vez de ${nameOf(v.current)}`);
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
    // Celular: a fileira rola pro lado; o redesenho não pode jogar a rolagem (nem a do revealSeat) pro começo.
    const scrollX = box.scrollLeft;
    box.innerHTML = '';
    list.forEach((p, i) => {
      const { x, y } = seatPos(i, list.length);
      const el = document.createElement('div');
      el.className = 'kt-seat';
      el.dataset.p = p;
      // No celular os assentos ficam numa fileira (com rolagem pro lado), sem posição no arco.
      if (!phone()) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      }
      const dead = v.phase !== 'lobby' && !v.alive.includes(p);
      if (dead) el.classList.add('dead');
      if (v.winner === p) el.classList.add('winner');
      if (v.current === p) el.classList.add('turn');
      if ((mode?.type === 'target' || mode?.type === 'blindTarget') && validTarget(p)) {
        el.classList.add('targetable');
        el.onclick = () => chooseTarget(p);
      } else if (phone()) {
        // Celular: tocar no assento mostra tudo o que no computador fica nas dicas (title) dele.
        el.onclick = () => zoomSeat(p);
      }
      if (el.onclick) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.setAttribute('aria-label', el.classList.contains('targetable') ? `Escolher ${rawName(p)}` : `Ver ${rawName(p)}`);
        el.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          // (sem isto, Enter e espaço também iriam pros atalhos da mesa: jogar e comprar)
          e.preventDefault();
          e.stopPropagation();
          el.click();
        };
      }
      // Ordem da vez: PRÓXIMO no que joga depois de quem está na vez, número nos outros.
      const k = orderFromCurrent(p);
      const order = dead || k < 1 ? '' : k === 1 ? '<div class="order next">PRÓXIMO</div>' : `<div class="order">${k + 1}º</div>`;
      if (k === 1) el.classList.add('next');
      const n = v.handCounts[p] ?? 0;
      const thinking = v.phase === 'playing' && v.current === p && !dead && !v.pending && !v.choice;
      const c = v.choice;
      const choosing = c && !dead && (c.kind === 'mico' ? c.waiting.includes(p) : c.who === p);
      const chipText = c?.kind === 'mico' ? 'descartando…' : c?.kind === 'tatu' ? 'desarmando…' : c?.kind === 'latido' ? (phone() ? 'defendendo…' : 'se defendendo…') : 'escolhendo…';
      // "caiu…": a conexão do assento caiu (o servidor espera 30 s antes de tirar do jogo).
      const chip = choosing ? `<div class="chip">${chipText}</div>`
        : seatOf(p)?.connected === false && !dead ? '<div class="chip">caiu…</div>'
        : thinking ? '<div class="chip think">pensando…</div>' : '';
      // Leque de versinhos (até 9) + o número grande: dá pra ver de longe quantas cartas cada um tem.
      const shown = Math.min(n, 9);
      const fan = Array.from({ length: shown }, (_, j) => `<i style="rotate:${(j - (shown - 1) / 2) * 9}deg"></i>`).join('');
      // Mau-olhado: o olho roxo no canto de quem está cego.
      const cursed = !dead && v.blind.includes(p) ? `<div class="kt-cursed" title="${nameOf(p)} está cego (Mau-olhado) até comprar">${CURSE_SVG}</div>` : '';
      // Espiar: o olhinho no canto de quem tem espiada à mostra (as cartas, só ele vê).
      const peeked = !dead && v.peekers.includes(p) ? `<div class="kt-peeked" title="${nameOf(p)} espiou o topo do monte">${EYE_SVG}</div>` : '';
      // Ataque acumulado: quantos turnos quem está na vez ainda joga, grande no assento.
      const owed = !dead && v.phase === 'playing' && v.current === p && v.owed > 1 ? `<div class="kt-owed">${v.owed} TURNOS</div>` : '';
      // Par de Tucano: quantas vezes dele ainda vão ser puladas.
      const skips = dead ? 0 : skipsOf(v, p);
      const skip = skips > 0 ? `<div class="kt-skip" title="${nameOf(p)} vai ter ${skips === 1 ? 'a próxima vez pulada' : `as próximas ${skips} vezes puladas`} (Tucano)">PULA${skips > 1 ? ` ×${skips}` : ''}</div>` : '';
      el.innerHTML = `${order}${cursed}${peeked}${owed}${skip}<img class="tatu kt-critter" alt="">
        <div class="who">${nameOf(p)}</div>
        ${dead ? '<div class="count out">FORA</div>' : `<div class="count"><span class="fan">${fan}</span><b>${n}</b></div>`}${chip}`;
      // Tatu Latidor na frente dele (à vista de todos), pequenininho ao lado do bichinho.
      const front = v.front[p] ?? [];
      if (front.length && !dead) {
        const f = document.createElement('div');
        f.className = 'kt-front';
        f.title = `Na frente de ${rawName(p)}`;
        front.forEach((id, j) => {
          const card = cardEl(id);
          card.style.left = j * 10 + 'px';
          if (frontHidden.has(id)) card.classList.add('arriving');
          f.appendChild(card);
        });
        el.appendChild(f);
      }
      // O bichinho em pixel art: na primeira vez fica pronto num instante; depois a URL já resolvida entra direto
      // (sem piscar a cada redesenho dos assentos).
      const img = el.querySelector('img');
      const color = colorOf(p);
      const known = critterUrls.get(color);
      if (known && img) img.src = known;
      else void Sprites.critter(color).then((url) => { if (url) { critterUrls.set(color, url); if (img) img.src = url; } });
      box.appendChild(el);
    });
    box.scrollLeft = scrollX;
    // Setinhas no sentido da vez: você → assentos da esquerda pra direita → você de novo. (No celular a fileira já
    // está na ordem da vez e cada um tem PRÓXIMO/2º/3º.)
    if (v.phase !== 'playing' || phone()) return;
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

  /** O assento de `p` (pros efeitos). No celular, a fileira rola até ele aparecer (`reveal` = false: não rola). */
  function seatEl(p: string, reveal = true): HTMLElement | null {
    for (const el of wrap.querySelectorAll<HTMLElement>('.kt-seat')) {
      if (el.dataset.p !== p) continue;
      if (reveal) revealSeat(el);
      return el;
    }
    return null;
  }
  function anchorOf(p: string, reveal = true): HTMLElement {
    if (p === ME) return $('#hand');
    return seatEl(p, reveal)?.querySelector<HTMLElement>('.tatu') ?? $('#deck');
  }
  /** Logo abaixo do monte (de onde o Feitiço puxa a carta de baixo). */
  function deckBottom(): At {
    const b = Fx.box($('#deck .stack'));
    return { x: b.x, y: b.y + b.h / 2 + 34 };
  }
  /** Onde ficam as cartas na frente de `p` (o Tatu Latidor): o cantinho do assento, ou o espaço ao lado da sua mão. */
  function frontAnchor(p: string): HTMLElement {
    if (p === ME) return $('#front');
    return seatEl(p)?.querySelector<HTMLElement>('.kt-front') ?? anchorOf(p);
  }

  /** As cartas na sua frente (o Tatu Latidor que ninguém respondeu), ao lado da mão. */
  function renderFront(): void {
    const v = view;
    const box = $('#front');
    box.innerHTML = '';
    const mine = v && v.phase === 'playing' && v.alive.includes(ME) ? (v.front[ME] ?? []) : [];
    if (!mine.length) return;
    box.innerHTML = '<div class="kt-ftag">NA SUA FRENTE</div>';
    mine.forEach((id, j) => {
      const c = cardEl(id);
      c.style.left = j * 22 + 'px';
      if (frontHidden.has(id)) c.classList.add('arriving');
      box.appendChild(c);
    });
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
      // Pode passar de 3 (quem mexe no monte continua vendo o que sabe): aí as cartas se encavalam no espaço das 3.
      fut.style.setProperty('--fut-gaps', String(Math.max(2, v.peek.length - 1)));
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
      // A de cima do descarte: passar o mouse abre o zoom com a explicação (pedido do Rafa). No celular é tocar e
      // segurar (tocar abre o quadro do descarte).
      if (i === arr.length - 1 && !phone()) {
        c.onmouseenter = () => zoom(id);
        c.onmouseleave = () => zoom(null);
      }
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
    // Sem contagem quando a carta no ar não aceita Nem vem! (4 bichos diferentes).
    if (!p || !kittensNopable(p.play.kind)) { bar.innerHTML = ''; return; }
    const left = Math.max(0, Math.ceil((p.resolvesAt - opts.now()) / 1000));
    if (left !== lastTic && left > 0) { lastTic = left; if (left <= 3) Sound.play('tic'); }
    bar.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < left ? 'on' : ''}${i === left - 1 ? ' last' : ''}"></i>`).join('');
  }

  /** Segundos que faltam da espera de 2 s depois do último Nem vem! na carta no ar (0: pode agora); hora do servidor. */
  function nopeWaitSecs(): number {
    const until = kittensNopeCooldownUntil(view?.pending);
    return until === null ? 0 : Math.max(0, Math.ceil((until - opts.now()) / 1000));
  }
  /** A espera que o botão NEM VEM! mostra agora (quando muda, os botões são refeitos). */
  let nopeWaitShown = 0;

  function tickTimers(): void {
    if (!view || destroyed) return;
    renderBar();
    if (nopeWaitSecs() !== nopeWaitShown) renderActions();
    const c = view.choice;
    const left = c ? Math.max(0, Math.ceil((c.deadline - opts.now()) / 1000)) + 's' : '';
    wrap.querySelectorAll('[data-timer]').forEach((t) => { t.textContent = left; });
  }

  /** A mão mudou enquanto o dedo (ou o mouse) segurava uma carta: redesenha quando soltar. */
  let handDirty = false;
  function renderHand(): void {
    const v = view;
    if (!v) return;
    // Segurando uma carta: redesenhar agora trocaria o elemento debaixo do dedo (o toque longo e o arrasto se perdem).
    if (drag) { handDirty = true; return; }
    handDirty = false;
    const hand = $('#hand');
    // Celular: a mão rola pro lado; o redesenho não pode jogar a rolagem pro começo.
    const scrollX = hand.scrollLeft;
    hand.innerHTML = '';
    $('#banners').innerHTML = '';
    hand.classList.toggle('myturn', v.phase === 'playing' && v.current === ME && !v.pending && !v.choice);
    const c = v.choice;
    // Favor e descarte do Mico: a carta clicada sai da mão (contorno vermelho); Tatubum: só o Desarme acende.
    const blind = blindMe() && v.phase === 'playing';
    // Desarme (Tatubum ou Latidor): quem vê só acende o Desarme; o cego escolhe qualquer ficha (o servidor joga o Desarme).
    const defending = (c?.kind === 'tatu' || c?.kind === 'latido') && c.who === ME;
    hand.classList.toggle('giving', (c?.kind === 'favor' && c.who === ME) || (c?.kind === 'mico' && c.waiting.includes(ME)) || (defending && blind));
    hand.classList.toggle('defusing', defending && !blind);
    hand.classList.toggle('kt-blind', blind);
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
    const hw = hand.clientWidth || (phone() ? stageW : 940);
    let step = Math.min(118, (hw - 112) / Math.max(1, n - 1));
    let width = step * (n - 1) + 112;
    let x0 = (hw - width) / 2;
    // Celular: as cartas ficam inteiras (uma não cobre o nome da outra) e, se não couberem, a mão rola pro lado.
    if (phone() && step < PHONE_STEP) {
      step = PHONE_STEP;
      width = step * (n - 1) + 112;
      x0 = 10;
    }
    order.forEach((id, i) => {
      const el = cardEl(id);
      el.style.left = x0 + i * step + 'px';
      el.style.zIndex = String(i);
      if (selected.has(id)) el.classList.add('sel');
      if (arriving.has(id)) el.classList.add('arriving');
      el.onpointerdown = (e) => startDrag(e, id);
      if (!phone()) el.ondblclick = () => { if (!canDraw()) return; selected = new Set([id]); playSelected(); };
      if (!phone()) el.onmouseleave = () => zoom(null);
      hand.appendChild(el);
    });
    if (phone() && x0 === 10) {
      // Respiro no fim da rolagem.
      const pad = document.createElement('div');
      pad.className = 'kt-handpad';
      pad.style.left = x0 + width + 'px';
      hand.appendChild(pad);
      hand.scrollLeft = scrollX;
    }
    // No celular as faixas ficam numa fita na borda de cima da mesa (a mão rola e cortaria o que passa da borda; e por
    // cima, em vez de numa linha própria, elas aparecem e somem sem a mesa pular).
    const tags = phone() ? $('#banners') : hand;
    // Ataque acumulado: faixa grande com quantos turnos você ainda joga (contando este).
    if (v.phase === 'playing' && v.current === ME && v.owed > 1) {
      const tag = document.createElement('div');
      tag.className = `kt-owedtag${blind ? ' high' : ''}`;
      tag.innerHTML = `<b>FALTAM ${v.owed} TURNOS</b><span>contando este</span>`;
      tags.appendChild(tag);
    }
    // Mau-olhado: a faixa grande fica até você comprar.
    if (blind) {
      const tag = document.createElement('div');
      tag.className = 'kt-blindtag';
      tag.innerHTML = `${CURSE_SVG}<b>VOCÊ ESTÁ CEGO!</b><span>compre uma carta pra voltar a ver</span>`;
      tags.appendChild(tag);
    }
    // Par de Tucano: a sua próxima vez vai ser pulada (nunca junto com a faixa do Ataque: quem tem vez pulada não está na vez).
    const skips = v.phase === 'playing' && v.alive.includes(ME) ? skipsOf(v, ME) : 0;
    if (skips > 0) {
      const tag = document.createElement('div');
      tag.className = `kt-skiptag${blind ? ' high' : ''}`;
      // No celular (fita estreita) só o curto: VAI PULAR.
      const long = skips === 1 ? 'SUA PRÓXIMA VEZ VAI SER PULADA' : `SUAS PRÓXIMAS ${skips} VEZES VÃO SER PULADAS`;
      tag.innerHTML = `${TUCANO_SVG}<b>${long}</b><em>VAI PULAR${skips > 1 ? ` ×${skips}` : ''}</em><span>Tucano</span>`;
      tags.appendChild(tag);
    }
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
  /** Toque longo em andamento (celular): onde o dedo desceu e o relógio dos 400 ms. */
  let press: { x: number; y: number; t: Timer | null; pointerId: number } | null = null;
  /** Depois do toque longo, o clique que o navegador ainda manda é engolido (até esta hora). */
  let swallowUntil = 0;

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
    // Outro dedo encostou com um arrasto em andamento: ignora. (O mesmo ponteiro de novo = o arrasto velho perdeu o
    // pointerup, ex.: mouse solto fora da janela: ele acaba e começa outro.)
    if (drag) {
      if (drag.pointerId !== pidOf(e)) return;
      onDragCancel();
    }
    e.preventDefault();
    drag = { id, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, ids: [id], hover: null, lifted: false, pointerId: pidOf(e) };
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
    wrap.querySelectorAll('#hand .kt-card.dragging, #hand .kt-card.lifted').forEach((c) => c.classList.remove('dragging', 'lifted'));
    stopEdgeScroll();
    stage.removeEventListener('touchmove', onTouchMove);
  }
  /**
   * O navegador tomou o ponteiro (rolagem da mão, gesto, alerta) ou a aba foi escondida: o arrasto acaba sem jogar
   * nada. Só a mão é redesenhada, e só se mudou enquanto a carta estava segura.
   */
  function onDragCancel(e?: PointerEvent): void {
    const d = drag;
    if (!d || (e && pidOf(e) !== d.pointerId)) return;
    stopDragListeners();
    drag = null;
    dropGhost(d);
    if (handDirty) renderHand();
  }

  function onDragMove(e: PointerEvent): void {
    const d = drag;
    if (!d || pidOf(e) !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    if (!d.moved) {
      d.moved = true;
      // Arrastar uma carta da seleção leva a seleção inteira (par, trio, 4 bichos diferentes).
      d.ids = selected.has(d.id) && selected.size > 1 ? orderedHand().filter((x) => selected.has(x)) : [d.id];
      const g = cardEl(d.id);
      g.classList.add('ghost');
      if (d.ids.length > 1) g.dataset.n = String(d.ids.length);
      $('#fxlayer').appendChild(g);
      d.ghost = g;
      handCard(d.id)?.classList.remove('lifted');
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
    edgeScroll(e);
  }

  /**
   * Celular: arrastando a carta perto da borda esquerda/direita da mão, a mão rola sozinha pra esse lado (dá pra levar
   * a carta pra uma posição que não está na tela).
   */
  let edgeDir = 0;
  let edgeTimer: Timer | null = null;
  function edgeScroll(e: PointerEvent): void {
    if (!phone()) return;
    const r = $('#hand').getBoundingClientRect();
    const inRow = e.clientY >= r.top - 40 && e.clientY <= r.bottom;
    const dir = !inRow || !r.width ? 0 : e.clientX < r.left + EDGE_PX * scale ? -1 : e.clientX > r.right - EDGE_PX * scale ? 1 : 0;
    if (dir === edgeDir) return;
    stopEdgeScroll();
    edgeDir = dir;
    if (dir) edgeTimer = every(() => { $('#hand').scrollLeft += edgeDir * 10; }, 30);
  }
  function stopEdgeScroll(): void {
    stopEvery(edgeTimer);
    edgeTimer = null;
    edgeDir = 0;
  }

  function onDragEnd(e: PointerEvent): void {
    const d = drag;
    if (!d || pidOf(e) !== d.pointerId) return;
    stopDragListeners();
    drag = null;
    if (handDirty) renderHand();
    if (d.lifted && !d.moved) {
      // Tocou, segurou e soltou sem mexer: abre o zoom (sem selecionar a carta). O clique que o navegador ainda manda
      // não pode fechar o zoom que acabou de abrir.
      dropGhost(d);
      swallowUntil = Date.now() + 700;
      zoom(d.id);
      return;
    }
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

  /** Solta na mesa ou num adversário: joga (ou dá o Favor, joga o Desarme, dá Nem vem!). */
  function dropPlay(ids: string[], t: DropTarget): void {
    const v = view;
    if (!v) return;
    const c = v.choice;
    const blind = blindMe();
    if (c?.kind === 'favor' && c.who === ME) {
      if (ids.length === 1) act({ type: 'choose', card: ids[0] });
      render();
      return;
    }
    // Comprou o Tatubum ou levou o latido: só o Desarme, solto no tatu/Latidor (ou na mesa). Cego: qualquer ficha.
    if ((c?.kind === 'tatu' || c?.kind === 'latido') && c.who === ME) {
      if (ids.length === 1 && (blind || kindOf(ids[0]!) === 'cafune')) playDefuse(ids[0]);
      else { toast(blind ? 'Solte uma carta só.' : 'Agora só o Desarme!'); Sound.play('error'); }
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
    // Nem vem! com carta no ar. O cego tenta às cegas: a ficha solta vai como o Nem vem! (o servidor confere).
    if (v.pending && ids.length === 1 && (blind || kindOf(ids[0]!) === 'nemvem')) { nope(blind ? ids[0] : undefined); render(); return; }
    selected = new Set(ids);
    const seat = t.type === 'seat' && t.p !== ME ? t.p : undefined;
    if (blind) {
      // Às cegas: solta num adversário = alvo (se a carta pedir um); na mesa, pergunta o que ela poderia pedir.
      blindStep({ cards: ids, ...(seat ? { target: seat } : {}) });
      return;
    }
    const guess = guessPlay(ids);
    if (!guess) { toast('Essas cartas não formam jogada.'); Sound.play('error'); render(); return; }
    proceed({ cards: ids }, guess, seat);
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
    if ((c?.kind === 'tatu' || c?.kind === 'latido') && c.who === ME) {
      if (blindMe() || kindOf(id) === 'cafune') playDefuse(id);
      else { toast('Agora só o Desarme!'); Sound.play('error'); }
      return;
    }
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    mode = null;
    Sound.play('select');
    render();
  }

  /**
   * Alvo que vale pra jogada que pede um: o Favor (e o trio de Favor) precisa de alguém com carta; o Mau-olhado e o par
   * de Tucano valem em qualquer adversário vivo. Às cegas não dá pra saber qual é: qualquer adversário vivo.
   */
  function validTarget(p: string): boolean {
    const v = view;
    if (!v || p === ME || !v.alive.includes(p)) return false;
    const kind = mode?.type === 'target' ? mode.kind : mode?.type === 'blindTarget' ? 'olhado' : 'favor';
    return kind === 'olhado' || kind === 'par' || (v.handCounts[p] ?? 0) > 0;
  }

  /** Muda o modo (pedir bicho, alvo…) com a legenda dele. */
  function setMode(m: Mode, caption: string): void {
    mode = m;
    captionText = caption;
    render();
  }
  /** Desiste do modo (e da legenda dele). */
  function dropMode(): void {
    mode = null;
    if (MODE_CAPTIONS.includes(captionText)) captionText = '';
  }

  /**
   * Leva a jogada adiante pedindo o que falta, na ordem: o bicho do par de 2 Botos (`as`), o bicho pedido no par de
   * Preguiça (`ask`, também quando os Botos viram Preguiça) e o adversário (Favor, trio de Favor, Mau-olhado, par de
   * Tucano, também quando os Botos viram Tucano). `seat` = onde a carta foi solta (vale como alvo). Com tudo na mão, manda.
   */
  function proceed(play: PlayReq, guess: PlayGuess, seat?: string): void {
    if (guess.kind === 'par' && guess.as === null && !play.as) { setMode({ type: 'as', play }, AS_CAPTION); return; }
    const as = play.as ?? guess.as;
    if (guess.kind === 'par' && as === 'preguica' && !play.ask) { setMode({ type: 'ask', play }, ASK_CAPTION); return; }
    if (needsTarget({ kind: guess.kind, as }) && !play.target) {
      mode = { type: 'target', play, kind: guess.kind };
      if (seat && validTarget(seat)) { chooseTarget(seat); return; }
      setMode(mode, TARGET_CAPTION);
      return;
    }
    send(play);
  }

  function playSelected(): void {
    if (!selected.size || !canDraw()) return;
    const play: PlayReq = { cards: [...selected] };
    // Às cegas não dá pra saber o que forma: o servidor decide (antes, pergunta o que as cartas escondidas poderiam pedir).
    if (blindMe()) { blindStep(play); return; }
    const guess = guessPlay(play.cards);
    if (guess) proceed(play, guess);
  }

  function chooseTarget(p: string): void {
    if (mode?.type === 'target') send({ ...mode.play, target: p });
    else if (mode?.type === 'blindTarget') blindStep({ ...mode.play, target: p });
  }

  /**
   * Jogada às cegas: com 1, 2 ou 3 fichas (Favor, Mau-olhado, par de Tucano, 3 Favores), pergunta em quem (se as cartas
   * pedirem alvo); com 2, depois, que bicho (se forem par de Preguiça ou 2 Botos, vai como `ask` e `as`). Dá pra pular as
   * duas (`noTarget` = já pulou o alvo); o servidor ignora o que a jogada não usa.
   */
  function blindStep(play: PlayReq, noTarget = false): void {
    if (play.cards.length <= 3 && !play.target && !noTarget) { setMode({ type: 'blindTarget', play }, BLIND_TARGET_CAPTION); return; }
    if (play.cards.length === 2 && !play.ask) { setMode({ type: 'blindBicho', play }, BLIND_BICHO_CAPTION); return; }
    send(play);
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

  /**
   * Joga o Desarme (o pedido, ou o primeiro da mão) no Tatubum que você comprou ou contra o Tatu Latidor. Cego: qualquer
   * ficha vale (o servidor joga o seu Desarme).
   */
  function playDefuse(id?: string): void {
    const v = view;
    const c = v?.choice;
    if (!v || (c?.kind !== 'tatu' && c?.kind !== 'latido') || c.who !== ME) return;
    const card = id ?? (blindMe() ? v.hand[0] : v.hand.find((x) => kindOf(x) === 'cafune'));
    if (card) act({ type: 'choose', card });
  }

  /**
   * Nem vem! (`card` = qual: a ficha, quando você está cego; sem ela o servidor usa um da mão). Vai junto o que você
   * viu (pedido do Rafa, 2026-10-20): `at` = quantos Nem vem! já tinha na carta no ar e `on` = a primeira carta dela.
   * Se alguém deu Nem vem! antes (ou a carta no ar mudou), o servidor recusa: a carta continua na mão (nada sai dela
   * antes da resposta) e o `error()` mostra o aviso; dá pra tentar de novo na janela nova.
   */
  function nope(card?: string): void {
    const p = view?.pending;
    if (!p) return;
    if (!kittensNopable(p.play.kind)) { toast('Os 4 bichos diferentes não aceitam Nem vem!'); Sound.play('error'); return; }
    // Espera de 2 s depois de um Nem vem! (pedido do Rafa, 2026-10-21): tecla N e Nem vem! arrastado não fazem nada.
    const wait = nopeWaitSecs();
    if (wait > 0) { toast(`Espere ${wait} s: acabaram de dar Nem vem!`); Sound.play('error'); return; }
    const on = p.play.cards[0];
    act({ type: 'nope', ...(card ? { card } : {}), at: p.nopes.length, ...(on ? { on } : {}) });
  }

  function renderActions(): void {
    fillActions();
    // Celular: a faixa dos botões tem altura fixa (dica numa linha, botões na outra). Se os botões não cabem lado a
    // lado (3 botões, ou um rótulo comprido), a letra deles diminui em vez de abrir outra linha.
    const box = $('#actions');
    box.classList.remove('kt-tight', 'kt-longhint');
    if (!phone()) return;
    const tops = new Set([...box.querySelectorAll<HTMLElement>('.kt-btn')].map((b) => b.offsetTop));
    if (tops.size > 1) box.classList.add('kt-tight');
    // Dica comprida (não cabe numa linha): vai em 2 linhas de letra menor, e os botões ficam mais baixos.
    const hintEl = box.querySelector<HTMLElement>('.kt-hint');
    if (hintEl && hintEl.scrollWidth > hintEl.clientWidth + 1) box.classList.add('kt-longhint');
  }
  function fillActions(): void {
    const v = view;
    if (!v) return;
    const box = $('#actions');
    box.innerHTML = '';
    nopeWaitShown = nopeWaitSecs();
    if (v.phase !== 'playing' || !v.alive.includes(ME)) return;
    const blind = blindMe();
    const myNopes = v.hand.filter((c) => kindOf(c) === 'nemvem').length;
    // Cego não sabe se tem Nem vem!: sem botão (nem tecla N); tenta arrastando uma ficha pra mesa.
    const nopable = !!v.pending && kittensNopable(v.pending.play.kind);
    if (nopable && myNopes && !blind) {
      // Na espera de 2 s depois de um Nem vem!, o botão fica apagado mostrando quanto falta.
      const b = button(nopeWaitShown > 0 ? `NEM VEM! ${nopeWaitShown}s` : `NEM VEM! (${myNopes})`, () => nope());
      b.id = 'nope';
      if (nopeWaitShown > 0) b.disabled = true;
      box.appendChild(b);
    } else if (nopable && blind && v.hand.length) {
      box.appendChild(hint('cego: arraste uma carta virada pra mesa pra tentar um NEM VEM!'));
    }
    const c = v.choice;
    if ((c?.kind === 'tatu' || c?.kind === 'latido') && c.who === ME) {
      const where = c.kind === 'tatu' ? 'pro tatu' : 'pro Latidor';
      box.appendChild(hint(blind ? `arraste qualquer carta virada ${where}: vai o seu Desarme` : `arraste o Desarme ${where} (ou clique nele)`));
      box.appendChild(button('JOGAR DESARME', () => playDefuse(), 'yellow'));
    } else if (c?.kind === 'mico' && c.waiting.includes(ME)) {
      box.appendChild(hint('clique numa carta (ou arraste pra mesa) pra descartar'));
    } else if (myCinco(v) && !pileOpen) {
      box.appendChild(hint('escolha no quadro do descarte'));
      box.appendChild(button('VER O DESCARTE', () => openPile(), 'yellow'));
    }
    if (v.current === ME && !v.pending && !v.choice) {
      if (mode?.type === 'ask' || mode?.type === 'as' || mode?.type === 'blindBicho') {
        box.appendChild(hint(mode.type === 'blindBicho' ? 'escolha o bicho no painel (ou pule)' : 'escolha o bicho no painel'));
      } else if (mode?.type === 'blindTarget') {
        const m = mode;
        box.appendChild(hint('clique num adversário ou jogue sem alvo'));
        box.appendChild(button('SEM ALVO', () => blindStep(m.play, true)));
        box.appendChild(button('CANCELAR', () => { dropMode(); render(); }, 'ghost'));
      } else if (mode?.type === 'target') {
        box.appendChild(hint('clique num adversário'));
        box.appendChild(button('CANCELAR', () => { mode = null; captionText = ''; render(); }, 'ghost'));
      } else if (selected.size && blind) {
        box.appendChild(button('JOGAR ÀS CEGAS', playSelected));
      } else if (selected.size) {
        const guess = guessPlay([...selected]);
        const b = button(guess ? `JOGAR ${PLAY_LABEL[guess.kind]}` : 'NÃO FORMA JOGADA', playSelected);
        if (!guess) b.disabled = true;
        box.appendChild(b);
      } else {
        box.appendChild(hint(blind ? 'cego: escolha cartas viradas ou' : 'escolha cartas pra jogar ou'));
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
    d.textContent = tx(text);
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
    if (m?.type === 'ask') return `ask:${m.play.cards.join(',')}:${m.play.as ?? ''}`;
    if (m?.type === 'as') return `as:${m.play.cards.join(',')}`;
    if (m?.type === 'blindBicho') return `blind:${m.play.cards.join(',')}`;
    const c = v.choice;
    // Desarme (Tatubum e Latidor) e descarte do Mico usam a legenda (a mesa fica livre pra soltar a carta); 5 diferentes
    // usa o quadro do descarte.
    if (!c || !choiceIsMine(c)) return '';
    if (c.kind === 'cafune') return `cafune:${c.who}:${c.deadline}:${v.drawCount}`;
    if (c.kind === 'favor') return `favor:${c.to}:${c.deadline}:${c.left}`;
    if (c.kind === 'quati') return `quati:${c.card ?? ''}:${c.deadline}`;
    if (c.kind === 'feitico') return `feitico:${c.card ?? ''}:${c.deadline}`;
    return '';
  }
  /** Painel com os 6 bichos (par de Preguiça: o pedido; 2 Botos: o que eles viram; cego: os dois, ou PULAR). */
  function bichoPanel(title: string, sub: string, pick: (k: KittensCardKind) => void, skip?: () => void): void {
    const panel = $('#panel');
    panel.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="kt-row"></div>`;
    const row = $('#panel .kt-row');
    KITTENS_BICHOS.forEach((k) => row.appendChild(button(cardName(k), () => pick(k), 'small')));
    if (skip) row.appendChild(button('PULAR', skip, 'small'));
    row.appendChild(button('CANCELAR', () => { dropMode(); render(); }, 'small ghost'));
  }
  function renderPanel(): void {
    const v = view;
    if (!v) return;
    const panel = $('#panel');
    const key = panelKeyOf(v);
    if (key === panelKey) { tickTimers(); return; }
    panelKey = key;
    syncSheets();
    panel.innerHTML = '';
    if (!key) return;
    const c = v.choice;
    const m = mode;
    if (m?.type === 'blindBicho') {
      const sub = 'Se as cartas viradas forem um par de Preguiça, é o bicho que você puxa; se forem dois Botos, é o par que eles viram. Senão, não muda nada.';
      bichoPanel(BLIND_BICHO_CAPTION, sub, (k) => send({ ...m.play, ask: k, as: k }), () => send(m.play));
      return;
    }
    if (m?.type === 'ask' || m?.type === 'as') {
      const guess = guessPlay(m.play.cards);
      if (!guess) { mode = null; return; }
      if (m.type === 'ask') bichoPanel('QUE BICHO VOCÊ PUXA?', 'Vem de um adversário que tenha; se ninguém tiver, do monte.', (k) => proceed({ ...m.play, ask: k }, guess));
      else bichoPanel('QUE BICHO O BOTO VIRA?', 'Os dois Botos viram o par desse bicho e fazem o que ele faz.', (k) => proceed({ ...m.play, as: k }, guess));
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
      const more = favorFirst > 1 ? ' Uma de cada vez.' : '';
      panel.innerHTML = `<h2>${favorGiveTitle(c.to, c.left)} ${TIMER}</h2><p>${tx('Clique numa carta da sua mão pra dar.')}${more}</p>`;
    } else if (c.kind === 'quati') {
      panel.innerHTML = `<h2>A CARTA DE CIMA ${TIMER}</h2><p>Só você vê. Fica em cima ou vai pro fundo?</p><div class="cards"></div><div class="kt-row"></div>`;
      if (c.card) $('#panel .cards').appendChild(cardEl(c.card));
      const row = $('#panel .kt-row');
      row.appendChild(button('FICA EM CIMA', () => act({ type: 'choose', keep: true }), 'small'));
      row.appendChild(button('PRO FUNDO', () => act({ type: 'choose', keep: false }), 'yellow'));
    } else if (c.kind === 'feitico') {
      // Só você vê a carta de baixo do monte. Ficar com ela é comprar (Tatubum: é comprar o Tatubum).
      const tatu = c.card !== null && kindOf(c.card) === 'tatubum';
      const warn = tatu ? '<p class="kt-warn">É um TATUBUM! Ficar com ele é comprar o Tatubum: Desarme ou explode.</p>' : '';
      panel.innerHTML = `<h2>O FEITIÇO PUXOU DO FUNDO: ${TIMER}</h2><p>Só você vê. Fica com ela (é como comprar) ou põe no topo do monte? Os dois acabam o seu turno.</p>${warn}<div class="cards"></div><div class="kt-row"></div>`;
      if (c.card) $('#panel .cards').appendChild(cardEl(c.card));
      const row = $('#panel .kt-row');
      row.appendChild(button('FICAR COM ELA', () => act({ type: 'choose', keep: true }), tatu ? 'small' : 'yellow'));
      row.appendChild(button('PÔR NO TOPO', () => act({ type: 'choose', keep: false }), tatu ? 'yellow' : 'small'));
    }
    tickTimers();
  }

  // ---------------------------------------------------------------- quadro do descarte (olho) e 4 bichos diferentes
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
   * Todas as cartas do descarte, da mais nova pra mais velha. Na escolha dos 4 bichos diferentes, só as que estavam no
   * descarte antes da jogada (e continuam lá) acendem; na pegada do fim do par de Mico, só as descartadas nele. Um
   * clique pega a carta.
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
    const mico = pick?.from === 'mico';
    const title = !pick ? 'O DESCARTE'
      : mico ? 'PEGUE UMA DAS DESCARTADAS'
      : pick.left === 2 ? 'PEGUE DUAS DO DESCARTE' : cincoFirst === 2 ? 'PEGUE MAIS UMA' : 'PEGUE UMA DO DESCARTE';
    const sub = !pick
      ? `${cards.length} carta${cards.length === 1 ? '' : 's'}, da mais nova pra mais velha.`
      : mico ? 'Clique numa carta acesa: são as que foram descartadas no seu par de Mico.'
      : 'Clique numa carta acesa. As apagadas foram pro descarte depois da sua jogada.';
    pile.innerHTML = `<div class="box"><h2>${title}${pick ? ' ' + TIMER : ''}</h2><p class="psub">${tx(sub)}</p><div class="pbody"><div class="grid"></div><div class="pinfo"></div></div><div class="foot"><div class="note">${phone() ? 'toque fora pra fechar' : 'ESC ou clique fora pra fechar'}</div></div></div>`;
    const grid = $('#pile .grid');
    // Ao lado da grade: o que faz a carta que está debaixo do mouse.
    const info = $('#pile .pinfo');
    const explain = (id: string | null): void => {
      const k = id ? kindOf(id) : null;
      info.innerHTML = k ? `<h3>${cardName(k)}</h3><p>${tx(detailOf(k))}</p>` : phone() ? '<p class="phint">Toque numa carta pra ver o que ela faz (ou toque e segure).</p>' : '<p class="phint">Passe o mouse numa carta pra ver o que ela faz.</p>';
    };
    explain(null);
    cards.forEach((id) => {
      const el = cardEl(id);
      el.onmouseenter = () => explain(id);
      if (pick) {
        if (pick.options.includes(id)) {
          el.classList.add('pickable');
          el.onclick = () => act({ type: 'choose', card: id });
        } else el.classList.add('off');
      }
      // Celular (sem mouse): tocar numa carta que não dá pra pegar mostra o que ela faz.
      if (phone() && !el.onclick) el.onclick = () => explain(id);
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
    return ('by' in ev && ev.by === p) || ('to' in ev && ev.to === p) || ('from' in ev && ev.from === p) || ('target' in ev && ev.target === p) || ('who' in ev && ev.who === p);
  }
  /** As cartas da jogada de um evento `play` (a carta no ar da visão que trouxe o evento), pra dizer "(com Boto)". */
  function playCardsOf(ev: KittensEvent, v: KittensView): string[] | undefined {
    return ev.t === 'play' && v.pending?.by === ev.by ? v.pending.play.cards : undefined;
  }
  /**
   * "Você" só com maiúscula no começo da frase. `prev` = a visão de antes da leva que trouxe a entrada (a carta que estava
   * no ar e as mãos de então); `playCards` = as cartas de um evento `play`, se souber.
   */
  function textOf(ev: KittensEvent, prev: KittensView | null | undefined, playCards?: readonly string[]): string {
    return rawText(ev, prev, playCards).replace(/(?!^)Você/g, 'você');
  }
  /**
   * Trio de Favor que valeu: o alvo dá 3 cartas, ou a mão toda se tiver menos (`counts` = as mãos de antes da jogada
   * resolver).
   */
  function favorTrioText(target: string | null, by: string, counts: Record<string, number> | undefined): string {
    const k = Math.min(3, (target !== null ? counts?.[target] : undefined) ?? 3);
    return `${target ? nameOf(target) : 'alguém'} vai dar ${k === 1 ? 'uma carta' : `${k} cartas`} pra ${nameOf(by)}`;
  }
  function rawText(ev: KittensEvent, prev: KittensView | null | undefined, playCards?: readonly string[]): string {
    const prevPending = prev?.pending;
    const n = (p: string) => nameOf(p);
    switch (ev.t) {
      case 'play': {
        // Par: "PAR DE QUATI", e "(com Boto)" quando o Boto fez as vezes do bicho.
        const label = ev.play === 'par' && ev.as ? pairName(ev.as, playCards) : isFavorTrio({ kind: ev.play, as: ev.as }) ? 'TRIO DE FAVOR' : PLAY_LABEL[ev.play];
        return `${n(ev.by)} jogou ${label}${ev.target ? ' em ' + n(ev.target) : ''}${ev.ask ? ', pedindo ' + cardName(ev.ask) : ''}`;
      }
      case 'nope': return `${n(ev.by)}: NEM VEM!`;
      case 'resolved': {
        // "Sua RODA", "Seu PAR": a roda de capivara é a única feminina.
        const whose = (label: string) => (ev.by === ME ? `${label.startsWith('RODA') ? 'Sua' : 'Seu'} ${label}` : `${label} de ${n(ev.by)}`);
        if (ev.canceled) return `${whose(PLAY_LABEL[ev.play])} foi cancelado`;
        // Com Boto, o par vale o bicho em `play.as`.
        const pairKind = prevPending?.play.as ?? kindOf(prevPending?.play.cards[0] ?? '');
        const texts: Record<KittensPlayKind, string> = {
          ataque: `${whose(PLAY_LABEL.ataque)} valeu!`,
          pular: `${n(ev.by)} pulou`,
          embaralhar: `${n(ev.by)} embaralhou o monte`,
          espiar: `${n(ev.by)} espiou o futuro`,
          favor: `${prevPending?.play.target ? n(prevPending.play.target) : 'alguém'} vai dar uma carta pra ${n(ev.by)}`,
          latido: `${n(ev.by)} soltou o TATU LATIDOR: AU AU!`,
          olhado: `${whose(PLAY_LABEL.olhado)} pegou!`,
          feitico: `${n(ev.by)} fez um FEITIÇO na carta de baixo do monte`,
          par: `${whose((pairKind && PAIR_LABEL[pairKind]) ?? 'PAR')} valeu!`,
          trio:
            prevPending && isFavorTrio(prevPending.play)
              ? favorTrioText(prevPending.play.target, ev.by, prev?.handCounts)
              : `${whose('TRIO')} valeu!`,
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
        // Quem está cego não vê a carta que chegou (`card` null), mas ela veio de alguém.
        if (ev.from) return ev.card ? `${n(ev.by)} puxou ${cardName(ev.ask)} de ${n(ev.from)}` : `${n(ev.by)} puxou um bicho de ${n(ev.from)}`;
        if (ev.card) return `${n(ev.by)} puxou ${cardName(ev.ask)} ${ev.pile ? 'do descarte' : 'do monte'}`;
        return `Ninguém tinha ${cardName(ev.ask)}, nem o monte, nem o descarte`;
      case 'passed': return ev.card ? `${n(ev.from)} passou ${cardNameOf(ev.card)} pra ${n(ev.to)}` : `${n(ev.from)} passou uma carta pra ${n(ev.to)}`;
      case 'grabbed': return ev.from ? `${n(ev.by)} roubou o DESARME de ${n(ev.from)}!` : 'Ninguém tinha Desarme pra roubar';
      case 'win': return `${n(ev.by)} sobreviveu e venceu!`;
      case 'barked': return ev.target && ev.pair ? `AU AU AU! PAR DE LATIDORES em ${n(ev.target)}: Desarme ou explode!` : ev.target ? `AU AU! ${n(ev.target)} tinha TATU LATIDOR: Desarme ou explode!` : `O TATU LATIDOR ficou na frente de ${n(ev.by)}`;
      case 'cursed': return `${n(ev.target)} ficou CEGO até comprar uma carta`;
      case 'tucano': return ev.target === ME ? `${n(ev.by)} jogou o TUCANO em você: a sua próxima vez vai ser pulada` : `${n(ev.by)} jogou o TUCANO em ${n(ev.target)}: a próxima vez dele vai ser pulada`;
      case 'skipped': return `${n(ev.who)} perdeu uma vez (TUCANO)`;
      case 'cured': return `${n(ev.by)} voltou a enxergar`;
      case 'conjured': return ev.kept ? `${n(ev.by)} ficou com a carta de baixo do monte` : `${n(ev.by)} pôs a carta de baixo no topo do monte`;
    }
    return '';
  }
  function pushLog(text: string, cls = ''): void {
    logLines.push({ text, cls });
    if (logLines.length > 14) logLines.shift();
    renderLog();
  }
  function renderLog(): void {
    // No celular o diário é uma folha (com FECHAR); a última linha fica na tira fina debaixo dos adversários.
    const close = phone() ? '<button type="button" class="kt-btn small ghost kt-close"><span>FECHAR</span></button>' : '';
    $('#log').innerHTML = close + '<div class="h">DIÁRIO</div>' + logLines.map((l) => `<p class="${l.cls}">${l.text}</p>`).join('');
    const last = logLines[logLines.length - 1];
    $('#lastline').innerHTML = `<span class="kt-lltxt ${last?.cls ?? ''}">${last?.text ?? 'diário da partida'}</span><b>DIÁRIO ›</b>`;
  }
  /** Folha do diário (celular) aberta? */
  let logOpen = false;
  /** A folha do celular aberta agora (pro foco) e quem tinha o foco antes dela (volta pra lá quando ela fecha). */
  let openSheet: HTMLElement | null = null;
  let sheetReturn: HTMLElement | null = null;
  function openLog(): void {
    if (!phone()) return;
    logOpen = true;
    zoom(null);
    Sound.play('select');
    syncSheets();
  }
  /** Fecha as folhas que dá pra fechar tocando fora (diário e zoom). */
  function closeSheets(): void {
    logOpen = false;
    zoom(null);
    syncSheets();
  }
  /**
   * Celular: o fundo escuro (#scrim) aparece com qualquer folha aberta por cima da mesa: o diário, o zoom e os painéis
   * de escolha (menos o do Favor, que pede pra tocar numa carta da mão).
   */
  function syncSheets(): void {
    const p = phone();
    const panelSheet = p && panelKey !== '' && !panelKey.startsWith('favor');
    stage.classList.toggle('kt-logopen', p && logOpen);
    stage.classList.toggle('kt-dim', p && (logOpen || zoomed !== null || panelSheet));
    $('#lastline').setAttribute('aria-expanded', String(p && logOpen));
    $('#diary').setAttribute('aria-expanded', String(p && logOpen));
    // Diário e zoom do celular são diálogos: o foco entra na folha aberta e volta pra onde estava quando ela fecha.
    const sheet = !p ? null : logOpen ? $('#log') : zoomed !== null ? $('#viewer') : null;
    for (const el of [$('#log'), $('#viewer')]) {
      if (el === sheet) {
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', el.id === 'log' ? 'Diário da partida' : 'Carta de perto');
        el.tabIndex = -1;
      } else {
        el.removeAttribute('role');
        el.removeAttribute('aria-modal');
        el.removeAttribute('aria-label');
        el.removeAttribute('tabindex');
      }
    }
    if (sheet === openSheet) return;
    const active = document.activeElement;
    if (!openSheet) sheetReturn = active instanceof HTMLElement && active !== document.body ? active : null;
    openSheet = sheet;
    if (sheet) sheet.focus({ preventScroll: true });
    else {
      if (sheetReturn?.isConnected) sheetReturn.focus({ preventScroll: true });
      sheetReturn = null;
    }
  }
  $('#diary').onclick = () => (logOpen ? closeSheets() : openLog());
  $('#lastline').onclick = () => openLog();
  $('#scrim').onclick = () => closeSheets();
  $('#log').addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('.kt-close')) closeSheets(); });

  function say(text: string): void {
    captionText = text;
    setCaption(text);
  }
  /**
   * Escreve a legenda. No celular a caixa tem altura fixa (aparecer, sumir ou mudar de tamanho faria a mesa pular):
   * texto que não cabe em 2 linhas encolhe a letra (sempre em px inteiro) até caber.
   */
  function setCaption(html: string): void {
    const el = $('#caption');
    el.innerHTML = html;
    el.classList.remove('kt-long', 'kt-longer');
    if (!phone() || !html) return;
    const over = (): boolean => el.scrollHeight > el.clientHeight + 1;
    if (over()) el.classList.add('kt-long');
    if (over()) el.classList.replace('kt-long', 'kt-longer');
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
        void Fx.fly({ node: cardEl(null, { back: true }), from: deck, to: anchorOf(p, false), dur: 260, scaleTo: 0.4 });
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
    if (cur) say(cur === ME ? yourTurn() : `Vez de ${nameOf(cur)}`);
  }

  /**
   * Efeito de uma entrada do diário. `prev` é a visão de antes da leva que trouxe a entrada e `evView` a visão que
   * veio com ela (a `view` de agora pode já estar outras jogadas à frente).
   */
  async function animate(ev: KittensEvent, prev: KittensView | null, rects: Record<string, Box>, evView: KittensView): Promise<void> {
    if (!view) return;
    const text = textOf(ev, prev, playCardsOf(ev, evView));
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
              const at: At | null = next === ME ? (phone() ? mineAt(600) : { x: 650, y: 600 }) : s ? Fx.box(s) : null;
              if (at) void Fx.pop(`${view.owed} TURNOS!`, at, { size: popPx(34, 32), hold: 500, color: '#e4572e' });
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
        // A jogada abriu uma escolha (Mico, 4 bichos diferentes…): a legenda diz quem faz o quê.
        sayChoice();
        break;
      }
      case 'draw': {
        Sound.play('draw');
        // Ficou com a carta do Feitiço: ela sai de baixo do monte.
        const src: At = conjureFrom === ev.by ? deckBottom() : $('#deck .stack');
        conjureFrom = null;
        if (ev.by === ME && ev.card) {
          say(text);
          const el = handCard(ev.card);
          await Fx.fly({ node: cardEl(null, { back: true }), from: src, to: el ?? $('#hand'), dur: 420, flipTo: cardEl(ev.card) });
          arriving.delete(ev.card);
          handCard(ev.card)?.classList.remove('arriving');
        } else {
          await Fx.fly({ node: cardEl(null, { back: true }), from: src, to: anchorOf(ev.by), dur: 380, scaleTo: 0.45 });
        }
        if (view.current === ME && !view.pending && !view.choice) say(yourTurn());
        break;
      }
      case 'barked': {
        say(text);
        if (!ev.target) {
          // Ninguém mais tinha Latidor: o jogado sai do descarte e vai pra frente de quem jogou.
          const id = (evView.front[ev.by] ?? []).at(-1) ?? 'latido-0';
          Sound.play('bark');
          void Fx.pop('AU AU!', $('#discard'), { size: popPx(36, 32), hold: 300, color: '#fff3c4' });
          await Fx.fly({ node: cardEl(id), from: $('#discard'), to: frontAnchor(ev.by), dur: 520, rot: -6, scaleTo: ev.by === ME ? 0.7 : 0.36, trail: '#e0a070' });
          frontHidden.delete(id);
          renderSeats();
          renderFront();
          break;
        }
        // Latiu pra um dos que têm Latidor (um de cada vez, na ordem): o Latidor grande late no meio da mesa e quem levou
        // o latido treme.
        barkAt = ev.target;
        barkPair = !!ev.pair;
        showBark();
        Fx.shake(420, 10);
        const s = ev.target === ME ? $('#hand') : seatEl(ev.target);
        s?.classList.add('hit');
        later(() => s?.classList.remove('hit'), 600);
        await wait(view.choice?.kind === 'latido' ? 1100 : 900);
        sayChoice();
        break;
      }
      case 'cursed': {
        // Mau-olhado: olho roxo em cima de quem ficou cego; se foi você, a mão vira e embaralha.
        say(text);
        Sound.play('curse');
        Fx.flash('#5b3f9e', 180);
        const mine = ev.target === ME;
        const s = mine ? $('#hand') : seatEl(ev.target);
        s?.classList.add('hit');
        later(() => s?.classList.remove('hit'), 600);
        if (mine) {
          $('#hand').classList.add('kt-shuffling');
          later(() => q('#hand')?.classList.remove('kt-shuffling'), 900);
        }
        const at: At = mine ? mineAt(600) : s ? Fx.box(s) : anchorOf(ev.target);
        Fx.glitter(at, '#c86fd4');
        await Fx.icon(CURSE_URL, at, { size: mine ? 150 : 110, hold: 450 });
        if (mine) say('VOCÊ ESTÁ CEGO! Jogue às cegas ou compre pra voltar a ver.');
        break;
      }
      case 'tucano': {
        // Par de Tucano: o tucano voa de quem jogou até o alvo, que vai ter a próxima vez pulada.
        say(text);
        Sound.play('skip');
        const mine = ev.target === ME;
        const s = mine ? $('#hand') : seatEl(ev.target);
        const to: At = mine ? mineAt(600) : s ? Fx.box(s) : anchorOf(ev.target);
        const from: At = ev.by === ME ? mineAt(640) : anchorOf(ev.by);
        const bird = document.createElement('img');
        bird.src = TUCANO_URL;
        bird.className = 'kt-tucano';
        await Fx.fly({ node: bird, from, to, dur: 620, rot: 8, trail: '#f2c14e' });
        s?.classList.add('hit');
        later(() => s?.classList.remove('hit'), 600);
        await Fx.pop(mine ? 'SUA VEZ VAI PULAR!' : 'VAI PULAR!', to, { size: popPx(mine ? 34 : 22, 16), hold: 450, color: '#8fb0ff' });
        break;
      }
      case 'skipped': {
        // A vez chegou em quem tinha vez pulada: o assento pisca e o turno passa sozinho.
        say(text);
        Sound.play('skip');
        const mine = ev.who === ME;
        const s = mine ? $('#hand') : seatEl(ev.who);
        s?.classList.add('kt-skipped');
        later(() => s?.classList.remove('kt-skipped'), 900);
        const at: At = mine ? mineAt(600) : s ? Fx.box(s) : anchorOf(ev.who);
        void Fx.icon(TUCANO_URL, at, { size: mine ? 120 : 80, hold: 250 });
        await Fx.pop('PULOU!', at, { size: popPx(mine ? 40 : 26, 18), hold: 400, color: '#8fb0ff' });
        if (view.current === ME && !view.pending && !view.choice) say(yourTurn());
        break;
      }
      case 'cured': {
        say(text);
        Sound.play('peek');
        const at: At = ev.by === ME ? mineAt(640) : anchorOf(ev.by);
        Fx.glitter(at, '#e9dcff');
        void Fx.pop(ev.by === ME ? 'VOCÊ VOLTOU A VER!' : 'VOLTOU A VER!', at, { size: popPx(ev.by === ME ? 34 : 22, 16), hold: 450, color: '#e9dcff' });
        await wait(600);
        break;
      }
      case 'conjured': {
        // Feitiço: a carta sai de baixo do monte, pra mão (a compra seguinte voa de lá) ou pro topo.
        say(text);
        Sound.play('conjure');
        const bottom = deckBottom();
        Fx.glitter(bottom, '#7fe0b0');
        if (ev.kept) {
          conjureFrom = ev.by;
          await wait(350);
        } else {
          await Fx.fly({ node: cardEl(null, { back: true }), from: bottom, to: $('#deck .stack'), dur: 620, rot: -10, trail: '#7fe0b0' });
          Fx.glitter($('#deck .stack'), '#7fe0b0');
        }
        break;
      }
      case 'tatu': {
        conjureFrom = null;
        // Comprou o Tatubum e tem Desarme: o tatu fica tremendo no meio da mesa até o Desarme ser jogado (à mão).
        say(`${nameOf(ev.by)} comprou o… TATUBUM!`);
        showTatu();
        // Se o Desarme já foi (prazo vencido, bot rápido), a pausa é curta.
        await wait(view.choice?.kind === 'tatu' ? 1000 : 450);
        sayChoice();
        break;
      }
      case 'cafune': {
        // Desarme contra o Tatu Latidor: voa até o Latidor, que para de latir; ele e os Latidores de quem se defendeu vão
        // pro descarte (o jogado volta pro meio se o próximo da fila levar o latido).
        if ((prev?.choice?.kind === 'latido' && prev.choice.who === ev.by) || barkAt === ev.by) {
          barkAt = null;
          const b = showBark();
          stopEvery(b.woof);
          b.big.classList.remove('live');
          say(text);
          const now = view;
          const used = ev.by === ME ? prev?.hand.find((x) => kindOf(x) === 'cafune' && !now.hand.includes(x)) : undefined;
          const from: At = used && rects[used] ? rects[used]! : anchorOf(ev.by);
          Sound.play('card');
          await Fx.fly({ node: cardEl(used ?? 'cafune-0'), from, to: { x: b.cx, y: b.cy }, dur: 420, rot: -6, trail: '#f2c14e' });
          b.big.classList.remove('shaking');
          Sound.play('cafune');
          Fx.hearts({ x: b.cx, y: b.cy });
          await Fx.pop('UFA!', { x: b.cx, y: b.cy - 210 * b.k }, { size: popPx(60, 56), hold: 500, color: '#ff8fab' });
          clearBark();
          // Os Latidores de quem se defendeu (pode ser mais de um) saem de onde estavam: da frente dele, da sua mão ou do
          // bichinho do assento (os da mão dos outros não aparecem: são os que chegaram no descarte agora).
          const isLatido = (x: string) => kindOf(x) === 'latido';
          const before = prev?.discard ?? [];
          const inFront = (prev?.front[ev.by] ?? []).filter(isLatido);
          const inHand = ev.by === ME ? (prev?.hand ?? []).filter(isLatido) : [];
          // Par de Latidores: os Latidores de quem se defendeu ficam com ele.
          const pairDef = prev?.choice?.kind === 'latido' && prev.choice.who === ev.by ? !!prev.choice.pair : barkPair;
          const known = pairDef ? [] : [...inFront, ...inHand];
          const fresh = evView.discard.filter((x) => isLatido(x) && !before.includes(x) && !known.includes(x));
          const his = pairDef ? [] : known.length > 0 || fresh.length > 0 ? [...known, ...(ev.by === ME ? [] : fresh)] : ['latido-1'];
          const played = [...before].reverse().find((x) => isLatido(x) && !his.includes(x)) ?? 'latido-0';
          await Promise.all([
            Fx.fly({ node: cardEl(played), from: { x: b.cx, y: b.cy }, to: $('#discard'), dur: 420, rot: 8 }),
            ...his.map((id, i) => {
              const front = inFront.includes(id);
              const from: At = rects[id] ?? (front ? frontAnchor(ev.by) : anchorOf(ev.by));
              const scaleFrom = front ? (ev.by === ME ? 0.78 : 0.36) : ev.by === ME ? 1 : 0.5;
              return Fx.fly({ node: cardEl(id), from, to: $('#discard'), dur: 460 + 60 * i, rot: -8, scaleFrom });
            }),
          ]);
          sayChoice();
          break;
        }
        // O Desarme foi jogado: voa até o tatu, o tatu soldado entra andando, corta o fio e o pavio apaga.
        const t = showTatu();
        const { cx, cy } = t;
        holdPanel = true;
        renderPanel();
        say(text);
        const now = view;
        const used = ev.by === ME ? prev?.hand.find((x) => kindOf(x) === 'cafune' && !now.hand.includes(x)) : undefined;
        const from: At = used && rects[used] ? rects[used]! : anchorOf(ev.by);
        Sound.play('card');
        await Fx.fly({ node: cardEl(used ?? 'cafune-0'), from, to: { x: cx, y: cy }, dur: 420, rot: -6, trail: '#f2c14e' });
        await defuseWalk(t);
        stopEvery(t.sp);
        t.big.classList.remove('shaking', 'live');
        Sound.play('cafune');
        Fx.hearts({ x: cx, y: cy });
        // Já escondido (o prazo venceu e foi tudo sozinho)? O UFA! é rápido.
        const quick = !(view.choice?.kind === 'cafune' && view.choice.who === ev.by);
        await Fx.pop('UFA!', { x: cx, y: cy - 210 * t.k }, { size: popPx(60, 56), hold: quick ? 300 : 700, color: '#ff8fab' });
        clearTatu();
        holdPanel = false;
        renderPanel();
        sayChoice();
        break;
      }
      case 'boom': {
        clearTatu();
        // Levou o latido sem Desarme (ou o prazo venceu): a explosão é do Latidor, não de um Tatubum comprado.
        const barked = barkAt === ev.by || (prev?.choice?.kind === 'latido' && prev.choice.who === ev.by);
        barkAt = null;
        conjureFrom = null;
        clearBark();
        say(barked ? `${nameOf(ev.by)} não tinha Desarme pro Latidor…` : `${nameOf(ev.by)} comprou o… TATUBUM!`);
        const { cx, cy, k } = bigAt();
        const big = cardEl(barked ? 'latido-0' : 'tatubum-0');
        big.classList.add('bigcard', 'shaking');
        big.style.left = cx + 'px';
        big.style.top = cy + 'px';
        $('#fxlayer').appendChild(big);
        Sound.play(barked ? 'bark' : 'fuse');
        const sp = every(() => Fx.sparks({ x: cx + 15 * k, y: cy - 130 * k }), 120);
        await wait(1100);
        stopEvery(sp);
        big.remove();
        Sound.play('boom');
        Fx.flash('#fff3c4', 220);
        Fx.shake(600, 14);
        Fx.boom({ x: cx, y: cy });
        say(text);
        await Fx.pop('BUM!', { x: cx, y: cy - 20 * k }, { size: popPx(150, 80), hold: 900, color: '#e4572e' });
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
        // Ninguém tinha. (Cego: a carta que ele ganhou não aparece, mas o verso voa de quem deu.)
        if ((ev.t === 'called' || ev.t === 'grabbed') && !ev.card && !ev.from) { await wait(700); break; }
        let from: At;
        if (ev.t === 'picked') from = $('#discard');
        else if (ev.t === 'called' && !ev.from) from = ev.pile ? $('#discard') : $('#deck .stack');
        else {
          const src = ev.from ?? '';
          from = src === ME && card && rects[card] ? rects[card]! : anchorOf(src);
        }
        const toP = ev.t === 'picked' || ev.t === 'called' || ev.t === 'grabbed' ? ev.by : ev.to;
        const target = toP === ME && card ? handCard(card) ?? $('#hand') : anchorOf(toP);
        await Fx.fly({ node: cardEl(card, { back: !card }), from, to: target, dur: ev.t === 'passed' ? 360 : 520, trail: '#ff8fab' });
        if (card) { arriving.delete(card); handCard(card)?.classList.remove('arriving'); }
        // 4 bichos diferentes e trio de Favor: a escolha continua aberta ("MAIS UMA", "MAIS 2 CARTAS").
        if (ev.t === 'picked' || ev.t === 'gave') sayChoice();
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
        Fx.fireworks(phone() ? { x: stageW / 2, y: bigAt().cy } : { x: stageW / 2, y: 420 });
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
  async function defuseWalk({ cx, cy, k }: BigAt): Promise<void> {
    const s = document.createElement('img');
    s.src = SOLDADO;
    s.className = 'soldier walking';
    $('#fxlayer').appendChild(s);
    const y = cy + 30 * k; // pés na altura da base da carta grande
    const stop = cx - 205 * k; // o alicate (lado direito do soldado) encosta na carta
    const at = (x: number, flip = 1) => `translate(${x}px, ${y}px) translate(-50%, -100%) scaleX(${flip})`;
    const walk = (from: number, to: number, flip: number, ms: number): Promise<unknown> =>
      Fx.REDUCED || document.hidden || typeof s.animate !== 'function'
        ? Promise.resolve()
        : s.animate([{ transform: at(from, flip) }, { transform: at(to, flip) }], { duration: ms, easing: 'steps(14, end)', fill: 'forwards' }).finished.catch(() => {});
    s.style.transform = at(-140 * k);
    await Promise.race([walk(-140 * k, stop, 1, 1300), wait(1500)]);
    s.classList.remove('walking');
    s.style.transform = at(stop);
    // corta o fio
    await wait(250);
    s.classList.add('snip');
    Sound.play('snip');
    Fx.glitter({ x: stop + 80 * k, y: cy - 40 * k }, '#ffffff');
    Fx.sparks({ x: stop + 80 * k, y: cy - 40 * k });
    await wait(450);
    s.classList.remove('snip');
    // missão cumprida: vira e volta
    void (async () => {
      s.classList.add('walking');
      await Promise.race([walk(stop, -160 * k, -1, 1100), wait(1300)]);
      s.remove();
    })();
  }

  /** O Tatubum grande no meio da mesa (cria uma vez; o Desarme e o soldado usam o mesmo). */
  function showTatu(quiet = false): TatuFx {
    if (tatuFx) return tatuFx;
    const { cx, cy, k } = bigAt();
    const big = cardEl('tatubum-0');
    big.classList.add('bigcard', 'shaking');
    big.style.left = cx + 'px';
    big.style.top = cy + 'px';
    big.onclick = () => playDefuse();
    $('#fxlayer').appendChild(big);
    if (!quiet) Sound.play('fuse');
    let n = 0;
    // Faíscas do pavio sem parar e o chiado de novo de tempos em tempos, enquanto o Desarme não vem.
    const sp = every(() => {
      Fx.sparks({ x: cx + 15 * k, y: cy - 130 * k });
      if (++n % 14 === 0 && view?.choice?.kind === 'tatu') Sound.play('fuse');
    }, 120);
    tatuFx = { big, sp, cx, cy, k };
    syncTatu();
    return tatuFx;
  }
  /** O tatu (e o Latidor) aceita o Desarme (soltar ou clicar) só de quem tem que jogar, enquanto a escolha está aberta. */
  function syncTatu(): void {
    const c = view?.choice;
    if (tatuFx) tatuFx.big.classList.toggle('live', c?.kind === 'tatu' && c.who === ME);
    if (barkFx) barkFx.big.classList.toggle('live', c?.kind === 'latido' && c.who === ME);
  }
  function clearTatu(): void {
    if (!tatuFx) return;
    stopEvery(tatuFx.sp);
    tatuFx.big.remove();
    tatuFx = null;
  }

  /**
   * O Tatu Latidor grande no meio da mesa, tremendo e latindo "AU AU!" de tempos em tempos enquanto quem tem que se
   * defender não joga o Desarme (cria uma vez; o Desarme voa pra ele).
   */
  function showBark(quiet = false): BarkFx {
    if (barkFx) return barkFx;
    const { cx, cy, k } = bigAt();
    const big = cardEl('latido-0');
    big.classList.add('bigcard', 'shaking');
    big.style.left = cx + 'px';
    big.style.top = cy + 'px';
    big.onclick = () => playDefuse();
    $('#fxlayer').appendChild(big);
    const bark = (): void => {
      Sound.play('bark');
      void Fx.pop('AU AU!', { x: cx + 170 * k, y: cy - 150 * k }, { size: popPx(46, 32), hold: 350, color: '#fff3c4' });
    };
    if (!quiet) bark();
    const woof = every(() => { if (view?.choice?.kind === 'latido') bark(); }, 1800);
    barkFx = { big, woof, cx, cy, k };
    syncTatu();
    return barkFx;
  }
  function clearBark(): void {
    if (!barkFx) return;
    stopEvery(barkFx.woof);
    barkFx.big.remove();
    barkFx = null;
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
    if (e.key === 'Escape' && phone() && (logOpen || zoomed !== null)) { closeSheets(); return; }
    if (e.key === 'Escape' && !gallery.hidden) { gallery.hidden = true; return; }
    if (e.key === 'Escape' && pileOpen) { closePile(); return; }
    // Com a galeria ou o quadro do descarte aberto, os atalhos da mesa (espaço, N, Enter) ficam parados.
    if (!gallery.hidden || pileOpen) return;
    if (!view || view.phase !== 'playing' || spectating()) return;
    // Cego não sabe qual é o Nem vem!: tenta arrastando uma ficha pra mesa.
    if ((e.key === 'n' || e.key === 'N') && !blindMe()) nope();
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
    if (!id || (!k && !isToken(id))) { zoomed = null; syncSheets(); return; }
    const big = document.createElement('div');
    big.className = 'vcard';
    big.appendChild(cardEl(id));
    const txt = document.createElement('div');
    txt.className = 'vtext';
    // Ficha do cego: só o verso (nem o zoom conta que carta é).
    txt.innerHTML = k
      ? `<h3>${cardName(k)}</h3><p>${tx(detailOf(k))}</p>`
      : '<h3>CARTA VIRADA</h3><p>Você está <b>cego</b> pelo Mau-olhado: não sabe que carta é esta.<br>Dá pra jogar às cegas (se não formar jogada, ela volta pra mão) ou <b>comprar</b> uma carta pra voltar a ver.</p>';
    v.append(big, txt);
    if (phone()) v.appendChild(closeHint());
    Sound.play('zoom');
    syncSheets();
  }
  /** "toque pra fechar", no pé das folhas do celular. */
  function closeHint(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'kt-vclose';
    p.textContent = 'toque pra fechar';
    return p;
  }
  /**
   * Celular: tocar num adversário mostra tudo dele numa folha (o que no computador fica nas dicas do assento): cartas
   * na mão, a ordem da vez, turnos de Ataque, cego, espiada, o Latidor na frente e se a conexão caiu.
   */
  function zoomSeat(p: string): void {
    const v = view;
    if (!v) return;
    zoom(null);
    zoomed = 'seat:' + p;
    const box = $('#viewer');
    const dead = v.phase !== 'lobby' && !v.alive.includes(p);
    const n = v.handCounts[p] ?? 0;
    const k = orderFromCurrent(p);
    const lines: string[] = [];
    if (dead) lines.push('<b>Está fora</b> (explodiu ou saiu).');
    else lines.push(`Tem <b>${n === 1 ? 'uma carta' : `${n} cartas`}</b> na mão.`);
    if (v.winner === p) lines.push('<b>Venceu!</b>');
    if (!dead && k === 0) lines.push(v.owed > 1 ? `Está na vez e ainda joga <b>${v.owed} turnos</b> (contando este).` : 'Está na vez.');
    else if (!dead && k === 1) lines.push('Joga <b>depois</b> de quem está na vez (PRÓXIMO).');
    else if (!dead && k > 1) lines.push(`É o <b>${k + 1}º</b> a jogar, contando quem está na vez.`);
    if (!dead && v.blind.includes(p)) lines.push('Está <b>cego</b> (Mau-olhado) até comprar uma carta.');
    if (!dead && v.peekers.includes(p)) lines.push('<b>Espiou</b> o topo do monte (só ele vê as cartas).');
    const skips = dead ? 0 : skipsOf(v, p);
    if (skips === 1) lines.push('Vai ter a <b>próxima vez pulada</b> (Tucano).');
    else if (skips > 1) lines.push(`Vai ter as <b>próximas ${skips} vezes puladas</b> (Tucano).`);
    const front = dead ? [] : (v.front[p] ?? []);
    if (front.length) lines.push(`Na frente: <b>${front.map((id) => cardNameOf(id)).join(', ')}</b> (à vista de todos).`);
    if (!dead && seatOf(p)?.connected === false) lines.push('A conexão <b>caiu</b>: se não voltar logo, sai do jogo.');
    const head = document.createElement('div');
    head.className = 'kt-vseat';
    const img = document.createElement('img');
    img.alt = '';
    const url = critterUrls.get(colorOf(p));
    if (url) img.src = url;
    head.appendChild(img);
    const txt = document.createElement('div');
    txt.className = 'vtext';
    txt.innerHTML = `<h3>${upName(p)}</h3><p>${lines.join('<br>')}</p>`;
    box.append(head, txt, closeHint());
    Sound.play('zoom');
    syncSheets();
  }
  // Celular: o zoom é uma folha; tocar nela fecha.
  $('#viewer').onclick = () => { if (phone()) zoom(null); };

  // ---------------------------------------------------------------- toque (celular): tocar e segurar
  /**
   * Tocar e segurar (~400 ms) numa carta (no celular não tem rodinha nem mouse por cima). Vale no layout do celular e em
   * qualquer toque de dedo; mexer o dedo antes cancela (vira arrasto pra cima ou rolagem da mão).
   * - Carta da sua mão: ela levanta (e o celular vibra). Soltar sem mexer abre o zoom com a explicação; arrastar leva a
   *   carta pra outro lugar da mão (muda a ordem, sem a mão rolar) ou pra mesa/adversário (joga, como sempre).
   * - Outras cartas (descarte, quadros): abre o zoom na hora.
   */
  function onPressDown(e: PointerEvent): void {
    cancelPress();
    if (!phone() && e.pointerType !== 'touch') return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest('#gallery') || t.closest('#viewer')) return;
    const card = t.closest<HTMLElement>('.kt-card[data-id]');
    const id = card?.dataset.id;
    if (!card || !id || card.classList.contains('ghost')) return;
    // A carta da mão já começou o arrasto (o pointerdown dela vem antes deste, que é do palco).
    const inHand = drag?.id === id && !!card.closest('#hand');
    press = {
      x: e.clientX,
      y: e.clientY,
      pointerId: pidOf(e),
      t: later(() => {
        press = null;
        const d = drag;
        if (inHand) {
          // Já está arrastando (ou o dedo saiu): nada.
          if (!d || d.id !== id || d.moved) return;
          d.lifted = true;
          card.classList.add('lifted');
          stage.addEventListener('touchmove', onTouchMove, { passive: false });
          navigator.vibrate?.(15);
          Sound.play('select');
          return;
        }
        swallowUntil = Date.now() + 700;
        zoom(id);
      }, LONG_PRESS_MS),
    };
  }
  /**
   * Com a carta levantada, o dedo de lado não rola a mão (a mão tem `touch-action: pan-x`): o arrasto é da carta. O
   * `touchmove` ainda é cancelável aí (o dedo ficou parado até a carta levantar, então a rolagem não começou).
   */
  function onTouchMove(e: TouchEvent): void {
    if (drag?.lifted && e.cancelable) e.preventDefault();
  }
  function onPressMove(e: PointerEvent): void {
    if (press && pidOf(e) === press.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
  }
  function onPressUp(e: PointerEvent): void {
    if (press && pidOf(e) === press.pointerId) cancelPress();
  }
  function cancelPress(): void {
    if (!press) return;
    cancel(press.t);
    press = null;
  }
  /** O clique que vem depois do toque longo não pode pegar carta, abrir o descarte nem fechar o zoom que acabou de abrir. */
  function onClickCapture(e: MouseEvent): void {
    if (!swallowUntil) return;
    const fresh = Date.now() < swallowUntil;
    swallowUntil = 0;
    if (!fresh) return;
    e.stopPropagation();
    e.preventDefault();
  }
  /** Segurar o dedo abre o menu do navegador (copiar imagem…): no celular, não. */
  function onContextMenu(e: Event): void {
    if (phone()) e.preventDefault();
  }
  function onWheel(e: WheelEvent): void {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // No quadro do descarte a rodinha rola a lista (o zoom lá é passar o mouse).
    if (t.closest('#pile') || t.closest('#gallery')) return;
    const card = t.closest<HTMLElement>('.kt-card[data-id]');
    if (!card) { zoom(null); return; }
    e.preventDefault();
    zoom(e.deltaY < 0 ? card.dataset.id ?? null : null);
  }

  // ---------------------------------------------------------------- galeria das cartas
  $('#cards').onclick = () => {
    const g = $('#gallery');
    g.innerHTML = '<h2>AS CARTAS</h2><div class="grid"></div><div class="foot"><p>Combos: PAR só de bichos (cada um faz uma coisa; o BOTO vale por qualquer bicho) · TRIO de qualquer carta rouba um Desarme (3 FAVORES: o escolhido te dá 3 cartas) · 4 BICHOS DIFERENTES (o BOTO conta como um) pega DUAS do descarte e não aceita Nem vem!. As outras jogadas ficam 5 s no ar pra alguém dar Nem vem!. Quem pega MAU-OLHADO joga às cegas até comprar. O olho ao lado do descarte mostra todas as cartas da pilha.</p></div>';
    // No celular, o jeito de mexer nas cartas com o dedo (no computador é o de sempre: clicar, arrastar, rodinha).
    if (phone()) {
      const how = document.createElement('p');
      how.className = 'kt-how';
      how.innerHTML = '<b>No celular:</b> toque numa carta pra escolher (de novo pra desfazer) · toque e segure pra ver o que ela faz · segure e arraste pro lado pra mudar a ordem da mão · arraste pra cima, na mesa ou num adversário, pra jogar · toque num adversário pra ver tudo dele.';
      $('#gallery .grid').before(how);
    }
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
  stage.addEventListener('pointerdown', onPressDown);
  stage.addEventListener('contextmenu', onContextMenu);
  wrap.addEventListener('click', onClickCapture, true);
  window.addEventListener('pointermove', onPressMove);
  window.addEventListener('pointerup', onPressUp);
  window.addEventListener('pointercancel', onPressUp);
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
    setLayout(next: MesaLayout): void {
      if (destroyed || next === layout) return;
      layout = next;
      stage.classList.toggle('kt-phone', phone());
      // Recomeça no jeito do layout novo: sem folhas abertas, palco e cerrado refeitos, a carta grande no lugar novo.
      logOpen = false;
      zoom(null);
      cancelPress();
      stage.style.transform = '';
      stage.style.width = '';
      stage.style.height = '';
      bgWidth = 0;
      fit();
      if (tatuFx) { clearTatu(); showTatu(true); }
      if (barkFx) { clearBark(); showBark(true); }
      // O painel e o quadro do descarte são refeitos (o texto muda: "clique" ↔ "toque").
      panelKey = '';
      pileKey = '';
      renderLog();
      render();
      syncSheets();
    },
    error(message: string): void {
      if (destroyed) return;
      // Jogada recusada: o modo (alvo, bicho) e a legenda dele não valem mais; a seleção fica pra tentar de novo.
      inFlight = false;
      if (mode || MODE_CAPTIONS.includes(captionText)) {
        mode = null;
        if (MODE_CAPTIONS.includes(captionText)) captionText = '';
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
      stage.removeEventListener('pointerdown', onPressDown);
      stage.removeEventListener('contextmenu', onContextMenu);
      stage.removeEventListener('touchmove', onTouchMove);
      wrap.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPressMove);
      window.removeEventListener('pointerup', onPressUp);
      window.removeEventListener('pointercancel', onPressUp);
      ro?.disconnect();
      drag = null;
      Cerrado.stop();
      Fx.dispose();
      wrap.remove();
      if (addedKittens) root.classList.remove('kittens');
    },
  };
}
