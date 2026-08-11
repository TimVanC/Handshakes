import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../src/lib/supabase";
import { resolveColorway } from "../../src/game/colorways";
import type { Puzzle, Stint } from "../../src/game/types";
import { SPORTS, SPORT_ORDER } from "../../src/sports";
import type { Sport, SportConfig } from "../../src/sports/types";

interface ScheduleRow {
  schedule_id: number;
  sport: Sport;
  day: number;
  answer: string;
  puzzle: Puzzle;
  source: "authored" | "generated" | "test";
  status: "scheduled" | "aired" | "skipped";
  frozen: boolean;
  generated_at: string;
}

type SportMap<T> = Record<Sport, T>;
type View = "schedule" | "archive";

type Tier = "LEG" | "B-C" | "S" | "A" | "B-K" | "GHOST";

const TIER_ORDER: Tier[] = ["LEG", "B-C", "S", "A", "B-K", "GHOST"];

const TIER_INFO: Record<Tier, { className: string; label: string; blurb: string }> = {
  LEG: {
    className: "tier-leg",
    label: "Legend (outlier)",
    blurb: "All-time icon or one-team great. Trivially easy — the first jersey gives it away. Avoid scheduling.",
  },
  "B-C": {
    className: "tier-bc",
    label: "B · Casual",
    blurb: "Household star even casual fans know (Vince Carter, Allen Iverson). Sprinkle in as easy days.",
  },
  S: {
    className: "tier-s",
    label: "S · Sweet spot",
    blurb: "The bullseye: a true journeyman with real name recognition. Most fans get there if they dig. Lean heavy here.",
  },
  A: {
    className: "tier-a",
    label: "A · Deeper bag",
    blurb: "Still well known, but a deeper pull that takes real digging. Second-most common tier.",
  },
  "B-K": {
    className: "tier-bk",
    label: "B · Ball knower",
    blurb: "Only diehards land this. Sprinkle in as hard days — never run several in a row.",
  },
  GHOST: {
    className: "tier-ghost",
    label: "Ghost (outlier)",
    blurb: "Too deep even for ball knowers. A lost day for almost everyone. Avoid scheduling.",
  },
};

const LAUNCH: SportMap<string> = {
  nba: "2026-07-15",
  nfl: "2026-07-22",
  mlb: "2026-07-22",
};

const SPORT_ACCENT: SportMap<string> = {
  nba: "#bb6337",
  nfl: "#47725f",
  mlb: "#4c648c",
};

const emptyRows = (): SportMap<ScheduleRow[]> => ({ nba: [], nfl: [], mlb: [] });
const emptyNumbers = (): SportMap<number> => ({ nba: 0, nfl: 0, mlb: 0 });

