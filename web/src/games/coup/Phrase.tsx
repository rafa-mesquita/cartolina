import { CHARACTER_NAMES } from './names';
import type { Phrase } from './texts';

/** Frase com o personagem destacado (em vermelho, via CSS `.ph-char`). */
export function PhraseView({ phrase }: { phrase: Phrase }) {
  return (
    <>
      {phrase.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <b key={i} className="ph-char">
            {CHARACTER_NAMES[p.char]}
          </b>
        ),
      )}
    </>
  );
}
