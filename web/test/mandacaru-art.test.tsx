import { mandacaruGeometry } from '@cartolina/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  BADGE_R,
  BoardDefs,
  Border,
  Carcara,
  City,
  CordelIcon,
  DiceFace,
  Hex,
  House,
  INK,
  MandacaruLogo,
  NumberToken,
  PLAYER_TINTS,
  Port,
  R,
  RIM,
  ResBadge,
  ResIcon,
  Road,
  at,
  portPlacement,
} from '../src/games/mandacaru/art';

describe('Mandacaru: arte', () => {
  it('desenha defs, terreno e ficha; o 8 sai vermelho e o 4 na tinta', () => {
    const { container } = render(
      <svg>
        <BoardDefs />
        <Hex tile={{ terrain: 'fields', number: 8 }} cx={0} cy={0} />
        <NumberToken number={8} cx={0} cy={0} />
        <NumberToken number={4} cx={100} cy={0} />
      </svg>,
    );
    const texts = [...container.querySelectorAll('text')];
    expect(texts.find((t) => t.textContent === '8')?.getAttribute('fill')).toBe('#b8321f');
    expect(texts.find((t) => t.textContent === '4')?.getAttribute('fill')).toBe(INK);
    // ids das defs com prefixo mc- (não colidem com as outras mesas)
    const ids = [...container.querySelectorAll('defs [id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ids) expect(id.startsWith('mc-')).toBe(true);
    expect(container.innerHTML).toContain('url(#mc-som)');
  });

  it('bolinhas de chance: 5 no 8, 1 no 2', () => {
    const { container } = render(
      <svg>
        <g data-n="8">
          <NumberToken number={8} cx={0} cy={0} />
        </g>
        <g data-n="2">
          <NumberToken number={2} cx={0} cy={0} />
        </g>
      </svg>,
    );
    // o disco e o aro também são círculos (2); o resto são as bolinhas
    expect(container.querySelectorAll('[data-n="8"] circle').length - 2).toBe(5);
    expect(container.querySelectorAll('[data-n="2"] circle').length - 2).toBe(1);
  });

  it('as 4 cores dos jogadores do estilo D', () => {
    expect(PLAYER_TINTS).toEqual(['#b8321f', '#2f6fa8', '#7b4a9a', '#f4efe3']);
    expect(R).toBe(58);
  });

  it('borda de terra rachada rente à costa: um contorno e uma faixa por terreno da ilha (19 + 19)', () => {
    const { container } = render(
      <svg>
        <Border />
      </svg>,
    );
    expect(container.querySelectorAll('path')).toHaveLength(38);
    expect(container.querySelectorAll('path[fill="url(#mc-racha)"]')).toHaveLength(19);
  });

  it('aro forte por recurso: 6 cores diferentes entre si e das cores dos jogadores', () => {
    const colors = Object.values(RIM).map((c) => c.toLowerCase());
    expect(new Set(colors).size).toBe(6);
    for (const c of colors) expect(PLAYER_TINTS.map((t) => t.toLowerCase())).not.toContain(c);
    // o terreno usa o aro e a pintura clareada
    const { container } = render(
      <svg>
        <Hex tile={{ terrain: 'forest', number: 5 }} cx={0} cy={0} />
      </svg>,
    );
    expect(container.querySelector(`path[fill="${RIM.forest}"]`)).toBeTruthy();
    expect(container.querySelector('image')?.getAttribute('filter')).toBe('url(#mc-claro)');
  });

  it('selo do recurso: disco creme com a arte e o nome (dica do mouse e leitor de tela)', () => {
    const { container } = render(
      <svg>
        <ResBadge kind="beans" cx={0} cy={0} />
      </svg>,
    );
    const disc = container.querySelector('[data-selo="beans"] circle')!;
    expect(Number(disc.getAttribute('r'))).toBe(BADGE_R);
    expect(disc.getAttribute('fill')).toBe('#fbf1dc');
    expect(screen.getByRole('img', { name: 'feijão' })).toBeTruthy();
    expect(container.querySelector('[data-selo="beans"] title')?.textContent).toBe('feijão');
  });

  it('ícone de recurso tem o nome: dica nativa e nome acessível', () => {
    render(
      <div>
        <ResIcon kind="wood" />
        <ResIcon kind="stone" size={20} />
      </div>,
    );
    const wood = screen.getByRole('img', { name: 'madeira' });
    expect(wood.getAttribute('title')).toBe('madeira');
    expect(screen.getByRole('img', { name: 'pedra' })).toBeTruthy();
  });

  it('feira: barraca fora da ilha, entre os dois cantos', () => {
    const g = mandacaruGeometry();
    const p = portPlacement(0);
    const hex = at(g.hexes[g.ports[0]!.hex]!);
    const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
    expect(Math.hypot(p.x - hex.x, p.y - hex.y)).toBeGreaterThan(Math.hypot(mid.x - hex.x, mid.y - hex.y));
    const { container } = render(
      <svg>
        <Port kind="generic" {...p} />
        <Port kind="stone" {...portPlacement(1)} />
      </svg>,
    );
    expect(container.textContent).toContain('3:1');
    expect(container.textContent).toContain('2:1');
  });

  it('peças, Carcará, dados e ícones desenham sem erro', () => {
    const { container } = render(
      <div>
        <svg>
          <Road a={{ x: 0, y: 0 }} b={{ x: 10, y: 10 }} color={PLAYER_TINTS[1]!} />
          <House x={0} y={0} color={PLAYER_TINTS[0]!} />
          <City x={0} y={0} color={PLAYER_TINTS[2]!} />
          <Carcara x={0} y={0} />
        </svg>
        <ResIcon kind="wood" size={30} />
        <CordelIcon kind="vaqueiro" size={30} />
        <MandacaruLogo size={40} />
      </div>,
    );
    expect(container.querySelectorAll('line[stroke="#2f6fa8"]')).toHaveLength(1);
    // o tabuleiro e o logo em SVG; recurso e cordel já com a arte do Flow
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('cada face do dado tem n pontos', () => {
    for (let n = 1; n <= 6; n++) {
      const { container, unmount } = render(
        <svg>
          <DiceFace n={n} />
        </svg>,
      );
      expect(container.querySelectorAll('circle')).toHaveLength(n);
      unmount();
    }
  });
});
