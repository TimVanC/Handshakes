import { useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { SPORTS, SPORT_ORDER } from "../sports";
import type { Sport } from "../sports/types";
import { supabase } from "../lib/supabase";
import { renderGoogleButton } from "../lib/googleIdentity";
import { computeStats, fetchAllResults, SCORE_BUCKETS, type CloudResult } from "../lib/cloud";
import type { AccountCtaSource } from "../lib/analytics";

type StatScope = Sport | "all";

interface Props {
  session: Session | null;
  /** which league's stats to show first: the current game, or "all" */
  defaultScope?: StatScope;
  onClose: () => void;
  /** fired when someone who opened this SIGNED OUT becomes signed in —
   *  the caller decides where they land (back to the archive, or just the
   *  page they came from). Signing up should never dump you into stats. */
  onAuthed?: () => void;
  /** tailors the sign-up promise to the CTA that opened the modal */
  signupContext?: AccountCtaSource;
  /** set when a password-reset link landed the user here: "reset" opens the
   *  choose-a-new-password form, "expired" opens the request-a-new-link form */
  recovery?: "reset" | "expired" | null;
}

/** Sign-up / sign-in when logged out; profile + lifetime stats when in. */
export default function AccountModal({
  session,
  defaultScope = "all",
  onClose,
  onAuthed,
  signupContext = "stats",
  recovery = null,
}: Props) {
  // did this modal open on the auth form rather than the locker?
  const openedSignedOut = useRef(!session);
  // recovery flows (email link or phone code) sign the user in as a side
  // effect — don't let that auto-fire onAuthed and close the modal out from
  // under the new-password form
  const recoveryFlow = useRef(recovery === "reset");
  useEffect(() => {
    if (openedSignedOut.current && session && !recoveryFlow.current) onAuthed?.();
  }, [session, onAuthed]);
  const [view, setView] = useState<AuthView>(recovery === "expired" ? "forgot" : "signup");
  // signed in, but only via a reset — hold the locker until a password is set
  const [resettingPw, setResettingPw] = useState(recovery === "reset");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const signupHeading =
    signupContext === "result"
      ? "Save your game"
      : signupContext === "archive"
        ? "Unlock the archive"
        : signupContext === "home"
          ? "Keep your stats"
          : "Join the league";
  const heading = session
    ? resettingPw
      ? "Set a new password"
      : "Your locker"
    : view === "signup"
      ? signupHeading
      : view === "signin"
        ? "Sign in"
        : "Reset your password";

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="modal-panel p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">{heading}</h2>
          <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {session ? (
          resettingPw ? (
            <NewPasswordForm onDone={() => setResettingPw(false)} />
          ) : (
            <SignedIn session={session} defaultScope={defaultScope} />
          )
        ) : (
          <AuthForm
            view={view}
            onSwitchView={setView}
            signupContext={signupContext}
            initialError={
              recovery === "expired"
                ? "That reset link has expired — request a new one."
                : null
            }
            onRecoveryVerified={() => {
              recoveryFlow.current = true;
              setResettingPw(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** One field accepts email OR phone; detect which and route accordingly.
 *  Bare 10-digit numbers are treated as US (+1). Phone accounts still use a
 *  password — the only SMS ever sent is the one confirmation code at sign-up,
 *  so repeat logins cost nothing. */
/** Supabase never errors on a duplicate sign-up (that would let anyone probe
 *  which emails/numbers are registered). Instead it refuses to create the
 *  account and hands back an obfuscated user with an EMPTY identities array.
 *  That empty array is the only signal the client gets, for email and phone
 *  alike — so it's how we spot "you already have an account". */
function isExistingAccount(user: User | null): boolean {
  return !!user && user.identities?.length === 0;
}

function parseIdentifier(raw: string): { email: string } | { phone: string } | null {
  const t = raw.trim();
  // lowercase the email so "Tim@x.com" and "tim@x.com" can't look like two
  // different accounts (Supabase also normalizes server-side, but this keeps
  // the client consistent)
  if (t.includes("@")) return { email: t.toLowerCase() };
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return { phone: `+1${digits}` };
  if (digits.length >= 11 && digits.length <= 15) return { phone: `+${digits}` };
  return null;
}

type AuthView = "signup" | "signin" | "forgot";

function AuthForm({
  view,
  onSwitchView,
  signupContext,
  initialError = null,
  onRecoveryVerified,
}: {
  view: AuthView;
  onSwitchView: (v: AuthView) => void;
  signupContext: AccountCtaSource;
  initialError?: string | null;
  /** a forgot-password phone code checked out — the user is now signed in
   *  and the parent should show the choose-a-new-password form */
  onRecoveryVerified: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  // set while a phone sign-up waits on its SMS confirmation code
  const [confirmPhone, setConfirmPhone] = useState<string | null>(null);
  // set while a forgot-password request waits on its SMS code
  const [resetPhone, setResetPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseIdentifier(identifier);
    if (!id) {
      setError("Enter a valid email address or phone number");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (view === "signup") {
        if ("email" in id) {
          const { data, error } = await supabase.auth.signUp({
            email: id.email,
            password,
            options: { emailRedirectTo: location.origin },
          });
          if (error) throw error;
          if (isExistingAccount(data.user)) {
            onSwitchView("signin");
            setError("That email already has an account — sign in instead.");
          } else if (data.session) {
            setMessage("Account created — you're in!");
          } else {
            setMessage("Check your email to confirm your account, then sign in.");
          }
        } else {
          const { data, error } = await supabase.auth.signUp({ phone: id.phone, password });
          if (error) throw error;
          if (isExistingAccount(data.user)) {
            // same guard as email: don't march an existing user through a
            // "create account" OTP flow that only re-auths them anyway
            onSwitchView("signin");
            setError("That number already has an account — sign in instead.");
          } else if (data.session) {
            setMessage("Account created — you're in!");
          } else {
            setConfirmPhone(id.phone); // genuinely new — Supabase texted a code
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword(
          "email" in id ? { email: id.email, password } : { phone: id.phone, password }
        );
        if (error) throw error;
        // session change flips the modal to the signed-in view
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPhone) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: confirmPhone,
        token: code,
        type: "sms",
      });
      if (error) throw error;
      // verified = signed in; onAuthStateChange re-renders into "Your locker"
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!confirmPhone) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({ type: "sms", phone: confirmPhone });
      if (error) throw error;
      setMessage("New code sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code");
    } finally {
      setBusy(false);
    }
  };

  /** Email accounts get Supabase's reset link (which lands back on the site
   *  as a recovery session); phone accounts get a texted sign-in code that
   *  leads to the same choose-a-new-password form. */
  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseIdentifier(identifier);
    if (!id) {
      setError("Enter a valid email address or phone number");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if ("email" in id) {
        const { error } = await supabase.auth.resetPasswordForEmail(id.email, {
          redirectTo: location.origin,
        });
        if (error) throw error;
        // deliberately the same wording whether or not the account exists, so
        // this form can't be used to probe which emails are registered
        setMessage("If that email has an account, a reset link is on the way.");
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone: id.phone,
          options: { shouldCreateUser: false },
        });
        // shouldCreateUser:false makes Supabase refuse unknown numbers with a
        // "signups not allowed" error — translate it
        if (error)
          throw /signup/i.test(error.message)
            ? new Error("No account found with that phone number.")
            : error;
        setResetPhone(id.phone);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const confirmResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: resetPhone,
        token: code,
        type: "sms",
      });
      if (error) throw error;
      onRecoveryVerified(); // signed in — parent swaps in the new-password form
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match");
    } finally {
      setBusy(false);
    }
  };

  const resendResetCode = async () => {
    if (!resetPhone) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: resetPhone,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setMessage("New code sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code");
    } finally {
      setBusy(false);
    }
  };

  // Google's own button (rendered by GIS) signs in from this origin, so the
  // consent screen shows journeymanjersey.com — not the Supabase project URL.
  // If the GIS script can't load (ad blockers, offline), fall back to the old
  // redirect-through-Supabase flow; both land on the same account.
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleFallback, setGoogleFallback] = useState(false);
  useEffect(() => {
    const el = googleRef.current;
    if (!el || googleFallback) return;
    renderGoogleButton(el, setError).catch(() => setGoogleFallback(true));
  }, [confirmPhone, googleFallback]);

  const googleRedirect = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin },
    });
    if (error) setError(error.message);
  };

  // phone sign-up confirmation step
  if (confirmPhone) {
    return (
      <form onSubmit={confirmCode} className="mt-3 space-y-2 text-sm">
        <p className="text-xs text-ink-soft">
          We texted a code to {confirmPhone}.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setConfirmPhone(null);
              setCode("");
              setError(null);
            }}
          >
            Wrong number?
          </button>
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5"
        />
        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "…" : "Confirm code"}
        </button>
        <p className="text-center text-xs text-ink-soft">
          Didn't get it?{" "}
          <button type="button" className="underline" onClick={resendCode} disabled={busy}>
            Resend code
          </button>
        </p>
        {message && <p className="font-bold text-[#2e7d43]">{message}</p>}
        {error && <p className="font-bold text-[#b3362a]">{error}</p>}
      </form>
    );
  }

  // forgot password, step 2 (phone accounts): confirm the texted code
  if (view === "forgot" && resetPhone) {
    return (
      <form onSubmit={confirmResetCode} className="mt-3 space-y-2 text-sm">
        <p className="text-xs text-ink-soft">
          We texted a code to {resetPhone}.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setResetPhone(null);
              setCode("");
              setError(null);
            }}
          >
            Wrong number?
          </button>
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5"
        />
        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "…" : "Confirm code"}
        </button>
        <p className="text-center text-xs text-ink-soft">
          Didn't get it?{" "}
          <button type="button" className="underline" onClick={resendResetCode} disabled={busy}>
            Resend code
          </button>
        </p>
        {message && <p className="font-bold text-[#2e7d43]">{message}</p>}
        {error && <p className="font-bold text-[#b3362a]">{error}</p>}
      </form>
    );
  }

  // forgot password, step 1: which account?
  if (view === "forgot") {
    return (
      <form onSubmit={submitForgot} className="mt-3 space-y-2 text-sm">
        <p className="text-xs leading-relaxed text-ink-soft">
          Enter your account's email or phone number. Email accounts get a
          reset link; phone accounts get a texted code.
        </p>
        <input
          type="text"
          required
          autoComplete="username"
          placeholder="Email or phone number"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5"
        />
        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "…" : "Continue"}
        </button>
        {message && <p className="font-bold text-[#2e7d43]">{message}</p>}
        {error && <p className="font-bold text-[#b3362a]">{error}</p>}
        <p className="pt-1 text-center text-xs text-ink-soft">
          <button
            type="button"
            className="font-bold text-ink underline underline-offset-2"
            onClick={() => {
              onSwitchView("signin");
              setError(null);
              setMessage(null);
            }}
          >
            Back to sign in
          </button>
        </p>
      </form>
    );
  }

  return (
    <div className="mt-3 space-y-3 text-sm">
      {view === "signup" && (
        <p className="leading-relaxed">
          <strong>100% free.</strong>{" "}
          {signupContext === "result"
            ? "This result and the games already on this device will be added to your lifetime stats."
            : "Save your streaks and stats across devices."}{" "}
          You’ll also unlock the <strong>Archive</strong> — every past NBA, NFL,
          and MLB puzzle, playable any time.
        </p>
      )}

      <form onSubmit={submit} className="space-y-2">
        <input
          type="text"
          required
          autoComplete="username"
          placeholder="Email or phone number"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5"
        />
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            required
            // only enforce length when CREATING a password; at sign-in let the
            // server judge so a valid existing password is never client-blocked
            minLength={view === "signup" ? 6 : undefined}
            autoComplete={view === "signup" ? "new-password" : "current-password"}
            placeholder={view === "signup" ? "Password (6+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5 pr-14"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 px-3 text-xs font-bold uppercase tracking-wide text-ink-soft"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        {view === "signin" && (
          <p className="text-right">
            <button
              type="button"
              className="text-xs text-ink-soft underline underline-offset-2"
              onClick={() => {
                onSwitchView("forgot");
                setError(null);
                setMessage(null);
              }}
            >
              Forgot password?
            </button>
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "…" : view === "signup" ? "Create free account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-widest text-ink-soft">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      {googleFallback ? (
        <button type="button" className="btn w-full py-2.5" onClick={googleRedirect}>
          Continue with Google
        </button>
      ) : (
        <div ref={googleRef} className="flex min-h-[40px] justify-center" />
      )}

      {message && <p className="font-bold text-[#2e7d43]">{message}</p>}
      {error && <p className="font-bold text-[#b3362a]">{error}</p>}

      <p className="pt-1 text-center text-xs text-ink-soft">
        {view === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="font-bold text-ink underline underline-offset-2"
              onClick={() => onSwitchView("signin")}
            >
              Sign in here
            </button>
          </>
        ) : (
          <>
            New here?{" "}
            <button
              type="button"
              className="font-bold text-ink underline underline-offset-2"
              onClick={() => onSwitchView("signup")}
            >
              Create a free account
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Shown after a recovery sign-in (email link or texted code): the user is
 *  authenticated, but only because of the reset — capture the new password
 *  before letting the locker take over. */
function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="font-bold text-[#2e7d43]">Password updated — you're signed in.</p>
        <button type="button" className="btn btn-primary w-full py-2.5" onClick={onDone}>
          Open your locker
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 text-sm">
      <p className="text-xs leading-relaxed text-ink-soft">
        You're signed in — choose a new password for next time.
      </p>
      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="New password (6+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border-2 border-ink bg-card px-3 py-2.5 pr-14"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs font-bold uppercase tracking-wide text-ink-soft"
          onClick={() => setShowPw((s) => !s)}
          aria-label={showPw ? "Hide password" : "Show password"}
        >
          {showPw ? "Hide" : "Show"}
        </button>
      </div>
      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
        {busy ? "…" : "Save new password"}
      </button>
      {error && <p className="font-bold text-[#b3362a]">{error}</p>}
      <p className="pt-1 text-center text-xs text-ink-soft">
        <button type="button" className="underline underline-offset-2" onClick={onDone}>
          Skip for now
        </button>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const SCOPES: StatScope[] = ["all", ...SPORT_ORDER];
const scopeLabel = (s: StatScope) => (s === "all" ? "All" : SPORTS[s].league);

function SignedIn({
  session,
  defaultScope,
}: {
  session: Session;
  defaultScope: StatScope;
}) {
  // one fetch of every sport's rows; each tab slices/aggregates locally
  const [rows, setRows] = useState<CloudResult[] | null>(null);
  const [scope, setScope] = useState<StatScope>(defaultScope);

  useEffect(() => {
    fetchAllResults().then(setRows);
  }, []);

  // per-sport stats (each with its own "today" for correct streaks)
  const perSport = SPORT_ORDER.map((s) => ({
    sport: s,
    stats: rows
      ? computeStats(rows.filter((r) => r.sport === s), SPORTS[s].storage.currentDayNumber())
      : null,
  }));

  // the "All" view aggregates totals across sports; streaks are shown
  // per-league below (a cross-sport streak isn't a real thing). today=0
  // is fine here — we never read the aggregate's streak fields.
  const allStats = rows ? computeStats(rows, 0) : null;

  const active =
    scope === "all" ? allStats : perSport.find((p) => p.sport === scope)?.stats ?? null;
  const maxBar = active ? Math.max(1, ...active.scoreDist, active.dnf) : 1;

  return (
    <div className="mt-3 space-y-4 text-sm">
      <p className="text-xs text-ink-soft">{session.user.email ?? session.user.phone}</p>

      {/* league picker: All · NBA · NFL · MLB */}
      <div className="flex gap-1.5" role="tablist" aria-label="Stats by league">
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            className={`chip flex-1 justify-center py-1.5 text-xs font-bold uppercase tracking-wide ${
              scope === s ? "chip-active" : "cursor-pointer"
            }`}
            onClick={() => setScope(s)}
          >
            {scopeLabel(s)}
          </button>
        ))}
      </div>

      {rows === null || active === null ? (
        <p className="text-ink-soft">Loading stats…</p>
      ) : (
        <>
          {scope === "all" ? (
            <>
              <div className="grid grid-cols-4 border-y border-line py-3 text-center">
                <StatCell label="Played" value={active.played} />
                <StatCell label="Win %" value={active.winPct} />
                <StatCell label="Perfect" value={active.perfect} />
                <StatCell label="Avg Score" value={active.avgScore ?? "—"} />
              </div>
              {/* streaks are per-league */}
              <div>
                <p className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-widest">
                  Streaks by league
                </p>
                <div className="space-y-1">
                  {perSport.map(({ sport, stats }) => (
                    <div
                      key={sport}
                      className="flex items-center justify-between border-b border-line py-1 text-xs"
                    >
                      <span className="font-bold uppercase tracking-wide">
                        {SPORTS[sport].league}
                      </span>
                      <span className="tabular-nums text-ink-soft">
                        current <strong className="text-ink">{stats?.currentStreak ?? 0}</strong>
                        {"  ·  "}
                        max <strong className="text-ink">{stats?.maxStreak ?? 0}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 border-y border-line py-3 text-center">
                <StatCell label="Played" value={active.played} />
                <StatCell label="Win %" value={active.winPct} />
                <StatCell label="Current Streak" value={active.currentStreak} />
                <StatCell label="Max Streak" value={active.maxStreak} />
              </div>
              <div className="-mt-4 grid grid-cols-2 border-b border-line py-3 text-center">
                <StatCell label="Perfect Games" value={active.perfect} />
                <StatCell label="Avg Score" value={active.avgScore ?? "—"} />
              </div>
            </>
          )}

          <div>
            <p className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-widest">
              Score distribution{scope === "all" ? " (all leagues)" : ""}
            </p>
            <div className="space-y-1">
              {SCORE_BUCKETS.map((b, i) => (
                <DistBar key={b.label} label={b.label} count={active.scoreDist[i]} max={maxBar} />
              ))}
              <DistBar label="0" count={active.dnf} max={maxBar} muted />
            </div>
          </div>

          {active.archivePlayed > 0 && (
            <p className="text-xs text-ink-soft">
              Archive: {active.archiveWins}/{active.archivePlayed} solved
            </p>
          )}
        </>
      )}

      <button
        type="button"
        className="btn w-full py-2"
        onClick={() => supabase.auth.signOut()}
      >
        Sign out
      </button>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-1">
      <div className="font-display text-3xl leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </div>
    </div>
  );
}

function DistBar({
  label,
  count,
  max,
  muted = false,
}: {
  label: string;
  count: number;
  max: number;
  muted?: boolean;
}) {
  // stub-width bars (zero or tiny counts) center their number; long bars
  // right-align it Wordle-style
  const stub = count === 0 || count / max < 0.15;
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <span className="w-9 shrink-0 text-right font-bold">{label}</span>
      <div className="h-5 flex-1">
        <div
          className={`flex h-full items-center rounded-sm text-[0.65rem] font-bold text-[#faf6ec] ${
            stub ? "justify-center" : "justify-end px-1.5"
          } ${muted ? "bg-ink-soft" : "bg-wood-deep"}`}
          style={{ width: count > 0 ? `${(count / max) * 100}%` : "1.4rem", minWidth: "1.4rem" }}
        >
          {count}
        </div>
      </div>
    </div>
  );
}
