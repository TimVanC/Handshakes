/**
 * Offline puzzle generator — the §5 pipeline. Emits a year of puzzles into a
 * static JSON table; the app never computes puzzles at runtime.
 *
 * Pipeline per candidate pair:
 *   1. endpoints sampled from the eligible pool (notability gate — middles
 *      have no such requirement; obscure middles are the fun)
 *   2. par via BFS, in handshakes; keep 3–4
 *   3. hub-avoidance filter: delete the top-N degree hubs, re-run BFS —
 *      par unchanged → keep (optimal path doesn't need the superstar
 *      highway); par increases → discard
 *   4. solution_count via shortest-path counting → difficulty tier
 *   5. canonical optimal path chosen hub-free, so "show solution" never
 *      teaches the get-to-LeBron heuristic
 *
 * Weekly difficulty schedule (never random): Mon easy → Thu/Fri hardest →
 * weekend mid.
 *
 * Run: npm run generate --workspace packages/sport-data -- [launchDate]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, sharedTeamSeasons, type TeammateGraph } from "../src/graph";
import { countOptimalPaths, degreeRanking, par, shortestPath } from "../src/solver";
import type { SportDataset } from "../src/types";

const SPORT = "nba";
const HUB_COUNT = 50;
const PAR_MIN = 3;
const PAR_MAX = 4;
const NOTABILITY_MIN = 88; // endpoints must read as household-ish names
const STAR_NOTABILITY = 97; // every puzzle starts or ends on a genuine big name
const MODERN_SEASON = 2012; // and most of those big names should be ones a 2026 fan watched
const MODERN_STAR_SHARE = 0.65;
const CAREER_GAMES_MIN = 350;
const DAYS = 366;
const POOL_TARGET = 430; // headroom over DAYS for the scheduler's tier pools
const ENDPOINT_COOLDOWN_DAYS = 45; // a player headlines at most ~monthly
const SEED = 20260816;

/** launch date: first CLI arg, default a Monday so the weekly
 *  difficulty rhythm starts on "easy" */
const launchDate = process.argv[2] ?? "2026-09-07";
if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
  throw new Error(`launch date must be YYYY-MM-DD, got: ${launchDate}`);
}
const launchDow = new Date(`${launchDate}T12:00:00Z`).getUTCDay(); // 0=Sun

