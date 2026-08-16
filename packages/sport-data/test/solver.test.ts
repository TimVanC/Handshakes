import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGraph, sharedTeamSeasons, type TeammateGraph } from "../src/graph";
import { countOptimalPaths, degreeRanking, par, shortestPath } from "../src/solver";
import type { SportDataset } from "../src/types";

/** Hand-verified facts against the real NBA artifact. Every assertion here
 *  is checkable against public career pages — if one fails, suspect the
 *  ingest before the solver. */

let graph: TeammateGraph;
const byName = new Map<string, string>();

beforeAll(() => {
  const dataset: SportDataset = JSON.parse(
    readFileSync(fileURLToPath(new URL("../data/nba.json", import.meta.url)), "utf-8")
  );
  graph = buildGraph(dataset);
  for (const p of dataset.players) {
    // last write wins is fine — the names used below are unambiguous
    byName.set(p.full_name, p.id);
  }
});

const id = (name: string): string => {
  const found = byName.get(name);
  if (!found) throw new Error(`player not in dataset: ${name}`);
  return found;
};

describe("graph shape", () => {
  it("covers the league's history", () => {
    expect(graph.players.size).toBeGreaterThan(4500);
    expect(graph.rosters.size).toBeGreaterThan(1500);
  });

  it("teammates share a team season: Nash & Marion (mid-2000s Suns)", () => {
    const shared = sharedTeamSeasons(graph, id("Steve Nash"), id("Shawn Marion"));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.some((ts) => ts.startsWith("PHX-"))).toBe(true);
  });

  it("never-teammates share nothing: Jason Kidd & Kyrie Irving", () => {
    expect(sharedTeamSeasons(graph, id("Jason Kidd"), id("Kyrie Irving"))).toEqual([]);
  });

  it("adjacency is symmetric", () => {
    const nash = id("Steve Nash");
    const marion = id("Shawn Marion");
    expect(graph.adjacency.get(nash)?.has(marion)).toBe(true);
    expect(graph.adjacency.get(marion)?.has(nash)).toBe(true);
  });
});

describe("par (in handshakes, not players placed)", () => {
  it("direct teammates are 1 handshake: Jordan & Pippen", () => {
    expect(par(graph, id("Michael Jordan"), id("Scottie Pippen"))).toBe(1);
  });

  it("Nash & Duncan are 2 (never teammates; Finley bridges DAL→SAS)", () => {
    expect(par(graph, id("Steve Nash"), id("Tim Duncan"))).toBe(2);
  });

  it("par is symmetric", () => {
    const a = id("Steve Nash");
    const b = id("Tim Duncan");
    expect(par(graph, a, b)).toBe(par(graph, b, a));
  });

  it("a 1950s pioneer still reaches a 2020s player", () => {
    const p = par(graph, id("George Mikan"), id("Victor Wembanyama"));
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThanOrEqual(3);
    expect(p!).toBeLessThanOrEqual(8);
  });
});

describe("shortestPath", () => {
  it("returns a chain whose consecutive pairs are all real teammates", () => {
    const path = shortestPath(graph, id("George Mikan"), id("Victor Wembanyama"))!;
    expect(path.length).toBe(par(graph, id("George Mikan"), id("Victor Wembanyama"))! + 1);
    for (let i = 0; i < path.length - 1; i++) {
      expect(sharedTeamSeasons(graph, path[i], path[i + 1]).length).toBeGreaterThan(0);
    }
  });
});

describe("countOptimalPaths", () => {
  it("agrees with par and counts at least one solution", () => {
    const r = countOptimalPaths(graph, id("Steve Nash"), id("Tim Duncan"))!;
    expect(r.par).toBe(2);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });
});

describe("exclusions (hub-avoidance building block)", () => {
  it("removing every optimal middleman raises or kills par", () => {
    const a = id("Steve Nash");
    const b = id("Tim Duncan");
    // collect all optimal middles: distance 1 from both ends
    const middles = new Set<string>();
    for (const [nb] of graph.adjacency.get(a)!) {
      if (graph.adjacency.get(b)!.has(nb)) middles.add(nb);
    }
    expect(middles.size).toBeGreaterThan(0);
    const blocked = par(graph, a, b, { excluded: middles });
    expect(blocked === null || blocked > 2).toBe(true);
  });

  it("an excluded player can still be an endpoint", () => {
    const a = id("Michael Jordan");
    const b = id("Scottie Pippen");
    expect(par(graph, a, b, { excluded: new Set([a, b]) })).toBe(1);
  });
});

describe("degreeRanking", () => {
  it("hubs are long-career multi-team players", () => {
    const top50 = degreeRanking(graph).slice(0, 50);
    expect(top50[0].degree).toBeGreaterThan(200);
    for (const { playerId, degree } of top50) {
      const p = graph.players.get(playerId)!;
      expect(degree).toBeGreaterThan(150);
      expect(p.last_season - p.first_season).toBeGreaterThanOrEqual(5);
    }
  });
});
