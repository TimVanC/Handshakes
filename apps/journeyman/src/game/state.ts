import { normalizeName } from "../data/playerSearch";
import type { GamePhase, GameState, Puzzle } from "./types";

export const HINT_COUNT = 5;

export function initialState(day: number, puzzleId?: string): GameState {
  return {
    day,
    puzzleId,
    revealed: 1, // the least-identifying jersey is on the table at load
    hintsRevealed: 0,
    wrongGuesses: [],
    trail: ["jersey"],
    status: "playing",
  };
}

export function getPhase(state: GameState, puzzle: Puzzle): GamePhase {
  if (state.status !== "playing") return "over";
  if (state.revealed < puzzle.stints.length) return "jerseys";
  if (state.hintsRevealed < HINT_COUNT) return "hints";
  return "final";
}

export type GameAction =
  | { type: "reveal"; puzzle: Puzzle }
  | { type: "guess"; puzzle: Puzzle; name: string }
  | { type: "give_up" };

/** "reveal" = flip the next jersey (or, once jerseys are out, take a hint). */
export function reducer(state: GameState, action: GameAction): GameState {
  if (state.status !== "playing") return state;

  // waving the white flag on the final guess — same DNF as a last miss
  if (action.type === "give_up") {
    return { ...state, status: "lost", trail: [...state.trail, "dnf"] };
  }

  const phase = getPhase(state, action.puzzle);

  if (action.type === "reveal") {
    if (phase === "jerseys") {
      return {
        ...state,
        revealed: state.revealed + 1,
        trail: [...state.trail, "jersey"],
      };
    }
    if (phase === "hints") {
      return { ...state, hintsRevealed: state.hintsRevealed + 1 };
    }
    return state; // final: nothing left to reveal — guess or bust
  }

  // ---- guess ----
  // accent- and punctuation-blind: the search index and the puzzle data
  // come from different sources that disagree on diacritics, and picking
  // the right player must never score as a miss
  const correct =
    normalizeName(action.name) === normalizeName(action.puzzle.answer);
  if (correct) {
    return { ...state, status: "won", trail: [...state.trail, "solve"] };
  }

  const missed: GameState = {
    ...state,
    wrongGuesses: [...state.wrongGuesses, action.name],
    trail: [...state.trail, "miss"],
  };
  // a wrong guess is never free: it auto-reveals the next jersey, then
  // walks the hint ladder, then ends the game
  if (phase === "jerseys") {
    return {
      ...missed,
      revealed: missed.revealed + 1,
      trail: [...missed.trail, "jersey"],
    };
  }
  if (phase === "hints") {
    return { ...missed, hintsRevealed: missed.hintsRevealed + 1 };
  }
  return { ...missed, status: "lost", trail: [...missed.trail, "dnf"] };
}
