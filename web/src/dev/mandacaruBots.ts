/**
 * Bots do Mandacaru SÓ PARA DESENVOLVIMENTO (o teste `import.meta.env.DEV` no `BotControls` tira este módulo do build de produção).
 * Cada bot abre o próprio WebSocket e joga como uma pessoa: age só pelo que a visão dele mostra (nunca espia o estado).
 * Nunca faz ações de anfitrião (começar, jogar de novo): isso fica com a pessoa que está testando.
 * Porta de `prototipo/hexa/bots.js` (as mesmas escolhas). A memória curta do protótipo (ofertas já julgadas, quando
 * ofereceu, quantas feiras no turno) vira `MandacaruMemo`, guardada pela instância e devolvida nova a cada decisão;
 * a hora vem de fora (a do servidor). Os nomes começam com "Bot ", então a partida não vai pro histórico.
 */
import {
  COSTS,
  PLAYER_COLORS,
  RESOURCES,
  TERRAIN_RESOURCE,
  isMandacaruRoomView,
  mandacaruGeometry,
  mandacaruPips,
  mulberry32,
  noResources,
  type GameAction,
  type MandacaruAction,
  type MandacaruRoomView,
  type MandacaruView,
  type Piece,
  type Resource,
  type Resources,
} from '@cartolina/shared';
import { getRoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { BOT_NAMES } from './bots';

/** Quanto esperar, depois de agir, antes de achar que a ação se perdeu e tentar de novo. */
const RETRY_MS = 4000;
/** Depois de tantas tentativas na mesma etapa o bot troca a semente do sorteio (a ação pode ter sido recusada). */
const TRIES_PER_SEED = 2;
/** Tentativas no total numa mesma etapa; passou disso, o bot desiste dela. */
export const MAX_TRIES = 6;
/** Recusado tantas vezes na mesma etapa da fase principal: passa a vez pra não travar a mesa (como no protótipo). */
const GIVE_UP_TRIES = 3;
/** Quanto o bot espera respostas da oferta dele (o humano precisa de tempo pra ler e clicar). */
export const OFFER_WAIT_MS = 8000;
/** Atraso normal de cada jogada (o "normal" do protótipo). */
const DELAY_MIN = 700;
const DELAY_MAX = 1100;
/** Feiras no máximo por turno. */
const FEIRAS_PER_TURN = 3;
/** Chances do protótipo: comprar cordel mirando a vila; ofertar pra mesa; mandar contraproposta; Vaqueiro sem precisar. */
const CORDEL_WHEN_CITY = 0.3;
const OFFER_CHANCE = 0.2;
const COUNTER_CHANCE = 0.45;
const VAQUEIRO_CHANCE = 0.5;

type Rng = () => number;
type Goal = Piece | null;
type Playable = MandacaruView['can']['play'][number];

const RES = RESOURCES;
const pick = <T>(arr: readonly T[], rng: Rng): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
const between = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo);
/** Os que empatam na maior nota, e um deles sorteado. */
function best<T>(list: readonly T[], score: (x: T) => number, rng: Rng): T {
  const scores = list.map(score);
  const top = Math.max(...scores);
  return pick(
    list.filter((_, i) => scores[i] === top),
    rng,
  );
}
const total = (r: Resources): number => RES.reduce((n, x) => n + r[x], 0);

/** Memória curta do bot, presa a um turno (`key`): muda de turno, começa outra. */
export interface MandacaruMemo {
  key: string;
  /** Já pensou em ofertar pra mesa neste turno. */
  offered: boolean;
  feiras: number;
  /** Hora (do servidor) em que mandou a oferta aberta. */
  offerAt: number;
  /** Propostas pra ele já julgadas (id → fechou ou não). */
  judged: Record<number, boolean>;
  /** Última oferta em que pensou em contrapropor. */
  countered: number | null;
  /** Ofertas que já respondeu (segura a resposta enquanto o servidor não manda a visão nova). */
  answered: number[];
}

