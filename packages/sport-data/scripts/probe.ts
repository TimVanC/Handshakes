import { readFileSync } from "node:fs";
import { buildGraph } from "../src/graph";
import { countOptimalPaths, degreeRanking, par, shortestPath } from "../src/solver";
const ds = JSON.parse(readFileSync(new URL("../data/nba.json", import.meta.url), "utf-8"));
const g = buildGraph(ds);
const byName = new Map(ds.players.map((p: any) => [p.full_name, p]));
const hubs = new Set(degreeRanking(g).slice(0, 50).map((r) => r.playerId));
const pairs: [string, string][] = JSON.parse(process.argv[2]);
for (const [a, b] of pairs) {
  const pa: any = byName.get(a), pb: any = byName.get(b);
  if (!pa || !pb) { console.log(`${a} -> ${b}: MISSING ${!pa ? a : b}`); continue; }
  const p = par(g, pa.id, pb.id); const hf = par(g, pa.id, pb.id, { excluded: hubs });
  const c = p ? countOptimalPaths(g, pa.id, pb.id)!.count : 0;
  const path = shortestPath(g, pa.id, pb.id, { excluded: hubs }) ?? shortestPath(g, pa.id, pb.id);
  console.log(`${a} -> ${b}: par ${p} (hub-free ${hf}, ${c} routes) | ${path?.map((id) => g.players.get(id)!.full_name).join(" > ")}`);
}
