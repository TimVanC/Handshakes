import { resolveSport } from "./index";
import type { SportConfig } from "./types";

/** The sport this page-load is playing. Fixed for the life of the page
 *  (switching sports is a navigation), so components import it directly
 *  instead of prop-drilling a config through the whole tree. */
export const SPORT: SportConfig = resolveSport();
