import { CardArt } from '../CardArt';

interface Props {
  card: string;
  /** Faixa ou partida onde a carta está: a carta ampliada navega dentro dela. */
  group: string;
  index: number;
  label: string;
  badge?: string;
  onOpen: (group: string, index: number) => void;
}

/** Miniatura de carta do histórico. Clique abre a carta ampliada; a rodinha pra cima é tratada no painel (pelos `data-*`). */
export function HistoryCard({ card, group, index, label, badge, onOpen }: Props) {
  return (
    <button
      type="button"
      className="dxh-card"
      aria-label={label}
      aria-haspopup="dialog"
      data-card-id={card}
      data-group={group}
      data-index={index}
      onClick={() => onOpen(group, index)}
    >
      <CardArt id={card} />
      {badge && <span className="dxh-seal">{badge}</span>}
    </button>
  );
}
