# Cartas do Cúpi: prompts (Google Flow, Nano Banana)

Plano C3 do Cúpi (spec `docs/superpowers/specs/2026-10-19-cupi-design.md` §3). Configuração: **imagem**,
**3:4 retrato**, **x2**. O 3:4 é recortado depois pra **2:3** (a carta, 600×900), cortando um pouco das laterais,
então todo prompt pede a figura centralizada.

Identidade "cartaz de propaganda": serigrafia com só três tintas (vermelho, creme e preto), formas chapadas,
diagonais fortes, textura de retícula. Personagens de uma corte distópica, como no Coup original. Sem texto
(cartaz costuma ter letreiro: o prompt proíbe).

Prompt = **começo** + personagem + **fim**:

- **Começo:** `Bold constructivist propaganda poster, screen-printed with only three inks (signal red, warm cream and ink black), flat graphic shapes, strong diagonal rays and halftone texture:`
- **Fim:** `Single character portrait from the waist up, heroic slightly low angle, figure centered with breathing room on the left and right edges, stylized dystopian palace in the background, no text, no letters, no numbers, no slogans, no border, no frame, no signature.`

Gostos do Rafa que valem aqui também: nada de sombra como ideia principal; pessoas negras retratadas com
dignidade; nunca uma pessoa real.

## Lote de teste

1. **Duque** (`duke`): a stern Black nobleman in a high-collared embroidered coat and a small ducal coronet, one hand resting on a tall stack of coins, a heavy medallion on his chest, calm commanding gaze.
2. **Condessa** (`contessa`): an elegant noblewoman with a lace veil and an open folding fan, raising her gloved hand in a firm stop gesture, a broken dagger falling at her feet, cold confident expression.

## Depois do teste aprovado

3. **Assassino** (`assassin`): a lean hooded figure with a half mask covering the lower face, holding a slim dagger close to the chest, crouched and ready to lunge, sharp angular cloak.
4. **Capitão** (`captain`): a broad-shouldered sea captain in a long coat and tricorn hat holding a brass spyglass, a chained anchor and a pile of seized coins behind.
5. **Embaixador** (`ambassador`): an older diplomat of South Asian descent wearing a ribboned sash, holding a sealed letter with a wax seal, the outline of a globe behind him, a slight knowing smile.
   - O Rafa pediu pra refazer (os dois pareciam políticos reais). Prompt usado na versão escolhida:
     `a fictional middle-aged diplomat with a neatly trimmed beard and small round spectacles, wearing a wide-brimmed hat and a long dark coat crossed by a red sash, holding up a sealed letter with a wax seal between two fingers, the outline of a globe behind him, sly and discreet expression, stylized poster face that does not resemble any real person.`
   - Cuidado pra próximas versões: chapéu de aba larga + barba + "olhar astuto" em estética de cartaz de propaganda pode lembrar caricatura antissemita; evitar "sly" e preferir outra silhueta.

## Escolhidas (2026-10-20)

Geradas no projeto do Flow "out. 15 - 23:16" (o do Diquisti), imagem 3:4 x2, Nano Banana 2.1, 896×1200.
Escolhas do Rafa: Duque opção 2 (gola alta vermelha), Condessa opção 2 (mão de "pare" no centro), Assassino opção 1
(agachado), Capitão opção 2 (casaco vermelho), Embaixador refeito, opção 2 (chapéu e óculos redondos).
Convertidas com `npm run coup:cartas -- <pasta>` → `web/public/coup/cartas/<personagem>.webp`.
