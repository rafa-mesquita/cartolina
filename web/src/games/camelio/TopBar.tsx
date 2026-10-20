import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useState } from 'react';
import type { CamelioView } from '@cartolina/shared';
import { loadSoundPref, saveSoundPref } from '../../net/identity';

/** Liga/desliga o som (a mesma preferência do resto do site). */
function SoundButton() {
  const [on, setOn] = useState(loadSoundPref);
  return (
    <button
      className="icon-btn"
      type="button"
      aria-pressed={on}
      aria-label="som"
      title={on ? 'som ligado' : 'som desligado'}
      onClick={() => {
        saveSoundPref(!on);
        setOn(!on);
      }}
    >
      <i className={`ti ${on ? 'ti-volume' : 'ti-volume-off'}`} />
    </button>
  );
}

/** Faixa de cima: logo, meta / monte / "último monte" e o som. */
export function TopBar({ code, v }: { code: string; v: CamelioView }) {
  return (
    <header className="cl-top">
      <div className="logo">
        Cama-Leão<small>sala {code} · cartolina~</small>
      </div>
      <div className="cl-info">
        meta: <b>{v.target} cores</b> · monte <b>{v.deckCount}</b>
        {v.reshuffled && (
          <>
            {' · '}
            <b className="last">último monte</b>
          </>
        )}
      </div>
      <div className="btns">
        <SoundButton />
      </div>
    </header>
  );
}
