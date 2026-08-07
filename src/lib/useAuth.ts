import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { syncUp } from "./cloud";
import { SPORTS, SPORT_ORDER } from "../sports";

/** The URL hash as it was when this module first evaluated. It MUST be
 *  grabbed here, not inside a hook: React only mounts after the puzzle
 *  prefetch in main.tsx, and in that window supabase-js (initialized at
 *  script load) consumes a recovery link's token, signs the user in, emits
 *  PASSWORD_RECOVERY with no listeners attached yet, and strips the hash —
 *  a component reading location.hash at first render sees nothing. Module
 *  eval runs synchronously before supabase-js gets its first microtask, so
 *  this capture always wins that race. */
const LANDING_HASH = location.hash;

/** Password-recovery arrival state. "reset" = a valid reset link signed the
 *  user in and they should now choose a new password; "expired" = the link's
 *  token was already dead when they landed. */
export function usePasswordRecovery() {
  const [state, setState] = useState<"reset" | "expired" | null>(() => {
    if (/error_code=otp_expired/.test(LANDING_HASH)) return "expired";
    if (/type=recovery/.test(LANDING_HASH)) return "reset";
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

/** Live Supabase session. `undefined` = still loading, `null` = signed out.
 *  On sign-in, local history for EVERY sport is pushed up once so nothing
 *  is lost, whichever game the sign-in happened from. */
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
