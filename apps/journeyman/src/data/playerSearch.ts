/**
 * Shared type-ahead search over a sport's player index.
 *
 * The indexes are big (8k NFL, 11k MLB, 5k NBA), so each sport's index is
 * loaded on demand — the config hands over a dynamic `import()` and Vite
 * splits it into its own chunk. Only the league you're actually playing
 * ever gets downloaded, and it starts loading the moment the board mounts.
 */

export interface IndexedPlayer {
  name: string;
  yearsActive: string;
}

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.'’]/g, "");

/** Comparison key for player names: case-, accent-, and punctuation-blind.
 *  Sources disagree on diacritics (Lahman ships "Carlos Beltran", our
 *  puzzles say "Carlos Beltrán"), so every name comparison goes through
 *  this — otherwise picking the right player could score as a miss. */
export const normalizeName = (s: string) => stripDiacritics(s.trim().toLowerCase());

export interface PlayerSearch {
  /** kick off the index download; safe to call repeatedly */
  load: () => Promise<void>;
  /** empty until the index has loaded */
  search: (query: string, limit?: number) => IndexedPlayer[];
}

export function createPlayerSearch(
  loader: () => Promise<[string, string][]>
): PlayerSearch {
  let players: IndexedPlayer[] = [];
  let normalized: string[] = [];
  let pending: Promise<void> | null = null;

  const load = () => {
    if (!pending) {
      pending = loader().then((raw) => {
        players = raw.map(([name, yearsActive]) => ({ name, yearsActive }));
        // pre-normalized once for fast type-ahead over thousands of names
        normalized = players.map((p) => normalizeName(p.name));
      });
    }
    return pending;
  };

  const search = (query: string, limit = 8): IndexedPlayer[] => {
    const q = normalizeName(query);
    if (q.length < 2 || normalized.length === 0) return [];
    const starts: IndexedPlayer[] = [];
    const contains: IndexedPlayer[] = [];
    for (let i = 0; i < normalized.length; i++) {
      const n = normalized[i];
      // match against full name and each word start (type "pip" → Pippen)
      if (n.startsWith(q) || n.includes(" " + q)) starts.push(players[i]);
      else if (n.includes(q)) contains.push(players[i]);
      if (starts.length >= limit) return starts.slice(0, limit);
    }
    return [...starts, ...contains].slice(0, limit);
  };

  return { load, search };
}
