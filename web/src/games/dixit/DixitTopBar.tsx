import type { DixitRoomView } from '@cartolina/shared';
import { useState } from 'react';
import { gameHash } from '../../lib/router';
import { loadSoundPref, saveSoundPref } from '../../net/identity';
import { Critter } from '../../screens/Critter';
import { phaseLabel } from './status';

/** A partir daqui a dica ganha letra menor (numa linha da pílula cabem uns 35 caracteres). */
const LONG_CLUE = 32;

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
      {/* Embaixo do logo, e não nas pílulas: ali ele apertaria a dica do narrador. */}
      <a className="dx-histlink" href={gameHash('dixit', 'historico')} target="_blank" rel="noopener" title="histórico do Diquisti">
        <span aria-hidden="true">📜</span> histórico
      </a>
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
          // Dica longa quebra em até 3 linhas com letra menor (cabe a dica toda, 80 caracteres); o title mostra inteira.
          <span className={g.clue.length > LONG_CLUE ? 'txt long' : 'txt'} title={g.clue}>
            “{g.clue}”
          </span>
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
