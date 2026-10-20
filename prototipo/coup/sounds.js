'use strict';
/* Sons do Cúpi: sintetizados (Web Audio), baixinhos e de papel/moeda. Adaptados de prototipo/retratim/sounds.js
   (tone + noise + ganho mestre), com o volume geral ainda mais baixo (0,28): o usuário acha os do DITU altos.
   O AudioContext só nasce depois de um gesto do usuário; antes disso play() não faz nada. */
(function () {
  const MASTER_VOL = .28;
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
  /** Ruído filtrado que vai sumindo; `freqTo` varre o filtro (papel). */
  function noise(c, { t = 0, dur = .08, vol = .15, freq = 1800, freqTo = null, q = 1 }) {
    const len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), at = c.currentTime + t;
    s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    g.gain.value = vol; s.connect(f).connect(g).connect(c.master); s.start(at);
  }

  const SYNTH = {
    /** sua vez: duas notinhas subindo */
    turn: (c) => { tone(c, { f: NOTE(76), dur: .22, type: 'triangle', vol: .08, partial: 2 }); tone(c, { f: NOTE(81), t: .12, dur: .32, type: 'triangle', vol: .08, partial: 2 }); },
    /** alguém declarou: estalo de papel */
    declare: (c) => { noise(c, { dur: .07, vol: .09, freq: 2600, freqTo: 1600, q: .8 }); noise(c, { t: .05, dur: .018, vol: .07, freq: 4000, q: 2 }); },
    /** cada segundo dos 3 últimos da janela: bem baixinho */
    tick: (c) => tone(c, { f: 1000, dur: .04, vol: .025, attack: .002 }),
    /** dúvida: batida grave curta */
    challenge: (c) => { tone(c, { f: 110, dur: .18, vol: .16, glideTo: 70, attack: .003 }); noise(c, { dur: .05, vol: .06, freq: 300, q: .7 }); },
    /** carta virando: papel varrendo pro agudo + estalinho */
    reveal: (c) => { noise(c, { dur: .16, vol: .08, freq: 1200, freqTo: 3200, q: .9 }); noise(c, { t: .14, dur: .02, vol: .07, freq: 3800, q: 2 }); },
    /** blefe pego: duas notas descendo */
    bluff: (c) => { tone(c, { f: NOTE(74), dur: .2, type: 'triangle', vol: .09, partial: 2 }); tone(c, { f: NOTE(67), t: .16, dur: .38, type: 'triangle', vol: .09, partial: 2 }); },
    /** perdeu carta: papel + nota grave caindo */
    lose: (c) => { noise(c, { dur: .1, vol: .07, freq: 1500, freqTo: 700, q: .8 }); tone(c, { f: NOTE(57), t: .04, dur: .4, type: 'triangle', vol: .08, glideTo: NOTE(52) }); },
    /** moedas entrando: tilintar curto */
    coin: (c) => { tone(c, { f: NOTE(93), dur: .14, vol: .05, attack: .002, partial: 2.7 }); tone(c, { f: NOTE(98), t: .06, dur: .2, vol: .05, attack: .002, partial: 2.7 }); },
    win: (c) => [72, 76, 79, 84].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .1, dur: .55, type: 'triangle', vol: .1, partial: 2 })),
    error: (c) => { tone(c, { f: 130, dur: .22, vol: .11, glideTo: 85 }); noise(c, { dur: .06, vol: .035, freq: 400 }); },
  };

  window.play = function play(name) {
    if (!on) return;
    try { const fn = SYNTH[name]; const c = fn && ac(); if (c) fn(c); } catch { /* sem áudio */ }
  };
  window.setSound = function setSound(v) { on = !!v; };
})();
