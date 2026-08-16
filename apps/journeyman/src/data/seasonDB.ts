import type { SeasonLine } from "../sports/types";

/**
 * Team W-L + playoff result per season, one JSON per sport, keyed by our
 * modern tricode → season START year. Only the seasons the current puzzle
 * sets need are included; Phase 2's ETL replaces this with a proper table.
 */

export type SeasonJSON = Record<
  string,
  Record<string, { w: number; l: number; t?: number; po: string; fw?: 0 | 1 }>
>;

export function createSeasonDB(db: SeasonJSON) {
  return function getStintSeasons(
    franchise: string,
    startYear: number,
    endYear: number
  ): SeasonLine[] {
    const team = db[franchise];
    if (!team) return [];
    const out: SeasonLine[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const s = team[String(y)];
      if (s) out.push({ year: y, ...s });
    }
    return out;
  };
}

/** NBA seasons span calendar years: 2003 → "03-04" */
export const crossYearLabel = (y: number) =>
  `${String(y).slice(2)}-${String((y + 1) % 100).padStart(2, "0")}`;

/** NFL/MLB seasons are a single calendar year */
export const plainYearLabel = (y: number) => String(y);
