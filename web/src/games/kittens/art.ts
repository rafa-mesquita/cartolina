/*
 * Artes do Tatubum (geradas no Google Flow, fundo recortado). Vite empacota cada arquivo e devolve a URL final.
 * No protótipo eram `art/<tipo>.png`; aqui entram por `import`, pra o build pôr o hash no nome.
 */
import type { KittensCardKind } from '@cartolina/shared';
import ataque from './art/ataque.png';
import boto from './art/boto.png';
import cafune from './art/cafune.png';
import capivara from './art/capivara.png';
import embaralhar from './art/embaralhar.png';
import espiar from './art/espiar.png';
import favor from './art/favor.png';
import feitico from './art/feitico.png';
import latido from './art/latido.png';
import mico from './art/mico.png';
import nemvem from './art/nemvem.png';
import olhado from './art/olhado.png';
import preguica from './art/preguica.png';
import pular from './art/pular.png';
import quati from './art/quati.png';
import tamandua from './art/tamandua.png';
import tatubum from './art/tatubum.png';
import verso from './art/verso.webp';

/** Arte de cada carta, por tipo. */
export const ART: Record<KittensCardKind, string> = {
  tatubum,
  cafune,
  nemvem,
  ataque,
  pular,
  favor,
  embaralhar,
  espiar,
  latido,
  olhado,
  feitico,
  capivara,
  mico,
  quati,
  tamandua,
  preguica,
  boto,
};

/** Verso das cartas (o monte, as cartas dos outros jogadores). */
export const VERSO: string = verso;

/** O tatu soldado do Desarme (entra andando pela mesa e corta o fio): é a mesma imagem da carta Desarme (cafune). */
export const SOLDADO: string = cafune;
