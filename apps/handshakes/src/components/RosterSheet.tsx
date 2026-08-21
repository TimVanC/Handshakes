import { useEffect } from "react";
import type { GameData } from "../data/gameData";
import type { EndKey, HsGameState, PlacementResult } from "../game/engine";
import { stintRoster, type Stint } from "../game/stints";
import HandshakeIcon from "./HandshakeIcon";

/** Roster reveal by stint — everyone who played for that team during the
 *  player's run there. The price is on the button, never a surprise: the
 *  first look costs +1 handshake; placing someone off the list is free. */
export default function RosterSheet({
  data,
  state,
  stint,
  end,
  paid,
  onPay,
  onPlace,
  onClose,
}: {
  data: GameData;
  state: HsGameState;
  stint: Stint;
  end: EndKey;
  paid: boolean;
  onPay(): void;
  onPlace(end: EndKey, playerId: string): PlacementResult;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roster = stintRoster(data.graph, stint)
    .map((id) => data.graph.players.get(id)!)
    .sort((a, b) => b.career_games - a.career_games);
  const inChain = new Set([...state.fromStart, ...state.fromTarget]);
  const seasons = stint.teamSeasonIds.length;
  const years =
    stint.firstSeason === stint.lastSeason
      ? `${stint.firstSeason - 1}-${String(stint.firstSeason).slice(2)}`
      : `${stint.firstSeason - 1}–${stint.lastSeason}`;

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div
        className="hs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${stint.franchiseName} ${years} roster`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>
          {stint.franchiseName} <span style={{ color: "var(--color-ink-soft)" }}>{years}</span>
        </h2>
        {!paid ? (
          <>
            <p>
              See everyone who played a regular-season game for them across{" "}
              {seasons === 1 ? "that season" : `those ${seasons} seasons`}? Placing a
              player from the list afterward is free.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
              <button type="button" className="hs-btn" onClick={onPay}>
                Reveal roster · +1 <HandshakeIcon size={16} />
              </button>
              <button type="button" className="hs-btn secondary" onClick={onClose}>
                Never mind
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {roster.length} players. Tap one to add them to the{" "}
              {end === "start" ? "top" : "bottom"} chain.
            </p>
            <div className="hs-rosterlist">
              {roster.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={inChain.has(p.id)}
                  onClick={() => {
                    const r = onPlace(end, p.id);
                    if (r.ok) onClose();
                  }}
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
