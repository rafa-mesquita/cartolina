# Fotos do Retratim: prompts e baralho (Google Flow)

Spec: `docs/superpowers/specs/2026-10-17-retratim-design.md` §6. 100 fotos **realistas** (nada surreal), cara de
foto de celular. Flow: projeto https://flow.google.com/project/9034c6f8-554a-413f-946c-1f4d4030a6b6,
**imagem · 4:3 · Nano Banana 2.1 · x1**. Saída 1200×896. Geradas em 2026-10-17 pelo painel de navegador do app.

Prompt = `Casual smartphone photo:` + cena + `Natural light, realistic everyday colors, slight phone-camera grain,
casual framing with the main subject clearly visible and well separated from a simple background. Photorealistic, not
staged, not surreal, no text, no letters, no logos, no watermark.` (+ `No faces visible.` quando aparece gente).

## Como o baralho ficou (decisões do usuário, 2026-10-17)

1. Lote de teste de 8 aprovado ("gostei").
2. O usuário mandou 15 temas (ferrovia, ônibus brasileiro, roupa, inverno, futebol, abajur, festa, praia, floresta,
   casa azul, esgrima, gato, elefante safari, terno, feijoada) e escolheu misturar com os amplos.
3. Gerando, achou as fotos de cada tema parecidas demais e decidiu: **2 fotos por tema, 50 temas**. A grade passa a
   sortear **8 temas × 2 fotos** (antes 4 × 4). Cada tema é uma "dupla parecida" (às vezes uma pegadinha, ex.:
   bandeirinha de escanteio × bandeirinha de festa junina).
4. Todas as 100 foram aproveitadas: as primeiras 61 geradas viraram duplas e 39 foram geradas pra completar.

