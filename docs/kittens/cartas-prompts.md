# Cartas do Tatubum: prompts (Google Flow, Nano Banana 2.1) — rascunho pro Plano T3

Rascunho de 2026-10-19, ainda **não gerado**. Identidade: pixel art, paleta "noite no cerrado" (spec §5.4).
A arte entra no meio da carta (o nome e a frase são desenhados pelo site), num quadro **1:1**.

Configuração sugerida no Flow: **Imagem**, **1:1**, **x2** (como no Diquisti, o Rafa dá coração na que fica).
Primeiro um **lote de teste** com 3 cartas (Tatubum, Nem vem!, Capivara) pra aprovar o estilo antes do resto.

Prompt = **começo** + cena + **fim**:

- **Começo:** `Pixel art sprite in a 16-bit retro video game style:`
- **Fim:** `Single centered subject with breathing room around it, on a flat solid cream background (#f4e9d0). Crisp hard-edged pixels, limited palette, dark brown one-pixel outline, no anti-aliasing, no gradients, no blur, no text, no letters, no numbers, no border, no frame.`

Cuidado conhecido: imagem de IA "em pixel art" costuma sair com pixels de tamanhos diferentes e borda
borrada. O script de importação reduz pra uma grade fixa (ex.: 64×64, vizinho mais próximo) e amplia de volta,
o que limpa a maior parte. Se mesmo assim ficar ruim, a alternativa é manter os sprites desenhados à mão do
protótipo (`prototipo/tatubum/sprites.js`) e só refiná-los.

## Cartas

| # | Carta | Cena |
|---|---|---|
| 1 | **Tatubum** | a brown three-banded armadillo (tatu-bola) curled into a tight ball, a lit fuse sticking out of its shell with bright orange and yellow sparks, two nervous eyes peeking out between the shell bands |
| 2 | **Cafuné** | a human hand gently petting the head of a relaxed brown armadillo that smiles with closed eyes, three small pink pixel hearts floating above |
| 3 | **Nem vem!** | an open palm raised in a firm stop gesture inside a bold red circle, short white motion lines around the fingers |
| 4 | **Ataque** | a small brown armadillo warrior charging forward with a tiny steel sword held high and a short red cape, determined face |
| 5 | **Pular** | a small brown armadillo jumping high over a little wooden hurdle, a dotted arc showing its jump, two blue chevron arrows pointing right |
| 6 | **Favor** | a small brown armadillo holding out a yellow gift box with a red ribbon, hopeful sparkling eyes |
| 7 | **Embaralhar** | three playing cards with dark blue backs spinning in mid-air in a swirl, purple motion lines |
| 8 | **Espiar** | a small brown armadillo looking through a brass spyglass, its single eye hugely magnified in the lens |
| 9 | **Capivara** | a calm capybara sitting with half-closed relaxed eyes and a small orange on top of its head |
| 10 | **Mico-leão** | a golden lion tamarin face with a bright fluffy orange mane and curious dark eyes |
| 11 | **Quati** | a coati standing on its hind legs, long pointed snout, ringed brown and cream tail raised |
| 12 | **Tamanduá** | a giant anteater walking, very long thin snout, bushy grey tail and the black and white diagonal stripe on its shoulder |
| 13 | **Preguiça** | a three-toed sloth hanging from a short branch with a sleepy happy smile |
| 14 | **Verso** | a brown armadillo curled into a ball with an unlit fuse, centered on a night-blue background full of tiny pixel stars (this one replaces the cream background in the ending) |

Depois de escolhidas: `npm run kittens:cartas -- <pasta>` (a criar no T3) converte pra
`web/public/kittens/cards/<tipo>.webp`.
