# CLAUDE.md — biakone

Guidance for Claude Code when working in the **biakone** web repository.

This file **inherits** the global Fresno© Studio `CLAUDE.md` (parent folder).
Language rules, the propose-first approval rule, and the agents/skills system
already apply. This file only adds what is specific to the Biako website.
Do not repeat or override the global rules.

---

## What this project is

The public website for **Biako** — Juan's artistic alter ego.
Biako = 3D-printed urban objects (street furniture, architectural fragments),
hand-painted, weathered, finished with graffiti and street-culture aesthetics.
Limited editions. Underground, vandal, no noise. Hispanic market.

Instagram: instagram.com/biakone
Live: biakone.com · biak.one · biakone.vercel.app

### Two stages — do not confuse them

- **v0 (current goal):** a clean, dignified, online presence that replaces the
  current placeholder. Simple, fast, fully responsive. NOT the final product.
- **vFinal (the real project, planned separately):** an Awwwards-grade site with
  a graffiti-themed interactive game as the centerpiece. Heavy motion / WebGL.
  Do NOT start building vFinal features unless explicitly asked.

When in doubt about scope, assume v0 and ask.

---

## Stack

- **v0:** vanilla **HTML + CSS + JS**. No framework. No build step.
  Deploys to Vercel as static files (matches the current repo).
- **vFinal (later, not now):** likely Astro + GSAP / Three.js. Decided when we
  get there.
- **Rule:** never add a dependency, framework, or build tool without explicit
  approval first. Justify why it's needed before installing anything.

---

## Design system & tokens

- Single source of truth for visual decisions is **Juan's Figma** (in progress).
- All design values live as **CSS custom properties** in `src/styles/tokens.css`
  (colors, typography, spacing, radius, etc.).
- **Hard rule: never hardcode a color, font, size, or spacing value in markup or
  components. Always reference a token variable.** If a needed token is missing,
  add it to `tokens.css` first, then use it.
- Until the Figma is final, use placeholder Biako tokens (see Aesthetic below)
  and flag clearly that they are provisional.

---

## Aesthetic (provisional until Figma lands)

- Base: black / concrete grey. High contrast.
- Accent: a single spray/marker color used sparingly.
- Type: condensed grotesque for display; clean sans for body.
- Mood: vandal but controlled. Raw texture, intentional layout. Underground,
  never cute, never corporate.
- Quality bar: every screen must look designed, not templated. Juan is a
  designer — default Bootstrap-looking output is a failure.

---

## Content model

- The site showcases **pieces**. Each piece has an internal code: BK-1, BK-2, …
- Two piece formats:
  - **Format A:** 360° freestanding objects (trash cans, spray cans, hydrants).
  - **Format B:** flat-backed panel/facade pieces, framed and hung.
- Internal series system (NOT shown publicly): LAB, PROCESS, SCALE, GRAFFITI,
  POSTER.
- Public copy / captions: **English by default.**
- Scale reference for all pieces: 1:12.

### Adding a piece (v0)

For v0 (static HTML) a piece is added by hand following the existing markup
pattern. Keep the structure consistent so it can later migrate to a
content-driven setup (one file per piece) without rework.

---

## Suggested structure (introduce gradually, don't over-engineer v0)

```
/
├── index.html          ← entry
├── src/
│   ├── styles/
│   │   └── tokens.css  ← design system (source of truth for values)
│   ├── css/            ← component / page styles
│   └── js/             ← interactions
├── public/             ← images, fonts, static assets
└── CLAUDE.md
```

Do not scaffold folders the project doesn't use yet. Grow into this.

---

## Sections (v0)

1. **Home / Hero** — Biako in big, one line, immediate visual impact.
2. **Work / Gallery** — the pieces. The core of the site.
3. **About** — who Biako is (the alter ego), the process, "proceso auténtico,
   sin ruido".
4. **Links / Contact** — Instagram, contact.

Leave room (not built) for future: **Shop**, **Drops**, **Playground/Game**.

---

## Deploy & version safety

- Flow: commit on `main` → push to GitHub (`juancfresno/biakone`) → Vercel
  auto-deploys.
- **Before replacing the current `index.html`, commit the current state first**
  with a clear message (e.g. `chore: snapshot legacy placeholder`) so nothing is
  ever lost. The whole point is to never lose previous versions.
- Small, frequent, descriptive commits. One logical change per commit.
- Repo is **public** — never commit secrets, keys, or private data.

---

## Working rules (in addition to the global propose-first rule)

- **Mobile-first.** Design and test small screen first, then scale up. The site
  must be flawless on mobile — it's a hard requirement, not a nice-to-have.
- **Blockout before build:** propose layout / structure (wireframe-level) and
  wait for approval before writing the full implementation. Mirrors how Juan
  works in 3D.
- **Performance is a feature** (it feeds the Awwwards goal later): no heavy
  libraries for v0, optimize images, keep it fast.
- Accessibility basics: semantic HTML, alt text, keyboard-navigable.
