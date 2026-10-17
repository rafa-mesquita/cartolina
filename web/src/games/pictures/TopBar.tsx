import type { PicturesRoomView } from '@cartolina/shared';
import { useEffect, useRef, useState } from 'react';
import { loadSoundPref, saveSoundPref } from '../../net/identity';
import { Critter } from '../../screens/Critter';
import { playPicturesSound } from './sounds';
import { KIT_NAMES, pts, seatLabel } from './status';
import { useCountdown } from './useCountdown';

/** Liga/desliga o som (a mesma preferência do resto do site), no estilo álbum. */
function SoundButton() {
  const [on, setOn] = useState(loadSoundPref);
  return (
    <button
      className="pc-icon-btn"
      type="button"
      aria-pressed={on}
      aria-label="som"
      title={on ? 'som ligado' : 'som desligado'}
      onClick={() => {
        saveSoundPref(!on);
        setOn(!on);
      }}
    >
      <i className={`ti ${on ? 'ti-volume' : 'ti-volume-off'}`} />
    </button>
  );
}

/** Um adesivo "+n" saindo do selinho (revelação). */
export interface SealPlus {
  id: string;
  player: string;
  n: number;
}

interface Props {
  view: PicturesRoomView;
  serverOffset: number;
  host: boolean;
  onHurry: () => void;
  /** Placar mostrado nos selinhos (na revelação, o que já subiu); sem ele, o da visão. */
  scores?: Readonly<Record<string, number>>;
  /** Adesivos "+n" da obra que está sendo revelada. */
  plus?: readonly SealPlus[];
}

/** Logo, rodada e kit, selinhos de quem joga, relógio da contagem, som e "apressar" (só do host). */
export function TopBar({ view, serverOffset, host, onHurry, scores, plus = [] }: Props) {
  const g = view.game, me = view.you;
  const left = useCountdown(g.paused ? null : g.countdownEndsAt, serverOffset);
  const myKit = me !== null ? g.kits[me] : undefined;
  const open = g.phase === 'building' || g.phase === 'guessing';
  const canHurry = host && open && !g.paused && g.countdownEndsAt === null;
  // Tique baixinho nos 5 s finais da contagem, uma vez por segundo.
  const lastTick = useRef('');
  useEffect(() => {
    if (!open || left === null || left < 1 || left > 5) return;
    const key = `${g.countdownEndsAt}:${left}`;
    if (lastTick.current === key) return;
    lastTick.current = key;
    playPicturesSound('tick');
  }, [open, left, g.countdownEndsAt]);
  return (
    <header className="pc-top">
      <div className="pc-top-logo">
        Retratim<small>sala {view.code} · cartolina~</small>
      </div>
      <div className="pc-info">
        {g.phase === 'gameover' ? (
          <b>fim de jogo</b>
        ) : (
          <>
            rodada <b>{g.round + 1}</b> de {g.rounds} · seu kit
            <span className="kit">{myKit ? KIT_NAMES[myKit] : '—'}</span>
          </>
        )}
      </div>
      <div className="pc-seals">
        {g.players.map((p) => {
          const seat = view.seats.find((s) => s.id === p);
          if (!seat) return null;
          const label = seatLabel(g, seat) || pts((scores ?? g.scores)[p] ?? 0);
          const mine = plus.filter((x) => x.player === p);
          return (
            <div key={p} className={`pc-seal${p === me ? ' me' : ''}${mine.length ? ' bump' : ''}`} data-p={p}>
              <span className="cr">
                <Critter color={seat.color} />
              </span>
              <span>
                <span className="nm">{seat.name}</span>
                <span className={`stt${label.endsWith('✓') ? ' ok' : ''}`}>{label}</span>
              </span>
              {mine.map((x) => (
                <span key={x.id} className="pc-plus" aria-hidden="true">
                  +{x.n}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {open && g.paused ? (
        <div className="pc-clock on">esperando gente</div>
      ) : (
        open &&
        left !== null && (
          <div className={`pc-clock on${left <= 10 ? ' hurry' : ''}`} role="timer">
            faltam {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </div>
        )
      )}
      {canHurry && (
        <button className="pc-hurry" type="button" title="começa a contagem de 30 s pra quem falta" onClick={onHurry}>
          apressar
        </button>
      )}
      <SoundButton />
    </header>
  );
}
