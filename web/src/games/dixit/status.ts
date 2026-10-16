import type { DixitView, RoomView } from '@cartolina/shared';

/** Nome por id: quem está vendo é "você". */
export function namer(view: RoomView): (id: string) => string {
  return (id) => (id === view.you ? 'você' : (view.seats.find((s) => s.id === id)?.name ?? 'alguém'));
}

/** Cor (personagem) por id. */
export function colorer(view: RoomView): (id: string) => string {
  return (id) => view.seats.find((s) => s.id === id)?.color ?? '#D9C2A0';
}

/** Os outros jogadores, em ordem, começando depois de quem vê (quem vê fica fora). */
export function othersAfter(seatIds: readonly string[], me: string | null): string[] {
  const i = me ? seatIds.indexOf(me) : -1;
  return i >= 0 ? [...seatIds.slice(i + 1), ...seatIds.slice(0, i)] : [...seatIds];
}

export type Tone = 'act' | 'ok' | '';

/** O que aparece embaixo do personagem de cada assento. */
export function seatStatus(g: DixitView, id: string): { text: string; tone: Tone } {
  if (!g.inRound.includes(id)) return g.phase === 'lobby' || g.phase === 'gameover' ? { text: '', tone: '' } : { text: 'assistindo', tone: '' };
  const teller = g.storyteller === id;
  const done = g.confirmed.includes(id);
  switch (g.phase) {
    case 'storytelling':
      return teller ? { text: 'narrando…', tone: 'act' } : { text: 'esperando', tone: '' };
    case 'submitting':
      return teller ? { text: 'contou ✓', tone: 'ok' } : done ? { text: 'pronto ✓', tone: 'ok' } : { text: 'escolhendo…', tone: 'act' };
    case 'voting':
      return teller ? { text: 'esperando', tone: '' } : done ? { text: 'votou ✓', tone: 'ok' } : { text: 'votando…', tone: 'act' };
    default:
      return { text: '', tone: '' };
  }
}

/** Pílula do topo: fase (com contagem de quem já confirmou) e meta. */
export function phaseLabel(g: DixitView): string {
  const others = g.inRound.filter((p) => p !== g.storyteller);
  const done = others.filter((p) => g.confirmed.includes(p)).length;
  const phase = {
    lobby: 'lobby',
    storytelling: 'narração',
    submitting: `escolha · ${done} de ${others.length}`,
    voting: `votação · ${done} de ${others.length}`,
    reveal: 'revelação',
    gameover: 'fim de jogo',
  }[g.phase];
  return `${phase} · meta ${g.target}`;
}
