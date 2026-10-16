import type { CSSProperties, KeyboardEvent } from 'react';
import { Critter } from '../../screens/Critter';
import { CardArt, CardBack } from './CardArt';
import { ROMAN } from './geometry';
import type { Loose } from './useLooseSpots';

/** Enter e Espaço fazem o mesmo que o clique (nas cartas com `role="button"`). */
const activate = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  fn();
};

/** Carta virada solta no feltro (fase de escolha). Com `onUndo`, é sua e espera a 2ª: clicar devolve pra mão. */
export function LooseCard({ looseKey, loose, onUndo }: { looseKey: string; loose: Loose; onUndo?: () => void }) {
  const [x, y, rz] = loose.spot;
  return (
    <div
      className={`dx-tcard loose down${onUndo ? ' pending' : ''}`}
      style={{ left: x, top: y, zIndex: 3 + loose.z, '--rz': `${rz}deg` } as CSSProperties}
      data-loose={looseKey}
      {...(onUndo ? { role: 'button', tabIndex: 0, 'aria-label': 'devolver sua carta pra mão', onClick: onUndo, onKeyDown: activate(onUndo) } : {})}
    >
      <div className="dx-flip">
        <div className="dx-face dx-backside">
          <CardBack />
        </div>
      </div>
    </div>
  );
}

interface TableCardProps {
  cardId: string;
  index: number;
  /** [x, y, giro]: a casa da votação, ou o lugar solto enquanto espera a arrumação. */
  at: readonly [number, number, number];
  /** Ainda no lugar solto (antes de deslizar): altura na pilha. */
  lying: Loose | null;
  /** Chave da solta que virou esta carta (só durante a votação, pra animação de chegada). */
  looseKey?: string;
  gather: boolean;
  /** Virada pra baixo (arrumação): não responde a clique nem teclado. */
  faceDown: boolean;
  flipIn: boolean;
  voted: boolean;
  mine: boolean;
  story: boolean;
  spotlight: boolean;
  tokens: readonly { voter: string; color: string; name: string }[];
  /** Selo do dono (dentro da carta, no topo). */
  owner: { color: string; name: string; me: boolean } | null;
  onCard: (cardId: string) => void;
  onZoom: (cardId: string) => void;
}

/** Carta da votação/revelação: frente e verso, numeral no canto, votos embaixo e o dono no topo. */
export function TableCard(p: TableCardProps) {
  const [x, y, rz] = p.at;
  const cls = [
    'dx-tcard',
    p.lying && 'loose',
    p.gather && 'gather',
    p.faceDown && 'down',
    p.flipIn && 'flip-in',
    p.voted && 'voted',
    p.story && 'story',
    p.story && p.spotlight && 'spot',
    p.spotlight && !p.story && 'dim',
  ]
    .filter(Boolean)
    .join(' ');
  const act = () => {
    if (!p.faceDown) p.onCard(p.cardId);
  };
  return (
    <div
      className={cls}
      style={{ left: x, top: y, zIndex: p.lying ? 3 + p.lying.z : undefined, '--rz': `${rz}deg`, '--i': p.index } as CSSProperties}
      role="button"
      tabIndex={p.faceDown ? -1 : 0}
      aria-disabled={p.faceDown || undefined}
      aria-label={`carta ${ROMAN[p.index]}`}
      data-card-id={p.cardId}
      data-zoom="table"
      data-loose={p.looseKey}
      onClick={act}
      onKeyDown={activate(act)}
      onDoubleClick={() => {
        if (!p.faceDown) p.onZoom(p.cardId);
      }}
    >
      <div className="dx-flip">
        <div className="dx-face">
          <CardArt id={p.cardId} />
          {p.mine && !p.owner && <span className="dx-mine">sua</span>}
          {p.tokens.length > 0 && (
            <div className="dx-tokens">
              {p.tokens.map((v) => (
                <span key={v.voter} title={v.name}>
                  <Critter color={v.color} />
                </span>
              ))}
            </div>
          )}
          {p.owner && (
            <div className={`dx-owner${p.owner.me ? ' me' : ''}`}>
              <Critter color={p.owner.color} />
              {p.owner.name}
            </div>
          )}
        </div>
        <div className="dx-face dx-backside">
          <CardBack />
        </div>
      </div>
      {p.story && <div className="dx-tag-story">carta do narrador</div>}
      <div className="dx-roman">{ROMAN[p.index]}</div>
      {!p.faceDown && (
        <button
          type="button"
          className="dx-zoom"
          aria-label="ampliar"
          onClick={(e) => {
            e.stopPropagation();
            p.onZoom(p.cardId);
          }}
        >
          ⤢
        </button>
      )}
    </div>
  );
}
