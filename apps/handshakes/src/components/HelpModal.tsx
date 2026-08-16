import { useEffect } from "react";

/** Rules + the one ruling that must always be a click away. The fastest way
 *  to lose a player on day one is rejecting a chain they're certain is valid. */
export default function HelpModal({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div
        className="hs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>How to play</h2>
        <p>
          Every day, two players. Connect them through real teammates — build
          from <strong>either end</strong>, in any order. When the two ends
          meet, the chain closes itself.
        </p>
        <p>
          A <strong>handshake</strong> is one link between two players who were
          teammates. Fewer handshakes is better; <strong>Par</strong> is the
          fewest possible. Wrong guesses cost nothing, and undo refunds the
          handshake.
        </p>
        <h2>What counts as a handshake?</h2>
        <ul>
          <li>
            Two players shake if <strong>both played at least one regular-season
            game for the same team in the same season</strong>.
          </li>
          <li>
            Mid-season trades count: if both suited up for that team that year,
            they shake — even if they never shared the floor. Verifiable beats
            intuitive.
          </li>
          <li>Preseason, Summer League, G League, and camp-only stints don't count.</li>
          <li>Playoff-only appearances don't count. Regular season only.</li>
          <li>Dressed-but-never-played doesn't count.</li>
        </ul>
        <h2>Stuck?</h2>
        <ul>
          <li>
            Every placed player shows their <strong>career strip</strong> — tap
            a team-year to peek at that roster (first look costs +1 🤝).
          </li>
          <li>A route hint reveals one franchise on an optimal path (+1 🤝).</li>
          <li>
            Showing the solution is free, ends the run, and keeps your played
            streak honest — the day counts as played, not solved.
          </li>
        </ul>
        <button type="button" className="hs-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
