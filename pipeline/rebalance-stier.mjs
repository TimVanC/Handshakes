#!/usr/bin/env node
/**
 * One-time tier rebalance (2026-08-10, owner-requested).
 *
 * Rebuilds each sport's future schedule (unfrozen rows after the current
 * day) to the owner's target mix — ~80% S / ~12% A / ~6% B-K — by:
 *   1. retiring surplus A / B-K rows plus every LEG outlier into
 *      public.retired_puzzles (full puzzle JSON preserved, reversible);
 *   2. inserting the freshly authored S-tier batches from src/data puzzle
 *      arrays (source = 'generated');
 *   3. renumbering the surviving + new rows into contiguous days with A and
 *      B-K spread evenly through the run;
 *   4. bumping schedule_versions and writing admin_schedule_audit rows.
 *
 * Uses DATABASE_URL from .env exactly like pipeline/load.mjs.
 * Safe to re-run only if the previous run aborted (single transaction).
 */
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.DATABASE_URL) { console.error("No DATABASE_URL in .env"); process.exit(1); }

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function loadArray(path, name) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const st = src.indexOf(`export const ${name}`);
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", st)));
  let d = 0, e = -1;
  for (let i = open; i < src.length; i++) { if (src[i] === "[") d++; else if (src[i] === "]" && --d === 0) { e = i; break; } }
  return Function(`return (${src.slice(open, e + 1)});`)();
}

const PUZZLES = {
  nba: loadArray("src/data/puzzles.ts", "puzzles"),
  nfl: loadArray("src/data/nfl/puzzles.ts", "nflPuzzles"),
  mlb: loadArray("src/data/mlb/puzzles.ts", "mlbPuzzles"),
};

