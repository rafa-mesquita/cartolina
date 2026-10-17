import type { ItoRoomView } from '@cartolina/shared';
import { Fragment, type CSSProperties } from 'react';
import { Critter } from '../../screens/Critter';
import { slotTargets } from './phoneRowLogic';
import './phone.css';

export interface PhoneRowProps {
  view: ItoRoomView;
  /** Fila mostrada (do servidor + minha intenção pendente). */
  row: readonly string[];
  /** Carta selecionada pra mover/colocar (da mão ou da fila), ou null. */
  selected: string | null;
  /** Vãos de arrastos (meu ou de outros), em posição visual. */
  gaps: ReadonlyArray<{ owner: string; pos: number }>;
  /** Cartas sendo carregadas (ficam translúcidas). */
  carried: ReadonlySet<string>;
  /** Quantas cartas da revelação já viraram (0 fora da revelação). */
  shown: number;
  onPick(cardId: string): void;
  onTarget(index: number): void;
  /** "voltar pra mão" (só aparece com uma carta minha da fila selecionada). */
  onReturn(cardId: string): void;
}

/** Fila em pé: 1 no topo, 100 embaixo. Cada carta é uma faixa com o bichinho do dono e a dica. */
export function PhoneRow({ view, row, selected, gaps, carried, shown, onPick, onTarget, onReturn }: PhoneRowProps) {
  const colorOf = (owner: string) => view.seats.find((s) => s.id === owner)?.color ?? '#D9C2A0';
  const reveal = view.game.phase === 'reveal' ? (view.game.reveal ?? []) : [];
  const revealed = new Map(reveal.slice(0, shown).map((e) => [e.cardId, e]));
  const targets = selected ? slotTargets(row, selected, view.game.row) : [];
  const targetAt = (pos: number) => targets.find((t) => t.pos === pos);
  const gapsAt = (pos: number) => gaps.filter((g) => g.pos === pos);
  const mineSelectedInRow = selected !== null && row.includes(selected) && view.game.cards[selected]?.owner === view.you;

  const nameOf = (owner: string) => view.seats.find((s) => s.id === owner)?.name ?? '';
  // Pra leitor de tela: depois de qual carta o "aqui" fica.
  const hintAt = (pos: number) => {
    const prev = pos > 0 ? view.game.cards[row[pos - 1] ?? ''] : undefined;
    if (!prev) return 'no começo';
    return `depois de ${prev.clue.trim() || `carta de ${nameOf(prev.owner)}`}`;
  };

  const slot = (pos: number) => {
    const target = targetAt(pos);
    return (
      <Fragment key={`s${pos}`}>
        {gapsAt(pos).map((g) => (
          <div key={g.owner} className="p-gap" style={{ '--c': colorOf(g.owner) } as CSSProperties} aria-hidden="true" />
        ))}
        {target && (
          <button type="button" className="p-here" data-sound="click" aria-label={`colocar aqui, ${hintAt(pos)}`} onClick={() => onTarget(target.index)}>
            aqui
          </button>
        )}
      </Fragment>
    );
  };

  return (
    <div className="p-row" role="group" aria-label="fila de cartas">
      <p className="p-end">
        <b>1</b> · {view.game.theme?.min ?? ''}
      </p>
      {slot(0)}
      {row.map((id, i) => {
        const card = view.game.cards[id];
        if (!card) return slot(i + 1);
        const r = revealed.get(id);
        return (
          <Fragment key={id}>
            <button
              type="button"
              data-card={id}
              data-sound="none"
              className={`p-strip${selected === id ? ' sel' : ''}${carried.has(id) ? ' carried' : ''}${card.owner === view.you ? ' mine' : ''}${r?.error ? ' err' : ''}`}
              style={{ '--c': colorOf(card.owner) } as CSSProperties}
              aria-pressed={selected === id}
              onClick={() => onPick(id)}
            >
              <span className="p-badge">
                <Critter color={colorOf(card.owner)} />
              </span>
              <span className="p-clue">{card.clue.trim() || '…'}</span>
              <span className="sr-only">{card.owner === view.you ? 'sua carta' : `de ${nameOf(card.owner)}`}</span>
              {r && <span className="p-num">{r.value}</span>}
              {r?.error && (
                <span className="p-x" role="img" aria-label="fora de ordem">
                  ✕
                </span>
              )}
            </button>
            {slot(i + 1)}
          </Fragment>
        );
      })}
      <p className="p-end">
        <b>100</b> · {view.game.theme?.max ?? ''}
      </p>
      {mineSelectedInRow && (
        <button type="button" className="sbtn p-return" onClick={() => onReturn(selected)}>
          voltar pra mão
        </button>
      )}
    </div>
  );
}
