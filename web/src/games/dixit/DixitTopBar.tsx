import type { DixitRoomView } from '@cartolina/shared';
import { useState } from 'react';
import { loadSoundPref, saveSoundPref } from '../../net/identity';
import { Critter } from '../../screens/Critter';
import { phaseLabel } from './status';

/** Liga/desliga o som (mesma preferência do DITU). */
export function SoundPill() {
  const [on, setOn] = useState(loadSoundPref);
  return (
    <button
      className="dx-pill"
      type="button"
      aria-pressed={on}
      onClick={() => {
        saveSoundPref(!on);
        setOn(!on);
      }}
    >
      som: {on ? 'ligado' : 'desligado'}
    </button>
  );
}

interface Props {
  view: DixitRoomView;
  name: (id: string) => string;
  color: (id: string) => string;
  tilt: boolean;
  onTilt: () => void;
  host: boolean;
  onForce: () => void;
}

/** Logo, dica do narrador e pílulas (fase, som, mesa 3D, destravar). */
export function DixitTopBar({ view, name, color, tilt, onTilt, host, onForce }: Props) {
  const g = view.game, st = g.storyteller;
  const inRound = g.phase === 'storytelling' || g.phase === 'submitting' || g.phase === 'voting';
  return (
    <>
      <h1 className="dx-logo">
        diquisti<small>sala {view.code} · cartolina~</small>
      </h1>
      <div className="dx-clue">
        {st && g.phase !== 'gameover' && (
          <span className="who">
            <Critter color={color(st)} />
          </span>
        )}
        {g.phase === 'gameover' ? (
          <span className="txt muted">fim de jogo</span>
        ) : !st ? (
          <span className="txt muted" />
        ) : g.phase === 'storytelling' ? (
          <span className="txt muted">{st === view.you ? 'você narra esta rodada' : `${name(st)} narra esta rodada`}</span>
        ) : g.clue ? (
          <span className="txt">“{g.clue}”</span>
        ) : (
          <span className="txt muted">dica falada na call</span>
        )}
      </div>
      <div className="dx-pills">
        <span className="dx-pill">{phaseLabel(g)}</span>
        {host && inRound && !g.paused && (
          <button className="dx-pill" type="button" title="pula quem está travando a rodada" onClick={onForce}>
            destravar
          </button>
        )}
        <SoundPill />
        <button className="dx-pill" type="button" aria-pressed={tilt} onClick={onTilt}>
          mesa 3D: {tilt ? 'ligada' : 'desligada'}
        </button>
      </div>
    </>
  );
}
