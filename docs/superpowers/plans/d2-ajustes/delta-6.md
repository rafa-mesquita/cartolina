# Ajustes da Tarefa 6 (valem por cima do texto da tarefa)

Depois que o plano foi escrito, o protótipo (`prototipo/dixit/index.html`) ganhou mudanças pedidas pelo usuário.
O CSS da Tarefa 6 deve refletir o protótipo **atual**. Além do arquivo dado na tarefa, faça:

## 1. `CardArt` com volta pra pintura se a imagem falhar
```tsx
export function CardArt({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (REAL_ART && !failed) return <img className="dx-art" src={cardImageUrl(id)} alt="" draggable={false} onError={() => setFailed(true)} />;
  return <div className="dx-art" dangerouslySetInnerHTML={{ __html: cardArtSvg(id) }} />;
}
```
(mantenha o resto da tarefa; se o `CardArt` do texto já tiver o ramo SVG, só acrescente o estado.)
Teste em `web/test/dixit-ui.test.tsx`: renderiza `<CardArt id="d001" />`, tem `img`; `fireEvent.error(img)` → passa a ter `svg`.
CSS: `.dx-art` com `object-fit: cover` (já no texto) — confira que `img.dx-art` ocupa a carta toda.

## 2. CSS que muda (copie do protótipo atual, trocando seletores para os `dx-`)
Regras do protótipo → regras `dx-`:
- `.tcard` transform: acrescente `rotateZ(var(--rz, 0deg))` logo depois de `translate(-50%,-100%)` em `.dx-tcard` (protótipo linha ~73).
- Cartas soltas: `.tcard.loose`, `.tcard.loose:hover`, `.tcard.gather` → `.dx-tcard.loose`, `.dx-tcard.loose:hover`, `.dx-tcard.gather` (linhas ~78–80).
- Feltro recebendo carta: `#felt{transition: … box-shadow .25s, border-color .25s}` e `#stage.drop-ready #felt`, `#stage.drop-no #felt`, `#stage.drop-over #felt` → `.dx-felt.drop-ready`, `.dx-felt.drop-no`, `.dx-felt.drop-over` (linhas ~81–84). A classe vai no próprio `.dx-felt`.
- Numeral: `.roman` e `.tcard.voted .roman` → `.dx-roman` (medalhão no canto inferior esquerdo da carta, `left: -12px; bottom: 10px`, NÃO abaixo da carta: abaixo afunda no feltro) e `.dx-tcard.voted .dx-roman` (fundo mostarda). `.tokens` → `.dx-tokens` com `left: 22px`.
- Dono: `.owner`, `.owner svg`, `.owner.me`, `.tcard.story .tag-story` → `.dx-owner` (selo no topo da carta, `top: -15px`, dentro da face), `.dx-owner .critter` (28 px), `.dx-owner.me`, `.dx-tcard.story .dx-tag-story { margin-bottom: 26px }`. Mantenha a animação `dxPopX`.
- Mão: `.hcard` (transição também em `left .35s var(--spring)`, `cursor: grab`, `touch-action: none`), `.hcard.dragging`, `#hand .hcard.away`, `#hand.off .hcard:not(.dragging)` → `.dx-hcard`, `.dx-hcard.dragging`, `.dx-hand .dx-hcard.away` (com `opacity: 0 !important; visibility: hidden; pointer-events: none; transition: none`), `.dx-hand.off .dx-hcard:not(.dragging) { opacity: .6 }`. **Remova** `.dx-hcard.sel` e `.dx-hcard.played::after` (não existem mais: a carta jogada some da mão).
- Painel da dica: `#panel textarea:disabled`, `#panel .spoken`, `#panel .spoken input`, `#panel .clue-box`, `#panel .clue-box.need`, `@keyframes need` → `.dx-panel textarea:disabled`, `.dx-spoken`, `.dx-spoken input`, `.dx-clue-box`, `.dx-clue-box.need`, `@keyframes dxNeed` (linhas ~141–146).

## 3. Nome
Qualquer texto que o jogador vê diz "Diquisti" (id interno `dixit` continua em classes, pastas e código).
