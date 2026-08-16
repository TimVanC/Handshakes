import { useEffect, useRef, useState } from "react";
import type { GameData, SearchHit } from "../data/gameData";
import type { EndKey, PlacementResult } from "../game/engine";

/** The sticky thumb-reach dock: pick which end you're extending (the
 *  teeter-totter), type a name, place. Rejections are inline and free. */
export default function GuessDock({
  data,
  startHeadName,
  targetHeadName,
  onPlace,
}: {
  data: GameData;
  startHeadName: string;
  targetHeadName: string;
  onPlace(end: EndKey, playerId: string): PlacementResult;
}) {
  const [end, setEnd] = useState<EndKey>("start");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [rejection, setRejection] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = "hs-guess-options";

  useEffect(() => {
    setHits(query.trim().length >= 2 ? data.searchPlayers(query) : []);
    setActive(0);
  }, [query, data]);

  const pick = (hit: SearchHit) => {
    const r = onPlace(end, hit.id);
    if (r.ok) {
      setQuery("");
      setHits([]);
      setRejection(null);
      inputRef.current?.focus();
    } else if (r.reason === "not-teammate") {
      const head = end === "start" ? startHeadName : targetHeadName;
      setRejection(`${hit.name} was never a teammate of ${head}`);
    } else if (r.reason === "already-in-chain") {
      setRejection(`${hit.name} is already in the chain`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setHits([]);
    }
  };

  return (
    <div className="hs-dock">
      <div className="hs-dock-inner">
        {rejection && (
          <div className="hs-reject" role="status">
            {rejection} — no penalty
          </div>
        )}
        <div className="hs-endtoggle" role="radiogroup" aria-label="Which end to extend">
          <button
            type="button"
            role="radio"
            aria-checked={end === "start"}
            className={`hs-endbtn ${end === "start" ? "active" : ""}`}
            onClick={() => setEnd("start")}
          >
            Extend from
            <strong>{startHeadName}</strong>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={end === "target"}
            className={`hs-endbtn ${end === "target" ? "active" : ""}`}
            onClick={() => setEnd("target")}
          >
            Extend from
            <strong>{targetHeadName}</strong>
          </button>
        </div>
        <div className="hs-combo">
          {hits.length > 0 && (
            <ul className="hs-options" role="listbox" id={listId}>
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  role="option"
                  aria-selected={i === active}
                  className="hs-option"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(h);
                  }}
                >
                  <span>{h.name}</span>
                  <span className="yrs">{h.yearsActive}</span>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={inputRef}
            className="hs-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setRejection(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={`Name a teammate of ${end === "start" ? startHeadName : targetHeadName}…`}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </div>
      </div>
    </div>
  );
}
