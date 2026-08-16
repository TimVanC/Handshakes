// Quick human-readable dump of scheduled puzzles for manual fairness review.
// Usage: node scripts/inspect.mjs [count]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(here, "..", "data", "nba.json"), "utf-8"));
const table = JSON.parse(
  readFileSync(
    join(here, "..", "..", "..", "apps", "handshakes", "src", "data", "puzzles.nba.json"),
    "utf-8"
  )
);
const names = new Map(dataset.players.map((p) => [p.id, p.full_name]));
const ts = new Map(dataset.team_seasons.map((t) => [t.id, t.display_name]));

const count = Number(process.argv[2] ?? 10);
for (const pz of table.puzzles.slice(0, count)) {
  const chain = pz.canonical_path
    .map((id, i) =>
      i < pz.canonical_links.length
        ? `${names.get(id)} —[${ts.get(pz.canonical_links[i])}]→ `
        : names.get(id)
    )
    .join("");
  console.log(
    `#${pz.day} [${pz.tier}] par ${pz.par} (${pz.solution_count} routes, spread ${pz.era_spread})\n   ${chain}\n`
  );
}