/* Mon..Sun difficulty rhythm, easy Monday, hardest Thu/Fri, mid weekend */
const WEEK_PATTERN: Record<number, "easy" | "medium" | "hard"> = {
  1: "easy",
  2: "easy",
  3: "medium",
  4: "hard",
  5: "hard",
  6: "medium",
  0: "medium",
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GeneratedPuzzle {
  sport: string;
  start_id: string;
  target_id: string;
  par: number;
  solution_count: number;
  tier: "easy" | "medium" | "hard";
  era_spread: number;
  /** one canonical optimal path, hub-free, endpoints included */
  canonical_path: string[];
  /** the team_season connecting each consecutive pair of the canonical path */
  canonical_links: string[];
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataset: SportDataset = JSON.parse(
    readFileSync(join(here, "..", "data", `${SPORT}.json`), "utf-8")
  );
  const graph = buildGraph(dataset);
  const rand = mulberry32(SEED);

  const hubs = new Set(
    degreeRanking(graph)
      .slice(0, HUB_COUNT)
      .map((r) => r.playerId)
  );

  const eligible = dataset.players.filter(
    (p) =>
      p.notability >= NOTABILITY_MIN &&
      p.career_games >= CAREER_GAMES_MIN &&
      graph.adjacency.has(p.id)
  );
  const stars = eligible.filter((p) => p.notability >= STAR_NOTABILITY);
  const modernStars = stars.filter((p) => p.last_season >= MODERN_SEASON);
  console.log(
    `eligible endpoints: ${eligible.length}, stars: ${stars.length} (${modernStars.length} modern); ` +
      `hubs excluded from routes: ${hubs.size}`
  );

  const pool: GeneratedPuzzle[] = [];
  const seenPairs = new Set<string>();
  const stats = { sampled: 0, offPar: 0, hubDependent: 0, kept: 0 };

  while (pool.length < POOL_TARGET && stats.sampled < 200_000) {
    stats.sampled++;
    // one end is always a star — modern more often than not — the other is
    // anyone recognizable, so chains read "big name ↔ guy you half remember"
    const starPool = rand() < MODERN_STAR_SHARE && modernStars.length ? modernStars : stars;
    const a = starPool[Math.floor(rand() * starPool.length)];
    const b = eligible[Math.floor(rand() * eligible.length)];
    if (a.id === b.id) continue;
    const pairKey = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const p = par(graph, a.id, b.id);
    if (p === null || p < PAR_MIN || p > PAR_MAX) {
      stats.offPar++;
      continue;
    }

    // the most important filter in this file
    const hubFree = par(graph, a.id, b.id, { excluded: hubs });
    if (hubFree !== p) {
      stats.hubDependent++;
      continue;
    }

    const counted = countOptimalPaths(graph, a.id, b.id)!;
    const path = shortestPath(graph, a.id, b.id, { excluded: hubs })!;
    const links = pathLinks(graph, path);

    // start on the earlier era so chains tend to read left→right through time
    const [start, target] = a.first_season <= b.first_season ? [a, b] : [b, a];
    const oriented = path[0] === start.id ? path : [...path].reverse();

    pool.push({
      sport: SPORT,
      start_id: start.id,
      target_id: target.id,
      par: p,
      solution_count: counted.count,
      tier: "medium", // assigned from the pool distribution below
      era_spread: Math.abs(start.last_season - target.first_season),
      canonical_path: oriented,
      canonical_links: path[0] === oriented[0] ? links : [...links].reverse(),
    });
    stats.kept++;
  }

  if (pool.length < DAYS) {
    throw new Error(
      `only ${pool.length} puzzles survived the filters (need ${DAYS}); ` +
        `loosen NOTABILITY_MIN or raise the sample budget`
    );
  }

  /* Difficulty tiers from the pool's own solution_count distribution:
     more optimal routes = more forgiving. Fewest-routes tercile is hard. */
  const sorted = [...pool].sort((x, y) => x.solution_count - y.solution_count);
  const t1 = sorted[Math.floor(sorted.length / 3)].solution_count;
  const t2 = sorted[Math.floor((2 * sorted.length) / 3)].solution_count;
  for (const pz of pool) {
    pz.tier = pz.solution_count <= t1 ? "hard" : pz.solution_count <= t2 ? "medium" : "easy";
  }

  /* Schedule: walk the calendar, draw from the day's tier pool, keep any
     endpoint from headlining twice within the cooldown window. */
  const byTier = {
    easy: pool.filter((p) => p.tier === "easy"),
    medium: pool.filter((p) => p.tier === "medium"),
    hard: pool.filter((p) => p.tier === "hard"),
  };
  const lastUsed = new Map<string, number>(); // player id → day number
  const scheduled: (GeneratedPuzzle & { day: number })[] = [];

  for (let day = 1; day <= DAYS; day++) {
    const dow = (launchDow + day - 1) % 7;
    const want = WEEK_PATTERN[dow];
    const order: ("easy" | "medium" | "hard")[] =
      want === "easy"
        ? ["easy", "medium", "hard"]
        : want === "hard"
          ? ["hard", "medium", "easy"]
          : ["medium", "easy", "hard"];

    let picked: GeneratedPuzzle | null = null;
    for (const tier of order) {
      const list = byTier[tier];
      const idx = list.findIndex(
        (pz) =>
          day - (lastUsed.get(pz.start_id) ?? -Infinity) > ENDPOINT_COOLDOWN_DAYS &&
          day - (lastUsed.get(pz.target_id) ?? -Infinity) > ENDPOINT_COOLDOWN_DAYS
      );
      if (idx !== -1) {
        picked = list.splice(idx, 1)[0];
        break;
      }
    }
    if (!picked) throw new Error(`no puzzle available for day ${day} — raise POOL_TARGET`);
    lastUsed.set(picked.start_id, day);
    lastUsed.set(picked.target_id, day);
    scheduled.push({ ...picked, day });
  }

  const outDir = join(here, "..", "..", "..", "apps", "handshakes", "src", "data");
  mkdirSync(outDir, { recursive: true });
  const body = JSON.stringify(
    {
      sport: SPORT,
      launch_date: launchDate,
      generated: new Date().toISOString().slice(0, 10),
      seed: SEED,
      hub_count: HUB_COUNT,
      puzzles: scheduled,
    },
    null,
    0
  );
  const outFile = join(outDir, `puzzles.${SPORT}.json`);
  writeFileSync(outFile, body);
  const sha = createHash("sha256").update(body).digest("hex");

  console.log(JSON.stringify(stats));
  console.log(
    `tiers: easy=${scheduled.filter((p) => p.tier === "easy").length} ` +
      `medium=${scheduled.filter((p) => p.tier === "medium").length} ` +
      `hard=${scheduled.filter((p) => p.tier === "hard").length}`
  );
  console.log(`par: 3=${scheduled.filter((p) => p.par === 3).length} 4=${scheduled.filter((p) => p.par === 4).length}`);
  console.log(`wrote ${scheduled.length} puzzles → ${outFile}`);
  console.log(`sha256 ${sha}`);
}

/** For each consecutive pair, the connecting team season — earliest shared
 *  season, so canonical solutions read chronologically. */
function pathLinks(graph: TeammateGraph, path: string[]): string[] {
  const links: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const shared = sharedTeamSeasons(graph, path[i], path[i + 1]);
    const best = [...shared].sort(
      (x, y) => (graph.teamSeasons.get(x)?.season ?? 0) - (graph.teamSeasons.get(y)?.season ?? 0)
    )[0];
    links.push(best);
  }
  return links;
}

main();