export const newMandacaruMemo = (key = ''): MandacaruMemo => ({
  key,
  offered: false,
  feiras: 0,
  offerAt: 0,
  judged: {},
  countered: null,
  answered: [],
});

/** Uma chave que muda a cada turno: partida + quantas vezes já rolaram os dados. */
const turnKey = (g: MandacaruView): string => `${g.match}:${g.diceCounts.reduce((a, b) => a + b, 0)}`;
/** A memória deste turno (copiada: a função nunca muda a que recebeu). */
function turnMemo(g: MandacaruView, memo: MandacaruMemo | undefined): MandacaruMemo {
  const k = turnKey(g);
  if (!memo || memo.key !== k) return newMandacaruMemo(k);
  return { ...memo, judged: { ...memo.judged }, answered: [...memo.answered] };
}

const seatOf = (g: MandacaruView, id: string) => g.seats.find((s) => s.id === id)!;
const numberOf = (g: MandacaruView, h: number): number | null => g.layout!.hexes[h]!.number;

/** Soma das chances dos terrenos em volta de um canto (+1 por recurso diferente). */
function cornerValue(g: MandacaruView, v: number): number {
  const geo = mandacaruGeometry();
  const kinds = new Set<Resource>();
  let n = 0;
  for (const h of geo.vertices[v]!.hexes) {
    const tile = g.layout!.hexes[h]!;
    n += mandacaruPips(tile.number);
    const r = TERRAIN_RESOURCE[tile.terrain];
    if (r) kinds.add(r);
  }
  return n + kinds.size;
}

/** Cantos livres pela regra da distância (sem olhar estrada). */
function freeCorners(g: MandacaruView): number[] {
  const geo = mandacaruGeometry();
  const out: number[] = [];
  geo.vertices.forEach((v, i) => {
    if (g.buildings[i]) return;
    if (v.neighbors.some((n) => g.buildings[n])) return;
    out.push(i);
  });
  return out;
}
/** Onde `me` poria casa agora (canto livre encostado numa estrada sua). */
function houseSpots(g: MandacaruView, me: string): number[] {
  const geo = mandacaruGeometry();
  return freeCorners(g).filter((i) => geo.vertices[i]!.edges.some((e) => g.roads[e] === me));
}
/** Estradas possíveis (a regra das estradas, sem o custo). */
function roadSpots(g: MandacaruView, me: string): number[] {
  const geo = mandacaruGeometry();
  const out: number[] = [];
  geo.edges.forEach((e, i) => {
    if (g.roads[i] !== null) return;
    const linked = [e.a, e.b].some((v) => {
      const b = g.buildings[v];
      if (b && b.owner === me) return true;
      if (b) return false;
      return geo.vertices[v]!.edges.some((x) => x !== i && g.roads[x] === me);
    });
    if (linked) out.push(i);
  });
  return out;
}
const myHouses = (g: MandacaruView, me: string): number[] =>
  g.buildings.flatMap((b, i) => (b && b.owner === me && b.kind === 'house' ? [i] : []));

/** A meta: a primeira construção possível na ordem vila › casa › cordel › estrada. */
function goalOf(g: MandacaruView, me: string): Goal {
  const left = seatOf(g, me).piecesLeft;
  if (left.city > 0 && myHouses(g, me).length > 0) return 'city';
  if (left.house > 0 && houseSpots(g, me).length > 0) return 'house';
  if (g.deckSize > 0) return 'cordel';
  if (left.road > 0 && roadSpots(g, me).length > 0) return 'road';
  return null;
}
/** O que falta da mão pra pagar `piece`. */
function missing(have: Resources, piece: Goal): Resources {
  const out = noResources();
  if (!piece) return out;
  for (const r of RES) out[r] = Math.max(0, COSTS[piece][r] - have[r]);
  return out;
}
/** O que guardar: o maior custo entre vila e casa (as que ainda dá pra fazer). */
function keepFor(g: MandacaruView, me: string): Resources {
  const keep = noResources();
  const left = seatOf(g, me).piecesLeft;
  const pieces: Piece[] = [];
  if (left.city > 0 && myHouses(g, me).length > 0) pieces.push('city');
  if (left.house > 0 && houseSpots(g, me).length > 0) pieces.push('house');
  if (pieces.length === 0) pieces.push('cordel');
  for (const p of pieces) for (const r of RES) keep[r] = Math.max(keep[r], COSTS[p][r]);
  return keep;
}