export default function AdminApp({ session }: { session: Session }) {
  const [allRows, setAllRows] = useState<ScheduleRow[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [drafts, setDrafts] = useState<SportMap<ScheduleRow[]>>(emptyRows);
  const [originalIds, setOriginalIds] = useState<SportMap<number[]>>({ nba: [], nfl: [], mlb: [] });
  const [versions, setVersions] = useState<SportMap<number>>(emptyNumbers);
  const [currentDays, setCurrentDays] = useState<SportMap<number>>(emptyNumbers);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [view, setView] = useState<View>("schedule");
  const [activeSport, setActiveSport] = useState<Sport | "all">("all");
  const [dragging, setDragging] = useState<{ sport: Sport; id: number } | null>(null);
  const [dropHint, setDropHint] = useState<{ sport: Sport; index: number } | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier[]>([]);
  const [verifyFilter, setVerifyFilter] = useState<"all" | "full" | "partial">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [scheduleResult, versionResult, tierResult, ...dayResults] = await Promise.all([
      supabase
        .from("scheduled_puzzles")
        .select("schedule_id,sport,day,answer,puzzle,source,status,frozen,generated_at")
        .order("day"),
      supabase.from("schedule_versions").select("sport,version"),
      supabase.from("player_tiers").select("sport,player_name,tier"),
      ...SPORT_ORDER.map((sport) => supabase.rpc("current_day", { p_sport: sport })),
    ]);

    const firstError =
      scheduleResult.error ?? versionResult.error ?? tierResult.error ?? dayResults.find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const nextCurrent = emptyNumbers();
    SPORT_ORDER.forEach((sport, index) => {
      nextCurrent[sport] = Number(dayResults[index].data);
    });
    const rows = (scheduleResult.data ?? []) as unknown as ScheduleRow[];
    const nextDrafts = emptyRows();
    const nextOriginal: SportMap<number[]> = { nba: [], nfl: [], mlb: [] };
    for (const sport of SPORT_ORDER) {
      nextDrafts[sport] = rows
        .filter((row) => row.sport === sport && !row.frozen && row.day > nextCurrent[sport])
        .sort((a, b) => a.day - b.day);
      nextOriginal[sport] = nextDrafts[sport].map((row) => row.schedule_id);
    }
    const nextVersions = emptyNumbers();
    for (const row of versionResult.data ?? []) {
      const sport = row.sport as Sport;
      nextVersions[sport] = Number(row.version);
    }

    const nextTiers: Record<string, Tier> = {};
    for (const row of tierResult.data ?? []) {
      nextTiers[`${row.sport}|${row.player_name}`] = row.tier as Tier;
    }

    setAllRows(rows);
    setTiers(nextTiers);
    setDrafts(nextDrafts);
    setOriginalIds(nextOriginal);
    setVersions(nextVersions);
    setCurrentDays(nextCurrent);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtySports = useMemo(
    () =>
      SPORT_ORDER.filter(
        (sport) => drafts[sport].map((row) => row.schedule_id).join(",") !== originalIds[sport].join(",")
      ),
    [drafts, originalIds]
  );

  const move = (sport: Sport, from: number, to: number) => {
    if (from === to || to < 0 || to >= drafts[sport].length) return;
    setDrafts((current) => {
      const list = [...current[sport]];
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...current, [sport]: list };
    });
    setNotice("");
  };

  // While dragging, hovering the top half of a card targets the slot above
  // it, the bottom half the slot below — dropHint.index is the insertion
  // slot the colored line marks.
  const dragOverCard = (sport: Sport, index: number, event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging.sport !== sport) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const before = event.clientY - rect.top < rect.height / 2;
    const next = index + (before ? 0 : 1);
    if (dropHint?.sport !== sport || dropHint.index !== next) setDropHint({ sport, index: next });
  };

  const dragOverList = (sport: Sport, event: DragEvent) => {
    if (!dragging || dragging.sport !== sport) return;
    event.preventDefault();
    // Auto-scroll long columns while dragging near their edges.
    const list = event.currentTarget as HTMLElement;
    const rect = list.getBoundingClientRect();
    if (event.clientY < rect.top + 56) list.scrollTop -= 16;
    else if (event.clientY > rect.bottom - 56) list.scrollTop += 16;
    // Hovering the empty space under the last card drops at the end.
    if (event.target === event.currentTarget) {
      const end = drafts[sport].length;
      if (dropHint?.sport !== sport || dropHint.index !== end) setDropHint({ sport, index: end });
    }
  };

  const drop = (sport: Sport, event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging.sport !== sport || !dropHint || dropHint.sport !== sport) return;
    const from = drafts[sport].findIndex((row) => row.schedule_id === dragging.id);
    let to = dropHint.index;
    if (from < to) to -= 1;
    move(sport, from, Math.max(0, Math.min(to, drafts[sport].length - 1)));
    setDragging(null);
    setDropHint(null);
  };

  const discard = () => {
    setDrafts((current) => {
      const next = { ...current };
      for (const sport of SPORT_ORDER) {
        const byId = new Map(current[sport].map((row) => [row.schedule_id, row]));
        next[sport] = originalIds[sport].map((id) => byId.get(id)).filter(Boolean) as ScheduleRow[];
      }
      return next;
    });
    setNotice("Draft changes discarded.");
  };

  const save = async () => {
    if (dirtySports.length === 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    const payload = Object.fromEntries(
      dirtySports.map((sport) => [
        sport,
        {
          expectedVersion: versions[sport],
          scheduleIds: drafts[sport].map((row) => row.schedule_id),
        },
      ])
    );
    const { error: saveError } = await supabase.rpc("admin_reorder_schedules", {
      p_payload: payload,
    });
    if (saveError) {
      setError(
        saveError.code === "40001"
          ? "The schedule changed in another tab. Reloaded the latest order; please review it again."
          : saveError.message
      );
      await load();
    } else {
      await load();
      setNotice(`Saved ${dirtySports.length === 1 ? SPORTS[dirtySports[0]].league : "all schedule"} changes.`);
    }
    setSaving(false);
  };

  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const filtersActive = query.trim() !== "" || tierFilter.length > 0 || verifyFilter !== "all";
  const matchesFilters = useCallback(
    (row: ScheduleRow) => {
      if (query.trim() && !normalize(row.answer).includes(normalize(query.trim()))) return false;
      if (tierFilter.length) {
        const tier = tiers[`${row.sport}|${row.answer}`];
        if (!tier || !tierFilter.includes(tier)) return false;
      }
      if (verifyFilter !== "all") {
        const full = verificationFor(row).full;
        if (verifyFilter === "full" ? !full : full) return false;
      }
      return true;
    },
    [query, tierFilter, verifyFilter, tiers]
  );

  const visibleSports = activeSport === "all" ? SPORT_ORDER : [activeSport];
  const archiveRows = [...allRows]
    .filter((row) => row.frozen || row.day <= currentDays[row.sport])
    .filter(matchesFilters)
    .sort((a, b) => dateFor(b.sport, b.day).getTime() - dateFor(a.sport, a.day).getTime());

  return (
    <div className="admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Journeyman editorial</p>
          <h1>Schedule Room</h1>
        </div>
        <div className="owner-block">
          <span><i /> Owner · SMS verified</span>
          <small>{session.user.email ?? session.user.phone}</small>
          <button className="text-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <main className="admin-main">
        <section className="command-row" aria-label="Schedule controls">
          <div className="view-tabs" role="tablist">
            <button className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}>Upcoming</button>
            <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>Archive</button>
          </div>
          <div className="sport-filter">
            {(["all", ...SPORT_ORDER] as const).map((sport) => (
              <button
                key={sport}
                className={activeSport === sport ? "active" : ""}
                onClick={() => setActiveSport(sport)}
              >
                {sport === "all" ? "All sports" : sport.toUpperCase()}
              </button>
            ))}
          </div>
        </section>

        <section className="filter-row" aria-label="Player filters">
          <input
            className="filter-search"
            type="search"
            placeholder="Search players…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="filter-group" role="group" aria-label="Tier filter">
            {TIER_ORDER.map((tier) => (
              <button
                key={tier}
                className={`filter-chip ${tierFilter.includes(tier) ? "active" : ""}`}
                onClick={() =>
                  setTierFilter((current) =>
                    current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier]
                  )
                }
              >
                {tier}
              </button>
            ))}
          </div>
          <div className="filter-group" role="group" aria-label="Verification filter">
            {([["all", "Any status"], ["full", "✓ Verified"], ["partial", "Partial"]] as const).map(([value, label]) => (
              <button
                key={value}
                className={`filter-chip ${verifyFilter === value ? "active" : ""}`}
                onClick={() => setVerifyFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {filtersActive ? (
            <button
              className="text-button"
              onClick={() => { setQuery(""); setTierFilter([]); setVerifyFilter("all"); }}
            >
              Clear filters
            </button>
          ) : null}
          {filtersActive && view === "schedule" ? (
            <span className="filter-note">Filters on — reordering paused</span>
          ) : null}
        </section>

        {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
        {notice ? <div className="banner banner-success" role="status">{notice}</div> : null}

        {loading ? (
          <LoadingBoard />
        ) : view === "schedule" ? (
          <>
            <section className="schedule-intro">
              <div>
                <p className="eyebrow">Future puzzles only</p>
                <h2>Build the next run</h2>
                <p>Drag players within a league. Dates update immediately; nothing goes live until you save.</p>
              </div>
              <div className={`draft-state ${dirtySports.length ? "is-dirty" : ""}`}>
                <strong>{dirtySports.length ? `${dirtySports.length} league${dirtySports.length > 1 ? "s" : ""} changed` : "Schedule saved"}</strong>
                <span>{dirtySports.length ? "Review the dates, then publish." : "No unpublished changes."}</span>
              </div>
            </section>

            <TierKey />

            <section className={`schedule-board columns-${visibleSports.length}`}>
              {visibleSports.map((sport) => (
                <SportColumn
                  key={sport}
                  sport={sport}
                  rows={drafts[sport]}
                  tiers={tiers}
                  matchesFilters={matchesFilters}
                  locked={filtersActive}
                  dragging={dragging}
                  dropHint={dropHint?.sport === sport ? dropHint.index : null}
                  onDragStart={(id) => setDragging({ sport, id })}
                  onDragEnd={() => { setDragging(null); setDropHint(null); }}
                  onDragOverCard={(index, event) => dragOverCard(sport, index, event)}
                  onDragOverList={(event) => dragOverList(sport, event)}
                  onDrop={(event) => drop(sport, event)}
                  onMove={(from, to) => move(sport, from, to)}
                  onOpen={setSelected}
                />
              ))}
            </section>
          </>
        ) : (
          <Archive rows={archiveRows} activeSport={activeSport} tiers={tiers} onOpen={setSelected} />
        )}
      </main>

      {view === "schedule" && dirtySports.length > 0 ? (
        <div className="save-dock">
          <div><strong>Unpublished order</strong><span>{dirtySports.map((sport) => sport.toUpperCase()).join(" · ")}</span></div>
          <button className="button button-quiet" onClick={discard} disabled={saving}>Discard</button>
          <button className="button button-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save schedule"}
          </button>
        </div>
      ) : null}

      {selected ? (
        <PlayerDrawer row={selected} tier={tiers[`${selected.sport}|${selected.answer}`]} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

interface Verification {
  jerseys: boolean;
  numbers: boolean;
  stats: boolean;
  pp: boolean;
  full: boolean;
}

// Computed from the actual data, not stored flags: colorway era status for
// jerseys, non-null numbers, complete stat cells, and a full hint ladder.
function verificationFor(row: ScheduleRow): Verification {
  const config = SPORTS[row.sport];
  const stints = row.puzzle.stints;
  const jerseys = stints.every(
    (stint) => resolveColorway(config.colorways, stint.franchise, stint.startYear, stint.endYear)?.status === "verified"
  );
  const numbers = stints.every((stint) => stint.jerseyNumber !== null && stint.jerseyNumber !== undefined);
  const stats = stints.every((stint) =>
    config.cardStats(stint).every((cell) => {
      if (cell.value === null || cell.value === undefined) return false;
      if (typeof cell.value === "number") return !Number.isNaN(cell.value);
      return String(cell.value).trim() !== "";
    })
  );
  const pp = config.hintLadder.every((hint) => {
    const value = row.puzzle.hints[hint.key];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
  return { jerseys, numbers, stats, pp, full: jerseys && numbers && stats && pp };
}

const VERIFY_PARTS: Array<{ key: keyof Omit<Verification, "full">; label: string }> = [
  { key: "jerseys", label: "Jerseys" },
  { key: "numbers", label: "Numbers" },
  { key: "stats", label: "Stats" },
  { key: "pp", label: "PP" },
];

function VerifyBadge({ row }: { row: ScheduleRow }) {
  const v = verificationFor(row);
  if (v.full) return <span className="verify-pill verify-full" title="Jerseys, numbers, stats, and player profile all verified">✓ Verified</span>;
  const good = VERIFY_PARTS.filter((part) => v[part.key]).map((part) => part.label);
  const bad = VERIFY_PARTS.filter((part) => !v[part.key]).map((part) => part.label);
  if (!good.length) return <span className="verify-pill verify-none" title={`Unverified: ${bad.join(", ")}`}>Unverified</span>;
  return (
    <span className="verify-pill verify-part" title={`Still unverified: ${bad.join(", ")}`}>
      {good.join(" · ")} verified
    </span>
  );
}

function VerifyBreakdown({ row }: { row: ScheduleRow }) {
  const v = verificationFor(row);
  return (
    <section className="verify-breakdown" aria-label="Verification status">
      {VERIFY_PARTS.map((part) => (
        <span key={part.key} className={`verify-pill ${v[part.key] ? "verify-full" : "verify-none"}`}>
          {v[part.key] ? "✓" : "✗"} {part.key === "pp" ? "Player profile" : part.label}
        </span>
      ))}
    </section>
  );
}

function TierBadge({ tier }: { tier: Tier | undefined }) {
  if (!tier) return null;
  const info = TIER_INFO[tier];
  return (
    <span className={`tier-pill ${info.className}`} title={`${info.label} — ${info.blurb}`}>
      {tier}
    </span>
  );
}

function TierKey() {
  return (
    <details className="tier-key">
      <summary>Tier key</summary>
      <div className="tier-key-grid">
        {TIER_ORDER.map((tier) => (
          <div key={tier}>
            <TierBadge tier={tier} />
            <strong>{TIER_INFO[tier].label}</strong>
            <p>{TIER_INFO[tier].blurb}</p>
          </div>
        ))}
      </div>
      <p className="tier-key-note">
        Ordered easiest → hardest. Target mix: mostly S and A, with B-Casual and B-Knower sprinkled from both ends.
        LEG and GHOST are outliers that sit outside the four playable tiers.
      </p>
    </details>
  );
}

function SportColumn({
  sport,
  rows,
  tiers,
  matchesFilters,
  locked,
  dragging,
  dropHint,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDragOverList,
  onDrop,
  onMove,
  onOpen,
}: {
  sport: Sport;
  rows: ScheduleRow[];
  tiers: Record<string, Tier>;
  matchesFilters: (row: ScheduleRow) => boolean;
  locked: boolean;
  dragging: { sport: Sport; id: number } | null;
  dropHint: number | null;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDragOverCard: (index: number, event: DragEvent) => void;
  onDragOverList: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onMove: (from: number, to: number) => void;
  onOpen: (row: ScheduleRow) => void;
}) {
  const daySlots = rows.map((row) => row.day).sort((a, b) => a - b);
  // While filters are on, non-matching cards are hidden but every card keeps
  // its ORIGINAL index, so day labels stay correct; reordering is paused so
  // hidden neighbors can never be jumped invisibly.
  const shown = locked ? rows.filter(matchesFilters).length : rows.length;
  return (
    <div className="sport-column" style={{ "--sport": SPORT_ACCENT[sport] } as React.CSSProperties}>
      <header className="sport-heading">
        <span>{SPORTS[sport].league}</span>
        <small>{locked ? `${shown} of ${rows.length} upcoming` : `${rows.length} upcoming`}</small>
      </header>
      <div className="sport-list" onDragOver={locked ? undefined : onDragOverList} onDrop={locked ? undefined : onDrop}>
        {rows.length === 0 ? <p className="empty-column">No future puzzles scheduled.</p> : null}
        {locked && rows.length > 0 && shown === 0 ? <p className="empty-column">No players match the filters.</p> : null}
        {rows.map((row, index) => locked && !matchesFilters(row) ? null : (
          <article
            className={[
              "schedule-card",
              dragging?.id === row.schedule_id ? "is-dragging" : "",
              dropHint === index ? "drop-before" : "",
              index === rows.length - 1 && dropHint === rows.length ? "drop-after" : "",
            ].filter(Boolean).join(" ")}
            key={row.schedule_id}
            draggable={!locked}
            onDragStart={(event) => {
              if (locked) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(row.schedule_id));
              onDragStart(row.schedule_id);
            }}
            onDragEnd={onDragEnd}
            onDragOver={locked ? undefined : (event) => onDragOverCard(index, event)}
            onDrop={locked ? undefined : onDrop}
          >
            <div className="drag-handle" title="Drag to reorder" aria-hidden="true"><i /><i /><i /></div>
            <button className="card-open" onClick={() => onOpen({ ...row, day: daySlots[index] })}>
              <span className="schedule-date"><b>{shortDate(row.sport, daySlots[index])}</b><small>#{daySlots[index]}</small></span>
              <span className="player-name">{row.answer}</span>
              <span className="card-meta">
                <TierBadge tier={tiers[`${row.sport}|${row.answer}`]} />
                <VerifyBadge row={row} />
                <em>{row.puzzle.stints.length} jerseys</em>
              </span>
            </button>
            <div className="move-buttons" aria-label={`Move ${row.answer}`}>
              <button disabled={locked || index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move one day earlier">↑</button>
              <button disabled={locked || index === rows.length - 1} onClick={() => onMove(index, index + 1)} aria-label="Move one day later">↓</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Archive({
  rows,
  activeSport,
  tiers,
  onOpen,
}: {
  rows: ScheduleRow[];
  activeSport: Sport | "all";
  tiers: Record<string, Tier>;
  onOpen: (row: ScheduleRow) => void;
}) {
  const visible = rows.filter((row) => activeSport === "all" || row.sport === activeSport);
  return (
    <section className="archive-section">
      <div className="schedule-intro">
        <div>
          <p className="eyebrow">Read-only history</p>
          <h2>Past players</h2>
          <p>Aired puzzles are locked permanently. Open any player to review the exact jerseys that appeared.</p>
        </div>
      </div>
      <div className="archive-table">
        {visible.map((row) => (
          <button key={`${row.sport}-${row.day}`} onClick={() => onOpen(row)}>
            <span className={`league-pill league-${row.sport}`}>{row.sport.toUpperCase()}</span>
            <span>
              <strong>{row.answer} <TierBadge tier={tiers[`${row.sport}|${row.answer}`]} /> <VerifyBadge row={row} /></strong>
              <small>{longDate(row.sport, row.day)} · Puzzle #{row.day}</small>
            </span>
            <span className="lock-label">Locked</span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {visible.length === 0 ? <p className="empty-column">No aired database puzzles yet.</p> : null}
      </div>
      <p className="archive-note">Play count and average-score reporting can be added here without changing the scheduler.</p>
    </section>
  );
}

function PlayerDrawer({ row, tier, onClose }: { row: ScheduleRow; tier: Tier | undefined; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const config = SPORTS[row.sport];
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="player-drawer" role="dialog" aria-modal="true" aria-label={`${row.answer} puzzle review`}>
        <header className="drawer-header">
          <div>
            <span className={`league-pill league-${row.sport}`}>{row.sport.toUpperCase()}</span>
            <h2>{row.answer} <TierBadge tier={tier} /></h2>
            <p>{longDate(row.sport, row.day)} · Puzzle #{row.day} · {row.source}</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close player review">×</button>
        </header>

        <VerifyBreakdown row={row} />

        {row.puzzle.accolades?.length ? <p className="career-accolades">{row.puzzle.accolades.join(" · ")}</p> : null}

        <section className="hint-grid" aria-label="Puzzle hints">
          {config.hintLadder.map((hint) => (
            <div key={hint.key}><small>{hint.label}</small><strong>{row.puzzle.hints[hint.key] || "—"}</strong></div>
          ))}
        </section>

        <section className="jersey-review">
          <div className="section-label"><h3>Jersey timeline</h3><span>{row.puzzle.stints.length} stops</span></div>
          <div className="jersey-grid">
            {row.puzzle.stints.map((stint, index) => (
              <AdminJersey key={`${stint.franchise}-${stint.startYear}-${index}`} config={config} stint={stint} />
            ))}
          </div>
        </section>

        <section className="reveal-order">
          <h3>Reveal order</h3>
          <ol>
            {row.puzzle.revealOrder.map((stintIndex, index) => (
              <li key={`${stintIndex}-${index}`}><b>{index + 1}</b>{row.puzzle.stints[stintIndex]?.displayTeam ?? `Stop ${stintIndex + 1}`}</li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function AdminJersey({ config, stint }: { config: SportConfig; stint: Stint }) {
  const era = resolveColorway(config.colorways, stint.franchise, stint.startYear, stint.endYear);
  const stats = config.cardStats(stint);
  return (
    <article className="jersey-review-card">
      <div className="jersey-year">{config.stintYears(stint)}</div>
      <div className="jersey-art">
        {era ? (
          <config.Jersey era={era} number={stint.jerseyNumber} size={Math.min(config.cardJerseySize * 1.12, 92)} label={config.eraTricode(era, stint.franchise)} />
        ) : <span>?</span>}
      </div>
      <strong>{stint.displayTeam}</strong>
      <dl>
        {stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
      </dl>
      {era ? <small className={`verification verification-${era.status ?? "unverified"}`}>{era.status ?? "unverified"} colorway</small> : <small className="verification verification-unverified">missing colorway</small>}
    </article>
  );
}

function LoadingBoard() {
  return <div className="loading-board"><i /><i /><i /></div>;
}

function dateFor(sport: Sport, day: number): Date {
  const date = new Date(`${LAUNCH[sport]}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date;
}

function shortDate(sport: Sport, day: number): string {
  return dateFor(sport, day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function longDate(sport: Sport, day: number): string {
  return dateFor(sport, day).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
