import { loadSoundPref } from '../../net/identity';

/**
 * Sons do Cama-Leão: sintetizados (Web Audio), baixinhos e de picadeiro. Porte de
 * `prototipo/cama-leao/sounds.js`. O usuário acha os sons do DITU altos, então tudo passa por um ganho
 * geral de 0,35. `click` é o estalinho dos botões da mesa e do lobby (o mesmo do Retratim).
 */
export type CamelioSound = 'pick' | 'flip' | 'drop' | 'scored' | 'bust' | 'lost' | 'turn' | 'error' | 'win' | 'lose' | 'click';

/** Volume geral de todos os sons do jogo. */
export const MASTER_VOLUME = 0.35;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let gestured = false;

/**
 * O áudio só existe depois de um gesto do usuário: antes disso não se cria `AudioContext`
 * (o navegador o deixaria suspenso e reclamaria no console). `userActivation` cobre o gesto que já aconteceu
 * antes de a mesa abrir (ex.: o clique em "começar").
 */
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
 * Devolve a função que desinstala.
 */
export function installAudioUnlock(doc: Document = document): () => void {
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
  f: number;
  t?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  glideTo?: number | null;
  partial?: number;
}

function tone(c: AudioContext, out: AudioNode, { f, t = 0, dur = 0.4, type = 'sine', vol = 0.2, attack = 0.005, glideTo = null, partial = 0 }: ToneOpts): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const at = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
  if (partial) tone(c, out, { f: f * partial, t, dur: dur * 0.5, vol: vol * 0.25, attack });
}

interface NoiseOpts {
  t?: number;
  dur?: number;
  vol?: number;
  freq?: number;
  /** Varre o filtro até aqui (fitinha descolando, papel). */
  freqTo?: number | null;
  q?: number;
}

/** Ruído filtrado que vai sumindo. */
function noise(c: AudioContext, out: AudioNode, { t = 0, dur = 0.08, vol = 0.15, freq = 1800, freqTo = null, q = 1 }: NoiseOpts): void {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  const at = c.currentTime + t;
  s.buffer = buf;
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, at);
  f.Q.value = q;
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
  g.gain.value = vol;
  s.connect(f).connect(g).connect(out);
  s.start(at);
}

const SYNTH: Record<CamelioSound, (c: AudioContext, out: AudioNode) => void> = {
  /** Pegou uma carta. */
  pick: (c, o) => {
    noise(c, o, { dur: 0.05, vol: 0.07, freq: 2600, freqTo: 1800, q: 0.8 });
  },
  /** A carta voa e vira: rufar curtinho. */
  flip: (c, o) => {
    for (let i = 0; i < 5; i++) noise(c, o, { t: i * 0.045, dur: 0.035, vol: 0.05 + i * 0.01, freq: 900, q: 1.2 });
  },
  /** Encaixou sem nada acontecer. */
  drop: (c, o) => {
    noise(c, o, { dur: 0.04, vol: 0.08, freq: 1400, q: 1 });
    tone(c, o, { f: 220, dur: 0.08, type: 'triangle', vol: 0.05 });
  },
  /** Fechou 5: fanfarra curta. */
  scored: (c, o) =>
    [67, 72, 76, 79].forEach((n, i) => tone(c, o, { f: NOTE(n), t: i * 0.08, dur: i === 3 ? 0.5 : 0.16, type: 'square', vol: 0.045, partial: 2 })),
  /** Estourou: buum de circo (bumbo + prato). */
  bust: (c, o) => {
    tone(c, o, { f: 110, dur: 0.45, vol: 0.2, glideTo: 45 });
    noise(c, o, { t: 0.02, dur: 0.35, vol: 0.07, freq: 5000, freqTo: 2500, q: 0.6 });
  },
  /** Perdeu o ponto: fiu descendente. */
  lost: (c, o) => {
    tone(c, o, { f: NOTE(84), dur: 0.55, type: 'triangle', vol: 0.08, glideTo: NOTE(60) });
  },
  /** Sua vez. */
  turn: (c, o) => {
    tone(c, o, { f: NOTE(81), dur: 0.35, vol: 0.09, partial: 2 });
    tone(c, o, { f: NOTE(88), t: 0.09, dur: 0.45, vol: 0.07, partial: 2 });
  },
  error: (c, o) => {
    tone(c, o, { f: 130, dur: 0.22, vol: 0.13, glideTo: 85 });
    noise(c, o, { dur: 0.06, vol: 0.04, freq: 400 });
  },
  win: (c, o) => [72, 76, 79, 84].forEach((n, i) => tone(c, o, { f: NOTE(n), t: i * 0.1, dur: 0.55, type: 'triangle', vol: 0.12, partial: 2 })),
  lose: (c, o) => [72, 67, 64].forEach((n, i) => tone(c, o, { f: NOTE(n), t: i * 0.14, dur: 0.4, type: 'triangle', vol: 0.08 })),
  /** Estalinho dos botões: o do site (880 Hz, 0,06) um pouco mais baixo, antes do ganho geral. */
  click: (c, o) => tone(c, o, { f: 880, dur: 0.06, type: 'triangle', vol: 0.05, attack: 0.003 }),
};

/** Toca um som do Cama-Leão. Silencioso com o som desligado, antes do primeiro gesto ou sem Web Audio. */
export function playCamelioSound(name: CamelioSound): void {
  if (!loadSoundPref()) return;
  try {
    const a = audio();
    if (a) SYNTH[name](a.c, a.out);
  } catch {
    // navegador sem áudio: segue sem som
  }
}

/** Só para testes: esquece o contexto e o gesto. */
export function resetCamelioSounds(): void {
  ctx = null;
  master = null;
  gestured = false;
}
