# Flip-all control — the parked label states

Written 2026-07-22. The control ships; the labelled two-state version does not.
This is the note for whoever revisits it.

## What ships

An icon-only round button on the counter line above the spread
(`.flip-all` in `src/index.css`, rendered in `src/App.tsx`), using `FlipIcon`
— the standard horizontal-mirror glyph, which happens to describe exactly what
the cards do: a 2D squeeze about their vertical centre line.

It appears only when two or more jerseys are out (below that it is the same
work as tapping the card itself) and never in hard mode, where the card backs
are the thing hard mode hides.

State lives in `App` as `{ back, n }` and is broadcast to every `JerseyCard`.
`n` bumps on every press, so a card that was tapped individually and fell out
of step with the rest still obeys the next press. `aria-pressed` and the
`aria-label`/`title` pair still carry the two states for screen readers and
hover, and the button fills in when pressed.

## What was cut, and why it might come back

The first version was a text pill that toggled between **"Show backs"** and
**"Show fronts"**. It was cut for the icon on 2026-07-22 — the text was wide on
a phone, and it sat on a line whose 0.2em tracking is tuned for a label rather
than a control.

The tradeoff is real and worth naming: an icon-only toggle does not announce
which way it will go before you press it. The glyph is symmetric, so unlike a
play/pause button it carries no direction. A first-time player learns what it
does by pressing it. The fill-when-pressed state is the only visual affordance
carrying "you are currently looking at backs".

Worth revisiting if either shows up:

- players report not knowing what the button does, or press it and bounce
- the counter line gets rebuilt and has room for a wider control

If it comes back, the labels themselves are the cheap part — the pair is in git
history at commit `a87470f`, and `flipAll.back` already drives everything a
label would need.

## Related

The per-card flip is unchanged: tapping any single card still turns just that
one over, and always did. This control is purely a bulk accelerator, so
removing it entirely would cost no functionality — only patience.
