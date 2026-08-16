import { createClient } from "@supabase/supabase-js";

/** Publishable key — safe to ship in the client; all access is gated by
 *  row-level security on the server. */
const SUPABASE_URL = "https://ryfztwhdamaifushdgjn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qp-6lXmdiz-a8gG6czaISQ_aq917bAW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
