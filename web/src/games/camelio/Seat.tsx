import type { CSSProperties } from 'react';
import { CAMELIO_COLORS, CAMELIO_EXACT, type CamelioCard, type CamelioColor, type CamelioView } from '@cartolina/shared';
import { Critter } from '../../screens/Critter';
import { CardFront } from './Card';
import { HEX } from './cardArt';
import { stackLayout } from './layout';

type Vars = CSSProperties & Record<`--${string}`, string>;

/** Cores pontuadas, na ordem em que entraram na área de pontos. */
export const scoredColors = (cards: readonly CamelioCard[]): CamelioColor[] => [...new Set(cards.map((c) => c.color))];

const ptsTxt = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;

/** Bandeirinha de uma cor pontuada. */
export function Flag({ color }: { color: CamelioColor }) {
  const style: Vars = { '--c': HEX[color] };
  return <span className="flag" data-color={color} style={style} title={`pontuou o ${color}`} aria-label={`pontuou o ${color}`} />;
}

/** Área de jogo: uma pilha por cor (na ordem de CAMELIO_COLORS), com a soma embaixo. */
function Stacks({ table, done, mine }: { table: readonly CamelioCard[]; done: readonly CamelioColor[]; mine: boolean }) {
  const colors = CAMELIO_COLORS.filter((color) => table.some((c) => c.color === color));
  if (!colors.length) {
    return (
      <div className="stacks empty">
        <span>mesa vazia</span>
      </div>
    );
  }
  // nos assentos dos outros a largura da carta sai da quantidade de cores, pra tudo caber nos 230px
  const lay = stackLayout(mine, colors.length);
  const style: Vars | undefined = mine ? undefined : { '--gap': `${lay.gap}px`, '--spad': `${lay.pad / 2}px`, '--sw': `${lay.w + lay.pad}px` };
  return (
    <div className={`stacks${!mine && lay.w < 40 ? ' small' : ''}`} style={style}>
      {colors.map((color) => {
        const cards = table.filter((c) => c.color === color);
        const sum = cards.reduce((n, c) => n + c.spheres, 0);
        const sc = done.includes(color);
        const hot = sum === CAMELIO_EXACT - 1;
        const tip = `${color}: ${sum} de ${CAMELIO_EXACT}${sc ? ' (já pontuado: chegar a 5 perde o ponto)' : ''}`;
        return (
          <div key={color} className={`stack${sc ? ' scored' : ''}`} data-color={color} title={tip}>
            <div className="pile">
              {cards.map((c) => (
                <CardFront key={c.id} card={c} w={lay.w} />
              ))}
            </div>
            <span className={`sum${hot ? ' hot' : ''}`}>{`${sum}/${CAMELIO_EXACT}${sc ? ' ⚑' : ''}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Espaço entre as cartas do leque da área de pontos. */
const FAN_STEP = 12;

/** Área de pontos da sua mesa: um leque de cartas de 40px por cor fechada. */
function Points({ scored, done, target }: { scored: readonly CamelioCard[]; done: readonly CamelioColor[]; target: number }) {
  return (
    <div className="pts">
      <div className="pts-h">
        pontos: <b>{done.length}</b> de {target}
      </div>
      <div className="fans">
        {done.length ? (
          done.map((color) => {
            const cs = scored.filter((c) => c.color === color);
            const n = cs.length;
            return (
              <div key={color} className="fan" data-color={color}>
                <Flag color={color} />
                <div className="leaf" style={{ width: 40 + (n - 1) * FAN_STEP }}>
                  {cs.map((c, i) => (
                    <span key={c.id} style={{ left: i * FAN_STEP, transform: `rotate(${((i - (n - 1) / 2) * 7).toFixed(1)}deg)` }}>
                      <CardFront card={c} w={40} />
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <span className="none">feche 5 esferas exatas de uma cor pra guardar ela aqui</span>
        )}
      </div>
    </div>
  );
}

interface Props {
  pid: string;
  /** A view desenhada (`shown` da fila de animação). */
  v: CamelioView;
  name: string;
  /** Cor do personagem. */
  color: string;
  /** A sua mesa (embaixo, com a área de pontos), em vez de um assento do arco. */
  mine?: boolean;
  /** Assento desconectado: apagado, com "caiu" no lugar das bandeirinhas. */
  off?: boolean;
  /** Posição no arco (só nos assentos dos outros). */
  style?: CSSProperties;
}

/** Um assento: cabeçalho (personagem, nome, bandeirinhas) e pilhas; na sua mesa, também a área de pontos. */
export function Seat({ pid, v, name, color, mine = false, off = false, style }: Props) {
  const table = v.table[pid] ?? [];
  const scored = v.scored[pid] ?? [];
  const done = scoredColors(scored);
  let cls = 'seat';
  if (mine) cls += ' me';
  if (v.phase === 'playing' && v.turn === pid) cls += ' turn';
  if (off) cls += ' off';
  const flags = off ? <span className="gone">caiu</span> : done.map((c) => <Flag key={c} color={c} />);
  if (mine) {
    return (
      <div className={cls} data-pid={pid} role="group" aria-label="sua mesa">
        <div className="who">
          <span className="cr">
            <Critter color={color} />
          </span>
          <span className="nm">{name}</span>
          <span className="flags">{flags}</span>
        </div>
        <Stacks table={table} done={done} mine />
        <Points scored={scored} done={done} target={v.target} />
      </div>
    );
  }
  return (
    <div className={cls} data-pid={pid} style={style} role="group" aria-label={`mesa de ${name}`} title={`${name} · ${ptsTxt(v.points[pid] ?? 0)}`}>
      <div className="head">
        <span className="cr">
          <Critter color={color} />
        </span>
        <span className="nm">{name}</span>
        <span className="flags">{flags}</span>
      </div>
      <Stacks table={table} done={done} mine={false} />
    </div>
  );
}
