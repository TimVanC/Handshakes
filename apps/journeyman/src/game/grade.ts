import { HINT_COUNT } from "./state";
import type { GradeLabels } from "../sports/types";
import type { GameState, Puzzle } from "./types";

/**
 * Performance grade for a finished game. Jerseys-at-solve stays the core
 * golf metric, but the grade folds in how deep into the run the solve
 * came — two "4/4" solves are very different if one burned every hint.
 * Rank labels are sport-flavored (config.gradeLabels); the ladder itself
 * is identical across sports.
 */
export interface Grade {
  /** short shareable rank, best → worst */
  label: string;
  /** one-line human summary of how the run actually went */
  detail: string;
}

export function computeGrade(
  state: GameState,
  puzzle: Puzzle,
  labels: GradeLabels
): Grade {
  const total = puzzle.stints.length;
  const j = state.revealed;
  const hints = state.hintsRevealed;
  const misses = state.wrongGuesses.length;
  const missNote = misses > 0 ? ` (${misses} wrong guess${misses > 1 ? "es" : ""})` : "";

  if (state.status === "lost") {
    return {
      label: labels.lost,
      detail: "Every jersey, every hint — and he still walked free.",
    };
  }

  // hint-based grades first — a single-jersey lifer solved after five
  // hints is not a Hall of Fame read
  if (hints >= HINT_COUNT) {
    return {
      label: labels.allHints,
      detail: `Down to the final guess — every jersey, every hint${missNote}.`,
    };
  }
  if (hints > 0) {
    return {
      label: labels.someHints,
      detail: `All ${total} jerseys plus ${hints} profile hint${hints > 1 ? "s" : ""}${missNote}.`,
    };
  }
  if (j === 1) {
    return {
      label: labels.one,
      detail: `Named him off a single jersey${missNote}.`,
    };
  }
  if (j <= Math.ceil(total / 2)) {
    return {
      label: labels.half,
      detail: `Solved in ${j} of ${total} jerseys${missNote}.`,
    };
  }
  if (j < total) {
    return {
      label: labels.most,
      detail: `Solved in ${j} of ${total} jerseys${missNote}.`,
    };
  }
  return {
    label: labels.full,
    detail: `Needed the full rack — all ${total} jerseys${missNote}.`,
  };
}
