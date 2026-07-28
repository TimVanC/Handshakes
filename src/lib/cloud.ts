import { supabase } from "./supabase";
import type { Sport } from "../sports/types";
import type { SportStorage } from "../game/storage";

/** One finished game as stored in Supabase (`results_v2` table).
 *
 *  MULTI-SPORT NOTE: this client talks to `results_v2` / `plays_v2` /
 *  `day_score_stats_v2`, which carry a `sport` column. They're separate
 *  tables from the originals precisely so the currently-live NBA-only
 *  client (which upserts `results` on_conflict user_id,day) keeps working
 *  while this branch is in preview. The migration that creates them lives
 *  in supabase/multisport-migration.sql and has already been applied; see
 *  that file for the merge-day top-up step. */
export interface CloudResult {
  day: number;
  won: boolean;
  /** jerseys flipped when solved; null on a DNF */
  revealed: number | null;
  /** 0-1000 points; null on rows recorded before scoring existed */
  score: number | null;
  is_archive: boolean;
  /** set only by fetchAllResults (the "All" stats view); per-sport
   *  fetchResults omits it since every row is the one sport */
  sport?: Sport;
}

/** Fire-and-forget: record a finished game for the signed-in user.
 *  No-op when signed out. Cloud keeps the FIRST result for a day
 *  (ignoreDuplicates), matching the local "record exactly once" rule. */
export async function pushResult(
  sport: Sport,
  day: number,
  result: number | "DNF",
  isArchive: boolean,
  score: number
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  await supabase.from("results_v2").upsert(
    {
      user_id: userId,
      sport,
      day,
      won: result !== "DNF",
      revealed: result === "DNF" ? null : result,
      score,
      is_archive: isArchive,
    },
    { onConflict: "user_id,sport,day", ignoreDuplicates: true }
  );
}

/** On sign-in: push everything recorded locally for every sport (first
 *  result per day wins server-side). Test-mode days (9000+) never leave
 *  the device. */
export async function syncUp(
  ledgers: Array<{ sport: Sport; storage: SportStorage }>
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  /* Keyed by `sport:day`, because one day can appear in BOTH ledgers: an
     archive replay of a day already played live is allowed, which writes the
     day to the archive ledger while the daily history still holds it. Two
     rows sharing a conflict target in one upsert makes Postgres reject the
     ENTIRE statement ("ON CONFLICT DO UPDATE command cannot affect row a
     second time"), so a single overlapping day used to block the whole
     sign-in sync. The daily row is the authoritative one and wins. */
  const byKey = new Map<string, Record<string, unknown>>();
  for (const { sport, storage } of ledgers) {
    const profile = storage.loadProfile();
    const scores = storage.loadLocalScores();
    for (const [dayStr, res] of Object.entries(profile.history)) {
      const day = Number(dayStr);
      if (day >= 9000) continue; // test slots stay local
      byKey.set(`${sport}:${day}`, {
        user_id: userId,
        sport,
        day,
        won: res !== "DNF",
        revealed: res === "DNF" ? null : res,
        score: scores[day] ?? null,
        is_archive: false,
      });
    }
    const archive = storage.loadArchiveResults();
    for (const [dayStr, res] of Object.entries(archive)) {
      const day = Number(dayStr);
      if (byKey.has(`${sport}:${day}`)) continue; // daily history wins
      byKey.set(`${sport}:${day}`, {
        user_id: userId,
        sport,
        day,
        won: res !== "DNF",
        revealed: res === "DNF" ? null : res,
        score: scores[day] ?? null,
        is_archive: true,
      });
    }
  }
  const rows = [...byKey.values()];
  if (rows.length > 0) {
    // plain upsert (NOT ignoreDuplicates): the local ledger is itself
    // recorded exactly once per day, so re-syncing can only backfill —
    // e.g. add a score to a row that first synced scoreless
    const { error } = await supabase
      .from("results_v2")
      .upsert(rows, { onConflict: "user_id,sport,day" });
    // a swallowed error here means a returning player's history silently
    // never reaches the cloud — the one failure mode worth being loud about
    if (error) {
      console.error(
        `[journeyman] syncUp failed: ${rows.length} local result(s) did not upload`,
        error
      );
    }
  }
}

/** Log a finished game into the anonymous play pool (everyone, signed in or
 *  not) — this is what powers "better than X% of today's players". Write-only
 *  on the client; aggregates come back through the day_score_stats RPC. */
