import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CAMELIO_DECK, camelioBack, camelioCard } from '@cartolina/shared';
import { CardBack, CardFront } from '../src/games/camelio/Card';
import { backHtml, frontHtml } from '../src/games/camelio/cardArt';

/** Parseia o HTML e devolve uma forma comparável: tags, classes, atributos e `style` como conjunto. */
function norm(html: string): unknown {
  const root = document.createElement('div');
  root.innerHTML = html.trim();
  const walk = (el: Element): unknown => {
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name === 'style') continue;
      attrs[a.name] = a.name === 'class' ? a.value.split(/\s+/).filter(Boolean).sort().join(' ') : a.value;
    }
    const style = (el.getAttribute('style') ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s*:\s*/, ':'))
      .sort();
    const kids = Array.from(el.childNodes).map((n) =>
      n.nodeType === 1 ? walk(n as Element) : (n.textContent ?? '').trim(),
    );
    return { tag: el.tagName, attrs, style, kids };
  };
  return Array.from(root.children).map(walk);
}

describe('cartas do Cama-Leão: JSX == string do protótipo', () => {
  for (const w of [46, 64]) {
    it(`as 72 frentes em w=${w}`, () => {
      expect(CAMELIO_DECK).toHaveLength(72);
      for (const c of CAMELIO_DECK) {
        expect(norm(renderToStaticMarkup(<CardFront card={c} w={w} />))).toEqual(norm(frontHtml(c, w)));
      }
    });
  }

  it('versos: normal, bicolor e multi', () => {
    const kinds = ['normal', 'bicolor', 'multi'] as const;
    for (const kind of kinds) {
      const card = CAMELIO_DECK.find((c) => c.kind === kind)!;
      const back = camelioBack(card);
      for (const w of [46, 64]) {
        expect(norm(renderToStaticMarkup(<CardBack back={back} w={w} />))).toEqual(norm(backHtml(back, w)));
      }
    }
  });

  it('usa w=64 por padrão nas duas formas', () => {
    const c = camelioCard(0);
    expect(norm(renderToStaticMarkup(<CardFront card={c} />))).toEqual(norm(frontHtml(c)));
    expect(frontHtml(c)).toContain('--w:64px');
  });

  it('textos de acessibilidade da bicolor (id 47)', () => {
    const card = camelioCard(47);
    expect(card.kind).toBe('bicolor');
    expect(frontHtml(card)).toContain('aria-label="3 esferas vermelho (bicolor)"');
    expect(backHtml(camelioBack(card))).toContain('aria-label="3 esferas, laranja ou vermelho"');
  });

  it('1 esfera no singular, multi e normal', () => {
    const normal = CAMELIO_DECK.find((c) => c.kind === 'normal' && c.spheres === 1)!;
    expect(frontHtml(normal)).toContain(`aria-label="1 esfera ${normal.color}"`);
    const multi = CAMELIO_DECK.find((c) => c.kind === 'multi')!;
    expect(frontHtml(multi)).toContain('(multicolor)');
    expect(backHtml(camelioBack(multi))).toContain('qualquer cor');
    expect(backHtml(camelioBack(normal))).toContain(`carta ${normal.color} virada`);
  });
});
