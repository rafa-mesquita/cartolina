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

/** Grava sem quebrar quando o armazenamento está bloqueado ou cheio (modo privado, cotas). */
function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // sem persistência: o app segue funcionando na sessão atual
  }
}

/** Um token por aba: duas abas são dois jogadores; recarregar a aba mantém o assento. */
export function getToken(): string {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // armazenamento bloqueado
  }
  if (!token) {
    token = uuidV4();
    safeSet(sessionStorage, TOKEN_KEY, token);
  }
  return token;
}

export function loadProfile(): Profile | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as { name?: unknown; color?: unknown } | null;
    if (raw && typeof raw.name === 'string' && isPlayerColor(raw.color)) return { name: raw.name, color: raw.color };
  } catch {
    // perfil corrompido: ignora
  }
  return null;
}

export function saveProfile(profile: Profile): void {
  safeSet(localStorage, PROFILE_KEY, JSON.stringify(profile));
}

export function wasJoined(code: string): boolean {
  return sessionStorage.getItem(joinedKey(code)) === '1';
}

export function markJoined(code: string): void {
  safeSet(sessionStorage, joinedKey(code), '1');
}

export function loadTiltPref(): boolean {
  return localStorage.getItem(TILT_KEY) !== 'off';
}

export function saveTiltPref(on: boolean): void {
  safeSet(localStorage, TILT_KEY, on ? 'on' : 'off');
}
