import { COUP_TARGETED, type CoupActionKind, type CoupCharacter, type CoupRoomView } from '@cartolina/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useLayout } from '../../lib/device';
import { JOIN_ERRORS, type ConnStatus, type GameConn } from '../../net/connection';
import { useStageFit } from '../dixit/useStageFit';
import { useToast } from '../dixit/useToast';
import { preloadCharacterArt } from './art';
import { useWindowClock, windowLeft } from './clock';
import { Diary, LastLine } from './Diary';
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
/** Trava contra envio duplo: solta sozinha depois disso (ms), se nem visão nova nem recusa chegarem. */
const UNLOCK_MS = 4000;

interface Props {
  view: CoupRoomView;
  conn: GameConn;
  /** Hora do servidor menos a do PC (o prazo da janela não depende do relógio local). */
  serverOffset: number;
  /** Status da conexão (reconectar não vira momentos nem sons atrasados). */
  status: ConnStatus;
}

/**
 * O que é só da interface: ação esperando o alvo, carta escolhida pra perder, cartas marcadas na troca e a trava
 * contra envio duplo (`sent`: já mandou uma ação nesta situação). Vale só pra situação em que foi escolhido (`key`):
 * visão nova com outra situação = tudo zerado (inclusive a trava).
 */
interface Ui {
  key: string;
  aiming: CoupActionKind | null;
  lose: number;
  keep: number[];
  sent: boolean;
}
/** Nada marcado (o mesmo array sempre: o painel memorizado não redesenha a cada tique do relógio). */
const NO_KEEP: number[] = [];
const freshUi = (key: string): Ui => ({ key, aiming: null, lose: -1, keep: NO_KEEP, sent: false });

/**
 * A mesa do Cúpi: no computador, palco 1440×900 escalado com o topo, os oponentes, o palco (feltro), a sua área e o diário.
 * No celular em pé (`coup--phone`), os mesmos componentes em coluna, na altura da tela: topo fino, oponentes em grade,
 * a faixa com a última linha do diário (abre a folha do diário), o palco, a sua mão e as ações; painéis viram folhas.
 * Tudo que é jogo vem de `view.game`; aqui só mora o estado da interface (alvo, carta a perder, cartas da troca).
 */
export function CoupTable({ view, conn, serverOffset, status }: Props) {
  const g = view.game;
  const host = view.hostId !== null && view.hostId === view.you;
  const me = view.you !== null && g.players.includes(view.you) ? view.you : null;
  const names = useMemo(() => nameFrom(view), [view]);
  const { scale, width } = useStageFit();
  const phone = useLayout() === 'phone';
  // folha do diário (só no celular): voltar pro computador fecha
  const [diaryOpen, setDiaryOpen] = useState(false);
  if (!phone && diaryOpen) setDiaryOpen(false);
  const openDiary = useCallback(() => setDiaryOpen(true), []);
  const closeDiary = useCallback(() => setDiaryOpen(false), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const { toast, say } = useToast(TOAST_MS);

  const clock = useWindowClock(g.window?.endsAt ?? null, serverOffset);
  const moment = useMoments(g.log, g.match, g.phase === 'over', status);
  useCoupSounds(view, clock, status);
  useCoupButtonSounds(rootRef);
  // as 5 artes já no cache quando a primeira carta virar (momento de dúvida, bloqueio, perder carta)
  useEffect(preloadCharacterArt, []);

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
  // Recusas do servidor (que não são de entrada na sala) viram aviso no palco.
  useEffect(
    () =>
      conn.onError((code, message) => {
        if (JOIN_ERRORS.has(code)) return;
        // recusou: quem errou pode tentar de novo
        setUi((u) => (u.sent ? { ...u, sent: false } : u));
        say(message);
        playCoupSound('error');
      }),
    [conn, say],
  );

  const aiming = ui.aiming !== null && g.can.act.includes(ui.aiming) && COUP_TARGETED[ui.aiming] ? ui.aiming : null;

  // Trava contra envio duplo (molde: `sentFor` do Retratim): uma ação por situação; solta com visão nova,
  // recusa do servidor ou, por garantia, depois de alguns segundos.
  const sent = ui.sent;
  const send = useCallback(
    (a: Parameters<GameConn['sendAction']>[0]) => {
      if (sent) return;
      patch(() => ({ sent: true }));
      conn.sendAction(a);
    },
    [conn, patch, sent],
  );
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => setUi((u) => (u.key === key && u.sent ? { ...u, sent: false } : u)), UNLOCK_MS);
    return () => clearTimeout(t);
  }, [sent, key]);
  const windowId = g.window?.id;
  const endsAt = g.window?.endsAt;

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
      if (windowId === undefined || endsAt === undefined) return;
      // nos 100 ms entre o prazo e o próximo tique do relógio os botões ainda aparecem: o clique não sai
      if (windowLeft(endsAt, Date.now() + serverOffset) <= 0) return;
      send({ ...r, windowId });
    },
    [send, windowId, endsAt, serverOffset],
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

  // Esc sai do modo "escolher alvo" (e fecha a folha do diário)
  const hasAim = aiming !== null;
  useEffect(() => {
    if (!hasAim && !diaryOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (diaryOpen) setDiaryOpen(false);
      else setUi((u) => ({ ...u, aiming: null }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasAim, diaryOpen]);

  // Modo alvo: o foco vai pro primeiro assento-alvo; ao mirar ou cancelar, volta pro botão da ação.
  const prevAim = useRef<CoupActionKind | null>(null);
  useEffect(() => {
    const prev = prevAim.current;
    prevAim.current = aiming;
    const root = rootRef.current;
    if (!root) return;
    if (aiming !== null && prev === null) root.querySelector<HTMLElement>('.cp-opp.aim')?.focus();
    else if (aiming === null && prev !== null) root.querySelector<HTMLElement>(`.cp-act[data-kind="${prev}"]`)?.focus();
  }, [aiming]);

  // Folha do diário fechada (botão, fundo ou Esc): o foco volta pra faixa que abriu.
  const wasOpen = useRef(false);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = diaryOpen;
    if (was && !diaryOpen) rootRef.current?.querySelector<HTMLElement>('.cp-lastline')?.focus();
  }, [diaryOpen]);

  // celular: reagindo na janela (o modo compacto da tela baixa esconde as ações, que estão todas apagadas)
  const reacting = phone && g.phase === 'reaction' && g.can.pass;
  const rootClass = ['coup', phone ? 'coup--phone' : '', reacting ? 'cp-reacting' : ''].filter(Boolean).join(' ');
  const stage = { width, transform: `translate(-50%, -50%) scale(${scale})` } as CSSProperties;
  return (
    <div className={rootClass} ref={rootRef} data-button-sounds="">
      <div className="cp-app" style={phone ? undefined : stage}>
        <TopBar wins={g.wins} nameOf={names.nameOf} phone={phone} me={me} />
        <main className="cp-main">
          <section className="cp-table">
            <Seats game={g} roomSeats={view.seats} you={view.you} nameOf={names.nameOf} aiming={hasAim} onTarget={onTarget} />
            {phone && <LastLine log={g.log} names={names} open={diaryOpen} onOpen={openDiary} />}
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
                sheet={phone}
              />
            </div>
          </section>
          <Diary log={g.log} match={g.match} names={names} phone={phone} open={diaryOpen} onClose={closeDiary} />
        </main>
        {phone && diaryOpen && <div className="cp-scrim" aria-hidden="true" onClick={closeDiary} />}
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
