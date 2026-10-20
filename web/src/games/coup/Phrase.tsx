import { CHARACTER_NAMES } from './names';
import type { Phrase } from './texts';

/** Frase com o personagem (`.ph-char`) e o texto em destaque (`.ph-em`) em negrito; a cor vem do CSS. */
export function PhraseView({ phrase }: { phrase: Phrase }) {
  return (
    <>
      {phrase.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : 'em' in p ? (
          <b key={i} className="ph-em">
            {p.em}
          </b>
        ) : (
          <b key={i} className="ph-char">
            {CHARACTER_NAMES[p.char]}
          </b>
        ),
      )}
    </>
  );
}
