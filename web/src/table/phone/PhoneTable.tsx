import type { Activity, ItoRoomView } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { playSound } from '../../brand/sounds';
import { isHost, seatStatus } from '../../game/derive';
import type { FxEvent, GameConn } from '../../net/connection';
import { Avatar } from '../../screens/Avatar';
import { SoundToggle } from '../../screens/SoundToggle';
import type { EngineSnapshot } from '../engine';
import { ReadyColumn } from '../ReadyColumn';
import { ResultBanner } from '../ResultBanner';
import { INTENT_TTL_MS, effectiveRow, intentSettled, toVisibleIndex, type Intent } from '../rowLayout';
import { ThemeCard } from '../ThemeCard';
import { TopBar } from '../TopBar';
import { ClueSheet, type ClueSheetHandle } from './ClueSheet';
import { PhoneHand } from './PhoneHand';
import { PhoneRow } from './PhoneRow';
import { canPick } from './phoneRowLogic';
import { usePhoneDrag } from './usePhoneDrag';
import { usePhoneReveal } from './usePhoneReveal';
import '../table.css';
import './phone.css';

// Mesmos valores da mesa do computador (`Table.tsx` e `engine.ts`).
const ACTIVITY_TTL_MS = 4000;
const REMOTE_STALE_MS = 6000;
const ROLLBACK_ERRORS = new Set(['not_owner', 'unknown_card', 'bad_phase']);
const NO_IDS: ReadonlySet<string> = new Set();

/** Arrasto de outra pessoa: `index` é o índice do servidor (null = sem alvo, carta no ar). */
interface RemoteDrag {
  cardId: string;
  index: number | null;
  at: number;
}
type Remotes = Record<string, RemoteDrag>;

function without(m: Remotes, id: string): Remotes {
  const next = { ...m };
  delete next[id];
  return next;
}

