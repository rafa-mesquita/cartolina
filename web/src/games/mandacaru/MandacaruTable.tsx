import type { MandacaruAction, MandacaruLogEntry, MandacaruPhase, MandacaruRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JOIN_ERRORS, type ConnSnapshot, type GameConn } from '../../net/connection';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { FUNDO_STYLE, preloadMandacaruArt } from './assets';
import { Actions, hintFor, type Panel, type SimpleAction } from './Actions';
import { Board, spotAction, spotsOf, type BuildMode } from './Board';
import { CordelChoice } from './CordelChoice';
import { DiscardPanel } from './DiscardPanel';
import { EndPanel } from './EndPanel';
import { FeiraPanel } from './FeiraPanel';
import { Flights } from './Flights';
import { motionOk, rollFlights, type Flight } from './rollFlights';
import { useTurnClock } from './clock';
import { Diary, freshEntries } from './Diary';
import { Hand, type PlayableCordel } from './Hand';
import { RES_NAME } from './names';
import { OfferCard } from './OfferCard';
import { RulesSheet } from './RulesSheet';
import { Seats } from './Seats';
import { installMandacaruAudioUnlock, playMandacaruSound } from './sounds';
import { nameFrom, resList } from './texts';
import { TopBar } from './TopBar';
import { TradePanel, tradeSeed, type TradeTerms } from './TradePanel';
import { useMandacaruSounds } from './useMandacaruSounds';
import './mandacaru.css';

const TOAST_MS = 2600;
/** Trava contra envio duplo: solta sozinha depois disso (ms), se nem visão nova nem recusa chegarem. */
const UNLOCK_MS = 4000;
/** Mínimo que a trava segura depois de mandar, mesmo com visão nova chegando (ms). */
const HOLD_MS = 400;
/** Quanto tempo a soma dos dados fica grande no meio do tabuleiro. */
const SUM_MS = 1000;
/** Quanto tempo os dados rolam antes de pousar no resultado (ms). */
export const TUMBLE_MS = 700;

/** A rolagem que está passando na tela: os dados rolando, depois a soma (e as cartas voando), depois nada. */
interface RollFx {
  id: number;
  sum: number;
  /** Com animação (falso com movimento reduzido ou aba escondida). */
  motion: boolean;
  flights: Flight[];
  stage: 'roll' | 'sum' | 'off';
}

/** Cordéis que pedem escolha abrem a janela deles; Vaqueiro e Mutirão se jogam direto. */
const PANEL_OF_CORDEL: Partial<Record<PlayableCordel, Panel>> = { chuva: 'chuva', atravessador: 'atravessador' };

interface Props {
  view: MandacaruRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (os prazos não dependem do relógio local). */
  serverOffset: number;
  status: ConnSnapshot['status'];
  /** Fase no render de antes (o `Game` passa): `'lobby'` = a mesa montou na primeira visão da partida. */
  fromPhase?: MandacaruPhase;
}

/**
 * O que é só da interface, preso a uma situação (`at` = partida:fase:vez): a peça escolhida pra construir, a janela
 * aberta (com os números com que a troca abre e um contador que remonta a janela a cada abertura) e a oferta cujo
 * cartão foi escondido. Mudou a partida, a fase ou a vez = tudo zerado. A peça também some quando os lugares dela acabam.
 */
interface Ui {
  at: string;
  mode: BuildMode | null;
  panel: Panel | null;
  seed: TradeTerms | null;
  opened: number;
  hiddenOffer: number | null;
}
const freshUi = (at: string): Ui => ({ at, mode: null, panel: null, seed: null, opened: 0, hiddenOffer: null });

/** A janela aberta ainda faz sentido agora? */
function panelOk(p: Panel, g: MandacaruRoomView['game'], me: string | null): boolean {
  const mine = me !== null && g.turn === me;
  if (g.myRes === null) return false;
  switch (p) {
    case 'trade':
      return g.phase === 'main' && (mine ? g.can.offer : g.can.propose);
    case 'feira':
      return g.phase === 'main' && mine && Object.keys(g.can.feira).length > 0;
    case 'chuva':
    case 'atravessador':
      return g.can.play.includes(p);
  }
}

