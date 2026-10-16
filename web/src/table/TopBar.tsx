import { CAMPAIGN_LIVES, type ItoRoomView } from '@cartolina/shared';
import { useEffect, useRef, useState } from 'react';
import { catalogEntry } from '../games/catalog';
import { gameHash, roomLink } from '../lib/router';

const COPIED_MS = 2000;

export function TopBar({ view }: { view: ItoRoomView }) {
  const { mode, level, lives } = view.game;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(roomLink(view.code));
    } catch {
      return; // sem clipboard (http fora de localhost) ou sem permissão: o link também está no lobby
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }
  return (
    <div className="topbar">
      <div className="brandcol">
        <div className="logo">
          cartolina<span>~</span>
        </div>
        {/* Embaixo do logo, e não nas pílulas: ali ele empurraria as pílulas por cima dos assentos de cima. */}
        {catalogEntry(view.gameId)?.hasHistory && (
          <a className="histlink" href={gameHash(view.gameId, 'historico')} target="_blank" rel="noopener" title="histórico do jogo">
            📜 histórico
          </a>
        )}
      </div>
      <div className="pills">
        <button className="pill code" type="button" onClick={() => void copy()} title="copiar link da sala">
          {copied ? 'copiado!' : `sala ${view.code}`}
        </button>
        <span className="pill">{mode === 'livre' ? 'modo livre' : `campanha · nível ${level}`}</span>
        {mode === 'campanha' && (
          <span className="pill lives" role="img" aria-label={`${lives} ${lives === 1 ? 'vida' : 'vidas'}`}>
            {Array.from({ length: CAMPAIGN_LIVES }, (_, i) => (
              <i key={i} className={i < lives ? '' : 'lost'}>
                ♥
              </i>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
