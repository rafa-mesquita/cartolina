import { loadSoundPref } from '../net/identity';

/**
 * Sons da cartolina~. `card` é um arquivo (gravação de carta pousando); os da revelação são
 * sintetizados na hora com Web Audio (opção "A" de `prototipo/sons.html`): um "tic" de madeira por
 * carta que vira, subindo de tom; um "tunc" grave em cada erro; arpejo feliz ou "uó-uó" no fim.
 */
export type SoundName = 'card' | 'pick' | 'flip' | 'error' | 'win' | 'lose' | 'join' | 'click';

/**
 * Sons de arquivo. `pick` (escolher personagem) usa o mesmo arquivo e os mesmos elementos da carta.
 * Os outros dos menus são sintetizados: `join` ("plim-plim" ao entrar) e `click` (estalinho dos botões).
 */
type FileSound = 'card' | 'pick';
const POOL_OF: Record<FileSound, 'card'> = { card: 'card', pick: 'card' };
const FILES: Record<'card', { file: string; pool: number }> = {
  // Cartas pousando em sequência tocam por cima umas das outras.
  card: { file: 'card.mp3', pool: 3 },
};
/** No máximo um som de arquivo a cada tanto (várias cartas pousando juntas viram um só). */
const FILE_GAP_MS = 80;

interface Pool {
  list: HTMLAudioElement[];
  next: number;
}

/** Volume de cada som de arquivo (a escolha de personagem é 30% mais baixa que a carta). */
export const FILE_VOLUME: Record<FileSound, number> = { card: 1, pick: 0.7 };

const pools = new Map<'card', Pool>();
let lastFile = -Infinity;
let ctx: AudioContext | null = null;

/** Relativo à base do site (`base: './'` no Vite): funciona em subpasta, como no GitHub Pages. */
const urlOf = (file: string) => `${import.meta.env.BASE_URL}sounds/${file}`;

function poolOf(sound: FileSound): Pool {
  const name = POOL_OF[sound];
  let pool = pools.get(name);
  if (!pool) {
    // Criados só no primeiro toque: ninguém baixa áudio antes de precisar.
    const { file, pool: size } = FILES[name];
    const list = Array.from({ length: size }, () => {
      const a = new Audio(urlOf(file));
      a.preload = 'auto';
      return a;
    });
    pool = { list, next: 0 };
    pools.set(name, pool);
  }
  return pool;
}

function playFile(name: FileSound, now: number): void {
  if (now - lastFile < FILE_GAP_MS) return;
  lastFile = now;
  const pool = poolOf(name);
  const audio = pool.list[pool.next]!;
  pool.next = (pool.next + 1) % pool.list.length;
  audio.currentTime = 0;
  const p = audio.play() as Promise<void> | undefined;
  // Autoplay bloqueado antes do primeiro gesto do usuário: ignora.
  p?.catch(() => {});
}

// ---------- síntese (Web Audio) ----------

/** Contexto criado no primeiro som (navegadores exigem um gesto antes); null sem Web Audio. */
function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  ctx.resume?.()?.catch(() => {});
  return ctx;
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

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

function tone(c: AudioContext, { f, t = 0, dur = 0.4, type = 'sine', vol = 0.25, attack = 0.005, glideTo = null, partial = 0 }: ToneOpts): void {
  const o = c.createOscillator();
  const g = c.createGain();
  const at = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
  if (partial) tone(c, { f: f * partial, t, dur: dur * 0.5, type: 'sine', vol: vol * 0.25, attack });
}

function noise(c: AudioContext, { t = 0, dur = 0.08, vol = 0.2, freq = 1800, q = 1 }): void {
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
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(at);
}

const SYNTH: Record<Exclude<SoundName, FileSound>, (c: AudioContext, index: number) => void> = {
  /** "tic" de madeira; sobe um tom inteiro a cada carta. */
  flip: (c, i) => {
    tone(c, { f: NOTE(72 + i * 2), dur: 0.12, type: 'triangle', vol: 0.22, partial: 3 });
    noise(c, { dur: 0.03, vol: 0.08, freq: 3200, q: 3 });
  },
  /** "tunc" grave quando o ✕ cai. */
  error: (c) => {
    tone(c, { f: 110, dur: 0.22, type: 'sine', vol: 0.35, glideTo: 70 });
    noise(c, { dur: 0.06, vol: 0.12, freq: 400 });
  },
  win: (c) => [72, 76, 79, 84].forEach((n, i) => tone(c, { f: NOTE(n), t: i * 0.09, dur: 0.5, type: 'triangle', vol: 0.2, partial: 2 })),
  lose: (c) => {
    tone(c, { f: NOTE(67), dur: 0.35, type: 'square', vol: 0.06 });
    tone(c, { f: NOTE(62), t: 0.32, dur: 0.6, type: 'square', vol: 0.06, glideTo: NOTE(58) });
  },
  /** "plim-plim" alegre ao entrar: dó e sol agudos. */
  join: (c) => {
    tone(c, { f: NOTE(84), dur: 0.25, type: 'triangle', vol: 0.18, partial: 2 });
    tone(c, { f: NOTE(91), t: 0.15, dur: 0.35, type: 'triangle', vol: 0.18, partial: 2 });
  },
  /** Estalinho curto e baixinho dos botões. */
  click: (c) => tone(c, { f: 880, dur: 0.06, type: 'triangle', vol: 0.06, attack: 0.003 }),
};

/**
 * Toca um som. `index` = posição da carta na revelação (o tic sobe de tom).
 * Silencioso com o som desligado, sem suporte de áudio ou com autoplay bloqueado.
 */
export function playSound(name: SoundName, index = 0, now: number = performance.now()): void {
  if (!loadSoundPref()) return;
  try {
    if (name === 'card' || name === 'pick') {
      playFile(name, now);
      return;
    }
    const c = audio();
    if (c) SYNTH[name](c, index);
  } catch {
    // navegador sem áudio: segue sem som
  }
}

/** Só para testes: esquece elementos, contexto e o intervalo dos sons de arquivo. */
export function resetSounds(): void {
  pools.clear();
  lastFile = -Infinity;
  ctx = null;
}
