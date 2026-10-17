# Fotos do Retratim: prompts (Google Flow)

Spec: `docs/superpowers/specs/2026-10-17-retratim-design.md` §6. 100 fotos **realistas** (nada surreal),
cara de foto de celular. Flow: projeto https://flow.google.com/project/9034c6f8-554a-413f-946c-1f4d4030a6b6,
**imagem**, **4:3 paisagem**, **Nano Banana 2.1**, **x1** (uma opção por prompt). Saída 1200×896.

Prompt = **começo** + cena + **fim**:

- **Começo:** `Casual smartphone photo:`
- **Fim:** `Natural light, realistic everyday colors, slight phone-camera grain, casual framing with the main subject clearly visible and well separated from a simple background. Photorealistic, not staged, not surreal, no text, no letters, no logos, no watermark.`
- Foto com gente (de costas ou só mãos): o fim ganha `No faces visible.` (marcado 👤).

O jogo é remontar a foto com cubos, cordas, palitos, blocos, símbolos ou pontos: assunto com silhueta e cor
claras. Dentro de cada tema as fotos são parecidas entre si, pra grade ficar traiçoeira.

## Temas (decisão do usuário, 2026-10-17)

Lote de teste aprovado ("gostei"). Depois o usuário mandou 15 temas: ferrovia, ônibus (brasileiro), roupa,
inverno, futebol, abajur, festa, praia, floresta, casa azul, esgrima, gato, elefante safari, terno,
feijoada. Escolheu a **mistura**: os amplos viram tema; os específicos entram dentro de um tema (abajur e
casa azul em casa; terno e esgrima em roupa; feijoada em comida; gato e elefante em bichos). Saíram os
temas antigos que se sobrepunham (lugares, transporte, natureza, gente).

11 temas, ids nesta ordem (o `shared/src/games/pictures/photos.ts` segue): praia 9, floresta 9, futebol 9,
festa 9, inverno 9, ferrovia 9, ônibus 9, roupa 9, casa 10, comida 9, bichos 9.

✓ = já gerada no lote de teste (reaproveitada). A bicicleta vermelha do teste ficou de fora.

## Praia (p001–p009)

- **p001 · guarda-sol amarelo:** a single yellow beach umbrella standing on an empty sandy beach, calm sea behind.
- **p002 · cadeira de praia:** a striped blue and white folding beach chair on the sand facing the sea.
- **p003 · prancha na areia:** a white surfboard stuck upright in the sand on a beach.
- **p004 · castelo de areia:** a sandcastle with towers on the wet sand near the water.
- **p005 · boia de flamingo:** a pink inflatable flamingo pool float lying at the edge of the sea on the sand.
- ✓ **p006 · farol:** a red and white striped lighthouse on a rocky coast under a blue sky.
- **p007 · coqueiro:** a single coconut palm tree leaning over a white sand beach.
- **p008 · quiosque:** a small wooden beach kiosk with a straw roof on the sand.
- **p009 · chinelos:** a pair of colorful flip-flops lying on the sand, seen from above.

## Floresta (p010–p018)

- **p010 · trilha:** a narrow dirt trail winding between tall trees in a green forest.
- **p011 · cogumelo:** a red mushroom with white spots on the forest floor among moss.
- **p012 · tronco com musgo:** a fallen tree trunk covered in green moss in a forest.
- **p013 · cachoeira:** a small waterfall falling over rocks in a lush green forest.
- **p014 · cabana:** a small wooden cabin among pine trees.
- **p015 · ponte sobre riacho:** a little wooden footbridge over a forest stream.
- **p016 · pinheiros de baixo:** tall pine trees seen from the ground looking straight up at the sky.
- **p017 · folhas de outono:** orange and red autumn leaves scattered on a forest path.
- ✓ **p018 · árvore sozinha:** a single big round tree standing alone in an open green field.

## Futebol (p019–p027)

