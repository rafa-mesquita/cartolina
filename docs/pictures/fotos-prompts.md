# Fotos do Retratim: prompts (Google Flow)

Spec: `docs/superpowers/specs/2026-10-17-retratim-design.md` §6. 100 fotos **realistas** (nada surreal),
cara de foto de celular. Configuração no Flow: **imagem**, **4:3 paisagem**, **x1** (uma opção por prompt).

Prompt = **começo** + cena + **fim**:

- **Começo:** `Casual smartphone photo:`
- **Fim:** `Natural light, realistic everyday colors, slight phone-camera grain, casual framing with the main subject clearly visible and well separated from a simple background. Photorealistic, not staged, not surreal, no text, no letters, no logos, no watermark.`
- Tema **gente**: só mãos ou pessoas de costas, então o fim ganha `No faces visible.`

Por que "assunto bem separado do fundo": o jogo é remontar a foto com cubos, cordas, palitos, blocos,
símbolos ou pontos. Foto com silhueta e cor claras dá pra remontar; foto confusa, não. Dentro de cada tema
as fotos são parecidas entre si (vários cães e gatos, várias xícaras e potes), pra grade ficar traiçoeira.

Os ids seguem a ordem de `shared/src/games/pictures/photos.ts`: bichos 15, casa 14, comida 14,
lugares 15, transporte 14, natureza 14, gente 14.

## Lote de teste (8 fotos, pra aprovar a qualidade antes do resto)

`p001` (bichos), `p002` (bichos), `p016` (casa), `p030` (comida), `p044` (lugares), `p059` (transporte),
`p073` (natureza), `p087` (gente). Marcadas com ⭐ abaixo.

## Bichos (p001–p015)

- ⭐ **p001 · golden no gramado:** a golden retriever sitting upright on a green lawn, facing the camera, tongue out.
- ⭐ **p002 · gato preto dormindo:** a black cat curled up asleep in a tight ball on a light gray sofa cushion.
- **p003 · gato laranja se espreguiçando:** an orange tabby cat stretching with its front legs extended on a light wooden floor, side view.
- **p004 · salsicha de perfil:** a brown dachshund standing on a sidewalk, full side profile.
- **p005 · coelho branco:** a white rabbit sitting in short green grass, side view, ears up.
- **p006 · pombo na mureta:** a gray pigeon standing on a pale stone ledge, side view, city blurred behind.
- **p007 · cavalo no pasto:** a brown horse standing in profile in a fenced green field.
- **p008 · vaca deitada:** a black and white cow lying down in a pasture, seen from the side.
- **p009 · peixinho no aquário:** an orange goldfish in a round glass bowl on a white table.
- **p010 · canário na gaiola:** a yellow canary on a perch inside a simple white wire cage.
- **p011 · tartaruga na pedra:** a small turtle resting on a gray rock at the edge of a pond.
- **p012 · pato no lago:** a white duck swimming on a calm pond, side view, ripples around it.
- **p013 · cachorro na caminha:** a small beige dog sleeping curled up in a round red dog bed.
- **p014 · gato na janela:** a cat sitting on a windowsill seen from behind, looking out at a bright garden.
- **p015 · galinha no quintal:** a brown hen walking across a dirt backyard, side view.

## Casa (p016–p029)

- ⭐ **p016 · caneca vermelha:** a red ceramic mug of coffee on a wooden table, steam rising, side view.
- **p017 · bule branco:** a white ceramic teapot on a light kitchen counter.
- **p018 · abajur aceso:** a table lamp with a beige fabric shade, switched on, on a bedside table in a dim room.
- **p019 · poltrona verde:** a green velvet armchair in the corner of a living room with a plain white wall.
- **p020 · cama desfeita:** an unmade bed with rumpled white sheets in soft morning light.
- **p021 · relógio de parede:** a round wall clock with a black frame on a plain white wall.
- **p022 · chaves no capacho:** a bunch of house keys on a ring lying on a brown doormat.
- **p023 · patinho na banheira:** a yellow rubber duck sitting on the white edge of a bathtub.
- **p024 · guarda-chuva secando:** an open blue umbrella drying upside down on a tiled floor.
- **p025 · cacto no vaso:** a small potted cactus in a terracotta pot on a sunny windowsill.
- **p026 · tênis na porta:** a pair of white sneakers next to a closed front door.
- **p027 · pilha de livros:** a stack of five hardcover books on a desk, spines facing the camera.
- **p028 · cadeira sozinha:** a single wooden chair alone in an empty room with bare walls.
- **p029 · varal:** colorful laundry hanging on a clothesline in a backyard under a blue sky.

## Comida (p030–p043)

- ⭐ **p030 · fatia de pizza:** a slice of pepperoni pizza on a white plate, seen from above.
- **p031 · maçã vermelha:** a single red apple on a wooden kitchen table.
- **p032 · cacho de bananas:** a bunch of yellow bananas on a light kitchen counter.
- **p033 · ovo frito:** a fried egg with a bright yolk in a black frying pan, seen from above.
- **p034 · casquinha de sorvete:** a hand holding a strawberry ice cream cone against a clear blue sky.
- **p035 · pão na tábua:** a round loaf of crusty bread on a wooden cutting board.
- **p036 · macarrão:** a white bowl of spaghetti with tomato sauce, seen from above.
- **p037 · hambúrguer:** a hamburger with lettuce and tomato on a plate, side view.
- **p038 · melancia:** half a watermelon cut side up on a picnic table outdoors.
- **p039 · cupcake:** a cupcake with pink frosting on a small plate, side view.
- **p040 · café com desenho:** a cup of latte with heart-shaped latte art, seen from directly above.
- **p041 · croissant:** a golden croissant on a white plate.
- **p042 · fruteira:** a bowl of mixed fruit (oranges, apples, grapes) on a table.
- **p043 · queijo:** a wedge of yellow cheese with holes on a wooden board.

