import { supabase } from "./supabase";
import type { Puzzle } from "../game/types";
import type { Sport } from "../sports/types";

/**
 * Session 6 — DB-backed puzzle serving, FLAG-GATED and fallback-first.
 *
 * When VITE_SERVE_FROM_DB !== "1" (the default), this module does nothing
 * and the game serves from the committed puzzle arrays exactly as before —
 * merging this file changes zero behavior.
 *
 * When the flag is on, main.tsx awaits prefetchDbPuzzle() before mounting:
 * one RPC (get_daily_puzzle / get_archive_puzzle) raced against a short
 * timeout. Success stores the puzzle here; failure, timeout, or an empty
 * schedule leaves it null and the bundled arrays serve as the mandatory
 * fallback (SESSION_6 §6.2 — no player ever sees a broken board because a
 * backend change is mid-flight). An in-progress day keeps working offline
 * from its localStorage save either way, because the save slot doesn't
 * depend on where the puzzle object came from.
 *
 * The RPC resolves the CURRENT day from server time (America/New_York) and
 * refuses any archive day that isn't strictly in the past — the client
 * never sends "today" as a number, so a skewed clock can't pull tomorrow.
 *
 * Cutover order (§6.3): flip flag in preview → diff both paths → flip in
 * prod → only then trim unaired puzzles from the bundle. The trim is NOT
 * part of this change, deliberately: until the RPC has run in production
 * for a while, the full arrays stay in the bundle as the fallback.
 */
export const SERVE_FROM_DB = import.meta.env.VITE_SERVE_FROM_DB === "1";
const TIMEOUT_MS = 1500;

let dbPuzzle: Puzzle | null = null;
let dbPuzzleDay: number | null = null;

export function getDbPuzzle(day: number): Puzzle | null {
  return dbPuzzleDay === day ? dbPuzzle : null;
}

export async function prefetchDbPuzzle(sport: Sport, archiveDay: number | null): Promise<void> {
  if (!SERVE_FROM_DB) return;
  try {
    const call =
      archiveDay !== null
        ? supabase.rpc("get_archive_puzzle", { p_sport: sport, p_day: archiveDay })
        : supabase.rpc("get_daily_puzzle", { p_sport: sport });
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS));
    const { data, error } = (await Promise.race([call, timeout])) as { data: unknown; error: unknown };
    if (error || !data || typeof data !== "object") return; // fallback: bundled arrays
    const p = data as Puzzle;
    if (!p.answer || !Array.isArray(p.stints)) return;
    if (archiveDay !== null) {
      dbPuzzleDay = archiveDay;
    } else {
      // trust the server's day only via the current-day RPC; the caller
      // recomputes the local day and both must agree or we fall back
      dbPuzzleDay = null;
      const { data: d } = await supabase.rpc("current_day", { p_sport: sport });
      if (typeof d === "number") dbPuzzleDay = d;
    }
    if (dbPuzzleDay !== null) dbPuzzle = p;
  } catch {
    /* timeout or network — bundled arrays serve, by design */
  }
}