/** Estrada que chega mais perto de um canto livre (busca em largura pelos cantos). */
function roadTowardFree(g: MandacaruView, edges: readonly number[], rng: Rng): number {
  const geo = mandacaruGeometry();
  const dist = new Array<number>(geo.vertices.length).fill(Infinity);
  const queue: number[] = [];
  for (const v of freeCorners(g)) {
    dist[v] = 0;
    queue.push(v);
  }
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i]!;
    for (const n of geo.vertices[v]!.neighbors) {
      if (dist[n] !== Infinity) continue;
      if (g.buildings[n]) continue;
      dist[n] = dist[v]! + 1;
      queue.push(n);
    }
  }
  return best(edges, (e) => -Math.min(dist[geo.edges[e]!.a]!, dist[geo.edges[e]!.b]!), rng);
}

/** Terreno pro Carcará: mais chance × prédios dos outros (o líder pesa o dobro), nenhum meu. */
function carcaraHex(g: MandacaruView, me: string, rng: Rng): number {
  const geo = mandacaruGeometry();
  const leader = Math.max(...g.seats.filter((s) => s.id !== me).map((s) => s.points));
  const score = (h: number): number => {
    let n = 0;
    for (const v of geo.hexes[h]!.corners) {
      const b = g.buildings[v];
      if (!b) continue;
      if (b.owner === me) return -1;
      const w = b.kind === 'city' ? 2 : 1;
      n += w * (seatOf(g, b.owner).points === leader ? 2 : 1);
    }
    return n * (mandacaruPips(numberOf(g, h)) + 0.5);
  };
  return best(g.can.carcara, score, rng);
}

/** O Carcará está num terreno encostado num prédio meu? */
function carcaraOnMe(g: MandacaruView, me: string): boolean {
  return mandacaruGeometry().hexes[g.carcara]!.corners.some((v) => g.buildings[v]?.owner === me);
}

/** Descarta primeiro dos recursos de que tem mais. */
export function chooseDiscard(have: Resources, count: number): Resources {
  const left = { ...have };
  const out = noResources();
  for (let i = 0; i < count; i++) {
    const r = RES.reduce((a, b) => (left[b] > left[a] ? b : a));
    left[r]--;
    out[r]++;
  }
  return out;
}

/**
 * Vale a pena receber `gets` e dar `gives`? Precisa ter o que dá, receber algo que falta pra meta,
 * não dar algo que a meta usa e não sair perdendo em número de cartas.
 */
function wantsTrade(g: MandacaruView, me: string, gets: Resources, gives: Resources): boolean {
  const have = g.myRes!;
  if (!RES.every((r) => have[r] >= gives[r])) return false;
  const goal = goalOf(g, me);
  const need = missing(have, goal);
  const cost = COSTS[goal ?? 'road'];
  const helps = RES.some((r) => gets[r] > 0 && need[r] > 0);
  const hurts = RES.some((r) => gives[r] > 0 && have[r] - gives[r] < cost[r]);
  return helps && !hurts && total(gets) >= total(gives);
}

const one = (r: Resource): Resources => ({ ...noResources(), [r]: 1 });

