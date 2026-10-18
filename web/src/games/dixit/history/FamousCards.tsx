import { useId } from 'react';
import { Critter } from '../../../screens/Critter';
import { clueText } from './format';
import { FAMOUS, type CardItem, type FamousKey } from './groups';
import { HistoryCard } from './HistoryCard';

type OnOpen = (group: string, index: number) => void;

interface Props {
  items: Record<FamousKey, CardItem[]>;
  onOpen: OnOpen;
}

function Strip({ group, title, items, onOpen }: { group: FamousKey; title: string; items: CardItem[]; onOpen: OnOpen }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">ainda nenhuma carta aqui</p>
      ) : (
        <ul className="dxh-strip">
          {items.map((it, i) => (
            <li key={`${it.card}-${i}`} className={it.clue === undefined ? 'dxh-item' : 'dxh-item wide'}>
              <HistoryCard card={it.card} group={group} index={i} label={it.label} badge={it.badge} onOpen={onOpen} />
              {it.clue !== undefined && <p className={it.clue.trim() ? 'dxh-cap' : 'dxh-cap muted'}>{clueText(it.clue)}</p>}
              {it.teller && (
                <span className="dxh-who">
                  <Critter color={it.teller.color} />
                  {it.teller.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quatro faixas de cartas (rolam pro lado no celular), sempre com a pintura. */
export function FamousCards({ items, onOpen }: Props) {
  const titleId = useId();
  return (
    <section className="dxh-famous" aria-labelledby={titleId}>
      <h2 id={titleId}>cartas famosas</h2>
      {FAMOUS.map(({ key, title }) => (
        <Strip key={key} group={key} title={title} items={items[key]} onOpen={onOpen} />
      ))}
    </section>
  );
}
