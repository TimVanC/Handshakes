/**
 * Headless Handshakes game core. Pure functions over the teammate graph —
 * no rendering, no storage, no clock. Everything is measured in HANDSHAKES:
 * links formed plus hint penalties. A chain of 4 players is 3 handshakes.
 */

import { sharedTeamSeasons, type TeammateGraph } from "@handshakes/sport-data";

export type EndKey = "start" | "target";
export type GameStatus = "playing" | "solved" | "gave_up";

export interface HsGameState {
  day: number;
  sport: string;
  /** the two puzzle endpoints, immutable for the day */
  startId: string;
  targetId: string;
  /** chain built outward from each end; [0] is the endpoint itself */
  fromStart: string[];
  fromTarget: string[];
  /** team season connecting fromStart[i] to fromStart[i+1] */
  fromStartLinks: string[];
  fromTargetLinks: string[];
  /** set when the two heads collide and the chain closes */
  closingTeamSeasonId: string | null;
  hintPenalties: number;
  /** roster reveals already paid for (re-opening one is free) */
  revealedRosters: string[];
  /** how many canonical-path franchises have been revealed */
  franchiseHintsUsed: number;
  status: GameStatus;
}

export function initialState(
  day: number,
  sport: string,
  startId: string,
  targetId: string
): HsGameState {
  return {
    day,
    sport,
    startId,
    targetId,
    fromStart: [startId],
    fromTarget: [targetId],
    fromStartLinks: [],
    fromTargetLinks: [],
    closingTeamSeasonId: null,
    hintPenalties: 0,
    revealedRosters: [],
    franchiseHintsUsed: 0,
    status: "playing",
  };
}

/** Links formed so far (the closing link included once solved). */
export function linksFormed(s: HsGameState): number {
  return (
    s.fromStart.length -
    1 +
    (s.fromTarget.length - 1) +
    (s.closingTeamSeasonId !== null ? 1 : 0)
  );
}

/** The score. Links formed + hint penalties, in handshakes. */
export function handshakeCount(s: HsGameState): number {
  return linksFormed(s) + s.hintPenalties;
}

/** Result copy. No golf language — par comes from a correct BFS, so
 *  beating it is impossible and birdie would be a lie. */
export function resultLabel(handshakes: number, par: number): string {
  const over = handshakes - par;
  if (over <= 0) return "Clean sweep";
  if (over === 1) return "One extra handshake";
  if (over === 2) return "Two extra handshakes";
  return "The long way around";
}

export function head(s: HsGameState, end: EndKey): string {
  const chain = end === "start" ? s.fromStart : s.fromTarget;
  return chain[chain.length - 1];
}

export type PlacementRejection =
  | { ok: false; reason: "not-playing" }
  | { ok: false; reason: "unknown-player" }
  | { ok: false; reason: "already-in-chain" }
  | { ok: false; reason: "not-teammate"; headId: string };

export type PlacementResult =
  | {
      ok: true;
      state: HsGameState;
      /** the jersey to reveal for this link */
      teamSeasonId: string;
      /** set when this placement collided the two ends and closed the chain */
      closedWith: string | null;
    }
  | PlacementRejection;

/** Earliest shared season — deterministic pick when a pair overlapped on
 *  several rosters, and chains tend to read chronologically. */
function connectingTeamSeason(
  graph: TeammateGraph,
  a: string,
  b: string
): string | null {
  const shared = sharedTeamSeasons(graph, a, b);
  if (shared.length === 0) return null;
  let best = shared[0];
  let bestSeason = graph.teamSeasons.get(best)?.season ?? Infinity;
  for (const ts of shared) {
    const season = graph.teamSeasons.get(ts)?.season ?? Infinity;
    if (season < bestSeason) {
      best = ts;
      bestSeason = season;
    }
  }
  return best;
}

/**
 * The teeter-totter: append to either end at any time. After every
 * placement, if the two heads share a team season the chain closes
 * AUTOMATICALLY — no submit button. Rejections carry no penalty.
 */
