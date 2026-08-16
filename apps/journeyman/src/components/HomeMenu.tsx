import { useEffect, useRef, useState } from "react";
import { ChartIcon, GearIcon, HelpIcon, MenuIcon, UserIcon, XIcon } from "./Icons";

interface Props {
  onStats: () => void;
  onRules: () => void;
  onSettings: () => void;
  onAccount: () => void;
  signedIn: boolean;
}

/** The home screen's hamburger. Stats, how-to-play and settings used to sit
 *  as three bare chips in the corner, which read as clutter above a screen
 *  whose whole job is "pick a league". They live behind this instead.
 *
 *  Every item closes the drawer before running its action: the modals these
 *  open share the drawer's stacking layer, so the two must never be up at
 *  once. */
export default function HomeMenu({ onStats, onRules, onSettings, onAccount, signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // pull focus off the (now scrim-covered) trigger and into the drawer
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    // the trigger is where the user's attention was; hand it back
    triggerRef.current?.focus();
  };

  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="chip absolute right-4 top-4 cursor-pointer"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={18} />
      </button>

      {open && (
        <div className="menu-scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="menu-drawer"
          >
            <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
              <h2 className="font-display text-xl tracking-wide">MENU</h2>
              <button
                type="button"
                className="chip cursor-pointer"
                onClick={close}
                aria-label="Close menu"
              >
                <XIcon size={16} />
              </button>
            </div>

            <nav className="px-2 pb-3 pt-1.5">
              {!signedIn && (
                <button type="button" className="menu-item" onClick={pick(onAccount)}>
                  <UserIcon size={17} />
                  Create free account
                </button>
              )}
              <button type="button" className="menu-item" onClick={pick(onStats)}>
                <ChartIcon size={17} />
                Stats
              </button>
              <button type="button" className="menu-item" onClick={pick(onRules)}>
                <HelpIcon size={17} />
                How to play
              </button>
              <button type="button" className="menu-item" onClick={pick(onSettings)}>
                <GearIcon size={17} />
                Settings
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
