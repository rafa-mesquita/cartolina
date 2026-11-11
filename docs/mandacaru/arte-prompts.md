# Mandacaru — prompts das artes (Google Flow)

Gerado no Google Flow (Nano Banana), no projeto do Diquisti, **2 opções de cada**. O Rafa dá coração na opção que fica.
Peças soltas (Carcará, casa, vila, barraca, recursos) são geradas sobre **fundo liso creme** e recortadas depois
(o fundo é tirado da borda pra dentro, sem furar as partes da mesma cor, como no Tatubum).

Os estilos descrevem **tradições** da arte popular do Nordeste (pintura naïf das feiras do Agreste, o Movimento
Armorial, a xilogravura de cordel), pelo traço, cor e composição — nunca imitando um artista específico.

## Rodada 1 — escolher o estilo (2026-11-10)

A mesma coisa nos três estilos: o fundo da mesa (16:9) e o Carcará (1:1).

### Estilos

- **A · naïf nordestino:** `Brazilian Northeastern naive folk painting, like the paintings sold at country fairs in the Agreste: flat bright acrylic colors, simple rounded shapes, naive perspective, joyful mood, visible brush texture, warm orange and pink sky, terracotta and ochre earth.`
- **B · armorial:** `Brazilian Armorial movement style: stylized, symmetrical, medieval-like folk iconography, bold dark outlines, ornamental patterns, flat color in a limited earthy palette of ochre, brick red, black and cream, heraldic feeling.`
- **C · cordel colorido:** `Brazilian cordel woodcut print, colored by hand: thick irregular black carved lines, visible wood grain, flat hand-applied colors in ochre, brick red, sage green and sky blue on cream paper.`

### Fundo da mesa (16:9)

`<estilo> A wide calm landscape of the Brazilian caatinga in the late afternoon: twisted grey leafless trees, mandacaru cacti, low thorny shrubs, rounded rocky outcrops, a tiny whitewashed mud house far away on the horizon, warm sky. Soft and low-contrast, with quiet empty areas and no strong subject in the center, because a game board will sit on top of it. No people, no text, no letters, no frame, no border.`

### Escolha do Rafa (2026-11-10)

- **Fundo da mesa:** o armorial (B), o simétrico, com as árvores espelhadas.
- **Carcará:** o do cordel colorido (C), o primeiro.
- As peças da rodada 2 seguem o **cordel colorido (C)**, que combina com o Carcará e com o fundo.

### Carcará (1:1)

`<estilo> A crested caracara bird (carcará) standing proudly on a short dry branch, side view, full body: dark brown cap and wings, pale barred chest and neck, bare orange-red face, hooked pale beak with a dark tip, yellow legs. Isolated and centered on a plain flat pale cream background, nothing else in the image. No text, no letters, no frame, no border.`

## Rodada 2 — as peças no cordel colorido (2026-11-10)

Estilo (todas): `Brazilian cordel woodcut print, colored by hand: thick irregular black carved lines, visible wood grain, flat hand-applied colors in ochre, brick red, sage green and sky blue.`
Final fixo das peças soltas: `Isolated and centered on a plain flat pale cream background, nothing else in the image. No text, no letters, no frame, no border.`
Final fixo dos terrenos: `The scene fills the whole square edge to edge, seen from slightly above, like a tile of a board game. No text, no letters, no frame, no border.`

### Terrenos (1:1, enchem o quadrado; recortados no hexágono pelo código)

- **caatinga (madeira):** `A patch of dry caatinga forest: twisted grey leafless trees with tiny green leaves, a few thorny shrubs, fallen branches on cracked ochre ground.`
- **malhada (couro):** `A dry pasture of the sertão with a few goats grazing among low shrubs and a simple stick fence, straw-colored grass.`
- **roçado (feijão):** `A small family bean field in the sertão: neat rows of green bean plants with pods, a hoe resting on the earth, warm ochre soil.`
- **barreiro (barro):** `A clay pit by a small pond in the sertão: wet brick-red clay, handmade clay bricks drying in rows, a couple of clay pots.`
- **lajedo (pedra):** `A large rounded granite outcrop (lajedo) of the sertão with smaller boulders around it and a little mandacaru cactus growing from a crack.`
- **rio seco:** `A dry riverbed in the sertão: deeply cracked pale earth, smooth pebbles, a dead branch, bright sun overhead.`

### Peças soltas (1:1, fundo liso pra recortar)

- **casa:** `A small whitewashed rammed-earth house (taipa) of the Brazilian sertão with a terracotta tile roof, a blue wooden door and one small window, front three-quarter view.`
- **vila:** `A small cluster of whitewashed sertão houses with terracotta roofs around a little white chapel with a bell tower and a cross, front three-quarter view.`
- **feira:** `A small country-fair market stall of the Brazilian Northeast: wooden stall with a red and cream striped awning, baskets of beans and cassava on the counter.`

### Escolha do Rafa na rodada 2 (2026-11-11)

Um coração em cada: barraca de feira, vila, casa, rio seco, lajedo, barreiro, roçado, malhada, caatinga.
Convertidas com `npm run mandacaru:artes -- <pasta>` (terrenos 512×512; peças recortadas).

## Rodada 3 — recursos e cordéis (2026-11-11)

Recursos (1:1, fundo liso pra recortar; ícone das cartas da mão), com o estilo e o final fixo das peças soltas:

- **madeira (wood):** `A bundle of firewood sticks tied with a rope.`
- **barro (brick):** `A small stack of handmade clay bricks next to a round clay pot.`
- **couro (leather):** `A folded piece of tanned brown leather with a leather cowboy hat of the sertão on top.`
- **feijão (beans):** `A woven straw basket full of brown beans, with a few beans spilled beside it.`
- **pedra (stone):** `A small pile of rough grey granite stones.`

Cordéis (1:1, **cena cheia**, como a capa de um folheto de cordel), estilo da rodada 2 +
`The scene fills the whole square, like the woodcut on the cover of a cordel booklet. No text, no letters, no frame, no border.`
Pessoas com dignidade, de várias cores de pele (inclusive pessoas negras em destaque).

- **Vaqueiro:** `A proud Black vaqueiro of the sertão in full leather gear (leather hat, leather jacket and leggings) riding a horse through the caatinga, chasing a runaway steer.`
- **Mutirão:** `A mutirão: neighbors of different skin tones working together with hoes and wheelbarrows to open a dirt road in the sertão, smiling, under the sun.`
- **Chuva no sertão:** `Rain finally falling over the caatinga: dark clouds, rain lines, the grey trees turning green, a happy family watching the rain from the door of their house.`
- **Atravessador:** `A traveling trader of the sertão leading a donkey loaded with full sacks along a dusty road, a market town far behind.`
- **Ponto · Igrejinha (point-1):** `A small white chapel of the sertão with a bell tower, on a hill, with a few people arriving for the feast.`
- **Ponto · Açude (point-2):** `A small earth dam reservoir (açude) full of water in the sertão, children swimming and a woman fetching water.`
- **Ponto · Cisterna (point-3):** `A round white rainwater cistern next to a small rural house in the sertão, a Black woman proudly standing by it.`
- **Ponto · Escola (point-4):** `A small rural schoolhouse in the sertão with children of different skin tones arriving with their notebooks, a teacher at the door.`
- **Ponto · Casa de Farinha (point-5):** `A casa de farinha: a rustic shed where a family makes cassava flour, one roasting the flour in a large clay oven, others peeling cassava.`
