/**
 * Textos das regras do Cúpi dentro da mesa (a colinha do botão "regras" e as dicas rápidas), gerados das tabelas do
 * `shared` e dos nomes de `names.ts`: mudou a regra, mudou o texto (a colinha nunca contradiz o jogo).
 */
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  COUP_MUST_COUP_AT,
  COUP_START_COINS,
  COUP_TARGETED,
  COUP_WINDOW_MS,
  type CoupActionKind,
  type CoupCharacter,
} from '@cartolina/shared';
import { CHARACTER_NAMES } from './names';
import { actionLabel, the } from './texts';

/** Cartas que a troca compra do baralho (as regras do `shared` compram 2 e devolvem o mesmo tanto). */
const EXCHANGE_DRAW = 2;

/** A ação como coisa barrada ("bloqueia a ajuda externa"). */
const NOUN: Record<CoupActionKind, string> = {
  income: 'a renda',
  foreignAid: 'a ajuda externa',
  coup: 'o golpe',
  tax: 'a taxa',
  assassinate: 'o assassinato',
  steal: 'a extorsão',
  exchange: 'a troca',
};

/** Efeito curto, pra tabela ("+3", "−7, alvo perde carta"). */
const SHORT: Record<CoupActionKind, string> = {
  income: `+${COUP_GAIN.income}`,
  foreignAid: `+${COUP_GAIN.foreignAid}`,
  coup: `−${COUP_COST.coup}, alvo perde carta`,
  tax: `+${COUP_GAIN.tax}`,
  assassinate: `−${COUP_COST.assassinate}, alvo perde carta`,
  steal: `tira ${COUP_GAIN.steal} do alvo`,
  exchange: `compra ${EXCHANGE_DRAW}, devolve ${EXCHANGE_DRAW}`,
};

/** Efeito por extenso, pras dicas e pros personagens. */
const LONG: Record<CoupActionKind, string> = {
  income: `pega ${COUP_GAIN.income}`,
  foreignAid: `pega ${COUP_GAIN.foreignAid}`,
  coup: `paga ${COUP_COST.coup}, alvo perde carta`,
  tax: `pega ${COUP_GAIN.tax}`,
  assassinate: `paga ${COUP_COST.assassinate}, alvo perde carta`,
  steal: `tira ${COUP_GAIN.steal} de alguém`,
  exchange: `compra ${EXCHANGE_DRAW} e devolve ${EXCHANGE_DRAW}`,
};

/** O que o personagem faz na sua vez ("taxar, pega 3"; o assassino mostra o preço entre parênteses). */
const ON_TURN: Record<CoupActionKind, string> = {
  income: `${actionLabel('income').name}, ${LONG.income}`,
  foreignAid: `${actionLabel('foreignAid').name}, ${LONG.foreignAid}`,
  coup: `${actionLabel('coup').name}, ${LONG.coup}`,
  tax: `${actionLabel('tax').name}, ${LONG.tax}`,
  assassinate: `${actionLabel('assassinate').name} (paga ${COUP_COST.assassinate}), alvo perde carta`,
  steal: `${actionLabel('steal').name}, ${LONG.steal}`,
  exchange: `${actionLabel('exchange').name}, ${LONG.exchange}`,
};

/** "Duque", "Capitão ou Embaixador". */
const orNames = (cs: readonly CoupCharacter[]): string => cs.map((c) => CHARACTER_NAMES[c]).join(' ou ');

export interface ActionRow {
  kind: CoupActionKind;
  /** Nome do botão ("taxar"). */
  name: string;
  /** Quem a ação diz ser ("Duque"), ou "—" (qualquer um faz, ninguém duvida). */
  claim: string;
  /** "+3", "−7, alvo perde carta", "tira 2 do alvo"… */
  effect: string;
  /** "ninguém", "Duque", "Capitão ou Embaixador". */
  blockedBy: string;
}

/** As 7 ações, na ordem dos botões. */
export const ACTION_ROWS: readonly ActionRow[] = COUP_ACTION_KINDS.map((kind) => {
  const claim = COUP_CLAIM[kind];
  const blockers = COUP_BLOCKERS[kind];
  return {
    kind,
    name: actionLabel(kind).name,
    claim: claim === null ? '—' : CHARACTER_NAMES[claim],
    effect: SHORT[kind],
    blockedBy: blockers.length === 0 ? 'ninguém' : orNames(blockers),
  };
});

export interface CharacterInfo {
  character: CoupCharacter;
  name: string;
  /** Ação e efeito ("taxar, pega 3"), ou "nenhuma ação". */
  onTurn: string;
  /** O que barra ("a ajuda externa"), ou "nada". */
  blocks: string;
}

