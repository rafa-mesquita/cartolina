/**
 * Textos da mesa do Cúpi como dados (porta de `prototipo/coup/texts.js`; mesmas frases).
 *
 * Uma frase é uma lista de pedaços: texto puro, `{ char }` (personagem, destacado em vermelho) ou `{ em }` (texto em destaque).
 * Pedaços de texto vizinhos já saem juntos. A tela desenha a frase com `PhraseView` (Phrase.tsx);
 * testes e `aria-label` usam `phraseText`.
 *
 * Assinaturas (a Task 4 usa estas):
 *   type NameOf = (id: string) => string                  // assento → nome; "você" pra quem vê
 *   type Names = { nameOf: NameOf; isYou: (id) => boolean } // isYou olha o id (nunca o nome: alguém pode se chamar "você")
 *   nameFrom(view: CoupRoomView): Names                   // monta os nomes da visão ("alguém" se o assento não existe)
 *   joinNames(names: string[]): string                    // "Ana", "Ana e Beto", "Ana, Beto e Caio"
 *   actionLabel(kind): { name, hint }                     // rótulo e dica do botão da ação
 *   declaration(game: CoupView, names: Names): { main: Phrase; sub: Phrase | null } | null
 *                                                         // palco durante a janela de reação (null = nada a mostrar)
 *   logLine(entry: CoupLogEntry, names: Names): Phrase | null   // linha do diário (null = linha já contada por outra)
 *   lossTitle(reason: CoupLossReason): string             // título do painel de perder carta (+ LOSS_SUB)
 *   phraseText(phrase): string                            // texto corrido
 *   doing(declared, nameOf): string                       // "pega 3", "assassina Caio"…
 */
import {
  COUP_BLOCKERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  type CoupActionKind,
  type CoupCharacter,
  type CoupDeclared,
  type CoupLogEntry,
  type CoupLossReason,
  type CoupRoomView,
  type CoupView,
} from '@cartolina/shared';
import { CHARACTER_NAMES } from './names';

export type PhrasePart = string | { char: CoupCharacter } | { em: string };
/** Texto com personagens destacados. */
export type Phrase = PhrasePart[];
/** Nome de um assento pelo id ("você" pra quem vê). */
export type NameOf = (id: string) => string;

export const YOU = 'você';
export const SOMEONE = 'alguém';

/** Nomes da visão: `nameOf` (assento → nome; `view.you` → "você"; desconhecido → "alguém") e `isYou` (pelo id). */
export interface Names {
  nameOf: NameOf;
  isYou: (id: string) => boolean;
}

