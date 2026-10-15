import { critterSvg } from '../brand/critters';

/** Desenho do personagem da cor (só o desenho; o nome do bicho fica pros leitores de tela de quem usar). */
export function Critter({ color }: { color: string }) {
  return <span className="critter" dangerouslySetInnerHTML={{ __html: critterSvg(color) }} />;
}
