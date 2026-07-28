import JerseyRenderer, { type EraStyle } from "./JerseyRenderer";
import FootballJerseyRenderer, { type FootballEraStyle } from "./FootballJerseyRenderer";
import BaseballBackJerseyRenderer, {
  type BaseballEraStyle,
} from "./BaseballBackJerseyRenderer";
import { SPORTS, SPORT_ORDER } from "../sports";

/**
 * Dev-only jersey QA sheet (?jerseys) — every renderer across its era
 * styles in a few colorways, for eyeballing geometry + era treatments
 * without playing through games. Not reachable in production builds.
 */

const SAMPLES = [
  { name: "royal/white", primary: "#1D428A", secondary: "#FFFFFF", trim: "#C8102E" },
  { name: "red/gold", primary: "#C8102E", secondary: "#FFB612", trim: "#FFFFFF" },
  { name: "green/yellow", primary: "#203731", secondary: "#FFB612", trim: "#FFFFFF" },
  { name: "black/silver", primary: "#000000", secondary: "#A5ACAF", trim: "#FFFFFF" },
];

const MLB_SAMPLES = [
  { name: "white + navy (pin)", primary: "#FFFFFF", secondary: "#132448", trim: "#C4CED3", pinstripe: true },
  { name: "gray + red", primary: "#C4CED3", secondary: "#C6011F", trim: "#000000", pinstripe: false },
  { name: "gold pullover", primary: "#EFB21E", secondary: "#003831", trim: "#FFFFFF", pinstripe: false },
  { name: "powder blue", primary: "#7CB8E6", secondary: "#134A8E", trim: "#FFFFFF", pinstripe: false },
];

/* ---- Session 5: colorway review queue -------------------------------
   Every era from the three colorways DBs rendered with its real colors,
   unverified-first. Notes persist to localStorage under jr:note:<key> so
   the owner can work through the backlog across visits; the coverage
   report (scripts/coverage-report.mjs) orders the same eras by scheduling
   urgency. Marking `verified` stays a JSON edit — deliberately not a
   button, so verification always lands in git. Dev/preview only, like
   the rest of this sheet. */
import nbaCw from "../data/colorways.json";
import nflCw from "../data/nfl/colorways.json";
import mlbCw from "../data/mlb/colorways.json";