export function place(
  graph: TeammateGraph,
  s: HsGameState,
  end: EndKey,
  playerId: string
): PlacementResult {
  if (s.status !== "playing") return { ok: false, reason: "not-playing" };
  if (!graph.players.has(playerId)) return { ok: false, reason: "unknown-player" };
  if (s.fromStart.includes(playerId) || s.fromTarget.includes(playerId)) {
    return { ok: false, reason: "already-in-chain" };
  }

  const headId = head(s, end);
  const link = connectingTeamSeason(graph, headId, playerId);
  if (!link) return { ok: false, reason: "not-teammate", headId };

  const next: HsGameState = {
    ...s,
    fromStart: end === "start" ? [...s.fromStart, playerId] : s.fromStart,
    fromTarget: end === "target" ? [...s.fromTarget, playerId] : s.fromTarget,
    fromStartLinks: end === "start" ? [...s.fromStartLinks, link] : s.fromStartLinks,
    fromTargetLinks: end === "target" ? [...s.fromTargetLinks, link] : s.fromTargetLinks,
  };

  // collision check — the payoff
  const closing = connectingTeamSeason(graph, head(next, "start"), head(next, "target"));
  if (closing) {
    return {
      ok: true,
      state: { ...next, closingTeamSeasonId: closing, status: "solved" },
      teamSeasonId: link,
      closedWith: closing,
    };
  }
  return { ok: true, state: next, teamSeasonId: link, closedWith: null };
}

/** Remove the most recent player from an end; refunds the handshake.
 *  This is a puzzle, not a test — punishing exploration makes people quit. */
export function undo(s: HsGameState, end: EndKey): HsGameState {
  if (s.status !== "playing") return s;
  if (end === "start") {
    if (s.fromStart.length <= 1) return s;
    return {
      ...s,
      fromStart: s.fromStart.slice(0, -1),
      fromStartLinks: s.fromStartLinks.slice(0, -1),
    };
  }
  if (s.fromTarget.length <= 1) return s;
  return {
    ...s,
    fromTarget: s.fromTarget.slice(0, -1),
    fromTargetLinks: s.fromTargetLinks.slice(0, -1),
  };
}

/** Roster reveal: pick one of a head's team seasons, see the full roster.
 *  Costs +1 handshake the first time; re-opening a paid roster is free. */
export function revealRoster(s: HsGameState, teamSeasonId: string): HsGameState {
  if (s.status !== "playing") return s;
  if (s.revealedRosters.includes(teamSeasonId)) return s;
  return {
    ...s,
    revealedRosters: [...s.revealedRosters, teamSeasonId],
    hintPenalties: s.hintPenalties + 1,
  };
}

/** Franchise hint: reveals the next franchise along the canonical optimal
 *  path. Costs +1 handshake. Returns state unchanged once exhausted. */
export function useFranchiseHint(s: HsGameState, canonicalLinkCount: number): HsGameState {
  if (s.status !== "playing") return s;
  if (s.franchiseHintsUsed >= canonicalLinkCount) return s;
  return {
    ...s,
    franchiseHintsUsed: s.franchiseHintsUsed + 1,
    hintPenalties: s.hintPenalties + 1,
  };
}

/** Show solution: free, ends the run, marks the day played-but-unsolved. */
export function giveUp(s: HsGameState): HsGameState {
  if (s.status !== "playing") return s;
  return { ...s, status: "gave_up" };
}

/** The finished chain, start → target, once solved. */
export function mergedChain(s: HsGameState): { players: string[]; links: string[] } | null {
  if (s.status !== "solved" || s.closingTeamSeasonId === null) return null;
  const players = [...s.fromStart, ...[...s.fromTarget].reverse()];
  const links = [
    ...s.fromStartLinks,
    s.closingTeamSeasonId,
    ...[...s.fromTargetLinks].reverse(),
  ];
  return { players, links };
}
