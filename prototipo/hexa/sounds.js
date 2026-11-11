'use strict';
/* Sons do protótipo do Mandacaru: tudo sintetizado com Web Audio, baixinho (o Rafa acha os sons do DITU altos).
   Som.play('dados' | 'construir' | 'carta' | 'carcara' | 'vez' | 'vitoria'); Som.toggle() liga/desliga (guardado no navegador). */
(function () {
  const KEY = 'mandacaru-som';
  const VOLUME = 0.16;
  let on = localStorage.getItem(KEY) !== '0';
  let ac = null;
  let master = null;

  /** O contexto só nasce depois de um clique (regra dos navegadores). */
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain();
      master.gain.value = VOLUME;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  /** Um tom com ataque curto e queda suave; `to` faz a frequência deslizar. */
  function tone(t0, freq, dur, { type = 'sine', vol = 0.5, to = null } = {}) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  let noiseBuf = null;
  /** Um sopro de ruído filtrado (dados batendo, papel). */
  function noise(t0, dur, { freq = 2000, q = 1.2, vol = 0.4, type = 'bandpass', to = null } = {}) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    // Dados chacoalhando no copo e caindo na mesa.
    dados(t) {
      for (let i = 0; i < 6; i++) noise(t + i * 0.05 + Math.random() * 0.015, 0.035, { freq: 2600 + Math.random() * 1200, q: 4, vol: 0.35 });
      noise(t + 0.34, 0.06, { freq: 1500, q: 3, vol: 0.5 });
      noise(t + 0.42, 0.05, { freq: 1800, q: 3, vol: 0.4 });
    },
    // Duas batidinhas de madeira (taipa subindo).
    construir(t) {
      tone(t, 210, 0.12, { vol: 0.6, to: 130 });
      noise(t, 0.03, { freq: 900, q: 2, vol: 0.3 });
      tone(t + 0.11, 240, 0.12, { vol: 0.5, to: 150 });
      noise(t + 0.11, 0.03, { freq: 1100, q: 2, vol: 0.25 });
    },
    // Papel do cordel deslizando.
    carta(t) {
      noise(t, 0.14, { freq: 1800, to: 4200, q: 0.8, vol: 0.28 });
    },
    // O grito do carcará: dois "kreee" descendo.
    carcara(t) {
      tone(t, 1500, 0.2, { type: 'triangle', vol: 0.22, to: 950 });
      tone(t + 0.24, 1650, 0.26, { type: 'triangle', vol: 0.2, to: 900 });
    },
    // Sua vez: duas notas de sininho.
    vez(t) {
      tone(t, 660, 0.25, { vol: 0.35 });
      tone(t + 0.13, 990, 0.4, { vol: 0.3 });
    },
    // Vitória: arpejo de sanfona em triângulo.
    vitoria(t) {
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, f, i === 3 ? 0.7 : 0.22, { type: 'triangle', vol: 0.32 }));
      tone(t + 0.48, 784, 0.7, { type: 'triangle', vol: 0.18 });
    },
  };

  window.Som = {
    play(name) {
      if (!on || !SOUNDS[name]) return;
      const c = audio();
      if (!c) return;
      try { SOUNDS[name](c.currentTime + 0.01); } catch (e) { console.warn('som', name, e); }
    },
    /** Destrava o áudio num clique (sem tocar nada). */
    unlock() { if (on) audio(); },
    toggle() {
      on = !on;
      localStorage.setItem(KEY, on ? '1' : '0');
      if (on) audio();
      return on;
    },
    get on() { return on; },
  };
})();