/**
 * A mesa do Mandacaru (porte do `prototipo/hexa/index.html`, estilo D): palco 1440×900 escalado com o topo, os
 * jogadores à esquerda, o tabuleiro no meio, as ações e o diário à direita e a mão embaixo.
 * Tudo que é jogo vem de `view.game`; aqui só mora o estado da interface (peça escolhida, janela aberta, trava).
 */
export function MandacaruTable({ view, conn, serverOffset, status, fromPhase }: Props) {
  const g = view.game;
  const me = view.you !== null && g.players.includes(view.you) ? view.you : null;
  const nameOf = useMemo(() => nameFrom(view), [view]);
  const { scale, width } = useStageFit();
  const { toast, say } = useToast(TOAST_MS);
  useEffect(() => installMandacaruAudioUnlock(), []);
  useEffect(() => preloadMandacaruArt(), []);
  useMandacaruSounds(view, status, fromPhase);

  const turnLeft = useTurnClock(g.turnEndsAt, serverOffset);
  const discardLeft = useTurnClock(g.phase === 'discard' ? g.discardEndsAt : null, serverOffset);

  // estado da interface, preso à situação
  const at = `${g.match}:${g.phase}:${g.turn ?? '-'}`;
  const [uiState, setUi] = useState<Ui>(() => freshUi(at));
  const ui = uiState.at === at ? uiState : freshUi(at);
  const patch = useCallback(
    (f: (u: Ui) => Partial<Ui>) =>
      setUi((prev) => {
        const base = prev.at === at ? prev : freshUi(at);
        return { ...base, ...f(base) };
      }),
    [at],
  );
  const modeSpots = ui.mode === 'road' ? g.can.buildRoad : ui.mode === 'house' ? g.can.buildHouse : ui.mode === 'city' ? g.can.buildCity : [];
  const mode = g.phase === 'main' && modeSpots.length > 0 ? ui.mode : null;
  // Os lugares da peça acabaram: larga a peça de vez (senão ela volta a acender sozinha quando chegam cartas).
  const noSpots = ui.mode !== null && modeSpots.length === 0;
  useEffect(() => {
    if (noSpots) patch(() => ({ mode: null }));
  }, [noSpots, patch]);
  const panel = ui.panel !== null && panelOk(ui.panel, g, me) ? ui.panel : null;
  const [rulesOpen, setRulesOpen] = useState(false);
  const host = view.hostId !== null && view.hostId === view.you;
  const connected = view.seats.filter((s) => s.connected).length;

  // Trava contra envio duplo: uma ação por visão; solta com visão nova, recusa do servidor ou depois de alguns segundos.
  // Clique duplo: a MESMA ação de novo em menos de HOLD_MS não sai, mesmo que a visão de outra pessoa chegue no meio
  // (senão "cordel" duas vezes compraria 2). Ação diferente (a estrada logo depois da casa) sai assim que a visão chega.
  // `send` devolve se mandou (a feira só zera a escolha quando a troca saiu).
  const [lock, setLock] = useState<{ at: MandacaruRoomView } | null>(null);
  const last = useRef<{ key: string; t: number } | null>(null);
  const sent = lock !== null && lock.at === view;
  const send = useCallback(
    (a: MandacaruAction): boolean => {
      if (sent) return false;
      const key = JSON.stringify(a);
      const now = Date.now();
      if (last.current !== null && last.current.key === key && now - last.current.t < HOLD_MS) return false;
      last.current = { key, t: now };
      setLock({ at: view });
      conn.sendAction(a);
      return true;
    },
    [conn, sent, view],
  );
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => setLock(null), UNLOCK_MS);
    return () => clearTimeout(t);
  }, [sent]);

  // Recusas do servidor (que não são de entrada na sala) viram aviso e destravam.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        setLock(null);
        last.current = null; // recusada: tentar a mesma jogada de novo vale (não é clique duplo)
        say(message);
        playMandacaruSound('error');
      }),
    [conn, say],
  );

  // Linhas novas do diário: rola os dados, mostra a soma, manda as cartas voando pra quem ganhou e avisa do roubo pros
  // dois envolvidos. A rolagem vai por etapas: `roll` (dados rolando) → `sum` (soma grande e cartas no ar) → `off`.
  // Sem movimento (`prefers-reduced-motion` ou aba escondida), pula direto pra soma e ninguém voa.
  const [rollFx, setRollFx] = useState<RollFx | null>(null);
  const prevLog = useRef<MandacaruLogEntry[] | null>(null);
  // Fora do ar: o `welcome` da volta chega antes da visão nova, então a próxima visão (a que traz a queda) é só a base.
  const rebase = useRef(false);
  useEffect(() => {
    if (status !== 'joined') rebase.current = true;
  }, [status]);
  useEffect(() => {
    if (rebase.current) {
      rebase.current = false;
      prevLog.current = g.log;
      return;
    }
    const fresh = freshEntries(prevLog.current, g.log);
    prevLog.current = g.log;
    const roll = [...fresh].reverse().find((e) => e.t === 'roll');
    if (roll && roll.t === 'roll') {
      const motion = motionOk();
      const flights = motion ? rollFlights(roll, g.layout, g.buildings, g.carcara, g.players) : [];
      setRollFx((r) => ({ id: (r?.id ?? 0) + 1, sum: roll.dice[0] + roll.dice[1], motion, flights, stage: motion ? 'roll' : 'sum' }));
    }
    const steal = fresh.find((e) => e.t === 'steal');
    if (steal && steal.t === 'steal' && g.stolen && me !== null && (steal.player === me || steal.from === me)) {
      const r = RES_NAME[g.stolen.resource];
      say(steal.player === me ? `você roubou 1 ${r} de ${nameOf(steal.from)}` : `o Carcará de ${nameOf(steal.player)} levou 1 ${r} seu`);
    }
    // Sua troca saiu: fecha a janela da troca (a oferta e as propostas sumiram) e avisa o que você deu.
    const trade = fresh.find((e) => e.t === 'trade' && me !== null && (e.a === me || e.b === me));
    if (trade && trade.t === 'trade') {
      const other = trade.a === me ? trade.b : trade.a;
      say(`troca feita com ${nameOf(other)}: você deu ${resList(trade.a === me ? trade.aGives : trade.bGives)}`);
      setUi((u) => (u.panel === 'trade' ? { ...u, panel: null, seed: null } : u));
    }
    // (cada visão chega como JSON novo: `g.log` muda junto com o resto, então as outras dependências não rodam a mais)
  }, [g.log, g.layout, g.buildings, g.carcara, g.players, g.stolen, me, nameOf, say]);
  const fxId = rollFx?.id ?? 0;
  const fxStage = rollFx?.stage ?? 'off';
  useEffect(() => {
    if (fxStage === 'off') return undefined;
    const t = setTimeout(
      () => setRollFx((r) => (r && r.id === fxId ? { ...r, stage: r.stage === 'roll' ? 'sum' : 'off' } : r)),
      fxStage === 'roll' ? TUMBLE_MS : SUM_MS,
    );
    return () => clearTimeout(t);
  }, [fxId, fxStage]);
  const sumOn = fxStage === 'sum';

  const spots = useMemo(() => spotsOf(g, mode), [g, mode]);
  const onSpot = useCallback(
    (kind: 'v' | 'e' | 'c' | 'h', n: number) => {
      send(spotAction(g, kind, n));
      // casa e vila: uma de cada vez; estrada continua ligada (dá pra fazer várias seguidas)
      if (kind === 'v' || kind === 'c') patch(() => ({ mode: null }));
    },
    [g, patch, send],
  );
  const onMode = useCallback((m: BuildMode) => patch((u) => ({ mode: u.mode === m ? null : m, panel: null })), [patch]);
  /** Abre (ou fecha, se já aberta) uma janela; a troca abre com a oferta/proposta que você já tem na mesa. */
  const onPanel = useCallback(
    (p: Panel) =>
      patch((u) =>
        u.panel === p ? { panel: null, seed: null } : { panel: p, mode: null, seed: p === 'trade' ? tradeSeed(g, me) : null, opened: u.opened + 1 },
      ),
    [g, me, patch],
  );
  const closePanel = useCallback(() => patch(() => ({ panel: null, seed: null })), [patch]);
  /** Contraproposta: a troca abre com a oferta invertida (você dá o que ela quer e quer o que ela dá). */
  const onCounter = useCallback(() => {
    const o = g.offer;
    if (!o) return;
    patch((u) => ({ panel: 'trade', mode: null, seed: { give: { ...o.want }, want: { ...o.give } }, opened: u.opened + 1 }));
  }, [g.offer, patch]);
  const onHideOffer = useCallback(() => patch(() => ({ hiddenOffer: g.offer?.id ?? null })), [g.offer, patch]);
  const onAction = useCallback(
    (a: SimpleAction) => {
      if (a.type === 'end_turn') patch(() => ({ mode: null, panel: null }));
      send(a);
    },
    [patch, send],
  );
  const onPlay = useCallback(
    (k: PlayableCordel) => {
      if (k === 'vaqueiro' || k === 'mutirao') {
        patch(() => ({ mode: null, panel: null }));
        send({ type: k === 'vaqueiro' ? 'play_vaqueiro' : 'play_mutirao' });
        return;
      }
      const p = PANEL_OF_CORDEL[k];
      if (p) onPanel(p);
    },
    [onPanel, patch, send],
  );
  const onRules = useCallback(() => setRulesOpen((o) => !o), []);
  const onRestart = useCallback(() => send({ type: 'restart' }), [send]);

  // Esc fecha a folha de regras; sem ela, larga a peça escolhida e fecha a janela.
  const hasUi = mode !== null || panel !== null;
  useEffect(() => {
    if (!hasUi && !rulesOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (rulesOpen) setRulesOpen(false);
      else setUi((u) => ({ ...u, mode: null, panel: null, seed: null }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasUi, rulesOpen]);

  const hint = hintFor(g, mode);
  const left = g.phase === 'discard' ? discardLeft : turnLeft;
  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  const sum = rollFx?.sum ?? 0;
  // O descarte manda sobre as outras janelas; o cartão da oferta só aparece sem janela aberta.
  const discarding = g.phase === 'discard' && g.can.discard > 0 && g.myRes !== null;
  const offerCard =
    !discarding && panel === null && me !== null && g.phase === 'main' && g.turn !== me && g.offer !== null && ui.hiddenOffer !== g.offer.id && g.myRes !== null;
  return (
    <div className="mandacaru" style={FUNDO_STYLE}>
      <div className="mc-app" style={stage}>
        <TopBar game={g} nameOf={nameOf} left={left} rollId={fxId} rolling={fxStage === 'roll'} onRules={onRules} rulesOpen={rulesOpen} />
        <Seats game={g} roomSeats={view.seats} you={view.you} nameOf={nameOf} turnLeft={turnLeft} />
        <main className="mc-mesa">
          <Board game={g} spots={spots} onSpot={onSpot} />
          {hint && <div className="mc-dica">{hint}</div>}
          <div className={`mc-soma${sumOn ? ' on' : ''}${sum === 7 ? ' sete' : ''}`} aria-hidden="true">
            {sum === 7 ? (
              <>
                7<small>lá vem o Carcará!</small>
              </>
            ) : sum > 0 ? (
              sum
            ) : null}
          </div>
          {discarding ? (
            <DiscardPanel key={`${g.match}:${g.discardEndsAt ?? '-'}`} game={g} left={discardLeft} send={send} />
          ) : panel === 'trade' && me !== null ? (
            <TradePanel key={ui.opened} game={g} me={me} nameOf={nameOf} seed={ui.seed} send={send} onClose={closePanel} />
          ) : panel === 'feira' ? (
            <FeiraPanel key={ui.opened} game={g} send={send} onClose={closePanel} />
          ) : panel === 'chuva' || panel === 'atravessador' ? (
            <CordelChoice key={ui.opened} kind={panel} game={g} send={send} onClose={closePanel} />
          ) : null}
          {offerCard && me !== null && (
            <OfferCard key={g.offer?.id} game={g} me={me} nameOf={nameOf} send={send} onCounter={onCounter} onHide={onHideOffer} />
          )}
        </main>
        <aside className="mc-right">
          <Actions game={g} me={me} nameOf={nameOf} mode={mode} onMode={onMode} onAction={onAction} panel={panel} onPanel={onPanel} />
          <Diary log={g.log} nameOf={nameOf} layout={g.layout} />
        </aside>
        <Hand game={g} onPlay={onPlay} />
        {rollFx && rollFx.motion && rollFx.stage !== 'roll' && rollFx.flights.length > 0 && (
          <Flights key={rollFx.id} flights={rollFx.flights} me={me} />
        )}
        {g.phase === 'over' && <EndPanel key={g.match} game={g} me={me} nameOf={nameOf} host={host} connected={connected} onRestart={onRestart} />}
        {rulesOpen && <RulesSheet onClose={() => setRulesOpen(false)} />}
        <div role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className="mc-toast">
              {toast.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
