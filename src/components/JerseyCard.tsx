import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPORT } from "../sports/active";
import { resolveColorway, type ColorwayEra } from "../game/colorways";
import type { Stint, StintAccolade } from "../game/types";

/** deterministic collector-spread nudge per position (px). Rotation is
 *  deliberately avoided — rotated text renders blurry. */
const NUDGES = [0, 4, -3, 2, -4, 3, -2, 5];

export function formatStintYears(s: Stint): string {
  return SPORT.stintYears(s);
}

/** The card front — jersey art + stat block. Shared by JerseyCard (the
 *  spread) and DeckCard's mid-flip state, so the "whole card" the deck
 *  flips to is pixel-identical to what lands in the spread a beat later. */
function CardFront({
  stint,
  era,
  showLabel,
  hideAccolades = false,
}: {
  stint: Stint;
  era: ColorwayEra | null;
  showLabel: boolean;
  /** hard mode strips the hardware — the row stays (uniform card size) */
  hideAccolades?: boolean;
}) {
  const accolades = hideAccolades ? [] : stint.accolades ?? [];
  const cells = SPORT.cardStats(stint);
  const top = cells.slice(0, 3);
  const bottom = cells.slice(3);
  return (
    <>
      <p className="text-center font-display text-[0.85rem] leading-tight tracking-wide">
        {formatStintYears(stint)}
      </p>

      <div className="mt-0.5 mb-1 flex justify-center">
        {era ? (
          <SPORT.Jersey
            era={era}
            number={stint.jerseyNumber}
            size={SPORT.cardJerseySize}
            label={showLabel ? SPORT.eraTricode(era, stint.franchise) : null}
          />
        ) : (
          <div className="flex h-24 items-center justify-center text-ink-soft">?</div>
        )}
      </div>

      {/* always rendered (min-height reserves the row) so every card is the
          same size whether or not the stint has accolades — otherwise cards
          visibly grow the moment an accolade jersey lands in their row */}
      <p className="mb-0.5 flex min-h-[0.85rem] flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[0.6rem] font-bold text-ink-soft">
        {accolades.map((a) => (
          <AccoladeChip key={a.type} accolade={a} />
        ))}
      </p>

      <dl className="border-t border-line pt-1">
        <div className="grid grid-cols-3 gap-0.5 text-center">
          {top.map((c) => (
            <Stat key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
        <div className="mt-0.5 flex justify-center gap-4 text-center">
          {bottom.map((c) => (
            <Stat key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
      </dl>
    </>
  );
}

interface Props {
  stint: Stint;
  /** position in the (chronologically sorted) spread — drives the tilt */
  spreadIndex: number;
  /** newest card gets the deal-in animation */
  isNewest: boolean;
  /** once a newer jersey is out, this one gets its city code stamped on */
  showLabel: boolean;
  /** staggers the deal-in during the end-of-game cascade (ms) */
  dealDelay?: number;
  /** invisible while its GhostCard is still in flight from the deck — the
   *  ghost is the only thing on screen until it lands here */
  hidden?: boolean;
  /** hard mode: no flipping for the season record, no accolade hardware */
  hard?: boolean;
  /** QA/inspection views can mount directly on the statistical back. */
  initialBack?: boolean;
  /** "flip every card" broadcast from the spread. `n` bumps on each press so
   *  a card that was tapped out of sync still obeys the next one. */
  flipAll?: { back: boolean; n: number };
  /** lets the spread run FLIP slide animations on reorder */
  cardRef?: (el: HTMLElement | null) => void;
}

export default function JerseyCard({
  stint,
  spreadIndex,
  isNewest,
  showLabel,
  dealDelay = 0,
  hidden = false,
  hard = false,
  initialBack = false,
  flipAll,
  cardRef,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);
  const animating = useRef(false);
  const [showBack, setShowBack] = useState(initialBack);
  // a card that mounts hidden arrived via GhostCard, which already scrolled
  // the deck into view at flip-start — scrolling again once it lands here
  // would fight the ghost's own flight animation
  const suppressScroll = useRef(hidden);

  /** 2D squeeze flip — no 3D layers, so text stays crisp on mobile.
   *  `next` picks the face to land on; omit it to just toggle. */
  const runFlip = (next?: boolean) => {
    if (animating.current) return;
    const el = flipRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const swap = () => setShowBack((b) => next ?? !b);
    if (!el || reduce) {
      swap();
      return;
    }
    animating.current = true;
    // fill:forwards holds the card squeezed shut instead of snapping back to
    // full width for a frame between the two halves — that revert is what
    // made the flip stutter. The opening half starts from the same 0.04, then
    // we cancel the held squeeze so it no longer pins the transform.
    const squeeze = el.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0.04)" }],
      { duration: 190, easing: "ease-in", fill: "forwards" }
    );
    squeeze.finished
      .then(() => {
        swap();
        const open = el.animate(
          [{ transform: "scaleX(0.04)" }, { transform: "scaleX(1)" }],
          { duration: 250, easing: "ease-out" }
        );
        squeeze.cancel(); // `open` now owns the transform; drop the held frame
        return open.finished;
      })
      .catch(swap)
      .finally(() => {
        animating.current = false;
      });
  };

  const toggleFlip = () => {
    if (hard) return; // hard mode: the season record stays face-down
    runFlip();
  };

  // switching to hard mode mid-game must not strand cards face-up showing
  // the very thing hard mode hides — flip them back, with the same animation
  useEffect(() => {
    if (hard && showBack) runFlip(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runFlip is stable enough here
  }, [hard]);

  // "flip all" from the spread. Seeded with the current `n` so a card that
  // deals in later doesn't immediately flip itself on mount.
  const lastFlipAll = useRef(flipAll?.n ?? 0);
  useEffect(() => {
    if (hard || !flipAll || flipAll.n === lastFlipAll.current) return;
    lastFlipAll.current = flipAll.n;
    if (showBack !== flipAll.back) runFlip(flipAll.back);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runFlip is stable enough here
  }, [flipAll, hard]);

  // the flip is the moment of the game — make sure it happens on screen
  // (skip during the end-of-game cascade, where many cards land at once)
  useEffect(() => {
    if (!isNewest || dealDelay > 0 || suppressScroll.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [isNewest, dealDelay]);

  const era = resolveColorway(
    SPORT.colorways,
    stint.franchise,
    stint.startYear,
    stint.endYear
  );
  const accolades = stint.accolades ?? [];

  return (
    <article
      ref={(el) => {
        ref.current = el;
        cardRef?.(el);
      }}
      className={`jersey-card w-full px-1.5 pb-2 pt-1 md:w-36 ${hard ? "" : "cursor-pointer"} ${isNewest && dealDelay > 0 ? "deal-in" : ""}`}
      style={
        {
          "--nudge": `${NUDGES[spreadIndex % NUDGES.length]}px`,
          animationDelay: dealDelay > 0 ? `${dealDelay}ms` : undefined,
          visibility: hidden ? "hidden" : undefined,
        } as React.CSSProperties
      }
      aria-label={
        hard
          ? `Jersey: ${formatStintYears(stint)}.`
          : `Jersey: ${formatStintYears(stint)}. Tap for details.`
      }
      aria-pressed={hard ? undefined : showBack}
      tabIndex={hard ? -1 : 0}
      onClick={toggleFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleFlip();
        }
      }}
    >
      <div className="card-flip" ref={flipRef}>
        {/* front — kept in flow (hidden) while flipped so the card holds its
            height. NOTE: "visible" must be undefined (inherit), never explicit:
            an explicit visibility:visible on a child overrides an ancestor's
            hidden, which made the card paint at its slot while its GhostCard
            was still mid-flight from the deck (the "duplicate jersey" bug). */}
        <div className="card-face" style={{ visibility: showBack ? "hidden" : undefined }}>
          <CardFront stint={stint} era={era} showLabel={showLabel} hideAccolades={hard} />
        </div>

        {/* back — the stop's hardware + season-by-season record */}
        {showBack && (
        <div className="card-face card-back">
          <p className="border-b border-line pb-0.5 text-center font-display text-[0.85rem] leading-tight tracking-wide">
            {formatStintYears(stint)}
          </p>

          {accolades.length > 0 && (
            <ul className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0.5 border-b border-line pb-1.5">
              {accolades.map((a) => {
                const meta = SPORT.accoladeMeta[a.type];
                if (!meta) return null;
                return (
                  <li key={a.type} className="flex items-center gap-1 text-[0.62rem] font-bold leading-tight">
                    {/* a wordmark icon is the award's abbreviation, which the
                        label right next to it already spells out — skip it */}
                    {!meta.wordmark && <meta.Icon size={14} className="shrink-0 text-wood-deep" />}
                    {a.count > 1 ? `${a.count}× ` : ""}
                    {meta.label}
                  </li>
                );
              })}
            </ul>
          )}

          {(() => {
            const seasons = SPORT.getStintSeasons(stint.franchise, stint.startYear, stint.endYear);
            if (seasons.length === 0) return null;
            return (
              <div className="mt-1">
                <div className="season-grid season-head">
                  <span>Yr</span>
                  <span className="text-center">W–L</span>
                  <span className="text-right">Playoffs</span>
                </div>
                {seasons.map((s) => (
                  <div key={s.year} className="season-grid">
                    <span className="font-bold">{SPORT.seasonLabel(s.year)}</span>
                    <span className="text-center">
                      {s.w}–{s.l}
                      {s.t ? `–${s.t}` : ""}
                    </span>
                    <span
                      className={`text-right ${
                        s.po === ""
                          ? "text-ink-soft"
                          : s.fw === 1
                            ? "font-bold text-[#2e7d43]"
                            : s.fw === 0
                              ? "font-bold text-[#b3362a]"
                              : ""
                      }`}
                    >
                      {s.po === "" ? "—" : s.po}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        )}
      </div>
    </article>
  );
}

function AccoladeChip({ accolade }: { accolade: StintAccolade }) {
  const meta = SPORT.accoladeMeta[accolade.type];
  if (!meta) return null;
  return (
    <span className="inline-flex items-center gap-0.5" title={meta.label}>
      <meta.Icon size={14} className="text-wood-deep" />
      {accolade.count > 1 && <span className="tabular-nums">×{accolade.count}</span>}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[0.5rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </dt>
      <dd className="font-display text-[0.78rem] leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** Element rect in DOCUMENT coordinates. All reveal-animation geometry uses
 *  these instead of viewport rects: the deck's smooth scrollIntoView is often
 *  still in flight when a reveal commits, and viewport rects taken before vs
 *  after a scroll differ by the scroll delta — which used to send the whole
 *  spread on a phantom sideways flight before settling. */
export interface CardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Flies the just-flipped card from the deck to its landing slot in one
 *  continuous motion. This is the ONLY thing that moves during a reveal —
 *  the deck reverts to face-down and the real JerseyCard mounts (invisible,
 *  via its `hidden` prop) the instant this starts, both hidden underneath
 *  the ghost, so there's no hard cut between "flip" and "slide". */
export function GhostCard({
  stint,
  from,
  to,
  hard = false,
  onArrived,
}: {
  stint: Stint;
  from: CardRect;
  to: CardRect;
  hard?: boolean;
  onArrived: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const era = resolveColorway(SPORT.colorways, stint.franchise, stint.startYear, stint.endYear);

  // useLayoutEffect (not useEffect): the flight must start on the very
  // first paint, or the ghost would sit still at the deck for a frame
  useLayoutEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduce) {
      onArrived();
      return;
    }
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    const anim = el.animate(
      [
        { transform: "translate(0px, 0px) scale(1, 1)" },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 14}px) scale(${(1 + sx) / 2}, ${(1 + sy) / 2})`,
          offset: 0.5,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      ],
      // a short delay lets the displaced cards open a gap first (they start
      // sliding with no delay), so the ghost drops into an already-empty slot
      // instead of crossing the old occupant on its way in. It holds on the
      // deck during the delay (the div is positioned at `from`).
      { duration: 800, delay: 140, easing: "cubic-bezier(0.3, 0.8, 0.3, 1)", fill: "both" }
    );
    anim.finished.then(onArrived).catch(onArrived);
    // fires once for this ghost's one-shot flight; from/to/onArrived are
    // fixed for its lifetime (a fresh GhostCard mounts per reveal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="jersey-card w-full px-1.5 pb-2 pt-1"
      style={{
        // absolute in document coords (not fixed/viewport): if the page is
        // still smooth-scrolling mid-flight, the ghost rides WITH the layout
        // instead of drifting against it
        position: "absolute",
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      <CardFront stint={stint} era={era} showLabel hideAccolades={hard} />
    </div>
  );
}

/** Face-down mystery jersey on top of the deck — the reveal button.
 *  When `flipStint` is set, the top card flips face-up in place (same 2D
 *  squeeze as the jersey cards) to show the incoming jersey before the
 *  real card slides off to its chronological slot. */
export function DeckCard({
  remaining,
  onReveal,
  tiltIndex,
  flipStint = null,
  sizerStint = null,
  hard = false,
  cardRef,
}: {
  remaining: number;
  onReveal: () => void;
  tiltIndex: number;
  /** mid-reveal: the stint currently being flipped face-up on the deck */
  flipStint?: Stint | null;
  /** hard mode: the flipped-up card hides its accolade hardware */
  hard?: boolean;
  /** an already-revealed stint rendered invisibly inside the face-down deck
   *  so the deck is always the exact size of a real jersey card — otherwise
   *  the flip visibly expands the card and the ghost overflows the deck */
  sizerStint?: Stint | null;
  /** registered with the spread so new jerseys can animate out from here */
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);
  const [faceUp, setFaceUp] = useState(false);

  // flip the top card: squeeze shut face-down, swap, open face-up.
  // When flipStint clears, snap back instantly — the flipped card has
  // slid away and the next face-down card is simply what's underneath.
  useEffect(() => {
    if (!flipStint) {
      setFaceUp(false);
      return;
    }
    const el = flipRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the flip is the payoff — make sure the deck is on screen for it
    btnRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
    if (!el || reduce) {
      setFaceUp(true);
      return;
    }
    // fill:forwards holds the deck squeezed shut through the content swap
    // instead of flashing back to full width between the two halves — the
    // swap to the face-up card lands while it's a thin sliver, so you never
    // see it happen. The opening half then owns the transform.
    const squeeze = el.animate(
      [{ transform: "scaleX(1)" }, { transform: "scaleX(0.04)" }],
      { duration: 210, easing: "ease-in", fill: "forwards" }
    );
    squeeze.finished
      .then(() => {
        setFaceUp(true);
        const open = el.animate(
          [{ transform: "scaleX(0.04)" }, { transform: "scaleX(1)" }],
          { duration: 280, easing: "ease-out" }
        );
        squeeze.cancel(); // `open` now owns the transform; drop the held frame
        return open.finished;
      })
      .catch(() => {
        setFaceUp(true);
      });
  }, [flipStint]);

  const era = flipStint
    ? resolveColorway(SPORT.colorways, flipStint.franchise, flipStint.startYear, flipStint.endYear)
    : null;
  const sizerEra = sizerStint
    ? resolveColorway(SPORT.colorways, sizerStint.franchise, sizerStint.startYear, sizerStint.endYear)
    : null;
  const showFace = faceUp && flipStint !== null;

  return (
    <button
      type="button"
      ref={(el) => {
        btnRef.current = el;
        cardRef?.(el);
      }}
      // same padding in both states so the box never changes size at the flip
      className={`deck-card flex w-full flex-col items-center justify-start px-1.5 pb-2 pt-1 md:w-36 ${showFace ? "is-face" : ""}`}
      style={{ "--nudge": `${NUDGES[tiltIndex % NUDGES.length]}px` } as React.CSSProperties}
      onClick={onReveal}
    >
      <div className="w-full" ref={flipRef}>
        {showFace && flipStint ? (
          <CardFront stint={flipStint} era={era} showLabel hideAccolades={hard} />
        ) : (
          <div className="grid w-full">
            {/* invisible card front reserving a real card's exact footprint */}
            {sizerStint && (
              <div className="invisible col-start-1 row-start-1" aria-hidden="true">
                <CardFront stint={sizerStint} era={sizerEra} showLabel={false} />
              </div>
            )}
            <div className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-1">
              <SPORT.DeckJersey size={Math.round(SPORT.cardJerseySize * 0.88)} />
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                Flip next
              </span>
              <span className="text-[0.56rem] opacity-80">
                {remaining} left in the deck
              </span>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
