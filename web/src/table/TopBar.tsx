import { CAMPAIGN_LIVES, type RoomView } from '@cartolina/shared';

export function TopBar({ view }: { view: RoomView }) {
  const { mode, level, lives } = view.game;
  const copy = () => void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/sala/${view.code}`);
  return (
    <div className="topbar">
      <div className="logo">
        cartolina<span>~</span>
      </div>
      <div className="pills">
        <button className="pill code" type="button" onClick={copy} title="copiar link da sala">
          sala {view.code}
        </button>
        <span className="pill">{mode === 'livre' ? 'modo livre' : `campanha · nível ${level}`}</span>
        {mode === 'campanha' && (
          <span className="pill lives" aria-label={`${lives} vidas`}>
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