/** Mesa do DITU no celular em pé: topo (barra + assentos), fila em pé no meio (a única parte que rola) e mão embaixo. */
export function PhoneTable({ view, conn }: { view: ItoRoomView; conn: GameConn }) {
  const { phase } = view.game;
  const serverRow = view.game.row;
  /** Minhas intenções ainda sem resposta, na ordem em que mandei (o servidor aplica nessa ordem). */
  const [pending, setPending] = useState<Intent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [activities, setActivities] = useState<Record<string, { a: Activity; until: number }>>({});
  const [remotes, setRemotes] = useState<Remotes>({});
  // Espelho síncrono de `remotes`: o ouvinte de `fx` decide o som sem efeito colateral dentro do `setState`.
  const remotesRef = useRef<Remotes>({});
  const sheet = useRef<ClueSheetHandle>(null);
  const rowBox = useRef<HTMLDivElement>(null);
  // Montou já na revelação (recarregou a página): mostra o resultado direto, sem a sequência.
  const mountedInReveal = useRef(phase === 'reveal');
  const live = useRef(view);
  useEffect(() => {
    live.current = view;
  });

  const putRemotes = (next: Remotes) => {
    remotesRef.current = next;
    setRemotes(next);
  };

  // A cada `view`: cada intenção sai quando o servidor confirma, quando a carta some ou fora da escolha.
  useEffect(() => {
    setPending((ps) => {
      if (!ps.length) return ps;
      if (view.game.phase !== 'sorting') return [];
      const now = Date.now();
      const kept = ps.filter((p) => view.game.cards[p.cardId] && !intentSettled(view.game.row, p, now));
      return kept.length === ps.length ? ps : kept;
    });
  }, [view]);

  // Sem resposta do servidor, cada intenção expira mesmo sem `state` novo (igual ao computador).
  useEffect(() => {
    if (!pending.length) return;
    const oldest = Math.min(...pending.map((p) => p.at));
    const t = window.setTimeout(
      () =>
        setPending((ps) => {
          const now = Date.now();
          const kept = ps.filter((p) => now - p.at <= INTENT_TTL_MS);
          return kept.length === ps.length ? ps : kept;
        }),
      Math.max(0, oldest + INTENT_TTL_MS + 50 - Date.now()),
    );
    return () => clearTimeout(t);
  }, [pending]);

  // Fora da escolha não há arrasto, seleção nem painel de dica (os ids das cartas se repetem na próxima rodada).
  useEffect(() => {
    if (phase === 'sorting') return;
    if (Object.keys(remotesRef.current).length) {
      remotesRef.current = {};
      setRemotes({});
    }
    setEditing(null);
    setSelected(null);
  }, [phase]);

  useEffect(
    () =>
      conn.onFx((fx: FxEvent) => {
        const v = live.current;
        if (fx.t === 'fx.activity') {
          setActivities((m) => ({ ...m, [fx.from]: { a: fx.activity, until: Date.now() + ACTIVITY_TTL_MS } }));
          return;
        }
        if (fx.t !== 'fx.cursor' || fx.from === v.you || !v.seats.some((s) => s.id === fx.from)) return;
        const cur = remotesRef.current;
        if (fx.drag && v.game.phase === 'sorting') {
          putRemotes({ ...cur, [fx.from]: { cardId: fx.drag.cardId, index: fx.drag.index, at: Date.now() } });
        } else if (cur[fx.from]) {
          putRemotes(without(cur, fx.from));
          if (!fx.drag) playSound('slide'); // alguém soltou uma carta: a fila mexeu
        }
      }),
    [conn],
  );

  useEffect(
    () =>
      conn.onError((code) => {
        if (ROLLBACK_ERRORS.has(code)) setPending([]);
      }),
    [conn],
  );

  // Etiquetas de atividade e arrastos dos outros expiram sem notícia.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setActivities((m) => {
        const next = Object.fromEntries(Object.entries(m).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(m).length ? m : next;
      });
      const cur = remotesRef.current;
      const stale = Object.keys(cur).filter((id) => now - cur[id]!.at > REMOTE_STALE_MS);
      if (stale.length) putRemotes(stale.reduce(without, cur));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /** Cartas que outras pessoas estão carregando (saem da fila mostrada). */
  const carriedByOthers = useMemo(
    () => new Set(Object.values(remotes).map((r) => r.cardId).filter((id) => !!view.game.cards[id])),
    [remotes, view.game.cards],
  );
  /**
   * Fila em ordem de servidor contra a qual um `place` novo é interpretado: a do servidor com as minhas intenções
   * aplicadas em ordem (igual ao `placeBase` do computador). Sem isso, a 2ª colocação antes da resposta da 1ª
   * calcularia o índice sem a 1ª e poderia cair antes dela.
   */
  const placeBase = useMemo(() => pending.reduce<string[]>((r, p) => effectiveRow(r, p, NO_IDS), [...serverRow]), [serverRow, pending]);
  const row = useMemo(() => placeBase.filter((id) => !carriedByOthers.has(id)), [placeBase, carriedByOthers]);
  const pickable = (id: string) => canPick(view, id) && !carriedByOthers.has(id);
  const sel = selected !== null && pickable(selected) ? selected : null;

  // `live` (não `phase`): um arrasto que começou na escolha e terminou depois da revelação chama o `place` mais novo.
  const place = (cardId: string, index: number) => {
    if (live.current.game.phase !== 'sorting') return;
    // A dica que ainda está no debounce vai antes: com a carta na fila o servidor recusaria.
    sheet.current?.flush();
    setEditing(null);
    const base = placeBase.filter((id) => id !== cardId);
    const intent: Intent = { kind: 'place', cardId, index, after: index > 0 ? (base[index - 1] ?? null) : null, at: Date.now() };
    // Uma intenção nova da mesma carta substitui a anterior (o computador faz o mesmo ao pegar a carta).
    setPending((ps) => [...ps.filter((p) => p.cardId !== cardId), intent]);
    conn.sendAction({ type: 'place', cardId, index });
    playSound('card');
    setSelected(null);
  };
  const ret = (cardId: string) => {
    if (live.current.game.phase !== 'sorting') return;
    const intent: Intent = { kind: 'return', cardId, at: Date.now() };
    setPending((ps) => [...ps.filter((p) => p.cardId !== cardId), intent]);
    conn.sendAction({ type: 'return', cardId });
    setSelected(null);
  };
  const pick = (cardId: string) => {
    if (!pickable(cardId)) return;
    setSelected((s) => (s === cardId ? null : cardId));
  };

  const drag = usePhoneDrag({ container: rowBox, row, serverRow: placeBase, canPick: pickable, conn, onDrop: place });
  const reveal = usePhoneReveal(view, (name, index) => playSound(name, index), mountedInReveal.current);

  const gaps = Object.entries(remotes)
    .filter(([, r]) => r.index !== null && carriedByOthers.has(r.cardId))
    .map(([owner, r]) => ({ owner, pos: toVisibleIndex(row, serverRow, r.cardId, r.index!) }));
  // Meu arrasto só conta na escolha (se a fase virou no meio dele, o `place` nem sai).
  const sorting = phase === 'sorting';
  if (sorting && drag.pos !== null && view.you) gaps.push({ owner: view.you, pos: drag.pos });
  const carried = sorting && drag.dragging ? new Set([...carriedByOthers, drag.dragging]) : carriedByOthers;
  // Carta minha que outra pessoa está carregando continua "na mesa" pra mão.
  const handRow = carriedByOthers.size ? [...row, ...carriedByOthers] : row;
  const snap: EngineSnapshot = { row, inFlight: carriedByOthers, dragging: drag.dragging, revealing: phase === 'reveal' && !reveal.done };
  const allPlaced = Object.keys(view.game.cards).every((id) => serverRow.includes(id));
  const hostSorting = isHost(view) && phase === 'sorting';
  const activityOf = (id: string): Activity | undefined => activities[id]?.a;

  // Tocar fora da fila (e fora das cartas da mão) desseleciona.
  const onTableClick = (e: MouseEvent) => {
    if (e.target instanceof Element && !e.target.closest('.p-row, .p-hnum')) setSelected(null);
  };

  return (
    <div className="p-table" onClick={onTableClick}>
      <TopBar view={view} />
      <div className="p-seats">
        {view.seats.map((seat) => {
          const status = seatStatus(view, seat, activityOf(seat.id));
          return (
            <div key={seat.id} className="p-seat">
              <Avatar color={seat.color} anchor={seat.id} />
              <span className="p-seat-name">
                {seat.id === view.you ? 'você' : seat.name}
                {seat.id === view.hostId ? ' ★' : ''}
              </span>
              <span className="tag" data-s={status.replace(/[^a-z]/g, '')}>
                {status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="p-mid">
        <ThemeCard theme={view.game.theme} />
        {phase === 'theme' ? (
          // O host escolhe o tema no lugar da fila (o `ReadyColumn` mostra o painel ou o aviso pros outros).
          <ReadyColumn view={view} snap={snap} conn={conn} />
        ) : (
          <PhoneRow
            view={view}
            row={row}
            placeBase={placeBase}
            selected={sel}
            gaps={gaps}
            carried={carried}
            shown={reveal.shown}
            onPick={pick}
            onTarget={(index) => {
              if (sel) place(sel, index);
            }}
            onReturn={ret}
            onPointerDown={drag.onPointerDown}
            listRef={rowBox}
          />
        )}
        {/* Aqui dentro (e não no fim da mesa): a pílula "ver resultado" fica no pé da fila, sem cobrir o topo. */}
        {phase === 'reveal' && reveal.done && <ResultBanner view={view} conn={conn} />}
      </div>

      <div className="p-foot">
        {phase === 'sorting' && (
          <PhoneHand view={view} row={handRow} selected={sel} onPick={pick} onEdit={setEditing} onPointerDown={drag.onPointerDown} />
        )}
        <div className="p-actions">
          {phase !== 'theme' && <ReadyColumn view={view} snap={snap} conn={conn} />}
          <SoundToggle />
        </div>
        {hostSorting && (
          <div className="p-host">
            <button
              className="sbtn"
              type="button"
              disabled={!allPlaced}
              title={allPlaced ? undefined : 'ainda tem carta fora da mesa'}
              onClick={() => conn.sendAction({ type: 'forceReveal' })}
            >
              revelar agora
            </button>
            <button
              className="sbtn"
              type="button"
              onClick={() => {
                // Saída se a rodada travar (alguém sumiu com carta na mão): mesmo nível, sem perder vida.
                if (window.confirm('Pular esta rodada? As cartas voltam e um tema novo é sorteado.')) conn.sendAction({ type: 'next' });
              }}
            >
              pular rodada
            </button>
          </div>
        )}
      </div>

      {editing && view.game.cards[editing] && (
        <ClueSheet key={editing} ref={sheet} view={view} cardId={editing} conn={conn} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
