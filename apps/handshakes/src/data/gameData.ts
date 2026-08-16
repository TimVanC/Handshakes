/**
 * Loads a sport's dataset + colorways once, builds the teammate graph, and
 * derives the search index. The dataset is the biggest download in the app
 * (~600 KB gzipped for the NBA), so everything is behind one lazy promise
 * that starts the moment the board mounts.
 */

import {
  buildGraph,
  type SportDataset,
  type TeammateGraph,
} from "@handshakes/sport-data";
import { normalizeName } from "@handshakes/ui/playerSearch";
import type { ColorwayDB } from "@handshakes/jerseys/colorways";
import type { SportEntry } from "../sports";

export interface SearchHit {
  id: string;
  name: string;
  yearsActive: string;
}

export interface GameData {
  sport: SportEntry;
  dataset: SportDataset;
  graph: TeammateGraph;
  colorways: ColorwayDB;
  searchPlayers(query: string, limit?: number): SearchHit[];
}

function yearsActive(first: number, last: number, currentSeason: number): string {
  const from = first - 1; // season end year → season start year reads better
  return last >= currentSeason ? `${from}–present` : `${from}–${last}`;
}

const cache = new Map<string, Promise<GameData>>();

export function loadGameData(sport: SportEntry): Promise<GameData> {
  let pending = cache.get(sport.sport);
  if (pending) return pending;
  pending = Promise.all([sport.loadDataset(), sport.loadColorways()]).then(
    ([rawDataset, rawColorways]) => {
      const dataset = rawDataset as SportDataset;
      const colorways = rawColorways as ColorwayDB;
      const graph = buildGraph(dataset);

      const currentSeason = Math.max(...dataset.players.map((p) => p.last_season));
      const entries = dataset.players.map((p) => ({
        id: p.id,
        name: p.full_name,
        yearsActive: yearsActive(p.first_season, p.last_season, currentSeason),
        norm: normalizeName(p.full_name),
        games: p.career_games,
      }));
      // long careers first so ambiguous prefixes surface the famous name
      entries.sort((a, b) => b.games - a.games);

      const searchPlayers = (query: string, limit = 8): SearchHit[] => {
        const q = normalizeName(query);
        if (q.length < 2) return [];
        const starts: SearchHit[] = [];
        const contains: SearchHit[] = [];
        for (const e of entries) {
          if (e.norm.startsWith(q) || e.norm.includes(" " + q)) starts.push(e);
          else if (e.norm.includes(q)) contains.push(e);
          if (starts.length >= limit) return starts.slice(0, limit);
        }
        return [...starts, ...contains].slice(0, limit);
      };

      return { sport, dataset, graph, colorways, searchPlayers };
    }
  );
  cache.set(sport.sport, pending);
  return pending;
}
