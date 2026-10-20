import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhraseView } from '../src/games/coup/Phrase';

describe('PhraseView', () => {
  it('personagem sai em <b class="ph-char"> com o nome em português; o destaque sai em <b class="ph-em">', () => {
    const { container } = render(
      <p>
        <PhraseView phrase={['Caio duvidou de Beto: ', { em: 'não tinha' }, ' a ', { char: 'contessa' }]} />
      </p>,
    );
    const chars = container.querySelectorAll('b.ph-char');
    expect(chars).toHaveLength(1);
    expect(chars[0]!.textContent).toBe('Condessa');
    const ems = container.querySelectorAll('b.ph-em');
    expect(ems).toHaveLength(1);
    expect(ems[0]!.textContent).toBe('não tinha');
    expect(container.textContent).toBe('Caio duvidou de Beto: não tinha a Condessa');
  });
});
