import type { MandacaruAction, MandacaruLogEntry, MandacaruRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JOIN_ERRORS, type ConnSnapshot, type GameConn } from '../../net/connection';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { Actions, hintFor, type Panel, type SimpleAction } from './Actions';
import { Board, spotAction, spotsOf, type BuildMode } from './Board';
import { useTurnClock } from './clock';
import { Diary, freshEntries } from './Diary';
import { Hand, type PlayableCordel } from './Hand';
import { RES_NAME } from './names';
import { Seats } from './Seats';
import { installMandacaruAudioUnlock, playMandacaruSound } from './sounds';
import { nameFrom } from './texts';
import { TopBar } from './TopBar';
import './mandacaru.css';

const TOAST_MS = 2600;
/** Trava contra envio duplo: solta sozinha depois disso (ms), se nem visão nova nem recusa chegarem. */
const UNLOCK_MS = 4000;
/** Quanto tempo a soma dos dados fica grande no meio do tabuleiro. */
const SUM_MS = 1000;

/**
 * Ponto de extensão da Task 4 (plano M2): as janelas que já existem. A Task 4 acrescenta 'trade', 'feira', 'chuva' e
 * 'atravessador' aqui e desenha cada uma em `PanelSlot`; enquanto não estão aqui, os botões delas ficam apagados
 * com "em breve". (O descarte, o cartão de oferta, o fim e a folha de regras também entram na Task 4.)
 */
const READY_PANELS: ReadonlySet<Panel> = new Set<Panel>();
const panelReady = (p: Panel) => READY_PANELS.has(p);
/** Cordéis que se jogam sem janela; os outros esperam a janela deles. */
const DIRECT_CORDEIS: ReadonlySet<PlayableCordel> = new Set<PlayableCordel>(['vaqueiro', 'mutirao']);
const PANEL_OF_CORDEL: Partial<Record<PlayableCordel, Panel>> = { chuva: 'chuva', atravessador: 'atravessador' };
const cordelReady = (k: PlayableCordel) => DIRECT_CORDEIS.has(k) || (PANEL_OF_CORDEL[k] !== undefined && panelReady(PANEL_OF_CORDEL[k]));

interface Props {
  view: MandacaruRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (os prazos não dependem do relógio local). */
  serverOffset: number;
  status: ConnSnapshot['status'];
}

/**
 * O que é só da interface, preso a uma situação (`at` = partida:fase:vez): a peça escolhida pra construir e a janela
 * aberta. Mudou a partida, a fase ou a vez = tudo zerado. A peça também some quando os lugares dela acabam.
 */
interface Ui {
  at: string;
  mode: BuildMode | null;
  panel: Panel | null;
}
const freshUi = (at: string): Ui => ({ at, mode: null, panel: null });

/** A janela aberta ainda faz sentido agora? (A Task 4 refina por janela.) */
function panelOk(p: Panel, g: MandacaruRoomView['game'], me: string | null): boolean {
  const mine = me !== null && g.turn === me;
  switch (p) {
    case 'trade':
      return g.phase === 'main' && (mine ? g.can.offer : g.can.propose);
    case 'feira':
      return g.phase === 'main' && mine;
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
export function MandacaruTable({ view, conn, serverOffset, status }: Props) {
  const g = view.game;
  const me = view.you !== null && g.players.includes(view.you) ? view.you : null;
  const nameOf = useMemo(() => nameFrom(view), [view]);
  const { scale, width } = useStageFit();
  const { toast, say } = useToast(TOAST_MS);
  useEffect(() => installMandacaruAudioUnlock(), []);

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
  const panel = ui.panel !== null && panelReady(ui.panel) && panelOk(ui.panel, g, me) ? ui.panel : null;

  // Trava contra envio duplo: uma ação por visão; solta com visão nova, recusa do servidor ou depois de alguns segundos.
  const [sentAt, setSentAt] = useState<MandacaruRoomView | null>(null);
  const sent = sentAt === view;
  const send = useCallback(
    (a: MandacaruAction) => {
      if (sent) return;
      setSentAt(view);
      conn.sendAction(a);
    },
    [conn, sent, view],
  );
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => setSentAt(null), UNLOCK_MS);
    return () => clearTimeout(t);
  }, [sent]);

  // Recusas do servidor (que não são de entrada na sala) viram aviso e destravam.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        setSentAt(null);
        say(message);
        playMandacaruSound('error');
      }),
    [conn, say],
  );

  // Linhas novas do diário: chacoalha os dados, mostra a soma e avisa do roubo pros dois envolvidos.
  const [rollFx, setRollFx] = useState<{ id: number; sum: number } | null>(null);
  const [sumOn, setSumOn] = useState(false);
  const prevLog = useRef<MandacaruLogEntry[] | null>(null);
  const reconnecting = status !== 'joined';
  useEffect(() => {
    const fresh = reconnecting ? [] : freshEntries(prevLog.current, g.log);
    prevLog.current = g.log;
    const roll = [...fresh].reverse().find((e) => e.t === 'roll');
    if (roll && roll.t === 'roll') {
      setRollFx((r) => ({ id: (r?.id ?? 0) + 1, sum: roll.dice[0] + roll.dice[1] }));
      setSumOn(true);
    }
    const steal = fresh.find((e) => e.t === 'steal');
    if (steal && steal.t === 'steal' && g.stolen && me !== null && (steal.player === me || steal.from === me)) {
      const r = RES_NAME[g.stolen.resource];
      say(steal.player === me ? `você roubou 1 ${r} de ${nameOf(steal.from)}` : `o Carcará de ${nameOf(steal.player)} levou 1 ${r} seu`);
    }
  }, [g.log, g.stolen, me, nameOf, reconnecting, say]);
  useEffect(() => {
    if (!sumOn) return undefined;
    const t = setTimeout(() => setSumOn(false), SUM_MS);
    return () => clearTimeout(t);
  }, [sumOn, rollFx]);

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
  const onPanel = useCallback(
    (p: Panel) => {
      if (!panelReady(p)) return;
      patch((u) => ({ panel: u.panel === p ? null : p, mode: null }));
    },
    [patch],
  );
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

  // Esc larga a peça escolhida e fecha a janela.
  const hasUi = mode !== null || panel !== null;
  useEffect(() => {
    if (!hasUi) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUi((u) => ({ ...u, mode: null, panel: null }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasUi]);

  const hint = hintFor(g, mode);
  const left = g.phase === 'discard' ? discardLeft : turnLeft;
  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  const sum = rollFx?.sum ?? 0;
  return (
    <div className="mandacaru">
      <div className="mc-app" style={stage}>
        <TopBar game={g} nameOf={nameOf} left={left} rollId={rollFx?.id ?? 0} />
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
          <PanelSlot panel={panel} />
        </main>
        <aside className="mc-right">
          <Actions
            game={g}
            me={me}
            nameOf={nameOf}
            mode={mode}
            onMode={onMode}
            onAction={onAction}
            panel={panel}
            onPanel={onPanel}
            panelReady={panelReady}
          />
          <Diary log={g.log} nameOf={nameOf} layout={g.layout} />
        </aside>
        <Hand game={g} onPlay={onPlay} ready={cordelReady} />
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

/**
 * Onde as janelas sobre o tabuleiro aparecem. A Task 4 desenha aqui a janela de `panel` (troca, feira, Chuva,
 * Atravessador) e, pela fase, o descarte, o cartão de oferta e o fim. Por enquanto nada abre.
 */
function PanelSlot({ panel }: { panel: Panel | null }) {
  if (panel === null) return null;
  return null;
}
