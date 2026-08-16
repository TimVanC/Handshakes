import { useMemo, useState } from "react";
import type { GameData } from "../data/gameData";
import { head as chainHead, type EndKey, type HsGameState, type PlacementResult } from "../game/engine";
import type { DailyPuzzle } from "../data/puzzles";
import LinkJersey from "./LinkJersey";
import RosterSheet from "./RosterSheet";

interface RosterRequest {
  teamSeasonId: string;
  end: EndKey;
}

/** The chain IS the interface. Start chain grows downward, target chain
 *  grows upward, the dashed gap between them is what's left to solve. */
export default function Board({
  data,
  state,
  puzzle,
  justClosed,
  onPlace,
  onUndo,
  onPayRoster,
  onFranchiseHint,
  onShowSolution,
  onOpenResult,
}: {
  data: GameData;
  state: HsGameState;
  puzzle: DailyPuzzle;
  justClosed: boolean;
  onPlace(end: EndKey, playerId: string): PlacementResult;
  onUndo(end: EndKey): void;
  onPayRoster(teamSeasonId: string): void;
  onFranchiseHint(): void;
  onShowSolution(): void;
  onOpenResult(): void;
}) {
  const [rosterReq, setRosterReq] = useState<RosterRequest | null>(null);
  const [confirmingSolution, setConfirmingSolution] = useState(false);

  const playing = state.status === "playing";
  const startHead = chainHead(state, "start");
  const targetHead = chainHead(state, "target");
  const franchiseName = useMemo(() => {
    const names = new Map(data.dataset.franchises.map((f) => [f.id, f.name]));
    return (tsId: string) => {
      const ts = data.graph.teamSeasons.get(tsId);
      return ts ? (names.get(ts.franchise_id) ?? ts.display_name) : tsId;
    };
  }, [data]);

  const player = (id: string) => data.graph.players.get(id);

  const careerChips = (playerId: string, end: EndKey) => {
    const career = data.graph.careers.get(playerId) ?? [];
    return (
      <div className="hs-careerstrip" aria-label="Career team seasons — tap to peek at a roster">
        {career.map((tsId) => {
          const ts = data.graph.teamSeasons.get(tsId)!;
          const revealed = state.revealedRosters.includes(tsId);
          return (
            <button
              key={tsId}
              type="button"
              className="hs-chip"
              title={ts.display_name}
              onClick={() => setRosterReq({ teamSeasonId: tsId, end })}
            >
              {tsId.split("-")[0]} '{String(ts.season % 100).padStart(2, "0")}
              {revealed ? " 👀" : ""}
            </button>
          );
        })}
      </div>
    );
  };

  const node = (playerId: string, opts: { role?: string; end?: EndKey; isHead?: boolean }) => {
    const p = player(playerId);
    if (!p) return null;
    const from = p.first_season - 1;
    return (
      <div className={`hs-node ${opts.role ? "is-endpoint" : ""}`}>
        <div className="who">
          {opts.role && <div className="role">{opts.role}</div>}
          <div className="name">{p.full_name}</div>
          <div className="years">
            {from}–{p.last_season} · {p.career_games} games
          </div>
          {playing && opts.isHead && opts.end && careerChips(playerId, opts.end)}
        </div>
        {playing && opts.isHead && !opts.role && opts.end && (
          <button
            type="button"
            className="hs-undo"
            onClick={() => onUndo(opts.end!)}
            aria-label={`Remove ${p.full_name} — refunds the handshake`}
          >
            UNDO
          </button>
        )}
      </div>
    );
  };

  const linkRow = (tsId: string, closing = false) => (
    <div className={`hs-link ${closing ? "hs-closing-row" : ""}`}>
      <span className={`shake ${closing ? "hs-closing" : ""}`}>🤝</span>
      <span className={closing ? "hs-closing" : undefined}>
        <LinkJersey data={data} teamSeasonId={tsId} />
      </span>
      <span className="team">{data.graph.teamSeasons.get(tsId)?.display_name}</span>
    </div>
  );

  const revealedFranchises = puzzle.canonical_links
    .slice(0, state.franchiseHintsUsed)
    .map(franchiseName);

  return (
    <div className="hs-board">
      <div className={`hs-chain ${justClosed ? "just-closed" : ""}`}>
        {state.fromStart.map((pid, i) => (
          <div key={pid}>
            {node(pid, {
              role: i === 0 ? "Start" : undefined,
              end: "start",
              isHead: i === state.fromStart.length - 1,
            })}
            {i < state.fromStartLinks.length && linkRow(state.fromStartLinks[i])}
          </div>
        ))}

        {playing ? (
          <div className="hs-gap">
            <div className="ask">
              {state.fromStart.length + state.fromTarget.length > 2
                ? "…the ends haven't met yet…"
                : "…who bridges them?…"}
            </div>
            {revealedFranchises.length > 0 && (
              <div className="hs-hint-note">
                An optimal route passes through:{" "}
                <strong>{revealedFranchises.join(" → ")}</strong>
              </div>
            )}
            <div className="hs-hintrow">
              <button
                type="button"
                className="hs-hintbtn"
                onClick={onFranchiseHint}
                disabled={state.franchiseHintsUsed >= puzzle.canonical_links.length}
              >
                Route hint <span className="cost">+1 🤝</span>
              </button>
              {!confirmingSolution ? (
                <button
                  type="button"
                  className="hs-hintbtn"
                  onClick={() => setConfirmingSolution(true)}
                >
                  Show solution <span className="cost">ends the run</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="hs-hintbtn"
                    onClick={() => {
                      setConfirmingSolution(false);
                      onShowSolution();
                    }}
                  >
                    Really show it — day counts as played, not solved
                  </button>
                  <button
                    type="button"
                    className="hs-hintbtn"
                    onClick={() => setConfirmingSolution(false)}
                  >
                    Keep playing
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          state.closingTeamSeasonId && linkRow(state.closingTeamSeasonId, true)
        )}

        {[...state.fromTarget].reverse().map((pid, idx) => {
          const i = state.fromTarget.length - 1 - idx; // true index in fromTarget
          return (
            <div key={pid}>
              {i < state.fromTargetLinks.length && linkRow(state.fromTargetLinks[i])}
              {node(pid, {
                role: i === 0 ? "Target" : undefined,
                end: "target",
                isHead: i === state.fromTarget.length - 1,
              })}
            </div>
          );
        })}
      </div>

      {!playing && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
          <button type="button" className="hs-btn" onClick={onOpenResult}>
            {state.status === "solved" ? "See result & share" : "See the solution"}
          </button>
        </div>
      )}

      {rosterReq && (
        <RosterSheet
          data={data}
          state={state}
          teamSeasonId={rosterReq.teamSeasonId}
          end={rosterReq.end}
          paid={state.revealedRosters.includes(rosterReq.teamSeasonId)}
          onPay={() => onPayRoster(rosterReq.teamSeasonId)}
          onPlace={onPlace}
          onClose={() => setRosterReq(null)}
        />
      )}
      {playing && (
        <p className="hs-hint-note" style={{ marginTop: "0.8rem" }}>
          Tap a team-year chip on {player(startHead)?.full_name} or{" "}
          {player(targetHead)?.full_name} to peek at that roster (+1 🤝 the first
          time). Career strips are always free.
        </p>
      )}
    </div>
  );
}
