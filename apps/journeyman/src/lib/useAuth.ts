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

/** The account a recovery link was minted for, decoded from the landing
 *  hash's access token. Email links open in the phone's DEFAULT browser, so
 *  a reset requested elsewhere (incognito, another browser) can land in a
 *  browser already signed in as a DIFFERENT account — if the token then
 *  fails to apply, the new-password form must not silently change whoever
 *  happens to be signed in. This is who it's allowed to change. */
export const RECOVERY_TARGET = (() => {
  if (!/type=recovery/.test(LANDING_HASH)) return null;
  const m = /access_token=([^&]+)/.exec(LANDING_HASH);
  const b64 = m?.[1].split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!b64) return null;
  try {
    const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
    return typeof payload.sub === "string"
      ? { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null }
      : null;
  } catch {
    return null;
  }
})();

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
