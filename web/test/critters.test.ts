import { PLAYER_COLORS } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { critterOf, critterSvg } from '../src/brand/critters';

describe('personagens', () => {
  it('cada cor de jogador tem um personagem com nome', () => {
    for (const c of PLAYER_COLORS) {
      expect(critterOf(c).name).not.toBe('jogador');
      expect(critterSvg(c)).toContain(`fill="${c}"`);
    }
  });

  it('cor desconhecida usa o personagem genérico sem injetar a entrada no SVG', () => {
    const evil = '"/><script>alert(1)</script><x a="';
    const svg = critterSvg(evil);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('alert');
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg).toContain('fill="#D9C2A0"');
  });

  it('cor hexadecimal válida fora da paleta ainda é usada no genérico', () => {
    expect(critterSvg('#123abc')).toContain('fill="#123abc"');
  });

  it('memoiza por cor', () => {
    expect(critterSvg('#8EC5FF')).toBe(critterSvg('#8EC5FF'));
  });
});