// New S-tier names per sport: the authored batches plus already-authored but
// never-scheduled puzzles being activated by this rebalance.
const NEW_NAMES = {
  nba: [
    ...JSON.parse(readFileSync("pipeline/out/nba-stier-config.json", "utf8")).players.map((p) => p.answer),
    "Jim Jackson",
  ],
  mlb: [
    ...JSON.parse(readFileSync("pipeline/out/mlb-stier-config.json", "utf8")).players
      .map((n) => (n === "A.J. Burnett" ? "A. J. Burnett" : n === "B.J. Upton" ? "B. J. Upton" : n)),
    "Nelson Cruz", "Curtis Granderson",
  ],
  nfl: [
    ...JSON.parse(readFileSync("pipeline/out/nfl-stier-config.json", "utf8")).players,
    "Marshawn Lynch", "Joe Flacco",
  ],
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const tiers = new Map();
for (const row of (await client.query("select sport, player_name, tier from public.player_tiers")).rows) {
  tiers.set(`${row.sport}|${norm(row.player_name)}`, row.tier);
}
const actor = (await client.query("select user_id from public.admin_users limit 1")).rows[0].user_id;

try {
  await client.query("begin");
  for (const sport of ["nba", "nfl", "mlb"]) {
    const cd = (await client.query("select public.current_day($1) as cd", [sport])).rows[0].cd;
    const future = (await client.query(
      "select schedule_id, day, answer from public.scheduled_puzzles where sport = $1 and not frozen and day > public.current_day($1) order by day",
      [sport]
    )).rows;
    const tierOf = (answer) => tiers.get(`${sport}|${norm(answer)}`) ?? "?";

    const byAnswer = new Map(PUZZLES[sport].map((p) => [norm(p.answer), p]));
    const scheduledAnswers = new Set(
      (await client.query("select answer from public.scheduled_puzzles where sport = $1", [sport])).rows.map((r) => norm(r.answer))
    );
    const newcomers = [];
    for (const name of NEW_NAMES[sport]) {
      if (scheduledAnswers.has(norm(name))) continue;
      const p = byAnswer.get(norm(name));
      if (!p) throw new Error(`${sport}: no built puzzle for new name ${name}`);
      newcomers.push(p);
    }

    const survivorsS = future.filter((r) => tierOf(r.answer) === "S");
    const survivorsA = future.filter((r) => tierOf(r.answer) === "A");
    const survivorsBC = future.filter((r) => tierOf(r.answer) === "B-C");
    const survivorsBK = future.filter((r) => tierOf(r.answer) === "B-K");
    const outliers = future.filter((r) => ["LEG", "GHOST", "?"].includes(tierOf(r.answer)));

    const totalS = survivorsS.length + newcomers.length;
    const tEst = Math.round(totalS / 0.8);
    const keepA = Math.min(survivorsA.length, Math.round(tEst * 0.125));
    const keepBK = Math.min(survivorsBK.length, Math.round(tEst * 0.0625));
    const retire = [...survivorsA.slice(keepA), ...survivorsBK.slice(keepBK), ...outliers];
    const T = totalS + keepA + keepBK + survivorsBC.length;

    // Spread A and B-K days evenly through the run; S fills everything else.
    const slotTier = new Array(T).fill("S");
    const place = (count, label) => {
      for (let k = 0; k < count; k++) {
        let at = Math.min(T - 1, Math.floor((k + 0.5) * T / count));
        while (slotTier[at] !== "S") at = (at + 1) % T;
        slotTier[at] = label;
      }
    };
    if (keepBK) place(keepBK, "B-K");
    if (keepA) place(keepA, "A");
    if (survivorsBC.length) place(survivorsBC.length, "B-C");

    const queues = {
      S: [...survivorsS.map((r) => ({ kind: "old", row: r })), ...newcomers.map((p) => ({ kind: "new", puzzle: p }))],
      A: survivorsA.slice(0, keepA).map((r) => ({ kind: "old", row: r })),
      "B-K": survivorsBK.slice(0, keepBK).map((r) => ({ kind: "old", row: r })),
      "B-C": survivorsBC.map((r) => ({ kind: "old", row: r })),
    };

    const before = (await client.query(
      "select coalesce(jsonb_agg(jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer) order by day), '[]'::jsonb) as ord from public.scheduled_puzzles where sport = $1 and not frozen and day > public.current_day($1)",
      [sport]
    )).rows[0].ord;

    // 1. retire
    for (const r of retire) {
      await client.query(
        `insert into public.retired_puzzles (schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at, reason)
         select schedule_id, sport, day, answer, puzzle, source, status, frozen, generated_at, $2
         from public.scheduled_puzzles where schedule_id = $1`,
        [r.schedule_id, `ratio rebalance: surplus ${tierOf(r.answer)}`]
      );
      await client.query("delete from public.scheduled_puzzles where schedule_id = $1", [r.schedule_id]);
    }

    // 2. park survivors clear of the target day range
    await client.query(
      "update public.scheduled_puzzles set day = day + 5000 where sport = $1 and not frozen and day > public.current_day($1)",
      [sport]
    );

    // 3. place everything
    let day = cd;
    for (const label of slotTier) {
      day += 1;
      const item = queues[label].shift();
      if (!item) throw new Error(`${sport}: queue ${label} ran dry at day ${day}`);
      if (item.kind === "old") {
        await client.query("update public.scheduled_puzzles set day = $1 where schedule_id = $2", [day, item.row.schedule_id]);
      } else {
        await client.query(
          "insert into public.scheduled_puzzles (sport, day, answer, puzzle, source, status, frozen) values ($1, $2, $3, $4::jsonb, 'generated', 'scheduled', false)",
          [sport, day, item.puzzle.answer, JSON.stringify(item.puzzle)]
        );
      }
    }
    for (const label of ["S", "A", "B-K", "B-C"]) {
      if (queues[label].length) throw new Error(`${sport}: ${queues[label].length} ${label} items left unplaced`);
    }

    const after = (await client.query(
      "select coalesce(jsonb_agg(jsonb_build_object('scheduleId', schedule_id, 'day', day, 'answer', answer) order by day), '[]'::jsonb) as ord from public.scheduled_puzzles where sport = $1 and not frozen and day > public.current_day($1)",
      [sport]
    )).rows[0].ord;
    await client.query(
      "insert into public.admin_schedule_audit (actor_user_id, sport, old_order, new_order) values ($1, $2, $3, $4)",
      [actor, sport, JSON.stringify(before), JSON.stringify(after)]
    );
    await client.query("update public.schedule_versions set version = version + 1, updated_at = now() where sport = $1", [sport]);

    console.log(`${sport}: T=${T} (S ${totalS}, A ${keepA}, B-K ${keepBK}, B-C ${survivorsBC.length}); retired ${retire.length}; new inserts ${newcomers.length}; runway day ${cd + 1}..${cd + T}`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  console.error("ROLLED BACK:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
