import { randomInt, type Rng } from '../../rng';
import type { Theme } from './types';

export const THEME_LIMITS = { titulo: 60, extremo: 30 } as const;

const RAW: ReadonlyArray<readonly [string, string, string]> = [
  ['Lugares que você quer visitar', 'nunca iria', 'sonho de vida'],
  ['Comidas que você gosta', 'odeio', 'amo demais'],
  ['Animais mais perigosos', 'inofensivo', 'mortal'],
  ['Coisas mais caras', 'de graça', 'uma fortuna'],
  ['Superpoderes mais úteis', 'inútil', 'muito útil'],
  ['Filmes mais assustadores', 'nada assustador', 'não dormi'],
  ['Coisas que dão mais vergonha', 'zero vergonha', 'quero sumir'],
  ['Profissões mais difíceis', 'moleza', 'dificílima'],
  ['Personagens mais fortes', 'fraquinho', 'invencível'],
  ['Coisas mais fedidas', 'cheiro bom', 'insuportável'],
  ['Presentes de aniversário', 'decepcionante', 'perfeito'],
  ['Lugares pra um primeiro encontro', 'péssimo', 'ideal'],
  ['Esportes mais difíceis', 'qualquer um faz', 'só atleta de elite'],
  ['Coisas mais barulhentas', 'silencioso', 'ensurdecedor'],
  ['Músicas pra cantar no karaokê', 'ninguém canta', 'todo mundo canta'],
  ['Coisas mais pesadas', 'levinho', 'pesadíssimo'],
  ['Comidas mais apimentadas', 'sem ardor', 'fogo na boca'],
  ['Habilidades num apocalipse zumbi', 'inútil', 'salva vidas'],
  ['Desculpas pra faltar num compromisso', 'ninguém acredita', 'convincente'],
  ['Coisas mais fofas', 'nada fofo', 'fofura extrema'],
  ['Invenções mais importantes', 'dispensável', 'mudou o mundo'],
  ['Coisas que você faria por R$ 100', 'nunca', 'na hora'],
  ['Lugares pra se esconder', 'te acham na hora', 'ninguém acha'],
  ['Coisas mais nojentas', 'tranquilo', 'vomitei'],
  ['Bebidas', 'horrível', 'maravilhosa'],
  ['Séries pra maratonar', 'larguei no 1º episódio', 'vi tudo num fim de semana'],
  ['Coisas que te deixam com raiva', 'nem ligo', 'fico possesso'],
  ['Animais de estimação', 'não quero nunca', 'quero agora'],
  ['Jogos de tabuleiro', 'chato', 'viciante'],
  ['Coisas mais rápidas', 'lentíssimo', 'velocidade da luz'],
  ['Celebridades pra conhecer', 'passo', 'ídolo'],
  ['Matérias da escola', 'detestava', 'amava'],
  ['Coisas pra levar numa ilha deserta', 'inútil', 'essencial'],
  ['Sobremesas', 'dispensável', 'divina'],
  ['Coisas mais românticas', 'nada romântico', 'romântico demais'],
  ['Coisas mais perigosas de fazer', 'seguro', 'loucura total'],
  ['Cheiros', 'horrível', 'delicioso'],
  ['Trabalhos', 'pesadelo', 'emprego dos sonhos'],
  ['Coisas que dão medo', 'nenhum medo', 'pavor'],
  ['Coisas mais antigas', 'novinho', 'pré-histórico'],
  ['Tamanho das coisas', 'minúsculo', 'gigantesco'],
  ['Nomes de bebê', 'ninguém usa', 'todo mundo usa'],
  ['Coisas que você faz no domingo', 'nunca faço', 'sempre faço'],
  ['Talentos escondidos', 'inútil', 'impressionante'],
  ['Vilões', 'bonzinho', 'maligno'],
  ['Compras se ganhasse na loteria', 'nem pensaria', 'primeira compra'],
  ['Comidas de festa infantil', 'ninguém come', 'acaba primeiro'],
  ['Coisas difíceis de aprender', 'fácil', 'impossível'],
  ['Coisas que você faria pra ficar famoso', 'jamais', 'faria agora'],
  ['Lugares mais frios', 'calorão', 'congelante'],
  ['Coisas mais estressantes', 'relaxante', 'colapso nervoso'],
  ['Comidas de café da manhã', 'nunca de manhã', 'café perfeito'],
  ['Lanches de madrugada', 'sem graça', 'salvou a noite'],
  ['Coisas úteis numa viagem', 'nem fez falta', 'indispensável'],
  ['Mentiras mais comuns', 'ninguém fala', 'todo mundo fala'],
  ['Jeitos de procrastinar', 'nunca faço', 'faço sempre'],
  ['Coisas mais satisfatórias', 'irritante', 'satisfação pura'],
  ['Pets exóticos', 'normalzinho', 'muito estranho'],
  ['Mortes em filme de terror', 'improvável', 'clichê'],
  ['Coisas que te fazem rir', 'nada engraçado', 'choro de rir'],
  ['Coisas que sua avó diria', 'nunca diria', 'diz toda hora'],
  ['Coisas sem as quais você não vive', 'vivo sem', 'não vivo sem'],
  ['Desenhos animados', 'esqueci que existe', 'marcou a infância'],
  ['Pratos de restaurante', 'barato', 'exorbitante'],
  ['Dores', 'leve', 'insuportável'],
  ['Coisas que você faz no banho', 'nunca', 'sempre'],
  ['Desafios físicos', 'moleza', 'impossível'],
  ['Comidas estranhas', 'normal', 'bizarro'],
  ['Coisas que te dão sono', 'desperta', 'apago na hora'],
  ['Meios de transporte', 'péssimo', 'perfeito'],
  ['Lugares pra morar', 'nunca moraria', 'moraria amanhã'],
  ['Habilidades na cozinha', 'queimo água', 'chef'],
  ['Coisas que você faria numa festa', 'jamais', 'primeiro a fazer'],
  ['Coisas mais inteligentes', 'burrice', 'genialidade'],
  ['Animais que você venceria numa briga', 'perco feio', 'ganho fácil'],
  ['Defeitos de vizinho', 'tolerável', 'insuportável'],
  ['Fantasias de carnaval', 'sem graça', 'genial'],
  ['Coisas que você faz sozinho em casa', 'nunca', 'sempre'],
  ['Coisas mais duradouras', 'dura um segundo', 'eterno'],
  ['Aplicativos do celular', 'apagaria agora', 'não vivo sem'],
  ['Coisas mais brasileiras', 'nada brasileiro', 'Brasil raiz'],
  ['Ingredientes de pizza', 'nunca na pizza', 'indispensável'],
  ['Coisas mais quentes', 'gelado', 'escaldante'],
  ['Momentos constrangedores', 'de boa', 'traumático'],
  ['Hobbies', 'entediante', 'apaixonante'],
  ['Coisas que crianças adoram', 'odeiam', 'adoram'],
  ['Coisas difíceis de esconder dos pais', 'fácil', 'impossível'],
  ['Atividades num dia de chuva', 'tédio', 'perfeito'],
  ['Coisas pra salvar de um incêndio', 'deixaria', 'salvaria primeiro'],
  ['Tarefas que um robô faria', 'humano ganha', 'robô ganha fácil'],
  ['Clichês de novela', 'raro', 'sempre acontece'],
  ['Coisas mais viciantes', 'larga fácil', 'impossível largar'],
  ['Destinos de lua de mel', 'nunca', 'perfeito'],
  ['Coisas mais bonitas', 'feio', 'lindíssimo'],
  ['Coisas que você faria por um amigo', 'nem pensar', 'faria sem pensar'],
  ['Profissões mais respeitadas', 'nenhum respeito', 'muito respeitada'],
  ['Coisas mais misteriosas', 'óbvio', 'mistério total'],
  ['Coisas que dão nostalgia', 'nada', 'muita saudade'],
  ['Comidas de churrasco', 'ninguém pega', 'acaba primeiro'],
  ['Frases difíceis de dizer', 'fácil', 'travei'],
  ['Sons', 'irritante', 'relaxante'],
  ['Animais mais inteligentes', 'pouco esperto', 'gênio'],
  // Novos sempre no fim: a sala guarda os temas já sorteados pelo índice.
  ['Coisas que você faria numa segunda-feira', 'nem morto', 'faço feliz'],
  ['Comidas que você comeria todo dia', 'enjoa na hora', 'comeria pra sempre'],
  ['Coisas que te acordam de madrugada', 'durmo igual', 'pulo da cama'],
  ['Músicas pra levantar uma festa', 'esvazia a pista', 'todo mundo dança'],
  ['Coisas que você esquece em casa', 'nunca esqueço', 'esqueço sempre'],
  ['Programas de domingo', 'tédio total', 'domingo perfeito'],
  ['Coisas que você compraria por impulso', 'jamais', 'já comprei'],
  ['Desculpas pra não ir à academia', 'fraquinha', 'imbatível'],
  ['Coisas mais difíceis de dividir', 'divido fácil', 'é só meu'],
  ['Lugares pra tirar um cochilo', 'impossível dormir', 'sono dos deuses'],
  ['Coisas que tiram sua paciência', 'zen total', 'perco a linha'],
  ['Comidas pra comer de mão', 'precisa de talher', 'feita pra mão'],
  ['Coisas que você faria num avião', 'nunca', 'sempre faço'],
  ['Mensagens que dão medo de abrir', 'abro tranquilo', 'pânico total'],
  ['Coisas que dão inveja', 'nem ligo', 'morro de inveja'],
  ['Brinquedos de parque de diversões', 'calminho', 'radical demais'],
  ['Comidas de rua', 'passo longe', 'paro na hora'],
  ['Coisas que você levaria num piquenique', 'nem lembro', 'não pode faltar'],
  ['Segredos difíceis de guardar', 'guardo fácil', 'conto na hora'],
  ['Coisas que fazem um dia ser bom', 'nem percebo', 'dia ganho'],
];

export const THEMES: readonly Theme[] = RAW.map(([titulo, min, max]) => ({ titulo, min, max }));

export function pickTheme(rng: Rng, used: readonly number[]): { theme: Theme; used: number[] } {
  const all = THEMES.map((_, i) => i);
  const available = all.filter((i) => !used.includes(i));
  const exhausted = available.length === 0;
  // Ao recomeçar o ciclo, não repete o tema que acabou de sair.
  const last = used[used.length - 1];
  const pool = exhausted ? all.filter((i) => i !== last) : available;
  const index = pool[randomInt(rng, pool.length)]!;
  return { theme: THEMES[index]!, used: [...(exhausted ? [] : used), index] };
}

export function cleanTheme(input: Theme): Theme | null {
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
  const titulo = tidy(input.titulo);
  const min = tidy(input.min);
  const max = tidy(input.max);
  const fits = (s: string, limit: number) => {
    const len = Array.from(s).length;
    return len >= 1 && len <= limit;
  };
  if (!fits(titulo, THEME_LIMITS.titulo)) return null;
  if (!fits(min, THEME_LIMITS.extremo) || !fits(max, THEME_LIMITS.extremo)) return null;
  return { titulo, min, max };
}
