import { useEffect } from "react";
import type { GameMode } from "../game/storage";
import { supabase } from "../lib/supabase";
import { ArchiveIcon, UserIcon } from "./Icons";

interface Props {
  mode: GameMode;
  onMode: (m: GameMode) => void;
  signedIn: boolean;
  /** closes settings, opens the archive */
  onArchive: () => void;
  /** closes settings, opens the account modal */
  onAccount: () => void;
  onClose: () => void;
}

/** The gear menu: difficulty, archive, and account live here so the
 *  header stays lean (streak + how-to-play + gear). */
export default function SettingsModal({
  mode,
  onMode,
  signedIn,
  onArchive,
  onAccount,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Settings" className="modal-panel p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">Settings</h2>
          <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-ink-soft">
            Difficulty
          </p>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Difficulty">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "normal"}
              className={`btn flex-1 py-2 ${mode === "normal" ? "btn-primary" : ""}`}
              onClick={() => onMode("normal")}
            >
              Normal
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "hard"}
              className={`btn flex-1 py-2 ${mode === "hard" ? "btn-primary" : ""}`}
              onClick={() => onMode("hard")}
            >
              Hard
            </button>
          </div>
          {/* always describes what Hard takes away, whichever mode is on —
              so it reads as "here's what you're opting into" */}
          <p className="mt-1.5 text-[0.68rem] text-ink-soft">
            Hard: accolades and flipping cards over for more information are
            removed.
          </p>
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <button
            type="button"
            className="btn flex w-full items-center justify-center gap-2 py-2.5"
            onClick={onArchive}
          >
            <ArchiveIcon /> Archive
          </button>
          <button
            type="button"
            className="btn flex w-full items-center justify-center gap-2 py-2.5"
            onClick={onAccount}
          >
            <UserIcon /> {signedIn ? "Your locker" : "Sign in — it's free"}
          </button>
          {signedIn && (
            <button
              type="button"
              className="btn w-full py-2.5"
              onClick={() => {
                onClose();
                void supabase.auth.signOut();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
