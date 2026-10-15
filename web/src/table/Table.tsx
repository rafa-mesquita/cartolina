import type { Activity, RoomView } from '@cartolina/shared';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isHost, seatStatus } from '../game/derive';
import type { GameConn } from '../net/connection';
import { playSound } from '../brand/sounds';
import { loadSoundPref, loadTiltPref, saveSoundPref, saveTiltPref } from '../net/identity';
import { Avatar } from '../screens/Avatar';
import { FH, FW } from './constants';
import { TableEngine, type EngineSnapshot } from './engine';
import { Hand } from './Hand';
import { ReadyColumn } from './ReadyColumn';
import { ResultBanner } from './ResultBanner';
import { Seat } from './Seat';
import { arrangeSeats } from './seatLayout';
import { ThemeCard } from './ThemeCard';
import { ThemePanel } from './ThemePanel';
import { TopBar } from './TopBar';
import './table.css';

const EMPTY: EngineSnapshot = { row: [], inFlight: new Set(), dragging: null, revealing: false };
const noopSubscribe = () => () => {};
const getEmpty = () => EMPTY;
const ACTIVITY_TTL_MS = 4000;
const ROLLBACK_ERRORS = new Set(['not_owner', 'unknown_card', 'bad_phase']);

export function Table({ view, conn }: { view: RoomView; conn: GameConn }) {
  const wrap = useRef<HTMLDivElement>(null);
  const felt = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const markers = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const cursors = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<TableEngine | null>(null);
  const [tiltOn, setTiltOn] = useState(loadTiltPref);
  const [soundOn, setSoundOn] = useState(loadSoundPref);
  const [activities, setActivities] = useState<Record<string, { a: Activity; until: number }>>({});
  // Chave da revelação cuja animação terminou: o banner só aparece pra revelação atual.
  const [revealDone, setRevealDone] = useState<string | null>(null);
  // Ids de carta se repetem entre rodadas (`dono:n`), então a chave leva o valor também.
  const revealKey = view.game.reveal?.map((e) => `${e.cardId}=${e.value}`).join(',') ?? '';
  const revealKeyRef = useRef(revealKey);

  // Layout effect: o motor nasce e recebe a fila antes da primeira pintura (sem piscar a mesa vazia).
  useLayoutEffect(() => {
    const e = new TableEngine(
      {
        wrap: wrap.current!,
        felt: felt.current!,
        row: row.current!,
        overlay: overlay.current!,
        cursors: cursors.current!,
        tip: tip.current!,
        markers: Array.from(markers.current!.children) as HTMLElement[],
      },
      {
        place: (cardId, index) => conn.sendAction({ type: 'place', cardId, index }),
        ret: (cardId) => conn.sendAction({ type: 'return', cardId }),
        cursor: (fx) => conn.sendCursor(fx),
        activity: (a) => conn.sendActivity(a),
        ping: (x, y) => conn.sendPing(x, y),
        revealDone: () => setRevealDone(revealKeyRef.current),
        sound: (name) => playSound(name),
      },
    );
    e.setTilt(loadTiltPref(), true);
    setEngine(e);
    return () => e.destroy();
  }, [conn]);

  useLayoutEffect(() => {
    revealKeyRef.current = revealKey;
    engine?.update(view);
  }, [engine, view, revealKey]);

  useEffect(() => {
    if (view.game.phase !== 'reveal') setRevealDone(null);
  }, [view.game.phase]);

  useEffect(() => {
    if (!engine) return;
    return conn.onFx((fx) => {
      if (fx.t === 'fx.cursor') engine.remoteCursor(fx);
      else if (fx.t === 'fx.ping') engine.remotePing(fx.from, fx.x, fx.y);
      else if (fx.t === 'fx.activity') setActivities((m) => ({ ...m, [fx.from]: { a: fx.activity, until: Date.now() + ACTIVITY_TTL_MS } }));
    });
  }, [conn, engine]);

  useEffect(() => {
    if (!engine) return;
    return conn.onError((code) => {
      if (ROLLBACK_ERRORS.has(code)) engine.rollback();
    });
  }, [conn, engine]);

  useEffect(() => {
    const t = setInterval(() => {
      setActivities((m) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(m).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(m).length ? m : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const snap = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : getEmpty);
  const activityOf = (id: string): Activity | undefined => activities[id]?.a;
  const me = view.seats.find((s) => s.id === view.you);
  const myStatus = me ? seatStatus(view, me, undefined) : null;
  const allPlaced = Object.keys(view.game.cards).every((id) => view.game.row.includes(id));
  const toggleTilt = () => {
    const next = !tiltOn;
    setTiltOn(next);
    saveTiltPref(next);
    engine?.setTilt(next);
  };
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    saveSoundPref(next);
  };

  return (
    <div className="table-screen">
      <TopBar view={view} />
      {arrangeSeats(
        view.seats.map((s) => s.id),
        view.you,
      ).map((slot) => {
        const seat = view.seats.find((s) => s.id === slot.id)!;
        return <Seat key={seat.id} view={view} seat={seat} slot={slot} snap={snap} activity={activityOf(seat.id)} />;
      })}

      <div className="stage-wrap" ref={wrap}>
        <div className="stage">
          <div className="felt" ref={felt}>
            <ThemeCard theme={view.game.theme} />
            <div className="endmark m1">1</div>
            <div className="endmark m100">100</div>
            <div className="markers" ref={markers}>
              <div className="hm" style={{ left: 0, top: 0 }} />
              <div className="hm" style={{ left: FW, top: 0 }} />
              <div className="hm" style={{ left: 0, top: FH }} />
              <div className="hm" style={{ left: FW, top: FH }} />
            </div>
            <div className="row" ref={row} />
          </div>
        </div>
      </div>

      {view.game.phase === 'theme' && <ThemePanel view={view} conn={conn} />}

      <div className="me-area">
        {me && myStatus && (
          <div className="me-id">
            <Avatar color={me.color} />
            <div className="name">você</div>
            <div className="tag" data-s={myStatus.replace(/[^a-z]/g, '')}>
              {myStatus}
            </div>
          </div>
        )}
        <Hand view={view} snap={snap} engine={engine} conn={conn} />
        <ReadyColumn view={view} snap={snap} conn={conn} />
      </div>

      <div className="controls">
        <button className="toggle-row" type="button" onClick={toggleTilt} aria-pressed={tiltOn}>
          <span>mesa 3D</span>
          <span className={`toggle ${tiltOn ? 'on' : ''}`}>
            <span className="knob" />
          </span>
        </button>
        <button className="toggle-row" type="button" onClick={toggleSound} aria-pressed={soundOn}>
          <span>som</span>
          <span className={`toggle ${soundOn ? 'on' : ''}`}>
            <span className="knob" />
          </span>
        </button>
        {isHost(view) && view.game.phase === 'sorting' && (
          <button
            className="sbtn"
            type="button"
            disabled={!allPlaced}
            title={allPlaced ? undefined : 'ainda tem carta fora da mesa'}
            onClick={() => conn.sendAction({ type: 'forceReveal' })}
          >
            revelar agora
          </button>
        )}
      </div>

      {view.game.phase === 'reveal' && revealKey !== '' && revealDone === revealKey && <ResultBanner view={view} conn={conn} />}

      <div className="overlay-layer" ref={overlay} />
      <div className="cursor-layer" ref={cursors} />
      <div className="tip" ref={tip} />
    </div>
  );
}
