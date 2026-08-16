import type { Player, SportDataset, TeamSeason } from "./types";

/**
 * The teammate graph. One node per player; an edge between two players iff
 * both have an appearance (games_played >= 1) for the same team_season —
 * the single definition of a handshake, decided once, used everywhere.
 *
 * ~5k players / ~200k edges for the NBA: an adjacency map and a queue,
 * built in memory at startup. No graph database.
 */
export interface TeammateGraph {
  players: Map<string, Player>;
  teamSeasons: Map<string, TeamSeason>;
  /** team_season_id → player ids with games_played >= 1 that season */
  rosters: Map<string, string[]>;
  /** player id → team_season ids, chronological */
  careers: Map<string, string[]>;
  /** player id → (teammate id → shared team_season ids) */
  adjacency: Map<string, Map<string, string[]>>;
}

export function buildGraph(dataset: SportDataset): TeammateGraph {
  const players = new Map(dataset.players.map((p) => [p.id, p]));
  const teamSeasons = new Map(dataset.team_seasons.map((t) => [t.id, t]));

  const rosters = new Map<string, string[]>();
  const careers = new Map<string, string[]>();
  for (const a of dataset.appearances) {
    if (a.games_played < 1) continue;
    let roster = rosters.get(a.team_season_id);
    if (!roster) rosters.set(a.team_season_id, (roster = []));
    roster.push(a.player_id);
    let career = careers.get(a.player_id);
    if (!career) careers.set(a.player_id, (career = []));
    career.push(a.team_season_id);
  }
  for (const career of careers.values()) {
    career.sort(
      (x, y) => (teamSeasons.get(x)?.season ?? 0) - (teamSeasons.get(y)?.season ?? 0)
    );
  }

  const adjacency = new Map<string, Map<string, string[]>>();
  const link = (a: string, b: string, ts: string) => {
    let edges = adjacency.get(a);
    if (!edges) adjacency.set(a, (edges = new Map()));
    let shared = edges.get(b);
    if (!shared) edges.set(b, (shared = []));
    shared.push(ts);
  };
  for (const [tsId, roster] of rosters) {
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        link(roster[i], roster[j], tsId);
        link(roster[j], roster[i], tsId);
      }
    }
  }

  return { players, teamSeasons, rosters, careers, adjacency };
}

/** Two players shake iff they share a team_season. Returns the shared
 *  team-season ids (empty = never teammates). */
export function sharedTeamSeasons(
  graph: TeammateGraph,
  a: string,
  b: string
): string[] {
  return graph.adjacency.get(a)?.get(b) ?? [];
}
