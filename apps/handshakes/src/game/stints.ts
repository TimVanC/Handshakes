import type { TeammateGraph } from "@handshakes/sport-data";

/** A contiguous run of seasons with one franchise — how a fan remembers a
 *  career ("Mavericks '83–'89"), and the unit the roster reveal works in. */
export interface Stint {
  /** stable key for the paid-reveal ledger */
  key: string;
  franchiseId: string;
  franchiseName: string;
  /** era tricode of the stint's first season */
  tricode: string;
  /** season END years */
  firstSeason: number;
  lastSeason: number;
  teamSeasonIds: string[];
}

export function careerStints(
  graph: TeammateGraph,
  franchiseNames: Map<string, string>,
  playerId: string
): Stint[] {
  const stints: Stint[] = [];
  for (const tsId of graph.careers.get(playerId) ?? []) {
    const ts = graph.teamSeasons.get(tsId);
    if (!ts) continue;
    const last = stints[stints.length - 1];
    // same franchise, no gap season → extend; a gap means they left and came back
    if (last && last.franchiseId === ts.franchise_id && ts.season - last.lastSeason <= 1) {
      last.lastSeason = Math.max(last.lastSeason, ts.season);
      last.teamSeasonIds.push(tsId);
      continue;
    }
    stints.push({
      key: `${ts.franchise_id}:${ts.season}`,
      franchiseId: ts.franchise_id,
      franchiseName: franchiseNames.get(ts.franchise_id) ?? ts.display_name,
      tricode: tsId.split("-")[0],
      firstSeason: ts.season,
      lastSeason: ts.season,
      teamSeasonIds: [tsId],
    });
  }
  return stints;
}

const yy = (season: number) => `'${String(season % 100).padStart(2, "0")}`;

/** "Mavericks '83–'89" / "Lakers '20" — seasons shown by their start year,
 *  the way fans say them. */
export function stintLabel(s: Stint): string {
  const from = yy(s.firstSeason - 1);
  const to = yy(s.lastSeason - 1);
  const short = s.franchiseName.split(" ").pop() ?? s.franchiseName;
  return from === to ? `${short} ${from}` : `${short} ${from}–${to}`;
}

/** Everyone who played a regular-season game for the franchise during the
 *  stint's seasons — the union of those rosters, the stint's own player first. */
export function stintRoster(graph: TeammateGraph, stint: Stint): string[] {
  const seen = new Set<string>();
  for (const tsId of stint.teamSeasonIds) {
    for (const pid of graph.rosters.get(tsId) ?? []) seen.add(pid);
  }
  return [...seen];
}
