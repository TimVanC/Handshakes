// scripts/generate.ts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// src/graph.ts
function buildGraph(dataset) {
  const players = new Map(dataset.players.map((p) => [p.id, p]));
  const teamSeasons = new Map(dataset.team_seasons.map((t) => [t.id, t]));
  const rosters = /* @__PURE__ */ new Map();
  const careers = /* @__PURE__ */ new Map();
  for (const a of dataset.appearances) {
    if (a.games_played < 1) continue;
    let roster = rosters.get(a.team_season_id);
    if (!roster) rosters.set(a.team_season_id, roster = []);
    roster.push(a.player_id);
    let career = careers.get(a.player_id);
    if (!career) careers.set(a.player_id, career = []);
    career.push(a.team_season_id);
  }
  for (const career of careers.values()) {
    career.sort(
      (x, y) => (teamSeasons.get(x)?.season ?? 0) - (teamSeasons.get(y)?.season ?? 0)
    );
  }
  const adjacency = /* @__PURE__ */ new Map();
  const link = (a, b, ts) => {
    let edges = adjacency.get(a);
    if (!edges) adjacency.set(a, edges = /* @__PURE__ */ new Map());
    let shared = edges.get(b);
    if (!shared) edges.set(b, shared = []);
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
function sharedTeamSeasons(graph, a, b) {
  return graph.adjacency.get(a)?.get(b) ?? [];
}

// src/solver.ts
function neighbors(graph, id) {
  return (graph.adjacency.get(id) ?? /* @__PURE__ */ new Map()).keys();
}
function par(graph, start, target, opts = {}) {
  if (start === target) return 0;
  const excluded = opts.excluded;
  const seen = /* @__PURE__ */ new Set([start]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next = [];
    for (const id of frontier) {
      for (const nb of neighbors(graph, id)) {
        if (seen.has(nb)) continue;
        if (nb === target) return depth;
        seen.add(nb);
        if (!excluded?.has(nb)) next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}
function shortestPath(graph, start, target, opts = {}) {
  if (start === target) return [start];
  const excluded = opts.excluded;
  const prev = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set([start]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const nb of neighbors(graph, id)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        prev.set(nb, id);
        if (nb === target) {
          const path = [target];
          let cur = target;
          while (cur !== start) {
            cur = prev.get(cur);
            path.push(cur);
          }
          return path.reverse();
        }
        if (!excluded?.has(nb)) next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}
function countOptimalPaths(graph, start, target, opts = {}) {
  const cap = opts.cap ?? 1e6;
  const excluded = opts.excluded;
  if (start === target) return { par: 0, count: 1 };
  const dist = /* @__PURE__ */ new Map([[start, 0]]);
  const ways = /* @__PURE__ */ new Map([[start, 1]]);
  let frontier = [start];
  let found = null;
  while (frontier.length) {
    const d = dist.get(frontier[0]);
    if (found !== null && d + 1 > found) break;
    const next = [];
    for (const id of frontier) {
      const w = ways.get(id);
      for (const nb of neighbors(graph, id)) {
        const isBlocked = excluded?.has(nb) && nb !== target;
        const seenAt = dist.get(nb);
        if (seenAt === void 0) {
          dist.set(nb, d + 1);
          ways.set(nb, w);
          if (nb === target) found = d + 1;
          else if (!isBlocked) next.push(nb);
        } else if (seenAt === d + 1) {
          ways.set(nb, Math.min(cap, ways.get(nb) + w));
        }
      }
    }
    frontier = next;
  }
  if (found === null) return null;
  return { par: found, count: ways.get(target) };
}
function degreeRanking(graph) {
  const ranks = [];
  for (const [id, edges] of graph.adjacency) {
    ranks.push({ playerId: id, degree: edges.size });
  }
  ranks.sort((a, b) => b.degree - a.degree || a.playerId.localeCompare(b.playerId));
  return ranks;
}

// scripts/generate.ts
var SPORT = "nba";
var HUB_COUNT = 50;
var PAR_MIN = 3;
var PAR_MAX = 4;
var NOTABILITY_MIN = 88;
var CAREER_GAMES_MIN = 350;
var DAYS = 366;
var POOL_TARGET = 430;
var ENDPOINT_COOLDOWN_DAYS = 45;
var SEED = 20260816;
var launchDate = process.argv[2] ?? "2026-09-07";
if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
  throw new Error(`launch date must be YYYY-MM-DD, got: ${launchDate}`);
}
var launchDow = (/* @__PURE__ */ new Date(`${launchDate}T12:00:00Z`)).getUTCDay();
var WEEK_PATTERN = {
  1: "easy",
  2: "easy",
  3: "medium",
  4: "hard",
  5: "hard",
  6: "medium",
  0: "medium"
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataset = JSON.parse(
    readFileSync(join(here, "..", "data", `${SPORT}.json`), "utf-8")
  );
  const graph = buildGraph(dataset);
  const rand = mulberry32(SEED);
  const hubs = new Set(
    degreeRanking(graph).slice(0, HUB_COUNT).map((r) => r.playerId)
  );
  const eligible = dataset.players.filter(
    (p) => p.notability >= NOTABILITY_MIN && p.career_games >= CAREER_GAMES_MIN && graph.adjacency.has(p.id)
  );
  console.log(`eligible endpoints: ${eligible.length} (hubs excluded from routes: ${hubs.size})`);
  const pool = [];
  const seenPairs = /* @__PURE__ */ new Set();
  const stats = { sampled: 0, offPar: 0, hubDependent: 0, kept: 0 };
  while (pool.length < POOL_TARGET && stats.sampled < 2e5) {
    stats.sampled++;
    const a = eligible[Math.floor(rand() * eligible.length)];
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
    const hubFree = par(graph, a.id, b.id, { excluded: hubs });
    if (hubFree !== p) {
      stats.hubDependent++;
      continue;
    }
    const counted = countOptimalPaths(graph, a.id, b.id);
    const path = shortestPath(graph, a.id, b.id, { excluded: hubs });
    const links = pathLinks(graph, path);
    const [start, target] = a.first_season <= b.first_season ? [a, b] : [b, a];
    const oriented = path[0] === start.id ? path : [...path].reverse();
    pool.push({
      sport: SPORT,
      start_id: start.id,
      target_id: target.id,
      par: p,
      solution_count: counted.count,
      tier: "medium",
      // assigned from the pool distribution below
      era_spread: Math.abs(start.last_season - target.first_season),
      canonical_path: oriented,
      canonical_links: path[0] === oriented[0] ? links : [...links].reverse()
    });
    stats.kept++;
  }
  if (pool.length < DAYS) {
    throw new Error(
      `only ${pool.length} puzzles survived the filters (need ${DAYS}); loosen NOTABILITY_MIN or raise the sample budget`
    );
  }
  const sorted = [...pool].sort((x, y) => x.solution_count - y.solution_count);
  const t1 = sorted[Math.floor(sorted.length / 3)].solution_count;
  const t2 = sorted[Math.floor(2 * sorted.length / 3)].solution_count;
  for (const pz of pool) {
    pz.tier = pz.solution_count <= t1 ? "hard" : pz.solution_count <= t2 ? "medium" : "easy";
  }
  const byTier = {
    easy: pool.filter((p) => p.tier === "easy"),
    medium: pool.filter((p) => p.tier === "medium"),
    hard: pool.filter((p) => p.tier === "hard")
  };
  const lastUsed = /* @__PURE__ */ new Map();
  const scheduled = [];
  for (let day = 1; day <= DAYS; day++) {
    const dow = (launchDow + day - 1) % 7;
    const want = WEEK_PATTERN[dow];
    const order = want === "easy" ? ["easy", "medium", "hard"] : want === "hard" ? ["hard", "medium", "easy"] : ["medium", "easy", "hard"];
    let picked = null;
    for (const tier of order) {
      const list = byTier[tier];
      const idx = list.findIndex(
        (pz) => day - (lastUsed.get(pz.start_id) ?? -Infinity) > ENDPOINT_COOLDOWN_DAYS && day - (lastUsed.get(pz.target_id) ?? -Infinity) > ENDPOINT_COOLDOWN_DAYS
      );
      if (idx !== -1) {
        picked = list.splice(idx, 1)[0];
        break;
      }
    }
    if (!picked) throw new Error(`no puzzle available for day ${day} \u2014 raise POOL_TARGET`);
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
      generated: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      seed: SEED,
      hub_count: HUB_COUNT,
      puzzles: scheduled
    },
    null,
    0
  );
  const outFile = join(outDir, `puzzles.${SPORT}.json`);
  writeFileSync(outFile, body);
  const sha = createHash("sha256").update(body).digest("hex");
  console.log(JSON.stringify(stats));
  console.log(
    `tiers: easy=${scheduled.filter((p) => p.tier === "easy").length} medium=${scheduled.filter((p) => p.tier === "medium").length} hard=${scheduled.filter((p) => p.tier === "hard").length}`
  );
  console.log(`par: 3=${scheduled.filter((p) => p.par === 3).length} 4=${scheduled.filter((p) => p.par === 4).length}`);
  console.log(`wrote ${scheduled.length} puzzles \u2192 ${outFile}`);
  console.log(`sha256 ${sha}`);
}
function pathLinks(graph, path) {
  const links = [];
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