- **p019 · bola na grama:** a white and black soccer ball resting on green grass.
- **p020 · gol vazio:** an empty soccer goal with a white net on a grass field.
- **p021 · chuteira:** a pair of soccer cleats lying on the grass next to the white field line.
- **p022 · arquibancada vazia:** empty colorful stadium seats in a soccer stadium.
- **p023 · marca do pênalti:** a soccer ball placed on the penalty spot in front of the goal.
- 👤 **p024 · camisa 10:** a soccer player seen from behind wearing a yellow shirt with the number 10, standing on the field.
- **p025 · luvas de goleiro:** a pair of goalkeeper gloves lying on the grass.
- **p026 · campo de várzea:** a simple dirt soccer field with wooden goalposts in a Brazilian neighborhood.
- **p027 · bandeirinha de escanteio:** a corner flag on a soccer field, close up.

## Festa (p028–p036)

- **p028 · bolo com velas:** a birthday cake with lit candles on a table.
- **p029 · balões:** a bunch of colorful helium balloons tied to the back of a chair.
- **p030 · brigadeiros:** a party table with many brigadeiros in small paper cups, Brazilian birthday party.
- **p031 · chapéu de festa:** a cone-shaped paper party hat on a table with confetti.
- **p032 · bandeirinhas:** colorful festa junina paper flags strung across a street under a blue sky.
- **p033 · fogueira:** a festa junina bonfire burning at night.
- 👤 **p034 · brinde:** hands clinking two glasses of sparkling drink in a toast, close up.
- **p035 · presentes:** a pile of wrapped gift boxes with ribbons.
- **p036 · globo de luz:** a mirror disco ball hanging over a dance floor with colored lights.

## Inverno (p037–p045)

- **p037 · boneco de neve:** a snowman with a carrot nose and a scarf in a snowy yard.
- **p038 · casaco e cachecol:** a winter coat and a knitted scarf hanging on a wall hook.
- **p039 · chocolate quente:** a mug of hot chocolate with whipped cream on a wooden table.
- **p040 · lareira:** a fireplace with a burning fire in a cozy living room.
- **p041 · pinheiro com neve:** a single pine tree covered in snow.
- **p042 · luvas de lã:** a pair of knitted wool mittens on a snowy surface.
- **p043 · trenó:** a wooden sled on a snowy hill.
- **p044 · cabana com neve:** a small cabin with a snow-covered roof in a winter landscape.
- **p045 · janela embaçada:** a fogged-up window with frost at the edges, snow falling outside.

## Ferrovia (p046–p054)

- **p046 · trem na estação:** a passenger train arriving at a station platform, front three-quarter view.
- **p047 · trilhos:** railway tracks stretching straight to the horizon through a flat field.
- **p048 · maria-fumaça:** an old black steam locomotive puffing white smoke.
- **p049 · vagão de carga:** a rusty red freight wagon on the tracks.
- **p050 · passagem de nível:** a railroad crossing with a red and white barrier and warning lights.
- **p051 · estaçãozinha:** a small old countryside train station in Brazil with a tiled roof.
- **p052 · ponte ferroviária:** a metal railway bridge over a river.
- **p053 · VLT:** a modern light rail tram on a city street.
- **p054 · plataforma vazia:** an empty train platform with a single bench.

## Ônibus — brasileiro (p055–p063)

- **p055 · ônibus urbano:** a Brazilian city bus stopped at a bus stop on a sunny street, side view.
- **p056 · ônibus de viagem:** an intercity coach bus parked at a Brazilian bus station.
- **p057 · van escolar:** a yellow Brazilian school van parked on a street.
- **p058 · BRT:** a long articulated BRT bus on a dedicated lane in a Brazilian city.
- **p059 · ponto de ônibus:** an empty bus stop shelter on a Brazilian city sidewalk.
- **p060 · bancos vazios:** the inside of an empty city bus, rows of seats and handrails.
- **p061 · catraca:** a bus turnstile inside a Brazilian city bus, close up.
- **p062 · dois andares:** a red double-decker tourist bus on a city street.
- **p063 · jardineira:** an old colorful vintage Brazilian "jardineira" bus parked on a country road.

