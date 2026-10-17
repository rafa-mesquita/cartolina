import type { ItoRoomView } from '@cartolina/shared';
import { Fragment, useCallback, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { Critter } from '../../screens/Critter';
import { slotTargets } from './phoneRowLogic';
import './phone.css';

/** Folga (px) pra considerar a fila "no pé": arredondamento de rolagem em telas com densidade fracionária. */
const BOTTOM_SLACK_PX = 4;

export interface PhoneRowProps {
  view: ItoRoomView;
  /** Fila mostrada (do servidor + minha intenção pendente), na ordem do servidor: do 1 ao 100. */
  row: readonly string[];
  /**
   * Fila em ordem de servidor com as minhas intenções aplicadas: dá o índice do `place` do "aqui".
   * Sem ela, usa a do servidor (`view.game.row`).
   */
  placeBase?: readonly string[];
  /** Carta selecionada pra mover/colocar (da mão ou da fila), ou null. */
  selected: string | null;
  /** Vãos de arrastos (meu ou de outros), em posição na fila mostrada (0 = antes da menor, embaixo de tudo na tela). */
  gaps: ReadonlyArray<{ owner: string; pos: number }>;
  /** Cartas sendo carregadas (ficam translúcidas). */
  carried: ReadonlySet<string>;
  /** Quantas cartas da revelação já viraram (0 fora da revelação). */
  shown: number;
  onPick(cardId: string): void;
  onTarget(index: number): void;
  /** "voltar pra mão" (só aparece com uma carta minha da fila selecionada). */
  onReturn(cardId: string): void;
  /** Liga o arrasto nas faixas (`usePhoneDrag`). O toque curto continua sendo clique. */
  onPointerDown?(e: ReactPointerEvent, cardId: string): void;
  /** O contêiner que rola: o arrasto mede as faixas e rola por ele. */
  listRef?: Ref<HTMLDivElement>;
}

/**
 * Fila em pé: 100 no topo, 1 embaixo (perto da mão). Cada carta é uma faixa com o bichinho do dono e a dica.
 * Os dados seguem na ordem do servidor (do 1 ao 100); só o desenho é invertido, e no DOM (não com
 * `column-reverse`) pra o leitor de tela ler na mesma ordem da tela.
 */
export function PhoneRow({ view, row, placeBase, selected, gaps, carried, shown, onPick, onTarget, onReturn, onPointerDown, listRef }: PhoneRowProps) {
  const colorOf = (owner: string) => view.seats.find((s) => s.id === owner)?.color ?? '#D9C2A0';
  const reveal = view.game.phase === 'reveal' ? (view.game.reveal ?? []) : [];
  const revealed = new Map(reveal.slice(0, shown).map((e) => [e.cardId, e]));
  const targets = selected ? slotTargets(row, selected, placeBase ?? view.game.row) : [];
  const targetAt = (pos: number) => targets.find((t) => t.pos === pos);
  const gapsAt = (pos: number) => gaps.filter((g) => g.pos === pos);
  const mineSelectedInRow = selected !== null && row.includes(selected) && view.game.cards[selected]?.owner === view.you;

  const box = useRef<HTMLDivElement | null>(null);
  const setBox = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      if (typeof listRef === 'function') listRef(el);
      else if (listRef) listRef.current = el;
    },
    [listRef],
  );
  /** Tamanho da fila na última pintura (conteúdo e janela), pra saber se ela estava no pé antes de mudar. */
  const size = useRef<{ h: number; ch: number } | null>(null);
  // Começa no pé (o lado do 1, colado na mão, onde a carta nova costuma entrar) e fica no pé quando a fila muda de
  // tamanho (faixa nova, vão, barra de baixo abrindo). Quem subiu pra olhar o lado do 100 não é puxado de volta.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const prev = size.current;
    const now = { h: el.scrollHeight, ch: el.clientHeight };
    size.current = now;
    if (prev && prev.h === now.h && prev.ch === now.ch) return;
    if (!prev || el.scrollTop + prev.ch >= prev.h - BOTTOM_SLACK_PX) el.scrollTop = now.h;
  });

  const nameOf = (owner: string) => view.seats.find((s) => s.id === owner)?.name ?? '';
  // Pra leitor de tela: o "aqui" fica logo acima da carta anterior na fila (a menor ao lado dele).
  const hintAt = (pos: number) => {
    const below = pos > 0 ? view.game.cards[row[pos - 1] ?? ''] : undefined;
    if (!below) return 'embaixo de tudo (menor)';
    return `acima de ${below.clue.trim() || `carta de ${nameOf(below.owner)}`}`;
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

  // De cima pra baixo: o espaço depois da maior, e cada faixa (da maior pra menor) seguida do espaço logo antes dela.
  const strips = row.map((_, i) => row.length - 1 - i);
  return (
    <div ref={setBox} className="p-row" role="group" aria-label="fila de cartas">
      <p className="p-end">
        <b>100</b> · {view.game.theme?.max ?? ''}
      </p>
      {slot(row.length)}
      {strips.map((i) => {
        const id = row[i]!;
        const card = view.game.cards[id];
        if (!card) return slot(i);
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
              onPointerDown={onPointerDown ? (e) => onPointerDown(e, id) : undefined}
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
            {slot(i)}
          </Fragment>
        );
      })}
      <p className="p-end">
        <b>1</b> · {view.game.theme?.min ?? ''}
      </p>
      {mineSelectedInRow && (
        <button type="button" className="sbtn p-return" onClick={() => onReturn(selected)}>
          voltar pra mão
        </button>
      )}
    </div>
  );
}