/** "a ajuda externa", "a renda e a troca". */
const andList = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** Os 5 personagens: o que fazem na sua vez e o que bloqueiam. */
export const CHARACTER_INFO: readonly CharacterInfo[] = COUP_CHARACTERS.map((character) => {
  const acts = COUP_ACTION_KINDS.filter((k) => COUP_CLAIM[k] === character);
  const blocks = COUP_ACTION_KINDS.filter((k) => COUP_BLOCKERS[k].includes(character));
  return {
    character,
    name: CHARACTER_NAMES[character],
    onTurn: acts.length === 0 ? 'nenhuma ação' : acts.map((k) => ON_TURN[k]).join('; '),
    blocks: blocks.length === 0 ? 'nada' : andList(blocks.map((k) => NOUN[k])),
  };
});

const actionNames = (ks: readonly CoupActionKind[]): string => andList(ks.map((k) => actionLabel(k).name));
const capitalized = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Ações sem personagem e sem bloqueio: acontecem direto, sem janela (renda e golpe). */
const DIRECT = COUP_ACTION_KINDS.filter((k) => COUP_CLAIM[k] === null && COUP_BLOCKERS[k].length === 0);
/** Bloqueáveis com alvo: só o alvo bloqueia (assassinar e extorquir). */
const TARGET_BLOCKS = COUP_ACTION_KINDS.filter((k) => COUP_TARGETED[k] && COUP_BLOCKERS[k].length > 0);
/** Bloqueáveis sem alvo: qualquer um bloqueia (ajuda externa, como Duque). */
const ANYONE_BLOCKS = COUP_ACTION_KINDS.filter((k) => !COUP_TARGETED[k] && COUP_BLOCKERS[k].length > 0);

/** Objetivo e o resto do jogo em frases curtas (fiéis a quando o jogo abre janela e a quem pode bloquear). */
export const HOW_IT_WORKS: { goal: string; items: readonly string[] } = {
  goal: `Ser o último com carta na mão. Cada um começa com 2 cartas viradas pra baixo e ${COUP_START_COINS} moedas.`,
  items: [
    'Na sua vez, escolha uma ação. Dá pra dizer que é qualquer personagem, mesmo sem ter a carta.',
    `Quando a ação diz ser um personagem, ou dá pra ser bloqueada, os outros têm ${COUP_WINDOW_MS / 1000} segundos pra ` +
      `duvidar, bloquear ou deixar. ${capitalized(actionNames(DIRECT))} acontecem direto.`,
    'Duvidou e a pessoa não tinha a carta: ela perde uma. Se tinha, quem duvidou perde, e ela troca a carta mostrada.',
    'Bloquear também é dizer que tem um personagem, e dá pra duvidar. ' +
      `Em ${actionNames(TARGET_BLOCKS)}, só o alvo bloqueia; ` +
      ANYONE_BLOCKS.map((k) => `na ${actionLabel(k).name}, qualquer um bloqueia como ${orNames(COUP_BLOCKERS[k])}`).join('; ') +
      '.',
    'Perder carta é virá-la pra cima. Sem carta virada pra baixo, você está fora.',
    `Trocar: você compra ${EXCHANGE_DRAW} do baralho, olha tudo e devolve ${EXCHANGE_DRAW}.`,
    `Com ${COUP_MUST_COUP_AT} moedas ou mais, a única ação é o golpe.`,
  ],
};

/** "o Duque", "o Capitão ou o Embaixador". */
const orThe = (cs: readonly CoupCharacter[]): string => cs.map(the).join(' ou ');

/** Dica rápida de uma ação: "taxar · diz ser o Duque · pega 3 · ninguém bloqueia". */
export function actionTip(kind: CoupActionKind): string {
  const claim = COUP_CLAIM[kind];
  const blockers = COUP_BLOCKERS[kind];
  return [
    actionLabel(kind).name,
    claim === null ? 'qualquer um faz' : `diz ser ${the(claim)}`,
    LONG[kind],
    blockers.length === 0 ? 'ninguém bloqueia' : `${orThe(blockers)} bloqueia`,
  ].join(' · ');
}

/** Dica rápida de um personagem: "Duque · na sua vez: taxar, pega 3 · bloqueia a ajuda externa". */
export function characterTip(c: CoupCharacter): string {
  const i = CHARACTER_INFO.find((x) => x.character === c)!;
  return `${i.name} · na sua vez: ${i.onTurn} · ${i.blocks === 'nada' ? 'não bloqueia nada' : `bloqueia ${i.blocks}`}`;
}

/** Dica rápida dos botões da janela. */
export function reactionTip(kind: 'challenge' | 'pass' | 'block', as?: CoupCharacter): string {
  switch (kind) {
    case 'challenge':
      return 'duvidar · se ela não tiver a carta, ela perde uma; se tiver, você perde';
    case 'pass':
      return 'deixa · não reage nesta janela';
    case 'block':
      return as === undefined
        ? 'bloquear · você diz ter a carta e barra a ação; dá pra duvidar de você'
        : `bloquear · você diz ser ${the(as)} e barra a ação; dá pra duvidar de você`;
  }
}
