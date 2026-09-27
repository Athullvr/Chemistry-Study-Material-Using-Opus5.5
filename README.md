# Sketch to Chemistry · Class 12 guide

Animated, interactive explanations of NCERT Class 12 Chemistry questions. Each lesson
opens with a short guided tour: a pencil sketch on a desk that comes to life and explains
the concept, then solves the class problem. After the tour it becomes a live lab with
controls, challenges and a quiz.

## Open it

Open **`index.html`** in a browser (double-click it). No server, build step or internet
connection is needed; the fonts are bundled.

## Lessons

| Unit | Lesson | File |
|---|---|---|
| 1 Solutions | Molar mass from osmotic pressure | `lessons/osmosis.html` |
| 2 Electrochemistry | EMF with the Nernst equation | `lessons/nernst.html` |
| 3 Chemical Kinetics | Time for a first-order reaction | `lessons/first-order.html` |
| 4 d- and f-Block | Spin-only magnetic moment | `lessons/magnetic-moment.html` |
| 5 Coordination Compounds | Crystal field splitting and colour | `lessons/crystal-field.html` |
| 6 Haloalkanes | SN2 vs SN1 and stereochemistry | `lessons/sn2.html` |

Useful links: add `#t=20` to a lesson's address to open the tour paused at 20 s, or
`#lab` to open the lab directly.

## Project layout

```
index.html              home page: pick a question (cards come from shared/catalog.js)
lessons/                one HTML file per question
lessons/_template.html  commented skeleton for a new lesson
shared/studio.js        the engine: layout, desk/paper look, pencil + handwriting
                        drawing, tour player, lab controls, challenges, quiz
shared/studio.css       styles for the stage and side panel (+ bundled @font-face rules)
shared/catalog.js       the list of questions (home page cards and ‹ › navigation)
shared/fonts/           Caveat, Inter, JetBrains Mono (SIL Open Font License)
```

## Add a new question

1. Copy `lessons/_template.html` to `lessons/<id>.html`.
2. Fill in the TODOs: the question, chapters (the story), `tourState(t)`, `draw(env)`,
   stats, controls, challenges and quiz. `lessons/nernst.html` is the fullest example.
3. Add an entry to `shared/catalog.js` (id, file, unit number and name, title, question,
   tags, answer, icon). It then appears on the home page and in the ‹ › navigation.
4. To give the card a custom pencil thumbnail, add a function to `ICONS` in `index.html`
   and set `icon` to its name.

Style rules the lessons follow: pencil sketch first, then a matte physical model; orange
handwriting for annotations; muted natural colours; no glows. The paper is 1600 × 1000
units, main apparatus on the left and notebook views (graphs, working) on the right.