/** Recursos pra Chuva: os 2 que mais faltam pra meta (que o banco tem). */
function chuvaPick(g: MandacaruView, need: Resources): [Resource, Resource] | null {
  const out: Resource[] = [];
  const want = { ...need };
  const bank = { ...g.bank };
  const have = g.myRes!;
  const picked = (x: Resource) => out.filter((y) => y === x).length;
  for (let i = 0; i < 2; i++) {
    const inBank = RES.filter((x) => bank[x] > 0);
    let r = inBank.reduce<Resource | null>((a, b) => (a === null || want[b] > want[a] ? b : a), null);
    if (r === null) return null;
    // nada falta: o que tem menos na mão
    if (want[r] <= 0) r = inBank.reduce((a, b) => (have[b] + picked(b) < have[a] + picked(a) ? b : a));
    out.push(r);
    want[r]--;
    bank[r]--;
  }
  return [out[0]!, out[1]!];
}

/** Uma escolha do bot: as ações (no máximo uma), o atraso à parte (sorteado por último) e a memória depois dela. */
interface Choice {
  action: MandacaruAction | null;
  memo: MandacaruMemo;
  /** Espera mínima (a da oferta aberta). */
  wait?: number;
}

/** Fora da vez: responde a oferta aberta uma vez; depois de recusar, às vezes contrapropõe (uma vez por oferta). */
function offTurn(g: MandacaruView, me: string, rng: Rng, m: MandacaruMemo): Choice | null {
  const o = g.offer;
  const can = g.can;
  if (can.respond && o && !o.accepted.includes(me) && !o.rejected.includes(me) && !m.answered.includes(o.id)) {
    m.answered.push(o.id);
    return { action: { type: 'respond', offerId: o.id, accept: wantsTrade(g, me, o.give, o.want) }, memo: m };
  }
  if (!can.propose || !o || !o.rejected.includes(me) || m.countered === o.id) return null;
  m.countered = o.id;
  // pensou e não contrapropôs: guarda a memória mesmo assim (decisão sem ação)
  if (g.proposals.some((p) => p.from === me) || rng() > COUNTER_CHANCE) return { action: null, memo: m };
  const have = g.myRes!;
  const need = missing(have, goalOf(g, me));
  const keep = keepFor(g, me);
  const want = RES.filter((r) => o.give[r] > 0 && need[r] > 0)[0];
  const give = RES.filter((r) => r !== want && have[r] - keep[r] > 0 && need[r] === 0).sort((a, b) => have[b] - have[a])[0];
  if (!want || !give) return { action: null, memo: m };
  return { action: { type: 'propose', give: one(give), want: one(want) }, memo: m };
}

