import { isPlayerColor, type PlayerColor } from '@cartolina/shared';

const TOKEN_KEY = 'cartolina.token';
const PROFILE_KEY = 'cartolina.profile';
const TILT_KEY = 'cartolina.tilt';
const joinedKey = (code: string) => `cartolina.joined.${code}`;

export interface Profile {
  name: string;
  color: PlayerColor;
}

/** Um token por aba: duas abas são dois jogadores; recarregar a aba mantém o assento. */
export function getToken(): string {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, token);
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
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function wasJoined(code: string): boolean {
  return sessionStorage.getItem(joinedKey(code)) === '1';
}

export function markJoined(code: string): void {
  sessionStorage.setItem(joinedKey(code), '1');
}

export function loadTiltPref(): boolean {
  return localStorage.getItem(TILT_KEY) !== 'off';
}

export function saveTiltPref(on: boolean): void {
  localStorage.setItem(TILT_KEY, on ? 'on' : 'off');
}
