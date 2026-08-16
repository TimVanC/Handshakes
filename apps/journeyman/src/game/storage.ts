/** The generic storage factory moved to the shared @handshakes/ui package
 *  (monorepo extraction). This module keeps the Journeyman-specific pieces —
 *  the GameState binding and the global mode/help preferences — and re-exports
 *  the rest so every existing import path keeps working. */
import {
  createStorage as createGenericStorage,
  type SportStorage as GenericSportStorage,
} from "@handshakes/ui/storage";
import type { GameState } from "./types";

export { todayET, type Profile } from "@handshakes/ui/storage";

export type SportStorage = GenericSportStorage<GameState>;

export function createStorage(prefix: string, launchDate: string): SportStorage {
  return createGenericStorage<GameState>(prefix, launchDate);
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — game still works, just won't persist */
  }
}

/* ------------------------------------------------------------------
   Difficulty preference — a user preference, deliberately GLOBAL
   across sports (same key the NBA-only build wrote).
   Hard mode: no flipping cards over for the season-by-season record,
   and no accolade hardware anywhere.
------------------------------------------------------------------- */

export type GameMode = "normal" | "hard";
const MODE_KEY = "journeyman:mode:v1";

export function loadMode(): GameMode {
  return read<GameMode>(MODE_KEY) === "hard" ? "hard" : "normal";
}

export function saveMode(mode: GameMode) {
  write(MODE_KEY, mode);
}

/* Whether the player has seen the how-to-play modal. GLOBAL across sports:
   once they've learned the game on any league, we never auto-pop it again. */
const SEEN_HELP_KEY = "journeyman:seenHelp:v1";

export function hasSeenHelp(): boolean {
  return read<boolean>(SEEN_HELP_KEY) === true;
}

export function markSeenHelp() {
  write(SEEN_HELP_KEY, true);
}
