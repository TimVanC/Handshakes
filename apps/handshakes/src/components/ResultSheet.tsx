import { useEffect, useState } from "react";
import { shareText as deliverShare } from "@handshakes/ui/share";
import type { GameData } from "../data/gameData";
import { mergedChain, resultLabel, type HsGameState } from "../game/engine";
import { buildShareText } from "../game/share";
import type { DailyPuzzle } from "../data/puzzles";
import LinkJersey from "./LinkJersey";

/** End-of-run sheet. Solved: the closed chain as a row of jerseys — the
 *  screenshot. Gave up: the canonical optimal path, because people who quit
 *  still want the answer, and seeing it is what brings them back. */
export default function ResultSheet({
  data,
  state,
  puzzle,
  day,
  handshakes,
  streak,
  onClose,
}: {
  data: GameData;
  state: HsGameState;
  puzzle: DailyPuzzle;
  day: number;
  handshakes: number;
  streak: number;
  onClose(): void;
}) {
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const solved = state.status === "solved";
  const chain = solved
    ? mergedChain(state)!
    : { players: puzzle.canonical_path, links: puzzle.canonical_links };
  const name = (id: string) => data.graph.players.get(id)?.full_name ?? id;

  const doShare = async () => {
    const outcome = await deliverShare(
      buildShareText({ day, handshakes, par: puzzle.par, status: solved ? "solved" : "gave_up" })
    );
    if (outcome === "copied") setShareNote("Copied to clipboard");
    else if (outcome === "failed") setShareNote("Couldn't share on this device");
  };

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div
        className="hs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Result"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="hs-result-label">
          {solved ? resultLabel(handshakes, puzzle.par) : "Left hanging"}
        </h2>
        <p className="hs-result-tally">
          {solved ? (
            <>
              {"🤝".repeat(Math.min(handshakes, 24))} {handshakes} handshake
              {handshakes === 1 ? "" : "s"} · Par {puzzle.par}
            </>
          ) : (
            <>Here's one clean route at par {puzzle.par}:</>
          )}
        </p>
        {streak > 0 && solved && <p className="hs-streakline">🔥 {streak}-day streak</p>}

        <div>
          {chain.players.map((pid, i) => (
            <div key={pid}>
              <div className="hs-node" style={{ paddingLeft: "0.7rem" }}>
                <div className="who">
                  <div className="name">{name(pid)}</div>
                </div>
              </div>
              {i < chain.links.length && (
                <div className="hs-link" style={{ paddingLeft: "1rem" }}>
                  <span className="shake">🤝</span>
                  <LinkJersey data={data} teamSeasonId={chain.links[i]} size={46} />
                  <span className="team">
                    {data.graph.teamSeasons.get(chain.links[i])?.display_name}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem", alignItems: "center" }}>
          {solved && (
            <button type="button" className="hs-btn" onClick={doShare}>
              Share 🤝
            </button>
          )}
          <button type="button" className="hs-btn secondary" onClick={onClose}>
            Back to the chain
          </button>
        </div>
        {shareNote && (
          <p className="hs-streakline" role="status" style={{ marginTop: "0.5rem" }}>
            {shareNote}
          </p>
        )}
        <p className="hs-streakline" style={{ marginTop: "1rem" }}>
          Like the jerseys? They star in our other daily —{" "}
          <a href="https://journeymanjersey.com" target="_blank" rel="noreferrer">
            Journeyman
          </a>
          : guess the player from their career, one jersey at a time.
        </p>
      </div>
    </div>
  );
}
