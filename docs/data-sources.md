# Data source research — Session 3

**Report only. No pipeline code was written, and nothing was run against the database.**
Investigated 2026-07-27. Every number below was measured from the live source, not taken from its documentation.

---

## 0. Verdict first

| Sport | Jersey numbers, per stint | Usable range | Source |
|---|---|---|---|
| **NFL** | ✅ **GO** | **1996 → present** | nflverse rosters |
| **MLB** | ⚠️ **CONDITIONAL** | **~2000 → present** only | MLB StatsAPI |
| **NBA** | ❌ **NO-GO** | none | no open source found |

**NBA is a no-go for automated per-stint jersey numbers, and it is a live sport.** That is not a "needs more research" answer; it is a design constraint. Details in §3.

The single most important thing in this report: **a source having a `jersey_number` column does not mean it has jersey numbers.** Both nflverse and MLB StatsAPI expose the field across their entire historical range and populate it with placeholders (`0` and `""` respectively) for most of that range. Trusting the column's presence would have shipped puzzles with jersey number 0.

---

## 1. NFL — GO, from 1996

### Jersey coverage is a cliff, not a slope

`nflreadr::load_rosters()` documents coverage "back to 1920", and the `jersey_number` column is present in every season file from 1920 on. Measured fill rate of *real* numbers (excluding `0`):

| Season | Roster rows | Real jersey number | |
|---|---|---|---|
| 1920 | 369 | **0.0%** | absent |
| 1935 | 279 | 0.4% | absent |
| 1960 | 888 | **0.0%** | absent |
| 1970 | 1,225 | 1.2% | absent |
| 1980 | 1,511 | 0.3% | absent |
| 1990 | 1,585 | 3.7% | absent |
| 1995 | 1,918 | 19.0% | partial |
| **1996** | 1,911 | **99.3%** | **← cutover** |
| 1997 | 1,923 | 99.4% | present |
| 2000–2025 | 2,000–3,200 | 99.5–100% | present |

The pre-1996 rows are not empty — they contain `0`. In 1920, 1960 and several other seasons, *every single row* is `0`. A naive "is the field populated?" check reports 100% coverage back to 1920 and is completely wrong.

Note this also means **AFL seasons (1960–69) have no jersey numbers**, despite the rosters themselves being present and complete.

### Other fields

| Field | Status | Notes |
|---|---|---|
| Player identity | ✅ present | `gsis_id`, plus `espn_id`, `pfr_id`, `sportradar_id`, `esb_id`, `smart_id` and ~6 more |
| Team-by-team stints | ✅ present | derivable from season × team rows; 1920+ |
| **Jersey, per stint** | ⚠️ **1996+ only** | see above |
| Position | ✅ present | `position`, `depth_chart_position`, `ngs_position` |
| Height / weight | ✅ present | |
| College | ✅ present | |
| Draft year / pick | ✅ present | `entry_year`, `rookie_year`, `draft_club`, `draft_number` |
| Per-season stat lines | ⚠️ separate | not in rosters; `load_player_stats()` / PBP aggregation. Not evaluated this session |
| Accolades per stint | ❌ absent | no awards data in nflverse rosters |
| Franchise W-L-T + playoffs | ❌ absent | not in rosters |

### Candidate pool — measured

Computed directly from the 1996–2025 season roster files (30 seasons, 45 files downloaded), counting distinct franchises per player:

| Cut | Players |
|---|---|
| Distinct players seen 1996+ | 18,500 |
| **≥4 distinct franchises** | **1,941** |
| ≥5 distinct franchises | 718 |
| ≥6 distinct franchises | 237 |
| ≥4 franchises **and** `rookie_year ≥ 1996` | **1,817** |
| …of those, with a real jersey on **every** roster row | **1,791** |

**1,791 fully clean NFL candidates.** Against a one-per-day schedule that is roughly five years of runway from this source alone, before any manual authoring. The runway problem is solved for NFL.

### The 124 players who span the gap

1,941 − 1,817 = **124 players with ≥4 franchises who debuted before 1996**. These are disproportionately the interesting ones — the 1980s/early-90s well-travelled journeymen.

Three options, and my recommendation:

