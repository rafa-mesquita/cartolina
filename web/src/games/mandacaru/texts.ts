/**
 * Frases da mesa do Mandacaru (porte de `prototipo/hexa/texts.js`; mesmas frases).
 *
 * Os nomes vêm da sala, então não há o mapa de artigos do protótipo: "de Bia", "com Léo" (sem "da"/"do").
 * "você" ganha forma própria onde ficaria estranho ("uma carta sua", "acabou o seu tempo").
 *
 *   type NameOf = (id: string) => string    // assento → nome; "você" pra quem vê
 *   nameFrom(view): NameOf                  // monta a partir da visão ("alguém" se o assento não existe)
 *   joinE(["a","b","c"]): "a, b e c"
 *   resList(res): "2 madeira e 1 pedra"     // vazio = "nada"
 *   hexName(layout, h): "roçado 9"
 *   logLine(entry, nameOf, layout?): { text, strong? }   // uma frase por linha do diário
 */
import type { BoardLayout, MandacaruLogEntry, MandacaruRoomView, Resources } from '@cartolina/shared';
import { CORDEL_NAME, RES_NAME, RES_ORDER, TERRAIN_NAME } from './names';

export * from './names';

/** Nome de um assento pelo id ("você" pra quem vê). */
export type NameOf = (id: string) => string;

/** Uma linha do diário: a frase toda e, se houver, o nome de quem agiu (a mesa pode destacar). */
export interface LogLine {
  text: string;
  strong?: string;
}

export const YOU = 'você';

/** Nomes da visão: "você" pra quem vê, o nome da sala pros outros, "alguém" se o assento sumiu. */
export function nameFrom(view: Pick<MandacaruRoomView, 'you' | 'seats'>): NameOf {
  return (id) => {
    if (view.you !== null && id === view.you) return YOU;
    return view.seats.find((s) => s.id === id)?.name ?? 'alguém';
  };
}

/** "a", "a e b", "a, b e c". */
export const joinE = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** "2 feijão e 1 pedra" (sem os zerados); vazio = "nada". */
export function resList(res: Resources): string {
  const parts = RES_ORDER.filter((r) => res[r] > 0).map((r) => `${res[r]} ${RES_NAME[r]}`);
  return parts.length ? joinE(parts) : 'nada';
}

/** Nome do terreno com o número (ex.: "roçado 9"); sem tabuleiro, "outro terreno". */
export function hexName(layout: BoardLayout | null | undefined, h: number): string {
  const tile = layout?.hexes[h];
  if (!tile) return 'outro terreno';
  return tile.number === null ? TERRAIN_NAME[tile.terrain] : `${TERRAIN_NAME[tile.terrain]} ${tile.number}`;
}

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const de = (name: string): string => `de ${name}`;
const com = (name: string): string => (name === YOU ? 'com você' : `com ${name}`);

/** A frase sem a maiúscula do começo (`logLine` põe). */
function sentence(e: MandacaruLogEntry, n: NameOf, layout: BoardLayout | null | undefined): string {
  switch (e.t) {
    case 'start':
      return `começou a partida! ordem: ${joinE(e.order.map(n))}.`;
    case 'place':
      return `${n(e.player)} pôs ${e.piece === 'house' ? 'uma casa' : 'uma estrada'}.`;
    case 'setup_gain':
      return `${n(e.player)} ganhou ${resList(e.gain)} da segunda casa.`;
    case 'roll': {
      const sum = e.dice[0] + e.dice[1];
      if (sum === 7) return `${n(e.player)} tirou 7: lá vem o Carcará!`;
      // "Bia tirou 8: você ganhou 2 feijão; Duda 1 pedra."
      const gains = Object.entries(e.gains).map(([p, g], i) => `${n(p)}${i === 0 ? ' ganhou' : ''} ${resList(g)}`);
      let s = gains.length ? `${n(e.player)} tirou ${sum}: ${gains.join('; ')}.` : `${n(e.player)} tirou ${sum}: ninguém ganhou nada.`;
      if (e.short.length) s += ` Faltou ${joinE(e.short.map((r) => RES_NAME[r]))} no banco: ninguém recebeu.`;
      return s;
    }
    case 'discard':
      return `${n(e.player)} descartou ${e.count} ${e.count === 1 ? 'carta' : 'cartas'}.`;
    case 'carcara':
      return `${n(e.player)} levou o Carcará pro ${hexName(layout, e.hex)}.`;
    case 'steal': {
      const thief = n(e.player);
      const victim = n(e.from);
      if (thief === YOU) return `com o Carcará, você levou uma carta ${de(victim)}.`;
      if (victim === YOU) return `o Carcará ${de(thief)} levou uma carta sua.`;
      return `o Carcará ${de(thief)} levou uma carta ${de(victim)}.`;
    }
    case 'build':
      return e.piece === 'road' ? `${n(e.player)} fez uma estrada.` : e.piece === 'house' ? `${n(e.player)} levantou uma casa.` : `${n(e.player)} subiu uma vila.`;
    case 'buy_cordel':
      return `${n(e.player)} comprou um cordel.`;
    case 'play':
      if (e.kind === 'chuva') return `${n(e.player)} jogou Chuva no sertão: ${joinE((e.resources ?? []).map((r) => RES_NAME[r]))}.`;
      if (e.kind === 'atravessador') {
        const r = e.resources?.[0];
        return `${n(e.player)} jogou Atravessador e juntou ${e.total ?? 0}${r ? ` ${RES_NAME[r]}` : ''} de todo mundo.`;
      }
      return `${n(e.player)} jogou ${CORDEL_NAME[e.kind]}.`;
    case 'trade':
      return `${n(e.a)} trocou ${resList(e.aGives)} por ${resList(e.bGives)} ${com(n(e.b))}.`;
    case 'feira':
      return `${n(e.player)} trocou ${e.gave} ${RES_NAME[e.give]} por ${e.got} ${RES_NAME[e.want]} na feira.`;
    case 'award': {
      const what = e.award === 'longest' ? 'a maior estrada' : 'a maior comitiva';
      return e.player === null ? `${what} ficou sem dono.` : `${n(e.player)} agora tem ${what} (+2).`;
    }
    case 'timeout':
      return n(e.player) === YOU ? 'acabou o seu tempo.' : `acabou o tempo ${de(n(e.player))}.`;
    case 'end_turn':
      return `${n(e.player)} passou a vez.`;
    case 'win':
      return `${n(e.player)} venceu com ${e.points} pontos!`;
  }
}

/** Quem agiu na linha (pra destacar); `start` e `award` sem dono não têm. */
function actor(e: MandacaruLogEntry): string | null {
  switch (e.t) {
    case 'start':
      return null;
    case 'trade':
      return e.a;
    case 'award':
      return e.player;
    default:
      return e.player;
  }
}

/** Uma frase pra cada linha do diário. `layout` (opcional) dá o nome do terreno do Carcará. */
export function logLine(e: MandacaruLogEntry, nameOf: NameOf, layout?: BoardLayout | null): LogLine {
  const who = actor(e);
  const text = cap(sentence(e, nameOf, layout));
  return who === null ? { text } : { text, strong: nameOf(who) };
}
