import { useEffect, useState } from 'react';
import type { CoupCharacter } from '@cartolina/shared';
import { CardFace } from './CardFace';
import { MOMENT_MS, type Moment } from './moments';
import { CHARACTER_NAMES } from './names';
import type { NameOf } from './texts';

/** Os últimos milissegundos do momento servem pra ele sumir suave. */
const FADE_MS = 250;

/** "o Duque" / "a Condessa". */
const the = (c: CoupCharacter) => `${c === 'contessa' ? 'a' : 'o'} ${CHARACTER_NAMES[c]}`;

/** Um número por momento (a chave remonta o elemento e a animação de entrada roda de novo). */
const ids = new WeakMap<Moment, number>();
let seq = 0;
const idOf = (m: Moment): number => {
  let id = ids.get(m);
  if (id === undefined) ids.set(m, (id = ++seq));
  return id;
};

/**
 * Um momento narrado sobre o palco (dúvida com a carta virando ou o carimbo "BLEFE", "bloqueado!", "Caio está fora").
 * `band` = você pode reagir na janela aberta: vira uma faixa compacta no alto, que não bloqueia cliques.
 */
export function MomentView({ moment, band, nameOf }: { moment: Moment; band: boolean; nameOf: NameOf }) {
  return <MomentBody key={idOf(moment)} moment={moment} band={band} nameOf={nameOf} />;
}

function MomentBody({ moment, band, nameOf }: { moment: Moment; band: boolean; nameOf: NameOf }) {
  const [bye, setBye] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBye(true), MOMENT_MS - FADE_MS);
    return () => clearTimeout(t);
  }, []);
  const cls = ['cp-moment', band ? 'band' : '', bye ? 'bye' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} role="status" aria-live="polite">
      <MomentContent moment={moment} nameOf={nameOf} />
    </div>
  );
}

function MomentContent({ moment: m, nameOf }: { moment: Moment; nameOf: NameOf }) {
  switch (m.kind) {
    case 'challenge':
      return (
        <>
          <div className="cp-mt">{nameOf(m.by)} duvidou!</div>
          {m.had ? (
            <>
              <div className="cp-row">
                <CardFace card={m.claim} size="l" />
              </div>
              <div className="cp-ms">
                {nameOf(m.of)} tinha {the(m.claim)}
              </div>
            </>
          ) : (
            <div className="cp-row">
              <div className="cp-mt2">{nameOf(m.of)} blefou!</div>
              <div className="cp-stamp">blefe</div>
            </div>
          )}
        </>
      );
    case 'blocked':
      return (
        <>
          <div className="cp-mt">bloqueado!</div>
          <div className="cp-row">
            <CardFace card={m.as} size="l" />
          </div>
          <div className="cp-ms ink">
            {nameOf(m.by)} bloqueou como {the(m.as)}
          </div>
        </>
      );
    case 'out':
      return <div className="cp-mt">{nameOf(m.player)} está fora</div>;
  }
}
