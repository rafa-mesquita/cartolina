'use strict';
/* Sons do Cama-Leão: sintetizados (Web Audio), baixinhos e de picadeiro.
   Mesma técnica do Diquisti (tone + noise + ganho mestre), com o volume geral em 0,35.
   O AudioContext só nasce depois de um gesto do usuário; antes disso play() não faz nada. */
(function () {
  const MASTER_VOL = .35;
  let on = true, actx = null, gestured = false;
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function ac() {
    if (!gestured) return null;
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      actx = new C(); actx.master = actx.createGain(); actx.master.gain.value = MASTER_VOL; actx.master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume?.();
    return actx;
  }
  // qualquer gesto libera o áudio (e já acorda o contexto dentro do próprio gesto)
  function unlock() { gestured = true; try { ac(); } catch { /* sem áudio */ } }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, unlock, { capture: true, passive: true });

  function tone(c, { f, t = 0, dur = .4, type = 'sine', vol = .2, attack = .005, glideTo = null, partial = 0 }) {
    const o = c.createOscillator(), g = c.createGain(), at = c.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f, at);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    o.connect(g).connect(c.master); o.start(at); o.stop(at + dur + .05);
    if (partial) tone(c, { f: f * partial, t, dur: dur * .5, vol: vol * .25, attack });
  }
  /** Ruído filtrado que vai sumindo; `freqTo` varre o filtro (fitinha descolando, papel). */
  function noise(c, { t = 0, dur = .08, vol = .15, freq = 1800, freqTo = null, q = 1 }) {
    const len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), at = c.currentTime + t;
    s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    g.gain.value = vol; s.connect(f).connect(g).connect(c.master); s.start(at);
  }

  const SYNTH = {
    /** pegou uma carta */
    pick: (c) => { noise(c, { dur: .05, vol: .07, freq: 2600, freqTo: 1800, q: .8 }); },
    /** a carta voa e vira: rufar curtinho */
    flip: (c) => { for (let i = 0; i < 5; i++) noise(c, { t: i * .045, dur: .035, vol: .05 + i * .01, freq: 900, q: 1.2 }); },
    /** encaixou sem nada acontecer */
    drop: (c) => { noise(c, { dur: .04, vol: .08, freq: 1400, q: 1 }); tone(c, { f: 220, dur: .08, type: 'triangle', vol: .05 }); },
    /** fechou 5: fanfarra curta */
    scored: (c) => [67, 72, 76, 79].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .08, dur: i === 3 ? .5 : .16, type: 'square', vol: .045, partial: 2 })),
    /** estourou: buum de circo (bumbo + prato) */
    bust: (c) => { tone(c, { f: 110, dur: .45, vol: .2, glideTo: 45 }); noise(c, { t: .02, dur: .35, vol: .07, freq: 5000, freqTo: 2500, q: .6 }); },
    /** perdeu o ponto: fiu descendente */
    lost: (c) => { tone(c, { f: NOTE(84), dur: .55, type: 'triangle', vol: .08, glideTo: NOTE(60) }); },
    /** sua vez */
    turn: (c) => { tone(c, { f: NOTE(81), dur: .35, vol: .09, partial: 2 }); tone(c, { f: NOTE(88), t: .09, dur: .45, vol: .07, partial: 2 }); },
    error: (c) => { tone(c, { f: 130, dur: .22, vol: .13, glideTo: 85 }); noise(c, { dur: .06, vol: .04, freq: 400 }); },
    win: (c) => [72, 76, 79, 84].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .1, dur: .55, type: 'triangle', vol: .12, partial: 2 })),
    lose: (c) => [72, 67, 64].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .14, dur: .4, type: 'triangle', vol: .08 })),
  };

  window.play = function play(name) {
    if (!on) return;
    try { const fn = SYNTH[name]; const c = fn && ac(); if (c) fn(c); } catch { /* sem áudio */ }
  };
  window.setSound = function setSound(v) { on = !!v; };
})();
