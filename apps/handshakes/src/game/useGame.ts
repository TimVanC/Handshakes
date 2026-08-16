import { useCallback, useMemo, useRef, useState } from "react";
import { createStorage, type Profile } from "@handshakes/ui/storage";
import type { GameData } from "../data/gameData";
import { LAUNCH_DATE, puzzleForDay, type DailyPuzzle } from "../data/puzzles";
import {
  giveUp as engineGiveUp,
  handshakeCount,
  initialState,
  place,
  revealRoster,
  undo as engineUndo,
  useFranchiseHint,
  type EndKey,
  type HsGameState,
  type PlacementResult,
} from "./engine";

export interface GameApi {
  day: number;
  puzzle: DailyPuzzle;
  state: HsGameState;
  handshakes: number;
  profile: Profile;
  /** set for one render cycle after the chain closes — drives the collision */
  justClosed: boolean;
  tryPlace(end: EndKey, playerId: string): PlacementResult;
  undo(end: EndKey): void;
  payRosterReveal(teamSeasonId: string): void;
  payFranchiseHint(): void;
  showSolution(): void;
}

export function useGame(data: GameData): GameApi {
  const storage = useMemo(
    () => createStorage<HsGameState>(data.sport.storagePrefix, LAUNCH_DATE),
    [data.sport.storagePrefix]
  );

  // ?p=N — dev/test slot: real puzzle N, quarantined save, no streak writes
  const testDay = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("p");
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 && import.meta.env.DEV ? n : null;
  }, []);

  const liveDay = storage.currentDayNumber();
  const puzzleDay = testDay ?? liveDay;
  const saveDay = testDay ? 9000 + testDay : liveDay;
  const puzzle = puzzleForDay(puzzleDay);

  const [state, setState] = useState<HsGameState>(() => {
    const saved = storage.loadGameState(saveDay);
    // a regenerated table can change the day's endpoints; stale saves reset
    if (saved && saved.startId === puzzle.start_id && saved.targetId === puzzle.target_id) {
      return saved;
    }
    return initialState(saveDay, data.sport.sport, puzzle.start_id, puzzle.target_id);
  });
  const [profile, setProfile] = useState<Profile>(() => storage.loadProfile());
  const [justClosed, setJustClosed] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const commit = useCallback(
    (next: HsGameState) => {
      setState((prev) => {
        if (next === prev) return prev;
        storage.saveGameState(next);
        if (prev.status === "playing" && next.status !== "playing" && !testDay) {
          const hs = handshakeCount(next);
          const result = next.status === "solved" ? hs : "DNF";
          const updated = storage.recordResult(saveDay, result);
          if (next.status === "solved") storage.recordLocalScore(saveDay, hs);
          setProfile(updated);
        }
        return next;
      });
    },
    [storage, saveDay, testDay]
  );

  const tryPlace = useCallback(
    (end: EndKey, playerId: string): PlacementResult => {
      const r = place(data.graph, state, end, playerId);
      if (r.ok) {
        commit(r.state);
        if (r.closedWith) {
          setJustClosed(true);
          clearTimeout(closeTimer.current);
          closeTimer.current = setTimeout(() => setJustClosed(false), 1600);
        }
      }
      return r;
    },
    [data.graph, state, commit]
  );

  return {
    day: puzzleDay,
    puzzle,
    state,
    handshakes: handshakeCount(state),
    profile,
    justClosed,
    tryPlace,
    undo: (end) => commit(engineUndo(state, end)),
    payRosterReveal: (tsId) => commit(revealRoster(state, tsId)),
    payFranchiseHint: () => commit(useFranchiseHint(state, puzzle.canonical_links.length)),
    showSolution: () => commit(engineGiveUp(state)),
  };
}
