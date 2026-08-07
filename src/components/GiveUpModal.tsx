import { useEffect } from "react";

interface Props {
  onGiveUp: () => void;
  onClose: () => void;
}

/** The white flag's second step: surrendering ends the whole puzzle as a
 *  DNF, so one stray tap must never do it alone. Backdrop click, Escape,
 *  and Cancel all back out. */
export default function GiveUpModal({ onGiveUp, onClose }: Props) {
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Give up"
        className="modal-panel modal-panel-sm p-5 text-center"
      >
        <h2 className="font-display text-2xl">Give up?</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Are you sure you want to give up? The answer will be revealed and
          this puzzle will count as a loss.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-primary w-full py-2.5"
            onClick={onGiveUp}
          >
            Give up
          </button>
          <button type="button" className="btn w-full py-2.5" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
