import { loadSoundPref } from '../../net/identity';

/**
 * Sons do Mandacaru: sintetizados (Web Audio) e baixinhos (o Rafa acha os sons do DITU altos). Porte de
 * `prototipo/hexa/sounds.js`, no molde de `games/coup/sounds.ts` (áudio só depois de um gesto; preferência do site).
 * `error` é o mesmo baque curto do Cúpi (o protótipo não tinha).
 */
export const MANDACARU_SOUNDS = ['dice', 'build', 'card', 'carcara', 'turn', 'win', 'error'] as const;
export type MandacaruSound = (typeof MANDACARU_SOUNDS)[number];

/** Volume geral de todos os sons do jogo. */
export const MASTER_VOLUME = 0.18;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let gestured = false;

/** Já houve gesto? `userActivation` cobre o gesto de antes de a mesa abrir (ex.: o clique em "começar"). */
function unlocked(): boolean {
  return gestured || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true);
}

/** Contexto e ganho geral, criados no primeiro som depois de um gesto; `null` sem gesto ou sem Web Audio. */
function audio(): { c: AudioContext; out: AudioNode } | null {
  if (!unlocked()) return null;
  if (!ctx || !master) {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  ctx.resume?.()?.catch(() => {});
  return { c: ctx, out: master };
}

/**
 * Qualquer gesto libera o áudio (e já acorda o contexto dentro do próprio gesto, se o som estiver ligado).
 * Devolve a função que desinstala. A mesa e o lobby chamam isto uma vez ao montar.
 */
export function installMandacaruAudioUnlock(doc: Document = document): () => void {
  const unlock = () => {
    gestured = true;
    if (!loadSoundPref()) return;
    try {
      audio();
    } catch {
      // sem áudio
    }
  };
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  for (const ev of events) doc.addEventListener(ev, unlock, { capture: true, passive: true });
  return () => {
    for (const ev of events) doc.removeEventListener(ev, unlock, { capture: true });
  };
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** A frequência desliza até aqui. */
  to?: number | null;
}

/** Um tom com ataque curto e queda suave, começando `t` segundos depois de agora. */
function tone(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, { type = 'sine', vol = 0.5, to = null }: ToneOpts = {}): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const at = c.currentTime + 0.01 + t;
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

interface NoiseOpts {
  freq?: number;
  q?: number;
  vol?: number;
  type?: BiquadFilterType;
  /** O filtro varre até aqui (papel). */
  to?: number | null;
}

/** Um sopro de ruído filtrado (dados batendo, papel). */
function noise(c: AudioContext, out: AudioNode, t: number, dur: number, { freq = 2000, q = 1.2, vol = 0.4, type = 'bandpass', to = null }: NoiseOpts = {}): void {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const at = c.currentTime + 0.01 + t;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur + 0.02);
}

interface CryOpts {
  vol?: number;
  /** Tremido da voz: quantas vezes por segundo e quantos Hz pra cima e pra baixo. */
  rate?: number;
  depth?: number;
}

/**
 * Um grito de ave de rapina: dente-de-serra áspera passando por um filtro (tira o zumbido) que acompanha a nota,
 * descendo de `freq` até `to`, com um tremido rápido (vibrato) e um chiado de ar por cima.
 */
function cry(c: AudioContext, out: AudioNode, t: number, freq: number, to: number, dur: number, { vol = 0.2, rate = 32, depth = 70 }: CryOpts = {}): void {
  const at = c.currentTime + 0.01 + t;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(rate, at);
  const wobble = c.createGain();
  wobble.gain.setValueAtTime(depth, at);
  lfo.connect(wobble).connect(o.frequency);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq * 1.4, at);
  f.frequency.exponentialRampToValueAtTime(to * 1.4, at + dur);
  f.Q.value = 3;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(vol * 0.6, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(f).connect(g).connect(out);
  o.start(at);
  lfo.start(at);
  o.stop(at + dur + 0.02);
  lfo.stop(at + dur + 0.02);
  noise(c, out, t, dur * 0.7, { freq: freq * 2, q: 2, vol: vol * 0.35, to: to * 2 });
}

/**
 * Uma nota de pífano: triângulo (o corpo) com uma quadrada baixinha uma oitava acima (o brilho de palheta, de sanfoninha),
 * passando por um passa-baixa, com um vibrato leve e um sopro de ar no ataque.
 */
