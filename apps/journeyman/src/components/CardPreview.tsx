import { useState } from "react";
import JerseyCard from "./JerseyCard";
import { SPORT } from "../sports/active";
import { SPORTS, SPORT_ORDER, sportHref } from "../sports";
import type { AccoladeType, Stint } from "../game/types";

/**
 * Dev-only card preview (?cards) — a fake stint carrying EVERY accolade the
 * current league defines, so the card front (icon row) and back (spelled-out
 * hardware + season table) can be eyeballed without playing a game.
 *
 * It renders the real JerseyCard, so what you see here is exactly what the
 * board draws. Switch leagues with the links up top; the sport is fixed per
 * page-load, same as the game itself.
 */

/** a plausible stat line for each league, in that sport's own shape */
const SAMPLE: Record<string, Partial<Stint>> = {
  nba: { gp: 412, mpg: 34.6, ppg: 21.8, rpg: 7.4, apg: 4.2 },
  nfl: {
    statLine: [
      { label: "GP", value: 96 },
      { label: "Rec", value: 480 },
      { label: "Yds", value: 6842 },
      { label: "Y/R", value: "14.3" },
      { label: "TD", value: 54 },
    ],
  },
  mlb: {
    statLine: [
      { label: "G", value: 742 },
      { label: "AVG", value: ".312" },
      { label: "HR", value: 148 },
      { label: "RBI", value: 502 },
      { label: "SB", value: 96 },
    ],
  },
};

/** a franchise + era each league definitely has colorways for */
const SAMPLE_TEAM: Record<string, { franchise: string; team: string; from: number; to: number }> = {
  nba: { franchise: "LAL", team: "Los Angeles Lakers", from: 2004, to: 2009 },
  nfl: { franchise: "CIN", team: "Cincinnati Bengals", from: 2007, to: 2012 },
  mlb: { franchise: "NYY", team: "New York Yankees", from: 2004, to: 2009 },
};

export default function CardPreview() {
  const [hard, setHard] = useState(false);
  const team = SAMPLE_TEAM[SPORT.sport];
  const every = Object.keys(SPORT.accoladeMeta) as AccoladeType[];

  const stint: Stint = {
    franchise: team.franchise,
    displayTeam: team.team,
    startYear: team.from,
    endYear: team.to,
    jerseyNumber: 24,
    accolades: every.map((type) => ({ type, count: 2 })),
    ...SAMPLE[SPORT.sport],
  };
  // a second card with a single-count accolade set, since "×2" is suppressed
  const singles: Stint = { ...stint, jerseyNumber: 8, accolades: every.map((type) => ({ type, count: 1 })) };

  // first colorway found for each era treatment this league defines
  const eraSamples: Array<{ eraStyle: string; franchise: string; identity: string; year: number }> = [];
  for (const [franchise, eras] of Object.entries(SPORT.colorways.franchises)) {
    for (const era of eras) {
      if (eraSamples.some((e) => e.eraStyle === era.eraStyle)) continue;
      eraSamples.push({
        eraStyle: era.eraStyle,
        franchise,
        identity: era.identity,
        // sit safely inside the era so resolveColorway picks this entry
        year: Math.min(era.years[0] + 1, era.years[1] - 1),
      });
    }
  }

  return (
    <div className="min-h-dvh p-6">
      <h1 className="font-display text-2xl">Card preview — {SPORT.league}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Fake stint carrying all {every.length} {SPORT.league} accolades. Tap a
        card to flip it and read the hardware spelled out.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SPORT_ORDER.map((s) => (
          <a
            key={s}
            href={`${sportHref(s)}&cards`}
            className={`chip px-3 py-1 text-xs font-bold uppercase ${
              s === SPORT.sport ? "chip-active" : "cursor-pointer"
            }`}
          >
            {SPORTS[s].league}
          </a>
        ))}
        <button
          type="button"
          className={`chip cursor-pointer px-3 py-1 text-xs font-bold ${hard ? "chip-active" : ""}`}
          onClick={() => setHard((h) => !h)}
        >
          Hard mode: {hard ? "on" : "off"}
        </button>
      </div>

      <div className="card-spread mt-4">
        <div className="card-row">
          <JerseyCard stint={stint} spreadIndex={0} isNewest={false} showLabel hard={hard} />
          <JerseyCard stint={singles} spreadIndex={1} isNewest={false} showLabel hard={hard} />
        </div>
      </div>

      {/* one real card per era treatment the league defines — vintage through
          current — each using a franchise/year range that actually resolves
          to that era, so the colours are the real ones */}
      <h2 className="font-display mt-6 text-lg">Era variations</h2>
      <div className="card-spread">
        <div className="card-row">
          {eraSamples.map(({ eraStyle, franchise, identity, year }) => (
            <div key={eraStyle + franchise} className="text-center">
              <JerseyCard
                stint={{
                  ...stint,
                  franchise,
                  displayTeam: identity,
                  startYear: year,
                  endYear: year + 1,
                  accolades: [],
                }}
                spreadIndex={0}
                isNewest={false}
                showLabel
                hard={hard}
              />
              <p className="mt-1 text-[0.6rem] font-bold uppercase">{eraStyle}</p>
              <p className="text-[0.55rem] text-ink-soft">{identity}</p>
            </div>
          ))}
        </div>
      </div>

      <h2 className="font-display mt-6 text-lg">Every accolade, spelled out</h2>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {every.map((type) => {
          const meta = SPORT.accoladeMeta[type];
          if (!meta) return null;
          return (
            <li key={type} className="flex items-center gap-1.5">
              <meta.Icon size={14} className="text-wood-deep" />
              {meta.label}
              <code className="text-[0.65rem] text-ink-soft">{type}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