export function nameFrom(view: CoupRoomView): Names {
  const byId = new Map(view.seats.map((s) => [s.id, s.name]));
  const isYou = (id: string) => view.you !== null && id === view.you;
  return { nameOf: (id) => (isYou(id) ? YOU : (byId.get(id) ?? SOMEONE)), isYou };
}

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Monta uma frase juntando os pedaços de texto vizinhos (e descartando os vazios). */
function phrase(...parts: PhrasePart[]): Phrase {
  const out: Phrase = [];
  for (const p of parts) {
    if (p === '') continue;
    const last = out[out.length - 1];
    if (typeof p === 'string' && typeof last === 'string') out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out;
}

/** Texto corrido de uma frase. */
export function phraseText(p: Phrase): string {
  return p.map((x) => (typeof x === 'string' ? x : 'em' in x ? x.em : CHARACTER_NAMES[x.char])).join('');
}

/** Artigo e "um" de cada personagem (a Condessa é feminina). */
const GENDER: Record<CoupCharacter, { art: 'o' | 'a'; um: 'um' | 'uma' }> = {
  duke: { art: 'o', um: 'um' },
  assassin: { art: 'o', um: 'um' },
  captain: { art: 'o', um: 'um' },
  ambassador: { art: 'o', um: 'um' },
  contessa: { art: 'a', um: 'uma' },
};

/** "o Duque" / "a Condessa" (texto puro). */
const the = (c: CoupCharacter): string => `${GENDER[c].art} ${CHARACTER_NAMES[c]}`;

const ACTION: Record<CoupActionKind, { name: string; hint: string }> = {
  income: { name: 'renda', hint: `+${COUP_GAIN.income}` },
  foreignAid: { name: 'ajuda externa', hint: `+${COUP_GAIN.foreignAid} · o Duque bloqueia` },
  coup: { name: 'golpe', hint: `−${COUP_COST.coup} · alvo perde carta` },
  tax: { name: 'taxar', hint: `Duque · +${COUP_GAIN.tax}` },
  assassinate: { name: 'assassinar', hint: `Assassino · −${COUP_COST.assassinate} · alvo perde carta` },
  steal: { name: 'extorquir', hint: `Capitão · tira ${COUP_GAIN.steal}` },
  exchange: { name: 'trocar', hint: 'Embaixador · troca cartas' },
};

/** Rótulo e dica do botão de cada ação. */
export function actionLabel(kind: CoupActionKind): { name: string; hint: string } {
  return ACTION[kind];
}

/** O que a ação faz, no presente ("pega 3", "assassina Caio"). */
export function doing(d: CoupDeclared, nameOf: NameOf): string {
  const target = d.target ? nameOf(d.target) : SOMEONE;
  switch (d.kind) {
    case 'income':
      return 'pega renda';
    case 'foreignAid':
      return `pede ajuda externa (+${COUP_GAIN.foreignAid})`;
    case 'coup':
      return `dá o golpe em ${target}`;
    case 'tax':
      return `pega ${COUP_GAIN.tax}`;
    case 'assassinate':
      return `assassina ${target}`;
    case 'steal':
      return `extorque ${target}`;
    case 'exchange':
      return 'troca cartas';
  }
}

/** Palco durante a janela de reação: frase principal e, às vezes, uma linha menor. `null` = nada a mostrar. */
export function declaration(game: CoupView, names: Names): { main: Phrase; sub: Phrase | null } | null {
  const { nameOf } = names;
  const w = game.window;
  const d = game.declared;
  if (!w || !d) return null;
  if (w.kind === 'action') {
    const claim = COUP_CLAIM[d.kind];
    if (claim) return { main: phrase(`${nameOf(d.actor)} diz: sou `, { char: claim }, ` e ${doing(d, nameOf)}`), sub: null };
    return { main: phrase(`${nameOf(d.actor)} ${doing(d, nameOf)}`), sub: null };
  }
  if (w.kind === 'block' && game.block) {
    return {
      main: phrase(`${nameOf(game.block.by)} bloqueia como `, { char: game.block.as }),
      sub: phrase(`contra a ação: ${nameOf(d.actor)} ${doing(d, nameOf)}`),
    };
  }
  if (w.kind === 'blockOnly') {
    const who = joinNames(w.eligible.map(nameOf));
    const claim = COUP_CLAIM[d.kind];
    const withs: PhrasePart[] = [];
    COUP_BLOCKERS[d.kind].forEach((c, i) => withs.push(i === 0 ? `${GENDER[c].art} ` : ` ou ${GENDER[c].art} `, { char: c }));
    return { main: phrase(`${who} pode bloquear ${claim ? the(claim) : 'a ação'} com `, ...withs), sub: null };
  }
  return null;
}

/** Uma linha do diário. `null` quando a linha já foi contada por outra. */
export function logLine(e: CoupLogEntry, names: Names): Phrase | null {
  const { nameOf } = names;
  switch (e.t) {
    case 'start':
      return phrase(`Partida nova. Começa ${nameOf(e.first)}.`);
    case 'act': {
      const a = nameOf(e.actor);
      const claim = COUP_CLAIM[e.kind];
      if (claim) return phrase(`${a} disse `, { char: claim }, e.target ? ` contra ${nameOf(e.target)}` : '');
      if (e.kind === 'income') return phrase(`${a} pegou renda`);
      if (e.kind === 'foreignAid') return phrase(`${a} pediu ajuda externa`);
      if (e.kind === 'coup') return phrase(`${a} deu o golpe em ${e.target ? nameOf(e.target) : SOMEONE}`);
      return phrase(`${a} fez ${ACTION[e.kind].name}`);
    }
    case 'challenge':
      return phrase(`${nameOf(e.by)} duvidou de ${nameOf(e.of)}: `, { em: e.had ? 'tinha' : 'não tinha' }, ` ${the(e.claim)}`);
    case 'block':
      return phrase(`${nameOf(e.by)} bloqueou como `, { char: e.as });
    case 'blocked':
      return phrase(names.isYou(e.actor) ? 'sua ação foi bloqueada' : `a ação de ${nameOf(e.actor)} foi bloqueada`);
    case 'resolved': {
      const a = nameOf(e.actor);
      switch (e.kind) {
        case 'foreignAid':
        case 'tax':
          return phrase(e.amount > 0 ? `${a} pegou ${e.amount}` : `${a} não pegou nada (tesouro vazio)`);
        case 'steal': {
          const t = e.target ? nameOf(e.target) : SOMEONE;
          return phrase(e.amount > 0 ? `${a} tirou ${e.amount} de ${t}` : `${a} não tirou nada de ${t}`);
        }
        default:
          // renda já foi contada no "act"; golpe, assassinato e troca: a linha "perdeu" / a troca contam
          return null;
      }
    }
    case 'lose':
      return phrase(`${nameOf(e.player)} perdeu ${GENDER[e.card].um} `, { char: e.card });
    case 'out':
      return phrase(`${nameOf(e.player)} está fora`);
    case 'win':
      return phrase(`${nameOf(e.player)} tomou o poder`);
  }
}

const LOSS: Record<CoupLossReason, string> = {
  coup: 'Você levou um golpe',
  assassinated: 'Você foi assassinado',
  challengeWrong: 'Você errou a dúvida',
  caught: 'Pegaram seu blefe',
};

/** Título do painel de perder carta. */
export const lossTitle = (reason: CoupLossReason): string => LOSS[reason] ?? 'Você perde uma carta';

export const LOSS_SUB = 'Escolha a carta que vai revelar';