**Ordem no Flow (#):** posição da foto na ordem em que foi gerada (1 = a mais antiga). Só histórico: as fotos foram
baixadas já com o nome do id (`p001.jpg`…), e `npm run pictures:fotos -- <pasta>` importa pelo nome. Os prompts das # 1–61 estão no histórico deste arquivo
(commits `4f7dd1c` e `1505faa`); os das # 62–100 estão abaixo.

| Tema | id | # | foto | id | # | foto |
|---|---|---|---|---|---|---|
| cachorro | p001 | 1 | golden no gramado | p002 | 62 | vira-lata deitado na calçada |
| caneca | p003 | 2 | caneca vermelha de café | p004 | 45 | chocolate quente |
| gato | p005 | 3 | gato preto dormindo | p006 | 63 | gato laranja se espreguiçando |
| pizza | p007 | 4 | fatia de pizza | p008 | 64 | pizza inteira na caixa |
| farol | p009 | 5 | farol listrado na costa | p010 | 65 | farol branco ao entardecer |
| bicicleta | p011 | 6 | bicicleta vermelha | p012 | 66 | bicicleta com cestinha |
| árvore | p013 | 7 | árvore sozinha no campo | p014 | 47 | pinheiro com neve |
| mãos | p015 | 8 | mãos com xícara de chá | p016 | 40 | brinde |
| praia | p017 | 9 | guarda-sol amarelo | p018 | 10 | cadeira de praia |
| beira-mar | p019 | 14 | coqueiro | p020 | 15 | quiosque |
| brinquedo de praia | p021 | 13 | boia de flamingo | p022 | 11 | prancha na areia |
| areia | p023 | 12 | castelo de areia | p024 | 67 | pegadas na areia |
| floresta | p025 | 17 | trilha | p026 | 22 | ponte sobre riacho |
| chão da mata | p027 | 18 | cogumelo | p028 | 24 | folhas de outono |
| mata | p029 | 19 | tronco com musgo | p030 | 20 | cachoeira |
| cabana | p031 | 21 | cabana na mata | p032 | 50 | cabana com neve |
| visto de baixo | p033 | 23 | pinheiros vistos de baixo | p034 | 68 | prédio visto de baixo |
| bola | p035 | 25 | bola na grama | p036 | 29 | bola no pênalti |
| campo | p037 | 26 | gol com rede | p038 | 32 | campo de várzea |
| calçados | p039 | 27 | chuteira | p040 | 16 | chinelos na areia |
| luvas | p041 | 31 | luvas de goleiro | p042 | 48 | luvas de lã |
| futebol | p043 | 28 | arquibancada vazia | p044 | 30 | jogador camisa 10 |
| bandeirinha | p045 | 33 | bandeirinha de escanteio | p046 | 38 | bandeirinhas de festa junina |
| aniversário | p047 | 34 | bolo com velas | p048 | 37 | chapéu de festa |
| festa | p049 | 35 | balões | p050 | 41 | presentes |
| doces | p051 | 36 | brigadeiros | p052 | 69 | bolo de pote |
| fogo | p053 | 39 | fogueira de São João | p054 | 46 | lareira |
| balada | p055 | 42 | globo de luz | p056 | 70 | palco com luzes |
| neve | p057 | 43 | boneco de neve | p058 | 49 | trenó |
| no cabide | p059 | 44 | casaco e cachecol | p060 | 71 | terno |
| janela | p061 | 51 | janela embaçada | p062 | 72 | janela com cortina |
| trem | p063 | 52* | trem na estação | p064 | 59 | VLT |
| trilhos | p065 | 53 | trilhos no horizonte | p066 | 58 | ponte ferroviária |
| locomotiva | p067 | 54 | maria-fumaça | p068 | 55 | vagão de carga |
| sinalização | p069 | 56 | passagem de nível | p070 | 73 | semáforo vermelho |
| estação | p071 | 57 | estaçãozinha do interior | p072 | 60 | plataforma vazia |
| ônibus | p073 | 61 | ônibus urbano no ponto | p074 | 74 | ônibus de viagem na rodoviária |
| abajur | p075 | 75 | abajur aceso | p076 | 76 | luminária de chão |
| casa azul | p077 | 77 | fachada azul | p078 | 78 | porta azul |
| esgrima | p079 | 79 | uniforme e máscara | p080 | 80 | dois esgrimistas duelando |
| elefante | p081 | 81 | elefante no safari | p082 | 82* | elefante se molhando no rio |
| safari | p083 | 83 | girafa | p084 | 84 | zebra |
| feijoada | p085 | 85 | feijoada na panela de barro | p086 | 86 | prato de feijoada completa |
| roupa dobrada | p087 | 87 | camiseta dobrada | p088 | 88 | calça jeans dobrada |
| escolar | p089 | 89 | van escolar | p090 | 90 | ônibus escolar amarelo |
| salgado | p091 | 91 | coxinha | p092 | 92 | pastel |
| pão | p093 | 93 | pão francês | p094 | 94* | pão de queijo com cafezinho |
| gelado | p095 | 95 | açaí | p096 | 96 | sorvete de casquinha |
| fazenda | p097 | 97 | cavalo | p098 | 98 | vaca |
| relógio | p099 | 99 | relógio de parede | p100 | 100 | despertador |

## Prompts das # 62–100 (cena)

62 a mixed-breed brown dog lying down on a sidewalk, side view · 63 an orange tabby cat stretching with its front legs
extended on a light wooden floor, side view · 64 a whole pepperoni pizza in an open cardboard pizza box on a table, seen
from above · 65 a white lighthouse on a cliff at sunset, warm sky · 66 a pastel blue bicycle with a wicker basket parked
on a cobblestone street, side view · 67 footprints in smooth wet sand on a beach leading toward the sea · 68 a tall glass
office building seen from the street looking straight up at the sky · 69 a Brazilian bolo de pote, a layered chocolate
cake in a clear plastic cup, on a table · 70 an empty concert stage with colorful spotlights and haze · 71 a dark navy
suit hanging on a wooden hanger against a plain wall · 72 a window with light curtains blowing in the breeze · 73 a
traffic light showing red on a city street corner · 74 an intercity coach bus parked at a Brazilian bus station · 75 a
table lamp with a beige fabric shade, switched on, on a bedside table in a dim room · 76 a tall floor lamp with a white
shade, switched on, next to a sofa in a living room · 77 the front of a small blue house with a white door and windows on
a Brazilian street · 78 a bright blue wooden front door on a white wall, close up · 79 a white fencing uniform and fencing
mask laid out on a bench, with a foil sword beside it · 80 two fencers in white uniforms and masks dueling on a fencing
strip, seen from the side at a distance (+ no faces) · 81 an African elephant walking across a dry savanna, side view ·
82 a mother elephant and her baby walking together on the savanna · 83 a giraffe standing next to an acacia tree on the
savanna · 84 a zebra standing on the savanna grass, side view · 85 a clay pot full of Brazilian feijoada, black beans with
meats, on a table · 86 a plate of feijoada completa with rice, collard greens, farofa and an orange slice, seen from above
· 87 a neatly folded white t-shirt on a wooden surface · 88 a neatly folded pair of blue jeans on a wooden surface · 89 a
yellow Brazilian school van parked on a street · 90 a yellow school bus parked on a street, side view · 91 a golden fried
coxinha on a small plate · 92 a large crispy pastel de feira on a paper napkin · 93 a wicker basket of Brazilian pao
frances bread rolls · 94 a small basket of pao de queijo cheese breads · 95 a bowl of acai topped with banana slices and
granola · 96 a hand holding a strawberry ice cream cone up against a clear blue sky (+ no faces) · 97 a brown horse
standing in profile in a fenced green field · 98 a black and white cow standing in a green pasture, side view · 99 a round
wall clock with a black frame on a plain white wall · 100 a classic twin-bell alarm clock on a bedside table.

\* **p063 refeita (2026-10-17):** a primeira mostrava pessoas de frente na plataforma. Prompt novo: `a passenger
train arriving at an empty station platform, front three-quarter view, no people on the platform.` + fim padrão +
`No people, no faces visible.` Baixada pelo link assinado `flow-content.google` com `curl` (sem diálogo de salvar) e
convertida com os mesmos parâmetros do `scripts/pictures-fotos.mjs`.

\* **p082 e p094 refeitas (2026-10-17):** o usuário achou cada uma parecida demais com o par (elefante andando na
savana; cestinha de pães). Prompts novos (+ fim padrão), baixadas e convertidas do mesmo jeito da p063:
- p082: `an elephant standing in a shallow river, front view, spraying water with its trunk, lush green trees behind.`
- p094: `a few pao de queijo cheese breads on a small white plate next to a little cup of black coffee on a white marble
  counter, seen from directly above.`

## Mais 50 fotos: p101–p150 (2026-10-29)

O usuário pediu mais 50 fotos com uma lista de 19 ideias (cadeira gamer, computador, máquina registradora, sorvete
roxo, pêra, frutas, estilingue, catapulta, latinha de suco, caminhonete, caminhão pipa, foguete, binóculos, lupa,
cidade, fábrica, tubulação, ventilador, cactus). Viraram 13 temas, e mais 12 temas sugeridos e aprovados completam 25
temas novos (baralho de 75 temas × 2 = 150 fotos). Mesmo projeto, mesmas configurações e mesmo fim padrão de prompt.

| Tema | id | foto | id | foto |
|---|---|---|---|---|
| gamer | p101 | cadeira gamer | p102 | computador com teclado colorido |
| caixa | p103 | máquina registradora | p104 | balança de feira |
| roxo | p105 | sorvete roxo na casquinha | p106 | cacho de uvas roxas |
| fruta | p107 | pêra sozinha | p108 | fruteira com várias frutas |
| arremesso | p109 | estilingue | p110 | catapulta de madeira |
| suco | p111 | latinha de suco | p112 | jarra de suco com copo |
| caminhão | p113 | caminhonete | p114 | caminhão-pipa |
| foguete | p115 | foguete na plataforma | p116 | foguete de brinquedo |
| de olho | p117 | binóculos | p118 | lupa |
| urbano | p119 | cidade vista de longe | p120 | fábrica com chaminés |
| canos | p121 | tubulação industrial | p122 | mangueira de jardim enrolada |
| vento | p123 | ventilador de mesa | p124 | cata-vento colorido |
| cacto | p125 | cacto no vaso | p126 | cacto no deserto |
| instrumento | p127 | violão encostado na parede | p128 | pandeiro |
| chuva | p129 | guarda-chuva aberto | p130 | galochas amarelas |
| cozinha | p131 | liquidificador | p132 | panela de pressão |
| jardim | p133 | regador | p134 | carrinho de mão |
| ferramenta | p135 | martelo e pregos | p136 | caixa de ferramentas |
| escola | p137 | lápis de cor | p138 | mochila |
| banheiro | p139 | escova de dente | p140 | patinho de borracha |
| ave | p141 | pombo na praça | p142 | passarinho no galho |
| leitura | p143 | livro aberto | p144 | estante de livros |
| jogo | p145 | tabuleiro de xadrez | p146 | dados |
| rodinhas | p147 | skate | p148 | patins |
| viagem | p149 | mala de viagem | p150 | avião no céu |

### Prompts das p101–p150 (cena)

101 a black and red gaming chair in the corner of a bedroom, three-quarter view · 102 a desktop computer on a desk with
a monitor showing a plain blue screen and a keyboard with colorful backlit keys, seen from the side · 103 an
old-fashioned metal cash register on a small shop counter · 104 a red mechanical scale with a round dial holding
tomatoes at a Brazilian street market stall · 105 a hand holding a purple grape ice cream cone in front of a plain
wall (+ no faces) · 106 a bunch of purple grapes on a wooden table · 107 a single green pear standing on a kitchen
counter · 108 a fruit bowl full of bananas, apples, oranges and grapes on a dining table · 109 a wooden slingshot
lying on a garden table · 110 a small wooden catapult model on a grassy lawn · 111 a cold plain unbranded aluminum
can of juice with condensation on a cafe table · 112 a glass pitcher of orange juice next to a full glass on a
kitchen table · 113 a white pickup truck parked on a dirt road in the countryside, side view · 114 a water tanker
truck parked on a city street, side view · 115 a large white rocket on a launch pad under a blue sky, seen from far
away · 116 a small plastic toy rocket standing on the floor of a child's bedroom · 117 a pair of black binoculars
on a wooden railing at a scenic lookout · 118 a magnifying glass lying on a plain wooden desk next to a green leaf ·
119 a city skyline with many buildings seen from a hill on a clear day · 120 an old brick factory with tall chimneys
releasing light steam, seen from across a field · 121 a tangle of large metal industrial pipes and valves inside a
plant · 122 a green garden hose coiled on the grass next to a wall · 123 a white desk fan on a bedside table,
three-quarter view · 124 a colorful paper pinwheel stuck in a flower pot outdoors · 125 a small round cactus in a
terracotta pot on a sunny windowsill · 126 a tall cactus standing alone in a dry desert landscape · 127 an acoustic
guitar leaning against a white wall in a living room · 128 a Brazilian pandeiro tambourine lying on a wooden chair ·
129 an open red umbrella lying on a wet sidewalk in the rain · 130 a pair of yellow rain boots standing by a front
door next to a puddle · 131 a blender with a pink smoothie on a kitchen counter · 132 a stainless steel pressure
cooker on a gas stove · 133 a green watering can on a garden path next to flowers · 134 a metal wheelbarrow full of
soil in a backyard garden · 135 a hammer and a few nails on a wooden workbench · 136 an open red toolbox full of
tools on a garage floor · 137 colored pencils spread out on a white table · 138 a blue school backpack on a classroom
chair · 139 a toothbrush in a glass cup on a bathroom sink · 140 a yellow rubber duck on the edge of a bathtub · 141
a gray pigeon standing on the pavement of a city square · 142 a small yellow-bellied bird perched on a tree branch ·
143 an open book lying on a bed in soft light · 144 a wooden bookshelf full of books with no readable titles in a
living room · 145 a wooden chess board with pieces mid-game on a table · 146 a pair of white dice on a green felt
table · 147 a skateboard lying on a concrete skatepark ramp · 148 a pair of roller skates on a wooden floor · 149 a
hard-shell suitcase standing alone in an empty airport hallway · 150 a passenger airplane flying in a clear blue sky,
seen from the ground.

\* **p115 refeita na hora (2026-10-29):** a primeira deixava o foguete minúsculo na paisagem. Prompt novo: `a tall
white rocket standing on its launch pad, filling most of the frame, seen from the ground nearby under a clear blue
sky.` + fim padrão.

**Como baixar sem clique (2026-10-29):** na grade, cada miniatura tem `data-media-id`. Abrindo
`/project/<projeto>/edit/<mediaId>` num iframe escondido (mesma origem), as imagens do carrossel vêm com o link
assinado `flow-content.google/image/<mediaId>?Expires…&Signature…`, que o `curl` baixa sem cookie. Depois:
`npm run pictures:fotos -- <pasta> --from 101` importa só as novas.