function mainPhase(g: MandacaruView, me: string, rng: Rng, m: MandacaruMemo, now: number): Choice | null {
  const can = g.can;
  const have = g.myRes!;
  const done = (action: MandacaruAction | null): Choice => ({ action, memo: m });

  // Propostas pra mim (contrapropostas ou propostas soltas): julga cada uma uma vez; fecha a primeira boa.
  for (const p of g.proposals) {
    if (p.id in m.judged) continue;
    const yes = wantsTrade(g, me, p.give, p.want);
    m.judged[p.id] = yes;
    if (yes) return done({ type: 'close_deal', with: p.from, source: 'proposal', id: p.id });
  }

  // Oferta minha aberta: fecha com quem aceitou; se todos recusaram ou passou o tempo, desiste.
  if (g.offer) {
    const o = g.offer;
    if (o.accepted.length) return done({ type: 'close_deal', with: o.accepted[0]!, source: 'offer', id: o.id });
    const others = g.players.length - 1;
    const left = m.offerAt + OFFER_WAIT_MS - now;
    // ainda esperando: a retirada já fica agendada pro fim da espera (se alguém responder antes, a etapa muda)
    return { action: { type: 'cancel_offer' }, memo: m, wait: o.rejected.length >= others ? 0 : Math.max(0, left) };
  }

  if (can.buildCity.length) return done({ type: 'build_city', vertex: best(can.buildCity, (v) => cornerValue(g, v), rng) });
  if (can.buildHouse.length) return done({ type: 'build_house', vertex: best(can.buildHouse, (v) => cornerValue(g, v), rng) });
  const goal = goalOf(g, me);
  if (can.buyCordel && (goal !== 'city' || rng() < CORDEL_WHEN_CITY)) return done({ type: 'buy_cordel' });
  if (can.buildRoad.length && houseSpots(g, me).length === 0) return done({ type: 'build_road', edge: roadTowardFree(g, can.buildRoad, rng) });

  const need = missing(have, goal);
  if (can.play.length) {
    const has = (k: Playable) => can.play.includes(k);
    if (has('chuva') && total(need) > 0) {
      const rs = chuvaPick(g, need);
      if (rs) return done({ type: 'play_chuva', resources: rs });
    }
    if (has('atravessador') && total(need) > 0) {
      const r = RES.reduce((a, b) => (need[b] > need[a] ? b : a));
      return done({ type: 'play_atravessador', resource: r });
    }
    if (has('mutirao') && seatOf(g, me).piecesLeft.road > 0 && roadSpots(g, me).length > 0) return done({ type: 'play_mutirao' });
    if (has('vaqueiro') && (carcaraOnMe(g, me) || rng() < VAQUEIRO_CHANCE)) return done({ type: 'play_vaqueiro' });
  }

  // Feira: dá o que sobra na taxa pelo que falta.
  if (m.feiras < FEIRAS_PER_TURN && total(need) > 0) {
    const keep = keepFor(g, me);
    const give = RES.find((r) => {
      const rate = can.feira[r];
      return rate !== undefined && rate > 0 && have[r] - keep[r] >= rate;
    });
    const want = RES.filter((r) => need[r] > 0 && g.bank[r] > 0).sort((a, b) => need[b] - need[a])[0];
    if (give && want && give !== want) {
      m.feiras++;
      return done({ type: 'feira', give, want, count: 1 });
    }
  }

  // Às vezes, uma oferta pra mesa: 1 do que mais tem por 1 do que falta.
  if (!m.offered && can.offer) {
    m.offered = true;
    if (rng() < OFFER_CHANCE && total(need) > 0) {
      const keep = keepFor(g, me);
      const give = RES.filter((r) => have[r] - keep[r] > 0 && need[r] === 0).sort((a, b) => have[b] - have[a])[0];
      const want = RES.filter((r) => need[r] > 0).sort((a, b) => need[b] - need[a])[0];
      if (give && want) {
        m.offerAt = now;
        return done({ type: 'offer', give: one(give), want: one(want) });
      }
    }
  }

  return can.endTurn ? done({ type: 'end_turn' }) : null;
}

function choose(g: MandacaruView, me: string, rng: Rng, m: MandacaruMemo, now: number): Choice | null {
  const can = g.can;
  const done = (action: MandacaruAction): Choice => ({ action, memo: m });
  if (can.discard > 0) return done({ type: 'discard', cards: chooseDiscard(g.myRes!, can.discard) });
  if (g.turn !== me) return offTurn(g, me, rng, m);

  if (can.placeHouse.length) return done({ type: 'place_house', vertex: best(can.placeHouse, (v) => cornerValue(g, v), rng) });
  if (can.placeRoad.length) return done({ type: 'place_road', edge: pick(can.placeRoad, rng) });
  if (can.roll) {
    if (can.play.includes('vaqueiro') && carcaraOnMe(g, me)) return done({ type: 'play_vaqueiro' });
    return done({ type: 'roll' });
  }
  if (can.carcara.length) return done({ type: 'move_carcara', hex: carcaraHex(g, me, rng) });
  if (can.steal.length) return done({ type: 'steal', from: best(can.steal, (p) => seatOf(g, p).resCount, rng) });
  if (g.phase === 'mutirao') return can.buildRoad.length ? done({ type: 'build_road', edge: roadTowardFree(g, can.buildRoad, rng) }) : null;
  if (g.phase === 'main') return mainPhase(g, me, rng, m, now);
  return null;
}

export interface MandacaruDecision {
  key: string;
  delay: number;
  /** No máximo uma ação; vazio = pensou e não fez nada (só guarda a memória). */
  actions: GameAction[];
  /** A memória depois desta decisão (a instância guarda quando age). */
  memo: MandacaruMemo;
}

