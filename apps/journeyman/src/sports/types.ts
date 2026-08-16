import type { ReactNode } from "react";
import type { ColorwayDB, ColorwayEra } from "../game/colorways";
import type { AccoladeType, Puzzle, StatCell, Stint } from "../game/types";
import type { SportStorage } from "../game/storage";
import type { PlayerSearch } from "../data/playerSearch";

export type Sport = "nba" | "nfl" | "mlb";

/** How each grade tier is labeled — sport-flavored ranks, same ladder. */
export interface GradeLabels {
  /** DNF */
  lost: string;
  /** solved on the final guess after every hint */
  allHints: string;
  /** solved after burning some hints */
  someHints: string;
  /** solved off a single jersey */
  one: string;
  /** solved within the first half of the jerseys */
  half: string;
  /** solved late, but before the full rack */
  most: string;
  /** needed every jersey */
  full: string;
}

export interface SeasonLine {
  year: number;
  w: number;
  l: number;
  /** NFL ties */
  t?: number;
  /** compact playoff result; "" = missed the playoffs */
  po: string;
  /** set on championship-round seasons: 1 = won it all, 0 = lost the final */
  fw?: 0 | 1;
}

/** Everything sport-specific, injected once at the top of the app.
 *  The game engine (state/score/share/storage shapes) is shared. */
export interface SportConfig {
  sport: Sport;
  /** "NBA" — used in copy ("Not affiliated with the NBA") */
  league: string;
  /** sport-ball glyph for the "play the other league" buttons */
  ballIcon: (p: { size?: number; className?: string }) => ReactNode;
  /** header/start-screen brand suffix; NBA (the original) shows none */
  brandTag: string | null;
  /** share-line prefix: "Journeyman" / "Journeyman NFL" / "Journeyman MLB" */
  shareTag: string;
  /** emoji standing in for one flipped jersey in the share trail */
  shareEmoji: string;
  /** start-screen tagline, first line */
  tagline: string;

  puzzles: Puzzle[];
  /** How day N picks its puzzle.
   *  "roster"  — ROSTER[day-1] names the answer (NBA: a hand-curated
   *              schedule), falling back to cycling `dailyPool` when the
   *              named puzzle isn't authored yet.
   *  "release" — puzzles[day-1], in authoring order: every authored puzzle
   *              airs exactly once, brand-new ones queue for the next open
   *              day, and nothing repeats until the pool is exhausted
   *              (then it cycles, and the dev console counts the runway).
   *              The puzzle array is therefore APPEND-ONLY once a day has
   *              aired — reordering would rewrite archive history. */
  scheduling: "roster" | "release";
  /** roster mode only: how many puzzles cycle as the not-yet-authored
   *  fallback pool */
  dailyPool: number;
  /** roster mode: ROSTER[day - 1] = that day's scheduled answer.
   *  release mode: not a schedule — just the authoring wishlist. */
  roster: string[];
  /** lazily-loaded type-ahead index for this league */
  searchPlayers: PlayerSearch;

  colorways: ColorwayDB;
  /** era-correct city code for a stint's colorway era */
  eraTricode: (era: ColorwayEra, franchise: string) => string;
  /** jersey art for a resolved colorway era (each sport has its own renderer) */
  Jersey: (p: {
    era: ColorwayEra;
    number: number | null;
    size?: number;
    label?: string | null;
  }) => ReactNode;
  /** neutral cardstock-colored jersey for the deck back / header / start screen */
  DeckJersey: (p: { size?: number }) => ReactNode;
  /** rendered width (px) of the jersey art on a card front */
  cardJerseySize: number;
  /** the jersey art's height ÷ width. Each sport's silhouette has its own
   *  proportions, so anywhere jerseys sit side by side (the home hub) this
   *  converts a target HEIGHT into the width each renderer needs. */
  jerseyAspect: number;

  /** card-title year range: NBA seasons span years ("1996–2001"),
   *  NFL/MLB are single calendar seasons ("2010" / "2005–2014") */
  stintYears: (stint: Stint) => string;

  /** the five stat cells on a card front (3 top, 2 bottom) */
  cardStats: (stint: Stint) => StatCell[];
  /** one-line stint summary on the result screen ("375 GP · 20.8 PPG") */
  stintSummary: (stint: Stint) => string;

  accoladeMeta: Partial<
    Record<
      AccoladeType,
      {
        Icon: (p: { size?: number; className?: string }) => ReactNode;
        label: string;
        /** the icon IS the abbreviation ("FMVP", "OROY", "1st"). The card
         *  front needs it, but the back already spells the award out — so
         *  the back drops it and reads "2× Finals MVP", not "FMVP 2× …". */
        wordmark?: true;
      }
    >
  >;

  /** the five profile hints, in reveal order, with display labels */
  hintLadder: Array<{ key: string; label: string }>;

  gradeLabels: GradeLabels;

  /** per-season W-L + playoff result for the card backs */
  getStintSeasons: (franchise: string, startYear: number, endYear: number) => SeasonLine[];
  /** "2003" for NFL/MLB; "03-04" for NBA's cross-year seasons */
  seasonLabel: (year: number) => string;

  storage: SportStorage;
}
