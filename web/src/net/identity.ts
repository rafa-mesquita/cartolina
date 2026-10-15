import { isPlayerColor, type PlayerColor } from '@cartolina/shared';

const TOKEN_KEY = 'cartolina.token';
const PROFILE_KEY = 'cartolina.profile';
const TILT_KEY = 'cartolina.tilt';
const joinedKey = (code: string) => `cartolina.joined.${code}`;

export interface Profile {
  name: string;
  color: PlayerColor;
}

/** UUID v4 para contextos sem `crypto.randomUUID` (só existe em HTTPS/localhost). */
function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type StoreGetter = () => Storage;
const session: StoreGetter = () => sessionStorage;
const local: StoreGetter = () => localStorage;

/** Lê sem quebrar quando o armazenamento está bloqueado (o próprio acesso a `sessionStorage` pode lançar). */
export function safeGet(getStore: StoreGetter, key: string): string | null {
  try {
    return getStore().getItem(key);
  } catch {
    return null;
  }
}

/** Grava sem quebrar quando o armazenamento está bloqueado ou cheio (modo privado, cotas). */
export function safeSet(getStore: StoreGetter, key: string, value: string): void {
  try {
    getStore().setItem(key, value);
  } catch {
    // sem persistência: o app segue funcionando na sessão atual
  }
}

function parseProfile(raw: string | null): Profile | null {
  try {
    const p = JSON.parse(raw ?? 'null') as { name?: unknown; color?: unknown } | null;
    if (p && typeof p.name === 'string' && isPlayerColor(p.color)) return { name: p.name, color: p.color };
  } catch {
    // perfil corrompido: ignora
  }
  return null;
}

let memoryToken: string | null = null;

/** Um token por aba: duas abas são dois jogadores; recarregar a aba mantém o assento. Sem armazenamento, vale na memória. */
export function getToken(): string {
  const stored = safeGet(session, TOKEN_KEY);
  if (stored) return stored;
  if (memoryToken) return memoryToken;
  const token = uuidV4();
  memoryToken = token;
  safeSet(session, TOKEN_KEY, token);
  return token;
}

export function loadProfile(): Profile | null {
  return parseProfile(safeGet(local, PROFILE_KEY));
}

export function saveProfile(profile: Profile): void {
  safeSet(local, PROFILE_KEY, JSON.stringify(profile));
}

/** Perfil com que ESTA aba entrou na sala (sessionStorage: abas diferentes não se misturam). */
export function joinedProfile(code: string): Profile | null {
  return parseProfile(safeGet(session, joinedKey(code)));
}

export function wasJoined(code: string): boolean {
  return joinedProfile(code) !== null;
}

export function markJoined(code: string, profile: Profile): void {
  safeSet(session, joinedKey(code), JSON.stringify(profile));
}

export function loadTiltPref(): boolean {
  return safeGet(local, TILT_KEY) !== 'off';
}

export function saveTiltPref(on: boolean): void {
  safeSet(local, TILT_KEY, on ? 'on' : 'off');
}
