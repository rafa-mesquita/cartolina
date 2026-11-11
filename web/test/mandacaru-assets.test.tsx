import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { City, CordelIcon, Hex, House, PLAYER_TINTS, Port, ResIcon, portPlacement } from '../src/games/mandacaru/art';
import { CORDEL_ART, FUNDO_ART, PIECE_ART, RES_ART, TERRAIN_ART, allArtUrls, cordelArtUrl } from '../src/games/mandacaru/assets';

const base = import.meta.env.BASE_URL;

describe('Mandacaru: artes do Flow', () => {
  // os testes de "sem arte" mexem nos mapas: guarda e devolve
  let res: typeof RES_ART;
  let cordel: typeof CORDEL_ART;
  beforeEach(() => {
    res = { ...RES_ART };
    cordel = { ...CORDEL_ART };
  });
  afterEach(() => {
    for (const k of Object.keys(RES_ART)) delete RES_ART[k as keyof typeof RES_ART];
    for (const k of Object.keys(CORDEL_ART)) delete CORDEL_ART[k as keyof typeof CORDEL_ART];
    Object.assign(RES_ART, res);
    Object.assign(CORDEL_ART, cordel);
  });

  it('as URLs saem da base do site; todas as artes no mapa', () => {
    expect(FUNDO_ART).toBe(`${base}mandacaru/fundo.webp`);
    expect(TERRAIN_ART.hills).toBe(`${base}mandacaru/terrenos/hills.webp`);
    expect(PIECE_ART.casa).toBe(`${base}mandacaru/pecas/casa.webp`);
    expect(RES_ART.leather).toBe(`${base}mandacaru/recursos/leather.webp`);
    expect(CORDEL_ART['point-5']).toBe(`${base}mandacaru/cordeis/point-5.webp`);
    // fundo + 6 terrenos + 4 peças + 5 recursos + 4 cordéis + 5 Pontos
    expect(allArtUrls()).toHaveLength(1 + 6 + 4 + 5 + 4 + 5);
  });

  it('terreno: <image> com a arte do terreno, recortada no hexágono', () => {
    const { container } = render(
      <svg>
        <Hex tile={{ terrain: 'mountains', number: 5 }} cx={0} cy={0} />
      </svg>,
    );
    const img = container.querySelector('image');
    expect(img?.getAttribute('href')).toBe(`${base}mandacaru/terrenos/mountains.webp`);
    expect(img?.getAttribute('clip-path')).toBe('url(#mc-hexclip)');
  });

  it('casa e vila: arte por cima de uma base na cor do dono', () => {
    const { container } = render(
      <svg>
        <g data-t="casa">
          <House x={0} y={0} color={PLAYER_TINTS[1]!} />
        </g>
        <g data-t="vila">
          <City x={0} y={0} color={PLAYER_TINTS[3]!} />
        </g>
      </svg>,
    );
    expect(container.querySelector('[data-t="casa"] .mc-base')?.getAttribute('fill')).toBe('#2f6fa8');
    expect(container.querySelector('[data-t="casa"] image')?.getAttribute('href')).toBe(PIECE_ART.casa);
    expect(container.querySelector('[data-t="vila"] .mc-base')?.getAttribute('fill')).toBe('#f4efe3');
    expect(container.querySelector('[data-t="vila"] image')?.getAttribute('href')).toBe(PIECE_ART.vila);
  });

  it('feira: a barraca é a arte, com o selo da taxa e o recurso', () => {
    const { container } = render(
      <svg>
        <Port kind="beans" {...portPlacement(0)} />
      </svg>,
    );
    const hrefs = [...container.querySelectorAll('image')].map((i) => i.getAttribute('href'));
    expect(hrefs).toEqual([PIECE_ART.feira, RES_ART.beans]);
    expect(container.textContent).toContain('2:1');
  });

  it('ResIcon e CordelIcon usam a imagem do mapa', () => {
    const { container } = render(
      <div>
        <ResIcon kind="wood" />
        <CordelIcon kind="point" point={2} />
        <CordelIcon kind="vaqueiro" />
      </div>,
    );
    const imgs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(imgs).toEqual([RES_ART.wood, CORDEL_ART['point-3'], CORDEL_ART.vaqueiro]);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('sem entrada no mapa, ResIcon e CordelIcon caem no desenho SVG', () => {
    delete RES_ART.wood;
    delete CORDEL_ART['point-3'];
    const { container } = render(
      <div>
        <ResIcon kind="wood" />
        <CordelIcon kind="point" point={2} />
      </div>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
  });

  it('cordelArtUrl: Pontos por índice de POINT_NAMES (point-1..5)', () => {
    expect(cordelArtUrl('point')).toBe(CORDEL_ART['point-1']);
    expect(cordelArtUrl('point', 4)).toBe(CORDEL_ART['point-5']);
    expect(cordelArtUrl('point', 9)).toBe(CORDEL_ART['point-5']);
    expect(cordelArtUrl('chuva')).toBe(CORDEL_ART.chuva);
  });
});
