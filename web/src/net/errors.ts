/** O servidor recusou por excesso de pedidos (429). As funções de `api.ts` lançam `<algo>_<status>`. */
export function isTooMany(err: unknown): boolean {
  return err instanceof Error && err.message.endsWith('_429');
}

export const TOO_MANY_MESSAGE = 'Calma! Tenta de novo em um minutinho.';