## Lugares (p044–p058)

- ⭐ **p044 · farol:** a red and white striped lighthouse on a rocky coast under a blue sky.
- **p045 · igrejinha:** a small white church with a single bell tower on a hill.
- **p046 · ponte de pedra:** an old arched stone bridge over a calm river.
- **p047 · guarda-sol na praia:** a single yellow beach umbrella on an empty sandy beach, sea behind.
- **p048 · escorregador:** a red playground slide in an empty park.
- **p049 · cabana:** a small wooden cabin among pine trees.
- **p050 · casinhas coloridas:** a row of colorful narrow houses along a street.
- **p051 · gol de futebol:** an empty soccer goal with a white net on a grass field.
- **p052 · piscina:** an empty swimming pool with bright blue water and a metal ladder.
- **p053 · banco de praça:** a wooden park bench under a large tree.
- **p054 · arranha-céu:** a tall glass skyscraper seen from the street looking up.
- **p055 · roda-gigante:** a ferris wheel at an amusement park against a pale sky.
- **p056 · barraca de camping:** an orange camping tent on grass at a campsite.
- **p057 · moinho:** a traditional windmill in a flat green field.
- **p058 · ponto de ônibus:** an empty bus stop shelter on a city sidewalk.

## Transporte (p059–p072)

- ⭐ **p059 · bicicleta vermelha:** a red bicycle leaning against a white wall, side view.
- **p060 · ônibus escolar:** a yellow school bus parked on a street, side view.
- **p061 · veleiro:** a small white sailboat on calm blue water.
- **p062 · avião no céu:** a passenger airplane flying in a clear blue sky, seen from below.
- **p063 · carro antigo:** a vintage light blue car parked on a quiet street, side view.
- **p064 · skate:** a skateboard lying on asphalt, seen from above.
- **p065 · moto:** a black motorcycle parked on a sidewalk, side view.
- **p066 · trem:** a train arriving at a station platform, front three-quarter view.
- **p067 · balão:** a colorful hot air balloon floating in the sky over fields.
- **p068 · carrinho de mercado:** an empty shopping cart alone in a parking lot.
- **p069 · barco a remo:** a wooden rowing boat pulled up on a lake shore.
- **p070 · patinete:** a kick scooter standing on a sidewalk, side view.
- **p071 · helicóptero:** a red helicopter on a helipad.
- **p072 · trator:** a green tractor in a plowed field, side view.

## Natureza (p073–p086)

- ⭐ **p073 · árvore sozinha:** a single big round tree standing alone in an open green field.
- **p074 · montanha nevada:** a snowy mountain peak under a deep blue sky.
- **p075 · girassol:** a single sunflower close up, facing the camera, blue sky behind.
- **p076 · pôr do sol no mar:** the sun setting over a calm sea, orange sky.
- **p077 · cachoeira:** a tall waterfall in a green forest.
- **p078 · cacto no deserto:** a tall saguaro cactus in a dry desert landscape.
- **p079 · arco-íris:** a rainbow over green hills after rain.
- **p080 · lua cheia:** a full moon in a night sky above dark treetops.
- **p081 · rosa vermelha:** a single red rose with a green stem, plain background.
- **p082 · pinheiros com neve:** pine trees covered with snow in a quiet forest.
- **p083 · coqueiro:** a single palm tree on a white sand beach.
- **p084 · nuvem de tempestade:** dark storm clouds over a flat yellow field.
- **p085 · cogumelo:** a red mushroom with white spots on the forest floor.
- **p086 · folhas de outono:** orange and red autumn leaves scattered on the ground.

## Gente (p087–p100) — só mãos ou de costas; o fim ganha `No faces visible.`

- ⭐ **p087 · mãos com xícara:** two hands holding a cup of tea, close up.
- **p088 · passeando com o cachorro:** a person seen from behind walking a dog on a path in a park.
- **p089 · sovando pão:** hands kneading bread dough on a floured counter.
- **p090 · pescando no píer:** a person seen from behind sitting on a wooden pier, fishing.
- **p091 · botas na poça:** feet in yellow rain boots jumping in a puddle.
- **p092 · violão:** hands playing an acoustic guitar, close up.
- **p093 · de bicicleta:** a person seen from behind riding a bicycle on a country road.
- **p094 · aperto de mão:** two hands shaking, close up.
- **p095 · digitando:** hands typing on a laptop keyboard.
- **p096 · pipa na praia:** a person seen from behind flying a kite on a beach.
- **p097 · guarda-chuva na chuva:** a person seen from behind walking with a black umbrella in the rain.
- **p098 · regador:** a hand watering potted plants with a green watering can.
- **p099 · nadando:** a person seen from behind swimming in a blue pool.
- **p100 · livro no colo:** hands holding an open book on a lap.
