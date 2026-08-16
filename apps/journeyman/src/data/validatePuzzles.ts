import type { SportConfig } from "../sports/types";
import { rosterKey } from "./roster";

/** "Washington Wizards (blue/bronze)" → "Washington Wizards" — parentheticals
 *  are colorway eras of the SAME identity; a change in the base string means
 *  a relocation or rebrand (Sonics→Thunder, Oilers→Titans, Expos→Nationals). */
function baseIdentity(s: string): string {
  return s.replace(/\s*\(.*\)$/, "").trim();
}

function identityAt(config: SportConfig, franchise: string, year: number): string | null {
  const eras = config.colorways.franchises[franchise];
  const era = eras?.find((e) => year >= e.years[0] && year <= e.years[1]);
  return era ? baseIdentity(era.identity) : null;
}

/** Dev-only schedule health.
 *  Roster sports: duplicate-answer check plus a count of scheduled days
 *  with authored puzzles behind them.
 *  Release sports: puzzles ARE the schedule — report the runway (the date
 *  the pool runs dry and days start repeating) and flag duplicate answers
 *  in the pool itself. */
export function warnRosterGaps(config: SportConfig): void {
  if (config.scheduling === "release") {
    const tag = `[${config.sport} schedule]`;
    const seen = new Map<string, number>();
    config.puzzles.forEach((p, i) => {
      const key = rosterKey(p.answer);
      if (seen.has(key)) {
        console.warn(`${tag} "${p.answer}" is both puzzle ${seen.get(key)} and ${i + 1} — it will air twice`);
      } else {
        seen.set(key, i + 1);
      }
    });
    const runsDry = config.puzzles.length + 1;
    const today = config.storage.currentDayNumber();
    console.info(
      `${tag} ${config.puzzles.length} puzzles authored — repeats begin day ${runsDry} ` +
        `(${config.storage.dateForDay(runsDry)}${today >= runsDry ? ", ALREADY REPEATING" : ""})`
    );
    return;
  }

  const tag = `[${config.sport} roster]`;
  const seen = new Map<string, number>();
  config.roster.forEach((name, i) => {
    const key = rosterKey(name);
    if (seen.has(key)) {
      console.warn(`${tag} "${name}" appears on both day ${seen.get(key)} and day ${i + 1}`);
    } else {
      seen.set(key, i + 1);
    }
  });

  const builtKeys = new Set(config.puzzles.map((p) => rosterKey(p.answer)));
  const builtDays = config.roster.filter((n) => builtKeys.has(rosterKey(n))).length;
  const firstGap = config.roster.findIndex((n) => !builtKeys.has(rosterKey(n)));
  console.info(
    `${tag} ${builtDays}/${config.roster.length} scheduled days have authored puzzles` +
      (firstGap >= 0 ? `; first gap: day ${firstGap + 1} (${config.roster[firstGap]})` : "")
  );
}

/** Dev-only authoring guards: a stint must never span a relocation/rebrand
 *  (each card renders ONE jersey — a spanning stint would swallow the old
 *  identity), every stint franchise must have a colorway, and NFL/MLB
 *  stints must carry a full 5-cell stat line. */
export function warnPuzzleData(config: SportConfig): void {
  const tag = `[${config.sport} puzzles]`;
  for (const pz of config.puzzles) {
    for (const s of pz.stints) {
      if (!config.colorways.franchises[s.franchise]) {
        console.warn(`${tag} "${pz.answer}": no colorways for franchise "${s.franchise}"`);
        continue;
      }
      const startId = identityAt(config, s.franchise, s.startYear);
      const endId = identityAt(config, s.franchise, s.endYear);
      if (startId && endId && startId !== endId) {
        console.warn(
          `${tag} "${pz.answer}": stint ${s.franchise} ${s.startYear}–${s.endYear} ` +
            `spans "${startId}" → "${endId}". Split it into two stints so both jerseys appear.`
        );
      }
      if (config.sport !== "nba" && (s.statLine?.length ?? 0) !== 5) {
        console.warn(
          `${tag} "${pz.answer}": stint ${s.franchise} ${s.startYear} has ` +
            `${s.statLine?.length ?? 0} stat cells (expected 5)`
        );
      }
      // a stint with no team-season rows flips to a card back with nothing on
      // it but the year range — the gap that left Rick Barry's cards blank
      const seasons = config.getStintSeasons(s.franchise, s.startYear, s.endYear);
      const want = s.endYear - s.startYear + 1;
      if (seasons.length < want) {
        const have = new Set(seasons.map((x) => x.year));
        const gaps = [];
        for (let y = s.startYear; y <= s.endYear; y++) if (!have.has(y)) gaps.push(y);
        console.warn(
          `${tag} "${pz.answer}": no teamSeasons row for ${s.franchise} ${gaps.join(", ")} ` +
            `— those seasons are missing from the card back`
        );
      }
    }
    if (pz.revealOrder.length !== pz.stints.length) {
      console.warn(`${tag} "${pz.answer}": revealOrder length ≠ stints length`);
    }
  }
}