/** Resumo da visão de quem joga, sem o diário inteiro (ele tem teto e para de crescer): só o tamanho e a última linha. */
function fingerprint(g: MandacaruView): string {
  const { log, turnEndsAt: _t, discardEndsAt: _d, ...rest } = g;
  return JSON.stringify([rest, log.length, log[log.length - 1] ?? null]);
}
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * A chave da etapa pra quem joga (null pra quem assiste): muda sempre que a visão muda (qualquer mudança na mesa
 * recomeça o atraso, como no protótipo). Sem sorteio e sem relógio.
 */
export function mandacaruStepKey(view: MandacaruRoomView): string | null {
  const g = view.game;
  if (!view.you || !g.players.includes(view.you) || !g.myRes) return null;
  return `${g.match}:${hash(fingerprint(g))}`;
}

/**
 * O que o bot faz agora (ou null). `key` identifica a etapa, pra não agir duas vezes nela. Pura: a memória que entra
 * não muda (a nova vem em `memo`), e `now` é a hora do servidor (só a espera da oferta usa).
 * Ordem dos sorteios: a escolha primeiro, o atraso por último.
 */
export function decideMandacaru(view: MandacaruRoomView, rng: Rng, memo?: MandacaruMemo, now = 0): MandacaruDecision | null {
  const key = mandacaruStepKey(view);
  if (key === null) return null;
  const g = view.game;
  if (g.phase === 'lobby' || g.phase === 'over') return null;
  const c = choose(g, view.you!, rng, turnMemo(g, memo), now);
  if (!c) return null;
  if (!c.action) return { key, delay: 0, actions: [], memo: c.memo };
  const delay = Math.max(between(rng, DELAY_MIN, DELAY_MAX), c.wait ?? 0);
  return { key, delay, actions: [c.action], memo: c.memo };
}

