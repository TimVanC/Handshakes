"""Fetch NBA player game logs per season and aggregate to team-season appearances.

One request per season against stats.nba.com leaguegamelog (PlayerOrTeam=P,
regular season only). Each season is aggregated immediately to compact rows —
(player, team, games played, points) — and cached under cache/<season>.json,
so re-runs skip completed seasons and the raw multi-MB responses are never
stored. build_artifact.py combines the cache into the versioned artifact.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"
FIRST_SEASON_END = 1947   # 1946-47, BAA — counted as NBA history by stats.nba.com
LAST_SEASON_END = 2026    # 2025-26, complete as of Aug 2026

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

URL = (
    "https://stats.nba.com/stats/leaguegamelog?Counter=0&DateFrom=&DateTo="
    "&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season={season}"
    "&SeasonType=Regular+Season&Sorter=DATE"
)


def season_str(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:].zfill(2)}"


def fetch_season(end_year: int) -> dict:
    url = URL.format(season=season_str(end_year))
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.load(resp)

    rs = payload["resultSets"][0]
    idx = {name: i for i, name in enumerate(rs["headers"])}
    agg = {}  # (person_id, team_id) -> row
    for row in rs["rowSet"]:
        key = (row[idx["PLAYER_ID"]], row[idx["TEAM_ID"]])
        if key not in agg:
            agg[key] = {
                "person_id": row[idx["PLAYER_ID"]],
                "name": row[idx["PLAYER_NAME"]],
                "team_id": row[idx["TEAM_ID"]],
                "tricode": row[idx["TEAM_ABBREVIATION"]],
                "team_name": row[idx["TEAM_NAME"]],
                "gp": 0,
                "pts": 0,
            }
        agg[key]["gp"] += 1
        pts = row[idx["PTS"]]
        agg[key]["pts"] += pts if isinstance(pts, (int, float)) else 0
    return {
        "season_end": end_year,
        "game_rows": len(rs["rowSet"]),
        "appearances": list(agg.values()),
    }


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    for end_year in range(FIRST_SEASON_END, LAST_SEASON_END + 1):
        out = CACHE_DIR / f"{end_year}.json"
        if out.exists():
            continue
        attempts = 0
        while True:
            attempts += 1
            try:
                data = fetch_season(end_year)
                break
            except Exception as exc:  # noqa: BLE001 — retry any transport error
                if attempts >= 4:
                    print(f"{end_year}: FAILED after {attempts} tries: {exc}", flush=True)
                    failures.append(end_year)
                    data = None
                    break
                wait = 5 * attempts
                print(f"{end_year}: attempt {attempts} failed ({exc}); retrying in {wait}s", flush=True)
                time.sleep(wait)
        if data is not None:
            tmp = out.with_suffix(".tmp")
            tmp.write_text(json.dumps(data), encoding="utf-8")
            tmp.replace(out)
            print(
                f"{end_year}: {data['game_rows']} game rows -> "
                f"{len(data['appearances'])} appearances",
                flush=True,
            )
        time.sleep(1.2)

    if failures:
        print(f"INCOMPLETE — failed seasons: {failures}", flush=True)
        sys.exit(1)
    print("All seasons cached.", flush=True)


if __name__ == "__main__":
    main()
