# Jersey graphics — deferred feature

Written 2026-07-22. Not implemented; this is the plan and an honest capability
note for whoever picks it up (human or model).

## The problem it solves

Colorway + number + era cut currently carries the whole jersey. That means two
navy jerseys from different decades can look nearly identical, which costs the
game real signal — a Horry-era Suns card is just purple and orange text, when
the actual jersey had a basketball-comet streaking across the hip. Patterns are
the cheapest remaining way to make eras distinguishable at a glance.

## The hook already exists

`ColorwayEra.pattern` (`src/game/colorways.ts`) is already in the type and
already ships one value, `"pinstripe"`. MLB reads it and the baseball back
renderer draws it as rects clipped to the torso path:

```
<clipPath id={pinId}><path d={BODY} /></clipPath>
… 15 × <rect width={0.9} …/> inside <g clipPath>
```

That is the template for everything in Tier 1 below. Widen the union
(`"pinstripe" | "side-panel" | "yoke" | "sash" | …`), give each renderer a
`PATTERNS` map keyed by that union, and clip to the body path the same way.
Keep the existing `confidence` flag honest — a guessed pattern is worse than no
pattern, because it reads as a deliberate clue.

## Tiers, by how reliably they can be produced

**Tier 1 — parametric geometry. Do this first.**
Stripes, side panels, shoulder yokes, waistband bands, gradient fades, diagonal
sashes, checkerboards. Pure math plus a clip path, verifiable numerically with
`getBBox` without looking at anything. The pinstripe implementation worked
first try and generalises across every colorway. Safe to do at league scale.

Concrete candidates: Nuggets rainbow skyline, Bucks 90s diagonal, Grizzlies
side stripes, Rockets pinstripe-and-star, NFL sleeve stripe variants beyond the
four era treatments, MLB racing stripes.

**Tier 2 — illustrated marks. One at a time, only where the mark IS the clue.**
The Suns comet is the archetype: a circle plus a tapered arc plus radiating
strokes, so it decomposes into primitives and sits closer to Tier 1 than to
freehand drawing. Expect several visual iterations per mark. Worth it only for
designs distinctive enough that a player would recognise the jersey from the
pattern alone.

**Tier 3 — real logos and wordmarks. Don't.**
Trademarked, and it breaks the game's premise ("no logos, no names") which is
what makes guessing work at all.

## Capability note (model-authored, worth heeding)

Decomposing *supplied* vector art is reliable — three for three on this project
(the NBA sheet, the NovaeMakersMart football, the baseball back once the right
sheet row was found). Handing over an SVG of a comet is close to a solved path.

Freehand vector illustration is NOT reliable *without seeing the result*. The
football icon took three attempts and still read as an eye; the fix was pulling
Material Symbols instead. The hand-drawn glove and bat were likewise replaced
with real icon sets.

With a working preview it becomes tractable, and the second 2026-07-22 pass is
the evidence: `CommissionersTrophyIcon` took three drafts (v1 read as a chair
back, v2 as a drum) and `FlipIcon` was picked from five candidates rendered
side by side. Both were judged at 110px AND at their true ~14px, which is the
step that matters — a `LarryOBrienIcon` that looked fine large read as a chess
pawn small, and was eventually dropped anyway. `LombardiIcon` has now been
verified by eye and is fine. `CyYoungIcon` no longer exists as a drawing; it is
a `WordMark` reading "CY".

**Prerequisite for any Tier 2 work: a working preview — and there is one.**
The browser pane's own screenshots time out because the tab is backgrounded
(`document.visibilityState === "hidden"`), which also stalls any WAAPI
animation, so card flips never resolve. Both are avoidable:

```
chrome --headless=new --disable-gpu --hide-scrollbars \
  --virtual-time-budget=40000 --run-all-compositor-stages-before-draw \
  --force-prefers-reduced-motion --force-device-scale-factor=2.5 \
  --screenshot=out.png --window-size=390,900 http://localhost:PORT/...
```

`--run-all-compositor-stages-before-draw` is what stops it capturing a blank
page; `--force-prefers-reduced-motion` makes the app take its own synchronous
no-animation path, so flipped states actually appear (virtual time does NOT
settle the animated path). `--force-device-scale-factor` is how you inspect a
14px glyph. To drive the app first — reveal jerseys, open a card — serve a
throwaway page from `public/` that iframes it and clicks, same-origin, then
delete it. The browser pane's `javascript_tool` still works for reading the DOM
even while screenshots do not, which is enough to assert structure.

## Verification

`?jerseys` renders every renderer × era × colorway plus the icon sets, and
`?cards` renders real cards including an era-variation row. Both run on
localhost and on Vercel previews, and are blocked on the live domain. Any
pattern work should show up in both before it ships.
