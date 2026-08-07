import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { syncUp } from "./cloud";
import { SPORTS, SPORT_ORDER } from "../sports";

/** Live Supabase session. `undefined` = still loading, `null` = signed out.
 *  On sign-in, local history for EVERY sport is pushed up once so nothing
 *  is lost, whichever game the sign-in happened from. */
/** Password-recovery arrival state. "reset" = a valid reset link signed the
 *  user in and they should now choose a new password; "expired" = the link's
 *  token was already dead when they landed. */
export function usePasswordRecovery() {
  const [state, setState] = useState<"reset" | "expired" | null>(() => {
    // read the hash synchronously: a recovery landing can be processed by
    // supabase-js before our onAuthStateChange listener attaches, and an
    // expired link never fires an event at all — the hash is its only signal
    const h = location.hash;
    if (/error_code=otp_expired/.test(h)) return "expired";
    if (/type=recovery/.test(h)) return "reset";
    return null;
  });
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setState("reset");
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return [state, () => setState(null)] as const;
}

export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN")
        void syncUp(SPORT_ORDER.map((sp) => ({ sport: sp, storage: SPORTS[sp].storage })));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}
