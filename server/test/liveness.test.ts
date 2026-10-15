import { describe, expect, it } from 'vitest';
import { HEARTBEAT_TIMEOUT_MS, SWEEP_INTERVAL_MS, isStale, nextWakeAt } from '../src/liveness';

describe('liveness', () => {
  it('socket que pingou há pouco não está vencido', () => {
    expect(isStale(1_000, 0, 1_000 + HEARTBEAT_TIMEOUT_MS)).toBe(false);
    expect(isStale(1_000, 0, 1_001 + HEARTBEAT_TIMEOUT_MS)).toBe(true);
  });

  it('sem nenhum ping, conta a partir da conexão', () => {
    expect(isStale(null, 5_000, 5_000 + HEARTBEAT_TIMEOUT_MS)).toBe(false);
    expect(isStale(null, 5_000, 5_001 + HEARTBEAT_TIMEOUT_MS)).toBe(true);
  });

  it('com sockets abertos acorda pelo menos a cada varredura', () => {
    expect(nextWakeAt(1_000_000, 2, 100)).toBe(100 + SWEEP_INTERVAL_MS);
    expect(nextWakeAt(500, 2, 100)).toBe(500);
    expect(nextWakeAt(1_000_000, 0, 100)).toBe(1_000_000);
  });
});
