import { COUP_TARGETED, type CoupActionKind, type CoupCharacter, type CoupRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { JOIN_ERRORS, type ConnStatus, type GameConn } from '../../net/connection';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { useWindowClock } from './clock';
import { Diary } from './Diary';
import { useMoments } from './moments';
import { MyArea } from './MyArea';
import { Panels } from './Panels';
import { Seats } from './Seats';
import { playCoupSound } from './sounds';
import { Stage, type Reaction } from './Stage';
import { nameFrom } from './texts';
import { TopBar } from './TopBar';
import { useCoupButtonSounds } from './useCoupButtonSounds';
import { useCoupSounds } from './useCoupSounds';
import './coup.css';

const TOAST_MS = 2400;

interface Props {
  view: CoupRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (o prazo da janela não depende do relógio local). */
  serverOffset: number;
  /** Status da conexão (reconectar não vira momentos nem sons atrasados). */
  status: ConnStatus;
}

/**
 * O que é só da interface: ação esperando o alvo, carta escolhida pra perder e cartas marcadas na troca.
 * Vale só pra situação em que foi escolhido (`key`): visão nova com outra situação = tudo zerado.
 */
interface Ui {
  key: string;
  aiming: CoupActionKind | null;
  lose: number;
  keep: number[];
}
/** Nada marcado (o mesmo array sempre: o painel memorizado não redesenha a cada tique do relógio). */
const NO_KEEP: number[] = [];
const freshUi = (key: string): Ui => ({ key, aiming: null, lose: -1, keep: NO_KEEP });

/**
 * A mesa do Cúpi no computador: palco 1440×900 escalado com o topo, os oponentes, o palco (feltro), a sua área e o diário.
 * Tudo que é jogo vem de `view.game`; aqui só mora o estado da interface (alvo, carta a perder, cartas da troca).
 */
export function CoupTable({ view, conn, serverOffset, status }: Props) {
  const g = view.game;
  const host = view.hostId !== null && view.hostId === view.you;
  const me = view.you !== null && g.players.includes(view.you) ? view.you : null;
  const names = useMemo(() => nameFrom(view), [view]);
  const { scale, width } = useStageFit();
  const rootRef = useRef<HTMLDivElement>(null);
  const { toast, say } = useToast(TOAST_MS);

  const clock = useWindowClock(g.window?.endsAt ?? null, serverOffset);
  const moment = useMoments(g.log, g.match, g.phase === 'over', status);
  useCoupSounds(view, clock, status);
  useCoupButtonSounds(rootRef);

  // Recusas do servidor (que não são de entrada na sala) viram aviso no palco.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        say(message);
        playCoupSound('error');
      }),
    [conn, say],
  );

  // estado da interface, preso à situação da visão
  const key = `${g.match}:${g.log.length}:${g.phase}:${g.window?.id ?? '-'}`;
  const [uiState, setUi] = useState<Ui>(() => freshUi(key));
  const ui = uiState.key === key ? uiState : freshUi(key);
  const patch = useCallback(
    (f: (u: Ui) => Partial<Ui>) =>
      setUi((prev) => {
        const base = prev.key === key ? prev : freshUi(key);
        return { ...base, ...f(base) };
      }),
    [key],
  );
  const aiming = ui.aiming !== null && g.can.act.includes(ui.aiming) && COUP_TARGETED[ui.aiming] ? ui.aiming : null;

  const send = useCallback((a: Parameters<GameConn['sendAction']>[0]) => conn.sendAction(a), [conn]);
  const windowId = g.window?.id;

  const onAct = useCallback(
    (kind: CoupActionKind) => {
      if (!g.can.act.includes(kind)) return;
      if (COUP_TARGETED[kind]) {
        patch((u) => ({ aiming: u.aiming === kind ? null : kind }));
        return;
      }
      patch(() => ({ aiming: null }));
      send({ type: 'act', kind });
    },
    [g.can.act, patch, send],
  );
  const onTarget = useCallback(
    (target: string) => {
      if (aiming === null || !g.can.targets.includes(target)) return;
      patch(() => ({ aiming: null }));
      send({ type: 'act', kind: aiming, target });
    },
    [aiming, g.can.targets, patch, send],
  );
  const onCancelAim = useCallback(() => patch(() => ({ aiming: null })), [patch]);
  const onReact = useCallback(
    (r: Reaction) => {
      if (windowId === undefined) return;
      send({ ...r, windowId });
    },
    [send, windowId],
  );
  const onLoseSel = useCallback((i: number) => patch(() => ({ lose: i })), [patch]);
  const onLose = useCallback((card: CoupCharacter) => send({ type: 'lose', card }), [send]);
  const keepMax = g.can.keep;
  const onKeepToggle = useCallback(
    (i: number) =>
      patch((u) => {
        if (u.keep.includes(i)) return { keep: u.keep.filter((x) => x !== i) };
        return u.keep.length < keepMax ? { keep: [...u.keep, i] } : {};
      }),
    [patch, keepMax],
  );
  const onExchange = useCallback((keep: CoupCharacter[]) => send({ type: 'exchange', keep }), [send]);
  const onRestart = useCallback(() => send({ type: 'restart' }), [send]);

  // Esc sai do modo "escolher alvo"
  const hasAim = aiming !== null;
  useEffect(() => {
    if (!hasAim) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUi((u) => ({ ...u, aiming: null }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasAim]);

  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  return (
    <div className="coup" ref={rootRef} data-button-sounds="">
      <div className="cp-app" style={stage}>
        <TopBar wins={g.wins} nameOf={names.nameOf} />
        <main className="cp-main">
          <section className="cp-table">
            <Seats game={g} roomSeats={view.seats} you={view.you} nameOf={names.nameOf} aiming={hasAim} onTarget={onTarget} />
            <Stage game={g} names={names} clock={clock} aiming={aiming} onCancelAim={onCancelAim} onReact={onReact} moment={moment} />
            <div className="cp-mebox">
              <MyArea game={g} me={me} aiming={aiming} onAct={onAct} />
              <Panels
                game={g}
                nameOf={names.nameOf}
                host={host}
                loseSel={ui.lose}
                keepSel={ui.keep}
                onLoseSel={onLoseSel}
                onLose={onLose}
                onKeepToggle={onKeepToggle}
                onExchange={onExchange}
                onRestart={onRestart}
              />
            </div>
          </section>
          <Diary log={g.log} match={g.match} names={names} />
        </main>
        <div role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className="cp-toast">
              {toast.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
