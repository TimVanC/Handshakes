import type { GameState } from "./types";

/** Points for a finished game, out of 1000.
 *
 *    − 100 per jersey flipped after the first (the first is dealt free)
 *    − 125 per profile hint
 *
 *  Wrong guesses carry no extra penalty: a miss auto-burns the next
 *  jersey/hint, so skipping and missing cost exactly the same. No
 *  difficulty bonus. A win never scores below 100 — you still named him.
 *  A DNF is 0. Perfect game: 1000. */
export function computeScore(state: GameState, _hard: boolean): number {
  if (state.status !== "won") return 0;
  const raw = 1000 - 100 * (state.revealed - 1) - 125 * state.hintsRevealed;
  return Math.max(100, raw);
}
