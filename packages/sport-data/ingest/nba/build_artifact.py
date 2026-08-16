"""Combine cached season aggregates into the versioned sport-data artifact.

Reads ingest/nba/cache/<season>.json (produced by fetch_seasons.py) and emits
packages/sport-data/data/nba.json plus nba.meta.json with a sha256 checksum.

Schema follows the build brief: players, franchises, team_seasons, appearances,
every table carrying sport="nba". Franchise identity rides on stats.nba.com
TEAM_ID, which is stable across relocations (Seattle-era rows share OKC's id);
team_seasons keep the era tricode and era team name.

Notability (0-100) is the percentile rank of career points within the sport —
a proxy for casual-fan recognizability used only for endpoint eligibility.
"""

import hashlib
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"
DATA_DIR = Path(__file__).parents[2] / "data"
SPORT = "nba"
ARTIFACT_VERSION = 1


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    ascii_name = ascii_name.lower().replace("'", "")
    parts = [p for p in re.split(r"[^a-z0-9]+", ascii_name) if p]
    if not parts:
        return "unknown"
    # "Steve Nash" -> "nash-steve"; single-name players keep the one token
    return "-".join(parts[1:] + parts[:1]) if len(parts) > 1 else parts[0]


def main() -> None:
    seasons = sorted(CACHE_DIR.glob("[0-9]*.json"))
    if not seasons:
        raise SystemExit("No cached seasons found — run fetch_seasons.py first.")

    players = {}      # person_id -> record
    franchises = {}   # team_id -> {latest_season, tricode, name}
    team_seasons = {} # ts_id -> record
    appearances = []

    for path in seasons:
        season = json.loads(path.read_text(encoding="utf-8"))
        end_year = season["season_end"]
        for row in season["appearances"]:
            pid, tid = row["person_id"], row["team_id"]

            fr = franchises.setdefault(tid, {"latest": 0, "tricode": "", "name": ""})
            if end_year > fr["latest"]:
                fr.update(latest=end_year, tricode=row["tricode"], name=row["team_name"])

            ts_id = f"{row['tricode']}-{end_year}"
            existing = team_seasons.get(ts_id)
            if existing and existing["team_id"] != tid:
                # Same tricode, same year, different franchise — disambiguate.
                ts_id = f"{row['tricode']}-{end_year}-{tid}"
            team_seasons.setdefault(
                ts_id,
                {
                    "id": ts_id,
                    "team_id": tid,
                    "season": end_year,
                    "display_name": f"{end_year - 1}-{str(end_year)[-2:].zfill(2)} {row['team_name']}",
                },
            )

            p = players.setdefault(
                pid,
                {
                    "person_id": pid,
                    "full_name": row["name"],
                    "first_season": end_year,
                    "last_season": end_year,
                    "career_games": 0,
                    "career_points": 0,
                },
            )
            p["first_season"] = min(p["first_season"], end_year)
            p["last_season"] = max(p["last_season"], end_year)
            p["full_name"] = row["name"]  # keep the most recent spelling
            p["career_games"] += row["gp"]
            p["career_points"] += row["pts"]

            appearances.append({"person_id": pid, "ts_id": ts_id, "gp": row["gp"]})

    # Stable player slugs: last-first-NN with a dedupe counter, ordered by debut.
    slug_counts = {}
    person_to_slug = {}
    for pid, p in sorted(players.items(), key=lambda kv: (kv[1]["first_season"], kv[0])):
        base = slugify(p["full_name"])
        n = slug_counts.get(base, 0) + 1
        slug_counts[base] = n
        person_to_slug[pid] = f"{base}-{n:02d}"

    # Notability: percentile of career points (0-100).
    by_points = sorted(players.values(), key=lambda p: p["career_points"])
    total = len(by_points)
    for rank, p in enumerate(by_points):
        p["notability"] = round(100 * rank / max(total - 1, 1))

    franchise_ids = {tid: f"{SPORT}-{fr['tricode'].lower()}" for tid, fr in franchises.items()}
    # Guard against two historical team_ids sharing a latest tricode.
    seen = {}
    for tid, fid in sorted(franchise_ids.items()):
        if fid in seen:
            franchise_ids[tid] = f"{fid}-{tid}"
        seen[fid] = tid

    artifact = {
        "players": [
            {
                "id": person_to_slug[pid],
                "sport": SPORT,
                "full_name": p["full_name"],
                "first_season": p["first_season"],
                "last_season": p["last_season"],
                "career_games": p["career_games"],
                "notability": p["notability"],
                "nba_person_id": pid,
            }
            for pid, p in sorted(players.items(), key=lambda kv: person_to_slug[kv[0]])
        ],
        "franchises": [
            {"id": franchise_ids[tid], "sport": SPORT, "name": fr["name"], "nba_team_id": tid}
            for tid, fr in sorted(franchises.items())
        ],
        "team_seasons": [
            {
                "id": ts["id"],
                "sport": SPORT,
                "franchise_id": franchise_ids[ts["team_id"]],
                "season": ts["season"],
                "display_name": ts["display_name"],
            }
            for ts in sorted(team_seasons.values(), key=lambda t: t["id"])
        ],
        "appearances": sorted(
            (
                {
                    "player_id": person_to_slug[a["person_id"]],
                    "team_season_id": a["ts_id"],
                    "games_played": a["gp"],
                }
                for a in appearances
            ),
            key=lambda a: (a["player_id"], a["team_season_id"]),
        ),
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    body = json.dumps(artifact, separators=(",", ":"), ensure_ascii=False)
    (DATA_DIR / f"{SPORT}.json").write_text(body, encoding="utf-8")
    meta = {
        "sport": SPORT,
        "version": ARTIFACT_VERSION,
        "generated": date.today().isoformat(),
        "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "seasons": [int(p.stem) for p in seasons],
        "players": len(artifact["players"]),
        "franchises": len(artifact["franchises"]),
        "team_seasons": len(artifact["team_seasons"]),
        "appearances": len(artifact["appearances"]),
    }
    (DATA_DIR / f"{SPORT}.meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
