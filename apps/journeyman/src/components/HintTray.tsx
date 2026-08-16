import { SPORT } from "../sports/active";
import type { PuzzleHints } from "../game/types";
import { LockIcon } from "./Icons";

// per-sport ladder: NBA/NFL run position→height→draft→college; MLB swaps
// in bats/throws, debut year, and birthplace
const LADDER = SPORT.hintLadder;

/** Short coded values — "R / R", "2B / LF", "PF/SF", "6'11\"" — are ONE fact,
 *  and browsers happily break them at the slash or the spaces around it. On a
 *  narrow screen the label "Bats / Throws" wraps to two lines and the value
 *  used to follow it down, reading as two separate answers. Values this short
 *  always fit their cell, so pinning them is safe; anything longer is prose
 *  (colleges, birthplaces) and still has to wrap. */
const ATOMIC_MAX = 8;

function valueClass(value: unknown): string {
  return `hint-value${String(value).length <= ATOMIC_MAX ? " hint-value-atomic" : ""}`;
}

interface Props {
  hints: PuzzleHints;
  revealedCount: number;
  /** strip = horizontal bar above the spread; cell = vertical card that
   *  fills the leftover columns of the spread's last grid row */
  variant: "strip" | "cell";
  /** cell variant: how many grid columns to span */
  span?: number;
  className?: string;
}

/** Player Profile — the post-jerseys hint ladder. */
export default function HintTray({
  hints,
  revealedCount,
  variant,
  span,
  className = "",
}: Props) {
  if (variant === "cell") {
    return (
      <section
        aria-label="Player profile"
        className={`profile-cell chip-in ${className}`}
        style={span ? { gridColumn: `span ${span}` } : undefined}
      >
        <h2 className="player-file-title">Player profile</h2>
        <ul className="mt-0.5">
          {LADDER.map((h, i) => (
            <li
              key={h.key}
              className={`profile-row ${i >= revealedCount ? "hint-locked" : ""} ${
                i === revealedCount - 1 ? "chip-in" : ""
              }`}
              aria-label={i >= revealedCount ? `${h.label}: locked` : undefined}
            >
              <span className="hint-label">{h.label}</span>
              {i < revealedCount ? (
                <span className={valueClass(hints[h.key])}>{hints[h.key]}</span>
              ) : (
                <LockIcon size={11} />
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-label="Player profile" className={`player-file chip-in ${className}`}>
      <h2 className="player-file-title">Player profile</h2>
      <ul className="player-file-grid">
        {LADDER.map((h, i) =>
          i < revealedCount ? (
            <li
              key={h.key}
              className={`player-file-cell ${i === revealedCount - 1 ? "chip-in" : ""}`}
            >
              <span className="hint-label">{h.label}</span>
              <span className={valueClass(hints[h.key])}>{hints[h.key]}</span>
            </li>
          ) : (
            <li
              key={h.key}
              className="player-file-cell hint-locked"
              aria-label={`${h.label}: locked`}
            >
              <span className="hint-label">{h.label}</span>
              <LockIcon size={12} />
            </li>
          )
        )}
      </ul>
    </section>
  );
}
