import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../src/lib/supabase";
import AdminApp from "./AdminApp";

type GateState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "unauthorized"; email: string }
  | { kind: "ready"; session: Session }
  | { kind: "error"; message: string };

export default function AuthGate() {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  const inspectSession = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ kind: "signed-out" });
      return;
    }

    const { data: admin, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (adminError) {
      setState({
        kind: "error",
        message:
          adminError.code === "42P01"
            ? "The admin database migration has not been applied yet."
            : adminError.message,
      });
      return;
    }
    if (!admin) {
      setState({
        kind: "unauthorized",
        email: session.user.email ?? session.user.phone ?? "this account",
      });
      return;
    }

    setState({ kind: "ready", session });
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => inspectSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setState({ kind: "signed-out" });
      if (event === "SIGNED_IN") {
        void inspectSession(session);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [inspectSession]);

  if (state.kind === "loading") return <GateShell eyebrow="Private access">Checking credentials…</GateShell>;
  if (state.kind === "signed-out") return <Login />;
  if (state.kind === "unauthorized") {
    return (
      <GateShell eyebrow="Access unavailable">
        <p>{state.email} is signed in, but it is not the owner account.</p>
        <button className="button button-dark" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </GateShell>
    );
  }
  if (state.kind === "error") {
    return (
      <GateShell eyebrow="Setup needed">
        <p>{state.message}</p>
        <button className="button button-dark" onClick={() => location.reload()}>
          Try again
        </button>
      </GateShell>
    );
  }
  return <AdminApp session={state.session} />;
}

function Login() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const normalizedPhone = normalizePhone(phone);

    if (!codeSent) {
      const { error: sendError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: false },
      });
      if (sendError) {
        setError("We could not send a code to that owner number. Check the number and try again.");
      } else {
        setCodeSent(true);
      }
      setBusy(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: code.trim(),
      type: "sms",
    });
    if (verifyError) {
      setError("That SMS code was not accepted. Request a fresh code and try again.");
    }
    setBusy(false);
  };

  return (
    <GateShell eyebrow="Owner sign-in">
      <p className="gate-intro">
        {codeSent
          ? "Enter the six-digit code sent to your owner phone."
          : "Enter your owner phone number and we’ll text you a one-time code."}
      </p>
      <form className="gate-form" onSubmit={submit}>
        <label>
          Phone number
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={codeSent}
            required
          />
        </label>
        {codeSent ? (
          <label>
            SMS code
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="button button-primary" disabled={busy || (codeSent && code.length !== 6)}>
          {busy ? "Checking…" : codeSent ? "Verify SMS code" : "Send SMS code"}
        </button>
        {codeSent ? (
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setError("");
            }}
          >
            Use a different number or resend
          </button>
        ) : null}
      </form>
    </GateShell>
  );
}

function GateShell({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <main className="gate-page">
      <section className="gate-card">
        <div className="gate-mark" aria-hidden="true">J</div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>Schedule Room</h1>
        {children}
      </section>
    </main>
  );
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : value.trim();
}
