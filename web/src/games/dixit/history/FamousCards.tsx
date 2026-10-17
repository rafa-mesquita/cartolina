import { Critter } from '../../../screens/Critter';
import { clueText } from './format';
import { FAMOUS, type CardItem, type FamousKey } from './groups';
import { HistoryCard } from './HistoryCard';

interface Props {
  items: Record<FamousKey, CardItem[]>;
  onOpen: (group: string, index: number) => void;
}

/** Quatro faixas de cartas (rolam pro lado no celular), sempre com a pintura. */
export function FamousCards({ items, onOpen }: Props) {
  return (
    <section className="dxh-famous">
      <h2>cartas famosas</h2>
      {FAMOUS.map(({ key, title }) => (
        <section key={key} aria-label={title}>
          <h3>{title}</h3>
          {items[key].length === 0 ? (
            <p className="muted">ainda nenhuma carta aqui</p>
          ) : (
            <div className="dxh-strip">
              {items[key].map((it, i) => (
                <div key={`${it.card}-${i}`} className={it.clue === undefined ? 'dxh-item' : 'dxh-item wide'}>
                  <HistoryCard card={it.card} group={key} index={i} label={it.label} badge={it.badge} onOpen={onOpen} />
                  {it.clue !== undefined && <p className={it.clue.trim() ? 'dxh-cap' : 'dxh-cap muted'}>{clueText(it.clue)}</p>}
                  {it.teller && (
                    <span className="dxh-who">
                      <Critter color={it.teller.color} />
                      {it.teller.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
