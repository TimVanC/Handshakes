import JerseyRenderer, { type EraStyle } from "@handshakes/jerseys/JerseyRenderer";
import { resolveColorway } from "@handshakes/jerseys/colorways";
import type { GameData } from "../data/gameData";

/** Neutral kit for franchises the colorway set doesn't cover yet
 *  (mostly 1940s-50s defunct clubs). */
const FALLBACK = {
  primary: "#9a9184",
  secondary: "#f3ecdb",
  trim: "#6b6353",
  eraStyle: "classic" as EraStyle,
};

/** The era-accurate jersey of the team-season connecting two players.
 *  This is the product — every closed handshake renders one. */
export default function LinkJersey({
  data,
  teamSeasonId,
  size = 56,
}: {
  data: GameData;
  teamSeasonId: string;
  size?: number;
}) {
  const ts = data.graph.teamSeasons.get(teamSeasonId);
  if (!ts) return null;
  const startYear = ts.season - 1;
  const era = resolveColorway(
    data.colorways,
    data.sport.colorwayKey(ts.franchise_id),
    startYear,
    startYear
  );
  const c = era ?? FALLBACK;
  const tricode = teamSeasonId.split("-")[0];
  return (
    <span className="jersey-slot" title={ts.display_name}>
      <JerseyRenderer
        primary={c.primary}
        secondary={c.secondary}
        trim={c.trim}
        number={null}
        numberText=""
        eraStyle={(era?.eraStyle as EraStyle) ?? FALLBACK.eraStyle}
        label={tricode}
        size={size}
      />
    </span>
  );
}