function ReviewQueue() {
  const all: Array<{ sport: string; fr: string; era: any }> = [];
  for (const [sport, db] of [["nba", nbaCw], ["nfl", nflCw], ["mlb", mlbCw]] as const) {
    for (const [fr, eras] of Object.entries((db as any).franchises)) {
      for (const era of eras as any[]) all.push({ sport, fr, era });
    }
  }
  const rank = (s?: string) => (s === "unverified" ? 0 : s === "probable" ? 1 : 2);
  all.sort((a, b) => rank(a.era.status) - rank(b.era.status));
  const unverified = all.filter((x) => rank(x.era.status) === 0).length;
  return (
    <div className="mt-6">
      <h2 className="font-display text-lg">
        Colorway review queue — {unverified} unverified of {all.length}
      </h2>
      <p className="max-w-2xl text-xs">
        Verify against GUD (NFL) / Dressed to the Nines (MLB) / Uni Watch (NBA), then set
        status/verified_by/verified_on/source_note in the sport&apos;s colorways.json. Notes
        below are scratch (localStorage only).
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {all.map(({ sport, fr, era }) => {
          const noteKey = `jr:note:${sport}:${era.key}`;
          const common = { primary: era.primary, secondary: era.secondary, trim: era.trim, number: 21, size: 90, label: era.tricode || fr };
          return (
            <div key={sport + era.key} className={"rounded border p-2 text-center " + (era.status === "verified" ? "border-green-600" : era.status === "probable" ? "border-yellow-500" : "border-red-500")}>
              {sport === "nba" && <JerseyRenderer {...common} eraStyle={era.eraStyle as EraStyle} />}
              {sport === "nfl" && <FootballJerseyRenderer {...common} eraStyle={era.eraStyle as FootballEraStyle} />}
              {sport === "mlb" && <BaseballBackJerseyRenderer {...common} eraStyle={era.eraStyle as BaseballEraStyle} pinstripe={era.pattern === "pinstripe"} />}
              <p className="text-[0.6rem] font-bold">{era.key}</p>
              <p className="text-[0.55rem]">{era.identity} · {era.years[0]}–{era.years[1]}</p>
              <p className="text-[0.55rem]">{era.status || "unverified"}{era.source_note ? ` · ${era.source_note}` : ""}</p>
              <textarea
                className="mt-1 w-full border text-[0.6rem]"
                rows={1}
                placeholder="notes"
                defaultValue={typeof localStorage !== "undefined" ? localStorage.getItem(noteKey) || "" : ""}
                onChange={(e) => localStorage.setItem(noteKey, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JerseyGallery() {
  const nbaEras: EraStyle[] = ["classic", "nineties", "baggy", "modern"];
  const nflEras: FootballEraStyle[] = ["classic", "stripes", "nineties", "modern"];
  const mlbEras: BaseballEraStyle[] = ["flannel", "pullover", "buttoned", "modern"];

  return (
    <div className="min-h-dvh p-6">
      <h1 className="font-display text-2xl">Jersey QA sheet</h1>
      <ReviewQueue />

      {/* every accolade, at the size it actually renders on a card (14px)
          plus a blown-up copy for checking the drawing */}
      <h2 className="font-display mt-4 text-lg">Accolades</h2>
      {SPORT_ORDER.map((s) => (
        <div key={s} className="mb-2">
          <p className="text-[0.65rem] font-bold uppercase">{SPORTS[s].league}</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(SPORTS[s].accoladeMeta).map(([key, meta]) => (
              <div key={key} className="w-24 text-center">
                <div className="flex items-center justify-center gap-2 text-wood-deep">
                  <meta.Icon size={14} />
                  <meta.Icon size={40} />
                </div>
                <p className="text-[0.55rem] leading-tight">{meta.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2 className="font-display mt-4 text-lg">Sport ball icons</h2>
      <div className="flex items-end gap-6">
        {SPORT_ORDER.map((s) => {
          const Ball = SPORTS[s].ballIcon;
          return (
            <div key={s} className="text-center">
              <Ball size={64} />
              <Ball size={17} />
              <p className="text-[0.6rem]">{s}</p>
            </div>
          );
        })}
      </div>

      <h2 className="font-display mt-6 text-lg">NFL</h2>
      {SAMPLES.map((c) => (
        <div key={c.name} className="mt-2 flex items-end gap-4">
          <span className="w-28 text-xs">{c.name}</span>
          {nflEras.map((era) => (
            <div key={era} className="text-center">
              <FootballJerseyRenderer
                primary={c.primary}
                secondary={c.secondary}
                trim={c.trim}
                number={12}
                eraStyle={era}
                size={120}
                label={c.name.startsWith("royal") || c.name.startsWith("green") ? "GB" : "SEA"}
              />
              <p className="text-[0.6rem]">{era}</p>
            </div>
          ))}
        </div>
      ))}

      <h2 className="font-display mt-8 text-lg">MLB</h2>
      {MLB_SAMPLES.map((c) => (
        <div key={c.name} className="mt-2 flex items-end gap-4">
          <span className="w-28 text-xs">{c.name}</span>
          {mlbEras.map((era) => (
            <div key={era} className="text-center">
              <BaseballBackJerseyRenderer
                primary={c.primary}
                secondary={c.secondary}
                trim={c.trim}
                number={24}
                eraStyle={era}
                pinstripe={c.pinstripe}
                size={110}
                label={c.name.startsWith("white") || c.name.startsWith("powder") ? "NYY" : "SD"}
              />
              <p className="text-[0.6rem]">{era}</p>
            </div>
          ))}
        </div>
      ))}

      <h2 className="font-display mt-8 text-lg">NBA (regression)</h2>
      <div className="mt-2 flex items-end gap-4">
        {nbaEras.map((era) => (
          <div key={era} className="text-center">
            <JerseyRenderer
              primary="#552583"
              secondary="#FDB927"
              trim="#FFFFFF"
              number={8}
              eraStyle={era}
              size={90}
              label="LAL"
            />
            <p className="text-[0.6rem]">{era}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
