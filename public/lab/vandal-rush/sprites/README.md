# Vandal Rush — sprite drop-in

The game runs on **placeholder rects** until real art is here. To swap in pixel art,
provide **one sheet** (`sprites.png`) + fill **`atlas.json`** (copy from
`atlas.example.json`). No code changes needed — redeploy and the sprites appear.

## What to provide

1. **`sprites.png`** — one PNG sprite sheet, transparent background, **nearest-neighbor
   / no anti-aliasing** (crisp pixels). Put all animations on it; frames can be any
   size (map each with a pixel rect).
2. **`atlas.json`** — maps animation names → frames. Copy `atlas.example.json`, set
   `"image": "sprites.png"`, and set each anim's `frames` to `[x, y, w, h]` rects in
   the sheet. `fps` = playback speed (`0` = static). *Grid option:* add
   `"frameSize": [28, 32]` and use `[col, row]` frames instead of pixel rects.

## Animations the game asks for (name → suggested size)

The writer is authored at **28×32** (per the style reference). Sizes are suggestions
— any size works; the game scales each frame into its slot.

| Anim | Size | Frames | Notes |
|---|---|---|---|
| `writer-idle`   | 28×32 | 1–2 | start screen / standing |
| `writer-run`    | 28×32 | 4–6 | main run cycle |
| `writer-jump`   | 28×32 | 1   | rising |
| `writer-fall`   | 28×32 | 1   | descending |
| `writer-land`   | 28×32 | 1   | touchdown (squash) |
| `writer-tag`    | 28×32 | 2   | spray / slap pose |
| `writer-caught` | 28×32 | 1   | grabbed |
| `valla`         | 18×44 | 1   | fence / barrier obstacle |
| `cctv`          | 22×14 | 1–2 | wall camera (blink optional) |
| `cop-run`       | 28×34 | 4–6 | pursuer (SEGURATA / POLICÍA) |
| `buff`          | 30×42 | 2–4 | cleaner + roller |
| `spray`         | 10×16 | 1   | spray-can pickup |
| `bolsa`         | 14×14 | 1   | bag pickup |

**Facing:** author everything facing **right** (the writer runs right). The game
mirrors sprites when needed via a `flip` flag.

**Optional later:** distinct `segurata` vs `policia`, dumpster/wall surface art, and
BIAKO tag/sticker stamps. Not required for the drop-in — say the word and I'll wire them.

The reference art bible lives in `../reference/vandal-rush-style-reference.png`.