/** Sorteio estável pra (etapa, bot): a mesma etapa dá sempre a mesma decisão, em qualquer visão dela. */
export function mandacaruKeyRng(key: string, me: string, salt = 0): Rng {
  let h = 2166136261;
  for (const ch of `${key}|${me}${salt ? `#${salt}` : ''}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return mulberry32(h >>> 0);
}

/** Semente da tentativa: igual nas primeiras `TRIES_PER_SEED` tentativas da etapa; depois, outra. */
export const saltFor = (tries: number): number => Math.floor(tries / TRIES_PER_SEED);

/**
 * `decideMandacaru` com o sorteio preso à etapa: o bot decide ao agendar e de novo ao disparar, e não "muda de ideia"
 * só porque o sorteio girou. Recusado `GIVE_UP_TRIES` vezes na mesma etapa podendo passar a vez, passa.
 */
export function decideMandacaruStable(view: MandacaruRoomView, memo: MandacaruMemo | undefined, now: number, tries = 0): MandacaruDecision | null {
  const key = mandacaruStepKey(view);
  if (key === null) return null;
  const rng = mandacaruKeyRng(key, view.you!, saltFor(tries));
  if (tries >= GIVE_UP_TRIES && view.game.can.endTurn) {
    return { key, delay: between(rng, DELAY_MIN, DELAY_MAX), actions: [{ type: 'end_turn' }], memo: turnMemo(view.game, memo) };
  }
  return decideMandacaru(view, rng, memo, now);
}

class MandacaruBot {
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  private retrying = false;
  /** Etapa que o bot já agendou (limpa quando ele não tem mais nada a fazer). */
  private planned: string | null = null;
  /** Quantas vezes o bot mandou ação na etapa `triesKey` (zera quando a etapa muda). */
  private tries = 0;
  private triesKey: string | null = null;
  private tried = new Set<string>();
  /** A memória curta (só muda quando o bot age ou decide não agir). */
  private memo: MandacaruMemo = newMandacaruMemo();
  constructor(
    readonly code: string,
    private taken: () => { names: string[]; colors: string[] },
    private onGone: (bot: MandacaruBot) => void,
  ) {}

  start(): void {
    void getRoomInfo(this.code)
      .catch(() => null)
      .then((info) => {
        if (this.stopped) return;
        const seats = info?.seats ?? [];
        const other = this.taken();
        const names = new Set([...other.names, ...seats.map((s) => s.name)]);
        this.name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${1 + Math.floor(Math.random() * 99)}`;
        [...other.colors, ...seats.map((s) => s.color)].forEach((c) => this.tried.add(c));
        this.color = this.nextColor();
        this.conn = new RoomConnection({ url: wsUrl(this.code), token: crypto.randomUUID(), name: this.name, color: this.color });
        this.unsub = this.conn.subscribe(this.react);
        this.conn.start();
      });
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.unsub?.();
    this.unsub = null;
    this.conn?.stop();
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(t);
  }

  private nextColor(): string {
    const c = PLAYER_COLORS.find((x) => !this.tried.has(x)) ?? PLAYER_COLORS[0];
    this.tried.add(c);
    return c;
  }

  /** Hora do servidor. */
  private now(): number {
    return Date.now() + (this.conn?.getSnapshot().serverOffset ?? 0);
  }

  private onJoinFailed(error: string | null): void {
    if (this.retrying) return;
    if (error !== 'color_taken' || this.tried.size >= PLAYER_COLORS.length) {
      this.stop();
      this.onGone(this);
      return;
    }
    this.retrying = true;
    this.later(100 + Math.random() * 300, () => {
      this.retrying = false;
      this.color = this.nextColor();
      this.conn?.retryJoin(this.name ?? BOT_NAMES[0]!, this.color);
    });
  }

  private react = (): void => {
    if (this.stopped || !this.conn) return;
    const snap = this.conn.getSnapshot();
    if (snap.status === 'join_failed') return this.onJoinFailed(snap.joinError);
    if (snap.status !== 'joined' || !snap.view || !isMandacaruRoomView(snap.view)) return;
    const step = mandacaruStepKey(snap.view);
    if (step !== this.triesKey) {
      this.triesKey = step;
      this.tries = 0;
    }
    const d = decideMandacaruStable(snap.view, this.memo, this.now(), this.tries);
    if (!d) {
      this.planned = null;
      return;
    }
    if (this.planned === d.key) return;
    this.planned = d.key;
    // pensou e não fez nada: só guarda a memória
    if (d.actions.length === 0) {
      this.memo = d.memo;
      return;
    }
    this.later(d.delay, () => {
      const now = this.conn?.getSnapshot().view;
      if (!now || !isMandacaruRoomView(now)) return;
      // decide de novo com a visão atual (a mesa pode ter mudado enquanto esperava): só manda se a etapa é a mesma
      const again = decideMandacaruStable(now, this.memo, this.now(), this.tries);
      if (again?.key !== d.key) return;
      this.memo = again.memo;
      again.actions.forEach((a) => this.conn?.sendAction(a));
      this.tries++;
      // se a ação se perdeu (ou foi recusada) e a etapa não andou, tenta de novo; passou de `MAX_TRIES`, desiste da etapa
      this.later(RETRY_MS, () => {
        if (this.planned !== d.key || this.tries >= MAX_TRIES) return;
        this.planned = null;
        this.react();
      });
    });
  };
}

const registry = new Set<MandacaruBot>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeMandacaruBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const mandacaruBotsVersion = (): number => version;
export const mandacaruBotsIn = (code: string): number => [...registry].filter((b) => b.code === code).length;

export function addMandacaruBot(code: string): void {
  const bot: MandacaruBot = new MandacaruBot(
    code,
    () => {
      const others = [...registry].filter((b) => b !== bot && b.code === code);
      return {
        names: others.flatMap((b) => (b.name ? [b.name] : [])),
        colors: others.flatMap((b) => (b.color ? [b.color] : [])),
      };
    },
    (b) => {
      registry.delete(b);
      emit();
    },
  );
  registry.add(bot);
  emit();
  bot.start();
}

export function removeAllMandacaruBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
