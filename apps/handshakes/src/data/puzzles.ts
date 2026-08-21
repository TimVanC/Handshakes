import table from "./puzzles.nba.json";
import exampleTable from "./examples.nba.json";

export interface DailyPuzzle {
  day: number;
  sport: string;
  start_id: string;
  target_id: string;
  par: number;
  solution_count: number;
  tier: "easy" | "medium" | "hard";
  era_spread: number;
  canonical_path: string[];
  canonical_links: string[];
}

export const LAUNCH_DATE: string = table.launch_date;

const byDay = new Map<number, DailyPuzzle>(
  (table.puzzles as DailyPuzzle[]).map((p) => [p.day, p])
);

export const LAST_DAY = Math.max(...byDay.keys());

/** Past the authored horizon, replay the table cycled — same guarantee
 *  Journeyman uses: the app never computes puzzles at runtime. */
export function puzzleForDay(day: number): DailyPuzzle {
  const wrapped = ((day - 1) % LAST_DAY) + 1;
  return byDay.get(wrapped)!;
}

/** Curated demo puzzles (1-based). Out-of-range wraps. */
export const EXAMPLES = exampleTable.examples as DailyPuzzle[];

export function examplePuzzle(n: number): DailyPuzzle {
  return EXAMPLES[((n - 1) % EXAMPLES.length + EXAMPLES.length) % EXAMPLES.length];
}