function fife(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, vol: number): void {
  const at = c.currentTime + 0.01 + t;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.025);
  g.gain.exponentialRampToValueAtTime(vol * 0.7, at + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 4, at);
  f.Q.value = 0.7;
  f.connect(g).connect(out);
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(6, at);
  const wobble = c.createGain();
  wobble.gain.setValueAtTime(freq * 0.008, at);
  lfo.connect(wobble);
  const voices: [OscillatorType, number, number][] = [
    ['triangle', 1, 1],
    ['square', 2, 0.12],
  ];
  for (const [type, mult, level] of voices) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, at);
    wobble.connect(o.frequency);
    const lv = c.createGain();
    lv.gain.setValueAtTime(level, at);
    o.connect(lv).connect(f);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  lfo.start(at);
  lfo.stop(at + dur + 0.02);
  noise(c, out, t, 0.04, { freq: freq * 3, q: 1.5, vol: vol * 0.25 });
}

const SYNTH: Record<MandacaruSound, (c: AudioContext, out: AudioNode) => void> = {
  /** Dados chacoalhando no copo e caindo na mesa. */
  dice: (c, o) => {
    for (let i = 0; i < 6; i++) noise(c, o, i * 0.05 + Math.random() * 0.015, 0.035, { freq: 2600 + Math.random() * 1200, q: 4, vol: 0.35 });
    noise(c, o, 0.34, 0.06, { freq: 1500, q: 3, vol: 0.5 });
    noise(c, o, 0.42, 0.05, { freq: 1800, q: 3, vol: 0.4 });
  },
  /** Duas batidinhas de madeira (taipa subindo). */
  build: (c, o) => {
    tone(c, o, 0, 210, 0.12, { vol: 0.6, to: 130 });
    noise(c, o, 0, 0.03, { freq: 900, q: 2, vol: 0.3 });
    tone(c, o, 0.11, 240, 0.12, { vol: 0.5, to: 150 });
    noise(c, o, 0.11, 0.03, { freq: 1100, q: 2, vol: 0.25 });
  },
  /** Papel do cordel deslizando. */
  card: (c, o) => noise(c, o, 0, 0.14, { freq: 1800, to: 4200, q: 0.8, vol: 0.28 }),
  /** O Carcará pousou: um "kreee" rouco e dois "ki" curtos, cada um mais grave, todos com tremido. */
  carcara: (c, o) => {
    cry(c, o, 0, 2300, 1350, 0.32, { vol: 0.2, rate: 34, depth: 90 });
    cry(c, o, 0.4, 2100, 1500, 0.12, { vol: 0.17, rate: 40, depth: 60 });
    cry(c, o, 0.58, 1900, 1300, 0.14, { vol: 0.14, rate: 40, depth: 60 });
  },
  /** É com você: chamado de pífano, três notas subindo (sol, si, ré), a última mais comprida; um tiquinho acima dos outros. */
  turn: (c, o) => {
    fife(c, o, 0, 784, 0.13, 0.55);
    fife(c, o, 0.12, 988, 0.13, 0.55);
    fife(c, o, 0.24, 1175, 0.42, 0.6);
  },
  /** Vitória: arpejo de sanfona em triângulo. */
  win: (c, o) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, o, i * 0.12, f, i === 3 ? 0.7 : 0.22, { type: 'triangle', vol: 0.32 }));
    tone(c, o, 0.48, 784, 0.7, { type: 'triangle', vol: 0.18 });
  },
  /** Recusa: baque grave curto. */
  error: (c, o) => {
    tone(c, o, 0, 130, 0.22, { vol: 0.5, to: 85 });
    noise(c, o, 0, 0.06, { freq: 400, vol: 0.15 });
  },
};

/** Toca um som do Mandacaru. Silencioso com o som desligado, antes do primeiro gesto ou sem Web Audio. */
export function playMandacaruSound(name: MandacaruSound): void {
  if (!loadSoundPref()) return;
  try {
    const a = audio();
    if (a) SYNTH[name](a.c, a.out);
  } catch {
    // navegador sem áudio: segue sem som
  }
}

/** Só para testes: esquece o contexto e o gesto. */
export function resetMandacaruSounds(): void {
  ctx = null;
  master = null;
  noiseBuf = null;
  gestured = false;
}
