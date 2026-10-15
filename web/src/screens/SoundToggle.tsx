import { useState } from 'react';
import { loadSoundPref, saveSoundPref } from '../net/identity';

/** Chave "som" (lembra a escolha). Usada no lobby e nos controles da mesa. */
export function SoundToggle() {
  const [on, setOn] = useState(loadSoundPref);
  const toggle = () => {
    const next = !on;
    setOn(next);
    saveSoundPref(next);
  };
  return (
    <button className="toggle-row" type="button" onClick={toggle} aria-pressed={on}>
      <span>som</span>
      <span className={`toggle ${on ? 'on' : ''}`}>
        <span className="knob" />
      </span>
    </button>
  );
}
