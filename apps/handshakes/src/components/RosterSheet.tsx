import { useEffect } from "react";
import type { GameData } from "../data/gameData";
import type { EndKey, HsGameState, PlacementResult } from "../game/engine";

/** Roster reveal — the direct anti-blank tool. The price is on the button,
 *  never a surprise: first look at a roster costs +1 handshake, and placing
 *  someone straight off the revealed list is a normal (free) placement. */
export default function RosterSheet({
  data,
  state,
  teamSeasonId,
  end,
  paid,
  onPay,
  onPlace,
  onClose,
}: {
  data: GameData;
  state: HsGameState;
  teamSeasonId: string;
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

  const ts = data.graph.teamSeasons.get(teamSeasonId);
  if (!ts) return null;
  const roster = (data.graph.rosters.get(teamSeasonId) ?? [])
    .map((id) => data.graph.players.get(id)!)
    .sort((a, b) => b.career_games - a.career_games);
  const inChain = new Set([...state.fromStart, ...state.fromTarget]);

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div
        className="hs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${ts.display_name} roster`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{ts.display_name}</h2>
        {!paid ? (
          <>
            <p>
              See everyone who played a game for this team that season?
              Placing a player from the list afterward is free.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              <button type="button" className="hs-btn" onClick={onPay}>
                Reveal roster — costs +1 🤝
              </button>
              <button type="button" className="hs-btn secondary" onClick={onClose}>
                Never mind
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Tap a player to add them to the {end === "start" ? "top" : "bottom"} chain.</p>
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
