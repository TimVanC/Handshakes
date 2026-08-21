import { useCallback, useMemo, useRef, useState } from "react";
import { createStorage, type Profile } from "@handshakes/ui/storage";
import type { GameData } from "../data/gameData";
import { LAUNCH_DATE, examplePuzzle, puzzleForDay, type DailyPuzzle } from "../data/puzzles";
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

/** Which puzzle this session is playing. Only "live" touches streaks. */
export type Slot =
  | { kind: "live" }
  | { kind: "test"; n: number }      // ?p=N — dev only, real puzzle N
  | { kind: "example"; n: number };  // ?x=N — curated demo, demo hosts only

export interface GameApi {
  slot: Slot;
  /** "#142", "Example 3", "Test 7" */
  dayLabel: string;
  puzzle: DailyPuzzle;
  state: HsGameState;
  handshakes: number;
  profile: Profile;
  /** set for one render cycle after the chain closes — drives the collision */
  justClosed: boolean;
  tryPlace(end: EndKey, playerId: string): PlacementResult;
  undo(end: EndKey): void;
  payRosterReveal(stintKey: string): void;
  payFranchiseHint(): void;
  showSolution(): void;
}

export function useGame(data: GameData, slot: Slot): GameApi {
  const storage = useMemo(
    () => createStorage<HsGameState>(data.sport.storagePrefix, LAUNCH_DATE),
    [data.sport.storagePrefix]
  );

  const liveDay = storage.currentDayNumber();
  const puzzle =
    slot.kind === "example" ? examplePuzzle(slot.n) : puzzleForDay(slot.kind === "test" ? slot.n : liveDay);
  // quarantined save slots for anything that isn't today's puzzle
  const saveDay = slot.kind === "live" ? liveDay : slot.kind === "test" ? 9000 + slot.n : 9100 + slot.n;
  const dayLabel =
    slot.kind === "live" ? `#${liveDay}` : slot.kind === "test" ? `Test ${slot.n}` : `Example ${slot.n}`;

  const [state, setState] = useState<HsGameState>(() => {
    const saved = storage.loadGameState(saveDay);
    // a regenerated table can change a day's endpoints; stale saves reset
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
        if (prev.status === "playing" && next.status !== "playing" && slot.kind === "live") {
          const hs = handshakeCount(next);
          const result = next.status === "solved" ? hs : "DNF";
          const updated = storage.recordResult(saveDay, result);
          if (next.status === "solved") storage.recordLocalScore(saveDay, hs);
          setProfile(updated);
        }
        return next;
      });
    },
    [storage, saveDay, slot.kind]
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
    slot,
    dayLabel,
    puzzle,
    state,
    handshakes: handshakeCount(state),
    profile,
    justClosed,
    tryPlace,
    undo: (end) => commit(engineUndo(state, end)),
    payRosterReveal: (key) => commit(revealRoster(state, key)),
    payFranchiseHint: () => commit(useFranchiseHint(state, puzzle.canonical_links.length)),
    showSolution: () => commit(engineGiveUp(state)),
  };
}
