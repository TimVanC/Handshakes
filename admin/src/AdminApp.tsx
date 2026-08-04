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
  const [drafts, setDrafts] = useState<SportMap<ScheduleRow[]>>(emptyRows);
  const [originalIds, setOriginalIds] = useState<SportMap<number[]>>({ nba: [], nfl: [], mlb: [] });
  const [versions, setVersions] = useState<SportMap<number>>(emptyNumbers);
  const [currentDays, setCurrentDays] = useState<SportMap<number>>(emptyNumbers);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [view, setView] = useState<View>("schedule");
  const [activeSport, setActiveSport] = useState<Sport | "all">("all");
  const [dragging, setDragging] = useState<{ sport: Sport; id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [scheduleResult, versionResult, ...dayResults] = await Promise.all([
      supabase
        .from("scheduled_puzzles")
        .select("schedule_id,sport,day,answer,puzzle,source,status,frozen,generated_at")
        .order("day"),
      supabase.from("schedule_versions").select("sport,version"),
      ...SPORT_ORDER.map((sport) => supabase.rpc("current_day", { p_sport: sport })),
    ]);

    const firstError = scheduleResult.error ?? versionResult.error ?? dayResults.find((r) => r.error)?.error;
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

    setAllRows(rows);
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

  const drop = (sport: Sport, targetId: number, event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging.sport !== sport) return;
    const from = drafts[sport].findIndex((row) => row.schedule_id === dragging.id);
    const to = drafts[sport].findIndex((row) => row.schedule_id === targetId);
    move(sport, from, to);
    setDragging(null);
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

  const visibleSports = activeSport === "all" ? SPORT_ORDER : [activeSport];
  const archiveRows = [...allRows]
    .filter((row) => row.frozen || row.day <= currentDays[row.sport])
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

            <section className={`schedule-board columns-${visibleSports.length}`}>
              {visibleSports.map((sport) => (
                <SportColumn
                  key={sport}
                  sport={sport}
                  rows={drafts[sport]}
                  dragging={dragging}
                  onDragStart={(id) => setDragging({ sport, id })}
                  onDragEnd={() => setDragging(null)}
                  onDrop={(id, event) => drop(sport, id, event)}
                  onMove={(from, to) => move(sport, from, to)}
                  onOpen={setSelected}
                />
              ))}
            </section>
          </>
        ) : (
          <Archive rows={archiveRows} activeSport={activeSport} onOpen={setSelected} />
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

      {selected ? <PlayerDrawer row={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function SportColumn({
  sport,
  rows,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
  onOpen,
}: {
  sport: Sport;
  rows: ScheduleRow[];
  dragging: { sport: Sport; id: number } | null;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDrop: (id: number, event: DragEvent) => void;
  onMove: (from: number, to: number) => void;
  onOpen: (row: ScheduleRow) => void;
}) {
  const daySlots = rows.map((row) => row.day).sort((a, b) => a - b);
  return (
    <div className="sport-column" style={{ "--sport": SPORT_ACCENT[sport] } as React.CSSProperties}>
      <header className="sport-heading">
        <span>{SPORTS[sport].league}</span>
        <small>{rows.length} upcoming</small>
      </header>
      <div className="sport-list">
        {rows.length === 0 ? <p className="empty-column">No future puzzles scheduled.</p> : null}
        {rows.map((row, index) => (
          <article
            className={`schedule-card ${dragging?.id === row.schedule_id ? "is-dragging" : ""}`}
            key={row.schedule_id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(row.schedule_id));
              onDragStart(row.schedule_id);
            }}
            onDragEnd={onDragEnd}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(row.schedule_id, event)}
          >
            <div className="drag-handle" title="Drag to reorder" aria-hidden="true"><i /><i /><i /></div>
            <button className="card-open" onClick={() => onOpen({ ...row, day: daySlots[index] })}>
              <span className="schedule-date"><b>{shortDate(row.sport, daySlots[index])}</b><small>#{daySlots[index]}</small></span>
              <span className="player-name">{row.answer}</span>
              <span className="card-meta"><em>{row.puzzle.stints.length} jerseys</em><em>{row.source}</em></span>
            </button>
            <div className="move-buttons" aria-label={`Move ${row.answer}`}>
              <button disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move one day earlier">↑</button>
              <button disabled={index === rows.length - 1} onClick={() => onMove(index, index + 1)} aria-label="Move one day later">↓</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Archive({ rows, activeSport, onOpen }: { rows: ScheduleRow[]; activeSport: Sport | "all"; onOpen: (row: ScheduleRow) => void }) {
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
            <span><strong>{row.answer}</strong><small>{longDate(row.sport, row.day)} · Puzzle #{row.day}</small></span>
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

function PlayerDrawer({ row, onClose }: { row: ScheduleRow; onClose: () => void }) {
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
            <h2>{row.answer}</h2>
            <p>{longDate(row.sport, row.day)} · Puzzle #{row.day} · {row.source}</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close player review">×</button>
        </header>

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
