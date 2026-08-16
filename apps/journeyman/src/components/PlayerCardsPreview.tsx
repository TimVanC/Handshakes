import JerseyCard from "./JerseyCard";
import { SPORT } from "../sports/active";
import { SPORTS, SPORT_ORDER, sportHref } from "../sports";
import type { Stint } from "../game/types";

/**
 * Dev-only preview (?playercards) — renders the real JerseyCard for three
 * specific journeymen at their most notable stop, with accurate stint stats.
 * One player per league; the active sport (?s=) picks which one shows, exactly
 * like the rest of the game. Renders each card twice — front and pre-flipped
 * back — so both faces can be captured in one shot.
 */
const PLAYER: Record<string, { name: string; note: string; stint: Stint }> = {
  nba: {
    name: "Ish Smith",
    note: "Detroit Pistons · 2016–2019 (his longest tenure)",
    stint: {
      franchise: "DET",
      displayTeam: "Detroit Pistons",
      startYear: 2016,
      endYear: 2018, // season-start years → renders "2016–2019"
      jerseyNumber: 14,
      accolades: [],
      gp: 219,
      mpg: 23.8,
      ppg: 9.7,
      rpg: 2.7,
      apg: 4.4,
    },
  },
  nfl: {
    name: "Ryan Fitzpatrick",
    note: "Buffalo Bills · 2009–2012 (most starts of his 9 teams)",
    stint: {
      franchise: "BUF",
      displayTeam: "Buffalo Bills",
      startYear: 2009,
      endYear: 2012,
      jerseyNumber: 14,
      accolades: [],
      statLine: [
        { label: "GP", value: 55 },
        { label: "Cmp%", value: "58.8" },
        { label: "Yds", value: 11654 },
        { label: "TD", value: 80 },
        { label: "INT", value: 64 },
      ],
    },
  },
  mlb: {
    name: "Rickey Henderson",
    note: "Oakland Athletics · 1979–1984 (incl. the 130-SB record in ’82)",
    stint: {
      franchise: "OAK",
      displayTeam: "Oakland Athletics",
      startYear: 1979,
      endYear: 1984,
      jerseyNumber: 24,
      accolades: [],
      statLine: [
        { label: "G", value: 791 },
        { label: "AVG", value: ".291" },
        { label: "HR", value: 51 },
        { label: "RBI", value: 271 },
        { label: "SB", value: 493 },
      ],
    },
  },
};

export default function PlayerCardsPreview() {
  const p = PLAYER[SPORT.sport];

  return (
    <div className="min-h-dvh p-6">
      <h1 className="font-display text-2xl">Player card — {SPORT.league}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {p.name} — {p.note}. Real JerseyCard, real colorway, accurate stint stats.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SPORT_ORDER.map((s) => (
          <a
            key={s}
            href={`${sportHref(s)}&playercards`}
            className={`chip px-3 py-1 text-xs font-bold uppercase ${
              s === SPORT.sport ? "chip-active" : "cursor-pointer"
            }`}
          >
            {SPORTS[s].league}
          </a>
        ))}
      </div>

      <div className="card-spread mt-6">
        <div className="card-row" style={{ gap: "2rem" }}>
          <div className="text-center">
            <JerseyCard stint={p.stint} spreadIndex={0} isNewest={false} showLabel />
            <p className="mt-1 text-[0.6rem] font-bold uppercase">front</p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        Tap the card to flip to the season-by-season back.
      </p>
    </div>
  );
}
