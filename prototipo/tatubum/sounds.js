'use strict';
/* Sons 8-bit sintetizados (Web Audio), baixinhos como no Diquisti. `Sound.play(nome)`; botão de mudo na barra. */
(function () {
  let ctx = null;
  let master = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Uma nota: onda `type`, frequência de `f0` a `f1`, `dur` segundos, começando em `at` segundos daqui. */
  function tone({ type = 'square', f0, f1 = f0, dur, at = 0, vol = 1 }) {
    const a = ac();
    const t = a.currentTime + at;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Ruído filtrado (whoosh, chiado, explosão). */
  function noise({ dur, at = 0, vol = 1, filter = 'lowpass', f0 = 2000, f1 = f0 }) {
    const a = ac();
    const t = a.currentTime + at;
    const len = Math.ceil(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const bq = a.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bq).connect(g).connect(master);
    src.start(t);
  }

  const SOUNDS = {
    select: () => tone({ f0: 880, dur: 0.04, vol: 0.5 }),
    card: () => noise({ dur: 0.12, filter: 'bandpass', f0: 800, f1: 3000, vol: 0.6 }),
    draw: () => { tone({ f0: 660, dur: 0.05, vol: 0.5 }); tone({ f0: 990, dur: 0.06, at: 0.05, vol: 0.5 }); },
    nope: () => { tone({ f0: 140, f1: 90, dur: 0.12, vol: 0.9 }); noise({ dur: 0.05, f0: 4000, vol: 0.5 }); tone({ f0: 1200, dur: 0.05, at: 0.02, vol: 0.3 }); },
    tic: () => tone({ type: 'triangle', f0: 1400, dur: 0.025, vol: 0.4 }),
    shuffle: () => { for (let i = 0; i < 7; i++) noise({ dur: 0.03, at: i * 0.045, filter: 'highpass', f0: 2500, vol: 0.5 }); },
    peek: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.12, at: i * 0.06, vol: 0.35 })),
    attack: () => { tone({ f0: 700, f1: 140, dur: 0.18, vol: 0.6 }); noise({ dur: 0.1, filter: 'highpass', f0: 3000, vol: 0.4 }); },
    skip: () => { tone({ f0: 520, dur: 0.05, vol: 0.4 }); tone({ f0: 780, dur: 0.05, at: 0.07, vol: 0.4 }); },
    give: () => { tone({ f0: 880, dur: 0.05, vol: 0.4 }); tone({ f0: 660, dur: 0.07, at: 0.06, vol: 0.4 }); },
    cafune: () => {
      for (let i = 0; i < 6; i++) tone({ f0: 70, dur: 0.06, at: i * 0.07, vol: 0.5 });
      [784, 988, 1175].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, at: 0.45 + i * 0.08, vol: 0.4 }));
    },
    fuse: () => noise({ dur: 0.7, filter: 'highpass', f0: 5000, f1: 2500, vol: 0.35 }),
    boom: () => { noise({ dur: 1.1, f0: 1800, f1: 80, vol: 1 }); tone({ f0: 90, f1: 35, dur: 0.6, vol: 0.9 }); },
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.12, at: i * 0.11, vol: 0.45 })),
    error: () => { tone({ f0: 200, dur: 0.07, vol: 0.4 }); tone({ f0: 150, dur: 0.1, at: 0.08, vol: 0.4 }); },
  };

  window.Sound = {
    play(name) {
      if (muted || !SOUNDS[name]) return;
      try { SOUNDS[name](); } catch { /* sem áudio: segue o jogo */ }
    },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
