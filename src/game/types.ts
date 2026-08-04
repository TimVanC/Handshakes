/** Accolades earned during a specific stint, rendered as icons on the
 *  card and written out on the card's flip side. One shared union across
 *  all three sports; each sport's config maps its subset to icons+labels
 *  (all_nba = First Team only; all_pro = AP First Team). */
export type AccoladeType =
  // NBA
  | "all_star"
  | "champion"
  | "mvp"
  | "fmvp"
  | "dpoy"
  | "sixth_man"
  | "roy"
  | "all_nba"
  | "olympic_gold"
  // NFL (champion = Super Bowl ring, roy/mvp shared)
  | "pro_bowl"
  | "all_pro"
  | "droy"
  | "sb_mvp"
  | "opoy"
  | "comeback"
  | "rushing_title"
  | "receiving_title"
  // MLB (champion = World Series ring, all_star/mvp/roy shared)
  | "cy_young"
  | "ws_mvp"
  | "gold_glove"
  | "silver_slugger"
  | "batting_title"
  | "reliever_award";

export interface StintAccolade {
  type: AccoladeType;
  count: number;
}

/** One labeled stat cell on a jersey card (5 per card: 3 top, 2 bottom). */
export interface StatCell {
  label: string;
  value: string | number;
}

export interface Stint {
  /** Modern franchise tricode — key into the sport's colorways JSON */
  franchise: string;
  /** Era-correct team name, shown only on the result screen */
  displayTeam: string;
  /** Season START years (2016 = the 2016-17 season; NFL/MLB = calendar season year) */
  startYear: number;
  endYear: number;
  /** null = the uniform had no number (pre-1929 MLB, most Negro League
   *  clubs) or it isn't reliably documented — the card renders a blank
   *  back rather than inventing one */
  jerseyNumber: number | null;
  /** hardware earned at this stop (icons on the card front, text on the back) */
  accolades?: StintAccolade[];

  /** NBA per-game line (Phase-1 fields; the NBA config builds its stat
   *  cells from these so the verified puzzle set needed no rewrite) */
  gp?: number;
  mpg?: number;
  ppg?: number;
  rpg?: number;
  apg?: number;

  /** NFL/MLB: explicit position-shaped 5-cell stat line
   *  (QB ≠ RB ≠ WR; batter ≠ pitcher) */
  statLine?: StatCell[];
}

/** Hint values keyed by the sport's hint ladder (see SportConfig.hintLadder).
 *  NBA/NFL: position → height → draft year → draft pick → college.
 *  MLB: position → bats/throws → height → debut year → born. */
export type PuzzleHints = Record<string, string>;

/** Which dimension the jerseys are split on (addendum §4.5a).
 *  Phase 1 puzzles are all Track A (`team`); the Phase 2 generator adds
 *  `number_era` (Track B) and `role_phase` (Tracks C/D). */
export type PathType = "team" | "number_era" | "role_phase";

export interface Puzzle {
  /** stable id within the local set */
  id: number;
  pathType: PathType;
  answer: string;
  /** shown on the result screen only — never a hint */
  accolades?: string[];
  /** chronological career stints */
  stints: Stint[];
  /** indices into `stints`, least-identifying first (hand-authored per §4) */
  revealOrder: number[];
  hints: PuzzleHints;
}

export type TrailEvent = "jersey" | "miss" | "solve" | "dnf";

export type GameStatus = "playing" | "won" | "lost";

/** derived from GameState — never stored */
export type GamePhase = "jerseys" | "hints" | "final" | "over";

export interface GameState {
  /** daily puzzle number (#1 = launch day) */
  day: number;
  /** which answer this save belongs to (rosterKey of the puzzle's answer).
   *  The slot is keyed by day, but a day's answer can be hot-swapped mid-day
   *  (2026-07-22: LeBron → Horry) — a save from the old answer must not mark
   *  the new one finished. Optional because saves predating 2026-07-22 never
   *  carried it. */
  puzzleId?: string;
  revealed: number;
  hintsRevealed: number;
  wrongGuesses: string[];
  trail: TrailEvent[];
  status: GameStatus;
}

export interface Profile {
  streak: number;
  lastSolvedDay: number | null;
  /** day number → jerseys-at-solve, or "DNF" */
  history: Record<string, number | "DNF">;
}
