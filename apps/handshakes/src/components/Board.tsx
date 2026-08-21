import { useMemo, useState } from "react";
import type { GameData } from "../data/gameData";
import { type EndKey, type HsGameState, type PlacementResult } from "../game/engine";
import { careerStints, stintLabel, type Stint } from "../game/stints";
import type { DailyPuzzle } from "../data/puzzles";
import HandshakeIcon from "./HandshakeIcon";
import LinkJersey from "./LinkJersey";
import RosterSheet from "./RosterSheet";

interface RosterRequest {
  stint: Stint;
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
  onOpenResult,
}: {
  data: GameData;
  state: HsGameState;
  puzzle: DailyPuzzle;
  justClosed: boolean;
  onPlace(end: EndKey, playerId: string): PlacementResult;
  onUndo(end: EndKey): void;
  onPayRoster(stintKey: string): void;
  onFranchiseHint(): void;
  onOpenResult(): void;
}) {
  const [rosterReq, setRosterReq] = useState<RosterRequest | null>(null);

  const playing = state.status === "playing";
  const franchiseNames = useMemo(
    () => new Map(data.dataset.franchises.map((f) => [f.id, f.name])),
    [data]
  );
  const franchiseName = (tsId: string) => {
    const ts = data.graph.teamSeasons.get(tsId);
    return ts ? (franchiseNames.get(ts.franchise_id) ?? ts.display_name) : tsId;
  };
  const player = (id: string) => data.graph.players.get(id);

  /** The back of the card: every stint, free to read. Picking one opens the
   *  roster reveal (that's the paid step). */
  const stintPicker = (playerId: string, end: EndKey) => {
    const stints = careerStints(data.graph, franchiseNames, playerId);
    const selectId = `stints-${end}`;
    return (
      <div className="hs-stintpick">
        <label htmlFor={selectId}>Teams</label>
        <select
          id={selectId}
          className="hs-select"
          value=""
          onChange={(e) => {
            const s = stints.find((st) => st.key === e.target.value);
            if (s) setRosterReq({ stint: s, end });
          }}
        >
          <option value="">Peek at a roster…</option>
          {stints.map((s) => (
            <option key={s.key} value={s.key}>
              {stintLabel(s)}
              {state.revealedRosters.includes(s.key) ? " ✓ seen" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const node = (playerId: string, opts: { role?: string; end: EndKey; isHead: boolean }) => {
    const p = player(playerId);
    if (!p) return null;
    return (
      <div className={`hs-node ${opts.role ? "is-endpoint" : ""}`}>
        <div className="who">
          {opts.role && <div className="role">{opts.role}</div>}
          <div className="name">{p.full_name}</div>
          <div className="years">
            {p.first_season - 1}–{p.last_season} · {p.career_games} games
          </div>
          {playing && opts.isHead && stintPicker(playerId, opts.end)}
        </div>
        {playing && opts.isHead && !opts.role && (
          <button
            type="button"
            className="hs-undo"
            onClick={() => onUndo(opts.end)}
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
      <span className={`shake ${closing ? "hs-closing" : ""}`}>
        <HandshakeIcon size={18} title="handshake" />
      </span>
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
                Route hint{" "}
                <span className="cost">
                  +1 <HandshakeIcon size={14} />
                </span>
              </button>
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
          stint={rosterReq.stint}
          end={rosterReq.end}
          paid={state.revealedRosters.includes(rosterReq.stint.key)}
          onPay={() => onPayRoster(rosterReq.stint.key)}
          onPlace={onPlace}
          onClose={() => setRosterReq(null)}
        />
      )}
      {playing && (
        <p className="hs-hint-note" style={{ marginTop: "0.8rem" }}>
          Each end's team list is free. Peeking at a roster costs +1{" "}
          <HandshakeIcon size={14} /> the first time; anyone you place from it is free.
          Wrong guesses and undo never cost anything.
        </p>
      )}
    </div>
  );
}