1. **Exclude them.** Cheapest, and the 1,791 clean candidates are plenty. But it silently biases the game toward the post-1996 era forever, and quietly deletes exactly the "who WAS that guy" players the concept is built on.
2. **Include with hand-authored early numbers.** 124 players × ~2–3 pre-1996 stints ≈ 250–350 numbers to verify by hand against the [Gridiron Uniform Database](https://www.gridiron-uniforms.com/). Slow, but it is a bounded, finite, one-time task — not an ongoing burden.
3. **Include with `jerseyNumber: null`** for pre-1996 stints, using the blank-back fallback already in `Stint` (`src/game/types.ts`).

**Recommendation: (2), with (3) as the fallback for any number that can't be confirmed.** Reasoning: option 3 alone is worse than it looks here. In MLB a blank back is *era-authentic* — pre-1929 uniforms genuinely had no numbers, so the blank reads as information. In 1988 NFL it is not authentic; it reads as a bug, because players demonstrably wore numbers. A blank back on a 1988 Chiefs jersey tells the player "we don't know", which in a game whose premise is jersey accuracy is a worse experience than not including the player.

Option 2 is also self-limiting: 124 is a fixed set that never grows, and it can be worked through opportunistically rather than blocking the pipeline. Structure it as a queue like the colorway backlog.

### The 10 live NFL puzzles — verified, all correct

Requested check: whether any authored NFL puzzle covers pre-1996 stints, since those numbers were hand-authored from general knowledge and are live now.

`src/data/nfl/puzzles.ts` carries this header:

> "DATA PROVENANCE — generated from general knowledge (2026-07-19). Stint years, jersey numbers, and stat lines are best-effort recall and **MUST be verified** against Pro-Football-Reference before launch"

They shipped without that verification. **Earliest stint across all 10 puzzles is 1996 — there are zero pre-1996 stints.** Every one of the 51 stints therefore falls inside the era where nflverse has real numbers, so rather than hand-verification I checked all 51 automatically:

**51 match, 0 mismatch, 0 no-data.** Every jersey number in the live NFL puzzle set is confirmed against nflverse.

**Caveat, stated precisely:** the check matched on *player + season*, not player + season + team, because puzzle franchise codes and nflverse team codes don't align without a mapping table. For a multi-team season — Randy Moss 2010 (NE #81 → MIN #84 → TEN #84) — it confirms the number was worn that year but cannot confirm which team it belonged to. Numbers are verified; per-team attribution for mid-season moves is not. Stat lines and stint year ranges were **not** verified at all.

---

## 2. MLB — conditional, and the history is the problem

### MLB StatsAPI

`statsapi.mlb.com/api/v1/teams/{id}/roster?season=Y&rosterType=fullSeason` returns a `jerseyNumber` key for every season back to at least 1925 — populated with an **empty string** for historical rosters.

New York Yankees (team 147), full-season rosters:

| Season | People | With a real number |
|---|---|---|
| 1925 | 36 | **0** |
| 1950 | 38 | **0** |
| 1970 | 34 | 1 |
| 1990 | 43 | **0** |
| 1995 | 42 | 7 (17%) |
| 2000 | 46 | 45 (98%) |
| 2003–2005 | 48–51 | 100% |
| 2024 | 54 | 100% |

Cross-checked at 2004 and 2010 for Boston (111), LA Dodgers (119) and Milwaukee (158) — 100% in every case, so the cutover is league-wide, not a Yankees artifact.

**Effective range: ~2000 → present.** 1990 returning zero while 1995 returns 17% suggests backfill is sporadic rather than a clean historical boundary; treat anything pre-2000 as unavailable rather than partial.

### The other MLB sources do not fill the gap

| Source | Jersey numbers? | Verified how |
|---|---|---|
| **Chadwick Bureau Register** | ❌ **none** | Pulled `people-0.csv` header: 30 fields, no `jersey`/`uniform`/`number` field of any kind |
| **Retrosheet** | ❌ **none** | Seven master CSVs (`allplayers`, `gameinfo`, `teamstats`, `batting`, `pitching`, `fielding`, `plays`) — no uniform-number dataset |
| **pybaseball** | ⚠️ **blocked** | Its historical coverage is largely a Baseball-Reference scraper — prohibited by `00_CONSTRAINTS.md` §4 |

So for MLB before ~2000 there is **no permissible open source of jersey numbers.** That is a hard finding, not a gap in the research.

### What this means for the live MLB puzzles

The 15 authored MLB puzzles contain 78 stints, earliest starting **1914**, latest 2022 — and already use `jerseyNumber: null` on **8 stints**. The blank-back fallback is in production and working.

For MLB the blank back is the *right* answer rather than a compromise: pre-1929 uniforms genuinely carried no numbers, and the `Stint` type's comment already says exactly this. MLB's historical depth is an asset the game leans on, and it doesn't require jersey numbers to work.

**Verdict: GO for 2000+ automated. Pre-2000 stays manual or blank-back, permanently.** Any MLB pipeline that assumes it can source historical numbers is built on a false premise.

### Other MLB fields

| Field | Chadwick | Retrosheet | StatsAPI |
|---|---|---|---|
| Identity + cross-source IDs | ✅ excellent | ✅ | ✅ (`key_mlbam`) |
| Name suffix / nickname | ✅ `name_suffix`, `name_nick` | — | partial |
| Debut / final year | ✅ `mlb_played_first/last` | ✅ | ✅ |
| Team-by-team stints | ❌ | ✅ `allplayers.csv` | ✅ |
| **Jersey per stint** | ❌ | ❌ | ⚠️ 2000+ |
| Per-season stat lines | ❌ | ✅ | ✅ |
| Bats/throws, height, born | ❌ (birth date only) | ✅ | ✅ |
| Franchise W-L + playoffs | ❌ | ✅ | ✅ (already used for `teamSeasons.json`) |

### Candidate count — not estimated, deliberately

I could not estimate the MLB candidate pool cheaply. Retrosheet's `allplayers.csv` (player × team × season) is the right input, but it ships only inside bulk archives (`csvdownloads.zip`, 1898–2025) rather than as an individually addressable file — the direct URL 404s. Downloading a full-history archive to produce one count was disproportionate for a report-only session.

**Rather than guess: not estimated.** It is cheaply obtainable in Session 4 from that archive, and I'd expect it to be large — MLB has the deepest history and the most players — but that expectation is not a number and I'm not presenting it as one.

---

## 3. NBA — NO-GO, plainly

**`stats.nba.com` cannot supply per-stint jersey numbers, and this is the live sport with the most authored content.**

The structural reason, which holds regardless of access:

- **`commonplayerinfo` returns `JERSEY` as a single scalar per player** — one value in a 31-field record alongside `HEIGHT`, `WEIGHT`, `POSITION`, `TEAM_ID`. It reflects the player's current or most recent number. There is no season or team dimension on it.
- **`playercareerstats` has the season × team dimension** — one row per season per team, which is exactly the stint shape needed — **but carries no jersey field at all.**

The two halves of what the game needs exist in different endpoints and cannot be joined, because the one with jersey numbers has no time dimension. Ish Smith wore a different number at most of his 13 stops; `commonplayerinfo` returns one of them.

**Access is also a problem.** A direct request to `stats.nba.com/stats/commonplayerinfo` with full browser headers (User-Agent, Referer, Origin, `x-nba-stats-origin`, `x-nba-stats-token`) **timed out after 45 seconds with zero bytes received.** I can't tell from a single host whether that is a universal block on datacenter IPs (widely reported for this endpoint) or my sandbox — but a source that won't respond from a build environment is not a source you can put in a scheduled pipeline without proving otherwise.

**Additional gap:** no ABA coverage, as the session doc anticipated. The live NBA roster includes Connie Hawkins, Rick Barry, Dave Bing and Nate Archibald — ABA/early-NBA careers that stats.nba.com will not serve regardless.

### Alternatives checked

| Alternative | Result |
|---|---|
| **balldontlie** | ❌ HTTP 401 — now requires an API key; legacy v1 endpoint 404s |
| **Sportradar / SportsDataIO** | ❌ commercial, paid licensing — not evaluated further |
| **Basketball-Reference** | ❌ prohibited by `00_CONSTRAINTS.md` §4 |
| **Wikipedia / Wikidata** | ⚠️ not evaluated. Chadwick carries `key_wikidata`, so it is reachable in principle. Unstructured and unverified for per-stint numbers |

### What this means

NBA's 27 authored puzzles were hand-verified against Basketball-Reference (per the provenance header in `src/data/puzzles.ts`, "Jersey numbers verified per stint via BR team-season roster pages"). That is a *manual* process using BR as a human reference, which `00_CONSTRAINTS.md` §4 explicitly permits.

**There is currently no automated path to replace it.** The realistic options are:

1. **Accept NBA stays hand-authored** for jersey numbers, using the existing verified workflow, with automation limited to stints/stats/hints from `playercareerstats`.
2. **Build a manual verification queue** for NBA numbers, like the colorway backlog — automate everything except the number, then have a human fill the number with BR open in another tab.
3. **Investigate Wikidata/Wikipedia** as a genuine source before committing. Not done this session.

I'd recommend deciding between these before Session 4, because **it changes what "the pipeline" means for NBA** — it becomes an assistive tool for a human author rather than an ingest job.

---

## 4. Name mapping onto `playerIndex.json` — a real, silent breakage

This is worse than a formatting nit, and the failure is exactly the one you named: the player types a correct answer and the game says no.

`normalizeName()` (`src/data/playerSearch.ts`) strips diacritics, apostrophes and **periods**, lowercases and trims. It does **not** strip spaces or suffixes. So:

```
"A. J. Pierzynski"  →  "a j pierzynski"
"A.J. Pierzynski"   →  "aj pierzynski"     ← different key
```

Measured across the three shipped indexes:

| Index | Entries | `A. J.` spaced | `A.J.` tight | Diacritics | Suffixes (`Jr`/`III`) |
|---|---|---|---|---|---|
| NBA | 5,415 | 0 | **56** | 153 | 59 |
| NFL | 8,408 | 0 | **134** | 1 | 72 |
| MLB | 10,994 | **92** | 0 | 355 | **0** |

**Three distinct problems:**

**(a) MLB uses spaced initials; NBA/NFL use tight.** 92 MLB entries are `"A. J. Burnett"` style. nflverse and StatsAPI both emit tight (`"A.J."`) or bare forms. Those 92 will not match, and each is a silent type-ahead failure. NBA/NFL are internally consistent, so the risk there is lower — but a new source emitting the other convention breaks 190 entries across the two.

**(b) The MLB index has no suffixes at all — and it has silently dropped players.** Zero `Jr.`/`Sr.`/`III` entries in 10,994, and the consequences are visible:

| Index entry | Career shown | Who that actually is | Who's missing |
|---|---|---|---|
| `Ken Griffey` | 1989–2010 | Griffey **Jr.** | Griffey **Sr.** (1973–1991) |
| `Vladimir Guerrero` | 1996–2011 | Guerrero **Sr.** | Guerrero **Jr.** (2019–) |
| `Fernando Tatís` | 1997–2010 | Tatís **Sr.** | Tatís **Jr.** (2019–) |
| `Bobby Witt` | 1986–2001 | Witt **Sr.** | Witt **Jr.** (2022–) |

Suffix-stripping collapsed father/son pairs into one entry and dropped the other — and inconsistently, keeping Jr. in one case and Sr. in three. **Vladimir Guerrero Jr., Fernando Tatís Jr. and Bobby Witt Jr. cannot be typed into the MLB guess box today.** NBA handles this correctly (`Gary Payton` and `Gary Payton II` both present).

**(c) The MLB index is stale and marks nobody active.** Zero entries contain `"present"`; every range is closed and ends ≤2022. Shohei Ohtani reads `2018–2022`. NBA has 582 active entries (latest 2025), NFL 1,074 (latest 2024). The MLB index is roughly three seasons behind and structurally cannot represent an active player.

**(d) NFL index starts at 1974.** Earliest start year across 8,408 entries is 1974 — so pre-merger and early-70s players are absent from the guess box entirely. If the pipeline ever schedules one, it is unguessable. (Moot while jersey numbers cap the era at 1996, but it would bite if the 124-player gap set is authored in.)

**Chadwick solves (a) and (b) properly.** Its register carries `name_last`, `name_first`, `name_given`, **`name_suffix`**, `name_nick` as separate fields, plus `key_mlbam`, `key_retro`, `key_bbref`, **`key_sr_nfl`**, **`key_sr_nba`**, `key_wikidata`. Suffixes are structured data rather than a string convention, so father/son pairs stay distinct.

**This is the finding that most changes Session 4:** the session doc lists Chadwick under MLB only. It is in fact a **three-sport identity backbone** — `key_sr_nfl` and `key_sr_nba` mean it can act as the crosswalk for NFL and NBA identity resolution too. It should be adopted across all three sports, not just baseball.

---

## 5. Licensing — two corrections and one risk

| Source | Actual terms | Action needed in the app |
|---|---|---|
| **nflverse** | **CC-BY-4.0** | ⚠️ **Attribution required in-app.** Commercial use permitted. Needs a visible credit line |
| **Retrosheet** | ⚠️ **Copyrighted, not public domain** | ⚠️ **Verbatim notice required** (see below) |
| **Chadwick Register** | Public domain (CC0) | none |
| **MLB StatsAPI** | ⚠️ **no published open licence** | see risk below |
| **stats.nba.com** | no published licence, undocumented | — |

**Correction 1 — Retrosheet is not public domain.** The session doc lists it as such. Retrosheet requires this notice be carried verbatim by anyone using the data:

> "The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at 20 Sunset Rd., Newark, DE 19711."

Free for any use including commercial, **provided that credit appears**. If Retrosheet data ships in the app, that string must appear in the app.

**Correction 2 — nflverse is CC-BY-4.0**, which also requires attribution. Two separate credit lines are needed, not one generic "data sources" mention.

**Risk — MLB StatsAPI has no open licence.** It is a public but undocumented endpoint powering MLB's own products. There is no published grant of redistribution rights, no rate-limit documentation, and no stability guarantee. It is already used for `teamSeasons.json`. Using it is a judgement call about risk tolerance rather than a licensing question with a clean answer — worth a deliberate decision rather than drifting into dependence on it.

---

## 6. What changes in Session 4

Session 4's **"NFL only" scoping remains exactly right** — NFL has the best coverage of the three, a clean measurable boundary, a real candidate pool, and a permissive licence. It's the correct sport to build the pipeline on.

Its **pre-launch framing is wrong**, though: Session 4 is written as if NFL is unlaunched and therefore safe to iterate against. NFL has been live since 2026-07-22 with real players and real streaks. Anything Session 4 does to NFL puzzle data is a change to a live game and falls under `00_CONSTRAINTS.md` §1.

Specific design impacts:

1. **Hard-gate the pipeline at 1996.** Not a filter to add later — a precondition. Any NFL stint before 1996 must either be hand-authored or rejected, never auto-populated. A `jersey_number` of `0` must be treated as **missing**, never as a number.
2. **Chadwick becomes a Session 4 dependency, for all three sports.** Identity resolution should key off `key_sr_nfl` / `key_mlbam` / `key_sr_nba` rather than name-matching.
3. **`playerIndex.json` regeneration is in scope and isn't cosmetic.** The MLB index is missing three active stars and marks nobody active. Whatever the pipeline emits must round-trip through `normalizeName()` and match, with a test asserting every scheduled answer is findable in the guess box.
4. **Accolades and franchise W-L are not in nflverse rosters.** Both are needed for cards. Either another nflverse table supplies them (not evaluated) or they stay manual. Do not assume the roster feed covers them.
5. **Stat lines are a separate, unevaluated problem.** Rosters carry no statistics. The existing NFL puzzles' stat lines came from the ESPN API (per the file header) and remain unverified.
6. **The 124-player gap set needs a decision** before the pipeline defines its candidate query — see §1.

---

## 7. Gaps requiring manual authoring regardless of source

- **All NBA jersey numbers, per stint.** No automated source exists. (§3)
- **All MLB jersey numbers before ~2000.** No permissible source exists. (§2)
- **All NFL jersey numbers before 1996** — 124 candidate players affected. (§1)
- **ABA seasons entirely** — identity, stints, numbers.
- **Accolades attributable to a specific stint**, all three sports. No evaluated source ties an award to a stint.
- **Colorway verification** — already known, Session 5.
- **`revealOrder`** — an editorial judgement, not data.

---

## 8. Corrections to standing docs

- `PROJECT_OVERVIEW.md` status line said NBA was live with NFL/MLB pre-launch. **Corrected in this PR** — all three are live.
- `00_CONSTRAINTS.md` §1 named NBA as the only live sport, and its post-deploy check covered NBA only. **Corrected** (that file lives outside the repo, so it is not in this PR).
- `SESSION_2_cloud_merge.md` §2.2 calls NFL/MLB "two sports that haven't launched" — stale, not corrected.
- `SESSION_3_source_research.md` lists Retrosheet as public domain — it is copyrighted with a mandatory notice (§5).
- `PROJECT_OVERVIEW.md` §7 "Known gaps" items 1, 3 and 4 are stale after Session 2: the top-up has been run (0 rows), `test@test.com` is now deliberately kept, and the launch dates are confirmed. **Not corrected in this PR** — flagging rather than widening scope.
