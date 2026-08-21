import { describe, expect, it } from "vitest";
import { buildGraph, type SportDataset } from "@handshakes/sport-data";
import { careerStints, stintLabel, stintRoster } from "../game/stints";

/** A: DAL 2001-2003, then LAL 2004, back to DAL 2006 (gap → new stint). */
const fixture: SportDataset = {
  players: [
    { id: "A", sport: "t", full_name: "A", first_season: 2001, last_season: 2006, career_games: 1, notability: 1 },
    { id: "B", sport: "t", full_name: "B", first_season: 2001, last_season: 2001, career_games: 1, notability: 1 },
    { id: "C", sport: "t", full_name: "C", first_season: 2003, last_season: 2003, career_games: 1, notability: 1 },
    { id: "D", sport: "t", full_name: "D", first_season: 2006, last_season: 2006, career_games: 1, notability: 1 },
  ],
  franchises: [
    { id: "t-dal", sport: "t", name: "Dallas Mavericks" },
    { id: "t-lal", sport: "t", name: "Los Angeles Lakers" },
  ],
  team_seasons: [
    { id: "DAL-2001", sport: "t", franchise_id: "t-dal", season: 2001, display_name: "2000-01 Dallas Mavericks" },
    { id: "DAL-2002", sport: "t", franchise_id: "t-dal", season: 2002, display_name: "2001-02 Dallas Mavericks" },
    { id: "DAL-2003", sport: "t", franchise_id: "t-dal", season: 2003, display_name: "2002-03 Dallas Mavericks" },
    { id: "LAL-2004", sport: "t", franchise_id: "t-lal", season: 2004, display_name: "2003-04 Los Angeles Lakers" },
    { id: "DAL-2006", sport: "t", franchise_id: "t-dal", season: 2006, display_name: "2005-06 Dallas Mavericks" },
  ],
  appearances: [
    { player_id: "A", team_season_id: "DAL-2001", games_played: 1 },
    { player_id: "A", team_season_id: "DAL-2002", games_played: 1 },
    { player_id: "A", team_season_id: "DAL-2003", games_played: 1 },
    { player_id: "A", team_season_id: "LAL-2004", games_played: 1 },
    { player_id: "A", team_season_id: "DAL-2006", games_played: 1 },
    { player_id: "B", team_season_id: "DAL-2001", games_played: 1 },
    { player_id: "C", team_season_id: "DAL-2003", games_played: 1 },
    { player_id: "D", team_season_id: "DAL-2006", games_played: 1 },
  ],
};
const graph = buildGraph(fixture);
const names = new Map(fixture.franchises.map((f) => [f.id, f.name]));

describe("careerStints", () => {
  it("groups contiguous seasons per franchise and splits on a gap", () => {
    const stints = careerStints(graph, names, "A");
    expect(stints.map(stintLabel)).toEqual(["Mavericks '00–'02", "Lakers '03", "Mavericks '05"]);
    expect(stints[0].teamSeasonIds).toEqual(["DAL-2001", "DAL-2002", "DAL-2003"]);
  });

  it("stint roster is the union of every season's roster", () => {
    const [dal] = careerStints(graph, names, "A");
    expect(new Set(stintRoster(graph, dal))).toEqual(new Set(["A", "B", "C"]));
  });
});