export async function logPlay(p: {
  sport: Sport;
  day: number;
  won: boolean;
  revealed: number | null;
  score: number;
  hard: boolean;
  isArchive: boolean;
}): Promise<void> {
  if (p.day >= 9000) return; // test slots stay off the books
  await supabase.from("plays_v2").insert({
    sport: p.sport,
    day: p.day,
    won: p.won,
    revealed: p.revealed,
    score: p.score,
    hard: p.hard,
    is_archive: p.isArchive,
  });
}

export interface DayStanding {
  /** other players who finished this day's puzzle (you excluded) */
  others: number;
  /** how many of them you outscored */
  beaten: number;
}

/** Where a score lands against everyone who played this day. */
export async function fetchDayStanding(
  sport: Sport,
  day: number,
  score: number
): Promise<DayStanding | null> {
  const { data, error } = await supabase.rpc("day_score_stats_v2", {
    p_sport: sport,
    p_day: day,
    p_score: score,
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const total = Number(row.total);
  const lower = Number(row.lower_scores);
  // own play is in the pool by the time this runs — compare against the rest
  return { others: Math.max(0, total - 1), beaten: lower };
}

/** All of the signed-in user's results for one sport, for stats + the
 *  archive grid. */
export async function fetchResults(sport: Sport): Promise<CloudResult[]> {
  const { data, error } = await supabase
    .from("results_v2")
    .select("day, won, revealed, score, is_archive")
    .eq("sport", sport)
    .order("day");
  if (error || !data) return [];
  return data as CloudResult[];
}

/** Every sport's results in one shot (each row tagged with its sport) —
 *  powers the "All" tab of the stats locker. */
export async function fetchAllResults(): Promise<CloudResult[]> {
  const { data, error } = await supabase
    .from("results_v2")
    .select("sport, day, won, revealed, score, is_archive")
    .order("day");
  if (error || !data) return [];
  return data as CloudResult[];
}

/** Fixed score buckets — every puzzle lands on the same 0-1000 scale no
 *  matter how many jerseys its career has, so the chart shape is stable. */
export const SCORE_BUCKETS = [
  { label: "1000", test: (s: number) => s === 1000 },
  { label: "800+", test: (s: number) => s >= 800 && s < 1000 },
  { label: "600+", test: (s: number) => s >= 600 && s < 800 },
  { label: "400+", test: (s: number) => s >= 400 && s < 600 },
  { label: "<400", test: (s: number) => s < 400 },
] as const;

export interface Stats {
  played: number;
  wins: number;
  winPct: number;
  /** live daily streak (archive games don't count) */
  currentStreak: number;
  maxStreak: number;
  /** wins with a perfect 1000 */
  perfect: number;
  /** mean score across scored wins; null until there is one */
  avgScore: number | null;
  /** win counts per SCORE_BUCKETS entry, plus the DNF total at the end */
  scoreDist: number[];
  dnf: number;
  archivePlayed: number;
  archiveWins: number;
}

/** Pure stats over a result set. `today` = current daily puzzle number. */
export function computeStats(results: CloudResult[], today: number): Stats {
  const daily = results.filter((r) => !r.is_archive && r.day < 9000);
  const arch = results.filter((r) => r.is_archive);

  const wins = daily.filter((r) => r.won).length;
  const scored = daily.filter((r) => r.won && r.score != null) as Array<
    CloudResult & { score: number }
  >;
  const scoreDist = SCORE_BUCKETS.map((b) => scored.filter((r) => b.test(r.score)).length);
  const perfect = scored.filter((r) => r.score === 1000).length;
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : null;

  // streaks over consecutive daily-day wins
  const wonDays = new Set(daily.filter((r) => r.won).map((r) => r.day));
  let maxStreak = 0;
  for (const d of wonDays) {
    if (wonDays.has(d - 1)) continue; // not a streak start
    let len = 1;
    while (wonDays.has(d + len)) len++;
    maxStreak = Math.max(maxStreak, len);
  }
  // current streak counts back from today (or yesterday if today is unplayed)
  let currentStreak = 0;
  let cursor = wonDays.has(today) ? today : today - 1;
  while (wonDays.has(cursor)) {
    currentStreak++;
    cursor--;
  }

  return {
    played: daily.length,
    wins,
    winPct: daily.length > 0 ? Math.round((wins / daily.length) * 100) : 0,
    currentStreak,
    maxStreak,
    perfect,
    avgScore,
    scoreDist,
    dnf: daily.length - wins,
    archivePlayed: arch.length,
    archiveWins: arch.filter((r) => r.won).length,
  };
}
