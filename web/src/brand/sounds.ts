import { loadSoundPref } from '../net/identity';

export type SoundName = 'card' | 'reveal';

/** Quantos elementos por som: cartas pousando em sequência tocam por cima umas das outras. */
const POOL_SIZE: Record<SoundName, number> = { card: 3, reveal: 1 };
/** No máximo um som de carta a cada tanto (várias cartas pousando juntas viram um só). */
const CARD_GAP_MS = 80;

interface Pool {
  list: HTMLAudioElement[];
  next: number;
}

const pools = new Map<SoundName, Pool>();
let lastCard = -Infinity;

/** Relativo à base do site (`base: './'` no Vite): funciona em subpasta, como no GitHub Pages. */
const urlOf = (name: SoundName) => `${import.meta.env.BASE_URL}sounds/${name}.mp3`;

function poolOf(name: SoundName): Pool {
  let pool = pools.get(name);
  if (!pool) {
    // Criados só no primeiro toque: ninguém baixa áudio antes de precisar.
    const list = Array.from({ length: POOL_SIZE[name] }, () => {
      const a = new Audio(urlOf(name));
      a.preload = 'auto';
      return a;
    });
    pool = { list, next: 0 };
    pools.set(name, pool);
  }
  return pool;
}

/** Toca um som da mesa. Silencioso se o som estiver desligado ou se o navegador bloquear o autoplay. */
export function playSound(name: SoundName, now: number = performance.now()): void {
  if (!loadSoundPref()) return;
  if (name === 'card') {
    if (now - lastCard < CARD_GAP_MS) return;
    lastCard = now;
  }
  try {
    const pool = poolOf(name);
    const audio = pool.list[pool.next]!;
    pool.next = (pool.next + 1) % pool.list.length;
    audio.currentTime = 0;
    const p = audio.play() as Promise<void> | undefined;
    // Autoplay bloqueado antes do primeiro gesto do usuário: ignora.
    p?.catch(() => {});
  } catch {
    // navegador sem áudio: segue sem som
  }
}

/** Só para testes: esquece os elementos e o intervalo do som de carta. */
export function resetSounds(): void {
  pools.clear();
  lastCard = -Infinity;
}