## Roupa (p064–p072)

- **p064 · terno:** a dark navy suit hanging on a wooden hanger against a plain wall.
- **p065 · uniforme de esgrima:** a white fencing uniform and fencing mask laid out on a bench, with a foil sword beside it.
- 👤 **p066 · esgrimistas:** two fencers in white uniforms and masks dueling on a fencing strip, seen from the side at a distance.
- **p067 · camiseta dobrada:** a neatly folded white t-shirt on a wooden surface.
- **p068 · vestido:** a red summer dress hanging on a hanger.
- **p069 · jaqueta jeans:** a denim jacket hanging on a hook.
- **p070 · gravata:** a striped necktie lying on a white shirt, close up.
- **p071 · boné:** a baseball cap on a table.
- **p072 · meias no varal:** colorful socks hanging on a clothesline.

## Casa (p073–p082)

- **p073 · abajur:** a table lamp with a beige fabric shade, switched on, on a bedside table in a dim room.
- **p074 · casa azul:** the front of a small blue house with a white door and windows, Brazilian street.
- ✓ **p075 · caneca vermelha:** a red ceramic mug of coffee on a wooden table, steam rising, side view.
- ✓👤 **p076 · mãos com xícara:** two hands holding a cup of tea, close up.
- **p077 · poltrona verde:** a green velvet armchair in the corner of a living room with a plain white wall.
- **p078 · relógio de parede:** a round wall clock with a black frame on a plain white wall.
- **p079 · chaves no capacho:** a bunch of house keys on a ring lying on a brown doormat.
- **p080 · cama desfeita:** an unmade bed with rumpled white sheets in soft morning light.
- **p081 · janela com cortina:** a window with light curtains blowing in the breeze.
- **p082 · vaso de planta:** a leafy green plant in a ceramic pot on the floor next to a wall.

## Comida (p083–p091)

- **p083 · feijoada na panela:** a clay pot full of Brazilian feijoada (black beans with meats) on a table.
- **p084 · prato de feijoada:** a plate of feijoada completa with rice, collard greens, farofa and an orange slice, seen from above.
- ✓ **p085 · fatia de pizza:** a slice of pepperoni pizza on a white plate, seen from above.
- **p086 · pão francês:** a wicker basket of Brazilian pão francês bread rolls.
- **p087 · coxinha:** a golden fried coxinha on a small plate.
- **p088 · pastel:** a large crispy pastel de feira on a paper napkin.
- **p089 · açaí:** a bowl of açaí topped with banana slices and granola.
- **p090 · pão de queijo:** a small basket of pão de queijo cheese breads.
- **p091 · café coado:** coffee being brewed through a cloth filter (coador de pano) into a pot.

## Bichos (p092–p100)

- ✓ **p092 · gato preto dormindo:** a black cat curled up asleep in a tight ball on a light gray sofa cushion.
- **p093 · gato laranja:** an orange tabby cat stretching with its front legs extended on a light wooden floor, side view.
- **p094 · gato na janela:** a cat sitting on a windowsill seen from behind, looking out at a bright garden.
- **p095 · elefante no safari:** an African elephant walking across a dry savanna, side view.
- **p096 · elefante com filhote:** a mother elephant and her baby walking together on the savanna.
- **p097 · girafa:** a giraffe standing next to an acacia tree on the savanna.
- ✓ **p098 · golden no gramado:** a golden retriever sitting upright on a green lawn, facing the camera, tongue out.
- **p099 · cavalo:** a brown horse standing in profile in a fenced green field.
- **p100 · pombo:** a gray pigeon standing on a pale stone ledge, side view, city blurred behind.
