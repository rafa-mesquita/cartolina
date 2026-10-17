'use strict';
/* Sons do Retratim: sintetizados (Web Audio), baixinhos e de papel/fita/câmera.
   Mesma técnica do Diquisti (tone + noise + ganho mestre), mas com o volume geral em 0,35.
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
    /** fitinha colando: sopro curto de ruído + estalinho */
    tape: (c) => { noise(c, { dur: .09, vol: .1, freq: 2600, freqTo: 1500, q: .8 }); noise(c, { t: .075, dur: .015, vol: .08, freq: 4200, q: 2 }); tone(c, { f: 1500, t: .075, dur: .03, type: 'triangle', vol: .04, attack: .002 }); },
    /** fitinha saindo: ruído mais longo, varrendo pro agudo */
    peel: (c) => { noise(c, { dur: .22, vol: .09, freq: 1200, freqTo: 3400, q: .9 }); noise(c, { t: .1, dur: .1, vol: .05, freq: 2200, q: 1.5 }); },
    /** clique de câmera: dois estalos de ruído bem curtos */
    shutter: (c) => { noise(c, { dur: .02, vol: .16, freq: 3600, q: 2 }); noise(c, { t: .075, dur: .028, vol: .12, freq: 2300, q: 2 }); },
    /** nota suave (pontos) */
    plim: (c) => tone(c, { f: NOTE(88), dur: .5, vol: .11, attack: .004, partial: 2 }),
    /** alguém ficou pronto: toque de papel */
    ready: (c) => { noise(c, { dur: .06, vol: .08, freq: 3000, freqTo: 1800, q: .7 }); tone(c, { f: NOTE(79), t: .03, dur: .14, type: 'triangle', vol: .05 }); },
    /** rodada nova: papel + duas notinhas */
    round: (c) => { noise(c, { dur: .12, vol: .06, freq: 2000, freqTo: 3000, q: .7 }); tone(c, { f: NOTE(76), t: .05, dur: .25, type: 'triangle', vol: .08, partial: 2 }); tone(c, { f: NOTE(81), t: .17, dur: .35, type: 'triangle', vol: .08, partial: 2 }); },
    /** contagem final: bem baixinho */
    tick: (c) => tone(c, { f: 1000, dur: .04, vol: .03, attack: .002 }),
    error: (c) => { tone(c, { f: 130, dur: .22, vol: .13, glideTo: 85 }); noise(c, { dur: .06, vol: .04, freq: 400 }); },
    win: (c) => [72, 76, 79, 84].forEach((n, i) => tone(c, { f: NOTE(n), t: i * .1, dur: .55, type: 'triangle', vol: .12, partial: 2 })),
  };
  SYNTH.untape = SYNTH.peel;

  window.play = function play(name) {
    if (!on) return;
    try { const fn = SYNTH[name]; const c = fn && ac(); if (c) fn(c); } catch { /* sem áudio */ }
  };
  window.setSound = function setSound(v) { on = !!v; };
})();
