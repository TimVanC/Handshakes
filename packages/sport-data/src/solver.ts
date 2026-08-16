import type { TeammateGraph } from "./graph";

/**
 * BFS machinery over the teammate graph. Par is measured in HANDSHAKES —
 * edges traversed, not players placed. A chain of 4 players is 3 handshakes.
 *
 * `excluded` players are skipped as intermediates only: an excluded player
 * may still be an endpoint (a superstar can headline a puzzle; they just
 * can't be the route through it — see the hub-avoidance filter).
 */

export interface SolveOptions {
  excluded?: ReadonlySet<string>;
}

function neighbors(graph: TeammateGraph, id: string): IterableIterator<string> {
  return (graph.adjacency.get(id) ?? new Map<string, string[]>()).keys();
}

/** Handshake distance from `from` to every reachable player. */
export function distancesFrom(
  graph: TeammateGraph,
  from: string,
  opts: SolveOptions = {}
): Map<string, number> {
  const excluded = opts.excluded;
  const dist = new Map<string, number>([[from, 0]]);
  let frontier = [from];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      const d = dist.get(id)!;
      for (const nb of neighbors(graph, id)) {
        if (dist.has(nb)) continue;
        dist.set(nb, d + 1);
        if (!excluded?.has(nb)) next.push(nb); // excluded nodes are dead ends
      }
    }
    frontier = next;
  }
  return dist;
}

/** Par in handshakes, or null if unreachable. */
export function par(
  graph: TeammateGraph,
  start: string,
  target: string,
  opts: SolveOptions = {}
): number | null {
  if (start === target) return 0;
  const excluded = opts.excluded;
  const seen = new Set([start]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighbors(graph, id)) {
        if (seen.has(nb)) continue;
        if (nb === target) return depth;
        seen.add(nb);
        // excluded players terminate the walk — no route may pass through them
        if (!excluded?.has(nb)) next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}

/** One canonical optimal path (player ids, endpoints included), or null. */
export function shortestPath(
  graph: TeammateGraph,
  start: string,
  target: string,
  opts: SolveOptions = {}
): string[] | null {
  if (start === target) return [start];
  const excluded = opts.excluded;
  const prev = new Map<string, string>();
  const seen = new Set([start]);
  let frontier = [start];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighbors(graph, id)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        prev.set(nb, id);
        if (nb === target) {
          const path = [target];
          let cur = target;
          while (cur !== start) {
            cur = prev.get(cur)!;
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

/**
 * Number of distinct optimal paths (length exactly par), via layered BFS
 * from both endpoints: standard shortest-path counting, capped so hub-dense
 * pairs don't overflow (the cap is far above any difficulty-tier boundary).
 */
export function countOptimalPaths(
  graph: TeammateGraph,
  start: string,
  target: string,
  opts: SolveOptions & { cap?: number } = {}
): { par: number; count: number } | null {
  const cap = opts.cap ?? 1_000_000;
  const excluded = opts.excluded;
  if (start === target) return { par: 0, count: 1 };
  const dist = new Map<string, number>([[start, 0]]);
  const ways = new Map<string, number>([[start, 1]]);
  let frontier = [start];
  let found: number | null = null;
  while (frontier.length) {
    const d = dist.get(frontier[0])!;
    if (found !== null && d + 1 > found) break;
    const next: string[] = [];
    for (const id of frontier) {
      const w = ways.get(id)!;
      for (const nb of neighbors(graph, id)) {
        const isBlocked = excluded?.has(nb) && nb !== target;
        const seenAt = dist.get(nb);
        if (seenAt === undefined) {
          dist.set(nb, d + 1);
          ways.set(nb, w);
          if (nb === target) found = d + 1;
          else if (!isBlocked) next.push(nb);
        } else if (seenAt === d + 1) {
          ways.set(nb, Math.min(cap, ways.get(nb)! + w));
        }
      }
    }
    frontier = next;
  }
  if (found === null) return null;
  return { par: found, count: ways.get(target)! };
}

/** Players ranked by degree (distinct career teammates), descending —
 *  the hub list for the hub-avoidance filter. */
export function degreeRanking(
  graph: TeammateGraph
): { playerId: string; degree: number }[] {
  const ranks: { playerId: string; degree: number }[] = [];
  for (const [id, edges] of graph.adjacency) {
    ranks.push({ playerId: id, degree: edges.size });
  }
  ranks.sort((a, b) => b.degree - a.degree || a.playerId.localeCompare(b.playerId));
  return ranks;
}
