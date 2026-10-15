import type { ItoOutcome, RoomView } from '@cartolina/shared';
import { useEffect, useRef, useState } from 'react';
import { isHost } from '../game/derive';
import type { GameConn } from '../net/connection';
import { confetti } from './confetti';

export function resultCopy(outcome: ItoOutcome, level: number, errors: number): { win: boolean; title: string; sub: string; next: string } {
  const wrong = `${errors} carta${errors === 1 ? '' : 's'} fora de ordem`;
  switch (outcome) {
    case 'round_won':
      return { win: true, title: 'vitória', sub: 'a fila tá perfeitinha, que sintonia!', next: 'nova rodada' };
    case 'round_lost':
      return { win: false, title: 'xi, errou essa', sub: wrong, next: 'nova rodada' };
    case 'level_cleared':
      return { win: true, title: `nível ${level} ✓`, sub: errors ? `${wrong}, mas ainda tem vida!` : 'sem errar nenhuma!', next: 'próximo nível' };
    case 'won':
      return { win: true, title: 'zeraram a campanha', sub: 'os três níveis, que time!', next: 'voltar pro lobby' };
    case 'lost':
      return { win: false, title: 'acabaram as vidas', sub: wrong, next: 'voltar pro lobby' };
  }
}

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ResultBanner({ view, conn }: { view: RoomView; conn: GameConn }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // "ver a mesa": esconde véu, banner e confete pra olhar a fila revelada; a pílula traz de volta.
  const [peek, setPeek] = useState(false);
  const outcome = view.game.outcome ?? 'round_lost';
  const errors = view.game.reveal?.filter((e) => e.error).length ?? 0;
  const copy = resultCopy(outcome, view.game.level, errors);
  const finished = outcome === 'won' || outcome === 'lost';

  useEffect(() => (copy.win && !peek ? confetti(canvas.current) : undefined), [copy.win, peek]);

  if (peek) {
    return (
      <button className="peek-pill" type="button" onClick={() => setPeek(false)}>
        {copy.title} · ver resultado
      </button>
    );
  }

  const eye = (
    <button className="sbtn eye" type="button" aria-label="ver a mesa" title="ver a mesa" onClick={() => setPeek(true)}>
      <EyeIcon />
    </button>
  );

  return (
    <>
      <div className="veil" />
      <div className={`banner ${copy.win ? 'win' : ''}`} role="dialog" aria-label={copy.title}>
        <div className="b-title">
          {copy.title}
          {copy.win && <span>~</span>}
        </div>
        <div className="b-sub">{copy.sub}</div>
        {isHost(view) ? (
          <div className="b-actions">
            <button className="btn" type="button" onClick={() => conn.sendAction({ type: 'next' })}>
              {copy.next}
            </button>
            {!finished && (
              <button className="sbtn" type="button" onClick={() => conn.sendAction({ type: 'lobby' })}>
                voltar pro lobby
              </button>
            )}
            {eye}
          </div>
        ) : (
          <div className="b-actions">
            <p className="hint">esperando o host…</p>
            {eye}
          </div>
        )}
      </div>
      <canvas className="confetti" ref={canvas} />
    </>
  );
}
