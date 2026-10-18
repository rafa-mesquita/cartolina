import type { DixitHistoryStats, DixitMatch, DixitPerson } from '@cartolina/shared';
import { clueText, plural } from './format';

/** Uma carta numa faixa ou numa partida: o que aparece na miniatura e o rótulo da carta ampliada. */
export interface CardItem {
  card: string;
  label: string;
  /** Número no selo (vezes ou votos). */
  badge?: string;
  /** Dica embaixo da carta ('' = falada na call). */
  clue?: string;
  teller?: DixitPerson;
}

export const FAMOUS = [
  { key: 'favoritas', title: 'favoritas dos narradores' },
  { key: 'enganaram', title: 'as que mais enganaram' },
  { key: 'mural', title: 'mural de dicas' },
  { key: 'impossiveis', title: 'cartas impossíveis' },
] as const;
export type FamousKey = (typeof FAMOUS)[number]['key'];

export function famousItems(stats: DixitHistoryStats): Record<FamousKey, CardItem[]> {
  return {
    favoritas: stats.favoriteCards.map((c) => ({
      card: c.card,
      badge: `${c.count}×`,
      label: `favorita dos narradores · escolhida ${plural(c.count, 'vez', 'vezes')}`,
    })),
    enganaram: stats.trickiestCards.map((c) => ({
      card: c.card,
      badge: plural(c.count, 'voto', 'votos'),
      label: `enganou ${plural(c.count, 'voto', 'votos')}`,
    })),
    mural: stats.clueWall.map((e) => ({
      card: e.card,
      clue: e.clue,
      teller: e.storyteller,
      label: `${clueText(e.clue)} · ${e.storyteller.name} narrou`,
    })),
    impossiveis: stats.impossibleCards.map((e) => ({
      card: e.card,
      clue: e.clue,
      teller: e.storyteller,
      label: `ninguém achou · ${clueText(e.clue)} · ${e.storyteller.name} narrou`,
    })),
  };
}

/** Grupo da carta ampliada de uma partida (as setas navegam pelas cartas do narrador dela). */
export const matchGroupKey = (matchId: string): string => `partida:${matchId}`;

/** Rodadas numeradas pela ordem na partida (o `round` gravado pode pular números). */
export function matchItems(m: DixitMatch): CardItem[] {
  return m.rounds.map((r, i) => ({
    card: r.storyCard,
    clue: r.clue,
    teller: r.storyteller,
    label: `rodada ${i + 1} · ${r.storyteller.name} narrou · ${clueText(r.clue)}`,
  }));
}
